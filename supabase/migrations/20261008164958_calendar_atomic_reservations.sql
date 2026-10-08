begin;

-- No historical hold or outcome is inferred or backfilled.
alter table public.appointments
  add column reservation_managed boolean not null default false,
  add column request_issued_at timestamptz,
  add column hold_expires_at timestamptz,
  add column has_confirmed_reservation boolean not null default false;
alter table public.appointment_participants
  add column proposal_id uuid,
  add column proposal_response text;
alter table public.appointment_reschedule_requests
  add column reservation_managed boolean not null default false,
  add column hold_expires_at timestamptz,
  add column proposal_revision integer not null default 0,
  add column original_status text,
  add column proposed_timezone text,
  add column proposed_all_day boolean;

create table private.calendar_mutation_receipts (
  actor_id uuid not null, command_id uuid not null,
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  fingerprint jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key (actor_id, command_id)
);
alter table private.calendar_mutation_receipts enable row level security;
revoke all on private.calendar_mutation_receipts from public, anon, authenticated;
create table private.calendar_response_history (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  participant_id uuid not null, actor_id uuid, response jsonb not null,
  recorded_at timestamptz not null default clock_timestamp()
);
alter table private.calendar_response_history enable row level security;
revoke all on private.calendar_response_history from public,anon,authenticated;
create function private.retain_calendar_response_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (old.rsvp_status,old.responded_at,old.proposed_new_time,old.rsvp_comment,old.proposal_id,old.proposal_response,old.user_id,old.email)
    is distinct from (new.rsvp_status,new.responded_at,new.proposed_new_time,new.rsvp_comment,new.proposal_id,new.proposal_response,new.user_id,new.email)
    and (old.responded_at is not null or old.proposal_response is not null) then
    insert into private.calendar_response_history(appointment_id,participant_id,actor_id,response)
      values(old.appointment_id,old.participant_id,auth.uid(),jsonb_build_object('status',old.rsvp_status,'respondedAt',old.responded_at,
        'proposedTime',old.proposed_new_time,'comment',old.rsvp_comment,'proposalId',old.proposal_id,'proposalResponse',old.proposal_response,
        'userId',old.user_id,'email',old.email));
  end if;
  return new;
end;
$$;
revoke all on function private.retain_calendar_response_history() from public,anon,authenticated;
create trigger calendar_retain_response_history before update on public.appointment_participants
  for each row execute function private.retain_calendar_response_history();
create index calendar_receipts_appointment_idx on private.calendar_mutation_receipts(appointment_id);
create index appointment_participants_busy_email_idx on public.appointment_participants(lower(btrim(email)), appointment_id);
create index calendar_proposal_hold_idx on public.appointment_reschedule_requests(hold_expires_at, appointment_id)
  where reservation_managed and status='proposed';

-- Existing professional and three-party workflows keep their own commands.
-- Actual firm membership identifies older professional rows lacking delivery flags.
create function private.calendar_is_specialist(a public.appointments) returns boolean
language sql stable security definer set search_path='' as $$
  select not a.reservation_managed and (a.attorney_delivery_enabled is not null or a.listing_viewing_round_number is not null
    or exists(select 1 from public.attorney_firm_members m where m.user_id=a.created_by and m.status='active'));
$$;
revoke all on function private.calendar_is_specialist(public.appointments) from public,anon,authenticated;
create function public.bridge_calendar_requires_command(p_appointment_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.appointments a where a.appointment_id=p_appointment_id
    and public.bridge_can_access_appointment(a.appointment_id) and not private.calendar_is_specialist(a));
$$;
revoke all on function public.bridge_calendar_requires_command(uuid) from public,anon;
grant execute on function public.bridge_calendar_requires_command(uuid) to authenticated;

create function private.calendar_status(p_status text) returns text
language sql immutable set search_path='' as $$
  select case lower(replace(replace(btrim(coalesce(p_status,'')),' ','_'),'-','_'))
    when 'pending' then 'requested' when 'pending_confirmation' then 'requested'
    when 'buyer_confirmed' then 'confirmed' when 'canceled' then 'cancelled'
    when 'no_show' then 'no_show' when 'reschedule_requested' then 'alternative_requested'
    when 'needs_reschedule' then 'alternative_requested'
    else lower(replace(replace(btrim(coalesce(p_status,'')),' ','_'),'-','_')) end;
$$;
create function private.calendar_end(a public.appointments) returns timestamptz
language plpgsql stable set search_path='' as $$
declare v_end timestamptz;
begin
  if a.timezone is null then return null; end if;
  if not a.all_day and a.appointment_date is not null and a.start_time is not null
    and (a.date_time at time zone a.timezone) is distinct from (a.appointment_date+a.start_time) then return null; end if;
  v_end:=coalesce(a.end_date_time,case when a.all_day then (a.appointment_date+1)::timestamp at time zone a.timezone end,
    (a.appointment_date+a.end_time) at time zone a.timezone,a.date_time+interval '45 minutes');
  if a.all_day and ((a.date_time at time zone a.timezone)::time<>time '00:00'
    or (v_end at time zone a.timezone) is distinct from (a.appointment_date+1)::timestamp) then return null; end if;
  if not a.all_day and a.end_time is not null and (v_end at time zone a.timezone) is distinct from (a.appointment_date+a.end_time) then return null; end if;
  if v_end<=a.date_time then return null; end if;
  return v_end;
exception when invalid_parameter_value then return null;
end;
$$;
-- An inconsistent historical booking blocks a related person/room for the
-- uncertain day; it never crashes availability for unrelated appointments.
create function private.calendar_uncertain_day(a public.appointments) returns timestamptz
language plpgsql stable set search_path='' as $$
begin
  return a.appointment_date::timestamp at time zone coalesce(a.timezone,'Africa/Johannesburg');
exception when invalid_parameter_value then
  return a.appointment_date::timestamp at time zone 'Africa/Johannesburg';
end;
$$;
revoke all on function private.calendar_uncertain_day(public.appointments) from public,anon,authenticated;
create function private.calendar_reserves(a public.appointments, p_now timestamptz default now()) returns boolean
language sql stable set search_path='' as $$
  select case
    when private.calendar_status(a.status) in ('draft','cancelled','completed','declined','no_show') or private.calendar_end(a)<=p_now then false
    when private.calendar_status(a.status)='confirmed' or a.has_confirmed_reservation then true
    when private.calendar_status(a.status) in ('requested','accepted','alternative_requested','alternative_proposed') then
      a.date_time is not null and least(coalesce(a.hold_expires_at,coalesce(a.request_issued_at,a.created_at)+interval '24 hours'),a.date_time) > p_now
    else false end;
$$;
revoke all on function private.calendar_status(text), private.calendar_end(public.appointments),
  private.calendar_reserves(public.appointments,timestamptz) from public, anon, authenticated;

-- The same short transaction lock is used by the existing attorney/room writer.
-- It covers final appointment + participant checks, including hidden bookings.
create function private.lock_calendar_reservations() returns trigger
language plpgsql set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  return null;
end;
$$;
revoke all on function private.lock_calendar_reservations() from public, anon, authenticated;
create trigger calendar_appointment_lock before insert or update or delete on public.appointments
  for each statement execute function private.lock_calendar_reservations();
create trigger calendar_participant_lock before insert or update or delete on public.appointment_participants
  for each statement execute function private.lock_calendar_reservations();
create trigger calendar_proposal_lock before insert or update or delete on public.appointment_reschedule_requests
  for each statement execute function private.lock_calendar_reservations();

create function private.assert_calendar_slot(a public.appointments, p_start timestamptz default null, p_end timestamptz default null)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_start timestamptz:=coalesce(p_start,a.date_time); v_end timestamptz;
begin
  if p_start is null and not private.calendar_reserves(a,clock_timestamp()) then return; end if;
  v_end:=coalesce(p_end,private.calendar_end(a));
  if v_start is null or v_end is null or v_end<=v_start then
    raise exception 'Review this appointment date and duration before reserving time.' using errcode='22023';
  end if;
  if exists (
    with candidate_people as (
      select a.agent_id as user_id, nullif(lower(btrim((select p.email from public.profiles p where p.id=a.agent_id))),'') as email
      union select a.scheduling_owner_user_id,nullif(lower(btrim((select p.email from public.profiles p where p.id=a.scheduling_owner_user_id))),'')
      union select ap.user_id,nullif(lower(btrim(coalesce(ap.email,(select p.email from public.profiles p where p.id=ap.user_id)))),'') from public.appointment_participants ap
        where ap.appointment_id=a.appointment_id and ap.rsvp_revoked_at is null
          and ap.is_required and lower(ap.rsvp_status)<>'declined'
    ), reservations as (
      select b.appointment_id,b.resource_id,b.agent_id,b.scheduling_owner_user_id,case when private.calendar_end(b) is null then least(b.date_time,private.calendar_uncertain_day(b)) else b.date_time end as starts_at,
        coalesce(private.calendar_end(b),greatest(b.date_time+interval '24 hours',private.calendar_uncertain_day(b)+interval '24 hours')) as ends_at from public.appointments b
        where b.appointment_id<>a.appointment_id and private.calendar_reserves(b,clock_timestamp())
      union all
      select b.appointment_id,b.resource_id,b.agent_id,b.scheduling_owner_user_id,r.preferred_start,r.preferred_end
        from public.appointment_reschedule_requests r join public.appointments b on b.appointment_id=r.appointment_id
        where b.appointment_id<>a.appointment_id and r.reservation_managed and r.status='proposed'
          and r.hold_expires_at>clock_timestamp()
          and private.calendar_status(b.status) not in ('cancelled','completed','declined','no_show')
    )
    select 1 from reservations b where b.starts_at<v_end and b.ends_at>v_start and (
      (a.resource_id is not null and b.resource_id=a.resource_id)
      or exists(select 1 from candidate_people c where c.user_id is not null and c.user_id in (b.agent_id,b.scheduling_owner_user_id))
      or exists(select 1 from public.profiles implicit_person join candidate_people c on c.email=nullif(lower(btrim(implicit_person.email)),'')
        where implicit_person.id in (b.agent_id,b.scheduling_owner_user_id))
      or exists(select 1 from public.appointment_participants bp join candidate_people c
        on (c.user_id is not null and c.user_id=bp.user_id)
          or (c.email is not null and c.email=nullif(lower(btrim(coalesce(bp.email,(select p.email from public.profiles p where p.id=bp.user_id)))),''))
        where bp.appointment_id=b.appointment_id and bp.rsvp_revoked_at is null and bp.is_required and lower(bp.rsvp_status)<>'declined')
    )
  ) then
    raise exception 'A required person or room is already reserved at this time. Refresh availability.' using errcode='23P01';
  end if;
