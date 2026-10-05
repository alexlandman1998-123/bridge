begin;

alter table public.appointments
  add column if not exists scheduling_owner_user_id uuid references public.profiles(id) on delete set null;
alter table public.appointment_participants
  add column if not exists is_scheduling_owner boolean not null default false;
create unique index if not exists appointment_participants_scheduling_owner_idx
  on public.appointment_participants (appointment_id) where is_scheduling_owner;
create index if not exists appointment_participants_user_appointment_idx
  on public.appointment_participants (user_id, appointment_id) where user_id is not null;
create index if not exists appointments_scheduling_date_idx on public.appointments (date_time, appointment_id);

create schema if not exists private;

-- These private lookups deliberately read busy appointments across organisation
-- boundaries. They return no appointment or participant details to the caller.
create or replace function private.attorney_calendar_can_manage(p_appointment_id uuid, p_owner_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.appointments a
    join public.attorney_firm_members actor on actor.user_id = auth.uid() and actor.status = 'active'
    join public.attorney_firms actor_firm on actor_firm.id = actor.firm_id
    where a.appointment_id = p_appointment_id
      and actor.role in ('firm_admin', 'director_partner', 'transfer_attorney', 'bond_attorney', 'conveyancing_secretary', 'reception_scheduling')
      and public.bridge_can_write_appointment_payload(a.transaction_id, a.organisation_id, a.created_by, a.agent_id)
      and ((a.transaction_id is null and a.organisation_id = actor_firm.organisation_id) or exists (
        select 1 from public.transaction_attorney_assignments ta
        where ta.transaction_id = a.transaction_id
          and coalesce(ta.attorney_firm_id, ta.firm_id) = actor.firm_id
          and coalesce(ta.assignment_status, ta.status, 'active') = 'active'
          and coalesce(ta.can_manage_signing, true)
      ))
      and (p_owner_id is null or exists (
        select 1 from public.attorney_firm_members target
        where target.user_id = p_owner_id and target.firm_id = actor.firm_id and target.status = 'active'
      ))
  );
$$;
revoke all on function private.attorney_calendar_can_manage(uuid, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.attorney_calendar_can_manage(uuid, uuid) to authenticated;

create or replace function private.check_attorney_calendar_slot(p_appointment public.appointments)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_start timestamptz := coalesce(p_appointment.date_time,
    (p_appointment.appointment_date + p_appointment.start_time) at time zone 'Africa/Johannesburg');
  v_end timestamptz := coalesce(
    (p_appointment.appointment_date + p_appointment.end_time) at time zone 'Africa/Johannesburg',
    v_start + interval '45 minutes');
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
  if v_start is null or v_end <= v_start then raise exception 'Appointment end time must be after its start time'; end if;
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
      and coalesce(other.date_time, (other.appointment_date + other.start_time) at time zone 'Africa/Johannesburg') < v_end
      and coalesce((other.appointment_date + other.end_time) at time zone 'Africa/Johannesburg', other.date_time + interval '45 minutes') > v_start
  ) then raise exception using errcode = '23P01', message = 'The boardroom is already booked at this time'; end if;

  if exists (
    with candidate_people as (
      select ap.user_id, nullif(lower(trim(ap.email)), '') as email
      from public.appointment_participants ap where ap.appointment_id = p_appointment.appointment_id
        and lower(ap.rsvp_status) <> 'declined'
      union select p_appointment.scheduling_owner_user_id, null::text
    ), busy_people as (
      select a.appointment_id, a.date_time, a.appointment_date, a.start_time, a.end_time, ap.user_id, nullif(lower(trim(ap.email)), '') as email
      from public.appointments a join public.appointment_participants ap using (appointment_id)
      where lower(a.status) not in ('cancelled', 'canceled', 'completed', 'declined', 'no_show') and lower(ap.rsvp_status) <> 'declined'
      union all
      select a.appointment_id, a.date_time, a.appointment_date, a.start_time, a.end_time, a.scheduling_owner_user_id, null::text
      from public.appointments a where lower(a.status) not in ('cancelled', 'canceled', 'completed', 'declined', 'no_show')
    )
    select 1 from candidate_people c join busy_people b
      on (c.user_id is not null and c.user_id = b.user_id) or (c.email is not null and c.email = b.email)
    where b.appointment_id <> p_appointment.appointment_id
      and coalesce(b.date_time, (b.appointment_date + b.start_time) at time zone 'Africa/Johannesburg') < v_end
      and coalesce((b.appointment_date + b.end_time) at time zone 'Africa/Johannesburg', b.date_time + interval '45 minutes') > v_start
  ) then raise exception using errcode = '23P01', message = 'A participant or scheduling owner is already booked at this time'; end if;
