begin;

alter table if exists public.document_requirement_rules
  add column if not exists owning_workflow text,
  add column if not exists workflow_stage text,
  add column if not exists visible_section text,
  add column if not exists blocking_stage text,
  add column if not exists pre_collection_allowed boolean not null default false,
  add column if not exists skip_condition_json jsonb not null default '{}'::jsonb,
  add column if not exists responsible_role text,
  add column if not exists rule_version integer not null default 1;

create table if not exists public.transaction_document_requirements (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  rule_id text not null,
  rule_version integer not null default 1,
  document_key text not null,
  document_name text not null,
  document_category text,
  owning_workflow text not null,
  workflow_stage text,
  requested_from text,
  responsible_role text,
  visible_section text not null,
  required boolean not null default true,
  blocking boolean not null default false,
  blocking_stage text,
  status text not null default 'pending',
  source text not null,
  trigger_snapshot jsonb not null default '{}'::jsonb,
  stage_at_generation text,
  pre_collection_allowed boolean not null default false,
  canonical_requirement_instance_id uuid references public.document_requirement_instances(id) on delete set null,
  uploaded_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_resolved_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_reason text
);

create index if not exists transaction_document_requirements_transaction_idx
  on public.transaction_document_requirements (transaction_id, visible_section, updated_at desc);

create index if not exists transaction_document_requirements_active_idx
  on public.transaction_document_requirements (transaction_id, document_key)
  where superseded_at is null;

create index if not exists transaction_document_requirements_canonical_idx
  on public.transaction_document_requirements (canonical_requirement_instance_id)
  where canonical_requirement_instance_id is not null;

create index if not exists transaction_document_requirements_trigger_snapshot_gin_idx
  on public.transaction_document_requirements using gin (trigger_snapshot);

create unique index if not exists transaction_document_requirements_active_signature_idx
  on public.transaction_document_requirements (
    transaction_id,
    document_key,
    coalesce(requested_from, ''),
    visible_section
  )
  where superseded_at is null;

drop trigger if exists transaction_document_requirements_set_updated_at on public.transaction_document_requirements;
create trigger transaction_document_requirements_set_updated_at
before update on public.transaction_document_requirements
for each row
execute function public.bridge_set_updated_at();

comment on table public.transaction_document_requirements is
  'Canonical generated read model for transaction document requirements. UI should read this table instead of inferring document ownership from legacy checklist rows.';

comment on column public.document_requirement_rules.owning_workflow is
  'Canonical workflow that owns the requirement when this rule matches.';
comment on column public.document_requirement_rules.workflow_stage is
  'Business workflow stage label used by the transaction requirement resolver.';
comment on column public.document_requirement_rules.visible_section is
  'Canonical UI section key such as buyer_documents or finance_documents.';
comment on column public.document_requirement_rules.blocking_stage is
  'Main transaction stage blocked by the requirement when it is active and missing.';
comment on column public.document_requirement_rules.pre_collection_allowed is
  'Whether the requirement may be shown before its blocking stage without blocking the current stage.';
comment on column public.document_requirement_rules.skip_condition_json is
  'Additional canonical skip conditions evaluated after trigger conditions.';
comment on column public.document_requirement_rules.responsible_role is
  'Role expected to provide or own delivery of the requirement.';
comment on column public.document_requirement_rules.rule_version is
  'Resolver-visible rule version recorded into generated transaction document requirements.';

notify pgrst, 'reload schema';

commit;
