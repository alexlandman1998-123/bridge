begin;

create extension if not exists "pgcrypto";

-- P1 is deliberately additive. Transactions remain the matter system of record;
-- these ledgers persist the governed A1-F8 contracts without copying matter identity.
create or replace function public.bridge_conveyancer_can_access_record(
  target_organisation_id uuid,
  target_firm_id uuid,
  target_transaction_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and target_organisation_id is not null
    and target_firm_id is not null
    and exists (
      select 1
      from public.attorney_firms firm
      join public.attorney_firm_members member on member.firm_id = firm.id
      where firm.id = target_firm_id
        and firm.organisation_id = target_organisation_id
        and firm.is_active = true
        and member.user_id = auth.uid()
        and member.status = 'active'
    )
    and (
      target_transaction_id is null
      or public.bridge_can_access_transaction_spine(target_transaction_id)
    )
$$;

create or replace function public.bridge_conveyancer_reject_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Conveyancer product records are append-only; append a new revision or event.'
    using errcode = '55000';
end;
$$;

create table if not exists public.conveyancer_matter_plans (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  status text not null check (status in ('draft', 'active', 'blocked', 'completed', 'cancelled', 'superseded')),
  plan_type text not null,
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'privileged' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_matter_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (record_id, revision),
  unique (id, organisation_id, attorney_firm_id, transaction_id)
);

create table if not exists public.conveyancer_action_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  matter_plan_id uuid not null,
  action_id text not null,
  event_type text not null check (event_type in ('queued', 'claimed', 'started', 'completed', 'failed', 'cancelled', 'reassigned', 'reminded', 'escalated')),
  idempotency_key text not null,
  source_phase text not null default 'A5',
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'privileged' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_matter_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (attorney_firm_id, idempotency_key),
  foreign key (matter_plan_id, organisation_id, attorney_firm_id, transaction_id)
    references public.conveyancer_matter_plans (id, organisation_id, attorney_firm_id, transaction_id) on delete restrict
);

create table if not exists public.conveyancer_exceptions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  exception_code text not null,
  status text not null check (status in ('open', 'action_required', 'under_review', 'waiver_pending', 'resolved', 'not_applicable', 'superseded')),
  severity text not null check (severity in ('information', 'low', 'medium', 'high', 'critical')),
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'privileged' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_matter_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (record_id, revision),
  unique (id, organisation_id, attorney_firm_id, transaction_id)
);

create table if not exists public.conveyancer_exception_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  exception_id uuid not null,
  event_type text not null check (event_type in ('activated', 'corrected', 'not_applicable', 'waiver_requested', 'waiver_approved', 'waiver_rejected', 'override_requested', 'override_approved', 'override_rejected', 'resolved')),
  decision text,
  reason text not null,
  idempotency_key text not null,
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'privileged' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_matter_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (attorney_firm_id, idempotency_key),
  foreign key (exception_id, organisation_id, attorney_firm_id, transaction_id)
    references public.conveyancer_exceptions (id, organisation_id, attorney_firm_id, transaction_id) on delete restrict
);

create table if not exists public.conveyancer_document_artifacts (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  document_type text not null,
  lifecycle_status text not null check (lifecycle_status in ('draft', 'generated', 'under_review', 'approved', 'issued', 'signed', 'rejected', 'superseded')),
  template_reference text,
  object_bucket text,
  object_path text,
  content_hash text,
  mime_type text,
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'privileged' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_matter_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((object_bucket is null and object_path is null) or (object_bucket is not null and object_path is not null)),
  unique (record_id, revision),
  unique (id, organisation_id, attorney_firm_id, transaction_id)
);

create table if not exists public.conveyancer_signing_records (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  signing_status text not null check (signing_status in ('planned', 'appointment_pending', 'ready', 'in_progress', 'signed_pack_received', 'under_review', 'accepted', 'rejected', 'superseded')),
  signing_provider_reference text,
  signed_pack_artifact_id uuid,
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'privileged' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_matter_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (record_id, revision),
  foreign key (signed_pack_artifact_id, organisation_id, attorney_firm_id, transaction_id)
    references public.conveyancer_document_artifacts (id, organisation_id, attorney_firm_id, transaction_id) on delete restrict
);

create table if not exists public.conveyancer_financial_models (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  model_status text not null check (model_status in ('draft', 'under_review', 'approved', 'reconciliation_required', 'reconciled', 'finalised', 'superseded')),
  currency char(3) not null default 'ZAR',
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'restricted' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_financial_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (record_id, revision),
  unique (id, organisation_id, attorney_firm_id, transaction_id)
);

create table if not exists public.conveyancer_financial_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  financial_model_id uuid not null,
  event_type text not null check (event_type in ('charge_added', 'receipt_recorded', 'payment_recorded', 'adjustment_recorded', 'reconciled', 'final_account_prepared', 'final_account_approved', 'final_account_issued')),
  amount numeric(16,2),
  currency char(3) not null default 'ZAR',
  idempotency_key text not null,
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'restricted' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_financial_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (attorney_firm_id, idempotency_key),
  foreign key (financial_model_id, organisation_id, attorney_firm_id, transaction_id)
    references public.conveyancer_financial_models (id, organisation_id, attorney_firm_id, transaction_id) on delete restrict
);

