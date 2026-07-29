create extension if not exists pgcrypto with schema public;

create table if not exists public.transaction_bond_application_export_packages (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid not null references public.transaction_bond_application_submissions(id) on delete restrict,
  transaction_bond_application_id uuid references public.transaction_bond_applications(id) on delete set null,
  destination_key text not null,
  destination_type text not null default 'external' check (
    destination_type in ('bond_originator', 'bank', 'external', 'manual')
  ),
  adapter_version text not null,
  package_version integer not null default 1 check (package_version > 0),
  status text not null default 'draft' check (
    status in (
      'draft',
      'validation_failed',
      'ready_for_review',
      'approved',
      'delivering',
      'delivered',
      'delivery_failed',
      'partially_delivered',
      'cancelled',
      'superseded'
    )
  ),
  source_snapshot_hash text not null,
  source_submission_version integer not null,
  source_application_revision integer,
  canonical_schema_version text not null default 'phase-8-canonical-v1',
  canonical_hash text not null,
  payload_hash text,
  destination_payload_json jsonb,
  serialized_payload_document_id uuid references public.documents(id) on delete set null,
  validation_summary_json jsonb not null default '{}'::jsonb,
  mapping_manifest_json jsonb not null default '{}'::jsonb,
  document_manifest_json jsonb not null default '{}'::jsonb,
  operational_context_json jsonb not null default '{}'::jsonb,
  idempotency_key text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  superseded_at timestamptz,
  superseded_by_package_id uuid references public.transaction_bond_application_export_packages(id) on delete set null,
  supersession_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (payload_hash is not null or destination_payload_json is null)
);

create unique index if not exists transaction_bond_application_export_packages_idempotency_idx
  on public.transaction_bond_application_export_packages (transaction_id, destination_key, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists transaction_bond_application_export_packages_active_destination_idx
  on public.transaction_bond_application_export_packages (submission_id, destination_key, package_version)
  where status not in ('cancelled', 'superseded');

create index if not exists transaction_bond_application_export_packages_transaction_idx
  on public.transaction_bond_application_export_packages (transaction_id, status, created_at desc);

create index if not exists transaction_bond_application_export_packages_submission_idx
  on public.transaction_bond_application_export_packages (submission_id, status);

create index if not exists transaction_bond_application_export_packages_bond_application_idx
  on public.transaction_bond_application_export_packages (bond_application_id, status)
  where bond_application_id is not null;

create table if not exists public.transaction_bond_application_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  destination_key text not null,
  delivery_method text not null check (
    delivery_method in ('secure_export', 'manual_confirmation', 'api', 'sftp', 'email')
  ),
  status text not null default 'queued' check (
    status in ('queued', 'in_progress', 'accepted', 'confirmed', 'failed', 'unknown', 'cancelled')
  ),
  external_reference text,
  external_acknowledgement_hash text,
  attempted_by uuid references public.profiles(id) on delete set null,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  error_summary text,
  retry_after timestamptz,
  idempotency_key text,
  response_summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists transaction_bond_application_delivery_attempts_idempotency_idx
  on public.transaction_bond_application_delivery_attempts (export_package_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_application_delivery_attempts_package_idx
  on public.transaction_bond_application_delivery_attempts (export_package_id, status, attempted_at desc);

create index if not exists transaction_bond_application_delivery_attempts_external_idx
  on public.transaction_bond_application_delivery_attempts (destination_key, external_reference)
  where external_reference is not null;

create table if not exists public.transaction_bond_application_external_events (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid references public.transaction_bond_application_export_packages(id) on delete set null,
  delivery_attempt_id uuid references public.transaction_bond_application_delivery_attempts(id) on delete set null,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  destination_key text not null,
  external_reference text,
  event_type text not null,
  external_status text,
  mapped_status text not null default 'review_required' check (
    mapped_status in (
      'received',
      'accepted',
      'rejected',
      'additional_information_required',
      'review_required',
      'duplicate',
      'unknown'
    )
  ),
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  redacted_event_json jsonb not null default '{}'::jsonb,
  mapping_result_json jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists transaction_bond_application_external_events_package_idx
  on public.transaction_bond_application_external_events (export_package_id, received_at desc)
  where export_package_id is not null;

create index if not exists transaction_bond_application_external_events_external_idx
  on public.transaction_bond_application_external_events (destination_key, external_reference, received_at desc)
  where external_reference is not null;

alter table public.transaction_bond_application_export_packages enable row level security;
alter table public.transaction_bond_application_delivery_attempts enable row level security;
alter table public.transaction_bond_application_external_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_export_packages'
      and policyname = 'bond_application_export_packages_service_only'
  ) then
    create policy bond_application_export_packages_service_only
      on public.transaction_bond_application_export_packages
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_delivery_attempts'
      and policyname = 'bond_application_delivery_attempts_service_only'
  ) then
    create policy bond_application_delivery_attempts_service_only
      on public.transaction_bond_application_delivery_attempts
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_external_events'
      and policyname = 'bond_application_external_events_service_only'
  ) then
    create policy bond_application_external_events_service_only
      on public.transaction_bond_application_external_events
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.bridge_touch_bond_application_export_package()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_application_export_package on public.transaction_bond_application_export_packages;
create trigger trg_touch_bond_application_export_package
  before update on public.transaction_bond_application_export_packages
  for each row execute function public.bridge_touch_bond_application_export_package();

create or replace function public.bridge_prevent_bond_application_export_package_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status in ('approved', 'delivering', 'delivered', 'partially_delivered', 'superseded') then
    if old.submission_id is distinct from new.submission_id
      or old.transaction_id is distinct from new.transaction_id
      or old.bond_application_id is distinct from new.bond_application_id
      or old.destination_key is distinct from new.destination_key
      or old.adapter_version is distinct from new.adapter_version
      or old.package_version is distinct from new.package_version
      or old.source_snapshot_hash is distinct from new.source_snapshot_hash
      or old.source_submission_version is distinct from new.source_submission_version
      or old.source_application_revision is distinct from new.source_application_revision
      or old.canonical_schema_version is distinct from new.canonical_schema_version
      or old.canonical_hash is distinct from new.canonical_hash
      or old.payload_hash is distinct from new.payload_hash
      or old.destination_payload_json is distinct from new.destination_payload_json
      or old.serialized_payload_document_id is distinct from new.serialized_payload_document_id
      or old.validation_summary_json is distinct from new.validation_summary_json
      or old.mapping_manifest_json is distinct from new.mapping_manifest_json
      or old.document_manifest_json is distinct from new.document_manifest_json
    then
      raise exception 'Bond application export package source, mapping and payload fields are immutable after approval';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_bond_application_export_package_mutation on public.transaction_bond_application_export_packages;
create trigger trg_prevent_bond_application_export_package_mutation
  before update on public.transaction_bond_application_export_packages
  for each row execute function public.bridge_prevent_bond_application_export_package_mutation();

comment on table public.transaction_bond_application_export_packages is
  'Phase 8 external export packages generated from immutable guided bond application submissions. This table does not create or advance bank workflow rows.';
comment on table public.transaction_bond_application_delivery_attempts is
  'Phase 8 delivery attempt audit records for approved export packages. Raw credentials and raw tokens must never be stored here.';
comment on table public.transaction_bond_application_external_events is
  'Phase 8 redacted external acknowledgement/status events mapped back to export packages without mutating bank workflow automatically.';
comment on column public.transaction_bond_application_export_packages.transaction_bond_application_id is
  'Optional manual-confirmation relationship to an existing bank workflow row. Phase 8 export preparation must not create this row automatically.';