end;
$$;
revoke all on function private.check_attorney_calendar_slot(public.appointments) from public, anon, authenticated;

-- Guard existing reschedule RPCs and direct room/time writes as well as the new
-- management command. Shared room bookings take the same lock so an agency and
-- an attorney cannot both claim the room in simultaneous saves.
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
    if (new.status, new.date_time, new.appointment_date, new.start_time, new.end_time)
      is not distinct from (old.status, old.date_time, old.appointment_date, old.start_time, old.end_time)
      and (new.resource_id is not distinct from old.resource_id or
        (new.resource_id is null and not exists (select 1 from public.appointment_resources r where r.id = old.resource_id)))
      and (new.scheduling_owner_user_id is not distinct from old.scheduling_owner_user_id or
        (new.scheduling_owner_user_id is null and not exists (select 1 from public.profiles p where p.id = old.scheduling_owner_user_id))) then return new; end if;
    if (new.status, new.date_time, new.appointment_date, new.start_time, new.end_time, new.resource_id, new.scheduling_owner_user_id)
      is distinct from (old.status, old.date_time, old.appointment_date, old.start_time, old.end_time, old.resource_id, old.scheduling_owner_user_id) then
      raise exception 'Closed appointments cannot be changed';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' or (new.date_time, new.appointment_date, new.start_time, new.end_time, new.resource_id, new.scheduling_owner_user_id)
    is distinct from (old.date_time, old.appointment_date, old.start_time, old.end_time, old.resource_id, old.scheduling_owner_user_id) then
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
create trigger attorney_calendar_appointment_guard before insert or update on public.appointments
  for each row execute function private.guard_attorney_calendar_appointment();

create or replace function private.guard_attorney_calendar_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_appointment public.appointments;
begin
  select a.* into v_appointment from public.appointments a where a.appointment_id = new.appointment_id;
  if tg_op = 'UPDATE' and new.user_id is null and old.user_id is not null
    and (new.appointment_id, new.email, new.is_scheduling_owner) is not distinct from (old.appointment_id, old.email, old.is_scheduling_owner)
    and not exists (select 1 from public.profiles p where p.id = old.user_id) then return new; end if;
  if exists (select 1 from public.attorney_firm_members m where m.user_id = v_appointment.created_by and m.status = 'active')
     or v_appointment.scheduling_owner_user_id is not null or exists (
       select 1 from public.attorney_firm_members m join public.profiles p on p.id = m.user_id
       where m.status = 'active' and (m.user_id = new.user_id or lower(trim(p.email)) = lower(trim(new.email)))
     ) or exists (
       select 1 from public.transaction_attorney_assignments ta where ta.transaction_id = v_appointment.transaction_id
         and coalesce(ta.assignment_status, ta.status, 'active') = 'active'
     ) then
    if tg_op = 'INSERT' or (new.appointment_id, new.user_id, new.email, new.is_scheduling_owner)
      is distinct from (old.appointment_id, old.user_id, old.email, old.is_scheduling_owner)
      or (lower(old.rsvp_status) = 'declined' and lower(new.rsvp_status) <> 'declined') then
      if lower(v_appointment.status) in ('completed', 'cancelled', 'canceled', 'declined', 'no_show') then
        raise exception 'Closed appointments cannot be changed';
      end if;
      if new.is_scheduling_owner and new.user_id is distinct from v_appointment.scheduling_owner_user_id then
        raise exception 'Scheduling owner identity does not match the appointment';
      end if;
      perform private.check_attorney_calendar_slot(v_appointment);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_attorney_calendar_participant() from public, anon, authenticated;
create trigger attorney_calendar_participant_guard after insert or update on public.appointment_participants
  for each row execute function private.guard_attorney_calendar_participant();

