begin;

create table if not exists public.bond_partner_referral_terms (
  id uuid primary key default gen_random_uuid(),
  originator_org_id uuid not null references public.organisations(id) on delete cascade,
  agency_org_id uuid not null references public.organisations(id) on delete cascade,
  partner_relationship_id uuid,
  version integer not null,
  status text not null default 'proposed',
  calculation_basis text not null default 'originator_commission',
  rate_type text not null default 'percentage',
  percentage numeric(12, 6) not null default 0,
  fixed_amount numeric(14, 2) not null default 0,
  tiers jsonb not null default '[]'::jsonb,
  terms_snapshot jsonb not null default '{}'::jsonb,
  proposed_by_user_id uuid references auth.users(id) on delete set null,
  proposed_at timestamptz not null default now(),
  agency_accepted_by_user_id uuid references auth.users(id) on delete set null,
  agency_accepted_at timestamptz,
  rejected_by_user_id uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_partner_referral_terms_party_check check (originator_org_id <> agency_org_id),
  constraint bond_partner_referral_terms_status_check check (status in ('proposed', 'accepted', 'rejected', 'superseded')),
  constraint bond_partner_referral_terms_basis_check check (calculation_basis in ('gross_bond_amount', 'originator_commission', 'fixed_amount', 'manual')),
  constraint bond_partner_referral_terms_rate_type_check check (rate_type in ('percentage', 'fixed', 'tiered', 'hybrid')),
  constraint bond_partner_referral_terms_version_unique unique (originator_org_id, agency_org_id, version)
);

create unique index if not exists bond_partner_referral_terms_one_accepted_idx
  on public.bond_partner_referral_terms (originator_org_id, agency_org_id)
  where status = 'accepted';

create index if not exists bond_partner_referral_terms_relationship_idx
  on public.bond_partner_referral_terms (partner_relationship_id, status, version desc);

create table if not exists public.bond_application_referral_term_snapshots (
  id uuid primary key default gen_random_uuid(),
  originator_org_id uuid not null references public.organisations(id) on delete cascade,
  agency_org_id uuid not null references public.organisations(id) on delete cascade,
  partner_relationship_id uuid,
  application_id uuid not null,
  referral_term_id uuid references public.bond_partner_referral_terms(id) on delete set null,
  term_version integer not null,
  calculation_basis text not null,
  rate_type text not null,
  percentage numeric(12, 6) not null default 0,
  fixed_amount numeric(14, 2) not null default 0,
  tiers jsonb not null default '[]'::jsonb,
  terms_snapshot jsonb not null default '{}'::jsonb,
  snapshotted_by_user_id uuid references auth.users(id) on delete set null,
  snapshotted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_application_referral_term_snapshots_party_check check (originator_org_id <> agency_org_id),
  constraint bond_application_referral_term_snapshots_application_unique unique (application_id)
);

create index if not exists bond_application_referral_term_snapshots_org_idx
  on public.bond_application_referral_term_snapshots (originator_org_id, agency_org_id, application_id);

create table if not exists public.bond_referral_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  originator_org_id uuid not null references public.organisations(id) on delete cascade,
  agency_org_id uuid not null references public.organisations(id) on delete cascade,
  application_id uuid not null,
  application_snapshot_id uuid references public.bond_application_referral_term_snapshots(id) on delete set null,
  referral_term_id uuid references public.bond_partner_referral_terms(id) on delete set null,
  term_version integer not null,
  beneficiary_type text not null default 'agency',
  beneficiary_id uuid not null default '00000000-0000-0000-0000-000000000000',
  beneficiary_name text not null,
  bond_amount numeric(14, 2) not null default 0,
  gross_commission numeric(14, 2) not null default 0,
  calculation_basis text not null,
  rate_type text not null,
  percentage numeric(12, 6) not null default 0,
  fixed_amount numeric(14, 2) not null default 0,
  amount_expected numeric(14, 2) not null default 0,
  amount_confirmed numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  status text not null default 'expected',
  invoice_status text not null default 'not_invoiced',
  invoice_reference text,
  payment_reference text,
  payment_date timestamptz,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_referral_commission_ledger_party_check check (originator_org_id <> agency_org_id),
  constraint bond_referral_commission_ledger_status_check check (status in ('expected', 'confirmed', 'payable', 'invoiced', 'paid', 'cancelled')),
  constraint bond_referral_commission_ledger_basis_check check (calculation_basis in ('gross_bond_amount', 'originator_commission', 'fixed_amount', 'manual')),
  constraint bond_referral_commission_ledger_rate_type_check check (rate_type in ('percentage', 'fixed', 'tiered', 'hybrid')),
  constraint bond_referral_commission_ledger_beneficiary_check check (beneficiary_type in ('agency', 'agent')),
  constraint bond_referral_commission_ledger_application_beneficiary_unique unique (application_id, beneficiary_type, beneficiary_id)
);

