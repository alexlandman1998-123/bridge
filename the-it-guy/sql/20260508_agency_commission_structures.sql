begin;

create table if not exists public.organisation_commission_structures (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  agent_split_percentage numeric(6,3) not null check (agent_split_percentage >= 0 and agent_split_percentage <= 100),
  agency_split_percentage numeric(6,3) not null check (agency_split_percentage >= 0 and agency_split_percentage <= 100),
  is_default boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_commission_structures_split_total_check
    check (round((agent_split_percentage + agency_split_percentage)::numeric, 3) = 100.000)
);

create index if not exists organisation_commission_structures_org_idx
  on public.organisation_commission_structures (organisation_id, is_active, is_default);

create unique index if not exists organisation_commission_structures_org_name_unique_idx
  on public.organisation_commission_structures (organisation_id, lower(name));

create table if not exists public.organisation_user_commission_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  organisation_user_id uuid references public.organisation_users(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  email_address text,
  commission_structure_id uuid references public.organisation_commission_structures(id) on delete set null,
  override_agent_split_percentage numeric(6,3) check (override_agent_split_percentage is null or (override_agent_split_percentage >= 0 and override_agent_split_percentage <= 100)),
  effective_from date not null default current_date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_user_commission_profiles_target_check
    check (
      organisation_user_id is not null
      or user_id is not null
      or coalesce(trim(email_address), '') <> ''
    )
);

create index if not exists organisation_user_commission_profiles_org_active_idx
  on public.organisation_user_commission_profiles (organisation_id, is_active, created_at desc);

create index if not exists organisation_user_commission_profiles_org_user_idx
  on public.organisation_user_commission_profiles (organisation_id, organisation_user_id, user_id);

create unique index if not exists organisation_user_commission_profiles_active_org_user_unique_idx
  on public.organisation_user_commission_profiles (organisation_id, organisation_user_id)
  where organisation_user_id is not null and is_active = true;

create unique index if not exists organisation_user_commission_profiles_active_user_unique_idx
  on public.organisation_user_commission_profiles (organisation_id, user_id)
  where user_id is not null and is_active = true;

create unique index if not exists organisation_user_commission_profiles_active_email_unique_idx
  on public.organisation_user_commission_profiles (organisation_id, lower(email_address))
  where coalesce(trim(email_address), '') <> '' and is_active = true;

create table if not exists public.transaction_commissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  assigned_agent_email text,
  commission_structure_id uuid references public.organisation_commission_structures(id) on delete set null,
  commission_structure_name_snapshot text,
  sale_price numeric(14,2),
  gross_commission_percentage numeric(6,3) check (gross_commission_percentage is null or (gross_commission_percentage >= 0 and gross_commission_percentage <= 100)),
  gross_commission_amount numeric(14,2),
  agent_split_percentage_snapshot numeric(6,3) check (agent_split_percentage_snapshot is null or (agent_split_percentage_snapshot >= 0 and agent_split_percentage_snapshot <= 100)),
  agency_split_percentage_snapshot numeric(6,3) check (agency_split_percentage_snapshot is null or (agency_split_percentage_snapshot >= 0 and agency_split_percentage_snapshot <= 100)),
  agent_commission_amount numeric(14,2),
  agency_commission_amount numeric(14,2),
  status text not null default 'projected' check (status in ('projected', 'confirmed', 'pending_payment', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id)
);

create index if not exists transaction_commissions_org_status_idx
  on public.transaction_commissions (organisation_id, status, created_at desc);

create index if not exists transaction_commissions_org_agent_idx
  on public.transaction_commissions (organisation_id, assigned_agent_id);

create index if not exists transaction_commissions_org_agent_email_idx
  on public.transaction_commissions (organisation_id, lower(assigned_agent_email));

alter table if exists public.organisation_commission_structures enable row level security;
alter table if exists public.organisation_user_commission_profiles enable row level security;
alter table if exists public.transaction_commissions enable row level security;

drop policy if exists organisation_commission_structures_agency_select on public.organisation_commission_structures;
create policy organisation_commission_structures_agency_select on public.organisation_commission_structures
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists organisation_commission_structures_agency_write on public.organisation_commission_structures;
create policy organisation_commission_structures_agency_write on public.organisation_commission_structures
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists organisation_user_commission_profiles_agency_select on public.organisation_user_commission_profiles;
create policy organisation_user_commission_profiles_agency_select on public.organisation_user_commission_profiles
for select to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or user_id = auth.uid()
  or (coalesce(trim(email_address), '') <> '' and lower(email_address) = public.bridge_current_email())
);

drop policy if exists organisation_user_commission_profiles_agency_write on public.organisation_user_commission_profiles;
create policy organisation_user_commission_profiles_agency_write on public.organisation_user_commission_profiles
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists transaction_commissions_agency_select on public.transaction_commissions;
create policy transaction_commissions_agency_select on public.transaction_commissions
for select to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or public.bridge_can_access_assignment(organisation_id, assigned_agent_id, assigned_agent_email)
);

drop policy if exists transaction_commissions_agency_write on public.transaction_commissions;
create policy transaction_commissions_agency_write on public.transaction_commissions
for all to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or public.bridge_can_access_assignment(organisation_id, assigned_agent_id, assigned_agent_email)
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or public.bridge_can_access_assignment(organisation_id, assigned_agent_id, assigned_agent_email)
);

grant select, insert, update, delete on table public.organisation_commission_structures to authenticated;
grant select, insert, update, delete on table public.organisation_user_commission_profiles to authenticated;
grant select, insert, update, delete on table public.transaction_commissions to authenticated;

commit;
