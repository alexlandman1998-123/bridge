-- Time-change messages use the existing durable worker and server-only payload gates.
-- No backfill, remote delivery or provider connection is performed by this migration.
begin;

create function private.calendar_time_change_version(a public.appointments,r public.appointment_reschedule_requests,p public.appointment_participants)
returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_array(r.id,r.status,r.closed_reason,r.proposal_revision,extract(epoch from r.original_start),extract(epoch from r.original_end),
   extract(epoch from r.preferred_start),extract(epoch from r.preferred_end),r.reason,r.proposed_timezone,r.proposed_all_day,
   extract(epoch from a.date_time),extract(epoch from a.end_date_time),a.timezone,a.all_day,a.title,a.location,a.meeting_url,a.agent_id,a.created_by,
   a.email_theme,a.email_template_key,a.attach_calendar_invite,a.visibility_scope,
   p.participant_id,p.user_id,p.name,p.email,p.participant_role,p.rsvp_token)::text);
$$;
revoke all on function private.calendar_time_change_version(public.appointments,public.appointment_reschedule_requests,public.appointment_participants) from public,anon,authenticated,service_role;

-- This key deliberately excludes calendar_revision: another attendee's partial
-- approval must not resend or discard the still-current proposal for everyone else.
create unique index calendar_time_change_job_dedupe on public.calendar_delivery_jobs(appointment_id,participant_id,event_kind,channel)
 where event_kind like 'time_change:%';

create function private.calendar_time_change_delivery_valid(j public.calendar_delivery_jobs) returns boolean
language sql stable security definer set search_path='' as $$
 select (j.support_retry_until is null or j.support_retry_until>clock_timestamp()) and exists(
  select 1 from public.appointments a join public.appointment_participants p on p.appointment_id=a.appointment_id
  join public.appointment_reschedule_requests r on r.appointment_id=a.appointment_id and r.id::text=split_part(j.event_kind,':',3)
  where a.appointment_id=j.appointment_id and p.participant_id=j.participant_id and r.reservation_managed
   and a.archived_at is null and a.calendar_delivery_managed and a.invitations_enabled and not private.calendar_is_specialist(a)
   and not exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision)
   and not exists(select 1 from public.appointment_reschedule_requests newer where newer.appointment_id=a.appointment_id and newer.reservation_managed and newer.created_at>r.created_at)
   and private.calendar_status(a.status) not in ('draft','cancelled','completed','declined','no_show') and private.calendar_end(a)>clock_timestamp()
   and p.rsvp_revoked_at is null and p.user_id is not distinct from j.recipient_id and p.participant_role is not distinct from j.participant_role
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
revoke all on function private.calendar_time_change_delivery_valid(public.calendar_delivery_jobs) from public,anon,authenticated,service_role;

