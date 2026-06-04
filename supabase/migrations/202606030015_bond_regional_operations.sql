create table if not exists public.bond_regional_targets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  region_id uuid not null references public.workspace_regions(id) on delete cascade,
  period text not null,
  application_target integer not null default 0,
  approval_target numeric(5, 2) not null default 0,
  sla_target numeric(5, 2) not null default 0,
  partner_health_target numeric(5, 2) not null default 0,
  growth_target numeric(5, 2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_regional_targets_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_regional_targets_unique_period unique (organisation_id, region_id, period)
);

create table if not exists public.bond_regional_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  region_id uuid not null references public.workspace_regions(id) on delete cascade,
  period text not null,
  health_score integer not null default 0,
  health_status text not null default 'Healthy',
  branch_health numeric(5, 2) not null default 0,
  partner_health numeric(5, 2) not null default 0,
  sla_compliance numeric(5, 2) not null default 0,
  approval_rate numeric(5, 2) not null default 0,
  escalations integer not null default 0,
  capacity_risk numeric(8, 2) not null default 0,
  forecast_risk numeric(8, 2) not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_regional_health_snapshots_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_regional_health_snapshots_status_check check (health_status in ('Excellent', 'Healthy', 'At Risk', 'Critical')),
  constraint bond_regional_health_snapshots_unique_period unique (organisation_id, region_id, period)
);

create table if not exists public.bond_regional_forecasts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  region_id uuid not null references public.workspace_regions(id) on delete cascade,
  period text not null,
  forecast_window_days integer not null,
  application_growth integer not null default 0,
  capacity_demand integer not null default 0,
  consultant_demand integer not null default 0,
  partner_growth integer not null default 0,
  escalation_risk numeric(8, 2) not null default 0,
  expected_capacity_risk text not null default 'Low',
  recommended_headcount integer not null default 0,
  expected_application_volume integer not null default 0,
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_regional_forecasts_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_regional_forecasts_window_check check (forecast_window_days in (7, 30, 90)),
  constraint bond_regional_forecasts_risk_check check (expected_capacity_risk in ('Low', 'Medium', 'High')),
  constraint bond_regional_forecasts_unique_window unique (organisation_id, region_id, period, forecast_window_days)
);

create index if not exists bond_regional_targets_region_idx
  on public.bond_regional_targets (organisation_id, region_id, period desc);

create index if not exists bond_regional_health_snapshots_scope_idx
  on public.bond_regional_health_snapshots (organisation_id, period desc, health_status);

create index if not exists bond_regional_health_snapshots_region_idx
  on public.bond_regional_health_snapshots (organisation_id, region_id, period desc);

create index if not exists bond_regional_forecasts_region_idx
  on public.bond_regional_forecasts (organisation_id, region_id, period desc, forecast_window_days);

alter table public.bond_regional_targets enable row level security;
alter table public.bond_regional_health_snapshots enable row level security;
alter table public.bond_regional_forecasts enable row level security;

drop policy if exists "bond_regional_targets_member_select" on public.bond_regional_targets;
create policy "bond_regional_targets_member_select"
on public.bond_regional_targets
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_regional_targets_member_modify" on public.bond_regional_targets;
create policy "bond_regional_targets_member_modify"
on public.bond_regional_targets
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_regional_health_snapshots_member_select" on public.bond_regional_health_snapshots;
create policy "bond_regional_health_snapshots_member_select"
on public.bond_regional_health_snapshots
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_regional_health_snapshots_member_modify" on public.bond_regional_health_snapshots;
create policy "bond_regional_health_snapshots_member_modify"
on public.bond_regional_health_snapshots
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_regional_forecasts_member_select" on public.bond_regional_forecasts;
create policy "bond_regional_forecasts_member_select"
on public.bond_regional_forecasts
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_regional_forecasts_member_modify" on public.bond_regional_forecasts;
create policy "bond_regional_forecasts_member_modify"
on public.bond_regional_forecasts
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