create table if not exists public.conveyancer_coordinations (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  coordination_status text not null check (coordination_status in ('draft', 'active', 'waiting_external', 'action_required', 'ready_for_lodgement', 'lodged', 'registered', 'cancelled', 'superseded')),
  transfer_firm_id uuid references public.attorney_firms(id) on delete restrict,
  bond_firm_id uuid references public.attorney_firms(id) on delete restrict,
  cancellation_firm_id uuid references public.attorney_firms(id) on delete restrict,
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'privileged' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_matter_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (record_id, revision)
);

create table if not exists public.conveyancer_evidence (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  evidence_type text not null,
  evidence_status text not null check (evidence_status in ('captured', 'under_review', 'accepted', 'rejected', 'expired', 'revoked', 'superseded')),
  source_system text not null default 'manual',
  object_bucket text,
  object_path text,
  content_hash text not null,
  observed_at timestamptz not null,
  expires_at timestamptz,
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'privileged' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_evidence_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((object_bucket is null and object_path is null) or (object_bucket is not null and object_path is not null)),
  unique (record_id, revision),
  unique (id, organisation_id, attorney_firm_id, transaction_id)
);

create table if not exists public.conveyancer_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  evidence_id uuid not null,
  decision text not null check (decision in ('accepted', 'rejected', 'expired', 'revoked', 'replacement_required')),
  reason text not null,
  idempotency_key text not null,
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'privileged' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'legal_evidence_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  reviewed_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (attorney_firm_id, idempotency_key),
  foreign key (evidence_id, organisation_id, attorney_firm_id, transaction_id)
    references public.conveyancer_evidence (id, organisation_id, attorney_firm_id, transaction_id) on delete restrict
);

create table if not exists public.conveyancer_integration_profiles (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  provider_key text not null,
  adapter_key text not null,
  profile_status text not null check (profile_status in ('draft', 'manual', 'sandbox', 'active', 'paused', 'disabled', 'superseded')),
  secret_reference text,
  source_phase text not null default 'F1',
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'restricted' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'integration_configuration',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (record_id, revision),
  unique (id, organisation_id, attorney_firm_id)
);

create table if not exists public.conveyancer_integration_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid references public.transactions(id) on delete restrict,
  integration_profile_id uuid,
  direction text not null check (direction in ('inbound', 'outbound')),
  event_type text not null,
  processing_status text not null check (processing_status in ('received', 'pending', 'processing', 'accepted', 'completed', 'failed', 'quarantined', 'cancelled')),
  idempotency_key text not null,
  provider_event_id text,
  signature_verified boolean,
  object_bucket text,
  object_path text,
  content_hash text,
  source_phase text not null,
  contract_version text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'restricted' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'integration_event_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((object_bucket is null and object_path is null) or (object_bucket is not null and object_path is not null)),
  unique (attorney_firm_id, direction, idempotency_key),
  foreign key (integration_profile_id, organisation_id, attorney_firm_id)
    references public.conveyancer_integration_profiles (id, organisation_id, attorney_firm_id) on delete restrict
);

create table if not exists public.conveyancer_assurance_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid references public.transactions(id) on delete restrict,
  assurance_phase text not null check (assurance_phase in ('A7', 'B7', 'C8', 'D8', 'E7', 'F8', 'P1')),
  decision text not null check (decision in ('pass', 'fail', 'blocked')),
  release_candidate_id text not null,
  fingerprint text not null check (length(trim(fingerprint)) >= 8),
  classification text not null default 'internal' check (classification in ('internal', 'confidential', 'privileged', 'restricted')),
  retention_policy text not null default 'assurance_record',
  retention_until timestamptz,
  legal_hold boolean not null default false,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (attorney_firm_id, release_candidate_id, assurance_phase, fingerprint)
);

create table if not exists public.conveyancer_audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid references public.transactions(id) on delete restrict,
  actor_user_id uuid,
  action text not null,
  target_table text not null,
  target_id uuid not null,
  target_fingerprint text,
  source_phase text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create or replace function public.bridge_conveyancer_capture_insert_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conveyancer_audit_events (
    organisation_id, attorney_firm_id, transaction_id, actor_user_id,
    action, target_table, target_id, target_fingerprint, source_phase, metadata
  ) values (
    new.organisation_id, new.attorney_firm_id,
    case when to_jsonb(new) ? 'transaction_id' then nullif(to_jsonb(new) ->> 'transaction_id', '')::uuid else null end,
    auth.uid(), 'insert', tg_table_name, new.id,
    case when to_jsonb(new) ? 'fingerprint' then to_jsonb(new) ->> 'fingerprint' else null end,
    case when to_jsonb(new) ? 'source_phase' then to_jsonb(new) ->> 'source_phase' else null end,
    jsonb_build_object('recordId', to_jsonb(new) ->> 'record_id', 'revision', to_jsonb(new) ->> 'revision')
  );
  return new;
end;
$$;

