-- Phase 4: stay execution and the post-stay turnover queue.
alter table public.rental_short_term_bookings
  add column checked_in_at timestamptz,
  add column checked_out_at timestamptz;

create table public.rental_short_term_turnovers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  unit_id uuid not null references public.rental_units(id) on delete cascade,
  booking_id uuid not null unique references public.rental_short_term_bookings(id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'in_progress', 'ready', 'blocked')),
  due_at timestamptz not null,
  completed_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= created_at)
);

create index rental_short_term_turnovers_org_status_due_idx
  on public.rental_short_term_turnovers (organisation_id, status, due_at);

create index rental_short_term_turnovers_branch_id_idx
  on public.rental_short_term_turnovers (branch_id);

create index rental_short_term_turnovers_property_id_idx
  on public.rental_short_term_turnovers (property_id);

create index rental_short_term_turnovers_unit_id_idx
  on public.rental_short_term_turnovers (unit_id);

create index rental_short_term_turnovers_created_by_idx
  on public.rental_short_term_turnovers (created_by);

create or replace function public.rental_short_term_booking_enforce_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'enquiry' and new.status in ('provisional', 'cancelled'))
      or (old.status = 'provisional' and new.status in ('confirmed', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('checked_in', 'cancelled'))
      or (old.status = 'checked_in' and new.status = 'checked_out')
    ) then
      raise exception 'Invalid Short-Term booking status transition: % to %', old.status, new.status;
    end if;

    if new.status = 'checked_in' then
      new.checked_in_at := coalesce(new.checked_in_at, now());
    elsif new.status = 'checked_out' then
      new.checked_out_at := coalesce(new.checked_out_at, now());
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.rental_short_term_turnover_validate_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_booking record;
begin
  select organisation_id, property_id, unit_id, branch_id
    into v_booking
    from public.rental_short_term_bookings
   where id = new.booking_id;

  if not found then
    raise exception 'Short-Term booking does not exist';
  end if;

  if new.organisation_id is distinct from v_booking.organisation_id
    or new.property_id is distinct from v_booking.property_id
    or new.unit_id is distinct from v_booking.unit_id
    or new.branch_id is distinct from v_booking.branch_id then
    raise exception 'Short-Term turnover scope must match its booking';
  end if;

  if new.status = 'ready' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'ready' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.rental_short_term_booking_create_turnover()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    insert into public.rental_short_term_turnovers (
      organisation_id, branch_id, property_id, unit_id, booking_id, due_at, notes, created_by
    ) values (
      new.organisation_id, new.branch_id, new.property_id, new.unit_id, new.id, new.check_out_at, new.notes, new.created_by
    ) on conflict (booking_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger rental_short_term_bookings_enforce_lifecycle
before update on public.rental_short_term_bookings
for each row execute function public.rental_short_term_booking_enforce_lifecycle();

create trigger rental_short_term_bookings_create_turnover
after update of status on public.rental_short_term_bookings
for each row execute function public.rental_short_term_booking_create_turnover();

create trigger rental_short_term_turnovers_validate_scope
before insert or update on public.rental_short_term_turnovers
for each row execute function public.rental_short_term_turnover_validate_scope();

create trigger rental_short_term_turnovers_set_updated_at
before update on public.rental_short_term_turnovers
for each row execute function public.rental_set_updated_at();

alter table public.rental_short_term_turnovers enable row level security;
revoke all on public.rental_short_term_turnovers from anon;
grant select, insert, update on public.rental_short_term_turnovers to authenticated;

create policy rental_short_term_turnovers_select_scoped
on public.rental_short_term_turnovers
for select to authenticated
using (
  exists (
    select 1 from public.rental_properties property
    where property.id = rental_short_term_turnovers.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);

create policy rental_short_term_turnovers_insert_scoped
on public.rental_short_term_turnovers
for insert to authenticated
with check (
  exists (
    select 1 from public.rental_properties property
    where property.id = rental_short_term_turnovers.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (public.bridge_is_org_admin(property.organisation_id)
        or property.assigned_manager_id = (select auth.uid())
        or property.created_by = (select auth.uid()))
  )
);

create policy rental_short_term_turnovers_update_scoped
on public.rental_short_term_turnovers
for update to authenticated
using (
  exists (
    select 1 from public.rental_properties property
    where property.id = rental_short_term_turnovers.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (public.bridge_is_org_admin(property.organisation_id)
        or property.assigned_manager_id = (select auth.uid())
        or property.created_by = (select auth.uid()))
  )
)
with check (
  exists (
    select 1 from public.rental_properties property
    where property.id = rental_short_term_turnovers.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
      and (public.bridge_is_org_admin(property.organisation_id)
        or property.assigned_manager_id = (select auth.uid())
        or property.created_by = (select auth.uid()))
  )
);
