begin;

create table if not exists public.transaction_sync_fleet_release_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment ~ '^[a-z][a-z0-9_-]{1,31}$'),
  project_ref text not null check (project_ref ~ '^[a-z0-9]{10,40}$'),
  status text not null check (status in ('passed', 'failed')),
  fleet_snapshot_at timestamptz not null,
  enumerated_transaction_count integer not null check (enumerated_transaction_count >= 0),
  active_transaction_count integer not null check (active_transaction_count >= 0),
  passed_transaction_count integer not null check (passed_transaction_count >= 0),
  failed_transaction_count integer not null check (failed_transaction_count >= 0),
  canary_run_ids_json jsonb not null default '[]'::jsonb,
  transaction_evidence_hashes_json jsonb not null default '{}'::jsonb,
  issue_codes_json jsonb not null default '[]'::jsonb,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  release_reason text not null,
  created_at timestamptz not null default now(),
  constraint transaction_sync_fleet_release_reason_check
    check (char_length(trim(release_reason)) between 12 and 500),
  constraint transaction_sync_fleet_release_canaries_array_check
    check (jsonb_typeof(canary_run_ids_json) = 'array'),
  constraint transaction_sync_fleet_release_hashes_object_check
    check (jsonb_typeof(transaction_evidence_hashes_json) = 'object'),
  constraint transaction_sync_fleet_release_issues_array_check
    check (jsonb_typeof(issue_codes_json) = 'array'),
  constraint transaction_sync_fleet_release_counts_check
    check (passed_transaction_count + failed_transaction_count = active_transaction_count),
  constraint transaction_sync_fleet_release_enumeration_check
    check (active_transaction_count <= enumerated_transaction_count)
);

create index if not exists transaction_sync_fleet_release_runs_created_idx
  on public.transaction_sync_fleet_release_runs (environment, project_ref, created_at desc);

alter table public.transaction_sync_fleet_release_runs enable row level security;

drop policy if exists transaction_sync_fleet_release_runs_internal_read
  on public.transaction_sync_fleet_release_runs;
create policy transaction_sync_fleet_release_runs_internal_read
  on public.transaction_sync_fleet_release_runs for select to authenticated
  using (public.bridge_transaction_scope_is_internal_user());

revoke all on table public.transaction_sync_fleet_release_runs from public, anon, authenticated;
grant select on table public.transaction_sync_fleet_release_runs to authenticated;
grant select, insert on table public.transaction_sync_fleet_release_runs to service_role;

notify pgrst, 'reload schema';
commit;
