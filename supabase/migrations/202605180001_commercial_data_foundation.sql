begin;
create extension if not exists "pgcrypto";
create table if not exists public.commercial_landlords (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  status text default 'active',
  notes text,
  name text not null,
  contact_person text,
  email text,
  phone text,
  website text,
  landlord_type text,
  portfolio_notes text,
  preferred_contact_method text,
  constraint commercial_landlords_name_not_blank check (length(trim(name)) > 0)
);
create table if not exists public.commercial_tenants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  status text default 'active',
  notes text,
  name text not null,
  contact_person text,
  email text,
  phone text,
  industry text,
  company_size text,
  current_location text,
  current_lease_expiry date,
  preferred_contact_method text,
  constraint commercial_tenants_name_not_blank check (length(trim(name)) > 0)
);
create table if not exists public.commercial_properties (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  status text default 'active',
  notes text,
  landlord_id uuid references public.commercial_landlords(id) on delete set null,
  property_name text not null,
  property_type text,
  address text,
  suburb text,
  city text,
  province text,
  country text default 'South Africa',
  gla_m2 numeric,
  available_space_m2 numeric,
  vacancy_percentage numeric,
  zoning text,
  parking_ratio text,
  loading_bays integer,
  power_supply text,
  height_m numeric,
  asking_rental_per_m2 numeric,
  asking_sale_price numeric,
  constraint commercial_properties_name_not_blank check (length(trim(property_name)) > 0)
);
create table if not exists public.commercial_requirements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  status text default 'active',
  notes text,
  requirement_type text not null,
  client_type text,
  tenant_id uuid references public.commercial_tenants(id) on delete set null,
  requirement_name text not null,
  property_type text,
  preferred_locations text[],
  min_size_m2 numeric,
  max_size_m2 numeric,
  budget_min numeric,
  budget_max numeric,
  target_occupation_date date,
  lease_term_months integer,
  special_requirements text,
  assigned_broker uuid references auth.users(id) on delete set null,
  stage text default 'new_requirement',
  constraint commercial_requirements_name_not_blank check (length(trim(requirement_name)) > 0),
  constraint commercial_requirements_type_not_blank check (length(trim(requirement_type)) > 0)
);
create table if not exists public.commercial_deals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  status text default 'active',
  notes text,
  deal_name text not null,
  deal_type text not null,
  requirement_id uuid references public.commercial_requirements(id) on delete set null,
  tenant_id uuid references public.commercial_tenants(id) on delete set null,
  landlord_id uuid references public.commercial_landlords(id) on delete set null,
  property_id uuid references public.commercial_properties(id) on delete set null,
  assigned_broker uuid references auth.users(id) on delete set null,
  stage text default 'requirement',
  deal_value numeric,
  estimated_commission numeric,
  expected_close_date date,
  probability_percentage numeric,
  constraint commercial_deals_name_not_blank check (length(trim(deal_name)) > 0),
  constraint commercial_deals_type_not_blank check (length(trim(deal_type)) > 0)
);
create table if not exists public.commercial_leases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  status text default 'draft',
  notes text,
  deal_id uuid references public.commercial_deals(id) on delete set null,
  tenant_id uuid references public.commercial_tenants(id) on delete set null,
  landlord_id uuid references public.commercial_landlords(id) on delete set null,
  property_id uuid references public.commercial_properties(id) on delete set null,
  lease_start_date date,
  lease_end_date date,
  occupation_date date,
  lease_term_months integer,
  monthly_rental numeric,
  rental_per_m2 numeric,
  escalation_percentage numeric,
  deposit_amount numeric,
  tenant_installation_allowance numeric,
  rent_free_period_months integer,
  renewal_option boolean default false,
  renewal_notice_date date
);
create index if not exists commercial_landlords_organisation_id_idx on public.commercial_landlords (organisation_id);
create index if not exists commercial_landlords_status_idx on public.commercial_landlords (status);
create index if not exists commercial_tenants_organisation_id_idx on public.commercial_tenants (organisation_id);
create index if not exists commercial_tenants_status_idx on public.commercial_tenants (status);
create index if not exists commercial_properties_organisation_id_idx on public.commercial_properties (organisation_id);
create index if not exists commercial_properties_landlord_id_idx on public.commercial_properties (landlord_id);
create index if not exists commercial_properties_status_idx on public.commercial_properties (status);
create index if not exists commercial_requirements_organisation_id_idx on public.commercial_requirements (organisation_id);
create index if not exists commercial_requirements_tenant_id_idx on public.commercial_requirements (tenant_id);
create index if not exists commercial_requirements_stage_idx on public.commercial_requirements (stage);
create index if not exists commercial_requirements_status_idx on public.commercial_requirements (status);
create index if not exists commercial_deals_organisation_id_idx on public.commercial_deals (organisation_id);
create index if not exists commercial_deals_requirement_id_idx on public.commercial_deals (requirement_id);
create index if not exists commercial_deals_property_id_idx on public.commercial_deals (property_id);
create index if not exists commercial_deals_stage_idx on public.commercial_deals (stage);
create index if not exists commercial_deals_status_idx on public.commercial_deals (status);
create index if not exists commercial_leases_organisation_id_idx on public.commercial_leases (organisation_id);
create index if not exists commercial_leases_lease_end_date_idx on public.commercial_leases (lease_end_date);
create index if not exists commercial_leases_status_idx on public.commercial_leases (status);
create or replace function public.bridge_touch_commercial_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(new.updated_by, auth.uid());
  return new;
