-- Agent-confirmed phone bookings share the same round/response ledger as RSVP
-- requests. The source and confirming agent are retained for audit.
begin;

alter table public.listing_viewing_rounds
  add column booking_source text not null default 'rsvp'
    check (booking_source in ('rsvp', 'agent_phone_override')),
  add column booking_note text,
  add column booked_by uuid;

alter table public.listing_viewing_round_responses
  add column response_source text not null default 'rsvp'
    check (response_source in ('rsvp', 'agent_phone_override')),
  add column recorded_by uuid;

create function public.book_listing_viewing_by_agent(
  p_organisation_id uuid,
  p_appointment_id uuid,
  p_confirmation_note text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_start timestamptz;
  v_now timestamptz := now();
  v_note text := nullif(btrim(coalesce(p_confirmation_note, '')), '');
  v_buyer integer;
  v_seller integer;
  v_agent integer;
  v_required integer;
  v_emails integer;
  v_pending integer;
begin
  if auth.uid() is null or not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'Not authorised to book this viewing';
  end if;
  if v_note is null or length(v_note) < 10 or length(v_note) > 1000 then
    raise exception 'Record how all three parties confirmed the viewing (10–1000 characters)';
  end if;

  select * into v_appointment from public.appointments a
  where a.appointment_id = p_appointment_id and a.organisation_id = p_organisation_id
  for update;
  if not found or not public.bridge_can_access_appointment(p_appointment_id)
    or auth.uid() is distinct from coalesce(v_appointment.agent_id, v_appointment.created_by) then
    raise exception 'Only the assigned agent can book this viewing';
  end if;
  if lower(coalesce(v_appointment.appointment_type, '')) <> 'viewing'
    or nullif(btrim(coalesce(v_appointment.listing_id, '')), '') is null
    or v_appointment.listing_viewing_round_number is not null
    or lower(coalesce(v_appointment.status, '')) <> 'requested' then
    raise exception 'Only a new listing viewing request can be booked by agent override';
  end if;
  if v_appointment.appointment_date is null or v_appointment.start_time is null then
    raise exception 'A viewing date and time are required';
  end if;
  v_start := (v_appointment.appointment_date + v_appointment.start_time)
    at time zone coalesce(nullif(v_appointment.timezone, ''), 'Africa/Johannesburg');
  if v_start <= v_now + interval '1 minute' then
    raise exception 'Choose a future viewing time';
  end if;

  select
    count(*) filter (where lower(ap.participant_role) = 'buyer'),
    count(*) filter (where lower(ap.participant_role) = 'seller'),
    count(*) filter (where lower(ap.participant_role) = 'agent'),
    count(*),
    count(distinct lower(btrim(ap.email))),
    count(*) filter (where ap.rsvp_status = 'Pending' and ap.responded_at is null
      and ap.rsvp_token is not null and nullif(btrim(coalesce(ap.email, '')), '') is not null)
  into v_buyer, v_seller, v_agent, v_required, v_emails, v_pending
  from public.appointment_participants ap
  where ap.appointment_id = p_appointment_id and ap.is_required
    and lower(ap.participant_role) in ('buyer', 'seller', 'agent');
  if v_buyer <> 1 or v_seller <> 1 or v_agent <> 1 or v_required <> 3
    or v_emails <> 3 or v_pending <> 3 then
    raise exception 'One unanswered buyer, seller and agent with separate emails are required';
  end if;

  insert into public.listing_viewing_rounds
    (appointment_id, organisation_id, round_number, proposed_start, expires_at,
     booking_source, booking_note, booked_by)
  values (p_appointment_id, p_organisation_id, 1, v_start,
    v_start - interval '1 minute', 'agent_phone_override', v_note, auth.uid());

  insert into public.listing_viewing_round_responses
    (appointment_id, round_number, participant_id, participant_role, response,
     comment, token_hash, responded_at, response_source, recorded_by)
  select p_appointment_id, 1, ap.participant_id, lower(ap.participant_role),
    'Accepted', v_note, encode(extensions.digest(ap.rsvp_token, 'sha256'), 'hex'),
    v_now, 'agent_phone_override', auth.uid()
  from public.appointment_participants ap
  where ap.appointment_id = p_appointment_id and ap.is_required
    and lower(ap.participant_role) in ('buyer', 'seller', 'agent');

  update public.appointment_participants ap
  set rsvp_status = 'Accepted', responded_at = v_now,
    rsvp_revoked_at = v_now, rsvp_expires_at = v_now,
    rsvp_token = gen_random_uuid()::text, updated_at = v_now
  where ap.appointment_id = p_appointment_id and ap.is_required
    and lower(ap.participant_role) in ('buyer', 'seller', 'agent');

  update public.listing_viewing_rounds
  set status = 'confirmed', closed_at = v_now
  where appointment_id = p_appointment_id and round_number = 1;
  update public.appointments
  set listing_viewing_round_number = 1, status = 'confirmed',
    confirmed_at = v_now, updated_at = v_now
  where appointment_id = p_appointment_id;

  return jsonb_build_object('appointmentId', p_appointment_id,
    'round', 1, 'status', 'confirmed', 'bookingSource', 'agent_phone_override');
end;
$$;

revoke all on function public.book_listing_viewing_by_agent(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.book_listing_viewing_by_agent(uuid, uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