create or replace function private.guard_attorney_calendar_reschedule()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_appointment public.appointments;
begin
  select a.* into v_appointment from public.appointments a where a.appointment_id = new.appointment_id;
  if not (v_appointment.scheduling_owner_user_id is not null or exists (
    select 1 from public.attorney_firm_members m where m.user_id = v_appointment.created_by and m.status = 'active'
  ) or exists (select 1 from public.transaction_attorney_assignments ta where ta.transaction_id = v_appointment.transaction_id
    and coalesce(ta.assignment_status, ta.status, 'active') = 'active')) then return new; end if;
  if (new.status, new.preferred_start, new.preferred_end) is not distinct from (old.status, old.preferred_start, old.preferred_end) then return new; end if;
  if new.status not in ('proposed', 'accepted', 'rejected') then return new; end if;
  if current_setting('role') <> 'service_role' and not private.attorney_calendar_can_manage(new.appointment_id) then raise exception 'Not authorised to coordinate this appointment'; end if;
  if lower(v_appointment.status) in ('cancelled', 'completed', 'declined', 'no_show') then raise exception 'Closed appointments cannot be changed'; end if;
  if new.status = 'proposed' then
    v_appointment.date_time := new.preferred_start;
    v_appointment.appointment_date := (new.preferred_start at time zone 'Africa/Johannesburg')::date;
    v_appointment.start_time := (new.preferred_start at time zone 'Africa/Johannesburg')::time;
    v_appointment.end_time := (coalesce(new.preferred_end, new.preferred_start + interval '45 minutes') at time zone 'Africa/Johannesburg')::time;
    perform private.check_attorney_calendar_slot(v_appointment);
  end if;
  return new;
end;
$$;
revoke all on function private.guard_attorney_calendar_reschedule() from public, anon, authenticated;
create trigger attorney_calendar_reschedule_guard before update on public.appointment_reschedule_requests
  for each row execute function private.guard_attorney_calendar_reschedule();

-- A background scheduler may finish after cancellation/completion has saved.
-- It must not recreate pending work for a closed appointment.
create or replace function private.guard_attorney_calendar_reminder()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_appointment public.appointments;
begin
  if new.status <> 'pending' then return new; end if;
  if auth.uid() is null and current_setting('role') not in ('service_role', 'none') then raise exception 'Not authorised to schedule reminders'; end if;
  if auth.uid() is not null and not public.bridge_can_access_appointment(new.appointment_id) then raise exception 'Not authorised to schedule reminders'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling', 0));
  select a.* into v_appointment from public.appointments a where a.appointment_id = new.appointment_id;
  if lower(v_appointment.status) in ('completed', 'cancelled', 'canceled', 'declined', 'no_show') then new.status := 'cancelled'; end if;
  return new;
end;
$$;
revoke all on function private.guard_attorney_calendar_reminder() from public, anon, authenticated;
create trigger attorney_calendar_reminder_guard before insert or update on public.appointment_reminders
  for each row execute function private.guard_attorney_calendar_reminder();

