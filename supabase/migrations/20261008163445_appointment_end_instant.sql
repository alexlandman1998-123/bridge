-- Preserve an explicit end instant through repeated daylight-saving clock hours.
-- Historical rows remain NULL; no guessed backfill or access-policy change.
begin;

create schema if not exists private;
alter table public.appointments add column end_date_time timestamptz;
alter table public.appointments add constraint appointments_end_after_start
  check (end_date_time is null or end_date_time > date_time);

-- The existing table-returning reader cannot gain a column without breaking its
-- dependants. Wrap its authorised rows rather than duplicating permission rules.
create function public.bridge_list_calendar_appointments_with_times(
  p_organisation_id uuid,
  p_include_all boolean default false,
  p_listing_id text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(
    to_jsonb(a) || jsonb_build_object('end_date_time', stored.end_date_time)
    order by a.date_time asc nulls last, a.created_at desc
  ), '[]'::jsonb)
  from public.bridge_list_calendar_appointments(p_organisation_id, p_include_all, p_listing_id, p_from, p_to) a
  join public.appointments stored
    on stored.appointment_id = a.appointment_id and stored.organisation_id = a.organisation_id;
$$;
revoke all on function public.bridge_list_calendar_appointments_with_times(uuid,boolean,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.bridge_list_calendar_appointments_with_times(uuid,boolean,text,timestamptz,timestamptz) to authenticated;

create or replace function public.bridge_list_lead_appointments(
  p_organisation_id uuid, p_lead_id uuid, p_include_all boolean default false
)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(a.row order by a.position), '[]'::jsonb)
  from jsonb_array_elements(public.bridge_list_calendar_appointments_with_times(
    p_organisation_id, p_include_all, null, null, null
  )) with ordinality a(row, position)
  where a.row->>'lead_id' = p_lead_id::text
    or (a.row->>'related_entity_type' = 'lead' and a.row->>'related_entity_id' = p_lead_id::text);
$$;
revoke all on function public.bridge_list_lead_appointments(uuid,uuid,boolean) from public, anon;
grant execute on function public.bridge_list_lead_appointments(uuid,uuid,boolean) to authenticated;

-- Older appointment writers do not know about the new column. If their clock
-- edit invalidates an inherited end instant, clear it for tolerant readers to
-- derive again. Never guess a historical backfill.
create function private.invalidate_appointment_end_instant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.end_date_time is not null and new.end_date_time is not distinct from old.end_date_time
    and (new.date_time, new.appointment_date, new.start_time, new.end_time, new.timezone, new.all_day)
      is distinct from (old.date_time, old.appointment_date, old.start_time, old.end_time, old.timezone, old.all_day)
    and (
      new.end_date_time <= new.date_time
      or (new.all_day and (new.end_date_time at time zone coalesce(nullif(new.timezone, ''), 'Africa/Johannesburg'))
          is distinct from ((new.appointment_date + 1)::timestamp))
      or (not coalesce(new.all_day, false) and (new.end_date_time at time zone coalesce(nullif(new.timezone, ''), 'Africa/Johannesburg'))
          is distinct from (new.appointment_date + new.end_time))
    ) then
    new.end_date_time := null;
  end if;
  return new;
end;
$$;
revoke all on function private.invalidate_appointment_end_instant() from public, anon, authenticated;
create trigger appointment_end_instant_guard before update on public.appointments
  for each row execute function private.invalidate_appointment_end_instant();

