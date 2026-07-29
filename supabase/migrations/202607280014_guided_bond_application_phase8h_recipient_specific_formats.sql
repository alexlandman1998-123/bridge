create table if not exists public.transaction_bond_application_recipient_format_packages (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid not null references public.transaction_bond_application_submissions(id) on delete restrict,
  recipient_profile_key text not null,
  recipient_type text not null check (
    recipient_type in ('bond_originator', 'bank', 'attorney', 'internal_review', 'unknown')
  ),
  format_profile_version text not null default 'phase-8h-recipient-formats-v1',
  status text not null default 'ready_for_download' check (
    status in ('ready_for_download', 'blocked', 'superseded', 'cancelled')
  ),
  artifact_manifest_json jsonb not null default '[]'::jsonb,
  blocker_summary_json jsonb not null default '[]'::jsonb,
  source_snapshot_hash text not null,
  canonical_hash text not null,
  manual_download_only boolean not null default true check (manual_download_only = true),
  live_delivery_enabled boolean not null default false check (live_delivery_enabled = false),
  no_automatic_bank_submission boolean not null default true check (no_automatic_bank_submission = true),
  bank_workflow_unchanged boolean not null default true check (bank_workflow_unchanged = true),
  offer_workflow_mutation_deferred boolean not null default true check (offer_workflow_mutation_deferred = true),
  grant_workflow_mutation_deferred boolean not null default true check (grant_workflow_mutation_deferred = true),
  idempotency_key text,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_format_package_id uuid references public.transaction_bond_application_recipient_format_packages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists transaction_bond_application_recipient_format_packages_idempotency_idx
  on public.transaction_bond_application_recipient_format_packages (export_package_id, recipient_profile_key, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_application_recipient_format_packages_export_idx
  on public.transaction_bond_application_recipient_format_packages (export_package_id, status, generated_at desc);

create index if not exists transaction_bond_application_recipient_format_packages_transaction_idx
  on public.transaction_bond_application_recipient_format_packages (transaction_id, recipient_profile_key, status);

create index if not exists transaction_bond_application_recipient_format_packages_submission_idx
  on public.transaction_bond_application_recipient_format_packages (submission_id, recipient_profile_key);

alter table public.transaction_bond_application_recipient_format_packages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_application_recipient_format_packages'
      and policyname = 'bond_application_recipient_format_packages_service_only'
  ) then
    create policy bond_application_recipient_format_packages_service_only
      on public.transaction_bond_application_recipient_format_packages
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.bridge_touch_bond_application_recipient_format_package()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_application_recipient_format_package on public.transaction_bond_application_recipient_format_packages;
create trigger trg_touch_bond_application_recipient_format_package
  before update on public.transaction_bond_application_recipient_format_packages
  for each row execute function public.bridge_touch_bond_application_recipient_format_package();

create or replace function public.bridge_originator_recipient_format_packages_view(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_transaction_id is null then
    return '[]'::jsonb;
  end if;

  if auth.role() <> 'service_role' and not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to this transaction.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', format_package.id,
          'export_package_id', format_package.export_package_id,
          'transaction_id', format_package.transaction_id,
          'submission_id', format_package.submission_id,
          'recipient_profile_key', format_package.recipient_profile_key,
          'recipient_type', format_package.recipient_type,
          'status', format_package.status,
          'format_profile_version', format_package.format_profile_version,
          'artifact_count', jsonb_array_length(format_package.artifact_manifest_json),
          'blocker_summary', format_package.blocker_summary_json,
          'manualDownloadOnly', format_package.manual_download_only,
          'liveDeliveryEnabled', format_package.live_delivery_enabled,
          'noAutomaticBankSubmission', format_package.no_automatic_bank_submission,
          'bankWorkflowUnchanged', format_package.bank_workflow_unchanged,
          'offerWorkflowMutationDeferred', format_package.offer_workflow_mutation_deferred,
          'grantWorkflowMutationDeferred', format_package.grant_workflow_mutation_deferred,
          'generated_at', format_package.generated_at
        )
        order by format_package.generated_at desc
      )
      from public.transaction_bond_application_recipient_format_packages format_package
      where format_package.transaction_id = p_transaction_id
        and format_package.status <> 'cancelled'
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.bridge_originator_recipient_format_packages_view(uuid) from public;
grant execute on function public.bridge_originator_recipient_format_packages_view(uuid) to authenticated;

comment on table public.transaction_bond_application_recipient_format_packages is
  'Phase 8H recipient-specific downloadable format packages for originator/manual handoff. Official OOBA and bank payloads remain blocked until approved schemas, enum maps, validation rules, transport policy, credentials and acknowledgement contracts exist.';
comment on column public.transaction_bond_application_recipient_format_packages.artifact_manifest_json is
  'Generated artifact metadata and bodies for secure manual download by trusted services. Raw tokens, public URLs and storage paths must not be stored here.';
comment on function public.bridge_originator_recipient_format_packages_view(uuid) is
  'Phase 8H metadata-only recipient-format view. It does not expose artifact payload bodies and does not enable OOBA delivery, bank delivery, offer mutation, grant mutation or bank workflow changes.';
