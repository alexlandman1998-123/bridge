create table if not exists public.transaction_bond_application_submissions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  onboarding_form_data_id uuid references public.onboarding_form_data(id) on delete set null,
  submission_version integer not null check (submission_version > 0),
  application_schema_version text not null,
  flow_version text not null,
  document_rule_set_version text,
  declaration_contract_version text not null,
  status text not null default 'preparing' check (
    status in ('draft', 'preparing', 'awaiting_signature', 'signed', 'submitted', 'failed', 'cancelled', 'superseded')
  ),
  snapshot_json jsonb not null,
  snapshot_hash text not null check (length(trim(snapshot_hash)) > 0),
  source_application_hash text not null check (length(trim(source_application_hash)) > 0),
  source_application_updated_at timestamptz,
  declarations_json jsonb not null default '[]'::jsonb,
  document_manifest_json jsonb not null default '[]'::jsonb,
  selected_bank_ids jsonb not null default '[]'::jsonb,
  signer_manifest_json jsonb not null default '[]'::jsonb,
  generated_document_id uuid,
  signing_request_id uuid references public.document_packets(id) on delete set null,
  signed_document_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  prepared_at timestamptz,
  awaiting_signature_at timestamptz,
  signed_at timestamptz,
  submitted_at timestamptz,
  superseded_at timestamptz,
  cancelled_at timestamptz,
  failure_code text,
  failure_stage text,
  metadata jsonb not null default '{}'::jsonb,
  unique (transaction_id, submission_version)
);

create index if not exists transaction_bond_application_submissions_transaction_idx
  on public.transaction_bond_application_submissions (transaction_id, submission_version desc);

create unique index if not exists transaction_bond_application_submissions_one_active_signature_idx
  on public.transaction_bond_application_submissions (transaction_id)
  where status in ('preparing', 'awaiting_signature');

alter table public.transaction_bond_application_submissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_submissions'
      and policyname = 'transaction_bond_application_submissions_select_client_portal'
  ) then
    create policy transaction_bond_application_submissions_select_client_portal
      on public.transaction_bond_application_submissions
      for select
      using (
        public.bridge_has_client_portal_token_transaction_access(transaction_id)
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_submissions'
      and policyname = 'transaction_bond_application_submissions_insert_client_portal'
  ) then
    create policy transaction_bond_application_submissions_insert_client_portal
      on public.transaction_bond_application_submissions
      for insert
      with check (
        public.bridge_has_client_portal_token_transaction_access(transaction_id)
        or auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_submissions'
      and policyname = 'transaction_bond_application_submissions_update_lifecycle_client_portal'
  ) then
    create policy transaction_bond_application_submissions_update_lifecycle_client_portal
      on public.transaction_bond_application_submissions
      for update
      using (
        public.bridge_has_client_portal_token_transaction_access(transaction_id)
        or auth.role() = 'service_role'
      )
      with check (
        public.bridge_has_client_portal_token_transaction_access(transaction_id)
        or auth.role() = 'service_role'
      );
  end if;
end $$;

create or replace function public.bridge_prevent_bond_submission_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.snapshot_json is distinct from new.snapshot_json
      or old.snapshot_hash is distinct from new.snapshot_hash
      or old.declarations_json is distinct from new.declarations_json
      or old.document_manifest_json is distinct from new.document_manifest_json
      or old.selected_bank_ids is distinct from new.selected_bank_ids
      or old.signer_manifest_json is distinct from new.signer_manifest_json
      or old.submission_version is distinct from new.submission_version
      or old.application_schema_version is distinct from new.application_schema_version
      or old.flow_version is distinct from new.flow_version
      or old.document_rule_set_version is distinct from new.document_rule_set_version
      or old.declaration_contract_version is distinct from new.declaration_contract_version
      or old.source_application_hash is distinct from new.source_application_hash
      or old.source_application_updated_at is distinct from new.source_application_updated_at
    then
      raise exception 'Bond application submission snapshot fields are immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_bond_submission_snapshot_mutation on public.transaction_bond_application_submissions;
create trigger trg_prevent_bond_submission_snapshot_mutation
before update on public.transaction_bond_application_submissions
for each row execute function public.bridge_prevent_bond_submission_snapshot_mutation();

comment on table public.transaction_bond_application_submissions is
  'Immutable guided buyer bond application submission snapshots. Phase 5 stores signed application versions here without creating bank application rows.';
