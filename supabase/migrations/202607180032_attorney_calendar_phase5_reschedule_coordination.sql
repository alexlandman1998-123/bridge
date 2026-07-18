-- Attorney calendar Phase 5: atomic reschedule coordination and resolution.

create index if not exists appointment_reschedule_requests_open_idx
  on public.appointment_reschedule_requests (appointment_id, updated_at desc)
  where status in ('pending', 'proposed');

drop function if exists public.propose_attorney_appointment_reschedule(uuid, timestamptz, timestamptz, text, jsonb);
create function public.propose_attorney_appointment_reschedule(
  p_request_id uuid,
  p_preferred_start timestamptz,
  p_preferred_end timestamptz default null,
  p_reason text default null,
  p_suggested_slots jsonb default '[]'::jsonb
)
returns table (
  request_id uuid,
  appointment_id uuid,
  request_status text,
  preferred_start timestamptz,
  preferred_end timestamptz,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.appointment_reschedule_requests%rowtype;
  v_now timestamptz := now();
begin
  if p_request_id is null then
    raise exception 'Reschedule request is required';
  end if;
  if p_preferred_start is null or p_preferred_start <= v_now then
    raise exception 'A future proposed start time is required';
  end if;
  if p_preferred_end is not null and p_preferred_end <= p_preferred_start then
    raise exception 'Proposed end time must be after the proposed start time';
  end if;
  if p_preferred_end is not null and
     (p_preferred_start at time zone 'Africa/Johannesburg')::date <>
     (p_preferred_end at time zone 'Africa/Johannesburg')::date then
    raise exception 'Proposed start and end times must be on the same day';
  end if;

  select rr.* into v_request
  from public.appointment_reschedule_requests rr
  where rr.id = p_request_id
  for update;

  if not found then
    raise exception 'Reschedule request was not found';
  end if;
  if auth.role() <> 'service_role' and not public.bridge_can_access_appointment(v_request.appointment_id) then
    raise exception 'Not authorised to coordinate this appointment';
  end if;
  if v_request.status not in ('pending', 'proposed') then
    raise exception 'This reschedule request is already closed';
  end if;

  perform 1 from public.appointments a
  where a.appointment_id = v_request.appointment_id
  for update;

  update public.appointment_reschedule_requests rr
  set
    preferred_start = p_preferred_start,
    preferred_end = p_preferred_end,
    reason = coalesce(nullif(trim(p_reason), ''), rr.reason),
    status = 'proposed',
    reviewed_by = auth.uid(),
    reviewed_at = v_now,
    suggested_slots = case
      when jsonb_typeof(coalesce(p_suggested_slots, '[]'::jsonb)) = 'array' then coalesce(p_suggested_slots, '[]'::jsonb)
      else '[]'::jsonb
    end,
    updated_at = v_now
  where rr.id = p_request_id;

  update public.appointments a
  set status = 'alternative_proposed', updated_at = v_now
  where a.appointment_id = v_request.appointment_id;

  if to_regclass('public.appointment_reminders') is not null then
    update public.appointment_reminders ar
    set status = 'cancelled', updated_at = v_now
    where ar.appointment_id = v_request.appointment_id and ar.status = 'pending';
  end if;

  if to_regclass('public.appointment_notification_events') is not null then
    insert into public.appointment_notification_events (
      appointment_id, transaction_id, event_type, recipient_id, recipient_role,
      visibility, title, message, email_status, in_app_status, metadata,
      dedupe_key, created_at, updated_at
    )
    select
      a.appointment_id, a.transaction_id, 'appointment_reschedule_proposed', null, 'participant',
      coalesce(a.visibility_scope, 'shared_role_players'), 'Appointment reschedule proposed',
      'A new appointment time has been proposed.', 'skipped', 'pending',
      jsonb_build_object(
        'source', 'attorney_calendar_phase5',
        'requestId', p_request_id,
        'preferredStart', p_preferred_start,
        'preferredEnd', p_preferred_end,
        'reason', p_reason
      ),
      a.appointment_id::text || '::reschedule::' || p_request_id::text || '::proposed::' ||
        replace(p_preferred_start::text, ' ', 'T') || '::' || replace(coalesce(p_preferred_end::text, ''), ' ', 'T'),
      v_now, v_now
    from public.appointments a
    where a.appointment_id = v_request.appointment_id
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return query
  select rr.id, rr.appointment_id, rr.status, rr.preferred_start, rr.preferred_end, rr.reviewed_at
  from public.appointment_reschedule_requests rr
  where rr.id = p_request_id;
end;
$$;

drop function if exists public.resolve_attorney_appointment_reschedule(uuid, text, timestamptz, timestamptz, text);
create function public.resolve_attorney_appointment_reschedule(
  p_request_id uuid,
  p_decision text,
  p_confirmed_start timestamptz default null,
  p_confirmed_end timestamptz default null,
  p_reason text default null
)
returns table (
  request_id uuid,
  appointment_id uuid,
  request_status text,
  appointment_status text,
  confirmed_start timestamptz,
  confirmed_end timestamptz,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.appointment_reschedule_requests%rowtype;
  v_appointment public.appointments%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz := now();
  v_event_type text;
  v_appointment_status text;
begin
  if v_decision not in ('accepted', 'rejected', 'cancelled') then
    raise exception 'Decision must be accepted, rejected, or cancelled';
  end if;

  select rr.* into v_request
  from public.appointment_reschedule_requests rr
  where rr.id = p_request_id
  for update;

  if not found then
    raise exception 'Reschedule request was not found';
  end if;
  if auth.role() <> 'service_role' and not public.bridge_can_access_appointment(v_request.appointment_id) then
    raise exception 'Not authorised to resolve this appointment';
  end if;

  select a.* into v_appointment
  from public.appointments a
  where a.appointment_id = v_request.appointment_id
  for update;

  if not found then
    raise exception 'Linked appointment was not found';
  end if;

  if v_request.status in ('accepted', 'rejected', 'cancelled', 'completed') then
    if v_request.status = v_decision or (v_request.status = 'completed' and v_decision = 'accepted') then
      return query
      select
        v_request.id,
        v_request.appointment_id,
        v_request.status,
        v_appointment.status,
        v_appointment.date_time,
        case
          when v_appointment.appointment_date is not null and v_appointment.end_time is not null
            then ((v_appointment.appointment_date + v_appointment.end_time) at time zone 'Africa/Johannesburg')
          else null
        end,
        v_request.reviewed_at;
      return;
    end if;
    raise exception 'This reschedule request has already been resolved';
  end if;

  if v_decision = 'accepted' then
    v_start := coalesce(p_confirmed_start, v_request.preferred_start);
    v_end := coalesce(p_confirmed_end, v_request.preferred_end);
    if v_start is null or v_start <= v_now then
      raise exception 'Accepted reschedules require a future start time';
    end if;
    if v_end is null then
      v_end := v_start + interval '45 minutes';
    end if;
    if v_end <= v_start then
      raise exception 'Confirmed end time must be after the confirmed start time';
    end if;
    if (v_start at time zone 'Africa/Johannesburg')::date <>
       (v_end at time zone 'Africa/Johannesburg')::date then
      raise exception 'Confirmed start and end times must be on the same day';
    end if;

    update public.appointments a
    set
      appointment_date = (v_start at time zone 'Africa/Johannesburg')::date,
      start_time = (v_start at time zone 'Africa/Johannesburg')::time,
      end_time = (v_end at time zone 'Africa/Johannesburg')::time,
      date_time = v_start,
      status = 'confirmed',
      confirmed_at = v_now,
      external_calendar_status = 'not_synced',
      ics_generated_at = null,
      updated_at = v_now
    where a.appointment_id = v_request.appointment_id;

    update public.appointment_reschedule_requests rr
    set
      status = 'accepted', reviewed_by = auth.uid(), reviewed_at = v_now,
      reason = coalesce(nullif(trim(p_reason), ''), rr.reason), updated_at = v_now
    where rr.id = p_request_id;

    update public.appointment_reschedule_requests rr
    set status = 'cancelled', reviewed_by = auth.uid(), reviewed_at = v_now, updated_at = v_now
    where rr.appointment_id = v_request.appointment_id
      and rr.id <> p_request_id
      and rr.status in ('pending', 'proposed');

    v_event_type := 'appointment_rescheduled';
    v_appointment_status := 'confirmed';
  else
    update public.appointment_reschedule_requests rr
    set
      status = v_decision, reviewed_by = auth.uid(), reviewed_at = v_now,
      reason = coalesce(nullif(trim(p_reason), ''), rr.reason), updated_at = v_now
    where rr.id = p_request_id;

    update public.appointments a
    set status = 'confirmed', updated_at = v_now
    where a.appointment_id = v_request.appointment_id;

    v_start := v_appointment.date_time;
    v_end := case
      when v_appointment.appointment_date is not null and v_appointment.end_time is not null
        then ((v_appointment.appointment_date + v_appointment.end_time) at time zone 'Africa/Johannesburg')
      else null
    end;
    v_event_type := case when v_decision = 'rejected' then 'appointment_reschedule_rejected' else 'appointment_reschedule_cancelled' end;
    v_appointment_status := 'confirmed';
  end if;

  if to_regclass('public.appointment_reminders') is not null then
    update public.appointment_reminders ar
    set status = 'cancelled', updated_at = v_now
    where ar.appointment_id = v_request.appointment_id and ar.status = 'pending';
  end if;

  if to_regclass('public.appointment_notification_events') is not null then
    insert into public.appointment_notification_events (
      appointment_id, transaction_id, event_type, recipient_id, recipient_role,
      visibility, title, message, email_status, in_app_status, metadata,
      dedupe_key, created_at, updated_at
    ) values (
      v_request.appointment_id, v_appointment.transaction_id, v_event_type, null, 'participant',
      coalesce(v_appointment.visibility_scope, 'shared_role_players'),
      case when v_decision = 'accepted' then 'Appointment rescheduled' else 'Reschedule request closed' end,
      case when v_decision = 'accepted' then 'The appointment has been moved to the agreed time.' else 'The reschedule request has been closed.' end,
      'skipped', 'pending',
      jsonb_build_object(
        'source', 'attorney_calendar_phase5',
        'requestId', p_request_id,
        'decision', v_decision,
        'confirmedStart', v_start,
        'confirmedEnd', v_end,
        'reason', p_reason
      ),
      v_request.appointment_id::text || '::reschedule::' || p_request_id::text || '::' || v_decision,
      v_now, v_now
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if v_appointment.transaction_id is not null and to_regclass('public.transaction_events') is not null then
    insert into public.transaction_events (transaction_id, event_type, event_data)
    values (
      v_appointment.transaction_id,
      v_event_type,
      jsonb_build_object(
        'source', 'attorney_calendar_phase5',
        'appointmentId', v_request.appointment_id,
        'requestId', p_request_id,
        'decision', v_decision,
        'confirmedStart', v_start,
        'confirmedEnd', v_end,
        'resolvedAt', v_now
      )
    );
  end if;

  return query
  select rr.id, rr.appointment_id, rr.status, v_appointment_status, v_start, v_end, rr.reviewed_at
  from public.appointment_reschedule_requests rr
  where rr.id = p_request_id;
end;
$$;

revoke all on function public.propose_attorney_appointment_reschedule(uuid, timestamptz, timestamptz, text, jsonb) from public;
revoke all on function public.resolve_attorney_appointment_reschedule(uuid, text, timestamptz, timestamptz, text) from public;
grant execute on function public.propose_attorney_appointment_reschedule(uuid, timestamptz, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function public.resolve_attorney_appointment_reschedule(uuid, text, timestamptz, timestamptz, text) to authenticated, service_role;

notify pgrst, 'reload schema';
