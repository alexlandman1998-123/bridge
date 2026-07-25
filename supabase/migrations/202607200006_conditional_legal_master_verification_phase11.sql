begin;

-- Phase 11 issues immutable verification receipts. The verifier reads migration,
-- template, section, and historical packet evidence; it never changes them.

create table if not exists public.legal_document_master_verifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  packet_type text not null check (packet_type in ('mandate', 'otp')),
  migration_id uuid not null references public.legal_document_master_migrations(id) on delete restrict,
  source_master_template_id uuid not null references public.document_packet_templates(id) on delete restrict,
  candidate_template_id uuid not null references public.document_packet_templates(id) on delete restrict,
  verification_version text not null default 'conditional-master-verification-v1',
  migration_state text not null,
  coverage_version text not null,
  coverage_decision_hash text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  issue_codes text[] not null default '{}'::text[],
  passed boolean not null,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz not null default now()
);

create index if not exists legal_document_master_verifications_latest_phase11_idx
on public.legal_document_master_verifications (organisation_id, packet_type, verified_at desc);

alter table public.legal_document_master_verifications enable row level security;

drop policy if exists legal_document_master_verifications_select_phase11 on public.legal_document_master_verifications;
create policy legal_document_master_verifications_select_phase11
on public.legal_document_master_verifications for select to authenticated
using (public.bridge_is_active_member(organisation_id));

grant select on table public.legal_document_master_verifications to authenticated;

