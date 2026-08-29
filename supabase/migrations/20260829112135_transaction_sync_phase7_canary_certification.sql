begin;

create table if not exists public.transaction_sync_certification_runs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  environment text not null check (environment ~ '^[a-z][a-z0-9_-]{1,31}$'),
  project_ref text not null check (project_ref ~ '^[a-z0-9]{10,40}$'),
  status text not null check (status in ('passed', 'failed')),
  canonical_version bigint not null default 0 check (canonical_version >= 0),
  phase5_status text not null check (phase5_status in ('healthy', 'warning', 'critical', 'failed')),
  role_versions_json jsonb not null default '{}'::jsonb,
  issue_codes_json jsonb not null default '[]'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  certification_reason text not null,
  created_at timestamptz not null default now(),
  constraint transaction_sync_certification_reason_check
    check (char_length(trim(certification_reason)) between 12 and 500),
  constraint transaction_sync_certification_issue_codes_array_check
    check (jsonb_typeof(issue_codes_json) = 'array')
);

create index if not exists transaction_sync_certification_runs_transaction_idx
  on public.transaction_sync_certification_runs (transaction_id, created_at desc);

alter table public.transaction_sync_certification_runs enable row level security;

drop policy if exists transaction_sync_certification_runs_internal_read
  on public.transaction_sync_certification_runs;
create policy transaction_sync_certification_runs_internal_read
  on public.transaction_sync_certification_runs for select to authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    and public.bridge_can_access_transaction_spine(transaction_id)
  );

revoke all on table public.transaction_sync_certification_runs from public, anon, authenticated;
grant select on table public.transaction_sync_certification_runs to authenticated;
grant select, insert on table public.transaction_sync_certification_runs to service_role;

drop policy if exists transaction_activity_projections_professional_read
  on public.transaction_activity_projections;
create policy transaction_activity_projections_professional_read
  on public.transaction_activity_projections for select to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(coalesce(profile.role, '')) in (
          'developer','platform_admin','internal_admin','admin','agent','bond_originator',
          'attorney','conveyancer','transfer_attorney','bond_attorney','cancellation_attorney'
        )
    )
    and (
      visibility <> 'internal'
      or public.bridge_transaction_scope_is_internal_user()
      or exists (
        select 1 from public.profiles profile
        where profile.id = (select auth.uid())
          and lower(coalesce(profile.role, '')) in (
            'attorney','conveyancer','transfer_attorney','bond_attorney','cancellation_attorney'
          )
      )
      or (
        visibility = 'internal'
        and canonical_event_type = 'AgentWorkflowOverrideApplied'
        and audience_json ? 'agent'
        and exists (
          select 1 from public.profiles profile
          where profile.id = (select auth.uid())
            and lower(coalesce(profile.role, '')) = 'agent'
        )
      )
    )
  );

notify pgrst, 'reload schema';
commit;
