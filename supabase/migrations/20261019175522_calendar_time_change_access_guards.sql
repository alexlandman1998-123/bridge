begin;
-- Capabilities stay usable after confirmation token rotation, but never bypass
-- a later recipient removal or the booking's current visibility boundary.
create function private.calendar_time_change_participant_allowed(a public.appointments,p public.appointment_participants) returns boolean
language sql stable set search_path='' as $$
 select p.participant_id is not null and p.rsvp_revoked_at is null and
  (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
  and (p.user_id is null or lower(p.participant_role) not in ('agent','co-agent','attorney','bond originator','developer representative')
    or private.calendar_provider_member(a.organisation_id,p.user_id));
$$;
revoke all on function private.calendar_time_change_participant_allowed(public.appointments,public.appointment_participants) from public,anon,authenticated,service_role;


create or replace function private.calendar_time_change_self(p_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select p.participant_id from public.appointment_participants p join public.appointments a on a.appointment_id=p.appointment_id
  where p.appointment_id=p_id and private.calendar_time_change_participant_allowed(a,p) and auth.uid() is not null
    and (p.user_id=auth.uid() or (p.user_id is null and lower(btrim(p.email))=lower(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email')))
  order by p.is_required desc,p.participant_id limit 1;
$$;

create or replace function public.get_calendar_invitation_context(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.appointments; p public.appointment_participants; r public.appointment_reschedule_requests; change public.appointment_reschedule_requests;
begin
  select * into p from public.appointment_participants where rsvp_token=nullif(btrim(p_token),'') and rsvp_revoked_at is null;
  if not found then return null; end if;
  select * into a from public.appointments where appointment_id=p.appointment_id;
  if private.calendar_is_specialist(a) then return jsonb_build_object('managed',false); end if;
  if not private.calendar_time_change_participant_allowed(a,p) or a.archived_at is not null then return null; end if;
  select * into r from public.appointment_reschedule_requests where id=p.proposal_id and status='proposed' and hold_expires_at>now();
  if private.calendar_status(a.status) in ('draft','cancelled','completed','declined','no_show') or a.date_time<=now()
    or (p.rsvp_expires_at is not null and p.rsvp_expires_at<=now()) or (r.id is null and not private.calendar_reserves(a,now())) then return null; end if;
  select * into change from public.appointment_reschedule_requests where appointment_id=a.appointment_id and reservation_managed and status in ('pending','proposed') order by created_at desc limit 1;
  -- Return only this token holder's client-visible schedule and response; no
  -- attendee list, private notes, ownership identities or management capability.
  return jsonb_build_object('appointment_id',a.appointment_id,'participant_id',p.participant_id,'participant_name',p.name,'participant_role',p.participant_role,
    'location',a.location,'meeting_url',a.meeting_url,'proposal_id',r.id,'proposal_revision',r.proposal_revision,'can_request_time_change',change.id is null,'time_change',case when change.id is null then null else jsonb_build_object('id',change.id,'status',change.status,'proposal_revision',change.proposal_revision,'preferred_start',change.preferred_start,'preferred_end',change.preferred_end,'reason',change.reason,'mine',change.participant_id=p.participant_id,'expires_at',case when change.status='proposed' then change.hold_expires_at else change.request_expires_at end) end,
    'original_start',a.date_time,'original_end',private.calendar_end(a),'managed',true,'proposal',r.id is not null,'title',a.title,'timezone',coalesce(r.proposed_timezone,a.timezone),'all_day',coalesce(r.proposed_all_day,a.all_day),
    'appointment_date',case when r.id is not null then (r.preferred_start at time zone coalesce(r.proposed_timezone,a.timezone))::date else a.appointment_date end,
    'start_time',case when r.id is not null then (r.preferred_start at time zone coalesce(r.proposed_timezone,a.timezone))::time else a.start_time end,
    'end_time',case when r.id is not null then (r.preferred_end at time zone coalesce(r.proposed_timezone,a.timezone))::time else a.end_time end,
    'date_time',coalesce(r.preferred_start,a.date_time),'end_date_time',coalesce(r.preferred_end,a.end_date_time),
    'rsvp_status',case when r.id is not null then coalesce(p.proposal_response,'Pending') else p.rsvp_status end);
end;
$$;

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
  if not private.calendar_is_specialist(a) and not private.calendar_time_change_participant_allowed(a,p) then
    raise exception 'This invitation no longer permits access.' using errcode='42501'; end if;
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

create or replace function public.respond_calendar_time_change_by_token(p_token text,p_request_id uuid,p_proposal_revision integer,p_command_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; p public.appointment_participants; r public.appointment_reschedule_requests; result jsonb;
 v_token_hash text:=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex'); v_fingerprint jsonb;
begin
 if p_command_id is null or p_request_id is null or p_proposal_revision is null or p_status is null or p_status not in ('Accepted','Declined') then raise exception 'Choose a valid proposal response.' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 v_fingerprint:=jsonb_build_array(p_request_id,p_proposal_revision,p_status);
 select c.result into result from private.calendar_invitation_commands c where c.token_hash=v_token_hash and c.command_id=p_command_id and c.fingerprint=v_fingerprint and c.expires_at>clock_timestamp();
 if found then
   select * into a from public.appointments where appointment_id=(result->>'appointmentId')::uuid;
   select attendee.* into p from private.calendar_invitation_commands c join public.appointment_participants attendee on attendee.participant_id=c.participant_id
     where c.token_hash=v_token_hash and c.command_id=p_command_id and attendee.appointment_id=a.appointment_id;
   if not private.calendar_time_change_participant_allowed(a,p) then raise exception 'This invitation was removed or access expired.' using errcode='42501'; end if;
   select * into r from public.appointment_reschedule_requests where id=p_request_id and appointment_id=a.appointment_id;
   return result||jsonb_build_object('replayed',true,'outcome',case
     when a.archived_at is not null or private.calendar_status(a.status) in ('cancelled','completed','declined','no_show') or r.proposal_revision<>p_proposal_revision then 'closed'
     when r.status='accepted' and a.date_time=r.preferred_start and a.end_date_time=r.preferred_end then 'confirmed'
     when r.status='rejected' then 'declined' when r.status='proposed' then 'pending' else 'closed' end,
     'dateTime',a.date_time,'endDateTime',a.end_date_time);
 end if;
 if exists(select 1 from private.calendar_invitation_commands c where c.token_hash=v_token_hash and c.command_id=p_command_id) then raise exception 'This response identifier was already used.' using errcode='22023'; end if;
 select * into p from public.appointment_participants where rsvp_token=nullif(btrim(p_token),'') and rsvp_revoked_at is null;
 if not found or public.get_calendar_invitation_context(p_token) is null then raise exception 'This invitation was removed, replaced or expired.' using errcode='42501'; end if;
 select * into a from public.appointments where appointment_id=p.appointment_id for update;
 select * into r from public.appointment_reschedule_requests where id=p_request_id and appointment_id=a.appointment_id and reservation_managed for update;
 if private.calendar_is_specialist(a) or r.id is null or r.status<>'proposed' or r.proposal_revision<>p_proposal_revision or p.proposal_id is distinct from r.id then
   raise exception 'This proposal changed. Open the latest invitation before responding.' using errcode='40001'; end if;
 perform private.commit_appointment_response(a.appointment_id,p.participant_id,p_status,null,null,null,true,a.date_time,p.rsvp_token);
 select * into a from public.appointments where appointment_id=p.appointment_id;
 select * into r from public.appointment_reschedule_requests where id=p_request_id;
 result:=jsonb_build_object('verified',true,'appointmentId',a.appointment_id,'requestId',r.id,'proposalRevision',r.proposal_revision,
   'response',p_status,'outcome',case r.status when 'accepted' then 'confirmed' when 'rejected' then 'declined' else 'pending' end,
   'dateTime',a.date_time,'endDateTime',a.end_date_time,'timezone',a.timezone,'allDay',a.all_day);
 insert into private.calendar_invitation_commands(token_hash,command_id,appointment_id,participant_id,fingerprint,result,expires_at)
 values(v_token_hash,p_command_id,a.appointment_id,p.participant_id,v_fingerprint,result,clock_timestamp()+interval '24 hours');
 return result;
end; $$;

create or replace function private.calendar_time_change_delivery_valid(j public.calendar_delivery_jobs) returns boolean
language sql stable security definer set search_path='' as $$
 select (j.support_retry_until is null or j.support_retry_until>clock_timestamp()) and exists(
  select 1 from public.appointments a join public.appointment_participants p on p.appointment_id=a.appointment_id
  join public.appointment_reschedule_requests r on r.appointment_id=a.appointment_id and r.id::text=split_part(j.event_kind,':',3)
  where a.appointment_id=j.appointment_id and p.participant_id=j.participant_id and r.reservation_managed
   and a.archived_at is null and a.calendar_delivery_managed and a.invitations_enabled and not private.calendar_is_specialist(a)
   and not exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision)
   and not exists(select 1 from public.appointment_reschedule_requests newer where newer.appointment_id=a.appointment_id and newer.reservation_managed and newer.created_at>r.created_at)
   and private.calendar_status(a.status) not in ('draft','cancelled','completed','declined','no_show') and private.calendar_end(a)>clock_timestamp()
   and private.calendar_time_change_participant_allowed(a,p) and p.user_id is not distinct from j.recipient_id and p.participant_role is not distinct from j.participant_role
   and lower(btrim(coalesce(p.email,'')))=coalesce(j.recipient_email,'') and j.expires_at>clock_timestamp()
   and (j.channel<>'email' or private.calendar_email_allowed(a.organisation_id,j.recipient_email))
   and (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
   and split_part(j.event_kind,':',4)=r.proposal_revision::text
   and split_part(j.event_kind,':',5)=private.calendar_time_change_version(a,r,p)
   and case split_part(j.event_kind,':',2)
    when 'requested' then r.status='pending' and r.request_expires_at>clock_timestamp()
      and (p.user_id=coalesce(a.agent_id,a.created_by) or p.user_id=r.requested_by or p.participant_id=r.participant_id)
    when 'proposed' then r.status='proposed' and r.hold_expires_at>clock_timestamp()
    when 'confirmed' then r.status='accepted' and a.date_time=r.preferred_start and a.end_date_time=r.preferred_end
    when 'declined' then r.status='rejected' and a.date_time=r.original_start
    when 'withdrawn' then r.status='cancelled' and r.closed_reason='withdrawn' and a.date_time=r.original_start
    when 'expired' then r.status='cancelled' and r.closed_reason='expired' and a.date_time=r.original_start else false end);
$$;

commit;