create index if not exists bond_referral_commission_ledger_originator_idx
  on public.bond_referral_commission_ledger (originator_org_id, status, created_at desc);

create index if not exists bond_referral_commission_ledger_agency_idx
  on public.bond_referral_commission_ledger (agency_org_id, beneficiary_id, status, created_at desc);

alter table public.bond_partner_referral_terms enable row level security;
alter table public.bond_application_referral_term_snapshots enable row level security;
alter table public.bond_referral_commission_ledger enable row level security;

drop policy if exists "bond_partner_referral_terms_party_select" on public.bond_partner_referral_terms;
create policy "bond_partner_referral_terms_party_select" on public.bond_partner_referral_terms
for select using (public.bridge_is_active_member(originator_org_id) or public.bridge_is_active_member(agency_org_id));

drop policy if exists "bond_partner_referral_terms_originator_propose" on public.bond_partner_referral_terms;
create policy "bond_partner_referral_terms_originator_propose" on public.bond_partner_referral_terms
for insert with check (
  public.bridge_is_org_admin(originator_org_id)
  and status = 'proposed'
  and proposed_by_user_id = auth.uid()
);

drop policy if exists "bond_partner_referral_terms_party_update" on public.bond_partner_referral_terms;
create policy "bond_partner_referral_terms_party_update" on public.bond_partner_referral_terms
for update using (
  public.bridge_is_org_admin(originator_org_id) or public.bridge_is_org_admin(agency_org_id)
)
with check (
  (public.bridge_is_org_admin(originator_org_id) and status in ('proposed', 'superseded'))
  or (public.bridge_is_org_admin(agency_org_id) and status in ('accepted', 'rejected', 'superseded'))
);

drop policy if exists "bond_application_referral_term_snapshots_party_select" on public.bond_application_referral_term_snapshots;
create policy "bond_application_referral_term_snapshots_party_select" on public.bond_application_referral_term_snapshots
for select using (public.bridge_is_active_member(originator_org_id) or public.bridge_is_active_member(agency_org_id));

drop policy if exists "bond_application_referral_term_snapshots_originator_modify" on public.bond_application_referral_term_snapshots;
create policy "bond_application_referral_term_snapshots_originator_modify" on public.bond_application_referral_term_snapshots
for all using (public.bridge_is_org_admin(originator_org_id))
with check (public.bridge_is_org_admin(originator_org_id));

drop policy if exists "bond_referral_commission_ledger_party_select" on public.bond_referral_commission_ledger;
create policy "bond_referral_commission_ledger_party_select" on public.bond_referral_commission_ledger
for select using (
  public.bridge_is_org_admin(originator_org_id)
  or public.bridge_is_org_admin(agency_org_id)
  or (
    public.bridge_is_active_member(agency_org_id)
    and (beneficiary_type = 'agency' or beneficiary_id = auth.uid())
  )
);

drop policy if exists "bond_referral_commission_ledger_originator_modify" on public.bond_referral_commission_ledger;
create policy "bond_referral_commission_ledger_originator_modify" on public.bond_referral_commission_ledger
for all using (public.bridge_is_org_admin(originator_org_id))
with check (public.bridge_is_org_admin(originator_org_id));

commit;
