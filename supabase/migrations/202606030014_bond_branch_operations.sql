create table if not exists public.bond_branch_targets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid not null references public.workspace_units(id) on delete cascade,
  period text not null,
  approval_target numeric(5, 2) not null default 0,
  submission_target integer not null default 0,
  turnaround_target numeric(8, 2) not null default 0,
  sla_target numeric(5, 2) not null default 0,
  satisfaction_target numeric(5, 2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_branch_targets_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_branch_targets_unique_period unique (organisation_id, branch_id, period)
);

create table if not exists public.bond_branch_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid not null references public.workspace_units(id) on delete cascade,
  period text not null,
  health_score integer not null default 0,
  health_status text not null default 'Healthy',
  sla_compliance numeric(5, 2) not null default 0,
  consultant_capacity numeric(8, 2) not null default 0,
  approval_rate numeric(5, 2) not null default 0,
  partner_health numeric(5, 2) not null default 0,
  escalations integer not null default 0,
  open_requests integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_branch_health_snapshots_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_branch_health_snapshots_status_check check (health_status in ('Excellent', 'Healthy', 'At Risk', 'Critical')),
  constraint bond_branch_health_snapshots_unique_period unique (organisation_id, branch_id, period)
);

create table if not exists public.bond_branch_forecasts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid not null references public.workspace_units(id) on delete cascade,
  period text not null,
  forecast_window_days integer not null,
  expected_applications integer not null default 0,
  expected_capacity integer not null default 0,
  risk_level text not null default 'Low',
  required_headcount integer not null default 0,
  recommended_action text,
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_branch_forecasts_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_branch_forecasts_window_check check (forecast_window_days in (7, 14, 30)),
  constraint bond_branch_forecasts_risk_check check (risk_level in ('Low', 'Medium', 'High')),
  constraint bond_branch_forecasts_unique_window unique (organisation_id, branch_id, period, forecast_window_days)
);

create index if not exists bond_branch_targets_branch_idx
  on public.bond_branch_targets (organisation_id, branch_id, period desc);

create index if not exists bond_branch_health_snapshots_scope_idx
  on public.bond_branch_health_snapshots (organisation_id, period desc, health_status);

create index if not exists bond_branch_health_snapshots_branch_idx
  on public.bond_branch_health_snapshots (organisation_id, branch_id, period desc);

create index if not exists bond_branch_forecasts_branch_idx
  on public.bond_branch_forecasts (organisation_id, branch_id, period desc, forecast_window_days);

alter table public.bond_branch_targets enable row level security;
alter table public.bond_branch_health_snapshots enable row level security;
alter table public.bond_branch_forecasts enable row level security;

drop policy if exists "bond_branch_targets_member_select" on public.bond_branch_targets;
create policy "bond_branch_targets_member_select"
on public.bond_branch_targets
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_branch_targets_member_modify" on public.bond_branch_targets;
create policy "bond_branch_targets_member_modify"
on public.bond_branch_targets
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_branch_health_snapshots_member_select" on public.bond_branch_health_snapshots;
create policy "bond_branch_health_snapshots_member_select"
on public.bond_branch_health_snapshots
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_branch_health_snapshots_member_modify" on public.bond_branch_health_snapshots;
create policy "bond_branch_health_snapshots_member_modify"
on public.bond_branch_health_snapshots
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_branch_forecasts_member_select" on public.bond_branch_forecasts;
create policy "bond_branch_forecasts_member_select"
on public.bond_branch_forecasts
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_branch_forecasts_member_modify" on public.bond_branch_forecasts;
create policy "bond_branch_forecasts_member_modify"
on public.bond_branch_forecasts
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