-- Keep existing room/attorney permission and locking rules; use the same named
-- timezone and explicit end instant as the general calendar when checking time.
create or replace function private.check_attorney_calendar_slot(p_appointment public.appointments)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.uid() is null and current_setting('role') not in ('service_role', 'none') then
    raise exception 'Not authorised to schedule this appointment';
  end if;
  if auth.uid() is not null and not public.bridge_can_write_appointment_payload(
    p_appointment.transaction_id, p_appointment.organisation_id, p_appointment.created_by, p_appointment.agent_id) then
    raise exception 'Not authorised to schedule this appointment';
  end if;
  -- Short database-only critical section: no email or network work holds it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling', 0));
  if lower(p_appointment.status) in ('cancelled', 'canceled', 'completed', 'declined', 'no_show') then return; end if;
  v_start := coalesce(p_appointment.date_time,
    (p_appointment.appointment_date + p_appointment.start_time) at time zone coalesce(nullif(p_appointment.timezone, ''), 'Africa/Johannesburg'));
  v_end := coalesce(p_appointment.end_date_time,
    case when p_appointment.all_day then (p_appointment.appointment_date + 1)::timestamp at time zone coalesce(nullif(p_appointment.timezone, ''), 'Africa/Johannesburg') end,
    (p_appointment.appointment_date + p_appointment.end_time) at time zone coalesce(nullif(p_appointment.timezone, ''), 'Africa/Johannesburg'),
    v_start + interval '45 minutes');
  if v_start is null or v_end is null or v_end <= v_start then raise exception 'Appointment end time must be after its start time'; end if;
  if p_appointment.resource_id is not null and not exists (
    select 1 from public.appointment_resources r where r.id = p_appointment.resource_id
      and r.is_active and (r.organisation_id = p_appointment.organisation_id or exists (
        select 1 from public.transaction_attorney_assignments ta join public.attorney_firms f
          on f.id = coalesce(ta.attorney_firm_id, ta.firm_id)
        where ta.transaction_id = p_appointment.transaction_id and f.organisation_id = r.organisation_id
          and coalesce(ta.assignment_status, ta.status, 'active') = 'active'
      ))
  ) then raise exception 'Choose an active boardroom from this appointment organisation or assigned attorney firm'; end if;

  if exists (
    select 1 from public.appointments other
    where other.appointment_id <> p_appointment.appointment_id
      and lower(other.status) not in ('cancelled', 'canceled', 'completed', 'declined', 'no_show')
      and other.resource_id = p_appointment.resource_id
      and coalesce(other.date_time, (other.appointment_date + other.start_time) at time zone coalesce(nullif(other.timezone, ''), 'Africa/Johannesburg')) < v_end
      and coalesce(other.end_date_time, case when other.all_day then (other.appointment_date + 1)::timestamp at time zone coalesce(nullif(other.timezone, ''), 'Africa/Johannesburg') end, (other.appointment_date + other.end_time) at time zone coalesce(nullif(other.timezone, ''), 'Africa/Johannesburg'), other.date_time + interval '45 minutes') > v_start
  ) then raise exception using errcode = '23P01', message = 'The boardroom is already booked at this time'; end if;

  if exists (
    with candidate_people as (
      select ap.user_id, nullif(lower(trim(ap.email)), '') as email
      from public.appointment_participants ap where ap.appointment_id = p_appointment.appointment_id
        and lower(ap.rsvp_status) <> 'declined'
      union select p_appointment.scheduling_owner_user_id, null::text
    ), busy_people as (
      select a.appointment_id, a.date_time, a.appointment_date, a.start_time, a.end_time, a.end_date_time, a.timezone, a.all_day, ap.user_id, nullif(lower(trim(ap.email)), '') as email
      from public.appointments a join public.appointment_participants ap using (appointment_id)
      where lower(a.status) not in ('cancelled', 'canceled', 'completed', 'declined', 'no_show') and lower(ap.rsvp_status) <> 'declined'
      union all
      select a.appointment_id, a.date_time, a.appointment_date, a.start_time, a.end_time, a.end_date_time, a.timezone, a.all_day, a.scheduling_owner_user_id, null::text
      from public.appointments a where lower(a.status) not in ('cancelled', 'canceled', 'completed', 'declined', 'no_show')
    )
    select 1 from candidate_people c join busy_people b
      on (c.user_id is not null and c.user_id = b.user_id) or (c.email is not null and c.email = b.email)
    where b.appointment_id <> p_appointment.appointment_id
      and coalesce(b.date_time, (b.appointment_date + b.start_time) at time zone coalesce(nullif(b.timezone, ''), 'Africa/Johannesburg')) < v_end
      and coalesce(b.end_date_time, case when b.all_day then (b.appointment_date + 1)::timestamp at time zone coalesce(nullif(b.timezone, ''), 'Africa/Johannesburg') end, (b.appointment_date + b.end_time) at time zone coalesce(nullif(b.timezone, ''), 'Africa/Johannesburg'), b.date_time + interval '45 minutes') > v_start
  ) then raise exception using errcode = '23P01', message = 'A participant or scheduling owner is already booked at this time'; end if;
