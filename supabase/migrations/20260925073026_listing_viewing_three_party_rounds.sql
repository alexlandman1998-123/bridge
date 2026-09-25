-- Listing Overview viewing requests: one appointment, versioned proposal rounds.
-- Historical appointments remain untouched; only explicitly initialized listing
-- viewings use this contract. All writes are serialized on the appointment row.

begin;

create schema if not exists private;

alter table public.appointments
  add column if not exists listing_viewing_round_number integer;

create table public.listing_viewing_rounds (
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  proposed_start timestamptz not null,
  proposed_end timestamptz,
  expires_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested', 'superseded', 'confirmed', 'declined', 'cancelled', 'expired')),
  proposed_by_participant_id uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  primary key (appointment_id, round_number),
  check (proposed_end is null or proposed_end > proposed_start)
);

create table public.listing_viewing_round_responses (
  appointment_id uuid not null,
  round_number integer not null,
  -- Keep the identity in the audit trail even if a participant is later removed.
  participant_id uuid not null,
  participant_role text not null check (participant_role in ('buyer', 'seller', 'agent')),
  response text not null check (response in ('Accepted', 'Declined', 'Proposed New Time')),
  proposed_new_time timestamptz,
  comment text,
  token_hash text not null unique,
  responded_at timestamptz not null default now(),
  primary key (appointment_id, round_number, participant_id),
  foreign key (appointment_id, round_number)
    references public.listing_viewing_rounds(appointment_id, round_number) on delete cascade
);

create index listing_viewing_rounds_org_idx
  on public.listing_viewing_rounds(organisation_id, appointment_id, round_number desc);

alter table public.listing_viewing_rounds enable row level security;
alter table public.listing_viewing_round_responses enable row level security;

create policy listing_viewing_rounds_member_select
  on public.listing_viewing_rounds for select to authenticated
  using (public.bridge_is_active_member(organisation_id)
    and public.bridge_can_access_appointment(appointment_id));

create policy listing_viewing_responses_member_select
  on public.listing_viewing_round_responses for select to authenticated
  using (exists (
    select 1 from public.listing_viewing_rounds r
    where r.appointment_id = listing_viewing_round_responses.appointment_id
      and r.round_number = listing_viewing_round_responses.round_number
      and public.bridge_is_active_member(r.organisation_id)
      and public.bridge_can_access_appointment(r.appointment_id)
  ));

revoke all on public.listing_viewing_rounds from public, anon, authenticated;
revoke all on public.listing_viewing_round_responses from public, anon, authenticated;
grant select on public.listing_viewing_rounds to authenticated;
grant select on public.listing_viewing_round_responses to authenticated;

