-- Phase 2: shared unit operating strategy and canonical occupancy calendar.
-- This is additive: existing Long-Term properties, units, vacancies and tenancies remain unchanged.

create table public.rental_unit_operating_modes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  unit_id uuid not null references public.rental_units(id) on delete cascade,
  operating_mode text not null check (operating_mode in ('long_term', 'short_term')),
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  effective_from date not null default current_date,
  effective_to date,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create table public.rental_unit_occupancy_blocks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  unit_id uuid not null references public.rental_units(id) on delete cascade,
  source_type text not null check (source_type in ('tenancy', 'booking', 'owner_block', 'maintenance', 'manual')),
  source_id uuid not null,
  status text not null default 'held' check (status in ('held', 'confirmed', 'active', 'released', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (source_type, source_id)
);

alter table public.rental_unit_operating_modes
  add constraint rental_unit_operating_modes_no_overlapping_history
  exclude using gist (
    unit_id with =,
    operating_mode with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') with &&
  );

alter table public.rental_unit_occupancy_blocks
  add constraint rental_unit_occupancy_blocks_no_active_overlap
  exclude using gist (
    unit_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('held', 'confirmed', 'active'));

create index rental_unit_operating_modes_active_unit_idx
  on public.rental_unit_operating_modes (organisation_id, unit_id, effective_from desc)
  where status = 'active';

create index rental_unit_occupancy_blocks_calendar_idx
  on public.rental_unit_occupancy_blocks (organisation_id, unit_id, starts_at, ends_at)
  where status in ('held', 'confirmed', 'active');

create or replace function public.rental_unit_operating_mode_validate_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_unit record;
begin
  select organisation_id, property_id, branch_id
    into v_unit
    from public.rental_units
   where id = new.unit_id;

  if not found then
    raise exception 'Rental unit does not exist';
  end if;

  if new.organisation_id is distinct from v_unit.organisation_id
    or new.property_id is distinct from v_unit.property_id
    or new.branch_id is distinct from v_unit.branch_id then
    raise exception 'Rental operating mode scope must match its unit';
  end if;

  return new;
end;
$$;

create or replace function public.rental_unit_occupancy_block_validate_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_unit record;
begin
  select organisation_id, property_id, branch_id
    into v_unit
    from public.rental_units
   where id = new.unit_id;

  if not found then
    raise exception 'Rental unit does not exist';
  end if;

  if new.organisation_id is distinct from v_unit.organisation_id
    or new.property_id is distinct from v_unit.property_id
    or new.branch_id is distinct from v_unit.branch_id then
    raise exception 'Rental occupancy block scope must match its unit';
  end if;

  return new;
end;
$$;

create trigger rental_unit_operating_modes_validate_scope
before insert or update on public.rental_unit_operating_modes
for each row execute function public.rental_unit_operating_mode_validate_scope();

create trigger rental_unit_operating_modes_set_updated_at
before update on public.rental_unit_operating_modes
for each row execute function public.rental_set_updated_at();

create trigger rental_unit_occupancy_blocks_validate_scope
before insert or update on public.rental_unit_occupancy_blocks
for each row execute function public.rental_unit_occupancy_block_validate_scope();

create trigger rental_unit_occupancy_blocks_set_updated_at
before update on public.rental_unit_occupancy_blocks
for each row execute function public.rental_set_updated_at();

alter table public.rental_unit_operating_modes enable row level security;
alter table public.rental_unit_occupancy_blocks enable row level security;

revoke all on public.rental_unit_operating_modes from anon;
revoke all on public.rental_unit_occupancy_blocks from anon;
grant select, insert, update on public.rental_unit_operating_modes to authenticated;
grant select, insert, update on public.rental_unit_occupancy_blocks to authenticated;

create policy rental_unit_operating_modes_select_scoped
on public.rental_unit_operating_modes
for select to authenticated
using (
  exists (
    select 1
      from public.rental_properties property
     where property.id = rental_unit_operating_modes.property_id
       and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);

create policy rental_unit_operating_modes_insert_scoped
on public.rental_unit_operating_modes
for insert to authenticated
with check (
  exists (
    select 1
      from public.rental_properties property
     where property.id = rental_unit_operating_modes.property_id
       and public.rental_branch_access(property.organisation_id, property.branch_id)
       and (
         public.bridge_is_org_admin(property.organisation_id)
         or property.assigned_manager_id = (select auth.uid())
         or property.created_by = (select auth.uid())
       )
  )
);

create policy rental_unit_operating_modes_update_scoped
on public.rental_unit_operating_modes
for update to authenticated
using (
  exists (
    select 1
      from public.rental_properties property
     where property.id = rental_unit_operating_modes.property_id
       and public.rental_branch_access(property.organisation_id, property.branch_id)
       and (
         public.bridge_is_org_admin(property.organisation_id)
         or property.assigned_manager_id = (select auth.uid())
         or property.created_by = (select auth.uid())
       )
  )
)
with check (
  exists (
    select 1
      from public.rental_properties property
     where property.id = rental_unit_operating_modes.property_id
       and public.rental_branch_access(property.organisation_id, property.branch_id)
       and (
         public.bridge_is_org_admin(property.organisation_id)
         or property.assigned_manager_id = (select auth.uid())
         or property.created_by = (select auth.uid())
       )
  )
);

create policy rental_unit_occupancy_blocks_select_scoped
on public.rental_unit_occupancy_blocks
for select to authenticated
using (
  exists (
    select 1
      from public.rental_properties property
     where property.id = rental_unit_occupancy_blocks.property_id
       and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);

create policy rental_unit_occupancy_blocks_insert_scoped
on public.rental_unit_occupancy_blocks
for insert to authenticated
with check (
  exists (
    select 1
      from public.rental_properties property
     where property.id = rental_unit_occupancy_blocks.property_id
       and public.rental_branch_access(property.organisation_id, property.branch_id)
       and (
         public.bridge_is_org_admin(property.organisation_id)
         or property.assigned_manager_id = (select auth.uid())
         or property.created_by = (select auth.uid())
       )
  )
);

create policy rental_unit_occupancy_blocks_update_scoped
on public.rental_unit_occupancy_blocks
for update to authenticated
using (
  exists (
    select 1
      from public.rental_properties property
     where property.id = rental_unit_occupancy_blocks.property_id
       and public.rental_branch_access(property.organisation_id, property.branch_id)
       and (
         public.bridge_is_org_admin(property.organisation_id)
         or property.assigned_manager_id = (select auth.uid())
         or property.created_by = (select auth.uid())
       )
  )
)
with check (
  exists (
    select 1
      from public.rental_properties property
     where property.id = rental_unit_occupancy_blocks.property_id
       and public.rental_branch_access(property.organisation_id, property.branch_id)
       and (
         public.bridge_is_org_admin(property.organisation_id)
         or property.assigned_manager_id = (select auth.uid())
         or property.created_by = (select auth.uid())
       )
  )
);
