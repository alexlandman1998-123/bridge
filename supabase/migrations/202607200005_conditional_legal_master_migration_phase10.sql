begin;

-- Phase 10 migrates each organisation to one Mandate and one OTP conditional
-- master without deleting or rewriting historical template revisions. Preparing,
-- activating, rolling back, and archiving are deliberately separate operations.

create table if not exists public.legal_document_master_migrations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  packet_type text not null check (packet_type in ('mandate', 'otp')),
  migration_version text not null default 'conditional-master-migration-v1',
  state text not null default 'prepared' check (state in ('prepared', 'activated', 'completed', 'rolled_back')),
  source_master_template_id uuid not null references public.document_packet_templates(id) on delete restrict,
  candidate_template_id uuid not null references public.document_packet_templates(id) on delete restrict,
  previous_default_template_id uuid references public.document_packet_templates(id) on delete restrict,
  legacy_template_ids uuid[] not null default '{}'::uuid[],
  coverage_version text,
  coverage_decision_hash text,
  wording_reviewed_at timestamptz,
  prepared_at timestamptz not null default now(),
  activated_at timestamptz,
  rollback_until timestamptz,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, packet_type)
);

alter table public.legal_document_master_migrations enable row level security;

drop policy if exists legal_document_master_migrations_select_phase10 on public.legal_document_master_migrations;
create policy legal_document_master_migrations_select_phase10
on public.legal_document_master_migrations for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists legal_document_master_migrations_write_phase10 on public.legal_document_master_migrations;
create policy legal_document_master_migrations_write_phase10
on public.legal_document_master_migrations for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

grant select, insert, update on table public.legal_document_master_migrations to authenticated;

create or replace function public.bridge_prepare_conditional_master_migration_phase10(
  p_organisation_id uuid,
  p_packet_type text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_packet_type text := lower(btrim(coalesce(p_packet_type, '')));
  v_existing public.legal_document_master_migrations%rowtype;
  v_source public.document_packet_templates%rowtype;
  v_previous public.document_packet_templates%rowtype;
  v_candidate public.document_packet_templates%rowtype;
  v_candidate_id uuid := gen_random_uuid();
  v_legacy_ids uuid[] := '{}'::uuid[];
  v_now timestamptz := now();
begin
  if v_packet_type not in ('mandate', 'otp') then
    raise exception 'Phase 10 supports only mandate and otp.' using errcode = '22023';
  end if;
  if not public.bridge_is_org_admin(p_organisation_id) then
    raise exception 'Only an organisation administrator can prepare this migration.' using errcode = '42501';
  end if;

  select * into v_existing
  from public.legal_document_master_migrations
  where organisation_id = p_organisation_id and packet_type = v_packet_type
  for update;
  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'state', v_existing.state,
      'candidateTemplateId', v_existing.candidate_template_id,
      'idempotent', true
    );
  end if;

  select * into v_source
  from public.document_packet_templates
  where organisation_id is null
    and packet_type = v_packet_type
    and status = 'published'
    and is_active = true
    and metadata_json ->> 'conditional_master_version' = 'conditional-master-v1'
  order by is_default desc, updated_at desc
  limit 1;
  if not found then
    raise exception 'The global % conditional master is not available.', upper(v_packet_type);
  end if;

  select * into v_previous
  from public.document_packet_templates
  where organisation_id = p_organisation_id
    and packet_type = v_packet_type
    and status = 'published'
    and is_active = true
    and is_default = true
  order by updated_at desc
  limit 1;

  select coalesce(array_agg(id order by updated_at desc), '{}'::uuid[]) into v_legacy_ids
  from public.document_packet_templates
  where organisation_id = p_organisation_id
    and packet_type = v_packet_type
    and status <> 'archived'
    and coalesce(metadata_json ->> 'conditional_master_version', '') <> 'conditional-master-v1';

  insert into public.document_packet_templates (
    id, organisation_id, module_type, packet_type, template_key, template_label,
    template_format, version_tag, description, status, is_default, is_active,
    metadata_json, revision_root_template_id, revision_number, created_by, updated_by
  ) values (
    v_candidate_id,
    p_organisation_id,
    v_source.module_type,
    v_packet_type,
    v_packet_type || '_conditional_master_' || left(replace(p_organisation_id::text, '-', ''), 12),
    case v_packet_type when 'mandate' then 'Sales Mandate · Conditional Master' else 'Offer to Purchase · Conditional Master' end,
    'structured',
    'v1',
    'Organisation-owned conditional master prepared from the Arch9 global master.',
    'draft', false, false,
    coalesce(v_source.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'template_scope', 'organisation',
      'source_template_id', v_source.id,
      'base_template_id', v_source.id,
      'lifecycle_status', 'draft',
      'template_status', 'draft',
      'conditional_master_migration', jsonb_build_object(
        'version', 'conditional-master-migration-v1',
        'state', 'prepared',
        'source_master_template_id', v_source.id,
        'previous_default_template_id', v_previous.id,
        'legacy_template_ids', to_jsonb(v_legacy_ids),
        'prepared_at', v_now
      )
    ),
    v_candidate_id, 1, auth.uid(), auth.uid()
  ) returning * into v_candidate;

  insert into public.document_template_sections (
    template_id, section_key, section_label, section_type, sort_order,
    is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json
  )
  select
    v_candidate.id, section_key, section_label, section_type, sort_order,
    is_required, is_repeatable, condition_json, placeholder_keys, legal_text,
    coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('company_owned_copy', true)
  from public.document_template_sections
  where template_id = v_source.id
  order by sort_order, created_at;

  -- Reconcile only exact-key standard wording from the previous default. Core
  -- conditional packs and their protected activation rules always come from the
  -- certified global master. Every previous revision remains intact.
  if v_previous.id is not null then
    update public.document_template_sections target
    set legal_text = previous.legal_text, updated_at = v_now
    from public.document_template_sections previous
    where target.template_id = v_candidate.id
      and previous.template_id = v_previous.id
      and previous.section_key = target.section_key
      and coalesce(target.metadata_json ->> 'conditional_pack', 'false') <> 'true'
      and nullif(btrim(previous.legal_text), '') is not null;
  end if;

  update public.document_packet_templates
  set definition_json = public.bridge_build_template_definition_b1(v_candidate.id), updated_at = v_now
  where id = v_candidate.id;

  insert into public.legal_document_master_migrations (
    organisation_id, packet_type, source_master_template_id, candidate_template_id,
    previous_default_template_id, legacy_template_ids, state, prepared_at, created_by, updated_by
  ) values (
    p_organisation_id, v_packet_type, v_source.id, v_candidate.id,
    v_previous.id, v_legacy_ids, 'prepared', v_now, auth.uid(), auth.uid()
  ) returning * into v_existing;

  return jsonb_build_object(
    'id', v_existing.id,
    'state', v_existing.state,
    'candidateTemplateId', v_candidate.id,
    'previousDefaultTemplateId', v_previous.id,
    'legacyTemplateIds', to_jsonb(v_legacy_ids),
    'idempotent', false
  );