create or replace function public.bridge_verify_conditional_master_migration_phase11(
  p_migration_id uuid,
  p_coverage_version text,
  p_coverage_decision_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_migration public.legal_document_master_migrations%rowtype;
  v_receipt public.legal_document_master_verifications%rowtype;
  v_expected_packs integer;
  v_source_count integer := 0;
  v_candidate_count integer := 0;
  v_live_default_count integer := 0;
  v_pack_count integer := 0;
  v_invalid_pack_count integer := 0;
  v_signature_count integer := 0;
  v_legacy_state_mismatch_count integer := 0;
  v_historical_packet_count integer := 0;
  v_historical_snapshot_missing_count integer := 0;
  v_issues text[] := '{}'::text[];
  v_all_template_ids uuid[];
  v_evidence jsonb;
  v_passed boolean;
begin
  select * into v_migration
  from public.legal_document_master_migrations
  where id = p_migration_id;
  if not found then raise exception 'Migration not found.'; end if;
  if not public.bridge_is_org_admin(v_migration.organisation_id) then
    raise exception 'Only an organisation administrator can verify this migration.' using errcode = '42501';
  end if;
  if v_migration.state not in ('activated', 'completed') then
    raise exception 'Verification is available only for an activated or completed migration.';
  end if;

  v_expected_packs := case v_migration.packet_type when 'mandate' then 6 else 13 end;
  v_all_template_ids := array_append(v_migration.legacy_template_ids, v_migration.candidate_template_id);

  select count(*) into v_source_count
  from public.document_packet_templates
  where id = v_migration.source_master_template_id
    and organisation_id is null
    and packet_type = v_migration.packet_type
    and status = 'published'
    and is_active = true
    and metadata_json ->> 'conditional_master_version' = 'conditional-master-v1';
  if v_source_count <> 1 then v_issues := array_append(v_issues, 'VERIFICATION_SOURCE_MASTER_INVALID'); end if;

  select count(*) into v_candidate_count
  from public.document_packet_templates
  where id = v_migration.candidate_template_id
    and organisation_id = v_migration.organisation_id
    and packet_type = v_migration.packet_type
    and metadata_json ->> 'conditional_master_version' = 'conditional-master-v1';
  if v_candidate_count <> 1 then v_issues := array_append(v_issues, 'VERIFICATION_CANDIDATE_INVALID'); end if;

  select count(*) into v_live_default_count
  from public.document_packet_templates
  where organisation_id = v_migration.organisation_id
    and packet_type = v_migration.packet_type
    and status = 'published'
    and is_active = true
    and is_default = true;
  if v_live_default_count <> 1 or not exists (
    select 1 from public.document_packet_templates
    where id = v_migration.candidate_template_id
      and status = 'published' and is_active = true and is_default = true
  ) then
    v_issues := array_append(v_issues, 'VERIFICATION_CANDIDATE_NOT_LIVE_DEFAULT');
  end if;

  select count(*) into v_pack_count
  from public.document_template_sections
  where template_id = v_migration.candidate_template_id
    and metadata_json ->> 'conditional_pack' = 'true';
  if v_pack_count <> v_expected_packs then v_issues := array_append(v_issues, 'VERIFICATION_PACK_COUNT_INVALID'); end if;

  select count(*) into v_invalid_pack_count
  from public.document_template_sections
  where template_id = v_migration.candidate_template_id
    and metadata_json ->> 'conditional_pack' = 'true'
    and (
      metadata_json ->> 'condition_rule_locked' <> 'true'
      or metadata_json ->> 'conditional_master_version' <> 'conditional-master-v1'
      or coalesce(condition_json, '{}'::jsonb) = '{}'::jsonb
      or nullif(btrim(legal_text), '') is null
    );
  if v_invalid_pack_count <> 0 then v_issues := array_append(v_issues, 'VERIFICATION_PROTECTED_PACK_INVALID'); end if;

  select count(*) into v_signature_count
  from public.document_template_sections
  where template_id = v_migration.candidate_template_id and section_key = 'signature_pages';
  if v_signature_count <> 1 then v_issues := array_append(v_issues, 'VERIFICATION_SIGNATURE_SECTION_INVALID'); end if;

  if btrim(coalesce(p_coverage_version, '')) <> 'conditional-master-coverage-v1'
     or btrim(coalesce(p_coverage_version, '')) <> coalesce(v_migration.coverage_version, '') then
    v_issues := array_append(v_issues, 'VERIFICATION_COVERAGE_VERSION_MISMATCH');
  end if;
  if btrim(coalesce(p_coverage_decision_hash, '')) !~ '^fnv1a_[0-9a-f]{8}$'
     or btrim(coalesce(p_coverage_decision_hash, '')) <> coalesce(v_migration.coverage_decision_hash, '') then
    v_issues := array_append(v_issues, 'VERIFICATION_COVERAGE_HASH_MISMATCH');
  end if;

  if v_migration.state = 'activated' then
    select count(*) into v_legacy_state_mismatch_count
    from public.document_packet_templates
    where id = any(v_migration.legacy_template_ids)
      and (status = 'archived' or is_active = false);
    if v_migration.rollback_until is null then
      v_issues := array_append(v_issues, 'VERIFICATION_ROLLBACK_DEADLINE_MISSING');
    end if;
    if v_legacy_state_mismatch_count <> 0 then
      v_issues := array_append(v_issues, 'VERIFICATION_LEGACY_ARCHIVED_EARLY');
    end if;
  else
    select count(*) into v_legacy_state_mismatch_count
    from public.document_packet_templates
    where id = any(v_migration.legacy_template_ids)
      and (status <> 'archived' or is_active <> false);
    if v_legacy_state_mismatch_count <> 0 then
      v_issues := array_append(v_issues, 'VERIFICATION_LEGACY_STILL_ACTIVE');
    end if;
  end if;

  select count(*) into v_historical_packet_count
  from public.document_packets
  where organisation_id = v_migration.organisation_id
    and (template_id = any(v_all_template_ids) or template_revision_id = any(v_all_template_ids));
  select count(*) into v_historical_snapshot_missing_count
  from public.document_packets
  where organisation_id = v_migration.organisation_id
    and (template_id = any(v_all_template_ids) or template_revision_id = any(v_all_template_ids))
    and (
      template_revision_id is null
      or template_version_tag_snapshot is null
      or coalesce(template_definition_snapshot_json, '{}'::jsonb) = '{}'::jsonb
    );
  if v_historical_snapshot_missing_count <> 0 then
    v_issues := array_append(v_issues, 'VERIFICATION_HISTORICAL_SNAPSHOT_MISSING');
  end if;

  v_evidence := jsonb_build_object(
    'sourceMasterCount', v_source_count,
    'candidateCount', v_candidate_count,
    'liveDefaultCount', v_live_default_count,
    'expectedPackCount', v_expected_packs,
    'actualPackCount', v_pack_count,
    'invalidPackCount', v_invalid_pack_count,
    'signatureSectionCount', v_signature_count,
    'legacyTemplateCount', cardinality(v_migration.legacy_template_ids),
    'legacyStateMismatchCount', v_legacy_state_mismatch_count,
    'historicalPacketCount', v_historical_packet_count,
    'historicalSnapshotMissingCount', v_historical_snapshot_missing_count,
    'rollbackUntil', v_migration.rollback_until
  );
  v_passed := cardinality(v_issues) = 0;

  insert into public.legal_document_master_verifications (
    organisation_id, packet_type, migration_id, source_master_template_id,
    candidate_template_id, verification_version, migration_state,
    coverage_version, coverage_decision_hash, evidence_json, issue_codes,
    passed, verified_by
  ) values (
    v_migration.organisation_id, v_migration.packet_type, v_migration.id,
    v_migration.source_master_template_id, v_migration.candidate_template_id,
    'conditional-master-verification-v1', v_migration.state,
    btrim(p_coverage_version), btrim(p_coverage_decision_hash), v_evidence,
    v_issues, v_passed, auth.uid()
  ) returning * into v_receipt;

  return to_jsonb(v_receipt);
end;
$$;

revoke all on function public.bridge_verify_conditional_master_migration_phase11(uuid, text, text) from public, anon;
grant execute on function public.bridge_verify_conditional_master_migration_phase11(uuid, text, text) to authenticated;

comment on table public.legal_document_master_verifications is
  'Immutable Phase 11 receipts proving live conditional-master, migration, legacy, and historical packet integrity at a point in time.';

commit;
