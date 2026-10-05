begin;

alter table public.appointment_reschedule_requests add column participant_id uuid
  references public.appointment_participants(participant_id) on delete set null;

-- Older requests are linked only when their saved party role (or the old
-- participant-ID role value) identifies exactly one invite on that booking.
update public.appointment_reschedule_requests r set participant_id=resolved.participant_id
from (
  select r.id,min(p.participant_id::text)::uuid as participant_id
  from public.appointment_reschedule_requests r join public.appointment_participants p
    on p.appointment_id=r.appointment_id and (lower(btrim(r.requested_by_role))=lower(btrim(p.participant_role))
      or r.requested_by_role=p.participant_id::text)
  group by r.id having count(*)=1
) resolved where resolved.id=r.id;
create index appointment_reschedule_participant_idx on public.appointment_reschedule_requests(participant_id);

-- Only the capability/session wrappers can call this writer. Responses, their
-- requests, audit records, delivery triggers and refresh watermarks commit together.
create table private.appointment_response_receipts (
  actor_key text not null,
  command_id uuid not null,
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  fingerprint jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_key, command_id)
);
create index appointment_response_receipts_appointment_idx on private.appointment_response_receipts(appointment_id);
alter table private.appointment_response_receipts enable row level security;
revoke all on private.appointment_response_receipts from public, anon, authenticated;