create index if not exists conveyancer_matter_plans_scope_idx on public.conveyancer_matter_plans (organisation_id, attorney_firm_id, transaction_id, created_at desc);
create index if not exists conveyancer_action_events_scope_idx on public.conveyancer_action_events (organisation_id, attorney_firm_id, transaction_id, action_id, occurred_at desc);
create index if not exists conveyancer_exceptions_scope_idx on public.conveyancer_exceptions (organisation_id, attorney_firm_id, transaction_id, status, created_at desc);
create index if not exists conveyancer_exception_events_scope_idx on public.conveyancer_exception_events (organisation_id, attorney_firm_id, transaction_id, exception_id, occurred_at desc);
create index if not exists conveyancer_document_artifacts_scope_idx on public.conveyancer_document_artifacts (organisation_id, attorney_firm_id, transaction_id, document_type, created_at desc);
create index if not exists conveyancer_signing_records_scope_idx on public.conveyancer_signing_records (organisation_id, attorney_firm_id, transaction_id, signing_status, created_at desc);
create index if not exists conveyancer_financial_models_scope_idx on public.conveyancer_financial_models (organisation_id, attorney_firm_id, transaction_id, created_at desc);
create index if not exists conveyancer_financial_events_scope_idx on public.conveyancer_financial_events (organisation_id, attorney_firm_id, transaction_id, occurred_at desc);
create index if not exists conveyancer_coordinations_scope_idx on public.conveyancer_coordinations (organisation_id, attorney_firm_id, transaction_id, created_at desc);
create index if not exists conveyancer_evidence_scope_idx on public.conveyancer_evidence (organisation_id, attorney_firm_id, transaction_id, evidence_type, created_at desc);
create index if not exists conveyancer_evidence_reviews_scope_idx on public.conveyancer_evidence_reviews (organisation_id, attorney_firm_id, transaction_id, reviewed_at desc);
create index if not exists conveyancer_integration_profiles_scope_idx on public.conveyancer_integration_profiles (organisation_id, attorney_firm_id, provider_key, created_at desc);
create index if not exists conveyancer_integration_events_scope_idx on public.conveyancer_integration_events (organisation_id, attorney_firm_id, transaction_id, processing_status, occurred_at desc);
create index if not exists conveyancer_assurance_reports_scope_idx on public.conveyancer_assurance_reports (organisation_id, attorney_firm_id, transaction_id, created_at desc);
create index if not exists conveyancer_audit_events_scope_idx on public.conveyancer_audit_events (organisation_id, attorney_firm_id, transaction_id, occurred_at desc);

do $$
declare
  table_name text;
  transaction_expression text;
begin
  foreach table_name in array array[
    'conveyancer_matter_plans', 'conveyancer_action_events', 'conveyancer_exceptions',
    'conveyancer_exception_events', 'conveyancer_document_artifacts', 'conveyancer_signing_records',
    'conveyancer_financial_models', 'conveyancer_financial_events', 'conveyancer_coordinations',
    'conveyancer_evidence', 'conveyancer_evidence_reviews', 'conveyancer_integration_profiles',
    'conveyancer_integration_events', 'conveyancer_assurance_reports', 'conveyancer_audit_events'
  ]
  loop
    transaction_expression := case
      when table_name = 'conveyancer_integration_profiles' then 'null::uuid'
      else 'transaction_id'
    end;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_scoped', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, %s))',
      table_name || '_select_scoped', table_name, transaction_expression
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_scoped', table_name);
    execute format('revoke all on table public.%I from anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated, service_role', table_name);
    if table_name <> 'conveyancer_audit_events' then
      execute format('grant insert on table public.%I to service_role', table_name);
    end if;
    execute format('drop trigger if exists %I on public.%I', table_name || '_immutable', table_name);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.bridge_conveyancer_reject_mutation()',
      table_name || '_immutable', table_name
    );
    if table_name <> 'conveyancer_audit_events' then
      execute format('drop trigger if exists %I on public.%I', table_name || '_audit_insert', table_name);
      execute format(
        'create trigger %I after insert on public.%I for each row execute function public.bridge_conveyancer_capture_insert_audit()',
        table_name || '_audit_insert', table_name
      );
    end if;
  end loop;
end $$;

-- Audit writes occur only through the security-definer insert trigger.
revoke insert on public.conveyancer_audit_events from anon, authenticated, service_role;
revoke all on function public.bridge_conveyancer_can_access_record(uuid, uuid, uuid) from public;
grant execute on function public.bridge_conveyancer_can_access_record(uuid, uuid, uuid) to authenticated;
revoke all on function public.bridge_conveyancer_reject_mutation() from public;
revoke all on function public.bridge_conveyancer_capture_insert_audit() from public;

comment on table public.conveyancer_matter_plans is 'P1 append-only revisions of the A1-A7 matter-plan contract; transactions remain canonical matter identity.';
comment on table public.conveyancer_integration_events is 'P1 durable inbox/outbox envelopes. Payloads are minimised; large or sensitive bodies remain in object storage.';
comment on table public.conveyancer_audit_events is 'P1 immutable, trigger-written audit history for conveyancer product records.';

notify pgrst, 'reload schema';

commit;
