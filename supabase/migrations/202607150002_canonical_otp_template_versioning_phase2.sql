begin;
-- OTP simplification Phase 2: extend the existing legal-template registry with
-- a single-master-document lifecycle. This is additive: legacy templates and
-- the current generate-otp runtime continue to read document_packet_templates.

alter table public.document_packet_template_versions
  drop constraint if exists document_packet_template_versions_status_check;
alter table public.document_packet_template_versions
  add constraint document_packet_template_versions_status_check
  check (status in (
    'draft',
    'awaiting_approval',
    'approved',
    'published',
    'archived',
    'superseded'
  ));
alter table public.document_packet_template_versions
  add column if not exists previous_version_id uuid references public.document_packet_template_versions(id) on delete set null,
  add column if not exists based_on_live_version_id uuid references public.document_packet_template_versions(id) on delete set null,
  add column if not exists canonical_contract_version text,
  add column if not exists field_mapping_version text,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;
alter table public.document_packet_templates
  add column if not exists document_model text not null default 'legacy_sectioned',
  add column if not exists canonical_contract_version text,
  add column if not exists live_version_id uuid references public.document_packet_template_versions(id) on delete set null,
  add column if not exists candidate_version_id uuid references public.document_packet_template_versions(id) on delete set null,
  add column if not exists previous_live_version_id uuid references public.document_packet_template_versions(id) on delete set null;
alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_document_model_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_document_model_check
  check (document_model in ('legacy_sectioned', 'single_master_document'));
create unique index if not exists document_packet_template_versions_one_published_idx
  on public.document_packet_template_versions (template_id)
  where status = 'published';
create index if not exists document_packet_templates_canonical_state_idx
  on public.document_packet_templates (
    organisation_id,
    packet_type,
    document_model,
    live_version_id,
    candidate_version_id
  )
  where document_model = 'single_master_document';
create table if not exists public.document_template_field_mappings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_packet_templates(id) on delete cascade,
  template_version_id uuid not null references public.document_packet_template_versions(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  field_key text not null,
  section_key text not null,
  field_label text not null,
  coverage_type text not null,
  source_paths text[] not null default '{}'::text[],
  document_locator_json jsonb not null default '{}'::jsonb,
  output_format text,
  is_required boolean not null default false,
  applicable_when text not null default 'always',
  is_variable_legal_text boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_template_field_mappings_coverage_check
    check (coverage_type in (
      'mapped',
      'calculated',
      'agency_setting',
      'signing_preset',
      'approved_clause',
      'manual',
      'gap'
    )),
  constraint document_template_field_mappings_source_check
    check (cardinality(source_paths) > 0 or coverage_type = 'gap'),
  constraint document_template_field_mappings_legal_text_check
    check (not is_variable_legal_text or coverage_type = 'approved_clause'),
  constraint document_template_field_mappings_version_field_unique
    unique (template_version_id, field_key)
);
create table if not exists public.document_template_approvals (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_packet_templates(id) on delete cascade,
  template_version_id uuid not null references public.document_packet_template_versions(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  decision text not null default 'pending',
  is_current boolean not null default true,
  reviewer_user_id uuid references public.profiles(id) on delete set null,
  reviewer_name text,
  reviewer_role text,
  reviewer_organisation text,
  template_fingerprint text,
  notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint document_template_approvals_decision_check
    check (decision in ('pending', 'approved', 'changes_requested', 'withdrawn')),
  constraint document_template_approvals_decision_metadata_check
    check (
      decision = 'pending'
      or (
        nullif(btrim(coalesce(reviewer_name, '')), '') is not null
        and nullif(btrim(coalesce(reviewer_role, '')), '') is not null
        and decided_at is not null
      )
    )
);
create unique index if not exists document_template_approvals_one_current_idx
  on public.document_template_approvals (template_version_id)
  where is_current;
create table if not exists public.approved_special_conditions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  clause_key text not null,
  clause_version integer not null default 1,
  label text not null,
  condition_type text not null,
  legal_text text not null,
  status text not null default 'draft',
  required_input_keys text[] not null default '{}'::text[],
  metadata_json jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_special_conditions_key_check
    check (clause_key = lower(clause_key) and clause_key ~ '^[a-z][a-z0-9_]*$'),
  constraint approved_special_conditions_version_check check (clause_version > 0),
  constraint approved_special_conditions_type_check
    check (condition_type in ('other_suspensive_condition', 'special_condition')),
  constraint approved_special_conditions_status_check
    check (status in ('draft', 'awaiting_approval', 'approved', 'archived')),
  constraint approved_special_conditions_approval_check
    check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  constraint approved_special_conditions_org_key_version_unique
    unique (organisation_id, clause_key, clause_version)
);
create table if not exists public.document_generation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  transaction_id uuid,
  template_id uuid not null references public.document_packet_templates(id) on delete restrict,
  template_version_id uuid not null references public.document_packet_template_versions(id) on delete restrict,
  status text not null default 'pending',
  field_mapping_version text,
  input_hash text,
  input_snapshot_json jsonb not null default '{}'::jsonb,
  validation_result_json jsonb not null default '{}'::jsonb,
  missing_required_fields text[] not null default '{}'::text[],
  output_storage_bucket text,
  output_storage_path text,
  output_file_name text,
  error_code text,
  error_message text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint document_generation_runs_status_check
    check (status in ('pending', 'validating', 'generating', 'completed', 'failed', 'cancelled')),
  constraint document_generation_runs_completion_check
    check (
      (status = 'completed' and completed_at is not null and output_storage_path is not null)
      or status <> 'completed'
    ),
  constraint document_generation_runs_failure_check
    check ((status = 'failed' and error_message is not null) or status <> 'failed')
);
create index if not exists document_template_field_mappings_version_idx
  on public.document_template_field_mappings (template_version_id, section_key, field_key);
