begin;

create extension if not exists "pgcrypto";

alter table if exists public.bond_commission_rules
  add column if not exists rule_name text,
  add column if not exists party_type text,
  add column if not exists party_id uuid,
  add column if not exists calculation_basis text,
  add column if not exists rate numeric(12, 6),
  add column if not exists rate_type text,
  add column if not exists effective_from timestamptz,
  add column if not exists effective_to timestamptz;

update public.bond_commission_rules
set
  rule_name = coalesce(rule_name, name),
  party_type = coalesce(party_type, applies_to),
  calculation_basis = coalesce(
    calculation_basis,
    case
      when applies_to in ('consultant', 'branch', 'region') then 'originator_commission'
      when rule_type = 'fixed' then 'fixed_amount'
      else 'gross_bond_amount'
    end
  ),
  rate = coalesce(rate, nullif(percentage, 0), fixed_amount),
  rate_type = coalesce(rate_type, rule_type)
where true;

alter table if exists public.bond_commission_rules
  drop constraint if exists bond_commission_rules_party_type_check,
  add constraint bond_commission_rules_party_type_check
    check (party_type is null or party_type in ('originator_company', 'consultant', 'agency', 'agent', 'developer', 'branch', 'region', 'bank', 'partner_referral')),
  drop constraint if exists bond_commission_rules_calculation_basis_check,
  add constraint bond_commission_rules_calculation_basis_check
    check (calculation_basis is null or calculation_basis in ('gross_bond_amount', 'originator_commission', 'fixed_amount', 'manual')),
  drop constraint if exists bond_commission_rules_rate_type_check,
  add constraint bond_commission_rules_rate_type_check
    check (rate_type is null or rate_type in ('percentage', 'fixed', 'tiered', 'hybrid')),
  drop constraint if exists bond_commission_rules_status_check,
  drop constraint if exists bond_commission_rules_commercial_status_check,
  add constraint bond_commission_rules_commercial_status_check
    check (status in ('active', 'inactive', 'expired'));

create table if not exists public.bond_commission_payouts (
  id uuid primary key default gen_random_uuid(),
  originator_org_id uuid not null references public.organisations(id) on delete cascade,
  application_id uuid,
  party_type text not null,
  party_id uuid,
  party_name text not null,
  bond_amount numeric(14, 2) not null default 0,
  gross_commission numeric(14, 2) not null default 0,
  commission_rule_id uuid references public.bond_commission_rules(id) on delete set null,
  calculation_basis text not null default 'originator_commission',
  rate numeric(12, 6) not null default 0,
  amount_payable numeric(14, 2) not null default 0,
  status text not null default 'pending',
  invoice_status text not null default 'not_invoiced',
  payment_reference text,
  payment_date timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_commission_payouts_party_type_check
    check (party_type in ('originator_company', 'consultant', 'agency', 'agent', 'developer', 'branch', 'region', 'bank')),
  constraint bond_commission_payouts_calculation_basis_check
    check (calculation_basis in ('gross_bond_amount', 'originator_commission', 'fixed_amount', 'manual')),
  constraint bond_commission_payouts_status_check
    check (status in ('pending', 'ready_to_pay', 'approved', 'invoiced', 'paid', 'on_hold', 'cancelled')),
  constraint bond_commission_payouts_invoice_status_check
    check (invoice_status in ('not_required', 'not_invoiced', 'invoice_requested', 'invoice_received', 'invoice_approved', 'invoice_paid'))
);

create index if not exists bond_commission_payouts_scope_idx
  on public.bond_commission_payouts (originator_org_id, status, party_type, created_at desc);

create index if not exists bond_commission_payouts_application_idx
  on public.bond_commission_payouts (originator_org_id, application_id);

alter table if exists public.bond_payouts
  add column if not exists application_id uuid,
  add column if not exists bond_amount numeric(14, 2) not null default 0,
  add column if not exists gross_commission numeric(14, 2) not null default 0,
  add column if not exists consultant_commission numeric(14, 2) not null default 0,
  add column if not exists partner_payout numeric(14, 2) not null default 0,
  add column if not exists net_profit numeric(14, 2) not null default 0,
  add column if not exists invoice_status text not null default 'not_invoiced',
  add column if not exists payment_reference text,
  add column if not exists payment_date timestamptz,
  add column if not exists notes text;

alter table if exists public.bond_payouts
  drop constraint if exists bond_payouts_invoice_status_check,
  add constraint bond_payouts_invoice_status_check
    check (invoice_status in ('not_required', 'not_invoiced', 'invoice_requested', 'invoice_received', 'invoice_approved', 'invoice_paid'));

alter table public.bond_commission_payouts enable row level security;

drop policy if exists "bond_commission_payouts_member_select" on public.bond_commission_payouts;
create policy "bond_commission_payouts_member_select"
on public.bond_commission_payouts
for select
using (public.bridge_is_active_member(originator_org_id));

drop policy if exists "bond_commission_payouts_member_modify" on public.bond_commission_payouts;
create policy "bond_commission_payouts_member_modify"
on public.bond_commission_payouts
for all
using (public.bridge_is_active_member(originator_org_id))
with check (public.bridge_is_active_member(originator_org_id));

commit;