end;
$$;

create or replace function public.bridge_activate_conditional_master_migration_phase10(
  p_migration_id uuid,
  p_coverage_version text,
  p_coverage_decision_hash text,
  p_wording_reviewed boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_migration public.legal_document_master_migrations%rowtype;
  v_expected_packs integer;
  v_invalid_packs integer;
  v_result jsonb;
  v_now timestamptz := now();
  v_rollback_until timestamptz := v_now + interval '14 days';
begin
  select * into v_migration from public.legal_document_master_migrations where id = p_migration_id for update;
  if not found then raise exception 'Migration not found.'; end if;
  if not public.bridge_is_org_admin(v_migration.organisation_id) then
    raise exception 'Only an organisation administrator can activate this migration.' using errcode = '42501';
  end if;
  if v_migration.state <> 'prepared' then
    raise exception 'Only a prepared migration can be activated.';
  end if;
  if btrim(coalesce(p_coverage_version, '')) <> 'conditional-master-coverage-v1'
     or btrim(coalesce(p_coverage_decision_hash, '')) !~ '^fnv1a_[0-9a-f]{8}$' then
    raise exception 'A complete coverage-readiness certification is required.';
  end if;
  if not p_wording_reviewed then
    raise exception 'Legacy wording reconciliation must be reviewed before activation.';
  end if;

  v_expected_packs := case v_migration.packet_type when 'mandate' then 6 else 13 end;
  if not exists (
    select 1 from public.document_packet_templates
    where id = v_migration.candidate_template_id
      and organisation_id = v_migration.organisation_id
      and packet_type = v_migration.packet_type
  ) then
    raise exception 'The recorded candidate conditional master is missing or outside the migration scope.';
  end if;
  select count(*) into v_invalid_packs
  from public.document_packet_templates template
  where template.id = v_migration.candidate_template_id
    and (
      template.status <> 'draft'
      or template.metadata_json ->> 'conditional_master_version' <> 'conditional-master-v1'
      or (select count(*) from public.document_template_sections section
          where section.template_id = template.id and section.metadata_json ->> 'conditional_pack' = 'true') <> v_expected_packs
      or (select count(*) from public.document_template_sections section
          where section.template_id = template.id and section.section_key = 'signature_pages') <> 1
      or exists (
        select 1 from public.document_template_sections section
        where section.template_id = template.id
          and section.metadata_json ->> 'conditional_pack' = 'true'
          and (section.metadata_json ->> 'condition_rule_locked' <> 'true'
               or coalesce(section.condition_json, '{}'::jsonb) = '{}'::jsonb
               or nullif(btrim(section.legal_text), '') is null)
      )
    );
  if v_invalid_packs <> 0 then
    raise exception 'The candidate conditional master failed the server structural gate.';
  end if;

  update public.document_packet_templates
  set metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'conditional_master_migration', coalesce(metadata_json -> 'conditional_master_migration', '{}'::jsonb) || jsonb_build_object(
      'version', 'conditional-master-migration-v1',
      'state', 'activated',
      'coverage_version', btrim(p_coverage_version),
      'coverage_decision_hash', btrim(p_coverage_decision_hash),
      'wording_reviewed_at', v_now,
      'activated_at', v_now,
      'rollback_until', v_rollback_until
    )
  ), updated_by = auth.uid(), updated_at = v_now
  where id = v_migration.candidate_template_id;

  v_result := public.bridge_publish_template_revision_b4(v_migration.candidate_template_id, true);

  update public.legal_document_master_migrations
  set state = 'activated', coverage_version = btrim(p_coverage_version),
      coverage_decision_hash = btrim(p_coverage_decision_hash), wording_reviewed_at = v_now,
      activated_at = v_now, rollback_until = v_rollback_until,
      updated_by = auth.uid(), updated_at = v_now
  where id = v_migration.id;

  return v_result || jsonb_build_object('migrationId', v_migration.id, 'rollbackUntil', v_rollback_until);