end;
$$;
revoke all on function private.check_attorney_calendar_slot(public.appointments) from public, anon, authenticated;

create or replace function private.guard_attorney_calendar_appointment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not (new.resource_id is not null or new.scheduling_owner_user_id is not null or exists (
    select 1 from public.attorney_firm_members m where m.user_id = new.created_by and m.status = 'active'
  ) or exists (
    select 1 from public.transaction_attorney_assignments ta where ta.transaction_id = new.transaction_id
      and coalesce(ta.assignment_status, ta.status, 'active') = 'active'
  ) or exists (
    select 1 from public.appointment_participants ap join public.profiles p
      on p.id = ap.user_id or lower(trim(p.email)) = lower(trim(ap.email))
      join public.attorney_firm_members m on m.user_id = p.id and m.status = 'active'
      where ap.appointment_id = new.appointment_id
  )) then return new; end if;
  if tg_op = 'UPDATE' and lower(old.status) in ('completed', 'cancelled', 'canceled', 'declined', 'no_show') then
    -- Preserve ON DELETE SET NULL cleanup without allowing a user to reopen or
    -- reassign a closed booking. Historical participant names/venues remain.
    if (new.status, new.date_time, new.appointment_date, new.start_time, new.end_time, new.end_date_time, new.timezone, new.all_day)
      is not distinct from (old.status, old.date_time, old.appointment_date, old.start_time, old.end_time, old.end_date_time, old.timezone, old.all_day)
      and (new.resource_id is not distinct from old.resource_id or
        (new.resource_id is null and not exists (select 1 from public.appointment_resources r where r.id = old.resource_id)))
      and (new.scheduling_owner_user_id is not distinct from old.scheduling_owner_user_id or
        (new.scheduling_owner_user_id is null and not exists (select 1 from public.profiles p where p.id = old.scheduling_owner_user_id))) then return new; end if;
    if (new.status, new.date_time, new.appointment_date, new.start_time, new.end_time, new.end_date_time, new.timezone, new.all_day, new.resource_id, new.scheduling_owner_user_id)
      is distinct from (old.status, old.date_time, old.appointment_date, old.start_time, old.end_time, old.end_date_time, old.timezone, old.all_day, old.resource_id, old.scheduling_owner_user_id) then
      raise exception 'Closed appointments cannot be changed';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' or (new.date_time, new.appointment_date, new.start_time, new.end_time, new.end_date_time, new.timezone, new.all_day, new.resource_id, new.scheduling_owner_user_id)
    is distinct from (old.date_time, old.appointment_date, old.start_time, old.end_time, old.end_date_time, old.timezone, old.all_day, old.resource_id, old.scheduling_owner_user_id) then
    if new.scheduling_owner_user_id is not null and (tg_op = 'INSERT' or new.scheduling_owner_user_id is distinct from old.scheduling_owner_user_id)
      and not private.attorney_calendar_can_manage(new.appointment_id, new.scheduling_owner_user_id) then
      raise exception 'Choose an active staff member from the assigned attorney firm';
    end if;
    perform private.check_attorney_calendar_slot(new);
  end if;
  return new;
end;
$$;
revoke all on function private.guard_attorney_calendar_appointment() from public, anon, authenticated;

commit;