end;
$$;
drop trigger if exists trg_bridge_touch_commercial_landlords_updated_at on public.commercial_landlords;
create trigger trg_bridge_touch_commercial_landlords_updated_at
before update on public.commercial_landlords
for each row execute function public.bridge_touch_commercial_updated_at();
drop trigger if exists trg_bridge_touch_commercial_tenants_updated_at on public.commercial_tenants;
create trigger trg_bridge_touch_commercial_tenants_updated_at
before update on public.commercial_tenants
for each row execute function public.bridge_touch_commercial_updated_at();
drop trigger if exists trg_bridge_touch_commercial_properties_updated_at on public.commercial_properties;
create trigger trg_bridge_touch_commercial_properties_updated_at
before update on public.commercial_properties
for each row execute function public.bridge_touch_commercial_updated_at();
drop trigger if exists trg_bridge_touch_commercial_requirements_updated_at on public.commercial_requirements;
create trigger trg_bridge_touch_commercial_requirements_updated_at
before update on public.commercial_requirements
for each row execute function public.bridge_touch_commercial_updated_at();
drop trigger if exists trg_bridge_touch_commercial_deals_updated_at on public.commercial_deals;
create trigger trg_bridge_touch_commercial_deals_updated_at
before update on public.commercial_deals
for each row execute function public.bridge_touch_commercial_updated_at();
drop trigger if exists trg_bridge_touch_commercial_leases_updated_at on public.commercial_leases;
create trigger trg_bridge_touch_commercial_leases_updated_at
before update on public.commercial_leases
for each row execute function public.bridge_touch_commercial_updated_at();
alter table public.commercial_landlords enable row level security;
alter table public.commercial_tenants enable row level security;
alter table public.commercial_properties enable row level security;
alter table public.commercial_requirements enable row level security;
alter table public.commercial_deals enable row level security;
alter table public.commercial_leases enable row level security;
drop policy if exists commercial_landlords_member_access on public.commercial_landlords;
create policy commercial_landlords_member_access on public.commercial_landlords
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
drop policy if exists commercial_tenants_member_access on public.commercial_tenants;
create policy commercial_tenants_member_access on public.commercial_tenants
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
drop policy if exists commercial_properties_member_access on public.commercial_properties;
create policy commercial_properties_member_access on public.commercial_properties
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
drop policy if exists commercial_requirements_member_access on public.commercial_requirements;
create policy commercial_requirements_member_access on public.commercial_requirements
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
drop policy if exists commercial_deals_member_access on public.commercial_deals;
create policy commercial_deals_member_access on public.commercial_deals
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
drop policy if exists commercial_leases_member_access on public.commercial_leases;
create policy commercial_leases_member_access on public.commercial_leases
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
grant select, insert, update, delete on public.commercial_landlords to authenticated;
grant select, insert, update, delete on public.commercial_tenants to authenticated;
grant select, insert, update, delete on public.commercial_properties to authenticated;
grant select, insert, update, delete on public.commercial_requirements to authenticated;
grant select, insert, update, delete on public.commercial_deals to authenticated;
grant select, insert, update, delete on public.commercial_leases to authenticated;
commit;