end;
$$;
revoke all on function private.assert_calendar_slot(public.appointments,timestamptz,timestamptz) from public, anon, authenticated;

-- Deferred checks see the final attendee set, rather than the attendees removed
-- halfway through an atomic schedule edit. Direct table writes get the same guard.
create function private.check_final_calendar_reservation() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.appointments; v_id uuid;
begin
  v_id:=case when tg_op='DELETE' then old.appointment_id else new.appointment_id end;
  select * into a from public.appointments where appointment_id=v_id;
  if found then perform private.assert_calendar_slot(a); end if;
  return null;
end;
$$;
revoke all on function private.check_final_calendar_reservation() from public, anon, authenticated;
create constraint trigger calendar_final_appointment_slot after insert or update on public.appointments
  deferrable initially deferred for each row execute function private.check_final_calendar_reservation();
create constraint trigger calendar_final_participant_slot after insert or update or delete on public.appointment_participants
  deferrable initially deferred for each row execute function private.check_final_calendar_reservation();

-- Retain the existing attorney payload/resource authorization. Final conflicts
-- are checked by the deferred common guard, so removed attendees cannot block edits.
create or replace function private.check_attorney_calendar_slot(p_appointment public.appointments)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if auth.uid() is null and current_setting('role') not in ('service_role','none') then
    raise exception 'Not authorised to schedule this appointment';
  end if;
  if auth.uid() is not null and not public.bridge_can_write_appointment_payload(
    p_appointment.transaction_id,p_appointment.organisation_id,p_appointment.created_by,p_appointment.agent_id) then
    raise exception 'Not authorised to schedule this appointment';
  end if;
  if private.calendar_status(p_appointment.status) in ('cancelled','completed','declined','no_show') then return; end if;
  if p_appointment.resource_id is not null and not exists (
    select 1 from public.appointment_resources r where r.id=p_appointment.resource_id and r.is_active
      and (r.organisation_id=p_appointment.organisation_id or exists (
        select 1 from public.transaction_attorney_assignments ta join public.attorney_firms f
          on f.id=coalesce(ta.attorney_firm_id,ta.firm_id)
        where ta.transaction_id=p_appointment.transaction_id and f.organisation_id=r.organisation_id
          and coalesce(ta.assignment_status,ta.status,'active')='active'))
  ) then raise exception 'Choose an active boardroom from this appointment organisation or assigned attorney firm'; end if;
end;
$$;
revoke all on function private.check_attorney_calendar_slot(public.appointments) from public, anon, authenticated;

create or replace function private.guard_attorney_calendar_reschedule()
returns trigger language plpgsql security definer set search_path='' as $$
declare a public.appointments;
begin
  if new.reservation_managed then return new; end if;
  select * into a from public.appointments where appointment_id=new.appointment_id;
  if not (a.scheduling_owner_user_id is not null or exists(select 1 from public.attorney_firm_members m where m.user_id=a.created_by and m.status='active')
    or exists(select 1 from public.transaction_attorney_assignments ta where ta.transaction_id=a.transaction_id and coalesce(ta.assignment_status,ta.status,'active')='active')) then return new; end if;
  if (new.status,new.preferred_start,new.preferred_end) is not distinct from (old.status,old.preferred_start,old.preferred_end)
    or new.status not in ('proposed','accepted','rejected') then return new; end if;
  if current_setting('role')<>'service_role' and not private.attorney_calendar_can_manage(new.appointment_id) then
    raise exception 'Not authorised to coordinate this appointment'; end if;
  if private.calendar_status(a.status) in ('cancelled','completed','declined','no_show') then raise exception 'Closed appointments cannot be changed'; end if;
  if new.status='proposed' then
    perform private.check_attorney_calendar_slot(a);
    perform private.assert_calendar_slot(a,new.preferred_start,coalesce(new.preferred_end,new.preferred_start+interval '45 minutes'));
  end if;
  return new;
end;
$$;
revoke all on function private.guard_attorney_calendar_reschedule() from public,anon,authenticated;

create function private.calendar_receipt(a public.appointments) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('appointment',to_jsonb(a),'participants',coalesce(
    (select jsonb_agg(to_jsonb(p) order by p.created_at,p.participant_id) from public.appointment_participants p
      where p.appointment_id=a.appointment_id and (p.rsvp_revoked_at is null or private.calendar_status(a.status) in ('cancelled','completed','declined','no_show'))),'[]'::jsonb),'verified',true);
$$;
revoke all on function private.calendar_receipt(public.appointments) from public, anon, authenticated;

