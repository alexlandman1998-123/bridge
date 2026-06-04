create table if not exists public.bond_hq_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  period text not null,
  health_score integer not null default 0,
  health_status text not null default 'Healthy',
  regional_health numeric(5, 2) not null default 0,
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
  constraint bond_hq_health_snapshots_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_hq_health_snapshots_status_check check (health_status in ('Excellent', 'Healthy', 'At Risk', 'Critical')),
  constraint bond_hq_health_snapshots_unique_period unique (organisation_id, period)
);

create table if not exists public.bond_hq_forecasts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  period text not null,
  forecast_window_days integer not null,
  expected_applications integer not null default 0,
  expected_approvals integer not null default 0,
  expected_capacity_risk text not null default 'Low',
  required_consultants integer not null default 0,
  expected_sla_risk text not null default 'Low',
  executive_forecast_risk text not null default 'Low',
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_hq_forecasts_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_hq_forecasts_window_check check (forecast_window_days in (7, 30, 90)),
  constraint bond_hq_forecasts_capacity_risk_check check (expected_capacity_risk in ('Low', 'Medium', 'High')),
  constraint bond_hq_forecasts_sla_risk_check check (expected_sla_risk in ('Low', 'Medium', 'High')),
  constraint bond_hq_forecasts_executive_risk_check check (executive_forecast_risk in ('Low', 'Medium', 'High')),
  constraint bond_hq_forecasts_unique_window unique (organisation_id, period, forecast_window_days)
);

create table if not exists public.bond_executive_alerts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'Medium',
  title text not null,
  description text not null default '',
  source_type text not null,
  source_id text not null,
  status text not null default 'open',
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint bond_executive_alerts_severity_check check (severity in ('Low', 'Medium', 'High', 'Critical')),
  constraint bond_executive_alerts_status_check check (status in ('open', 'assigned', 'dismissed', 'resolved'))
);

create table if not exists public.bond_executive_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  period text not null,
  format text not null,
  generated_by uuid references auth.users(id) on delete set null,
  file_url text,
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint bond_executive_reports_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_executive_reports_format_check check (format in ('PDF', 'Excel'))
);

create index if not exists bond_hq_health_snapshots_scope_idx
  on public.bond_hq_health_snapshots (organisation_id, period desc, health_status);

create index if not exists bond_hq_forecasts_scope_idx
  on public.bond_hq_forecasts (organisation_id, period desc, forecast_window_days);

create index if not exists bond_executive_alerts_scope_idx
  on public.bond_executive_alerts (organisation_id, status, severity, created_at desc);

create index if not exists bond_executive_alerts_source_idx
  on public.bond_executive_alerts (organisation_id, source_type, source_id);

create index if not exists bond_executive_reports_scope_idx
  on public.bond_executive_reports (organisation_id, period desc, created_at desc);

alter table public.bond_hq_health_snapshots enable row level security;
alter table public.bond_hq_forecasts enable row level security;
alter table public.bond_executive_alerts enable row level security;
alter table public.bond_executive_reports enable row level security;

drop policy if exists "bond_hq_health_snapshots_member_select" on public.bond_hq_health_snapshots;
create policy "bond_hq_health_snapshots_member_select"
on public.bond_hq_health_snapshots
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_hq_health_snapshots_member_modify" on public.bond_hq_health_snapshots;
create policy "bond_hq_health_snapshots_member_modify"
on public.bond_hq_health_snapshots
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_hq_forecasts_member_select" on public.bond_hq_forecasts;
create policy "bond_hq_forecasts_member_select"
on public.bond_hq_forecasts
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_hq_forecasts_member_modify" on public.bond_hq_forecasts;
create policy "bond_hq_forecasts_member_modify"
on public.bond_hq_forecasts
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_executive_alerts_member_select" on public.bond_executive_alerts;
create policy "bond_executive_alerts_member_select"
on public.bond_executive_alerts
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_executive_alerts_member_modify" on public.bond_executive_alerts;
create policy "bond_executive_alerts_member_modify"
on public.bond_executive_alerts
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_executive_reports_member_select" on public.bond_executive_reports;
create policy "bond_executive_reports_member_select"
on public.bond_executive_reports
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_executive_reports_member_modify" on public.bond_executive_reports;
create policy "bond_executive_reports_member_modify"
on public.bond_executive_reports
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