create index if not exists document_template_field_mappings_org_idx
  on public.document_template_field_mappings (organisation_id, template_id, updated_at desc);
create index if not exists document_template_approvals_version_idx
  on public.document_template_approvals (template_version_id, created_at desc);
create index if not exists approved_special_conditions_org_status_idx
  on public.approved_special_conditions (organisation_id, condition_type, status, label);
create index if not exists document_generation_runs_transaction_idx
  on public.document_generation_runs (organisation_id, transaction_id, created_at desc);
create index if not exists document_generation_runs_template_version_idx
  on public.document_generation_runs (template_version_id, created_at desc);
drop trigger if exists document_template_field_mappings_set_updated_at on public.document_template_field_mappings;
create trigger document_template_field_mappings_set_updated_at
before update on public.document_template_field_mappings
for each row execute function public.bridge_set_updated_at();
drop trigger if exists approved_special_conditions_set_updated_at on public.approved_special_conditions;
create trigger approved_special_conditions_set_updated_at
before update on public.approved_special_conditions
for each row execute function public.bridge_set_updated_at();
alter table public.document_template_field_mappings enable row level security;
alter table public.document_template_approvals enable row level security;
alter table public.approved_special_conditions enable row level security;
alter table public.document_generation_runs enable row level security;
drop policy if exists document_template_field_mappings_select on public.document_template_field_mappings;
create policy document_template_field_mappings_select
on public.document_template_field_mappings
for select to authenticated
using (
  public.bridge_is_platform_admin()
  or public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.document_packet_template_versions version
      where version.id = template_version_id
        and version.status = 'published'
    )
  )
);
drop policy if exists document_template_field_mappings_write on public.document_template_field_mappings;
create policy document_template_field_mappings_write
on public.document_template_field_mappings
for all to authenticated
using (public.bridge_is_platform_admin() or public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_platform_admin() or public.bridge_is_org_admin(organisation_id));
drop policy if exists document_template_approvals_select on public.document_template_approvals;
create policy document_template_approvals_select
on public.document_template_approvals
for select to authenticated
using (
  public.bridge_is_platform_admin()
  or public.bridge_is_org_admin(organisation_id)
  or public.bridge_is_active_member(organisation_id)
);
drop policy if exists document_template_approvals_write on public.document_template_approvals;
create policy document_template_approvals_write
on public.document_template_approvals
for all to authenticated
using (public.bridge_is_platform_admin() or public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_platform_admin() or public.bridge_is_org_admin(organisation_id));
drop policy if exists approved_special_conditions_select on public.approved_special_conditions;
create policy approved_special_conditions_select
on public.approved_special_conditions
for select to authenticated
using (
  public.bridge_is_platform_admin()
  or public.bridge_is_org_admin(organisation_id)
  or (status = 'approved' and public.bridge_is_active_member(organisation_id))
);
drop policy if exists approved_special_conditions_write on public.approved_special_conditions;
create policy approved_special_conditions_write
on public.approved_special_conditions
for all to authenticated
using (public.bridge_is_platform_admin() or public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_platform_admin() or public.bridge_is_org_admin(organisation_id));
drop policy if exists document_generation_runs_select on public.document_generation_runs;
create policy document_generation_runs_select
on public.document_generation_runs
for select to authenticated
using (
  public.bridge_is_platform_admin()
  or public.bridge_is_org_admin(organisation_id)
  or public.bridge_is_active_member(organisation_id)
);
drop policy if exists document_generation_runs_insert on public.document_generation_runs;
create policy document_generation_runs_insert
on public.document_generation_runs
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.bridge_is_active_member(organisation_id)
);
drop policy if exists document_generation_runs_update on public.document_generation_runs;
create policy document_generation_runs_update
on public.document_generation_runs
for update to authenticated
using (
  public.bridge_is_platform_admin()
  or public.bridge_is_org_admin(organisation_id)
  or (created_by = auth.uid() and public.bridge_is_active_member(organisation_id))
)
with check (
  public.bridge_is_platform_admin()
  or public.bridge_is_org_admin(organisation_id)
  or (created_by = auth.uid() and public.bridge_is_active_member(organisation_id))
);
drop policy if exists document_generation_runs_delete on public.document_generation_runs;
create policy document_generation_runs_delete
on public.document_generation_runs
for delete to authenticated
using (public.bridge_is_platform_admin() or public.bridge_is_org_admin(organisation_id));
grant select, insert, update, delete on table public.document_template_field_mappings to authenticated;
grant select, insert, update, delete on table public.document_template_approvals to authenticated;
grant select, insert, update, delete on table public.approved_special_conditions to authenticated;
grant select, insert, update, delete on table public.document_generation_runs to authenticated;
comment on column public.document_packet_templates.live_version_id is
  'Published canonical DOCX version used for new OTP generation. Legacy runtime selection remains unchanged until the later activation phase.';
comment on column public.document_packet_templates.candidate_version_id is
  'Draft, awaiting-approval, or approved candidate prepared alongside the current live version.';
comment on column public.document_packet_templates.previous_live_version_id is
  'Immediately preceding live version retained as the explicit rollback target.';
comment on table public.document_template_field_mappings is
  'Version-specific mapping from the canonical OTP inventory to DOCX locations and authoritative transaction sources.';
comment on table public.document_generation_runs is
  'Immutable generation-attempt evidence tying output to a template version, field-map version, and input snapshot.';
commit;