create function public.save_calendar_appointment(
  p_organisation_id uuid, p_appointment_id uuid, p_payload jsonb,
  p_participants jsonb, p_expected_revision integer, p_command_id uuid,
  p_action text default 'save', p_viewing_mode text default null, p_confirmation_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.appointments; previous public.appointments; p public.appointment_participants;
  candidate public.appointments; item jsonb; data jsonb; result jsonb; v_fingerprint jsonb;
  cols text; assignments text; person_id uuid; seen uuid[]:='{}'; material boolean:=false;
  created boolean; v_now timestamptz:=clock_timestamp(); v_status text; v_count integer; v_reset boolean:=false;
begin
  if auth.uid() is null or p_organisation_id is null or p_appointment_id is null or p_command_id is null
    or jsonb_typeof(p_payload)<>'object' or p_action not in ('save','reissue')
    or (p_participants is not null and jsonb_typeof(p_participants)<>'array')
    or coalesce(jsonb_array_length(p_participants),0)>100 then
    raise exception 'Invalid appointment save command.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  v_now:=clock_timestamp();
  select * into previous from public.appointments where appointment_id=p_appointment_id for update;
  created:=not found;
  if not created and (previous.organisation_id<>p_organisation_id or not public.bridge_can_write_appointment_payload(
    previous.transaction_id,previous.organisation_id,previous.created_by,previous.agent_id)) then
    raise exception 'Not authorised to manage this appointment.' using errcode='42501';
  end if;
  if created and not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'An active organisation membership is required.' using errcode='42501';
  end if;
  -- A fixed allowlist prevents client payloads from overriding server identity,
  -- hold timestamps, revisions, response state, or attorney/viewing capabilities.
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into data from jsonb_each(p_payload)
    where key=any(array['lead_id','agent_id','appointment_type','custom_type_label','title','appointment_date',
      'start_time','end_time','date_time','end_date_time','location_type','location','meeting_url','timezone','all_day',
      'contact_id','listing_id','transaction_id','related_entity_type','related_entity_id','linked_workflow',
      'linked_workflow_stage','linked_task_id','linked_transaction_stage','workflow_completion_effect','visibility_scope',
      'completion_behavior','appointment_instructions','required_documents','resource_id','allow_outside_business_hours',
      'scheduling_override_reason','status','notes','outcome_summary','client_feedback','agent_notes','next_step',
      'follow_up_date','cancellation_reason','offer_invite_id']);
  v_fingerprint:=jsonb_build_object('organisation',p_organisation_id,'appointment',p_appointment_id,'payload',data,
    'participants',p_participants,'revision',p_expected_revision,'action',p_action,'viewingMode',p_viewing_mode,'confirmationNote',p_confirmation_note);
  select r.result into result from private.calendar_mutation_receipts r
    where r.actor_id=auth.uid() and r.command_id=p_command_id and r.fingerprint=v_fingerprint;
  if found then return private.calendar_receipt(previous)||jsonb_build_object('replayed',true); end if;
  if exists(select 1 from private.calendar_mutation_receipts r where r.actor_id=auth.uid() and r.command_id=p_command_id) then
    raise exception 'This save identifier was already used for different details.' using errcode='22023';
  end if;
  if (not created and (p_expected_revision is null or previous.calendar_revision<>p_expected_revision))
    or (created and p_expected_revision is not null) then
    raise exception 'This appointment changed. Refresh before saving.' using errcode='40001';
  end if;
  candidate:=jsonb_populate_record(previous,data);
  candidate.organisation_id:=p_organisation_id; candidate.appointment_id:=p_appointment_id;
  candidate.created_by:=case when created then auth.uid() else previous.created_by end;
  if not public.bridge_can_write_appointment_payload(candidate.transaction_id,p_organisation_id,candidate.created_by,candidate.agent_id) then
    raise exception 'Not authorised to save these appointment details.' using errcode='42501';
  end if;
  if candidate.lead_id is not null and not exists(select 1 from public.leads l
    where l.lead_id=candidate.lead_id and l.organisation_id=p_organisation_id) then
    raise exception 'The linked lead belongs to another workspace.' using errcode='42501';
  end if;
  if candidate.contact_id is not null and not exists(select 1 from public.contacts c where c.contact_id=candidate.contact_id and c.organisation_id=p_organisation_id) then
    raise exception 'The linked contact belongs to another workspace.' using errcode='42501'; end if;
  if candidate.linked_task_id is not null and not exists(select 1 from public.transaction_checklist_items t where t.id=candidate.linked_task_id and t.transaction_id=candidate.transaction_id) then
    raise exception 'The linked task does not belong to this transaction.' using errcode='42501'; end if;
  if candidate.agent_id is not null and not exists(select 1 from public.organisation_users m
    where m.organisation_id=p_organisation_id and m.user_id=candidate.agent_id
      and lower(coalesce(m.membership_status,m.status,''))='active') and
    not (not created and candidate.agent_id is not distinct from previous.agent_id) then
    raise exception 'Choose an active agent from this organisation.' using errcode='42501';
  end if;
  perform private.check_attorney_calendar_slot(candidate);
  v_status:=private.calendar_status(candidate.status);
  if v_status not in ('draft','requested','accepted','alternative_requested','alternative_proposed','confirmed','completed','cancelled','declined','no_show') then
    raise exception 'Choose a recognised appointment status.' using errcode='22023';
  end if;
  material:=created or (candidate.date_time,private.calendar_end(candidate),candidate.appointment_date,candidate.start_time,candidate.end_time,
    candidate.timezone,candidate.all_day,candidate.location,candidate.meeting_url,candidate.resource_id,candidate.agent_id)
    is distinct from (previous.date_time,private.calendar_end(previous),previous.appointment_date,previous.start_time,previous.end_time,
    previous.timezone,previous.all_day,previous.location,previous.meeting_url,previous.resource_id,previous.agent_id);
  if not created and private.calendar_status(previous.status) in ('completed','cancelled','declined','no_show')
    and (material or v_status<>private.calendar_status(previous.status) or p_participants is not null or p_action='reissue') then
    raise exception 'Closed appointments cannot be reopened or moved.' using errcode='22023';
  end if;
  if not created and (private.calendar_status(previous.status)='confirmed' or previous.has_confirmed_reservation)
    and (candidate.date_time,private.calendar_end(candidate),candidate.appointment_date,candidate.start_time,candidate.end_time,candidate.timezone,candidate.all_day)
      is distinct from (previous.date_time,private.calendar_end(previous),previous.appointment_date,previous.start_time,previous.end_time,previous.timezone,previous.all_day) then
    raise exception 'Propose a replacement time; the confirmed appointment stays reserved until approval.' using errcode='22023';
  end if;
  if not created and (private.calendar_status(previous.status)='confirmed' or previous.has_confirmed_reservation)
    and (v_status='draft' or (v_status in ('requested','accepted') and not material and p_action<>'reissue')) then
    raise exception 'Use a replacement request or cancellation to change a confirmed booking.' using errcode='22023'; end if;
  if material or v_status not in ('cancelled','declined','completed','no_show') then
    if candidate.date_time is null or candidate.end_date_time is null or candidate.end_date_time<=candidate.date_time
      or (candidate.date_time at time zone candidate.timezone) is distinct from (candidate.appointment_date+candidate.start_time)
      or (not coalesce(candidate.all_day,false) and (candidate.end_date_time at time zone candidate.timezone)
        is distinct from (candidate.appointment_date+candidate.end_time))
      or (candidate.all_day and ((candidate.date_time at time zone candidate.timezone)::time<>time '00:00'
        or (candidate.end_date_time at time zone candidate.timezone) is distinct from ((candidate.appointment_date+1)::timestamp))) then
      raise exception 'The appointment date, time, duration and timezone disagree.' using errcode='22023';
    end if;
  end if;
  if v_status in ('completed','no_show') and candidate.date_time>v_now then
    raise exception 'Record this outcome after the appointment has started.' using errcode='22023';
  end if;
  v_reset:=material and not created;
  if v_reset and v_status not in ('draft','cancelled','declined','completed','no_show') then v_status:='requested'; end if;
  data:=data||jsonb_build_object('status',v_status,'appointment_id',p_appointment_id,'organisation_id',p_organisation_id,
    'created_by',candidate.created_by,'updated_at',v_now,
    'calendar_revision',case when created then 0 else previous.calendar_revision+1 end,
    'reservation_managed',p_viewing_mode is null and previous.attorney_delivery_enabled is null and previous.listing_viewing_round_number is null,
    'has_confirmed_reservation',v_status='confirmed' or ((private.calendar_status(previous.status)='confirmed' or coalesce(previous.has_confirmed_reservation,false)) and v_status in ('requested','accepted','alternative_requested','alternative_proposed')));
  if created then data:=data||jsonb_build_object('created_at',v_now,'reservation_managed',p_viewing_mode is null); end if;
  if (created and v_status in ('requested','accepted','alternative_requested','alternative_proposed','confirmed')) or p_action='reissue' or (not created and private.calendar_status(previous.status)='draft' and v_status='requested') then
    if candidate.date_time<=v_now then raise exception 'A new request needs a future appointment time.' using errcode='22023'; end if;
    data:=data||jsonb_build_object('request_issued_at',v_now,'hold_expires_at',least(v_now+interval '24 hours',candidate.date_time));
    v_reset:=not created;
  end if;
  if v_status='cancelled' then data:=data||jsonb_build_object('cancelled_at',coalesce(previous.cancelled_at,v_now),'cancelled_by',auth.uid()); end if;
  if v_status='completed' then data:=data||jsonb_build_object('completed_at',coalesce(previous.completed_at,v_now)); end if;
  select string_agg(format('%I',key),',' order by key),string_agg(format('%1$I=record.%1$I',key),',' order by key)
    into cols,assignments from jsonb_object_keys(data) key;
  if created then
    execute format('insert into public.appointments(%s) select %s from jsonb_populate_record(null::public.appointments,$1) returning *',cols,cols)
      into a using data;
  else
    execute format('update public.appointments target set %s from jsonb_populate_record(null::public.appointments,$1) record where target.appointment_id=$2 returning target.*',assignments)
      into a using data,p_appointment_id;
  end if;
  if p_participants is not null then
    for item in select value from jsonb_array_elements(p_participants) loop
      person_id:=nullif(item->>'participant_id','')::uuid;
      p:=null;
      if person_id is not null then
        select * into p from public.appointment_participants where participant_id=person_id and appointment_id=a.appointment_id;
        if not found then raise exception 'This attendee no longer belongs to the appointment. Refresh before saving.' using errcode='40001'; end if;
      else
        select * into p from public.appointment_participants existing where existing.appointment_id=a.appointment_id and
          ((nullif(item->>'user_id','') is not null and existing.user_id=(item->>'user_id')::uuid)
          or (nullif(item->>'contact_id','') is not null and existing.contact_id=(item->>'contact_id')::uuid)
          or (nullif(btrim(item->>'email'),'') is not null and lower(btrim(existing.email))=lower(btrim(item->>'email'))))
          and existing.participant_role=coalesce(item->>'participant_role','Other Contact') limit 1;
        person_id:=coalesce(p.participant_id,gen_random_uuid());
      end if;
      if nullif(item->>'contact_id','') is not null and not exists(select 1 from public.contacts c
        where c.contact_id=(item->>'contact_id')::uuid and c.organisation_id=a.organisation_id) then
        raise exception 'Choose an attendee contact from this workspace.' using errcode='42501'; end if;
      if person_id=any(seen) then raise exception 'An attendee was included more than once.' using errcode='22023'; end if;
      seen:=array_append(seen,person_id);
      if not created and ((p.participant_id is null and coalesce((item->>'is_required')::boolean,true)) or p.rsvp_revoked_at is not null) then v_reset:=true; end if;
      if p.participant_id is not null and (p.user_id,p.contact_id,lower(btrim(p.email)),p.participant_role,p.is_required)
        is distinct from (nullif(item->>'user_id','')::uuid,nullif(item->>'contact_id','')::uuid,
          nullif(lower(btrim(item->>'email')),''),coalesce(item->>'participant_role','Other Contact'),coalesce((item->>'is_required')::boolean,true)) then
        v_reset:=true;
        -- Archive the old person's response before replacing their identity.
        update public.appointment_participants set rsvp_status='Pending',responded_at=null,rsvp_comment=null,
          proposed_new_time=null,proposal_id=null,proposal_response=null where participant_id=person_id;
      end if;
      insert into public.appointment_participants(participant_id,appointment_id,organisation_id,user_id,contact_id,name,email,phone,participant_role,is_required,
        rsvp_status,rsvp_token,rsvp_expires_at,created_at,updated_at)
      values(person_id,a.appointment_id,a.organisation_id,nullif(item->>'user_id','')::uuid,nullif(item->>'contact_id','')::uuid,
        coalesce(nullif(btrim(item->>'name'),''),'Participant'),nullif(lower(btrim(item->>'email')),''),nullif(item->>'phone',''),
        coalesce(item->>'participant_role','Other Contact'),coalesce((item->>'is_required')::boolean,true),
        case when nullif(item->>'user_id','')::uuid=auth.uid() then 'Accepted' else 'Pending' end,
        gen_random_uuid()::text,a.date_time,v_now,v_now)
      on conflict(participant_id) do update set user_id=excluded.user_id,contact_id=excluded.contact_id,name=excluded.name,email=excluded.email,
        phone=excluded.phone,participant_role=excluded.participant_role,is_required=excluded.is_required,updated_at=v_now;
    end loop;
    update public.appointment_participants set rsvp_revoked_at=v_now,rsvp_token=null,updated_at=v_now
      where appointment_id=a.appointment_id and not(participant_id=any(seen)) and rsvp_revoked_at is null;
  end if;
  update public.appointment_reminders reminder set status='cancelled',updated_at=v_now
    from public.appointment_participants removed
    where reminder.appointment_id=a.appointment_id and removed.appointment_id=a.appointment_id
      and reminder.status='pending' and removed.rsvp_revoked_at is not null
      and ((removed.email is not null and lower(reminder.recipient_email)=lower(removed.email))
        or reminder.recipient_id in (removed.participant_id,removed.user_id)
        or reminder.metadata->>'participantId'=removed.participant_id::text);
  if v_reset then
    update public.appointment_reschedule_requests set status='cancelled',updated_at=v_now where appointment_id=a.appointment_id and status in ('pending','proposed');
    update public.appointment_reminders set status='cancelled',updated_at=v_now where appointment_id=a.appointment_id and status='pending';
    update public.appointment_participants set rsvp_status=case when user_id=auth.uid() then 'Accepted' else 'Pending' end,
      responded_at=null,proposed_new_time=null,rsvp_comment=null,rsvp_revoked_at=null,rsvp_token=gen_random_uuid()::text,
      rsvp_expires_at=a.date_time,proposal_id=null,proposal_response=null,updated_at=v_now
      where appointment_id=a.appointment_id and (p_participants is null and rsvp_revoked_at is null or participant_id=any(seen));
    if private.calendar_status(a.status) not in ('cancelled','declined','completed','no_show','draft') then
      update public.appointments set status=case when private.calendar_status(previous.status)='confirmed' or previous.has_confirmed_reservation then 'alternative_requested' else 'requested' end,
        has_confirmed_reservation=private.calendar_status(previous.status)='confirmed' or coalesce(previous.has_confirmed_reservation,false) where appointment_id=a.appointment_id returning * into a;
    end if;
  end if;
  if material and not created then
    update public.appointments set external_calendar_status='not_synced',ics_generated_at=null where appointment_id=a.appointment_id returning * into a;
  end if;
  if private.calendar_status(a.status)='confirmed' then
    if not created and not private.calendar_reserves(previous,v_now) then
      raise exception 'This hold expired. Check availability and issue a new request.' using errcode='22023';
    end if;
    if exists(select 1 from public.appointment_participants where appointment_id=a.appointment_id and rsvp_revoked_at is null
      and is_required and lower(rsvp_status)<>'accepted') then
      raise exception 'Required attendees must accept the current request before confirmation.' using errcode='22023';
    end if;
  end if;
  if private.calendar_status(a.status) in ('cancelled','declined','completed','no_show') then
    update public.appointment_participants set rsvp_revoked_at=v_now,rsvp_token=null,updated_at=v_now
      where appointment_id=a.appointment_id and rsvp_revoked_at is null;
    update public.appointment_reschedule_requests set status='cancelled',updated_at=v_now where appointment_id=a.appointment_id and status in ('pending','proposed');
    update public.appointment_reminders set status='cancelled',updated_at=v_now where appointment_id=a.appointment_id and status='pending';
  end if;
  if private.calendar_status(a.status)='completed' and a.linked_task_id is not null then
    update public.transaction_checklist_items set status='completed',updated_at=v_now
      where id=a.linked_task_id and transaction_id=a.transaction_id;
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception 'The linked task could not be completed. No appointment changes were saved.' using errcode='40001'; end if;
  end if;
  if created and p_viewing_mode is not null then
    if p_viewing_mode='three_party_book' then
      perform public.book_listing_viewing_by_agent(a.organisation_id,a.appointment_id,p_confirmation_note);
    elsif p_viewing_mode='three_party_request' then
      perform public.initialize_listing_viewing_request(a.organisation_id,a.appointment_id);
    else raise exception 'Invalid viewing workflow.' using errcode='22023'; end if;
    select * into a from public.appointments where appointment_id=a.appointment_id;
  end if;
  perform private.assert_calendar_slot(a);
  result:=private.calendar_receipt(a);
  insert into private.calendar_mutation_receipts(actor_id,command_id,appointment_id,fingerprint,result)
    values(auth.uid(),p_command_id,a.appointment_id,v_fingerprint,result);
  return result;
end;
$$;
revoke all on function public.save_calendar_appointment(uuid,uuid,jsonb,jsonb,integer,uuid,text,text,text) from public, anon;
grant execute on function public.save_calendar_appointment(uuid,uuid,jsonb,jsonb,integer,uuid,text,text,text) to authenticated;

create function private.apply_calendar_proposal(a public.appointments,r public.appointment_reschedule_requests)
returns public.appointments language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_timezone text:=coalesce(r.proposed_timezone,a.timezone); v_all_day boolean:=coalesce(r.proposed_all_day,a.all_day);
begin
  if r.appointment_id<>a.appointment_id or r.status<>'proposed' or r.hold_expires_at<=v_now
    or r.preferred_start<=v_now then raise exception 'This proposal expired or changed. Issue a new proposal.' using errcode='40001'; end if;
  if exists(select 1 from public.appointment_participants p where p.appointment_id=a.appointment_id and p.rsvp_revoked_at is null
    and p.is_required and (p.proposal_id is distinct from r.id or p.proposal_response is distinct from 'Accepted')) then
    raise exception 'Required attendees must approve this replacement before the appointment moves.' using errcode='22023';
  end if;
  perform private.assert_calendar_slot(a,r.preferred_start,r.preferred_end);
  update public.appointments set date_time=r.preferred_start,end_date_time=r.preferred_end,
    appointment_date=(r.preferred_start at time zone v_timezone)::date,timezone=v_timezone,all_day=v_all_day,
    start_time=(r.preferred_start at time zone v_timezone)::time,end_time=case when v_all_day then time '23:59' else (r.preferred_end at time zone v_timezone)::time end,
    status='confirmed',has_confirmed_reservation=true,calendar_revision=calendar_revision+1,
    external_calendar_status='not_synced',ics_generated_at=null,updated_at=v_now where appointment_id=a.appointment_id returning * into a;
  update public.appointment_reschedule_requests set status='accepted',reviewed_at=v_now,reviewed_by=auth.uid(),updated_at=v_now where id=r.id;
  update public.appointment_participants set rsvp_status=case when proposal_response='Accepted' then 'Accepted' else 'Pending' end,
    responded_at=case when proposal_response='Accepted' then v_now end,rsvp_token=gen_random_uuid()::text,
    rsvp_expires_at=a.date_time,proposal_id=null,proposal_response=null,updated_at=v_now
    where appointment_id=a.appointment_id and rsvp_revoked_at is null;
  update public.appointment_reminders set status='cancelled',updated_at=v_now where appointment_id=a.appointment_id and status='pending';
  return a;
end;
$$;
revoke all on function private.apply_calendar_proposal(public.appointments,public.appointment_reschedule_requests) from public, anon, authenticated;

create function public.mutate_calendar_proposal(p_appointment_id uuid,p_expected_revision integer,p_command_id uuid,
  p_action text,p_request_id uuid default null,p_start timestamptz default null,p_end timestamptz default null,p_reason text default null,p_timezone text default null,p_all_day boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; r public.appointment_reschedule_requests; v_now timestamptz:=clock_timestamp();
  v_fingerprint jsonb; result jsonb; v_original text; v_status text; v_timezone text; v_all_day boolean;
begin
  if auth.uid() is null or p_command_id is null or p_action not in ('request','propose','approve','reject') then
    raise exception 'Invalid proposal command.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  v_now:=clock_timestamp();
  select * into a from public.appointments where appointment_id=p_appointment_id for update;
  if not found or not public.bridge_can_write_appointment_payload(a.transaction_id,a.organisation_id,a.created_by,a.agent_id) then
    raise exception 'Not authorised to manage this appointment.' using errcode='42501'; end if;
  if a.attorney_delivery_enabled is not null or a.listing_viewing_round_number is not null then raise exception 'Use this appointment’s existing specialist reschedule workflow.' using errcode='22023'; end if;
  v_fingerprint:=jsonb_build_object('appointment',p_appointment_id,'revision',p_expected_revision,'action',p_action,
    'request',p_request_id,'start',p_start,'end',p_end,'reason',p_reason,'timezone',p_timezone,'allDay',p_all_day);
  select saved.result into result from private.calendar_mutation_receipts saved
    where saved.actor_id=auth.uid() and saved.command_id=p_command_id and saved.fingerprint=v_fingerprint;
  if found then
    select * into r from public.appointment_reschedule_requests where id=(result->'request'->>'id')::uuid and appointment_id=a.appointment_id;
    return private.calendar_receipt(a)||jsonb_build_object('request',to_jsonb(r),'replayed',true);
  end if;
  if exists(select 1 from private.calendar_mutation_receipts where actor_id=auth.uid() and command_id=p_command_id) then
    raise exception 'This command identifier was already used.' using errcode='22023'; end if;
  if p_expected_revision is null or a.calendar_revision<>p_expected_revision then
    raise exception 'The appointment changed. Refresh before deciding on this proposal.' using errcode='40001'; end if;
  if private.calendar_status(a.status) in ('draft','completed','cancelled','declined','no_show') or a.date_time<=v_now then
    raise exception 'This appointment cannot receive a replacement proposal.' using errcode='22023'; end if;
  if p_request_id is not null then
    select * into r from public.appointment_reschedule_requests where id=p_request_id and appointment_id=a.appointment_id for update;
    if not found or not r.reservation_managed or r.status not in ('pending','proposed') then
      raise exception 'This proposal changed or was already closed.' using errcode='40001'; end if;
  end if;
  if p_action in ('request','propose') then
    v_timezone:=coalesce(p_timezone,a.timezone); v_all_day:=coalesce(p_all_day,a.all_day);
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then raise exception 'Choose a valid appointment timezone.' using errcode='22023'; end if;
    if p_action='propose' and (p_start is null or p_end is null or p_start<=v_now or p_end<=p_start
      or (not v_all_day and (p_start at time zone v_timezone)::date<>(p_end at time zone v_timezone)::date)
      or (v_all_day and ((p_start at time zone v_timezone)::time<>time '00:00' or (p_end at time zone v_timezone)<>((p_start at time zone v_timezone)::date+1)::timestamp))) then
      raise exception 'Choose a future replacement start and end on the same day.' using errcode='22023'; end if;
    if p_action='propose' then perform private.assert_calendar_slot(a,p_start,p_end); end if;
    v_original:=coalesce(r.original_status,case when a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' then 'confirmed' else 'requested' end);
    update public.appointment_reschedule_requests set status='cancelled',updated_at=v_now
      where appointment_id=a.appointment_id and reservation_managed and status in ('pending','proposed') and id is distinct from r.id;
    if r.id is null then
      insert into public.appointment_reschedule_requests(appointment_id,requested_by,requested_by_role,reason,preferred_start,preferred_end,
        status,reservation_managed,hold_expires_at,proposal_revision,original_status,proposed_timezone,proposed_all_day,created_at,updated_at)
      values(a.appointment_id,auth.uid(),'Agent',p_reason,p_start,p_end,case when p_action='propose' then 'proposed' else 'pending' end,
        true,case when p_action='propose' then least(v_now+interval '24 hours',p_start) end,1,v_original,v_timezone,v_all_day,v_now,v_now) returning * into r;
    else
      update public.appointment_reschedule_requests set reason=p_reason,preferred_start=p_start,preferred_end=p_end,
        status=case when p_action='propose' then 'proposed' else 'pending' end,hold_expires_at=case when p_action='propose' then least(v_now+interval '24 hours',p_start) end,
        proposal_revision=proposal_revision+1,proposed_timezone=v_timezone,proposed_all_day=v_all_day,updated_at=v_now where id=r.id returning * into r;
    end if;
    update public.appointments set reservation_managed=true,status=case when p_action='propose' then 'alternative_proposed' else 'alternative_requested' end,
      has_confirmed_reservation=v_original='confirmed',calendar_revision=calendar_revision+1,updated_at=v_now where appointment_id=a.appointment_id returning * into a;
    if p_action='propose' then
      update public.appointment_participants set proposal_id=r.id,proposal_response=case when user_id=auth.uid() then 'Accepted' end,
        rsvp_token=gen_random_uuid()::text,rsvp_expires_at=r.hold_expires_at,updated_at=v_now
        where appointment_id=a.appointment_id and rsvp_revoked_at is null;
      if not exists(select 1 from public.appointment_participants participant where participant.appointment_id=a.appointment_id
        and participant.rsvp_revoked_at is null and participant.is_required
        and (participant.proposal_id is distinct from r.id or participant.proposal_response is distinct from 'Accepted')) then
        a:=private.apply_calendar_proposal(a,r);
        select * into r from public.appointment_reschedule_requests where id=r.id;
      end if;
    end if;
  elsif p_action='approve' then
    if r.id is null then raise exception 'Choose the current replacement proposal.' using errcode='22023'; end if;
    a:=private.apply_calendar_proposal(a,r);
    select * into r from public.appointment_reschedule_requests where id=r.id;
  else
    if r.id is null then raise exception 'Choose the current replacement proposal.' using errcode='22023'; end if;
    update public.appointment_reschedule_requests set status='rejected',reviewed_at=v_now,reviewed_by=auth.uid(),updated_at=v_now where id=r.id returning * into r;
    update public.appointments set status=r.original_status,has_confirmed_reservation=r.original_status='confirmed',
      calendar_revision=calendar_revision+1,updated_at=v_now where appointment_id=a.appointment_id returning * into a;
    update public.appointment_participants set proposal_id=null,proposal_response=null,rsvp_token=gen_random_uuid()::text,
      rsvp_expires_at=a.date_time,updated_at=v_now where appointment_id=a.appointment_id and rsvp_revoked_at is null;
  end if;
  result:=private.calendar_receipt(a)||jsonb_build_object('request',to_jsonb(r));
  insert into private.calendar_mutation_receipts(actor_id,command_id,appointment_id,fingerprint,result) values(auth.uid(),p_command_id,a.appointment_id,v_fingerprint,result);
  return result;
end;
$$;
revoke all on function public.mutate_calendar_proposal(uuid,integer,uuid,text,uuid,timestamptz,timestamptz,text,text,boolean) from public, anon;
grant execute on function public.mutate_calendar_proposal(uuid,integer,uuid,text,uuid,timestamptz,timestamptz,text,text,boolean) to authenticated;

-- Keep the existing specialist response implementation unchanged.
create function private.commit_appointment_response_before_holds(
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

revoke all on function private.commit_appointment_response_before_holds(uuid,uuid,text,timestamptz,timestamptz,text,boolean,timestamptz,text) from public, anon, authenticated;

create or replace function private.commit_appointment_response(
  p_appointment_id uuid,p_participant_id uuid,p_status text,p_preferred_start timestamptz,p_preferred_end timestamptz,p_comment text,
  p_allow_change boolean default false,p_expected_start timestamptz default null,p_expected_token text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; p public.appointment_participants; r public.appointment_reschedule_requests;
  v_now timestamptz:=clock_timestamp(); v_status text; v_end timestamptz; v_proposal boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  v_now:=clock_timestamp();
  select * into a from public.appointments where appointment_id=p_appointment_id for update;
  if private.calendar_is_specialist(a) then
    return private.commit_appointment_response_before_holds(p_appointment_id,p_participant_id,p_status,
      p_preferred_start,p_preferred_end,p_comment,p_allow_change,p_expected_start,p_expected_token);
  end if;
  select * into p from public.appointment_participants where participant_id=p_participant_id and appointment_id=p_appointment_id for update;
  if a.appointment_id is null or p.participant_id is null or p.rsvp_revoked_at is not null
    or (p.rsvp_expires_at is not null and p.rsvp_expires_at<=v_now)
    or (p_expected_token is not null and p.rsvp_token is distinct from p_expected_token) then
    raise exception 'This invitation was removed, replaced or expired.' using errcode='42501'; end if;
  if p_status is null or p_status not in ('Accepted','Declined','Proposed New Time') or length(coalesce(p_comment,''))>1000 then
    raise exception 'Invalid appointment response.' using errcode='22023'; end if;
  if p_expected_start is not null and a.date_time is distinct from p_expected_start then
    raise exception 'This appointment changed. Refresh before responding.' using errcode='40001'; end if;
  if private.calendar_status(a.status) in ('draft','cancelled','completed','declined','no_show') or a.date_time<=v_now then
    raise exception 'Closed or started appointments cannot receive responses.' using errcode='22023'; end if;
  select * into r from public.appointment_reschedule_requests where id=p.proposal_id and appointment_id=a.appointment_id
    and reservation_managed and status='proposed' for update;
  v_proposal:=found;
  if v_proposal then
    if r.hold_expires_at<=v_now then raise exception 'This replacement proposal expired.' using errcode='22023'; end if;
    if p.proposal_response=p_status and p_status<>'Proposed New Time' then
      return jsonb_build_object('participantId',p.participant_id,'appointmentId',a.appointment_id,'transactionId',a.transaction_id,
        'rsvpStatus',p_status,'respondedAt',p.updated_at,'status',a.status,'replayed',true); end if;
    if p_status='Accepted' then
      update public.appointment_participants set proposal_response='Accepted',updated_at=v_now where participant_id=p.participant_id;
      if not exists(select 1 from public.appointment_participants where appointment_id=a.appointment_id and rsvp_revoked_at is null and is_required
        and (proposal_id is distinct from r.id or proposal_response is distinct from 'Accepted')) then
        a:=private.apply_calendar_proposal(a,r);
      else
        update public.appointments set calendar_revision=calendar_revision+1,updated_at=v_now where appointment_id=a.appointment_id returning * into a;
      end if;
    elsif not p.is_required then
      update public.appointment_participants set proposal_response=p_status,updated_at=v_now where participant_id=p.participant_id;
      update public.appointments set calendar_revision=calendar_revision+1,updated_at=v_now where appointment_id=a.appointment_id returning * into a;
    else
      update public.appointment_reschedule_requests set status='rejected',reviewed_at=v_now,updated_at=v_now where id=r.id;
      update public.appointments set status=r.original_status,has_confirmed_reservation=r.original_status='confirmed',
        calendar_revision=calendar_revision+1,updated_at=v_now where appointment_id=a.appointment_id returning * into a;
      update public.appointment_participants set proposal_id=null,proposal_response=null,rsvp_token=gen_random_uuid()::text,
        rsvp_expires_at=a.date_time,updated_at=v_now where appointment_id=a.appointment_id and rsvp_revoked_at is null;
      if p_status='Proposed New Time' then
        v_end:=coalesce(p_preferred_end,p_preferred_start+(private.calendar_end(a)-a.date_time));
        if p_preferred_start is null or p_preferred_start<=v_now or v_end<=p_preferred_start then
          raise exception 'Choose a future preferred start and end.' using errcode='22023'; end if;
        insert into public.appointment_reschedule_requests(appointment_id,participant_id,requested_by,requested_by_role,reason,
          preferred_start,preferred_end,status,reservation_managed,original_status)
          values(a.appointment_id,p.participant_id,p.user_id,p.participant_role,p_comment,p_preferred_start,v_end,'pending',true,r.original_status);
        update public.appointment_participants set rsvp_status=p_status,responded_at=v_now,proposed_new_time=p_preferred_start,rsvp_comment=p_comment where participant_id=p.participant_id;
        update public.appointments set status='alternative_requested' where appointment_id=a.appointment_id returning * into a;
      end if;
    end if;
  else
    if not private.calendar_reserves(a,v_now) then
      raise exception 'The 24 hour hold expired. Ask the agent to issue a new request.' using errcode='22023'; end if;
    if p.responded_at is not null and not p_allow_change then
      if p.rsvp_status<>p_status or (p_status='Proposed New Time' and p.proposed_new_time is distinct from p_preferred_start) then
        raise exception 'This response was already recorded.' using errcode='22023'; end if;
      return jsonb_build_object('participantId',p.participant_id,'appointmentId',a.appointment_id,'transactionId',a.transaction_id,
        'rsvpStatus',p.rsvp_status,'respondedAt',p.responded_at,'status',a.status,'replayed',true);
    end if;
    if p_status='Proposed New Time' then
      v_end:=coalesce(p_preferred_end,p_preferred_start+(private.calendar_end(a)-a.date_time));
      if p_preferred_start is null or p_preferred_start<=v_now or v_end<=p_preferred_start
        or (p_preferred_start at time zone a.timezone)::date<>(v_end at time zone a.timezone)::date then
        raise exception 'Choose a future preferred start and end on the same day.' using errcode='22023'; end if;
      insert into public.appointment_reschedule_requests(appointment_id,participant_id,requested_by,requested_by_role,
        reason,preferred_start,preferred_end,status,reservation_managed,original_status)
      values(a.appointment_id,p.participant_id,p.user_id,p.participant_role,p_comment,p_preferred_start,v_end,'pending',true,
        case when private.calendar_status(a.status)='confirmed' or a.has_confirmed_reservation then 'confirmed' else 'requested' end);
    end if;
    update public.appointment_participants set rsvp_status=p_status,responded_at=v_now,rsvp_comment=p_comment,
      proposed_new_time=case when p_status='Proposed New Time' then p_preferred_start end,updated_at=v_now where participant_id=p.participant_id;
    if p_status='Declined' then
      update public.appointment_reminders set status='cancelled',updated_at=v_now where appointment_id=a.appointment_id and status='pending'
        and ((p.email is not null and lower(recipient_email)=lower(p.email)) or recipient_id in (p.participant_id,p.user_id) or metadata->>'participantId'=p.participant_id::text);
    end if;
    v_status:=case
      when p.is_required and (p_status='Proposed New Time' or ((private.calendar_status(a.status)='confirmed' or a.has_confirmed_reservation) and p_status='Declined')) then 'alternative_requested'
      when not exists(select 1 from public.appointment_participants where appointment_id=a.appointment_id and rsvp_revoked_at is null
        and is_required and lower(rsvp_status)<>'accepted') then 'confirmed'
      when p_status='Accepted' then 'accepted' else 'requested' end;
    update public.appointments set status=v_status,reservation_managed=true,
      has_confirmed_reservation=v_status='confirmed' or (v_status='alternative_requested' and (private.calendar_status(a.status)='confirmed' or a.has_confirmed_reservation)),
      calendar_revision=calendar_revision+1,updated_at=v_now where appointment_id=a.appointment_id returning * into a;
    perform private.assert_calendar_slot(a);
  end if;
  return jsonb_build_object('participantId',p.participant_id,'appointmentId',a.appointment_id,'transactionId',a.transaction_id,
    'rsvpStatus',p_status,'respondedAt',v_now,'status',a.status,'replayed',false);
end;
$$;
revoke all on function private.commit_appointment_response(uuid,uuid,text,timestamptz,timestamptz,text,boolean,timestamptz,text) from public, anon, authenticated;

create function public.respond_calendar_appointment(p_appointment_id uuid,p_participant_id uuid,p_expected_revision integer,
  p_command_id uuid,p_status text,p_start timestamptz default null,p_end timestamptz default null,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; p public.appointment_participants; v_fingerprint jsonb; result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  select * into a from public.appointments where appointment_id=p_appointment_id for update;
  select * into p from public.appointment_participants where participant_id=p_participant_id and appointment_id=p_appointment_id;
  if auth.uid() is null or p_command_id is null or p.user_id is distinct from auth.uid() or p.rsvp_revoked_at is not null
    or not public.bridge_is_active_member(a.organisation_id) or not a.reservation_managed then
    raise exception 'You can respond only to your own current invitation.' using errcode='42501'; end if;
  v_fingerprint:=jsonb_build_object('appointment',p_appointment_id,'participant',p_participant_id,'revision',p_expected_revision,
    'status',p_status,'start',p_start,'end',p_end,'comment',p_comment);
  select saved.result into result from private.calendar_mutation_receipts saved where saved.actor_id=auth.uid() and saved.command_id=p_command_id and saved.fingerprint=v_fingerprint;
  if found then return result||jsonb_build_object('replayed',true); end if;
  if exists(select 1 from private.calendar_mutation_receipts where actor_id=auth.uid() and command_id=p_command_id) then
    raise exception 'This response identifier was already used.' using errcode='22023'; end if;
  if p_expected_revision is null or a.calendar_revision<>p_expected_revision then raise exception 'The invitation changed. Refresh before responding.' using errcode='40001'; end if;
  result:=private.commit_appointment_response(p_appointment_id,p_participant_id,p_status,p_start,p_end,p_comment,true,a.date_time,p.rsvp_token)||jsonb_build_object('verified',true);
  insert into private.calendar_mutation_receipts(actor_id,command_id,appointment_id,fingerprint,result) values(auth.uid(),p_command_id,a.appointment_id,v_fingerprint,result);
  return result;
end;
$$;
revoke all on function public.respond_calendar_appointment(uuid,uuid,integer,uuid,text,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.respond_calendar_appointment(uuid,uuid,integer,uuid,text,timestamptz,timestamptz,text) to authenticated;

-- These existing specialist commands were SECURITY INVOKER and deliberately
-- used browser RLS. Keep their explicit firm/payload authorization while moving
-- execution behind a server boundary, so the new browser guard also protects
-- against direct writes disguised as a specialist appointment.
do $install_specialist_commands$
begin
  if to_regprocedure('public.create_attorney_appointment_invite(jsonb,jsonb,boolean,boolean)') is not null then
    execute 'alter function public.create_attorney_appointment_invite(jsonb,jsonb,boolean,boolean) set schema private';
    execute 'revoke all on function private.create_attorney_appointment_invite(jsonb,jsonb,boolean,boolean) from public,anon,authenticated';
    execute $definition$
      create function public.create_attorney_appointment_invite(p_appointment jsonb,p_participants jsonb,p_send_notifications boolean default true,p_attach_calendar boolean default true)
      returns jsonb language plpgsql security definer set search_path='' as $body$
      begin
        if auth.uid() is null or not public.bridge_can_write_appointment_payload(
          nullif(p_appointment->>'transaction_id','')::uuid,(p_appointment->>'organisation_id')::uuid,auth.uid(),null) then
          raise exception 'Not authorised to create this appointment.' using errcode='42501';
        end if;
        -- The retained command checks active firm membership, matter assignment,
        -- payload scope, organiser identity and every recipient before commit.
        return private.create_attorney_appointment_invite(p_appointment,p_participants,p_send_notifications,p_attach_calendar);
      end;
      $body$;
    $definition$;
    execute 'revoke all on function public.create_attorney_appointment_invite(jsonb,jsonb,boolean,boolean) from public,anon';
    execute 'grant execute on function public.create_attorney_appointment_invite(jsonb,jsonb,boolean,boolean) to authenticated';
    execute $definition$
      create or replace function public.manage_attorney_appointment(p_appointment_id uuid,p_action text,p_expected_updated_at timestamptz,p_changes jsonb default '{}'::jsonb)
      returns jsonb language plpgsql security definer set search_path='' as $body$
      begin
        if not private.attorney_calendar_can_manage(p_appointment_id) then
          raise exception 'Not authorised to manage this appointment.' using errcode='42501';
        end if;
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
        if exists(select 1 from public.appointments where appointment_id=p_appointment_id and reservation_managed) then
          raise exception 'Use the verified appointment save command.' using errcode='42501';
        end if;
        update public.appointments set attorney_delivery_enabled=coalesce(attorney_delivery_enabled,true) where appointment_id=p_appointment_id;
        return private.manage_attorney_appointment(p_appointment_id,p_action,p_expected_updated_at,p_changes);
      end;
      $body$;
    $definition$;
  end if;
end;
$install_specialist_commands$;

-- Older response and specialist proposal endpoints lock rows before their first
-- UPDATE. Take the common reservation lock before those row locks, otherwise a
-- response can hold a row while a competing save holds the advisory lock. Keep
-- each installed definition and its existing authorization/return shape intact.
do $align_calendar_lock_order$
declare v_signature text; v_oid regprocedure; v_definition text; v_locked text;
begin
  foreach v_signature in array array[
    'public.submit_appointment_rsvp(text,text,timestamptz,timestamptz,text)',
    'public.bridge_respond_client_portal_appointment(text,uuid,uuid,text,timestamptz,timestamptz,timestamptz,text,text)',
    'public.propose_attorney_appointment_reschedule(uuid,timestamptz,timestamptz,text,jsonb)',
    'public.resolve_attorney_appointment_reschedule(uuid,text,timestamptz,timestamptz,text)',
    'public.initialize_listing_viewing_request(uuid,uuid)',
    'public.book_listing_viewing_by_agent(uuid,uuid,text)'
  ] loop
    v_oid:=to_regprocedure(v_signature);
    if v_oid is null then continue; end if;
    v_definition:=pg_catalog.pg_get_functiondef(v_oid);
    v_locked:=regexp_replace(v_definition,'(?in)^begin[[:blank:]]*$',
      E'begin\n  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''attorney_calendar_scheduling'',0));');
    if v_locked=v_definition then raise exception 'Cannot align calendar lock order for %',v_signature; end if;
    execute v_locked;
  end loop;
end;
$align_calendar_lock_order$;

-- Browser writes cannot fabricate hold deadlines, overwrite other attendees'
-- responses, revive removed tokens, or bypass the verified command endpoint.
create function private.protect_calendar_appointment_command() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and (
    tg_op='INSERT'
    or (tg_op='UPDATE' and (old.reservation_managed or new.reservation_managed or public.bridge_calendar_requires_command(old.appointment_id)) and
      (new.date_time,new.end_date_time,new.appointment_date,new.start_time,new.end_time,new.timezone,new.all_day,new.status,new.agent_id,
       new.location,new.meeting_url,new.created_by,new.organisation_id,new.appointment_id,new.transaction_id,new.lead_id,new.linked_task_id,new.resource_id,new.request_issued_at,new.hold_expires_at,new.has_confirmed_reservation,new.reservation_managed,new.calendar_revision)
      is distinct from
      (old.date_time,old.end_date_time,old.appointment_date,old.start_time,old.end_time,old.timezone,old.all_day,old.status,old.agent_id,
       old.location,old.meeting_url,old.created_by,old.organisation_id,old.appointment_id,old.transaction_id,old.lead_id,old.linked_task_id,old.resource_id,old.request_issued_at,old.hold_expires_at,old.has_confirmed_reservation,old.reservation_managed,old.calendar_revision))
    or (tg_op='UPDATE' and (new.request_issued_at,new.hold_expires_at,new.has_confirmed_reservation,new.reservation_managed,new.attorney_delivery_enabled,new.listing_viewing_round_number)
      is distinct from (old.request_issued_at,old.hold_expires_at,old.has_confirmed_reservation,old.reservation_managed,old.attorney_delivery_enabled,old.listing_viewing_round_number))
    or tg_op='DELETE'
  ) then raise exception 'Use the verified appointment save command.' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_calendar_appointment_command() from public, anon, authenticated;
create trigger calendar_protect_appointment before insert or update or delete on public.appointments
  for each row execute function private.protect_calendar_appointment_command();
-- Existing privileged writers also advance the revision. A fresh browser
-- command cannot silently overwrite a time/status changed through another path.
create function private.protect_confirmed_calendar_time() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.reservation_managed and (private.calendar_status(old.status)='confirmed' or old.has_confirmed_reservation)
    and (new.date_time,private.calendar_end(new),new.appointment_date,new.start_time,new.end_time,new.timezone,new.all_day)
      is distinct from (old.date_time,private.calendar_end(old),old.appointment_date,old.start_time,old.end_time,old.timezone,old.all_day)
    and not exists(select 1 from public.appointment_reschedule_requests r where r.appointment_id=old.appointment_id
      and r.reservation_managed and r.status='proposed' and r.hold_expires_at>clock_timestamp()
      and r.preferred_start=new.date_time and r.preferred_end=new.end_date_time
      and not exists(select 1 from public.appointment_participants p where p.appointment_id=old.appointment_id and p.rsvp_revoked_at is null
        and p.is_required and (p.proposal_id is distinct from r.id or p.proposal_response is distinct from 'Accepted'))) then
    raise exception 'Required attendees must approve the replacement before the confirmed time moves.' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_confirmed_calendar_time() from public,anon,authenticated;
create trigger calendar_original_reservation_guard before update on public.appointments
  for each row execute function private.protect_confirmed_calendar_time();

create function private.advance_calendar_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not private.calendar_is_specialist(old) and new.calendar_revision=old.calendar_revision and
    (new.date_time,new.end_date_time,new.appointment_date,new.start_time,new.end_time,new.timezone,new.all_day,new.status,new.agent_id,
      new.scheduling_owner_user_id,new.resource_id,new.location,new.meeting_url,new.lead_id,new.contact_id,new.listing_id,
      new.transaction_id,new.linked_task_id,new.notes,new.outcome_summary,new.client_feedback,new.agent_notes,new.next_step)
    is distinct from
    (old.date_time,old.end_date_time,old.appointment_date,old.start_time,old.end_time,old.timezone,old.all_day,old.status,old.agent_id,
      old.scheduling_owner_user_id,old.resource_id,old.location,old.meeting_url,old.lead_id,old.contact_id,old.listing_id,
      old.transaction_id,old.linked_task_id,old.notes,old.outcome_summary,old.client_feedback,old.agent_notes,old.next_step) then
    new.calendar_revision:=old.calendar_revision+1;
  end if;
  return new;
end;
$$;
revoke all on function private.advance_calendar_revision() from public,anon,authenticated;
create trigger calendar_revision_guard before update on public.appointments for each row execute function private.advance_calendar_revision();

create function private.protect_calendar_participant_command() returns trigger
language plpgsql set search_path='' as $$
declare v_id uuid; v_managed boolean;
begin
  v_id:=case when tg_op='DELETE' then old.appointment_id else new.appointment_id end;
  v_managed:=public.bridge_calendar_requires_command(v_id);
  if current_user in ('authenticated','anon') and v_managed and (tg_op<>'UPDATE' or
    (new.user_id,new.contact_id,new.email,new.participant_role,new.is_required,new.rsvp_status,new.rsvp_token,new.responded_at,new.rsvp_revoked_at,
     new.proposal_id,new.proposal_response,new.appointment_id,new.organisation_id)
    is distinct from
    (old.user_id,old.contact_id,old.email,old.participant_role,old.is_required,old.rsvp_status,old.rsvp_token,old.responded_at,old.rsvp_revoked_at,
     old.proposal_id,old.proposal_response,old.appointment_id,old.organisation_id)) then
    raise exception 'Use the verified attendee or response command.' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_calendar_participant_command() from public, anon, authenticated;
create trigger calendar_protect_participant before insert or update or delete on public.appointment_participants
  for each row execute function private.protect_calendar_participant_command();

create function public.get_calendar_invitation_context(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.appointments; p public.appointment_participants; r public.appointment_reschedule_requests;
begin
  select * into p from public.appointment_participants where rsvp_token=nullif(btrim(p_token),'') and rsvp_revoked_at is null;
  if not found then return null; end if;
  select * into a from public.appointments where appointment_id=p.appointment_id;
  if private.calendar_is_specialist(a) then return jsonb_build_object('managed',false); end if;
  select * into r from public.appointment_reschedule_requests where id=p.proposal_id and status='proposed' and hold_expires_at>now();
  if private.calendar_status(a.status) in ('draft','cancelled','completed','declined','no_show') or a.date_time<=now()
    or (p.rsvp_expires_at is not null and p.rsvp_expires_at<=now()) or (r.id is null and not private.calendar_reserves(a,now())) then return null; end if;
  -- Return only this token holder's client-visible schedule and response; no
  -- attendee list, private notes, ownership identities or management capability.
  return jsonb_build_object('managed',true,'proposal',r.id is not null,'title',a.title,'timezone',coalesce(r.proposed_timezone,a.timezone),'all_day',coalesce(r.proposed_all_day,a.all_day),
    'appointment_date',case when r.id is not null then (r.preferred_start at time zone coalesce(r.proposed_timezone,a.timezone))::date else a.appointment_date end,
    'start_time',case when r.id is not null then (r.preferred_start at time zone coalesce(r.proposed_timezone,a.timezone))::time else a.start_time end,
    'end_time',case when r.id is not null then (r.preferred_end at time zone coalesce(r.proposed_timezone,a.timezone))::time else a.end_time end,
    'date_time',coalesce(r.preferred_start,a.date_time),'end_date_time',coalesce(r.preferred_end,a.end_date_time),
    'rsvp_status',case when r.id is not null then coalesce(p.proposal_response,'Pending') else p.rsvp_status end);
end;
$$;
revoke all on function public.get_calendar_invitation_context(text) from public;
grant execute on function public.get_calendar_invitation_context(text) to anon, authenticated;

create function public.expire_calendar_holds() returns integer
language plpgsql security definer set search_path='' as $$
declare a public.appointments; r public.appointment_reschedule_requests; v_count integer:=0; v_now timestamptz:=clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  update public.appointment_reminders reminder set status='cancelled',updated_at=v_now from public.appointments booking
    where reminder.appointment_id=booking.appointment_id and reminder.status='pending' and booking.reservation_managed
      and not private.calendar_reserves(booking,v_now);
  get diagnostics v_count=row_count;
  for r in select * from public.appointment_reschedule_requests where reservation_managed and status='proposed' and hold_expires_at<=v_now for update loop
    select * into a from public.appointments where appointment_id=r.appointment_id for update;
    update public.appointment_reschedule_requests set status='cancelled',updated_at=v_now where id=r.id;
    update public.appointments set status=r.original_status,has_confirmed_reservation=r.original_status='confirmed',
      calendar_revision=calendar_revision+1,updated_at=v_now where appointment_id=a.appointment_id
      and private.calendar_status(status) in ('alternative_requested','alternative_proposed');
    update public.appointment_participants set proposal_id=null,proposal_response=null,rsvp_token=gen_random_uuid()::text,
      rsvp_expires_at=a.date_time,updated_at=v_now where appointment_id=a.appointment_id and proposal_id=r.id and rsvp_revoked_at is null;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.expire_calendar_holds() from public, anon, authenticated;
grant execute on function public.expire_calendar_holds() to service_role;
-- Expiration is enforced synchronously by every reservation/response even if
-- the optional cleanup job is delayed. Existing Cron can suppress old reminders.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('calendar-hold-expiry','* * * * *','select public.expire_calendar_holds()');
  end if;
end $$;

-- Removal revokes participant-based access in every existing policy using
-- this helper. Independent ownership or matter permissions remain valid.
create or replace function public.bridge_can_access_appointment(p_appointment_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.appointments a where a.appointment_id=p_appointment_id and (
    a.created_by=auth.uid() or a.agent_id=auth.uid() or public.bridge_is_org_admin(a.organisation_id)
    or public.bridge_attorney_can_manage_transaction(a.transaction_id)
    or exists(select 1 from public.appointment_participants p where p.appointment_id=a.appointment_id
      and p.organisation_id=a.organisation_id and p.user_id=auth.uid() and p.rsvp_revoked_at is null)));
$$;
revoke all on function public.bridge_can_access_appointment(uuid) from public,anon;
grant execute on function public.bridge_can_access_appointment(uuid) to authenticated;

-- Raw participant records contain response capabilities. A read-only attendee
-- can read their own record, but cannot copy somebody else's response token.
create function public.bridge_can_read_calendar_participant(p_participant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.appointment_participants p join public.appointments a on a.appointment_id=p.appointment_id
    where p.participant_id=p_participant_id and (public.bridge_can_write_appointment_payload(a.transaction_id,a.organisation_id,a.created_by,a.agent_id)
      or (p.user_id=auth.uid() and p.rsvp_revoked_at is null and public.bridge_is_active_member(a.organisation_id))));
$$;
revoke all on function public.bridge_can_read_calendar_participant(uuid) from public,anon;
grant execute on function public.bridge_can_read_calendar_participant(uuid) to authenticated;
create policy calendar_participant_response_capability on public.appointment_participants as restrictive
  for select to authenticated using(public.bridge_can_read_calendar_participant(participant_id));

create or replace function private.guard_attorney_calendar_reminder()
returns trigger language plpgsql security definer set search_path='' as $$
declare a public.appointments;
begin
  if new.status<>'pending' then return new; end if;
  if auth.uid() is null and current_setting('role') not in ('service_role','none') then raise exception 'Not authorised to schedule reminders'; end if;
  if auth.uid() is not null and not public.bridge_can_access_appointment(new.appointment_id) then raise exception 'Not authorised to schedule reminders'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  select * into a from public.appointments where appointment_id=new.appointment_id;
  if not private.calendar_reserves(a,clock_timestamp()) then new.status:='cancelled'; end if;
  if a.reservation_managed and new.recipient_email is not null and not exists(select 1 from public.appointment_participants p
    where p.appointment_id=a.appointment_id and p.rsvp_revoked_at is null and lower(p.rsvp_status)<>'declined' and lower(p.email)=lower(new.recipient_email)) then new.status:='cancelled'; end if;
  return new;
end;
$$;
revoke all on function private.guard_attorney_calendar_reminder() from public,anon,authenticated;

-- Retain the original reader signature and permission rules, but removed attendees lose access.
create or replace function public.bridge_list_calendar_appointments(
  p_organisation_id uuid,
  p_include_all boolean default false,
  p_listing_id text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  appointment_id uuid,
  organisation_id uuid,
  lead_id uuid,
  agent_id uuid,
  appointment_type text,
  custom_type_label text,
  title text,
  appointment_date date,
  start_time time,
  end_time time,
  date_time timestamptz,
  timezone text,
  all_day boolean,
  location_type text,
  location text,
  meeting_url text,
  contact_id uuid,
  listing_id text,
  transaction_id uuid,
  related_entity_type text,
  related_entity_id uuid,
  linked_workflow text,
  linked_workflow_stage text,
  linked_task_id uuid,
  linked_transaction_stage text,
  workflow_completion_effect jsonb,
  visibility_scope text,
  completion_behavior text,
  appointment_instructions text,
  required_documents jsonb,
  calendar_event_uid text,
  ics_generated_at timestamptz,
  external_calendar_status text,
  external_calendar_provider text,
  external_calendar_event_id text,
  resource_id uuid,
  allow_outside_business_hours boolean,
  scheduling_override_reason text,
  status text,
  notes text,
  outcome_summary text,
  client_feedback text,
  agent_notes text,
  next_step text,
  follow_up_date date,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select
      auth.uid() as user_id,
      lower(coalesce(auth.jwt() ->> 'email', '')) as email,
      public.bridge_is_org_admin(p_organisation_id) as is_admin,
      public.bridge_is_active_member(p_organisation_id) as is_member
  )
  select
    a.appointment_id,
    a.organisation_id,
    a.lead_id,
    a.agent_id,
    a.appointment_type,
    a.custom_type_label,
    a.title,
    a.appointment_date,
    a.start_time,
    a.end_time,
    a.date_time,
    a.timezone,
    a.all_day,
    a.location_type,
    a.location,
    a.meeting_url,
    a.contact_id,
    a.listing_id,
    a.transaction_id,
    a.related_entity_type,
    a.related_entity_id,
    a.linked_workflow,
    a.linked_workflow_stage,
    a.linked_task_id,
    a.linked_transaction_stage,
    a.workflow_completion_effect,
    a.visibility_scope,
    a.completion_behavior,
    a.appointment_instructions,
    a.required_documents,
    a.calendar_event_uid,
    a.ics_generated_at,
    a.external_calendar_status,
    a.external_calendar_provider,
    a.external_calendar_event_id,
    a.resource_id,
    a.allow_outside_business_hours,
    a.scheduling_override_reason,
    a.status,
    a.notes,
    a.outcome_summary,
    a.client_feedback,
    a.agent_notes,
    a.next_step,
    a.follow_up_date,
    a.created_by,
    a.created_at,
    a.updated_at,
    a.completed_at,
    a.cancelled_at,
    a.cancelled_by,
    a.cancellation_reason
  from public.appointments a
  cross join caller c
  where a.organisation_id = p_organisation_id
    and c.is_member
    and (nullif(p_listing_id, '') is null or a.listing_id = p_listing_id)
    and (p_from is null or a.date_time >= p_from)
    and (p_to is null or a.date_time < p_to)
    and (
      c.is_admin
      or a.agent_id = c.user_id
      or a.created_by = c.user_id
      or exists (
        select 1
        from public.appointment_participants ap
        where ap.appointment_id = a.appointment_id
          and ap.organisation_id = a.organisation_id
          and ap.rsvp_revoked_at is null
          and (
            ap.user_id = c.user_id
            or (
              c.email <> ''
              and lower(coalesce(ap.email, '')) = c.email
              and lower(coalesce(ap.participant_role, '')) in ('agent', 'co-agent', 'principal')
            )
          )
      )
      or exists (
        select 1
        from public.leads l
        where l.lead_id = a.lead_id
          and l.organisation_id = a.organisation_id
          and l.assigned_agent_id = c.user_id
      )
    )
  order by a.date_time asc nulls last, a.created_at desc;
$$;
grant execute on function public.bridge_list_calendar_appointments(uuid, boolean, text, timestamptz, timestamptz) to authenticated;

create or replace function public.bridge_list_calendar_appointments_with_times(
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
    to_jsonb(a) || jsonb_build_object('end_date_time',stored.end_date_time,'calendar_revision',stored.calendar_revision, 'reservation_managed',stored.reservation_managed,'request_issued_at',stored.request_issued_at,'hold_expires_at',stored.hold_expires_at,'has_confirmed_reservation',stored.has_confirmed_reservation,
      'attorney_delivery_enabled',stored.attorney_delivery_enabled,'listing_viewing_round_number',stored.listing_viewing_round_number)
    order by a.date_time asc nulls last, a.created_at desc
  ), '[]'::jsonb)
  from public.bridge_list_calendar_appointments(p_organisation_id, p_include_all, p_listing_id, p_from, p_to) a
  join public.appointments stored
    on stored.appointment_id = a.appointment_id and stored.organisation_id = a.organisation_id;
$$;

commit;
