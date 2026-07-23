-- Attorney calendar Phase 4: secure, single-use RSVP and reschedule lifecycle.

alter table if exists public.appointment_participants
  add column if not exists rsvp_expires_at timestamptz,
  add column if not exists rsvp_revoked_at timestamptz;
alter table if exists public.appointments
  add column if not exists confirmed_at timestamptz;

do $$
begin
  if to_regclass('public.appointments') is null then
    raise notice 'Skipping appointment_reschedule_requests because appointments is unavailable.';
    return;
  end if;

  create table if not exists public.appointment_reschedule_requests (
    id uuid primary key default gen_random_uuid(),
    appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
    requested_by uuid references public.profiles(id) on delete set null,
    requested_by_role text,
    reason text,
    preferred_start timestamptz,
    preferred_end timestamptz,
    status text not null default 'pending',
    reviewed_by uuid references public.profiles(id) on delete set null,
    reviewed_at timestamptz,
    suggested_slots jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
end;
$$;

alter table if exists public.appointment_reschedule_requests
  add column if not exists requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists requested_by_role text,
  add column if not exists reason text,
  add column if not exists preferred_start timestamptz,
  add column if not exists preferred_end timestamptz,
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists suggested_slots jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.appointment_reschedule_requests
  drop constraint if exists appointment_reschedule_requests_status_check;
alter table if exists public.appointment_reschedule_requests
  add constraint appointment_reschedule_requests_status_check
  check (status in ('pending', 'proposed', 'accepted', 'rejected', 'cancelled', 'completed'));

create index if not exists appointment_reschedule_requests_appointment_idx
  on public.appointment_reschedule_requests (appointment_id);
create index if not exists appointment_reschedule_requests_status_idx
  on public.appointment_reschedule_requests (status);
alter table if exists public.appointment_reschedule_requests enable row level security;
grant select, insert, update, delete on table public.appointment_reschedule_requests to authenticated;
grant all on table public.appointment_reschedule_requests to service_role;

drop policy if exists appointment_reschedule_requests_select_scoped on public.appointment_reschedule_requests;
create policy appointment_reschedule_requests_select_scoped
on public.appointment_reschedule_requests
for select to authenticated
using (public.bridge_can_access_appointment(appointment_id));

drop policy if exists appointment_reschedule_requests_insert_scoped on public.appointment_reschedule_requests;
create policy appointment_reschedule_requests_insert_scoped
on public.appointment_reschedule_requests
for insert to authenticated
with check (public.bridge_can_access_appointment(appointment_id));

drop policy if exists appointment_reschedule_requests_update_scoped on public.appointment_reschedule_requests;
create policy appointment_reschedule_requests_update_scoped
on public.appointment_reschedule_requests
for update to authenticated
using (public.bridge_can_access_appointment(appointment_id))
with check (public.bridge_can_access_appointment(appointment_id));

drop policy if exists appointment_reschedule_requests_delete_scoped on public.appointment_reschedule_requests;
create policy appointment_reschedule_requests_delete_scoped
on public.appointment_reschedule_requests
for delete to authenticated
using (public.bridge_can_access_appointment(appointment_id));

drop function if exists public.get_appointment_rsvp_by_token(text);
create function public.get_appointment_rsvp_by_token(p_token text)
returns table (
  participant_id uuid,
  appointment_id uuid,
  participant_name text,
  participant_email text,
  participant_role text,
  rsvp_status text,
  appointment_title text,
  appointment_type text,
  appointment_date date,
  start_time time,
  end_time time,
  location text,
  meeting_url text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    ap.participant_id,
    ap.appointment_id,
    ap.name,
    ap.email,
    ap.participant_role,
    ap.rsvp_status,
    a.title,
    a.appointment_type,
    a.appointment_date,
    a.start_time,
    a.end_time,
    a.location,
    a.meeting_url,
    a.status
  from public.appointment_participants ap
  join public.appointments a on a.appointment_id = ap.appointment_id
  where ap.rsvp_token = nullif(trim(p_token), '')
    and ap.rsvp_revoked_at is null
    and (ap.rsvp_expires_at is null or ap.rsvp_expires_at > now())
    and lower(coalesce(a.status, '')) not in ('completed', 'cancelled', 'canceled')
  limit 1
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

  v_next_status := case
    when p_rsvp_status = 'Accepted' then 'confirmed'
    when p_rsvp_status = 'Declined' then 'declined'
    else 'alternative_requested'
  end;
  v_event_type := case
    when p_rsvp_status = 'Accepted' then 'appointment_confirmed'
    when p_rsvp_status = 'Declined' then 'appointment_declined'
    else 'appointment_reschedule_requested'
  end;

  update public.appointment_participants ap
  set
    rsvp_status = p_rsvp_status,
    proposed_new_time = case when p_rsvp_status = 'Proposed New Time' then p_proposed_new_time else null end,
    rsvp_comment = case when p_rsvp_status = 'Proposed New Time' then nullif(trim(p_rsvp_comment), '') else null end,
    responded_at = v_now,
    updated_at = v_now
  where ap.participant_id = v_context.participant_id;

  update public.appointments a
  set
    status = v_next_status,
    confirmed_at = case when p_rsvp_status = 'Accepted' then coalesce(a.confirmed_at, v_now) else a.confirmed_at end,
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
        when p_rsvp_status = 'Accepted' then 'Appointment accepted'
        when p_rsvp_status = 'Declined' then 'Appointment declined'
        else 'Appointment reschedule requested'
      end,
      coalesce(v_context.name, v_context.email, 'Participant') || ' responded to the appointment request.',
      'skipped',
      'pending',
      jsonb_build_object(
        'source', 'appointment_rsvp_phase4',
        'participantId', v_context.participant_id,
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

revoke all on function public.get_appointment_rsvp_by_token(text) from public;
revoke all on function public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text) from public;
grant execute on function public.get_appointment_rsvp_by_token(text) to anon, authenticated;
grant execute on function public.submit_appointment_rsvp(text, text, timestamptz, timestamptz, text) to anon, authenticated;

notify pgrst, 'reload schema';
