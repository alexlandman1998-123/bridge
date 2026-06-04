create table if not exists public.bond_commission_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  applies_to text not null,
  rule_type text not null default 'percentage',
  percentage numeric(8, 4) not null default 0,
  fixed_amount numeric(14, 2) not null default 0,
  tiers jsonb not null default '[]'::jsonb,
  components jsonb not null default '[]'::jsonb,
  bonus_criteria jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_commission_rules_applies_to_check check (applies_to in ('consultant', 'branch', 'region', 'partner_referral', 'bank_incentive', 'bonus')),
  constraint bond_commission_rules_type_check check (rule_type in ('fixed', 'percentage', 'tiered', 'hybrid')),
  constraint bond_commission_rules_status_check check (status in ('active', 'inactive')),
  constraint bond_commission_rules_unique_name unique (organisation_id, name, applies_to)
);

create table if not exists public.bond_commissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  application_id uuid,
  consultant_id uuid references auth.users(id) on delete set null,
  amount numeric(14, 2) not null default 0,
  status text not null default 'Pending',
  calculated_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_commissions_status_check check (status in ('Pending', 'Approved', 'Processing', 'Paid', 'Rejected', 'Cancelled'))
);

create table if not exists public.bond_referral_fees (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  application_id uuid,
  partner_id uuid,
  amount numeric(14, 2) not null default 0,
  status text not null default 'Pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint bond_referral_fees_status_check check (status in ('Pending', 'Approved', 'Processing', 'Paid', 'Rejected', 'Cancelled'))
);

create table if not exists public.bond_bonus_awards (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_type text not null default 'consultant',
  recipient_id uuid,
  branch_id uuid references public.workspace_units(id) on delete set null,
  region_id uuid references public.workspace_regions(id) on delete set null,
  amount numeric(14, 2) not null default 0,
  reason text not null,
  status text not null default 'Pending',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint bond_bonus_awards_recipient_type_check check (recipient_type in ('consultant', 'branch', 'region', 'executive')),
  constraint bond_bonus_awards_status_check check (status in ('Pending', 'Approved', 'Processing', 'Paid', 'Rejected', 'Cancelled'))
);

create table if not exists public.bond_payouts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  payee_type text not null default 'consultant',
  payee_id uuid,
  payee_name text not null,
  branch_id uuid references public.workspace_units(id) on delete set null,
  region_id uuid references public.workspace_regions(id) on delete set null,
  amount numeric(14, 2) not null default 0,
  status text not null default 'Pending',
  workflow_stage text not null default 'Calculated',
  manager_approved_at timestamptz,
  finance_approved_at timestamptz,
  paid_at timestamptz,
  audit_trail jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_payouts_payee_type_check check (payee_type in ('consultant', 'branch', 'region', 'partner', 'bank', 'bonus')),
  constraint bond_payouts_status_check check (status in ('Pending', 'Approved', 'Processing', 'Paid', 'Rejected', 'Cancelled'))
);

create table if not exists public.bond_revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  period text not null,
  revenue numeric(14, 2) not null default 0,
  commission numeric(14, 2) not null default 0,
  referral_fees numeric(14, 2) not null default 0,
  bonuses numeric(14, 2) not null default 0,
  bank_incentives numeric(14, 2) not null default 0,
  profit numeric(14, 2) not null default 0,
  margin numeric(6, 2) not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_revenue_snapshots_unique_period unique (organisation_id, period)
);

create index if not exists bond_commission_rules_scope_idx
  on public.bond_commission_rules (organisation_id, applies_to, status);

create index if not exists bond_commissions_scope_idx
  on public.bond_commissions (organisation_id, consultant_id, status, calculated_at desc);

create index if not exists bond_commissions_application_idx
  on public.bond_commissions (organisation_id, application_id);

create index if not exists bond_referral_fees_scope_idx
  on public.bond_referral_fees (organisation_id, partner_id, status, created_at desc);

create index if not exists bond_bonus_awards_scope_idx
  on public.bond_bonus_awards (organisation_id, recipient_type, status, created_at desc);

create index if not exists bond_payouts_scope_idx
  on public.bond_payouts (organisation_id, status, payee_type, created_at desc);

create index if not exists bond_payouts_branch_region_idx
  on public.bond_payouts (organisation_id, region_id, branch_id, status);

create index if not exists bond_revenue_snapshots_period_idx
  on public.bond_revenue_snapshots (organisation_id, period desc);

alter table public.bond_commission_rules enable row level security;
alter table public.bond_commissions enable row level security;
alter table public.bond_referral_fees enable row level security;
alter table public.bond_bonus_awards enable row level security;
alter table public.bond_payouts enable row level security;
alter table public.bond_revenue_snapshots enable row level security;

drop policy if exists "bond_commission_rules_member_select" on public.bond_commission_rules;
create policy "bond_commission_rules_member_select"
on public.bond_commission_rules
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_commission_rules_member_modify" on public.bond_commission_rules;
create policy "bond_commission_rules_member_modify"
on public.bond_commission_rules
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_commissions_member_select" on public.bond_commissions;
create policy "bond_commissions_member_select"
on public.bond_commissions
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_commissions_member_modify" on public.bond_commissions;
create policy "bond_commissions_member_modify"
on public.bond_commissions
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_referral_fees_member_select" on public.bond_referral_fees;
create policy "bond_referral_fees_member_select"
on public.bond_referral_fees
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_referral_fees_member_modify" on public.bond_referral_fees;
create policy "bond_referral_fees_member_modify"
on public.bond_referral_fees
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bonus_awards_member_select" on public.bond_bonus_awards;
create policy "bond_bonus_awards_member_select"
on public.bond_bonus_awards
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_bonus_awards_member_modify" on public.bond_bonus_awards;
create policy "bond_bonus_awards_member_modify"
on public.bond_bonus_awards
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_payouts_member_select" on public.bond_payouts;
create policy "bond_payouts_member_select"
on public.bond_payouts
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_payouts_member_modify" on public.bond_payouts;
create policy "bond_payouts_member_modify"
on public.bond_payouts
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_revenue_snapshots_member_select" on public.bond_revenue_snapshots;
create policy "bond_revenue_snapshots_member_select"
on public.bond_revenue_snapshots
for select
using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_revenue_snapshots_member_modify" on public.bond_revenue_snapshots;
create policy "bond_revenue_snapshots_member_modify"
on public.bond_revenue_snapshots
for all
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
