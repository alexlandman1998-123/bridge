-- Rentals Phase 34: an atomic, idempotent tenancy activation command.
-- This migration is intentionally isolated from all Sales/listing tables.
begin;

create table if not exists public.rental_tenancy_activation_events (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique references public.rental_tenancies(id) on delete cascade,
  lease_id uuid not null references public.rental_leases(id) on delete restrict,
  unit_id uuid not null references public.rental_units(id) on delete restrict,
  vacancy_id uuid not null references public.rental_vacancies(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  activated_by uuid not null references auth.users(id) on delete restrict,
  activated_at timestamptz not null default now(),
  result_json jsonb not null default '{}'::jsonb
);
create index if not exists rental_tenancy_activation_events_org_activated_idx
  on public.rental_tenancy_activation_events(organisation_id, activated_at desc);

alter table public.rental_tenancy_activation_events enable row level security;
revoke all on public.rental_tenancy_activation_events from anon, authenticated;
grant select on public.rental_tenancy_activation_events to authenticated;
create policy rental_tenancy_activation_events_staff_read
  on public.rental_tenancy_activation_events for select to authenticated using (
    exists (
      select 1
      from public.rental_tenancies tenancy
      join public.rental_properties property on property.id = tenancy.property_id
      where tenancy.id = tenancy_id
        and public.rental_branch_access(property.organisation_id, property.branch_id)
    )
  );

-- A vacancy may be closed as part of the privileged tenancy command only. This
-- preserves the ordinary marketing lifecycle for browser-originated updates.
create or replace function public.rental_vacancy_validate_scope_and_transition()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare unit_org uuid; unit_property uuid; unit_branch uuid; ready boolean;
begin
  select organisation_id, property_id, branch_id into unit_org, unit_property, unit_branch
  from public.rental_units where id = new.unit_id;
  if unit_org is null or unit_org <> new.organisation_id or unit_property <> new.property_id then
    raise exception 'Rental vacancy must match its unit property and organisation';
  end if;
  if new.branch_id is null then new.branch_id := unit_branch; end if;
  if unit_branch is not null and new.branch_id is distinct from unit_branch then
    raise exception 'Rental vacancy branch must match its unit';
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null and new.status <> 'draft' then
    raise exception 'Browser clients may only create a draft rental vacancy';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'let' and coalesce(current_setting('app.rental_tenancy_command', true), 'off') <> 'on' then
      raise exception 'Closing a rental vacancy requires the tenancy activation command';
    end if;
    if coalesce(current_setting('app.rental_tenancy_command', true), 'off') <> 'on' and not (
      (old.status = 'draft' and new.status in ('preparing', 'withdrawn')) or
      (old.status = 'preparing' and new.status in ('draft', 'marketing', 'withdrawn')) or
      (old.status = 'marketing' and new.status in ('applications_open', 'paused', 'withdrawn')) or
      (old.status = 'applications_open' and new.status in ('paused', 'let', 'withdrawn')) or
      (old.status = 'paused' and new.status in ('preparing', 'marketing', 'applications_open', 'withdrawn'))
    ) then
      raise exception 'Invalid rental vacancy transition';
    end if;
  end if;
  if new.status = 'marketing' then
    select marketing_ready into ready from public.rental_property_marketing_readiness where property_id = new.property_id;
    if coalesce(ready, false) is not true then
      raise exception 'Rental vacancy cannot enter marketing until landlord and mandate readiness is confirmed';
    end if;
  end if;
  return new;
end; $$;

create or replace function public.rental_activate_tenancy(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  tenancy_row public.rental_tenancies%rowtype;
  lease_row public.rental_leases%rowtype;
  unit_row public.rental_units%rowtype;
  vacancy_row public.rental_vacancies%rowtype;
  lease_version_row public.rental_lease_versions%rowtype;
  activation_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;

  select tenancy.* into tenancy_row
  from public.rental_tenancies tenancy
  where tenancy.id = p_tenancy_id
  for update;
  if not found then raise exception 'Tenancy not found'; end if;
  if not exists (
    select 1 from public.rental_properties property
    where property.id = tenancy_row.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  ) then
    raise exception 'You are not authorized for this tenancy';
  end if;

  select lease.* into lease_row from public.rental_leases lease
  where lease.tenancy_id = tenancy_row.id for update;
  if not found then raise exception 'Tenancy has no lease'; end if;

  select unit.* into unit_row from public.rental_units unit
  where unit.id = tenancy_row.unit_id for update;
  if not found or unit_row.organisation_id <> tenancy_row.organisation_id then
    raise exception 'Tenancy unit is invalid';
  end if;

  if tenancy_row.status = 'active' then
    if lease_row.status <> 'active' or unit_row.status <> 'occupied' or unit_row.active_tenancy_id is distinct from tenancy_row.id then
      raise exception 'Active tenancy projection is inconsistent; resolve it before retrying';
    end if;
    select id into activation_event_id from public.rental_tenancy_activation_events
    where tenancy_id = tenancy_row.id;
    return jsonb_build_object(
      'tenancy_id', tenancy_row.id,
      'lease_id', lease_row.id,
      'unit_id', unit_row.id,
      'activation_event_id', activation_event_id,
      'status', 'active',
      'idempotent', true
    );
  end if;

  if tenancy_row.status not in ('draft', 'move_in_pending') then
    raise exception 'Only a draft or move-in-pending tenancy can be activated';
  end if;
  if lease_row.status <> 'signed' then raise exception 'A fully signed lease is required before activation'; end if;

  select version.* into lease_version_row from public.rental_lease_versions version
  where version.lease_id = lease_row.id and version.is_current for update;
  if not found or lease_version_row.status <> 'draft' then
    raise exception 'A current signed lease version is required before activation';
  end if;

  perform public.rental_assert_tenancy_activation_ready(tenancy_row.id);
  perform public.rental_assert_tenancy_move_in_complete(tenancy_row.id);

  -- The vacancy is resolved through the source application so there is no
  -- duplicate, editable vacancy reference on the tenancy aggregate.
  select vacancy.* into vacancy_row
  from public.rental_vacancies vacancy
  join public.rental_applications application on application.vacancy_id = vacancy.id
  where application.id = tenancy_row.source_application_id
  for update;
  if not found or vacancy_row.unit_id <> tenancy_row.unit_id or vacancy_row.organisation_id <> tenancy_row.organisation_id then
    raise exception 'Tenancy source vacancy is invalid';
  end if;

  if unit_row.active_tenancy_id is not null and unit_row.active_tenancy_id <> tenancy_row.id then
    raise exception 'This rental unit already has another active tenancy';
  end if;
  if unit_row.status <> 'lease_pending' then
    raise exception 'This rental unit is not awaiting tenancy activation';
  end if;
  if vacancy_row.status in ('withdrawn', 'let') then
    raise exception 'The source vacancy is no longer available for activation';
  end if;

  perform set_config('app.rental_tenancy_command', 'on', true);
  update public.rental_units
  set status = 'occupied', active_tenancy_id = tenancy_row.id
  where id = unit_row.id;
  update public.rental_tenancies set status = 'active' where id = tenancy_row.id;
  update public.rental_leases set status = 'active' where id = lease_row.id;
  update public.rental_lease_versions set status = 'active' where id = lease_version_row.id;
  update public.rental_vacancies set status = 'let' where id = vacancy_row.id;
  update public.rental_vacancy_marketing
  set status = 'archived'
  where vacancy_id = vacancy_row.id and status <> 'archived';

  insert into public.rental_tenancy_activation_events(
    tenancy_id, lease_id, unit_id, vacancy_id, organisation_id, activated_by, result_json
  ) values (
    tenancy_row.id, lease_row.id, unit_row.id, vacancy_row.id, tenancy_row.organisation_id, auth.uid(),
    jsonb_build_object('vacancy_status', 'let', 'unit_status', 'occupied', 'lease_status', 'active')
  ) returning id into activation_event_id;

  return jsonb_build_object(
    'tenancy_id', tenancy_row.id,
    'lease_id', lease_row.id,
    'unit_id', unit_row.id,
    'vacancy_id', vacancy_row.id,
    'activation_event_id', activation_event_id,
    'status', 'active',
    'idempotent', false
  );
end; $$;

revoke execute on function public.rental_activate_tenancy(uuid) from public, anon;
grant execute on function public.rental_activate_tenancy(uuid) to authenticated;

commit;
