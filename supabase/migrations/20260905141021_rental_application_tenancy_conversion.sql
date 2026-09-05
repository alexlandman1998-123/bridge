begin;

create table if not exists public.rental_tenancies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete restrict,
  unit_id uuid not null references public.rental_units(id) on delete restrict,
  source_application_id uuid not null unique references public.rental_applications(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'move_in_pending', 'active', 'notice_given', 'move_out_pending', 'closed')),
  intended_occupation_date date,
  tenant_snapshot_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rental_tenancies_unit_open_unique on public.rental_tenancies(unit_id) where status in ('draft', 'move_in_pending', 'active', 'notice_given', 'move_out_pending');
create index if not exists rental_tenancies_org_status_idx on public.rental_tenancies(organisation_id, status, updated_at desc);

create table if not exists public.rental_tenancy_parties (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  party_id uuid not null,
  role text not null default 'tenant' check (role in ('tenant', 'occupant', 'guarantor')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(tenancy_id, party_id, role)
);
create unique index if not exists rental_tenancy_parties_primary_tenant_unique on public.rental_tenancy_parties(tenancy_id) where role = 'tenant' and is_primary;

create table if not exists public.rental_leases (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique references public.rental_tenancies(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'awaiting_tenant', 'awaiting_landlord', 'signed', 'active', 'cancelled', 'superseded')),
  terms_json jsonb not null default '{}'::jsonb,
  source_application_id uuid not null unique references public.rental_applications(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.rental_unit_restrict_occupancy_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('app.rental_tenancy_command', true) = 'on' then return new; end if;
  if (tg_op = 'INSERT' and (new.status = 'occupied' or new.active_tenancy_id is not null) and auth.uid() is not null) then raise exception 'Browser clients cannot create an occupied rental unit'; end if;
  if (tg_op = 'UPDATE' and (new.status is distinct from old.status or new.active_tenancy_id is distinct from old.active_tenancy_id) and auth.uid() is not null) then raise exception 'Rental unit occupancy transitions require a server command'; end if;
  return new;
end; $$;

alter table public.rental_tenancies enable row level security;
alter table public.rental_tenancy_parties enable row level security;
alter table public.rental_leases enable row level security;
revoke all on public.rental_tenancies, public.rental_tenancy_parties, public.rental_leases from anon, authenticated;
grant select on public.rental_tenancies, public.rental_tenancy_parties, public.rental_leases to authenticated;
create policy rental_tenancies_staff_read on public.rental_tenancies for select to authenticated using (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_tenancy_parties_staff_read on public.rental_tenancy_parties for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_leases_staff_read on public.rental_leases for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create or replace function public.rental_convert_application_to_tenancy(p_application_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare application_row public.rental_applications%rowtype; unit_row public.rental_units%rowtype; tenancy_id uuid; lease_id uuid; occupation_date date;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select application.* into application_row from public.rental_applications application where application.id = p_application_id for update;
  if not found then raise exception 'Rental application not found'; end if;
  if not exists (select 1 from public.rental_vacancies vacancy join public.rental_properties property on property.id = vacancy.property_id where vacancy.id = application_row.vacancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this rental application'; end if;
  select tenancy.id into tenancy_id from public.rental_tenancies tenancy where tenancy.source_application_id = application_row.id;
  if tenancy_id is not null then
    select lease.id into lease_id from public.rental_leases lease where lease.tenancy_id = tenancy_id;
    return jsonb_build_object('tenancy_id', tenancy_id, 'lease_id', lease_id, 'idempotent', true);
  end if;
  if application_row.status <> 'approved' then raise exception 'Only an approved application can be converted to a tenancy'; end if;
  if application_row.version <> p_expected_version then raise exception 'This application changed. Refresh and try again.' using errcode = '40001'; end if;
  select unit.* into unit_row from public.rental_units unit where unit.id = application_row.unit_id for update;
  if not found or unit_row.organisation_id <> application_row.organisation_id then raise exception 'Rental unit does not match application'; end if;
  if unit_row.active_tenancy_id is not null or unit_row.status in ('lease_pending', 'occupied', 'notice_given', 'maintenance_hold') then raise exception 'This rental unit is not available for tenancy conversion'; end if;
  occupation_date := nullif(application_row.application_data #>> '{rentalHistory,intendedOccupationDate}', '')::date;
  insert into public.rental_tenancies(organisation_id, property_id, unit_id, source_application_id, intended_occupation_date, tenant_snapshot_json, created_by)
  select application_row.organisation_id, vacancy.property_id, application_row.unit_id, application_row.id, occupation_date,
    jsonb_build_object('identity', coalesce(application_row.application_data->'identity', '{}'::jsonb), 'employment', coalesce(application_row.application_data->'employment', '{}'::jsonb)), auth.uid()
  from public.rental_vacancies vacancy where vacancy.id = application_row.vacancy_id returning id into tenancy_id;
  if application_row.applicant_party_id is not null then
    insert into public.rental_tenancy_parties(tenancy_id, organisation_id, party_id, role, is_primary) values (tenancy_id, application_row.organisation_id, application_row.applicant_party_id, 'tenant', true);
  end if;
  insert into public.rental_leases(tenancy_id, organisation_id, terms_json, source_application_id, created_by)
  select tenancy_id, application_row.organisation_id, jsonb_build_object('monthly_rent', vacancy.asking_rent, 'deposit_amount', vacancy.deposit_amount, 'lease_term_months', vacancy.lease_term_months, 'intended_occupation_date', occupation_date), application_row.id, auth.uid()
  from public.rental_vacancies vacancy where vacancy.id = application_row.vacancy_id returning id into lease_id;
  perform set_config('app.rental_tenancy_command', 'on', true);
  update public.rental_units set status = 'lease_pending' where id = unit_row.id;
  return jsonb_build_object('tenancy_id', tenancy_id, 'lease_id', lease_id, 'idempotent', false, 'tenant_party_reused', application_row.applicant_party_id is not null);
exception when unique_violation then
  select tenancy.id into tenancy_id from public.rental_tenancies tenancy where tenancy.source_application_id = p_application_id;
  if tenancy_id is not null then select lease.id into lease_id from public.rental_leases lease where lease.tenancy_id = tenancy_id; return jsonb_build_object('tenancy_id', tenancy_id, 'lease_id', lease_id, 'idempotent', true); end if;
  raise;
end; $$;

revoke execute on function public.rental_convert_application_to_tenancy(uuid, integer) from public, anon;
grant execute on function public.rental_convert_application_to_tenancy(uuid, integer) to authenticated;

drop trigger if exists trg_rental_tenancies_updated_at on public.rental_tenancies;
create trigger trg_rental_tenancies_updated_at before update on public.rental_tenancies for each row execute function public.rental_set_updated_at();
drop trigger if exists trg_rental_leases_updated_at on public.rental_leases;
create trigger trg_rental_leases_updated_at before update on public.rental_leases for each row execute function public.rental_set_updated_at();

commit;