create function private.commit_appointment_response(
  p_appointment_id uuid, p_participant_id uuid, p_status text,
  p_preferred_start timestamptz, p_preferred_end timestamptz, p_comment text,
  p_allow_change boolean default false, p_expected_start timestamptz default null, p_expected_token text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments; p public.appointment_participants;
  v_now timestamptz := now(); v_start timestamptz; v_end timestamptz;
  v_status text; v_event text; v_request uuid; v_required integer; v_previous_end timestamptz;
  v_declined boolean; v_proposed boolean; v_accepted boolean;
begin
  if p_status is null or p_status not in ('Accepted','Declined','Proposed New Time')
    or length(coalesce(p_comment,'')) > 1000 then
    raise exception 'Invalid appointment response.' using errcode='22023';
  end if;
  -- All writers take the appointment lock before its participant/request locks.
  select * into a from public.appointments where appointment_id=p_appointment_id for update;
  select * into p from public.appointment_participants
    where appointment_id=p_appointment_id and participant_id=p_participant_id for update;
  v_now := clock_timestamp();
  if a.appointment_id is null or p.participant_id is null or p.rsvp_revoked_at is not null
    or (p.rsvp_expires_at is not null and p.rsvp_expires_at <= v_now)
    or (p_expected_token is not null and p.rsvp_token is distinct from p_expected_token) then
    raise exception 'This appointment invitation is no longer active.' using errcode='42501';
  end if;
  v_start := coalesce(a.date_time,(a.appointment_date+a.start_time) at time zone 'Africa/Johannesburg');
  if p_expected_start is not null and v_start is distinct from p_expected_start then
    raise exception 'The appointment time changed. Refresh before responding.' using errcode='40001';
  end if;
  if p.responded_at is not null and not p_allow_change then
    if p.rsvp_status is distinct from p_status then raise exception 'This RSVP has already been recorded'; end if;
    if p_status='Proposed New Time' then
      select preferred_end into v_previous_end from public.appointment_reschedule_requests
        where appointment_id=a.appointment_id and participant_id=p.participant_id and status in ('pending','proposed')
        order by created_at desc limit 1;
      if (p.proposed_new_time is distinct from p_preferred_start or p.rsvp_comment is distinct from nullif(btrim(p_comment),'') or
        (p_preferred_end is not null and v_previous_end is distinct from p_preferred_end)) then
      raise exception 'This RSVP has already been recorded';
      end if;
    end if;
    return jsonb_build_object('participantId',p.participant_id,'appointmentId',a.appointment_id,
      'transactionId',a.transaction_id,'rsvpStatus',p.rsvp_status,'respondedAt',p.responded_at,'status',a.status,'replayed',true);
  end if;
  if lower(a.status) in ('completed','cancelled','canceled','declined','no_show') or v_start is null or v_start <= v_now then
    raise exception 'Closed or started appointments cannot receive responses.' using errcode='22023';
  end if;
  if p_status='Proposed New Time' then
    if p_preferred_start is null or p_preferred_start <= v_now then
      raise exception 'A future preferred start time is required' using errcode='22023';
    end if;
    v_end := coalesce(p_preferred_end,p_preferred_start+case
      when a.end_time>a.start_time then a.end_time-a.start_time else interval '45 minutes' end);
    if v_end <= p_preferred_start or (v_end at time zone 'Africa/Johannesburg')::date <>
      (p_preferred_start at time zone 'Africa/Johannesburg')::date then
      raise exception 'Preferred start and end times must be on the same day and in order.' using errcode='22023';
    end if;
  end if;
  -- Updating a response closes only this participant's older request.
  update public.appointment_reschedule_requests set status='cancelled',updated_at=v_now
    where appointment_id=a.appointment_id and participant_id=p.participant_id
      and status in ('pending','proposed');
  if p_status='Proposed New Time' then
    insert into public.appointment_reschedule_requests(appointment_id,participant_id,requested_by,requested_by_role,
      reason,preferred_start,preferred_end,status,created_at,updated_at)
    values(a.appointment_id,p.participant_id,p.user_id,p.participant_role,nullif(btrim(p_comment),''),
      p_preferred_start,v_end,'pending',v_now,v_now) returning id into v_request;
  end if;
  update public.appointment_participants set rsvp_status=p_status,
    proposed_new_time=case when p_status='Proposed New Time' then p_preferred_start end,
    rsvp_comment=case when p_status='Proposed New Time' then nullif(btrim(p_comment),'') end,
    responded_at=v_now,updated_at=v_now where participant_id=p.participant_id;

  select count(*),coalesce(bool_or(lower(rsvp_status)='declined'),false),
    coalesce(bool_or(lower(rsvp_status)='proposed new time'),false),
    coalesce(bool_and(lower(rsvp_status)='accepted'),false)
    into v_required,v_declined,v_proposed,v_accepted from public.appointment_participants
    where appointment_id=a.appointment_id and coalesce(is_required,true) and not coalesce(is_scheduling_owner,false);
  v_status := case when v_declined then 'Declined' when v_proposed then 'Reschedule Requested'
    when v_required>0 and v_accepted then 'Confirmed' else 'Pending Confirmation' end;
  update public.appointments set status=v_status,
    confirmed_at=case when v_status='Confirmed' then coalesce(confirmed_at,v_now) else null end,
    updated_at=v_now where appointment_id=a.appointment_id;
  if v_status in ('Declined','Reschedule Requested') then
    update public.appointment_reminders set status='cancelled',updated_at=v_now
      where appointment_id=a.appointment_id and status='pending';
  end if;
  v_event := case v_status when 'Confirmed' then 'appointment_confirmed' when 'Declined' then 'appointment_declined'
    when 'Reschedule Requested' then 'appointment_reschedule_requested' else 'appointment_updated' end;
  if a.attorney_delivery_enabled is distinct from false then
  insert into public.appointment_notification_events(appointment_id,transaction_id,event_type,recipient_id,recipient_role,
    recipient_email,visibility,title,message,email_status,in_app_status,metadata,dedupe_key)
  values(a.appointment_id,a.transaction_id,v_event,a.created_by,coalesce((select lower(role) from public.profiles where id=a.created_by),'attorney'),
    (select email from public.profiles where id=a.created_by),'internal_only','Appointment response',
    'A participant responded to the appointment.','skipped','pending',
    jsonb_build_object('participantId',p.participant_id,'rsvpStatus',p_status,'appointmentStatus',v_status),
    a.appointment_id::text||'::response::'||p.participant_id::text||'::'||v_now::text)
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if a.transaction_id is not null and a.visibility_scope in ('client_visible','shared_role_players') then
    insert into public.transaction_events(transaction_id,event_type,event_data,created_by_role,visibility_scope)
    values(a.transaction_id,v_event,jsonb_build_object('appointmentId',a.appointment_id,
      'rsvpStatus',p_status,'appointmentStatus',v_status,'respondedAt',v_now),'client',
      'client_visible');
  end if;
  return jsonb_build_object('appointmentId',a.appointment_id,'transactionId',a.transaction_id,
    'legacyDelivery',a.attorney_delivery_enabled is null,'notificationEvent',v_event,
    'participantId',p.participant_id,'rsvpStatus',p_status,'status',v_status,'respondedAt',v_now,
    'rescheduleRequestId',v_request,'preferredStart',p_preferred_start,'preferredEnd',v_end,'replayed',false);
end;
$$;
revoke all on function private.commit_appointment_response(uuid,uuid,text,timestamptz,timestamptz,text,boolean,timestamptz,text)
  from public,anon,authenticated;

-- Retain the existing three-party viewing protocol. Qualify UPDATE predicates
-- whose column names also occur in its table-returning function's OUT fields;
-- otherwise final acceptance/decline/counterproposal fail with ambiguous IDs.
create or replace function private.record_listing_viewing_response(
  p_token text, p_rsvp_status text, p_proposed_new_time timestamptz,
  p_preferred_end timestamptz, p_rsvp_comment text
)
returns table (participant_id uuid, appointment_id uuid, rsvp_status text, responded_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_participant public.appointment_participants%rowtype;
  v_round public.listing_viewing_rounds%rowtype;
  v_prior public.listing_viewing_round_responses%rowtype;
  v_now timestamptz := now();
  v_token_hash text;
  v_accepted integer;
  v_next_round integer;
  v_expiry timestamptz;
  v_role text;
begin
  if p_rsvp_status not in ('Accepted', 'Declined', 'Proposed New Time') then
    raise exception 'Invalid RSVP status';
  end if;
  if nullif(btrim(coalesce(p_token, '')), '') is null then return; end if;
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select a.* into v_appointment
  from public.appointments a
  join public.appointment_participants ap on ap.appointment_id = a.appointment_id
  where ap.rsvp_token = p_token and a.listing_viewing_round_number is not null
  limit 1;
  if not found then
    select * into v_prior from public.listing_viewing_round_responses r where r.token_hash = v_token_hash;
    if found and v_prior.response = p_rsvp_status then
      return query select v_prior.participant_id, v_prior.appointment_id, v_prior.response, v_prior.responded_at;
    elsif found then
      raise exception 'This viewing response is already recorded';
    end if;
    return;
  end if;

  select * into v_appointment from public.appointments a
  where a.appointment_id = v_appointment.appointment_id for update;
  select * into v_participant from public.appointment_participants ap
  where ap.appointment_id = v_appointment.appointment_id and ap.rsvp_token = p_token for update;
  if not found then
    select * into v_prior from public.listing_viewing_round_responses r where r.token_hash = v_token_hash;
    if found and v_prior.response = p_rsvp_status then
      return query select v_prior.participant_id, v_prior.appointment_id, v_prior.response, v_prior.responded_at;
    elsif found then
      raise exception 'This viewing response is already recorded';
    end if;
    return;
  end if;

  select * into v_prior from public.listing_viewing_round_responses r where r.token_hash = v_token_hash;
  if found then
    if v_prior.response <> p_rsvp_status then raise exception 'This viewing response is already recorded'; end if;
    return query select v_prior.participant_id, v_prior.appointment_id, v_prior.response, v_prior.responded_at;
    return;
  end if;

  select * into v_round from public.listing_viewing_rounds r
  where r.appointment_id = v_appointment.appointment_id
    and r.round_number = v_appointment.listing_viewing_round_number for update;
  if not found or v_round.status <> 'requested'
    or v_participant.rsvp_revoked_at is not null
    or lower(coalesce(v_appointment.status, '')) in ('cancelled', 'completed', 'declined') then return; end if;
  if v_round.expires_at <= v_now or v_round.proposed_start <= v_now
    or (v_participant.rsvp_expires_at is not null and v_participant.rsvp_expires_at <= v_now) then
    update public.listing_viewing_rounds rr set status = 'expired', closed_at = v_now
      where rr.appointment_id = v_round.appointment_id and rr.round_number = v_round.round_number;
    update public.appointments a set status = 'cancelled', cancellation_reason = 'Viewing RSVP expired',
      cancelled_at = v_now, updated_at = v_now where a.appointment_id = v_round.appointment_id;
    update public.appointment_participants ap set rsvp_revoked_at = v_now, updated_at = v_now
      where ap.appointment_id = v_round.appointment_id;
    return;
  end if;

  v_role := lower(coalesce(v_participant.participant_role, ''));
  if v_role not in ('buyer', 'seller', 'agent') or not v_participant.is_required then return; end if;
  if p_rsvp_status = 'Proposed New Time' then
    if p_proposed_new_time is null or p_proposed_new_time <= v_now + interval '1 minute' then
      raise exception 'A future proposed viewing time is required';
    end if;
    if p_preferred_end is not null and p_preferred_end <= p_proposed_new_time then
      raise exception 'Preferred end time must follow the start';
    end if;
  end if;

  insert into public.listing_viewing_round_responses
    (appointment_id, round_number, participant_id, participant_role, response,
     proposed_new_time, comment, token_hash, responded_at)
  values (v_round.appointment_id, v_round.round_number, v_participant.participant_id,
    v_role, p_rsvp_status, case when p_rsvp_status = 'Proposed New Time' then p_proposed_new_time else null end,
    nullif(btrim(coalesce(p_rsvp_comment, '')), ''), v_token_hash, v_now);

  update public.appointment_participants ap set rsvp_status = p_rsvp_status,
    proposed_new_time = case when p_rsvp_status = 'Proposed New Time' then p_proposed_new_time else null end,
    rsvp_comment = nullif(btrim(coalesce(p_rsvp_comment, '')), ''), responded_at = v_now, updated_at = v_now
  where ap.participant_id = v_participant.participant_id;

  if p_rsvp_status = 'Declined' then
    update public.listing_viewing_rounds rr set status = 'declined', closed_at = v_now
      where rr.appointment_id = v_round.appointment_id and rr.round_number = v_round.round_number;
    update public.appointments a set status = 'declined', confirmed_at = null, updated_at = v_now
      where a.appointment_id = v_round.appointment_id;
    update public.appointment_participants ap set rsvp_revoked_at = v_now, updated_at = v_now
      where ap.appointment_id = v_round.appointment_id and ap.participant_id <> v_participant.participant_id;
  elsif p_rsvp_status = 'Proposed New Time' then
    v_next_round := v_round.round_number + 1;
    v_expiry := least(v_now + interval '14 days', p_proposed_new_time - interval '1 minute');
    update public.listing_viewing_rounds rr set status = 'superseded', closed_at = v_now
      where rr.appointment_id = v_round.appointment_id and rr.round_number = v_round.round_number;
    insert into public.listing_viewing_rounds
      (appointment_id, organisation_id, round_number, proposed_start, proposed_end, expires_at, proposed_by_participant_id)
    values (v_round.appointment_id, v_appointment.organisation_id, v_next_round,
      p_proposed_new_time, p_preferred_end, v_expiry, v_participant.participant_id);
    update public.appointments a set
      listing_viewing_round_number = v_next_round,
      appointment_date = (p_proposed_new_time at time zone coalesce(nullif(timezone, ''), 'Africa/Johannesburg'))::date,
      start_time = (p_proposed_new_time at time zone coalesce(nullif(timezone, ''), 'Africa/Johannesburg'))::time,
      end_time = case when p_preferred_end is not null then (p_preferred_end at time zone coalesce(nullif(timezone, ''), 'Africa/Johannesburg'))::time else null end,
      date_time = p_proposed_new_time, status = 'requested', confirmed_at = null, updated_at = v_now
    where a.appointment_id = v_round.appointment_id;
    update public.appointment_participants ap set
      rsvp_status = 'Pending', responded_at = null, proposed_new_time = null,
      rsvp_comment = null, rsvp_token = gen_random_uuid()::text,
      rsvp_expires_at = v_expiry, rsvp_revoked_at = null, updated_at = v_now
    where ap.appointment_id = v_round.appointment_id
      and lower(ap.participant_role) in ('buyer', 'seller', 'agent');
  else
    select count(distinct r.participant_role) into v_accepted
    from public.listing_viewing_round_responses r
    where r.appointment_id = v_round.appointment_id and r.round_number = v_round.round_number
      and r.response = 'Accepted' and r.participant_role in ('buyer', 'seller', 'agent');
    if v_accepted = 3 then
      update public.listing_viewing_rounds rr set status = 'confirmed', closed_at = v_now
        where rr.appointment_id = v_round.appointment_id and rr.round_number = v_round.round_number;
      update public.appointments a set status = 'confirmed', confirmed_at = v_now, updated_at = v_now
        where a.appointment_id = v_round.appointment_id;
    end if;
  end if;

  return query select v_participant.participant_id, v_round.appointment_id, p_rsvp_status, v_now;
end;
$$;
revoke all on function private.record_listing_viewing_response(text,text,timestamptz,timestamptz,text) from public,anon,authenticated;

create or replace function public.submit_appointment_rsvp(p_token text,p_rsvp_status text,
  p_proposed_new_time timestamptz default null,p_preferred_end timestamptz default null,p_rsvp_comment text default null)
returns table(participant_id uuid,appointment_id uuid,rsvp_status text,responded_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare p public.appointment_participants; v_result jsonb;
begin
  if p_rsvp_status is null or p_rsvp_status not in ('Accepted','Declined','Proposed New Time')
    or length(coalesce(p_rsvp_comment,''))>1000 then
    raise exception 'Invalid appointment response.' using errcode='22023';
  end if;
  -- Listing viewings retain their existing three-party proposal-round writer,
  -- including archived-token replay and the dedicated viewing notifications.
  if exists(select 1 from public.appointment_participants ap join public.appointments a
    on a.appointment_id=ap.appointment_id where ap.rsvp_token=nullif(btrim(p_token),'')
      and a.listing_viewing_round_number is not null) or exists(
    select 1 from public.listing_viewing_round_responses r
      where r.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')) then
    return query select * from private.record_listing_viewing_response(
      p_token,p_rsvp_status,p_proposed_new_time,p_preferred_end,p_rsvp_comment);
    return;
  end if;
  select * into p from public.appointment_participants where rsvp_token=nullif(btrim(p_token),'');
  if not found or p.rsvp_revoked_at is not null or (p.rsvp_expires_at is not null and p.rsvp_expires_at<=now()) then return; end if;
  v_result := private.commit_appointment_response(p.appointment_id,p.participant_id,p_rsvp_status,
    p_proposed_new_time,p_preferred_end,p_rsvp_comment,false,null,p.rsvp_token);
  return query select (v_result->>'participantId')::uuid,(v_result->>'appointmentId')::uuid,
    v_result->>'rsvpStatus',(v_result->>'respondedAt')::timestamptz;
end;
$$;
revoke all on function public.submit_appointment_rsvp(text,text,timestamptz,timestamptz,text) from public;
grant execute on function public.submit_appointment_rsvp(text,text,timestamptz,timestamptz,text) to anon,authenticated;

create function public.bridge_respond_client_portal_appointment(p_token text,p_appointment_id uuid,
  p_command_id uuid,p_status text,p_expected_start timestamptz,p_preferred_start timestamptz default null,
  p_preferred_end timestamptz default null,p_comment text default null,p_seller_access_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.appointments; v_actor text; v_role text; v_email text; v_matter uuid; v_listing uuid;
  v_context record; v_link public.client_portal_links; v_resolution record; v_viewing_response record;
  v_participant uuid; v_invite public.appointment_participants; v_count integer; v_fingerprint jsonb; v_receipt private.appointment_response_receipts; v_result jsonb;
begin
  if p_status is null or p_status not in ('Accepted','Declined','Proposed New Time')
    or length(coalesce(p_comment,''))>1000 then
    raise exception 'Invalid appointment response.' using errcode='22023';
  end if;
  if p_command_id is null or p_expected_start is null then raise exception 'Request ID and saved appointment time are required.' using errcode='22023'; end if;
  -- Credential type determines role. The caller cannot select another party.
  if lower(btrim(p_token)) like 'seller-%' then
    select * into v_context from journey_private.resolve_seller_portal_context(p_token,p_seller_access_token);
    v_matter := v_context.transaction_id; v_listing := v_context.listing_id;
    v_actor := 'seller:'||v_listing::text; v_role := 'seller';
    select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
    select lower(btrim(coalesce(nullif(form_data->>'sellerEmail',''),nullif(form_data->>'email',''),form_data->>'contactEmail')))
      into v_email from public.private_listing_seller_onboarding where id=v_resolution.onboarding_id;
  else
    select * into v_link from public.client_portal_links where token=p_token and is_active is true;
    if v_link.id is null or public.bridge_client_portal_request_token() is distinct from p_token
      or not coalesce(public.bridge_has_client_portal_token_transaction_access(v_link.transaction_id),false)
      or (nullif(to_jsonb(v_link)->>'expires_at','')::timestamptz<=now()) then
      raise exception 'Portal access required.' using errcode='42501';
    end if;
    v_matter := v_link.transaction_id; v_actor := 'buyer:'||v_link.id::text; v_role := 'buyer';
    select lower(btrim(email)) into v_email from public.buyers where id=v_link.buyer_id;
  end if;
  select * into a from public.appointments where appointment_id=p_appointment_id for update;
  if a.appointment_id is null or nullif(v_email,'') is null or
    not coalesce(((v_matter is not null and a.transaction_id=v_matter) or
      (v_role='seller' and a.transaction_id is null and a.listing_id::text=v_listing::text)),false) or
    coalesce(a.visibility_scope,'internal_only') not in ('client_visible','shared_role_players') then
    raise exception 'Appointment access denied.' using errcode='42501';
  end if;
  select count(*),min(participant_id::text)::uuid into v_count,v_participant
    from public.appointment_participants where appointment_id=a.appointment_id and lower(btrim(email))=v_email
      and lower(btrim(participant_role)) in (v_role,'client');
  if v_count<>1 then raise exception 'Your appointment invitation could not be identified. Contact your team.' using errcode='42501'; end if;
  select * into v_invite from public.appointment_participants where participant_id=v_participant
    and appointment_id=a.appointment_id and lower(btrim(email))=v_email
    and lower(btrim(participant_role)) in (v_role,'client') for update;
  if not found or v_invite.rsvp_revoked_at is not null or v_invite.rsvp_expires_at<=now() then
    raise exception 'This appointment invitation is no longer active.' using errcode='42501';
  end if;
  v_actor := v_actor||':'||v_participant::text||':'||v_email;
  v_fingerprint := jsonb_build_object('appointmentId',p_appointment_id,'status',p_status,
    'start',p_expected_start,'preferredStart',p_preferred_start,'preferredEnd',p_preferred_end,'comment',nullif(btrim(p_comment),''));
  perform pg_advisory_xact_lock(hashtextextended(v_actor||p_command_id::text,0));
  select * into v_receipt from private.appointment_response_receipts where actor_key=v_actor and command_id=p_command_id;
  if found then
    if v_receipt.fingerprint is distinct from v_fingerprint then raise exception 'Request ID already used for another response.' using errcode='23505'; end if;
    return v_receipt.result||jsonb_build_object('replayed',true);
  end if;
  if a.listing_viewing_round_number is not null then
    if coalesce(a.date_time,(a.appointment_date+a.start_time) at time zone 'Africa/Johannesburg') is distinct from p_expected_start then
      raise exception 'The appointment time changed. Refresh before responding.' using errcode='40001';
    end if;
    select * into v_viewing_response from private.record_listing_viewing_response(
      v_invite.rsvp_token,p_status,p_preferred_start,p_preferred_end,p_comment);
    select * into a from public.appointments where appointment_id=p_appointment_id;
    if v_viewing_response.participant_id is null then
      -- An expired round may close the booking without recording a reply.
      -- Keep that existing cleanup committed, but never acknowledge a reply.
      return jsonb_build_object('appointmentId',a.appointment_id,'transactionId',a.transaction_id,
        'status',a.status,'responseUnavailable',true);
    end if;
    v_result := jsonb_build_object('appointmentId',a.appointment_id,'transactionId',a.transaction_id,
      'participantId',v_viewing_response.participant_id,'rsvpStatus',v_viewing_response.rsvp_status,
      'respondedAt',v_viewing_response.responded_at,'status',a.status,
      'refreshOnly',true,'legacyDelivery',false,'replayed',false);
  else
    v_result := private.commit_appointment_response(a.appointment_id,v_participant,p_status,
      p_preferred_start,p_preferred_end,p_comment,true,p_expected_start);
  end if;
  insert into private.appointment_response_receipts(actor_key,command_id,appointment_id,fingerprint,result)
    values(v_actor,p_command_id,a.appointment_id,v_fingerprint,v_result);
  return v_result;
end;
$$;
revoke all on function public.bridge_respond_client_portal_appointment(text,uuid,uuid,text,timestamptz,timestamptz,timestamptz,text,text) from public;
grant execute on function public.bridge_respond_client_portal_appointment(text,uuid,uuid,text,timestamptz,timestamptz,timestamptz,text,text) to anon,authenticated;

-- All appointment mutations, including staff edits and attendee-only responses,
-- advance the same watermark already read by professional and portal journeys.
create function private.appointment_matter_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_matter uuid; v_old_matter uuid; v_id uuid; v_old_id uuid;
begin
  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
  if tg_table_name='appointments' then
    if tg_op<>'DELETE' then v_matter:=new.transaction_id; end if;
    if tg_op<>'INSERT' then v_old_matter:=old.transaction_id; end if;
  else
    if tg_op<>'DELETE' then v_id:=new.appointment_id; end if;
    if tg_op<>'INSERT' then v_old_id:=old.appointment_id; end if;
    select transaction_id into v_matter from public.appointments where appointment_id=v_id;
    select transaction_id into v_old_matter from public.appointments where appointment_id=v_old_id;
  end if;
  insert into public.transaction_refresh_signals(transaction_id,version,changed_at,command_receipt_id,canonical_event_id)
    select distinct s.matter_id,1,now(),null::uuid,null::uuid
    from unnest(array[v_matter,v_old_matter]) s(matter_id)
    where s.matter_id is not null and exists(select 1 from public.transactions t where t.id=s.matter_id)
    on conflict(transaction_id) do update set version=public.transaction_refresh_signals.version+1,
      changed_at=excluded.changed_at,command_receipt_id=null,canonical_event_id=null;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.appointment_matter_changed() from public,anon,authenticated;
create trigger appointment_matter_refresh after insert or update or delete on public.appointments
  for each row execute function private.appointment_matter_changed();
create trigger appointment_participant_matter_refresh after insert or update or delete on public.appointment_participants
  for each row execute function private.appointment_matter_changed();
create trigger appointment_request_matter_refresh after insert or update or delete on public.appointment_reschedule_requests
  for each row execute function private.appointment_matter_changed();

notify pgrst,'reload schema';
commit;