create or replace function public.manage_attorney_appointment(
  p_appointment_id uuid, p_action text, p_expected_updated_at timestamptz, p_changes jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_appointment public.appointments;
  v_owner uuid;
  v_profile public.profiles;
  v_resource uuid;
  v_resource_name text;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if not private.attorney_calendar_can_manage(p_appointment_id) then raise exception 'Not authorised to manage this appointment'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling', 0));
  select a.* into v_appointment from public.appointments a where a.appointment_id = p_appointment_id for update;
  if not found then raise exception 'Appointment could not be loaded'; end if;
  if p_expected_updated_at is null or v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'This appointment has changed. Refresh the calendar before saving';
  end if;
  if lower(v_appointment.status) in ('completed', 'cancelled', 'canceled', 'declined', 'no_show') then raise exception 'Closed appointments cannot be changed'; end if;
  if p_action = 'edit' then
    v_start := (p_changes->>'start')::timestamptz;
    v_end := (p_changes->>'end')::timestamptz;
    if v_start is null or v_end is null or v_start <= v_now or v_end <= v_start
      or (v_start at time zone 'Africa/Johannesburg')::date <> (v_end at time zone 'Africa/Johannesburg')::date then
      raise exception 'Choose a future start and end time on the same day';
    end if;
    if not v_appointment.allow_outside_business_hours and (
      extract(isodow from v_start at time zone 'Africa/Johannesburg') > 5
      or (v_start at time zone 'Africa/Johannesburg')::time < time '08:00'
      or (v_end at time zone 'Africa/Johannesburg')::time > time '17:00'
    ) then raise exception 'Choose a weekday appointment between 08:00 and 17:00 SAST'; end if;
    update public.appointments set date_time = v_start,
      appointment_date = (v_start at time zone 'Africa/Johannesburg')::date,
      start_time = (v_start at time zone 'Africa/Johannesburg')::time,
      end_time = (v_end at time zone 'Africa/Johannesburg')::time,
      status = 'Pending Confirmation', confirmed_at = null,
      external_calendar_status = 'not_synced', ics_generated_at = null, updated_at = v_now
    where appointment_id = p_appointment_id;
    update public.appointment_participants set rsvp_status = 'Pending', rsvp_token = gen_random_uuid()::text,
      rsvp_expires_at = v_start, rsvp_revoked_at = null, responded_at = null,
      proposed_new_time = null, updated_at = v_now
    where appointment_id = p_appointment_id and not is_scheduling_owner and lower(participant_role) <> 'attorney';
  elsif p_action = 'resource' then
    v_resource := nullif(p_changes->>'resourceId', '')::uuid;
    if v_resource is not null then
      select r.resource_name into v_resource_name from public.appointment_resources r where r.id = v_resource and r.is_active;
      if not found then raise exception 'Boardroom could not be loaded'; end if;
    end if;
    update public.appointments set resource_id = v_resource,
      location_type = case when v_resource is not null then 'physical_address' when resource_id is not null then 'to_be_confirmed' else location_type end,
      location = case when v_resource is not null then v_resource_name when resource_id is not null then null else location end,
      meeting_url = case when v_resource is not null or resource_id is not null then null else meeting_url end,
      external_calendar_status = 'not_synced', ics_generated_at = null, updated_at = v_now where appointment_id = p_appointment_id;
  elsif p_action = 'owner' then
    v_owner := nullif(p_changes->>'userId', '')::uuid;
    if not private.attorney_calendar_can_manage(p_appointment_id, v_owner) then
      raise exception 'Choose an active staff member from the assigned attorney firm';
    end if;
    if v_owner is not null then
      select p.* into v_profile from public.profiles p where p.id = v_owner;
      if not found then raise exception 'Staff profile could not be loaded'; end if;
    end if;
    delete from public.appointment_participants where appointment_id = p_appointment_id and is_scheduling_owner;
    update public.appointments set scheduling_owner_user_id = v_owner, updated_at = v_now where appointment_id = p_appointment_id;
    if v_owner is not null then
      insert into public.appointment_participants (appointment_id, organisation_id, user_id, name, email, participant_role, is_scheduling_owner, rsvp_status)
      values (p_appointment_id, v_appointment.organisation_id, v_owner,
        coalesce(nullif(trim(v_profile.full_name), ''), nullif(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), ''), v_profile.email, 'Assigned Staff'),
        nullif(lower(trim(v_profile.email)), ''), 'Other Contact', true, 'Accepted');
    end if;
  elsif p_action in ('cancel', 'complete') then
    if p_action = 'cancel' and nullif(trim(p_changes->>'reason'), '') is null then raise exception 'A cancellation reason is required'; end if;
    update public.appointments set
      status = case when p_action = 'cancel' then 'Cancelled' else 'Completed' end,
      cancelled_at = case when p_action = 'cancel' then v_now else cancelled_at end,
      cancelled_by = case when p_action = 'cancel' then auth.uid() else cancelled_by end,
      cancellation_reason = case when p_action = 'cancel' then trim(p_changes->>'reason') else cancellation_reason end,
      completed_at = case when p_action = 'complete' then v_now else completed_at end,
      external_calendar_status = 'not_synced', ics_generated_at = null, updated_at = v_now
    where appointment_id = p_appointment_id;
    update public.appointment_participants set rsvp_revoked_at = v_now, updated_at = v_now where appointment_id = p_appointment_id;
  else raise exception 'Unknown appointment management action'; end if;

  if p_action in ('edit', 'cancel', 'complete') then
    update public.appointment_reschedule_requests set status = 'cancelled', reviewed_by = auth.uid(), reviewed_at = v_now, updated_at = v_now
      where appointment_id = p_appointment_id and status in ('pending', 'proposed');
    update public.appointment_reminders set status = 'cancelled', updated_at = v_now
      where appointment_id = p_appointment_id and status = 'pending';
  end if;
  select a.* into v_appointment from public.appointments a where a.appointment_id = p_appointment_id;
  return jsonb_build_object('appointment', to_jsonb(v_appointment), 'participants', coalesce((
    select jsonb_agg(to_jsonb(ap) - 'rsvp_token') from public.appointment_participants ap where ap.appointment_id = p_appointment_id
  ), '[]'::jsonb), 'reschedule_requests', coalesce((
    select jsonb_agg(to_jsonb(rr) order by rr.created_at desc) from public.appointment_reschedule_requests rr
      where rr.appointment_id = p_appointment_id and rr.status in ('pending', 'proposed')
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.manage_attorney_appointment(uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function public.manage_attorney_appointment(uuid, text, timestamptz, jsonb) to authenticated;

commit;
