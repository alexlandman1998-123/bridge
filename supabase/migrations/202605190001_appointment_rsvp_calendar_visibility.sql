-- Ensure public appointment RSVP responses promote the calendar-visible appointment row.

alter table if exists public.appointments
  add column if not exists confirmed_at timestamptz;
drop function if exists public.submit_appointment_rsvp(text, text, timestamptz, text);
drop function if exists public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text);
create or replace function public.submit_appointment_rsvp(
  p_token text,
  p_rsvp_status text,
  p_proposed_new_time timestamptz default null,
  p_preferred_end timestamptz default null,
  p_rsvp_comment text default null
)
returns table (
  participant_id uuid,
  appointment_id uuid,
  rsvp_status text,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context record;
  v_next_status text;
  v_now timestamptz := now();
  v_activity_type text;
  v_activity_note text;
  v_date_label text;
  v_time_label text;
begin
  if p_rsvp_status not in ('Accepted', 'Declined', 'Proposed New Time') then
    raise exception 'Invalid RSVP status';
  end if;

  select
    ap.participant_id,
    ap.appointment_id,
    ap.user_id,
    ap.name,
    ap.email,
    ap.participant_role,
    a.organisation_id,
    a.lead_id,
    a.agent_id,
    a.transaction_id,
    a.listing_id,
    a.title,
    a.appointment_type,
    a.appointment_date,
    a.start_time,
    a.end_time,
    a.date_time
  into v_context
  from public.appointment_participants ap
  join public.appointments a on a.appointment_id = ap.appointment_id
  where ap.rsvp_token = p_token
  limit 1;

  if not found then
    return;
  end if;

  if p_rsvp_status = 'Accepted' then
    v_next_status := 'confirmed';
  elsif p_rsvp_status = 'Declined' then
    v_next_status := 'declined';
  else
    v_next_status := 'alternative_requested';
  end if;

  update public.appointment_participants ap
  set
    rsvp_status = p_rsvp_status,
    proposed_new_time = case when p_rsvp_status = 'Proposed New Time' then p_proposed_new_time else null end,
    rsvp_comment = case when p_rsvp_status = 'Proposed New Time' then nullif(p_rsvp_comment, '') else null end,
    responded_at = v_now,
    updated_at = v_now
  where ap.rsvp_token = p_token;

  update public.appointments a
  set
    status = v_next_status,
    confirmed_at = case
      when p_rsvp_status = 'Accepted' then coalesce(a.confirmed_at, v_now)
      else a.confirmed_at
    end,
    updated_at = v_now
  where a.appointment_id = v_context.appointment_id;

  if p_rsvp_status = 'Proposed New Time' and to_regclass('public.appointment_reschedule_requests') is not null then
    insert into public.appointment_reschedule_requests (
      appointment_id,
      requested_by_role,
      reason,
      preferred_start,
      preferred_end,
      status,
      created_at,
      updated_at
    )
    values (
      v_context.appointment_id,
      v_context.participant_role,
      nullif(p_rsvp_comment, ''),
      p_proposed_new_time,
      p_preferred_end,
      'pending',
      v_now,
      v_now
    );
  end if;

  if to_regclass('public.appointment_notification_events') is not null then
    insert into public.appointment_notification_events (
      appointment_id,
      event_type,
      recipient_id,
      recipient_role,
      recipient_email,
      visibility,
      title,
      message,
      email_status,
      in_app_status,
      metadata
    )
    values (
      v_context.appointment_id,
      case
        when p_rsvp_status = 'Accepted' then 'appointment_confirmed'
        when p_rsvp_status = 'Declined' then 'appointment_declined'
        else 'appointment_reschedule_requested'
      end,
      v_context.user_id,
      v_context.participant_role,
      v_context.email,
      'shared_role_players',
      case
        when p_rsvp_status = 'Accepted' then 'Appointment accepted'
        when p_rsvp_status = 'Declined' then 'Appointment declined'
        else 'Appointment reschedule requested'
      end,
      coalesce(v_context.name, v_context.email, 'Participant') || ' responded to the appointment request.',
      'skipped',
      'pending',
      jsonb_build_object(
        'source', 'appointment_rsvp',
        'rsvpStatus', p_rsvp_status,
        'comment', p_rsvp_comment,
        'preferredStart', p_proposed_new_time,
        'preferredEnd', p_preferred_end,
        'appointmentStatus', v_next_status
      )
    );
  end if;

  v_date_label := coalesce(v_context.appointment_date::text, v_context.date_time::date::text, 'the proposed date');
  v_time_label := coalesce(left(v_context.start_time::text, 5), left(v_context.date_time::time::text, 5), 'the proposed time');

  if v_context.lead_id is not null and to_regclass('public.lead_activities') is not null then
    begin
      v_activity_type := case
        when p_rsvp_status = 'Accepted' then 'Appointment Confirmed'
        when p_rsvp_status = 'Declined' then 'Appointment Created'
        else 'Appointment Created'
      end;
      v_activity_note := case
        when p_rsvp_status = 'Accepted' then coalesce(v_context.name, 'Buyer') || ' confirmed appointment for ' || v_date_label || ' at ' || v_time_label || '.'
        when p_rsvp_status = 'Declined' then coalesce(v_context.name, 'Buyer') || ' declined appointment for ' || v_date_label || ' at ' || v_time_label || '.'
        else coalesce(v_context.name, 'Buyer') || ' requested a new appointment time.'
      end;

      insert into public.lead_activities (
        organisation_id,
        lead_id,
        agent_id,
        activity_type,
        activity_note,
        activity_date,
        outcome
      )
      values (
        v_context.organisation_id,
        v_context.lead_id,
        v_context.agent_id,
        v_activity_type,
        v_activity_note,
        v_now,
        case
          when p_rsvp_status = 'Accepted' then 'Confirmed'
          when p_rsvp_status = 'Declined' then 'Declined'
          else 'Reschedule requested'
        end
      );
    exception when others then
      null;
    end;
  end if;

  if v_context.transaction_id is not null and to_regclass('public.transaction_events') is not null then
    begin
      insert into public.transaction_events (
        transaction_id,
        event_type,
        event_data
      )
      values (
        v_context.transaction_id,
        case
          when p_rsvp_status = 'Accepted' then 'appointment_confirmed'
          when p_rsvp_status = 'Declined' then 'appointment_declined'
          else 'appointment_reschedule_requested'
        end,
        jsonb_build_object(
          'appointmentId', v_context.appointment_id,
          'participantName', v_context.name,
          'participantEmail', v_context.email,
          'rsvpStatus', p_rsvp_status,
          'appointmentStatus', v_next_status,
          'respondedAt', v_now
        )
      );
    exception when others then
      null;
    end;
  end if;

  return query
  select ap.participant_id, ap.appointment_id, ap.rsvp_status, ap.responded_at
  from public.appointment_participants ap
  where ap.rsvp_token = p_token;
end;
$$;
grant execute on function public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text) to anon, authenticated;
drop policy if exists appointments_agent_linked_lead_select on public.appointments;
create policy appointments_agent_linked_lead_select on public.appointments
for select to authenticated
using (
  exists (
    select 1
    from public.leads l
    where l.lead_id = appointments.lead_id
      and l.organisation_id = appointments.organisation_id
      and l.assigned_agent_id = auth.uid()
  )
);
drop policy if exists appointment_participants_agent_linked_lead_select on public.appointment_participants;
create policy appointment_participants_agent_linked_lead_select on public.appointment_participants
for select to authenticated
using (
  exists (
    select 1
    from public.appointments a
    join public.leads l on l.lead_id = a.lead_id and l.organisation_id = a.organisation_id
    where a.appointment_id = appointment_participants.appointment_id
      and l.assigned_agent_id = auth.uid()
  )
);