create function private.queue_calendar_time_change(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.appointment_reschedule_requests; a public.appointments; stage text; stamp timestamptz:=clock_timestamp();
begin
 select * into r from public.appointment_reschedule_requests where id=p_id and reservation_managed;
 if not found then return; end if;
 select * into a from public.appointments where appointment_id=r.appointment_id;
 if not a.calendar_delivery_managed or not a.invitations_enabled or private.calendar_is_specialist(a) or a.archived_at is not null
   or private.calendar_status(a.status) in ('draft','cancelled','completed','declined','no_show')
   or exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision) then return; end if;
 stage:=case r.status when 'pending' then 'requested' when 'proposed' then 'proposed' when 'accepted' then 'confirmed' when 'rejected' then 'declined'
   when 'cancelled' then case r.closed_reason when 'expired' then 'expired' when 'withdrawn' then 'withdrawn' end end;
 if stage is null then return; end if;
 update public.calendar_delivery_jobs j set status='superseded',claimed_at=null,updated_at=stamp
   where j.appointment_id=a.appointment_id and j.status in ('queued','failed','processing') and not private.calendar_delivery_valid(j);
 insert into public.calendar_delivery_jobs(appointment_id,participant_id,revision,event_kind,channel,recipient_id,recipient_email,participant_role,scheduled_for,expires_at,next_attempt_at)
 select a.appointment_id,p.participant_id,a.calendar_revision,
   'time_change:'||stage||':'||r.id::text||':'||r.proposal_revision::text||':'||private.calendar_time_change_version(a,r,p),
   c.channel,p.user_id,lower(btrim(coalesce(p.email,''))),p.participant_role,stamp,
   least(stamp+interval '24 hours',private.calendar_end(a),case stage when 'requested' then r.request_expires_at when 'proposed' then r.hold_expires_at else stamp+interval '24 hours' end),stamp
 from public.appointment_participants p cross join (values('email'),('in_app')) c(channel)
 where p.appointment_id=a.appointment_id and p.rsvp_revoked_at is null
   and (stage<>'requested' or p.user_id=coalesce(a.agent_id,a.created_by) or p.user_id=r.requested_by or p.participant_id=r.participant_id)
   and (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
   and ((c.channel='email' and private.calendar_email_allowed(a.organisation_id,lower(btrim(p.email))) and p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (c.channel='in_app' and p.user_id is not null))
 on conflict do nothing;
end; $$;
revoke all on function private.queue_calendar_time_change(uuid) from public,anon,authenticated,service_role;

create function private.calendar_time_change_notice() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.queue_calendar_time_change(new.id); return null; end; $$;
create constraint trigger zz_calendar_time_change_notice after insert or update on public.appointment_reschedule_requests
 deferrable initially deferred for each row execute function private.calendar_time_change_notice();
revoke all on function private.calendar_time_change_notice() from public,anon,authenticated,service_role;

create or replace function private.calendar_delivery_valid(j public.calendar_delivery_jobs) returns boolean
language sql stable security definer set search_path='' as $$
 select case when j.event_kind like 'time_change:%' then private.calendar_time_change_delivery_valid(j) else (j.support_retry_until is null or j.support_retry_until>clock_timestamp()) and exists(select 1 from public.appointments a join public.appointment_participants p on p.appointment_id=a.appointment_id
   where a.appointment_id=j.appointment_id and a.archived_at is null and not exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision) and p.participant_id=j.participant_id
   and a.calendar_delivery_managed and a.attorney_delivery_enabled is null
   and (a.listing_viewing_round_number is null or j.event_kind like 'reminder:%')
   and not (j.event_kind not like 'reminder:%' and j.event_kind not in ('cancelled','completed','declined','no_show') and exists(
     select 1 from public.appointment_reschedule_requests r where r.appointment_id=a.appointment_id and r.reservation_managed
       and (r.status in ('pending','proposed') or r.updated_at=a.updated_at)))
   and a.calendar_revision=j.revision and j.expires_at>clock_timestamp()
   and (j.channel<>'email' or private.calendar_email_allowed(a.organisation_id,j.recipient_email))
   and p.participant_role is not distinct from j.participant_role and p.user_id is not distinct from j.recipient_id and lower(btrim(coalesce(p.email,'')))=coalesce(j.recipient_email,'')
   and (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
   and (p.rsvp_revoked_at is null or (j.event_kind in ('cancelled','completed','declined','no_show') and p.rsvp_revoked_at=a.updated_at))
   and case when j.event_kind in ('cancelled','completed','declined','no_show') then
     a.invitations_enabled and private.calendar_status(a.status)=j.event_kind
   else private.calendar_status(a.status) not in ('draft','cancelled','completed','declined','no_show')
     and (a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' or a.hold_expires_at>clock_timestamp())
     and private.calendar_end(a)>clock_timestamp()
     and lower(p.rsvp_status)<>'declined'
     and case when j.event_kind like 'reminder:%' then a.reminders_enabled and exists(
       select 1 from jsonb_array_elements(coalesce(a.reminder_rules,'[]'::jsonb)) r
       where 'reminder:'||(r->>'reminderType')=j.event_kind and a.date_time-(r->>'offsetMinutes')::integer*interval '1 minute'=j.scheduled_for)
     else a.invitations_enabled end
   end) end;
$$;
revoke all on function private.calendar_delivery_valid(public.calendar_delivery_jobs) from public,anon,authenticated,service_role;


create or replace function private.reconcile_calendar_delivery(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.appointments; kind text; start_at timestamptz; change_id uuid;
begin
 select * into a from public.appointments where appointment_id=p_id;
 if not found or not a.calendar_delivery_managed then return; end if;
 update public.appointment_reminders set status='cancelled',updated_at=clock_timestamp() where appointment_id=p_id and status='pending';
 update public.calendar_delivery_jobs j set status='superseded',claimed_at=null,updated_at=clock_timestamp()
   where j.appointment_id=p_id and j.status in ('queued','processing','failed') and not private.calendar_delivery_valid(j);
 if a.archived_at is not null or (a.attorney_delivery_enabled is not null and not a.reservation_managed) or exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision) then return; end if;
 kind:=case private.calendar_status(a.status) when 'requested' then 'invite' when 'accepted' then 'invite'
   when 'confirmed' then 'confirmed' when 'alternative_proposed' then 'reschedule_proposed'
   when 'alternative_requested' then 'reschedule_requested' else private.calendar_status(a.status) end;
 start_at:=a.date_time;
 if kind='draft' then return; end if;
 insert into public.calendar_delivery_jobs(appointment_id,participant_id,revision,event_kind,channel,recipient_id,recipient_email,participant_role,scheduled_for,expires_at,next_attempt_at)
 select a.appointment_id,p.participant_id,a.calendar_revision,kind,c.channel,p.user_id,lower(btrim(coalesce(p.email,''))),p.participant_role,
   clock_timestamp(),case when kind in ('cancelled','completed','declined','no_show') then clock_timestamp()+interval '1 day'
     else least(private.calendar_end(a),case when a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' then private.calendar_end(a) else a.hold_expires_at end) end,clock_timestamp()
 from public.appointment_participants p cross join (values('email'),('in_app')) c(channel)
 where p.appointment_id=a.appointment_id and a.invitations_enabled and a.listing_viewing_round_number is null
   and not exists(select 1 from public.appointment_reschedule_requests r where r.appointment_id=a.appointment_id and r.reservation_managed and (r.status in ('pending','proposed') or r.updated_at=a.updated_at))
   and (p.rsvp_revoked_at is null or (kind in ('cancelled','completed','declined','no_show') and p.rsvp_revoked_at=a.updated_at))
   and (kind in ('cancelled','completed','declined','no_show') or (lower(p.rsvp_status)<>'declined' and private.calendar_end(a)>clock_timestamp()
     and (a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' or a.hold_expires_at>clock_timestamp())))
   and (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
   and ((c.channel='email' and private.calendar_email_allowed(a.organisation_id,lower(btrim(p.email))) and p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (c.channel='in_app' and p.user_id is not null))
 on conflict(appointment_id,revision,participant_id,event_kind,channel) do nothing;
 for change_id in select r.id from public.appointment_reschedule_requests r where r.appointment_id=a.appointment_id and r.reservation_managed
   and (r.status in ('pending','proposed') or r.updated_at=a.updated_at) loop
   perform private.queue_calendar_time_change(change_id);
 end loop;
 if not a.reminders_enabled or kind in ('draft','cancelled','completed','declined','no_show') then return; end if;
 insert into public.calendar_delivery_jobs(appointment_id,participant_id,revision,event_kind,channel,recipient_id,recipient_email,participant_role,scheduled_for,expires_at,next_attempt_at)
 select a.appointment_id,p.participant_id,a.calendar_revision,'reminder:'||(r->>'reminderType'),c.channel,p.user_id,lower(btrim(coalesce(p.email,''))),p.participant_role,
   start_at-(r->>'offsetMinutes')::integer*interval '1 minute',least(start_at+interval '15 minutes',start_at-(r->>'offsetMinutes')::integer*interval '1 minute'+interval '15 minutes'),
   start_at-(r->>'offsetMinutes')::integer*interval '1 minute'
 from public.appointment_participants p cross join jsonb_array_elements(coalesce(a.reminder_rules,'[]'::jsonb)) r cross join (values('email'),('in_app')) c(channel)
 where p.appointment_id=a.appointment_id and p.rsvp_revoked_at is null and lower(p.rsvp_status)<>'declined'
   and (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
   and ((c.channel='email' and private.calendar_email_allowed(a.organisation_id,lower(btrim(p.email))) and p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (c.channel='in_app' and p.user_id is not null))
   and (a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' or a.hold_expires_at>clock_timestamp())
   and start_at-(r->>'offsetMinutes')::integer*interval '1 minute'>clock_timestamp()
 on conflict(appointment_id,revision,participant_id,event_kind,channel) do nothing;
end; $$;
revoke all on function private.reconcile_calendar_delivery(uuid) from public,anon,authenticated;


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
revoke all on function public.get_calendar_invitation_context(text) from public;
grant execute on function public.get_calendar_invitation_context(text) to anon,authenticated;


-- A scanner following a link cannot mutate anything. The browser must submit a
-- command with the exact proposal version it displayed. Hashed-token receipts
-- preserve the outcome if the last approval rotates the invitation before a retry.
create table private.calendar_invitation_commands (
 token_hash text not null, command_id uuid not null, appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
 participant_id uuid not null references public.appointment_participants(participant_id) on delete cascade,
 fingerprint jsonb not null, result jsonb not null, expires_at timestamptz not null,
 primary key(token_hash,command_id)
);
create index calendar_invitation_commands_appointment_idx on private.calendar_invitation_commands(appointment_id);
create index calendar_invitation_commands_participant_idx on private.calendar_invitation_commands(participant_id);
alter table private.calendar_invitation_commands enable row level security;
revoke all on private.calendar_invitation_commands from public,anon,authenticated,service_role;
create function public.respond_calendar_time_change_by_token(p_token text,p_request_id uuid,p_proposal_revision integer,p_command_id uuid,p_status text)
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
revoke all on function public.respond_calendar_time_change_by_token(text,uuid,integer,uuid,text) from public;
grant execute on function public.respond_calendar_time_change_by_token(text,uuid,integer,uuid,text) to anon,authenticated;
commit;
