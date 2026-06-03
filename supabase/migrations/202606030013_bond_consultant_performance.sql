create table if not exists public.bond_consultant_targets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  consultant_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  applications_target integer not null default 0,
  approvals_target integer not null default 0,
  approval_rate_target numeric(5, 2) not null default 0,
  turnaround_target numeric(8, 2) not null default 0,
  sla_compliance_target numeric(5, 2) not null default 0,
  response_time_target numeric(8, 2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_consultant_targets_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_consultant_targets_unique_period unique (organisation_id, consultant_id, period)
);

create table if not exists public.bond_consultant_coaching_notes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  consultant_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  flag_type text,
  severity text not null default 'Medium',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint bond_consultant_coaching_notes_severity_check check (severity in ('Low', 'Medium', 'High'))
);

create table if not exists public.bond_consultant_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  consultant_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  active_applications integer not null default 0,
  pending_documents integer not null default 0,
  awaiting_bank_feedback integer not null default 0,
  urgent_requests integer not null default 0,
  open_partner_requests integer not null default 0,
  sla_breaches integer not null default 0,
  capacity_score integer not null default 0,
  capacity_status text not null default 'Light',
  approval_rate numeric(5, 2) not null default 0,
  decline_rate numeric(5, 2) not null default 0,
  average_turnaround numeric(8, 2) not null default 0,
  sla_compliance numeric(5, 2) not null default 0,
  partner_response_time numeric(8, 2) not null default 0,
  applications_submitted integer not null default 0,
  approvals integer not null default 0,
  declines integer not null default 0,
  coaching_flags jsonb not null default '[]'::jsonb,
  forecast jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_consultant_performance_snapshots_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_consultant_performance_snapshots_capacity_check check (capacity_status in ('Light', 'Normal', 'Busy', 'Overloaded')),
  constraint bond_consultant_performance_snapshots_unique_period unique (organisation_id, consultant_id, period)
);

create index if not exists bond_consultant_targets_consultant_idx
  on public.bond_consultant_targets (organisation_id, consultant_id, period desc);

create index if not exists bond_consultant_coaching_notes_consultant_idx
  on public.bond_consultant_coaching_notes (organisation_id, consultant_id, created_at desc);

create index if not exists bond_consultant_performance_snapshots_scope_idx
  on public.bond_consultant_performance_snapshots (organisation_id, period desc, capacity_status);

create index if not exists bond_consultant_performance_snapshots_consultant_idx
  on public.bond_consultant_performance_snapshots (organisation_id, consultant_id, period desc);

alter table public.bond_consultant_targets enable row level security;
alter table public.bond_consultant_coaching_notes enable row level security;
alter table public.bond_consultant_performance_snapshots enable row level security;

drop policy if exists "bond_consultant_targets_member_select" on public.bond_consultant_targets;
create policy "bond_consultant_targets_member_select"
on public.bond_consultant_targets
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_consultant_targets_member_modify" on public.bond_consultant_targets;
create policy "bond_consultant_targets_member_modify"
on public.bond_consultant_targets
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_consultant_coaching_notes_member_select" on public.bond_consultant_coaching_notes;
create policy "bond_consultant_coaching_notes_member_select"
on public.bond_consultant_coaching_notes
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_consultant_coaching_notes_member_modify" on public.bond_consultant_coaching_notes;
create policy "bond_consultant_coaching_notes_member_modify"
on public.bond_consultant_coaching_notes
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_consultant_performance_snapshots_member_select" on public.bond_consultant_performance_snapshots;
create policy "bond_consultant_performance_snapshots_member_select"
on public.bond_consultant_performance_snapshots
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_consultant_performance_snapshots_member_modify" on public.bond_consultant_performance_snapshots;
create policy "bond_consultant_performance_snapshots_member_modify"
on public.bond_consultant_performance_snapshots
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
