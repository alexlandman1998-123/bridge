-- Appointment request workflow refinement.

alter table if exists public.appointments
  alter column status set default 'requested';
alter table if exists public.appointments drop constraint if exists appointments_status_check;
update public.appointments
set status = case
  when lower(status) in ('draft') then 'draft'
  when lower(status) in ('pending', 'pending confirmation') then 'requested'
  when lower(status) in ('proposed', 'accepted') then 'accepted'
  when lower(status) in ('confirmed') then 'confirmed'
  when lower(status) in ('completed') then 'completed'
  when lower(status) in ('cancelled', 'canceled') then 'cancelled'
  when lower(status) in ('declined') then 'declined'
  when lower(status) in ('needs reschedule', 'reschedule requested', 'alternative requested') then 'alternative_requested'
  when lower(status) in ('alternative proposed') then 'alternative_proposed'
  when lower(status) in ('no show', 'no-show') then 'no_show'
  else 'requested'
end
where status is not null;
alter table if exists public.appointments
  add constraint appointments_status_check
  check (
    status in (
      'draft',
      'requested',
      'accepted',
      'alternative_requested',
      'alternative_proposed',
      'confirmed',
      'declined',
      'completed',
      'cancelled',
      'no_show',
      'Draft',
      'Pending Confirmation',
      'Proposed',
      'Confirmed',
      'Completed',
      'Cancelled',
      'Declined',
      'Needs Reschedule',
      'Reschedule Requested'
    )
  );
alter table if exists public.appointments drop constraint if exists appointments_related_entity_type_check;
alter table if exists public.appointments
  add constraint appointments_related_entity_type_check
  check (
    related_entity_type is null
    or related_entity_type in ('transaction', 'lead', 'listing', 'development', 'unit', 'client', 'private_transaction', 'none')
  );
drop function if exists public.submit_appointment_rsvp(text, text, timestamptz, text);
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
  v_appointment_id uuid;
  v_next_status text;
begin
  if p_rsvp_status not in ('Accepted', 'Declined', 'Proposed New Time') then
    raise exception 'Invalid RSVP status';
  end if;

  select ap.appointment_id
  into v_appointment_id
  from public.appointment_participants ap
  where ap.rsvp_token = p_token
  limit 1;

  if v_appointment_id is null then
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
    responded_at = now(),
    updated_at = now()
  where ap.rsvp_token = p_token;

  update public.appointments
  set
    status = v_next_status,
    updated_at = now()
  where appointments.appointment_id = v_appointment_id;

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
      v_appointment_id,
      (select ap.participant_role from public.appointment_participants ap where ap.rsvp_token = p_token limit 1),
      nullif(p_rsvp_comment, ''),
      p_proposed_new_time,
      p_preferred_end,
      'pending',
      now(),
      now()
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
    select
      ap.appointment_id,
      case
        when p_rsvp_status = 'Accepted' then 'appointment_confirmed'
        when p_rsvp_status = 'Declined' then 'appointment_declined'
        else 'appointment_reschedule_requested'
      end,
      ap.user_id,
      ap.participant_role,
      ap.email,
      'shared_role_players',
      case
        when p_rsvp_status = 'Accepted' then 'Appointment accepted'
        when p_rsvp_status = 'Declined' then 'Appointment declined'
        else 'Appointment reschedule requested'
      end,
      coalesce(ap.name, ap.email, 'Participant') || ' responded to the appointment request.',
      'skipped',
      'pending',
      jsonb_build_object(
        'source', 'appointment_rsvp',
        'rsvpStatus', p_rsvp_status,
        'comment', p_rsvp_comment,
        'preferredStart', p_proposed_new_time,
        'preferredEnd', p_preferred_end
      )
    from public.appointment_participants ap
    where ap.rsvp_token = p_token;
  end if;

  return query
  select ap.participant_id, ap.appointment_id, ap.rsvp_status, ap.responded_at
  from public.appointment_participants ap
  where ap.rsvp_token = p_token;
end;
$$;
grant execute on function public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text) to anon, authenticated;
