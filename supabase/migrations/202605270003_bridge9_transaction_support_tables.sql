begin;

create extension if not exists "pgcrypto";

create table if not exists public.organisation_preferred_partners (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_type text not null,
  company_name text not null,
  contact_person text,
  email_address text,
  phone_number text,
  website text,
  physical_address text,
  province text,
  notes text,
  is_active boolean not null default true,
  is_preferred_default boolean not null default false,
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.organisation_preferred_partners
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.organisation_preferred_partners drop constraint if exists organisation_preferred_partners_partner_type_check;
alter table if exists public.organisation_preferred_partners
  add constraint organisation_preferred_partners_partner_type_check
  check (partner_type in ('bond_originator', 'bond_attorney', 'transfer_attorney'));

create index if not exists organisation_preferred_partners_org_type_idx
  on public.organisation_preferred_partners (organisation_id, partner_type);

create unique index if not exists organisation_preferred_partners_default_unique_idx
  on public.organisation_preferred_partners (organisation_id, partner_type)
  where is_preferred_default;

create index if not exists organisation_preferred_partners_demo_idx
  on public.organisation_preferred_partners (organisation_id, partner_type)
  where is_demo_data = true;

create table if not exists public.transaction_finance_details (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  proof_of_funds_received boolean,
  deposit_required boolean,
  deposit_paid boolean,
  bond_submitted boolean,
  bond_approved boolean,
  grant_signed boolean,
  proceed_to_attorneys boolean,
  cash_portion numeric(12, 2),
  bond_portion numeric(12, 2),
  bond_originator text,
  bank text,
  attorney text,
  expected_transfer_date date,
  next_action text,
  is_demo_data boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_role_players (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  role_type text not null,
  selection_source text not null default 'manual',
  preferred_partner_id uuid references public.organisation_preferred_partners(id) on delete set null,
  partner_name text,
  contact_person text,
  email_address text,
  phone_number text,
  website text,
  physical_address text,
  province text,
  notes text,
  snapshot_json jsonb not null default '{}'::jsonb,
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_onboarding (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  token text not null unique,
  purchaser_type text not null default 'individual',
  status text not null default 'Not Started',
  is_active boolean not null default true,
  submitted_at timestamptz,
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_form_data (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  purchaser_type text not null default 'individual',
  form_data jsonb not null default '{}'::jsonb,
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_readiness_states (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  onboarding_status text not null default 'Not Started',
  onboarding_complete boolean not null default false,
  docs_complete boolean not null default false,
  missing_required_docs integer not null default 0,
  uploaded_required_docs integer not null default 0,
  total_required_docs integer not null default 0,
  finance_lane_ready boolean not null default false,
  attorney_lane_ready boolean not null default false,
  stage_ready boolean not null default false,
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.transaction_finance_details
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_role_players
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_onboarding
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.onboarding_form_data
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_readiness_states
  add column if not exists is_demo_data boolean not null default false;

alter table if exists public.transaction_role_players drop constraint if exists transaction_role_players_role_type_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_role_type_check
  check (role_type in ('bond_originator', 'bond_attorney', 'transfer_attorney', 'cancellation_attorney', 'developer_contact', 'agent'));

alter table if exists public.transaction_role_players drop constraint if exists transaction_role_players_selection_source_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_selection_source_check
  check (selection_source in ('agency_preferred', 'buyer_appointed', 'manual', 'connected_partner', 'preferred_partner', 'recently_used'));

alter table if exists public.transaction_onboarding drop constraint if exists transaction_onboarding_status_check;
alter table if exists public.transaction_onboarding
  add constraint transaction_onboarding_status_check
  check (status in ('Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved'));

alter table if exists public.transaction_onboarding drop constraint if exists transaction_onboarding_purchaser_type_check;
alter table if exists public.transaction_onboarding
  add constraint transaction_onboarding_purchaser_type_check
  check (purchaser_type in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser'));

alter table if exists public.onboarding_form_data drop constraint if exists onboarding_form_data_purchaser_type_check;
alter table if exists public.onboarding_form_data
  add constraint onboarding_form_data_purchaser_type_check
  check (purchaser_type in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser'));

alter table if exists public.transaction_readiness_states drop constraint if exists transaction_readiness_states_onboarding_status_check;
alter table if exists public.transaction_readiness_states
  add constraint transaction_readiness_states_onboarding_status_check
  check (onboarding_status in ('Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved'));

create index if not exists transaction_finance_details_demo_idx
  on public.transaction_finance_details (transaction_id)
  where is_demo_data = true;

create index if not exists transaction_role_players_demo_idx
  on public.transaction_role_players (transaction_id, role_type)
  where is_demo_data = true;

create index if not exists transaction_onboarding_demo_idx
  on public.transaction_onboarding (transaction_id)
  where is_demo_data = true;

create index if not exists onboarding_form_data_demo_idx
  on public.onboarding_form_data (transaction_id)
  where is_demo_data = true;

create index if not exists transaction_readiness_states_demo_idx
  on public.transaction_readiness_states (transaction_id)
  where is_demo_data = true;

commit;
