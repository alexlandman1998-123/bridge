-- Phase 3: Short-Term booking records. The calendar remains canonical in
-- rental_unit_occupancy_blocks; this table owns guest-facing booking facts.
create table public.rental_short_term_bookings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  unit_id uuid not null references public.rental_units(id) on delete cascade,
  status text not null default 'provisional' check (status in ('enquiry', 'provisional', 'confirmed', 'checked_in', 'checked_out', 'cancelled')),
  guest_name text not null check (length(btrim(guest_name)) > 0),
  guest_email text,
  guest_phone text,
  source text not null default 'direct' check (source in ('direct', 'phone', 'walk_in', 'agent', 'other')),
  check_in_at timestamptz not null,
  check_out_at timestamptz not null,
  adults integer not null default 1 check (adults > 0),
  children integer not null default 0 check (children >= 0),
  notes text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out_at > check_in_at)
);

create index rental_short_term_bookings_unit_calendar_idx
  on public.rental_short_term_bookings (unit_id, check_in_at, check_out_at)
  where status in ('provisional', 'confirmed', 'checked_in');

create index rental_short_term_bookings_org_status_check_in_idx
  on public.rental_short_term_bookings (organisation_id, status, check_in_at desc);

create index rental_short_term_bookings_branch_id_idx
  on public.rental_short_term_bookings (branch_id);

create index rental_short_term_bookings_property_id_idx
  on public.rental_short_term_bookings (property_id);

create index rental_short_term_bookings_created_by_idx
  on public.rental_short_term_bookings (created_by);

create or replace function public.rental_short_term_booking_validate_scope()
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
    raise exception 'Short-Term booking scope must match its unit';
  end if;

  return new;
end;
$$;

create or replace function public.rental_short_term_booking_sync_occupancy_block()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_block_status text;
begin
  v_block_status := case new.status
    when 'provisional' then 'held'
    when 'confirmed' then 'confirmed'
    when 'checked_in' then 'active'
    when 'checked_out' then 'released'
    else 'cancelled'
  end;

  insert into public.rental_unit_occupancy_blocks (
    organisation_id, branch_id, property_id, unit_id,
    source_type, source_id, status, starts_at, ends_at, note, metadata, created_by
  ) values (
    new.organisation_id, new.branch_id, new.property_id, new.unit_id,
    'booking', new.id, v_block_status, new.check_in_at, new.check_out_at, new.notes,
    jsonb_build_object('booking_status', new.status), new.created_by
  )
  on conflict (source_type, source_id) do update
    set organisation_id = excluded.organisation_id,
        branch_id = excluded.branch_id,
        property_id = excluded.property_id,
        unit_id = excluded.unit_id,
        status = excluded.status,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        note = excluded.note,
        metadata = excluded.metadata;

  return new;
end;
$$;

create trigger rental_short_term_bookings_validate_scope
before insert or update on public.rental_short_term_bookings
for each row execute function public.rental_short_term_booking_validate_scope();

create trigger rental_short_term_bookings_set_updated_at
before update on public.rental_short_term_bookings
for each row execute function public.rental_set_updated_at();

create trigger rental_short_term_bookings_sync_occupancy_block
after insert or update of unit_id, status, check_in_at, check_out_at, notes on public.rental_short_term_bookings
for each row execute function public.rental_short_term_booking_sync_occupancy_block();

alter table public.rental_short_term_bookings enable row level security;
revoke all on public.rental_short_term_bookings from anon;
grant select, insert, update on public.rental_short_term_bookings to authenticated;

create policy rental_short_term_bookings_select_scoped
on public.rental_short_term_bookings
for select to authenticated
using (
  exists (
    select 1 from public.rental_properties property
    where property.id = rental_short_term_bookings.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);

create policy rental_short_term_bookings_insert_scoped
on public.rental_short_term_bookings
for insert to authenticated
with check (
  exists (
    select 1 from public.rental_properties property
    where property.id = rental_short_term_bookings.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (public.bridge_is_org_admin(property.organisation_id)
        or property.assigned_manager_id = (select auth.uid())
        or property.created_by = (select auth.uid()))
  )
);

create policy rental_short_term_bookings_update_scoped
on public.rental_short_term_bookings
for update to authenticated
using (
  exists (
    select 1 from public.rental_properties property
    where property.id = rental_short_term_bookings.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (public.bridge_is_org_admin(property.organisation_id)
        or property.assigned_manager_id = (select auth.uid())
        or property.created_by = (select auth.uid()))
  )
)
with check (
  exists (
    select 1 from public.rental_properties property
    where property.id = rental_short_term_bookings.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (public.bridge_is_org_admin(property.organisation_id)
        or property.assigned_manager_id = (select auth.uid())
        or property.created_by = (select auth.uid()))
  )
);