create function public.initialize_listing_viewing_request(p_organisation_id uuid, p_appointment_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_start timestamptz;
  v_expiry timestamptz;
  v_buyer integer;
  v_seller integer;
  v_agent integer;
begin
  if auth.uid() is null or not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'Not authorised to initialize this viewing';
  end if;

  select * into v_appointment from public.appointments a
  where a.appointment_id = p_appointment_id and a.organisation_id = p_organisation_id
  for update;
  if not found or not public.bridge_can_access_appointment(p_appointment_id) then
    raise exception 'Viewing appointment not found';
  end if;
  if lower(coalesce(v_appointment.appointment_type, '')) <> 'viewing'
    or nullif(btrim(coalesce(v_appointment.listing_id, '')), '') is null then
    raise exception 'A listing-linked viewing appointment is required';
  end if;
  if v_appointment.listing_viewing_round_number is not null then
    return jsonb_build_object('appointmentId', p_appointment_id, 'round', v_appointment.listing_viewing_round_number, 'status', v_appointment.status);
  end if;
  if lower(coalesce(v_appointment.status, '')) <> 'requested'
    or exists (select 1 from public.appointment_participants ap
      where ap.appointment_id = p_appointment_id and ap.responded_at is not null) then
    raise exception 'Only a new, unanswered viewing request can be initialized';
  end if;
  if v_appointment.appointment_date is null or v_appointment.start_time is null then
    raise exception 'A viewing date and time are required';
  end if;
  v_start := (v_appointment.appointment_date + v_appointment.start_time)
    at time zone coalesce(nullif(v_appointment.timezone, ''), 'Africa/Johannesburg');
  if v_start <= now() + interval '1 minute' then
    raise exception 'Choose a future viewing time';
  end if;
  v_expiry := least(now() + interval '14 days', v_start - interval '1 minute');

  select
    count(*) filter (where lower(ap.participant_role) = 'buyer' and ap.is_required and nullif(btrim(coalesce(ap.email, '')), '') is not null),
    count(*) filter (where lower(ap.participant_role) = 'seller' and ap.is_required and nullif(btrim(coalesce(ap.email, '')), '') is not null),
    count(*) filter (where lower(ap.participant_role) = 'agent' and ap.is_required and nullif(btrim(coalesce(ap.email, '')), '') is not null)
  into v_buyer, v_seller, v_agent
  from public.appointment_participants ap where ap.appointment_id = p_appointment_id;
  if v_buyer <> 1 or v_seller <> 1 or v_agent <> 1 then
    raise exception 'One buyer, designated seller and agent with email must be required';
  end if;

  update public.appointment_participants ap
  set rsvp_status = 'Pending', responded_at = null, proposed_new_time = null,
      rsvp_comment = null, rsvp_revoked_at = null, rsvp_expires_at = v_expiry,
      updated_at = now()
  where ap.appointment_id = p_appointment_id
    and lower(ap.participant_role) in ('buyer', 'seller', 'agent');

  update public.appointments
  set listing_viewing_round_number = 1, status = 'requested', confirmed_at = null, updated_at = now()
  where appointment_id = p_appointment_id;

  insert into public.listing_viewing_rounds
    (appointment_id, organisation_id, round_number, proposed_start, expires_at)
  values (p_appointment_id, p_organisation_id, 1, v_start, v_expiry);

  return jsonb_build_object('appointmentId', p_appointment_id, 'round', 1, 'status', 'requested');
end;
$$;

-- Called only by the public RSVP wrapper below. A token is the sole external
-- capability; no organisation-wide write access is granted to anonymous users.
create function private.record_listing_viewing_response(
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
    update public.listing_viewing_rounds set status = 'expired', closed_at = v_now
      where appointment_id = v_round.appointment_id and round_number = v_round.round_number;
    update public.appointments set status = 'cancelled', cancellation_reason = 'Viewing RSVP expired',
      cancelled_at = v_now, updated_at = v_now where appointment_id = v_round.appointment_id;
    update public.appointment_participants set rsvp_revoked_at = v_now, updated_at = v_now
      where appointment_id = v_round.appointment_id;
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
    update public.listing_viewing_rounds set status = 'declined', closed_at = v_now
      where appointment_id = v_round.appointment_id and round_number = v_round.round_number;
    update public.appointments set status = 'declined', confirmed_at = null, updated_at = v_now
      where appointment_id = v_round.appointment_id;
    update public.appointment_participants set rsvp_revoked_at = v_now, updated_at = v_now
      where appointment_id = v_round.appointment_id and participant_id <> v_participant.participant_id;
  elsif p_rsvp_status = 'Proposed New Time' then
    v_next_round := v_round.round_number + 1;
    v_expiry := least(v_now + interval '14 days', p_proposed_new_time - interval '1 minute');
    update public.listing_viewing_rounds set status = 'superseded', closed_at = v_now
      where appointment_id = v_round.appointment_id and round_number = v_round.round_number;
    insert into public.listing_viewing_rounds
      (appointment_id, organisation_id, round_number, proposed_start, proposed_end, expires_at, proposed_by_participant_id)
    values (v_round.appointment_id, v_appointment.organisation_id, v_next_round,
      p_proposed_new_time, p_preferred_end, v_expiry, v_participant.participant_id);
    update public.appointments set
      listing_viewing_round_number = v_next_round,
      appointment_date = (p_proposed_new_time at time zone coalesce(nullif(timezone, ''), 'Africa/Johannesburg'))::date,
      start_time = (p_proposed_new_time at time zone coalesce(nullif(timezone, ''), 'Africa/Johannesburg'))::time,
      end_time = case when p_preferred_end is not null then (p_preferred_end at time zone coalesce(nullif(timezone, ''), 'Africa/Johannesburg'))::time else null end,
      date_time = p_proposed_new_time, status = 'requested', confirmed_at = null, updated_at = v_now
    where appointment_id = v_round.appointment_id;
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
      update public.listing_viewing_rounds set status = 'confirmed', closed_at = v_now
        where appointment_id = v_round.appointment_id and round_number = v_round.round_number;
      update public.appointments set status = 'confirmed', confirmed_at = v_now, updated_at = v_now
        where appointment_id = v_round.appointment_id;
    end if;
  end if;

  return query select v_participant.participant_id, v_round.appointment_id, p_rsvp_status, v_now;
end;
$$;

-- Keep the existing public endpoint for every other appointment type. Moving
-- its current implementation preserves the legacy non-viewing behaviour.
alter function public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text)
  rename to submit_appointment_rsvp_legacy;
revoke all on function public.submit_appointment_rsvp_legacy(text, text, timestamptz, timestamptz, text)
  from public, anon, authenticated;

create function public.submit_appointment_rsvp(
  p_token text, p_rsvp_status text, p_proposed_new_time timestamptz default null,
  p_preferred_end timestamptz default null, p_rsvp_comment text default null
)
returns table (participant_id uuid, appointment_id uuid, rsvp_status text, responded_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.appointment_participants ap
    join public.appointments a on a.appointment_id = ap.appointment_id
    where ap.rsvp_token = nullif(btrim(p_token), '')
      and a.listing_viewing_round_number is not null
  ) or exists (
    select 1 from public.listing_viewing_round_responses r
    where r.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  ) then
    return query select * from private.record_listing_viewing_response(
      p_token, p_rsvp_status, p_proposed_new_time, p_preferred_end, p_rsvp_comment);
  else
    return query select * from public.submit_appointment_rsvp_legacy(
      p_token, p_rsvp_status, p_proposed_new_time, p_preferred_end, p_rsvp_comment);
  end if;
end;
$$;

-- Direct appointment updates must not manufacture a booked viewing without
-- three responses to the active proposal round.
create function private.guard_listing_viewing_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_accepted integer;
begin
  if old.listing_viewing_round_number is null then return new; end if;
  if new.listing_viewing_round_number is null then
    raise exception 'A managed viewing cannot discard its response rounds';
  end if;
  if new.listing_viewing_round_number <> old.listing_viewing_round_number and not exists (
    select 1 from public.listing_viewing_rounds r
    where r.appointment_id = new.appointment_id
      and r.round_number = new.listing_viewing_round_number
      and r.status = 'requested'
      and new.listing_viewing_round_number = old.listing_viewing_round_number + 1
  ) then
    raise exception 'The active viewing proposal can only advance to a new round';
  end if;
  if lower(coalesce(new.status, '')) = 'confirmed' then
    select count(distinct r.participant_role) into v_accepted
    from public.listing_viewing_round_responses r
    join public.listing_viewing_rounds round
      on round.appointment_id = r.appointment_id and round.round_number = r.round_number
    where r.appointment_id = new.appointment_id
      and r.round_number = new.listing_viewing_round_number
      and r.response = 'Accepted' and round.status = 'confirmed';
    if v_accepted <> 3 then raise exception 'All three parties must accept the current viewing time'; end if;
  end if;
  return new;
end;
$$;

create trigger guard_listing_viewing_status_before_update
  before update of status, listing_viewing_round_number on public.appointments
  for each row execute function private.guard_listing_viewing_status();

-- A cancellation or decline made through the normal appointment controls must
-- close the active round and revoke its still-open links as well.
create function private.close_listing_viewing_round_on_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.listing_viewing_round_number is null or new.status not in ('cancelled', 'declined')
    or old.status = new.status then return new; end if;
  update public.listing_viewing_rounds
  set status = new.status, closed_at = coalesce(closed_at, now())
  where appointment_id = new.appointment_id
    and round_number = new.listing_viewing_round_number and status = 'requested';
  update public.appointment_participants
  set rsvp_revoked_at = coalesce(rsvp_revoked_at, now()), updated_at = now()
  where appointment_id = new.appointment_id and rsvp_revoked_at is null;
  return new;
end;
$$;

create trigger close_listing_viewing_round_after_status
  after update of status on public.appointments
  for each row execute function private.close_listing_viewing_round_on_status();

revoke all on function private.record_listing_viewing_response(text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function private.guard_listing_viewing_status() from public, anon, authenticated;
revoke all on function private.close_listing_viewing_round_on_status() from public, anon, authenticated;
revoke all on function public.initialize_listing_viewing_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.initialize_listing_viewing_request(uuid, uuid) to authenticated;
grant execute on function public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
