-- Explicit time-change requests use the existing reservation, RSVP and delivery owners.
-- No historical bookings or notification jobs are changed by this migration.
begin;
alter table public.appointment_reschedule_requests
  add column request_expires_at timestamptz,
  add column closed_reason text,
  add column original_start timestamptz,
  add column original_end timestamptz,
  add column requester_previous_rsvp text,
  add column requester_previous_response_at timestamptz;
create index calendar_time_change_active_idx on public.appointment_reschedule_requests(appointment_id,created_at desc)
  where reservation_managed and status in ('pending','proposed');

create function private.calendar_time_change_self(p_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select p.participant_id from public.appointment_participants p
  where p.appointment_id=p_id and p.rsvp_revoked_at is null and auth.uid() is not null
    and (p.user_id=auth.uid() or (p.user_id is null and lower(btrim(p.email))=lower(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email')))
  order by p.is_required desc,p.participant_id limit 1;
$$;
revoke all on function private.calendar_time_change_self(uuid) from public,anon,authenticated,service_role;

create function private.initialise_calendar_time_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.appointments; p public.appointment_participants;
begin
  if not new.reservation_managed then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  select * into a from public.appointments where appointment_id=new.appointment_id;
  if exists(select 1 from public.appointment_reschedule_requests r where r.appointment_id=new.appointment_id and r.reservation_managed and r.status in ('pending','proposed') and r.id<>new.id) then
    raise exception 'A time-change request is already awaiting a decision. Review or withdraw it first.' using errcode='40001';
  end if;
  new.original_start:=a.date_time; new.original_end:=private.calendar_end(a);
  new.request_expires_at:=least(clock_timestamp()+interval '24 hours',a.date_time);
  if new.participant_id is not null then
    select * into p from public.appointment_participants where participant_id=new.participant_id and appointment_id=a.appointment_id;
    new.requester_previous_rsvp:=p.rsvp_status; new.requester_previous_response_at:=p.responded_at;
  end if;
  return new;
end; $$;
create trigger calendar_time_change_initialise before insert on public.appointment_reschedule_requests
  for each row execute function private.initialise_calendar_time_change();
revoke all on function private.initialise_calendar_time_change() from public,anon,authenticated,service_role;

-- Workflow history is server-written and is available only through the authorised
-- appointment-state RPC. Invitation capabilities never receive this actor history.
create table private.calendar_time_change_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.appointment_reschedule_requests(id) on delete cascade,
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  actor_id uuid,
  participant_id uuid,
  action text not null,
  proposal_revision integer,
  preferred_start timestamptz,
  preferred_end timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index calendar_time_change_history_idx on private.calendar_time_change_events(appointment_id,id desc);
revoke all on private.calendar_time_change_events from public,anon,authenticated,service_role;

create function private.record_calendar_time_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare action text; a public.appointments;
begin
  if not new.reservation_managed then return new; end if;
  if tg_op='INSERT' then
    action:=case when new.status='proposed' then 'proposed' else 'requested' end;
  elsif new.status is distinct from old.status or new.proposal_revision is distinct from old.proposal_revision then
    action:=case new.status when 'pending' then 'requested' when 'proposed' then 'proposed'
      when 'accepted' then 'confirmed' when 'rejected' then 'declined'
      else coalesce(new.closed_reason,'cancelled') end;
  else return new;
  end if;
  insert into private.calendar_time_change_events(request_id,appointment_id,actor_id,participant_id,action,proposal_revision,preferred_start,preferred_end)
    values(new.id,new.appointment_id,auth.uid(),case when action='requested' then new.participant_id end,action,new.proposal_revision,new.preferred_start,new.preferred_end);
  -- Rejection of a replacement must not leave the requester's original RSVP
  -- marked as awaiting another time. This also covers legacy invitation responses.
  if new.status in ('rejected','cancelled') and new.requester_previous_rsvp is not null then
    select * into a from public.appointments where appointment_id=new.appointment_id;
    if a.archived_at is null and a.date_time=new.original_start and private.calendar_status(a.status) in ('alternative_requested','alternative_proposed') then
      update public.appointment_participants set rsvp_status=new.requester_previous_rsvp,
        responded_at=new.requester_previous_response_at,proposed_new_time=null
      where participant_id=new.participant_id and rsvp_revoked_at is null and rsvp_status='Proposed New Time';
    end if;
  end if;
  return new;
end; $$;
create trigger calendar_time_change_history after insert or update on public.appointment_reschedule_requests
  for each row execute function private.record_calendar_time_change();
revoke all on function private.record_calendar_time_change() from public,anon,authenticated,service_role;

create function private.record_calendar_time_change_vote() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.appointment_reschedule_requests;
begin
  if new.proposal_id is null or new.proposal_response is null or
    (new.proposal_id is not distinct from old.proposal_id and new.proposal_response is not distinct from old.proposal_response) then return new; end if;
  select * into r from public.appointment_reschedule_requests where id=new.proposal_id and reservation_managed;
  if found then
    insert into private.calendar_time_change_events(request_id,appointment_id,actor_id,participant_id,action,proposal_revision,preferred_start,preferred_end)
      values(r.id,r.appointment_id,auth.uid(),new.participant_id,
        case new.proposal_response when 'Accepted' then 'accepted' when 'Declined' then 'declined_proposal' else 'counter_requested' end,
        r.proposal_revision,r.preferred_start,r.preferred_end);
  end if;
  return new;
end; $$;
create trigger calendar_time_change_vote_history after update on public.appointment_participants
  for each row execute function private.record_calendar_time_change_vote();
revoke all on function private.record_calendar_time_change_vote() from public,anon,authenticated,service_role;

create function public.get_calendar_time_change(p_appointment_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.appointments; active jsonb; history jsonb; events jsonb; manage boolean; self_id uuid;
begin
  select * into a from public.appointments where appointment_id=p_appointment_id;
  manage:=auth.uid() is not null and public.bridge_can_write_appointment_payload(a.transaction_id,a.organisation_id,a.created_by,a.agent_id);
  self_id:=private.calendar_time_change_self(p_appointment_id);
  if a.appointment_id is null or (not coalesce(manage,false) and self_id is null) then raise exception 'Appointment access is required.' using errcode='42501'; end if;
  select to_jsonb(r)-'suggested_slots'-'requester_previous_rsvp'-'requester_previous_response_at' into active from public.appointment_reschedule_requests r
    where r.appointment_id=a.appointment_id and r.reservation_managed and r.status in ('pending','proposed') order by r.created_at desc limit 1;
  select coalesce(jsonb_agg(v),'[]'::jsonb) into history from (
    select r.id,r.status,r.reason,r.preferred_start,r.preferred_end,r.created_at,r.updated_at,r.closed_reason,r.reviewed_at
    from public.appointment_reschedule_requests r where r.appointment_id=a.appointment_id and r.reservation_managed order by r.created_at desc limit 10
  ) v;
  select coalesce(jsonb_agg(v),'[]'::jsonb) into events from (
    select e.id,e.request_id,e.actor_id,e.participant_id,e.action,e.proposal_revision,e.preferred_start,e.preferred_end,e.created_at
    from private.calendar_time_change_events e where e.appointment_id=a.appointment_id order by e.id desc limit 100
  ) v;
  return jsonb_build_object('verified',true,'appointmentId',a.appointment_id,'revision',a.calendar_revision,
    'supported',not private.calendar_is_specialist(a),'canManage',manage,'selfParticipantId',self_id,
    'selfProposalResponse',(select proposal_response from public.appointment_participants where participant_id=self_id),
    'canRequest',active is null and not private.calendar_is_specialist(a) and private.calendar_reserves(a,now()) and a.archived_at is null and private.calendar_status(a.status) not in ('draft','completed','cancelled','declined','no_show') and a.date_time>now(),
    'active',active,'history',history,'events',events);
end; $$;
revoke all on function public.get_calendar_time_change(uuid) from public,anon;
grant execute on function public.get_calendar_time_change(uuid) to authenticated;

create function private.close_calendar_time_change(p_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.appointment_reschedule_requests; a public.appointments; stamp timestamptz:=clock_timestamp();
begin
  select * into r from public.appointment_reschedule_requests where id=p_id for update;
  if not found or r.status not in ('pending','proposed') then raise exception 'This time-change request was already closed.' using errcode='40001'; end if;
  select * into a from public.appointments where appointment_id=r.appointment_id for update;
  update public.appointment_reschedule_requests set status=case when p_reason='declined' then 'rejected' else 'cancelled' end,
    closed_reason=p_reason,reviewed_by=auth.uid(),reviewed_at=stamp,updated_at=stamp where id=r.id;
  -- A closed, archived, or independently changed appointment is never reopened.
  update public.appointments set status=r.original_status,has_confirmed_reservation=r.original_status='confirmed',
    calendar_revision=calendar_revision+1,updated_at=stamp where appointment_id=a.appointment_id and archived_at is null
    and private.calendar_status(status) in ('alternative_requested','alternative_proposed') and date_time=coalesce(r.original_start,a.date_time);
  update public.appointment_participants set proposal_id=null,proposal_response=null,rsvp_token=gen_random_uuid()::text,
    rsvp_expires_at=a.date_time,updated_at=stamp where appointment_id=a.appointment_id and proposal_id=r.id and rsvp_revoked_at is null;
end; $$;
revoke all on function private.close_calendar_time_change(uuid,text) from public,anon,authenticated,service_role;

create function public.mutate_calendar_time_change(p_appointment_id uuid,p_expected_revision integer,p_command_id uuid,
  p_action text,p_request_id uuid default null,p_start timestamptz default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; r public.appointment_reschedule_requests; person public.appointment_participants;
  manage boolean; self_id uuid; result jsonb; v_fingerprint jsonb; preferred_end timestamptz; stamp timestamptz:=clock_timestamp(); child jsonb;
begin
  if auth.uid() is null or p_command_id is null or p_action not in ('request','propose','decline','withdraw','accept','decline_proposal') or length(coalesce(p_reason,''))>1000 then
    raise exception 'Choose a valid time-change action.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  stamp:=clock_timestamp();
  select * into a from public.appointments where appointment_id=p_appointment_id for update;
  manage:=public.bridge_can_write_appointment_payload(a.transaction_id,a.organisation_id,a.created_by,a.agent_id);
  self_id:=private.calendar_time_change_self(a.appointment_id);
  if a.appointment_id is null or (not coalesce(manage,false) and self_id is null) then raise exception 'Appointment access is required.' using errcode='42501'; end if;
  if private.calendar_is_specialist(a) then raise exception 'Use this appointment’s existing specialist reschedule workflow.' using errcode='22023'; end if;
  v_fingerprint:=jsonb_build_object('workflow','time_change','appointment',p_appointment_id,'revision',p_expected_revision,'action',p_action,'request',p_request_id,'start',p_start,'reason',p_reason);
  select saved.result into result from private.calendar_mutation_receipts saved where saved.actor_id=auth.uid() and saved.command_id=p_command_id and saved.fingerprint=v_fingerprint;
  if found then return result||jsonb_build_object('replayed',true,'revision',a.calendar_revision,'state',public.get_calendar_time_change(a.appointment_id)); end if;
  if exists(select 1 from private.calendar_mutation_receipts where actor_id=auth.uid() and command_id=p_command_id) then raise exception 'This command identifier was already used.' using errcode='22023'; end if;
  if p_expected_revision is null or a.calendar_revision<>p_expected_revision then raise exception 'This appointment changed. Refresh before continuing.' using errcode='40001'; end if;
  if a.archived_at is not null or private.calendar_status(a.status) in ('draft','cancelled','declined','completed','no_show') or a.date_time<=stamp then raise exception 'Closed or started appointments cannot change time.' using errcode='22023'; end if;
  if not private.calendar_reserves(a,stamp) then raise exception 'The original reservation expired. Ask the organiser to issue a new appointment request.' using errcode='22023'; end if;
  if p_request_id is not null then
    select * into r from public.appointment_reschedule_requests where id=p_request_id and appointment_id=a.appointment_id and reservation_managed for update;
    if not found or r.status not in ('pending','proposed') then raise exception 'This time-change request was already closed.' using errcode='40001'; end if;
    if coalesce(case when r.status='proposed' then r.hold_expires_at else r.request_expires_at end,a.date_time)<=stamp then raise exception 'This time-change request expired. Refresh the appointment.' using errcode='40001'; end if;
  end if;
  if p_action in ('request','propose') then
    p_start:=coalesce(p_start,r.preferred_start);
    preferred_end:=p_start+(private.calendar_end(a)-a.date_time);
    if p_start is null or preferred_end is null or p_start<=stamp or p_start=a.date_time or preferred_end<=p_start
      or (not a.all_day and (p_start at time zone a.timezone)::date<>(preferred_end at time zone a.timezone)::date)
      or (a.all_day and (p_start at time zone a.timezone)::time<>time '00:00') then raise exception 'Choose a different future time. The appointment duration stays the same.' using errcode='22023'; end if;
    if p_action='request' then
      if exists(select 1 from public.appointment_reschedule_requests where appointment_id=a.appointment_id and reservation_managed and status in ('pending','proposed')) then raise exception 'A time-change request is already awaiting a decision.' using errcode='40001'; end if;
      if manage then
        child:=public.mutate_calendar_proposal(a.appointment_id,a.calendar_revision,gen_random_uuid(),'request',null,p_start,preferred_end,p_reason,a.timezone,a.all_day);
        select * into r from public.appointment_reschedule_requests where id=(child->'request'->>'id')::uuid;
      else
        perform private.commit_appointment_response(a.appointment_id,self_id,'Proposed New Time',p_start,preferred_end,p_reason,true,a.date_time,null);
        select * into r from public.appointment_reschedule_requests where appointment_id=a.appointment_id and participant_id=self_id and status='pending' order by created_at desc limit 1;
      end if;
    else
      if not coalesce(manage,false) or r.id is null or r.status<>'pending' then raise exception 'Only the organiser can review a pending request.' using errcode='42501'; end if;
      child:=public.mutate_calendar_proposal(a.appointment_id,a.calendar_revision,gen_random_uuid(),'propose',r.id,p_start,preferred_end,coalesce(p_reason,r.reason),a.timezone,a.all_day);
    end if;
  elsif p_action in ('accept','decline_proposal') then
    if r.id is null or r.status<>'proposed' or self_id is null then raise exception 'Only an invited attendee can answer this proposal.' using errcode='42501'; end if;
    select * into person from public.appointment_participants where participant_id=self_id;
    if person.proposal_id is distinct from r.id then raise exception 'This proposal changed. Refresh before responding.' using errcode='40001'; end if;
    perform private.commit_appointment_response(a.appointment_id,self_id,case when p_action='accept' then 'Accepted' else 'Declined' end,null,null,p_reason,true,a.date_time,person.rsvp_token);
  else
    if r.id is null then raise exception 'Choose the active time-change request.' using errcode='22023'; end if;
    if p_action='decline' and (not coalesce(manage,false) or r.status<>'pending') then raise exception 'Only the organiser can keep the current time.' using errcode='42501'; end if;
    if p_action='withdraw' and not coalesce(manage,false) and r.requested_by is distinct from auth.uid() and r.participant_id is distinct from self_id then raise exception 'Only the requester or organiser can withdraw this request.' using errcode='42501'; end if;
    perform private.close_calendar_time_change(r.id,case when p_action='withdraw' then 'withdrawn' else 'declined' end);
  end if;
  select * into a from public.appointments where appointment_id=p_appointment_id;
  result:=jsonb_build_object('verified',true,'appointmentId',a.appointment_id,'revision',a.calendar_revision,'state',public.get_calendar_time_change(a.appointment_id));
  insert into private.calendar_mutation_receipts(actor_id,command_id,appointment_id,fingerprint,result) values(auth.uid(),p_command_id,a.appointment_id,v_fingerprint,result);
  return result;
end; $$;
revoke all on function public.mutate_calendar_time_change(uuid,integer,uuid,text,uuid,timestamptz,text) from public,anon;
grant execute on function public.mutate_calendar_time_change(uuid,integer,uuid,text,uuid,timestamptz,text) to authenticated;

-- Managed ordinary appointments keep the atomic reservation command owner.
create or replace function public.mutate_calendar_proposal(p_appointment_id uuid,p_expected_revision integer,p_command_id uuid,
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
  if private.calendar_is_specialist(a) then raise exception 'Use this appointment’s existing specialist reschedule workflow.' using errcode='22023'; end if;
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
    if exists(select 1 from public.appointment_reschedule_requests where appointment_id=a.appointment_id and reservation_managed
      and status in ('pending','proposed') and id is distinct from r.id) then
      raise exception 'A time-change request is already awaiting a decision. Review or withdraw it first.' using errcode='40001';
    end if;
    if r.id is null then
      insert into public.appointment_reschedule_requests(appointment_id,requested_by,requested_by_role,reason,preferred_start,preferred_end,
        status,reservation_managed,hold_expires_at,proposal_revision,original_status,proposed_timezone,proposed_all_day,created_at,updated_at)
      values(a.appointment_id,auth.uid(),'Agent',p_reason,p_start,p_end,case when p_action='propose' then 'proposed' else 'pending' end,
        true,case when p_action='propose' then least(v_now+interval '24 hours',a.date_time,p_start) end,1,v_original,v_timezone,v_all_day,v_now,v_now) returning * into r;
    else
      update public.appointment_reschedule_requests set reason=p_reason,preferred_start=p_start,preferred_end=p_end,
        status=case when p_action='propose' then 'proposed' else 'pending' end,hold_expires_at=case when p_action='propose' then least(v_now+interval '24 hours',a.date_time,p_start) end,
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
      update public.appointment_participants set proposal_response=p_status,updated_at=v_now where participant_id=p.participant_id;
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
        or (not a.all_day and (p_preferred_start at time zone a.timezone)::date<>(v_end at time zone a.timezone)::date)
        or (a.all_day and ((p_preferred_start at time zone a.timezone)::time<>time '00:00'
          or (v_end at time zone a.timezone)<>((p_preferred_start at time zone a.timezone)::date+1)::timestamp)) then
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

create or replace function public.expire_calendar_holds() returns integer
language plpgsql security definer set search_path='' as $$
declare r public.appointment_reschedule_requests; v_count integer:=0; v_now timestamptz:=clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  update public.appointment_reminders reminder set status='cancelled',updated_at=v_now from public.appointments booking
    where reminder.appointment_id=booking.appointment_id and reminder.status='pending' and booking.reservation_managed
      and not private.calendar_reserves(booking,v_now);
  get diagnostics v_count=row_count;
  for r in select * from public.appointment_reschedule_requests where reservation_managed and
    ((status='proposed' and hold_expires_at<=v_now) or (status='pending' and coalesce(request_expires_at,least(created_at+interval '24 hours',(select date_time from public.appointments a where a.appointment_id=appointment_reschedule_requests.appointment_id)))<=v_now)) for update loop
    perform private.close_calendar_time_change(r.id,'expired');
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.expire_calendar_holds() from public, anon, authenticated;
grant execute on function public.expire_calendar_holds() to service_role;
create or replace function public.get_calendar_invitation_context(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.appointments; p public.appointment_participants; r public.appointment_reschedule_requests; change public.appointment_reschedule_requests;
begin
  select * into p from public.appointment_participants where rsvp_token=nullif(btrim(p_token),'') and rsvp_revoked_at is null;
  if not found then return null; end if;
  select * into a from public.appointments where appointment_id=p.appointment_id;
  if private.calendar_is_specialist(a) then return jsonb_build_object('managed',false); end if;
  select * into r from public.appointment_reschedule_requests where id=p.proposal_id and status='proposed' and hold_expires_at>now();
  if private.calendar_status(a.status) in ('draft','cancelled','completed','declined','no_show') or a.date_time<=now()
    or (p.rsvp_expires_at is not null and p.rsvp_expires_at<=now()) or (r.id is null and not private.calendar_reserves(a,now())) then return null; end if;
  select * into change from public.appointment_reschedule_requests where appointment_id=a.appointment_id and reservation_managed and status in ('pending','proposed') order by created_at desc limit 1;
  -- Return only this token holder's client-visible schedule and response; no
  -- attendee list, private notes, ownership identities or management capability.
  return jsonb_build_object('can_request_time_change',change.id is null,'time_change',case when change.id is null then null else jsonb_build_object('id',change.id,'status',change.status,'preferred_start',change.preferred_start,'preferred_end',change.preferred_end,'reason',change.reason,'mine',change.participant_id=p.participant_id,'expires_at',case when change.status='proposed' then change.hold_expires_at else change.request_expires_at end) end,
    'original_start',a.date_time,'original_end',private.calendar_end(a),'managed',true,'proposal',r.id is not null,'title',a.title,'timezone',coalesce(r.proposed_timezone,a.timezone),'all_day',coalesce(r.proposed_all_day,a.all_day),
    'appointment_date',case when r.id is not null then (r.preferred_start at time zone coalesce(r.proposed_timezone,a.timezone))::date else a.appointment_date end,
    'start_time',case when r.id is not null then (r.preferred_start at time zone coalesce(r.proposed_timezone,a.timezone))::time else a.start_time end,
    'end_time',case when r.id is not null then (r.preferred_end at time zone coalesce(r.proposed_timezone,a.timezone))::time else a.end_time end,
    'date_time',coalesce(r.preferred_start,a.date_time),'end_date_time',coalesce(r.preferred_end,a.end_date_time),
    'rsvp_status',case when r.id is not null then coalesce(p.proposal_response,'Pending') else p.rsvp_status end);
end;
$$;
revoke all on function public.get_calendar_invitation_context(text) from public;
grant execute on function public.get_calendar_invitation_context(text) to anon,authenticated;

create function public.request_calendar_time_change_by_token(p_token text,p_start timestamptz default null,p_reason text default null,p_withdraw_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; p public.appointment_participants; r public.appointment_reschedule_requests; preferred_end timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  select * into p from public.appointment_participants where rsvp_token=nullif(btrim(p_token),'') and rsvp_revoked_at is null for update;
  if p.participant_id is null or public.get_calendar_invitation_context(p_token) is null then raise exception 'This invitation was removed, replaced or expired.' using errcode='42501'; end if;
  select * into a from public.appointments where appointment_id=p.appointment_id for update;
  if private.calendar_is_specialist(a) then raise exception 'Use the existing response options for this invitation.' using errcode='22023'; end if;
  if length(coalesce(p_reason,''))>1000 then raise exception 'Keep the message under 1,000 characters.' using errcode='22023'; end if;
  if p_withdraw_request_id is not null then
    select * into r from public.appointment_reschedule_requests where id=p_withdraw_request_id and appointment_id=a.appointment_id and participant_id=p.participant_id and reservation_managed for update;
    if r.id is null then raise exception 'Only the requester can withdraw this request.' using errcode='42501'; end if;
    if r.status='cancelled' and r.closed_reason='withdrawn' then return jsonb_build_object('verified',true,'appointmentId',a.appointment_id,'context',public.get_calendar_invitation_context(p_token),'replayed',true); end if;
    if r.status<>'pending' then raise exception 'This request was reviewed. Respond to the current proposal instead.' using errcode='40001'; end if;
    perform private.close_calendar_time_change(r.id,'withdrawn');
  else
    preferred_end:=p_start+(private.calendar_end(a)-a.date_time);
    if p_start is null or preferred_end is null or p_start<=clock_timestamp() or p_start=a.date_time or preferred_end<=p_start
      or (not a.all_day and (p_start at time zone a.timezone)::date<>(preferred_end at time zone a.timezone)::date)
      or (a.all_day and (p_start at time zone a.timezone)::time<>time '00:00') then raise exception 'Choose a different future time. The appointment duration stays the same.' using errcode='22023'; end if;
    select * into r from public.appointment_reschedule_requests where appointment_id=a.appointment_id and reservation_managed and status in ('pending','proposed') for update;
    if found then
      if r.status='pending' and r.participant_id=p.participant_id and r.preferred_start=p_start and coalesce(r.reason,'')=coalesce(p_reason,'') then
        return jsonb_build_object('verified',true,'appointmentId',a.appointment_id,'context',public.get_calendar_invitation_context(p_token),'replayed',true);
      end if;
      raise exception 'A time-change request is already awaiting a decision.' using errcode='40001';
    end if;
    perform private.commit_appointment_response(a.appointment_id,p.participant_id,'Proposed New Time',p_start,preferred_end,p_reason,true,a.date_time,p.rsvp_token);
  end if;
  return jsonb_build_object('verified',true,'appointmentId',a.appointment_id,'context',public.get_calendar_invitation_context(p_token));
end; $$;
revoke all on function public.request_calendar_time_change_by_token(text,timestamptz,text,uuid) from public;
grant execute on function public.request_calendar_time_change_by_token(text,timestamptz,text,uuid) to anon,authenticated;

commit;
