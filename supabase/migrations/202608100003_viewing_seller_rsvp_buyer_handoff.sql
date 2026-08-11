-- Buyer viewing planner Phase 4: seller-first RSVP handoff.
-- A seller acceptance should invite the buyer next, and a viewing appointment
-- should only become confirmed after all required external participants accept.

drop function if exists public.get_viewing_seller_rsvp_handoff_by_token(text);
create function public.get_viewing_seller_rsvp_handoff_by_token(p_token text)
returns table (
  event_id uuid,
  appointment_id uuid,
  organisation_id uuid,
  organisation_name text,
  organisation_logo_url text,
  organisation_logo_light_url text,
  organisation_logo_dark_url text,
  organisation_brand_primary_color text,
  organisation_brand_secondary_color text,
  support_email text,
  support_phone text,
  buyer_participant_id uuid,
  buyer_name text,
  buyer_email text,
  buyer_rsvp_token text,
  seller_participant_id uuid,
  appointment_title text,
  appointment_type text,
  appointment_date date,
  start_time time,
  end_time time,
  timezone text,
  location text,
  meeting_url text,
  status text,
  notes text,
  listing_label text,
  agent_name text,
  agent_email text,
  email_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context record;
  v_buyer record;
  v_event_id uuid;
  v_event_email_status text := 'pending';
  v_dedupe_key text;
begin
  select
    seller.participant_id as seller_participant_id,
    seller.appointment_id,
    a.organisation_id,
    a.title,
    a.appointment_type,
    a.appointment_date,
    a.start_time,
    a.end_time,
    a.timezone,
    a.location,
    a.meeting_url,
    a.status,
    a.notes,
    a.listing_id,
    a.transaction_id,
    a.visibility_scope,
    coalesce(org.display_name, org.name) as organisation_name,
    org.logo_url as organisation_logo_url,
    org.support_email,
    org.support_phone,
    brand.logo_light_url,
    brand.logo_dark_url,
    brand.primary_brand_color as primary_color,
    brand.secondary_brand_color as secondary_color,
    coalesce(agent.full_name, agent.email) as agent_name,
    agent.email as agent_email
  into v_context
  from public.appointment_participants seller
  join public.appointments a on a.appointment_id = seller.appointment_id
  left join public.organisations org on org.id = a.organisation_id
  left join public.organisation_branding brand on brand.organisation_id = a.organisation_id
  left join public.profiles agent on agent.id = coalesce(a.agent_id, a.created_by)
  where seller.rsvp_token = nullif(trim(p_token), '')
    and lower(coalesce(seller.participant_role, '')) like '%seller%'
    and seller.rsvp_status = 'Accepted'
    and seller.responded_at is not null
    and seller.rsvp_revoked_at is null
    and lower(coalesce(a.appointment_type, '')) like '%view%'
    and lower(coalesce(a.status, '')) not in ('completed', 'cancelled', 'canceled', 'declined')
  limit 1;

  if not found then
    return;
  end if;

  select
    buyer.participant_id,
    buyer.name,
    buyer.email,
    buyer.rsvp_token
  into v_buyer
  from public.appointment_participants buyer
  where buyer.appointment_id = v_context.appointment_id
    and lower(coalesce(buyer.participant_role, '')) like '%buyer%'
    and coalesce(buyer.is_required, true) is true
    and buyer.rsvp_status = 'Pending'
    and buyer.responded_at is null
    and buyer.rsvp_revoked_at is null
    and (buyer.rsvp_expires_at is null or buyer.rsvp_expires_at > now())
    and nullif(trim(coalesce(buyer.email, '')), '') is not null
    and nullif(trim(coalesce(buyer.rsvp_token, '')), '') is not null
  order by buyer.created_at asc
  limit 1;

  if not found then
    return;
  end if;

  v_dedupe_key := v_context.appointment_id::text || '::seller_rsvp_handoff::buyer::' || v_buyer.participant_id::text;

  if to_regclass('public.appointment_notification_events') is not null then
    insert into public.appointment_notification_events (
      appointment_id,
      transaction_id,
      event_type,
      recipient_id,
      recipient_role,
      recipient_email,
      visibility,
      title,
      message,
      email_status,
      in_app_status,
      metadata,
      dedupe_key,
      created_at,
      updated_at
    )
    values (
      v_context.appointment_id,
      v_context.transaction_id,
      'appointment_confirmation_required',
      null,
      'buyer',
      lower(v_buyer.email),
      coalesce(nullif(v_context.visibility_scope, ''), 'shared_role_players'),
      'Buyer RSVP requested',
      'Seller accepted the proposed viewing time. Buyer RSVP is now required.',
      'pending',
      'skipped',
      jsonb_build_object(
        'source', 'seller_rsvp_handoff_to_buyer',
        'sellerParticipantId', v_context.seller_participant_id,
        'buyerParticipantId', v_buyer.participant_id,
        'appointmentStatus', v_context.status
      ),
      v_dedupe_key,
      now(),
      now()
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

    select ane.id, ane.email_status
    into v_event_id, v_event_email_status
    from public.appointment_notification_events ane
    where ane.dedupe_key = v_dedupe_key
    limit 1;

    if v_event_email_status = 'sent' then
      return;
    end if;
  end if;

  return query
  select
    v_event_id,
    v_context.appointment_id,
    v_context.organisation_id,
    v_context.organisation_name,
    v_context.organisation_logo_url,
    v_context.logo_light_url,
    v_context.logo_dark_url,
    v_context.primary_color,
    v_context.secondary_color,
    v_context.support_email,
    v_context.support_phone,
    v_buyer.participant_id,
    v_buyer.name,
    lower(v_buyer.email),
    v_buyer.rsvp_token,
    v_context.seller_participant_id,
    v_context.title,
    v_context.appointment_type,
    v_context.appointment_date,
    v_context.start_time,
    v_context.end_time,
    coalesce(nullif(v_context.timezone, ''), 'Africa/Johannesburg'),
    v_context.location,
    v_context.meeting_url,
    v_context.status,
    v_context.notes,
    coalesce(nullif(v_context.title, ''), nullif(v_context.listing_id, '')),
    v_context.agent_name,
    v_context.agent_email,
    coalesce(v_event_email_status, 'pending');
end;
$$;

drop function if exists public.mark_viewing_buyer_rsvp_handoff_delivery(text, uuid, text, text);
create function public.mark_viewing_buyer_rsvp_handoff_delivery(
  p_token text,
  p_event_id uuid,
  p_email_status text,
  p_delivery_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment_id uuid;
begin
  if p_email_status not in ('sent', 'failed', 'skipped', 'pending') then
    raise exception 'Invalid email status';
  end if;

  select seller.appointment_id
  into v_appointment_id
  from public.appointment_participants seller
  where seller.rsvp_token = nullif(trim(p_token), '')
    and lower(coalesce(seller.participant_role, '')) like '%seller%'
    and seller.rsvp_status = 'Accepted'
  limit 1;

  if v_appointment_id is null or p_event_id is null then
    return;
  end if;

  update public.appointment_notification_events ane
  set
    email_status = p_email_status,
    metadata = coalesce(ane.metadata, '{}'::jsonb) || jsonb_build_object(
      'deliveryError', nullif(trim(coalesce(p_delivery_error, '')), ''),
      'deliveryMarkedAt', now()
    ),
    updated_at = now()
  where ane.id = p_event_id
    and ane.appointment_id = v_appointment_id
    and ane.event_type = 'appointment_confirmation_required'
    and lower(coalesce(ane.recipient_role, '')) = 'buyer';
end;
$$;

drop function if exists public.submit_appointment_rsvp(text, text, timestamptz, text);
drop function if exists public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text);
create function public.submit_appointment_rsvp(
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
  v_event_type text;
  v_now timestamptz := now();
  v_pending_request_id uuid;
  v_attorney_email text;
  v_required_count integer := 0;
  v_declined_count integer := 0;
  v_proposed_count integer := 0;
  v_accepted_count integer := 0;
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
    ap.rsvp_status as current_rsvp_status,
    ap.responded_at,
    ap.rsvp_expires_at,
    ap.rsvp_revoked_at,
    a.organisation_id,
    a.transaction_id,
    a.created_by,
    a.status as appointment_status
  into v_context
  from public.appointment_participants ap
  join public.appointments a on a.appointment_id = ap.appointment_id
  where ap.rsvp_token = nullif(trim(p_token), '')
  limit 1
  for update of ap;

  if not found
    or v_context.rsvp_revoked_at is not null
    or (v_context.rsvp_expires_at is not null and v_context.rsvp_expires_at <= v_now)
    or lower(coalesce(v_context.appointment_status, '')) in ('completed', 'cancelled', 'canceled') then
    return;
  end if;

  if v_context.responded_at is not null then
    if v_context.current_rsvp_status = p_rsvp_status then
      return query
      select v_context.participant_id, v_context.appointment_id, v_context.current_rsvp_status, v_context.responded_at;
      return;
    end if;
    raise exception 'This RSVP has already been recorded';
  end if;

  if p_rsvp_status = 'Proposed New Time' then
    if p_proposed_new_time is null or p_proposed_new_time <= v_now then
      raise exception 'A future preferred start time is required';
    end if;
    if p_preferred_end is not null and p_preferred_end <= p_proposed_new_time then
      raise exception 'Preferred end time must be after the preferred start time';
    end if;
    if p_preferred_end is not null and
       (p_preferred_end at time zone 'Africa/Johannesburg')::date <>
       (p_proposed_new_time at time zone 'Africa/Johannesburg')::date then
      raise exception 'Preferred start and end times must be on the same day';
    end if;
  end if;

  update public.appointment_participants ap
  set
    rsvp_status = p_rsvp_status,
    proposed_new_time = case when p_rsvp_status = 'Proposed New Time' then p_proposed_new_time else null end,
    rsvp_comment = case when p_rsvp_status = 'Proposed New Time' then nullif(trim(p_rsvp_comment), '') else null end,
    responded_at = v_now,
    updated_at = v_now
  where ap.participant_id = v_context.participant_id;

  select
    count(*) filter (
      where coalesce(ap.is_required, true) is true
        and lower(coalesce(ap.participant_role, '')) not in ('agent', 'co-agent', 'principal')
    ),
    count(*) filter (
      where coalesce(ap.is_required, true) is true
        and lower(coalesce(ap.participant_role, '')) not in ('agent', 'co-agent', 'principal')
        and ap.rsvp_status = 'Declined'
    ),
    count(*) filter (
      where coalesce(ap.is_required, true) is true
        and lower(coalesce(ap.participant_role, '')) not in ('agent', 'co-agent', 'principal')
        and ap.rsvp_status = 'Proposed New Time'
    ),
    count(*) filter (
      where coalesce(ap.is_required, true) is true
        and lower(coalesce(ap.participant_role, '')) not in ('agent', 'co-agent', 'principal')
        and ap.rsvp_status = 'Accepted'
    )
  into v_required_count, v_declined_count, v_proposed_count, v_accepted_count
  from public.appointment_participants ap
  where ap.appointment_id = v_context.appointment_id;

  v_next_status := case
    when v_declined_count > 0 then 'declined'
    when v_proposed_count > 0 then 'alternative_requested'
    when v_required_count > 0 and v_accepted_count = v_required_count then 'confirmed'
    else 'requested'
  end;

  v_event_type := case
    when p_rsvp_status = 'Accepted' and v_next_status = 'confirmed' then 'appointment_confirmed'
    when p_rsvp_status = 'Accepted' then 'appointment_confirmation_required'
    when p_rsvp_status = 'Declined' then 'appointment_declined'
    else 'appointment_reschedule_requested'
  end;

  update public.appointments a
  set
    status = v_next_status,
    confirmed_at = case
      when v_next_status = 'confirmed' then coalesce(a.confirmed_at, v_now)
      else a.confirmed_at
    end,
    updated_at = v_now
  where a.appointment_id = v_context.appointment_id;

  if p_rsvp_status = 'Proposed New Time' then
    perform pg_advisory_xact_lock(hashtextextended(v_context.appointment_id::text, 0));
    select id into v_pending_request_id
    from public.appointment_reschedule_requests rr
    where rr.appointment_id = v_context.appointment_id and rr.status = 'pending'
    limit 1
    for update;

    if v_pending_request_id is null then
      insert into public.appointment_reschedule_requests (
        appointment_id, requested_by, requested_by_role, reason,
        preferred_start, preferred_end, status, created_at, updated_at
      ) values (
        v_context.appointment_id, v_context.user_id, v_context.participant_role,
        nullif(trim(p_rsvp_comment), ''), p_proposed_new_time, p_preferred_end,
        'pending', v_now, v_now
      );
    else
      update public.appointment_reschedule_requests
      set
        requested_by = v_context.user_id,
        requested_by_role = v_context.participant_role,
        reason = nullif(trim(p_rsvp_comment), ''),
        preferred_start = p_proposed_new_time,
        preferred_end = p_preferred_end,
        updated_at = v_now
      where id = v_pending_request_id;
    end if;
  end if;

  if p_rsvp_status in ('Declined', 'Proposed New Time') and to_regclass('public.appointment_reminders') is not null then
    update public.appointment_reminders ar
    set status = 'cancelled', updated_at = v_now
    where ar.appointment_id = v_context.appointment_id and ar.status = 'pending';
  end if;

  if v_context.created_by is not null then
    select p.email into v_attorney_email from public.profiles p where p.id = v_context.created_by;
  end if;

  if to_regclass('public.appointment_notification_events') is not null then
    insert into public.appointment_notification_events (
      appointment_id, transaction_id, event_type, recipient_id, recipient_role,
      recipient_email, visibility, title, message, email_status, in_app_status,
      metadata, dedupe_key, created_at, updated_at
    ) values (
      v_context.appointment_id,
      v_context.transaction_id,
      v_event_type,
      v_context.created_by,
      'attorney',
      nullif(v_attorney_email, ''),
      'internal_only',
      case
        when p_rsvp_status = 'Accepted' and v_next_status = 'confirmed' then 'Appointment accepted'
        when p_rsvp_status = 'Accepted' then 'Participant accepted'
        when p_rsvp_status = 'Declined' then 'Appointment declined'
        else 'Appointment reschedule requested'
      end,
      coalesce(v_context.name, v_context.email, 'Participant') || ' responded to the appointment request.',
      'skipped',
      'pending',
      jsonb_build_object(
        'source', 'appointment_rsvp_phase4_seller_handoff',
        'participantId', v_context.participant_id,
        'participantRole', v_context.participant_role,
        'rsvpStatus', p_rsvp_status,
        'comment', p_rsvp_comment,
        'preferredStart', p_proposed_new_time,
        'preferredEnd', p_preferred_end,
        'appointmentStatus', v_next_status
      ),
      v_context.appointment_id::text || '::rsvp::' || v_context.participant_id::text,
      v_now,
      v_now
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if v_context.transaction_id is not null and to_regclass('public.transaction_events') is not null then
    insert into public.transaction_events (transaction_id, event_type, event_data)
    values (
      v_context.transaction_id,
      v_event_type,
      jsonb_build_object(
        'appointmentId', v_context.appointment_id,
        'participantId', v_context.participant_id,
        'participantName', v_context.name,
        'participantRole', v_context.participant_role,
        'rsvpStatus', p_rsvp_status,
        'appointmentStatus', v_next_status,
        'respondedAt', v_now
      )
    );
  end if;

  return query
  select ap.participant_id, ap.appointment_id, ap.rsvp_status, ap.responded_at
  from public.appointment_participants ap
  where ap.participant_id = v_context.participant_id;
end;
$$;

revoke all on function public.get_viewing_seller_rsvp_handoff_by_token(text) from public;
revoke all on function public.mark_viewing_buyer_rsvp_handoff_delivery(text, uuid, text, text) from public;
revoke all on function public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text) from public;
grant execute on function public.get_viewing_seller_rsvp_handoff_by_token(text) to anon, authenticated;
grant execute on function public.mark_viewing_buyer_rsvp_handoff_delivery(text, uuid, text, text) to anon, authenticated;
grant execute on function public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text) to anon, authenticated;

notify pgrst, 'reload schema';
