create table if not exists public.bond_banks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  relationship_owner uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_banks_status_check check (status in ('active', 'inactive', 'paused')),
  constraint bond_banks_unique_name unique (organisation_id, name)
);

create table if not exists public.bond_bank_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  bank_id uuid not null references public.bond_banks(id) on delete cascade,
  name text not null,
  role text not null,
  email text,
  phone text,
  region text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bond_bank_escalations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  bank_id uuid not null references public.bond_banks(id) on delete cascade,
  application_id uuid,
  consultant_id uuid references auth.users(id) on delete set null,
  branch_id uuid references public.workspace_units(id) on delete set null,
  region_id uuid references public.workspace_regions(id) on delete set null,
  issue text not null,
  issue_type text not null default 'Relationship Issue',
  priority text not null default 'Medium',
  status text not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint bond_bank_escalations_priority_check check (priority in ('Low', 'Medium', 'High', 'Critical')),
  constraint bond_bank_escalations_status_check check (status in ('open', 'assigned', 'in_progress', 'resolved', 'dismissed'))
);

create table if not exists public.bond_bank_feedback (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  bank_id uuid not null references public.bond_banks(id) on delete cascade,
  feedback_type text not null,
  sentiment text not null default 'neutral',
  message text not null,
  consultant_id uuid references auth.users(id) on delete set null,
  branch_id uuid references public.workspace_units(id) on delete set null,
  region_id uuid references public.workspace_regions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint bond_bank_feedback_sentiment_check check (sentiment in ('positive', 'neutral', 'negative'))
);

create table if not exists public.bond_bank_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  bank_id uuid not null references public.bond_banks(id) on delete cascade,
  period text not null,
  health_score integer not null default 0,
  health_status text not null default 'Healthy',
  approval_rate numeric(5, 2) not null default 0,
  response_time_score numeric(5, 2) not null default 0,
  escalation_score numeric(5, 2) not null default 0,
  instruction_rate numeric(5, 2) not null default 0,
  consultant_feedback_score numeric(5, 2) not null default 0,
  partner_feedback_score numeric(5, 2) not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_bank_health_snapshots_period_check check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint bond_bank_health_snapshots_status_check check (health_status in ('Excellent', 'Healthy', 'At Risk', 'Critical')),
  constraint bond_bank_health_snapshots_unique_period unique (organisation_id, bank_id, period)
);

create index if not exists bond_banks_scope_idx
  on public.bond_banks (organisation_id, status, name);

create index if not exists bond_bank_contacts_bank_idx
  on public.bond_bank_contacts (organisation_id, bank_id, role);

create index if not exists bond_bank_escalations_scope_idx
  on public.bond_bank_escalations (organisation_id, bank_id, status, priority, created_at desc);

create index if not exists bond_bank_escalations_region_idx
  on public.bond_bank_escalations (organisation_id, region_id, branch_id, created_at desc);

create index if not exists bond_bank_feedback_bank_idx
  on public.bond_bank_feedback (organisation_id, bank_id, sentiment, created_at desc);

create index if not exists bond_bank_health_snapshots_bank_idx
  on public.bond_bank_health_snapshots (organisation_id, bank_id, period desc, health_status);

alter table public.bond_banks enable row level security;
alter table public.bond_bank_contacts enable row level security;
alter table public.bond_bank_escalations enable row level security;
alter table public.bond_bank_feedback enable row level security;
alter table public.bond_bank_health_snapshots enable row level security;

drop policy if exists "bond_banks_member_select" on public.bond_banks;
create policy "bond_banks_member_select"
on public.bond_banks
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_banks_member_modify" on public.bond_banks;
create policy "bond_banks_member_modify"
on public.bond_banks
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bank_contacts_member_select" on public.bond_bank_contacts;
create policy "bond_bank_contacts_member_select"
on public.bond_bank_contacts
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bank_contacts_member_modify" on public.bond_bank_contacts;
create policy "bond_bank_contacts_member_modify"
on public.bond_bank_contacts
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bank_escalations_member_select" on public.bond_bank_escalations;
create policy "bond_bank_escalations_member_select"
on public.bond_bank_escalations
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bank_escalations_member_modify" on public.bond_bank_escalations;
create policy "bond_bank_escalations_member_modify"
on public.bond_bank_escalations
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bank_feedback_member_select" on public.bond_bank_feedback;
create policy "bond_bank_feedback_member_select"
on public.bond_bank_feedback
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bank_feedback_member_modify" on public.bond_bank_feedback;
create policy "bond_bank_feedback_member_modify"
on public.bond_bank_feedback
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bank_health_snapshots_member_select" on public.bond_bank_health_snapshots;
create policy "bond_bank_health_snapshots_member_select"
on public.bond_bank_health_snapshots
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bank_health_snapshots_member_modify" on public.bond_bank_health_snapshots;
create policy "bond_bank_health_snapshots_member_modify"
on public.bond_bank_health_snapshots
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
