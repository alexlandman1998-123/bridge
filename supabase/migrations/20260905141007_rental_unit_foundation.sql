-- Rentals Phase 8: independently managed rentable units.
-- Depends on 20260829_rental_property_foundation.sql and does not touch Sales tables.
begin;

create table if not exists public.rental_units (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  unit_label text not null default 'MAIN',
  bedrooms numeric(4,1) not null default 0 check (bedrooms >= 0),
  bathrooms numeric(4,1) not null default 0 check (bathrooms >= 0),
  parking_count integer not null default 0 check (parking_count >= 0),
  floor_area_sqm numeric(10,2) check (floor_area_sqm >= 0),
  target_rent numeric(14,2) not null default 0 check (target_rent >= 0),
  deposit_amount numeric(14,2) not null default 0 check (deposit_amount >= 0),
  available_from date,
  status text not null default 'vacant',
  -- Phase 29 atomically claims this column while inserting a tenancy. It is
  -- deliberately not a foreign key yet because rental_tenancies does not exist.
  active_tenancy_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_units_status_check check (status in ('vacant', 'marketing', 'application_pending', 'lease_pending', 'occupied', 'notice_given', 'maintenance_hold')),
  constraint rental_units_occupied_claim_check check ((status = 'occupied') = (active_tenancy_id is not null))
);
create unique index if not exists rental_units_property_label_unique on public.rental_units(property_id, upper(unit_label));
create index if not exists rental_units_property_status_idx on public.rental_units(property_id, status, unit_label);
create index if not exists rental_units_org_branch_status_idx on public.rental_units(organisation_id, branch_id, status);
create unique index if not exists rental_units_active_tenancy_unique on public.rental_units(active_tenancy_id) where active_tenancy_id is not null;

create table if not exists public.rental_unit_status_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  unit_id uuid not null references public.rental_units(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  constraint rental_unit_status_history_to_check check (to_status in ('vacant', 'marketing', 'application_pending', 'lease_pending', 'occupied', 'notice_given', 'maintenance_hold'))
);
create index if not exists rental_unit_status_history_unit_idx on public.rental_unit_status_history(unit_id, occurred_at desc);

create or replace function public.rental_unit_validate_property_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare property_org uuid; property_branch uuid;
begin
  select organisation_id, branch_id into property_org, property_branch from public.rental_properties where id = new.property_id;
  if property_org is null or property_org <> new.organisation_id then raise exception 'Rental unit organisation must match its property'; end if;
  if new.branch_id is null then new.branch_id := property_branch; end if;
  if property_branch is not null and new.branch_id is distinct from property_branch then raise exception 'Rental unit branch must match its property'; end if;
  return new;
end; $$;
drop trigger if exists trg_rental_units_validate_scope on public.rental_units;
create trigger trg_rental_units_validate_scope before insert or update of property_id, organisation_id, branch_id on public.rental_units for each row execute function public.rental_unit_validate_property_scope();
create or replace function public.rental_unit_restrict_occupancy_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Browser clients may edit physical facts only. A future privileged tenancy
  -- command owns status transitions and active-tenancy claims.
  if (tg_op = 'INSERT' and (new.status = 'occupied' or new.active_tenancy_id is not null) and auth.uid() is not null) then
    raise exception 'Browser clients cannot create an occupied rental unit';
  end if;
  if (tg_op = 'UPDATE' and (new.status is distinct from old.status or new.active_tenancy_id is distinct from old.active_tenancy_id) and auth.uid() is not null) then
    raise exception 'Rental unit occupancy transitions require a server command';
  end if;
  return new;
end; $$;
drop trigger if exists trg_rental_units_restrict_occupancy on public.rental_units;
create trigger trg_rental_units_restrict_occupancy before insert or update on public.rental_units for each row execute function public.rental_unit_restrict_occupancy_mutation();
drop trigger if exists trg_rental_units_updated_at on public.rental_units;
create trigger trg_rental_units_updated_at before update on public.rental_units for each row execute function public.rental_set_updated_at();

alter table public.rental_units enable row level security;
alter table public.rental_unit_status_history enable row level security;
revoke all on public.rental_units, public.rental_unit_status_history from anon, authenticated;
grant select, insert, update on public.rental_units to authenticated;
grant select on public.rental_unit_status_history to authenticated;

drop policy if exists rental_units_select_scoped on public.rental_units;
create policy rental_units_select_scoped on public.rental_units for select to authenticated using (
  exists (select 1 from public.rental_properties rp where rp.id = property_id and public.rental_branch_access(rp.organisation_id, rp.branch_id))
);
drop policy if exists rental_units_insert_scoped on public.rental_units;
create policy rental_units_insert_scoped on public.rental_units for insert to authenticated with check (
  exists (select 1 from public.rental_properties rp where rp.id = property_id and public.rental_branch_access(rp.organisation_id, rp.branch_id) and (public.bridge_is_org_admin(rp.organisation_id) or rp.assigned_manager_id = (select auth.uid()) or rp.created_by = (select auth.uid())))
);
drop policy if exists rental_units_update_scoped on public.rental_units;
create policy rental_units_update_scoped on public.rental_units for update to authenticated using (
  exists (select 1 from public.rental_properties rp where rp.id = property_id and public.rental_branch_access(rp.organisation_id, rp.branch_id) and (public.bridge_is_org_admin(rp.organisation_id) or rp.assigned_manager_id = (select auth.uid()) or rp.created_by = (select auth.uid())))
) with check (
  exists (select 1 from public.rental_properties rp where rp.id = property_id and public.rental_branch_access(rp.organisation_id, rp.branch_id) and (public.bridge_is_org_admin(rp.organisation_id) or rp.assigned_manager_id = (select auth.uid()) or rp.created_by = (select auth.uid())))
);
drop policy if exists rental_unit_status_history_select_scoped on public.rental_unit_status_history;
create policy rental_unit_status_history_select_scoped on public.rental_unit_status_history for select to authenticated using (
  exists (select 1 from public.rental_units ru join public.rental_properties rp on rp.id = ru.property_id where ru.id = unit_id and public.rental_branch_access(rp.organisation_id, rp.branch_id))
);
commit;