end;
$$;

create or replace function public.bridge_rollback_conditional_master_migration_phase10(p_migration_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_migration public.legal_document_master_migrations%rowtype;
  v_result jsonb;
  v_now timestamptz := now();
begin
  select * into v_migration from public.legal_document_master_migrations where id = p_migration_id for update;
  if not found then raise exception 'Migration not found.'; end if;
  if not public.bridge_is_org_admin(v_migration.organisation_id) then
    raise exception 'Only an organisation administrator can roll back this migration.' using errcode = '42501';
  end if;
  if v_migration.state <> 'activated' or v_migration.rollback_until <= v_now then
    raise exception 'The migration rollback window is not open.';
  end if;
  if v_migration.previous_default_template_id is null then
    raise exception 'No previous default template was recorded for rollback.';
  end if;

  v_result := public.bridge_publish_template_revision_b4(v_migration.previous_default_template_id, true);
  update public.document_packet_templates
  set is_active = false, is_default = false, updated_by = auth.uid(), updated_at = v_now
  where id = v_migration.candidate_template_id;
  update public.legal_document_master_migrations
  set state = 'rolled_back', rolled_back_at = v_now, updated_by = auth.uid(), updated_at = v_now
  where id = v_migration.id;
  return v_result || jsonb_build_object('migrationId', v_migration.id, 'state', 'rolled_back');
end;
$$;

create or replace function public.bridge_finalize_conditional_master_migration_phase10(p_migration_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_migration public.legal_document_master_migrations%rowtype;
  v_now timestamptz := now();
  v_archived_count integer := 0;
begin
  select * into v_migration from public.legal_document_master_migrations where id = p_migration_id for update;
  if not found then raise exception 'Migration not found.'; end if;
  if not public.bridge_is_org_admin(v_migration.organisation_id) then
    raise exception 'Only an organisation administrator can finalise this migration.' using errcode = '42501';
  end if;
  if v_migration.state <> 'activated' or v_migration.rollback_until > v_now then
    raise exception 'Legacy templates cannot be archived before the rollback window closes.';
  end if;
  if not exists (
    select 1 from public.document_packet_templates
    where id = v_migration.candidate_template_id and status = 'published' and is_active = true and is_default = true
  ) then
    raise exception 'The conditional master is no longer the live default.';
  end if;

  update public.document_packet_templates
  set status = 'archived', is_active = false, is_default = false,
      archived_by = auth.uid(), archived_at = v_now, updated_by = auth.uid(), updated_at = v_now
  where id = any(v_migration.legacy_template_ids)
    and organisation_id = v_migration.organisation_id
    and packet_type = v_migration.packet_type
    and id <> v_migration.candidate_template_id
    and status <> 'archived';
  get diagnostics v_archived_count = row_count;

  update public.legal_document_master_migrations
  set state = 'completed', completed_at = v_now, updated_by = auth.uid(), updated_at = v_now
  where id = v_migration.id;

  return jsonb_build_object('migrationId', v_migration.id, 'state', 'completed', 'archivedTemplateCount', v_archived_count);
end;
$$;

grant execute on function public.bridge_prepare_conditional_master_migration_phase10(uuid, text) to authenticated;
grant execute on function public.bridge_activate_conditional_master_migration_phase10(uuid, text, text, boolean) to authenticated;
grant execute on function public.bridge_rollback_conditional_master_migration_phase10(uuid) to authenticated;
grant execute on function public.bridge_finalize_conditional_master_migration_phase10(uuid) to authenticated;

comment on table public.legal_document_master_migrations is
  'Phase 10 audit state for reversible organisation migration to one Mandate and one OTP conditional master.';

commit;
