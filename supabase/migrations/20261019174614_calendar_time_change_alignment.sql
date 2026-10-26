begin;
-- A reminder belongs to the saved booking and recipient, not to a proposal vote.
-- Keep this snapshot private; the browser only reads existing scoped receipts.
alter table public.calendar_delivery_jobs add column reminder_context text;
create function private.calendar_reminder_context(a public.appointments,p public.appointment_participants) returns text
language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_array(extract(epoch from a.date_time),extract(epoch from private.calendar_end(a)),a.timezone,a.all_day,
   a.title,a.appointment_type,a.location,a.meeting_url,a.notes,a.appointment_instructions,a.visibility_scope,
   a.email_theme,a.email_template_key,p.user_id,lower(btrim(coalesce(p.email,''))),p.name,p.participant_role)::text);
$$;
revoke all on function private.calendar_reminder_context(public.appointments,public.appointment_participants) from public,anon,authenticated,service_role;
-- Only current legacy receipts have a trustworthy snapshot. Do not revive old jobs.
update public.calendar_delivery_jobs j set reminder_context=private.calendar_reminder_context(a,p)
 from public.appointments a,public.appointment_participants p
 where j.event_kind like 'reminder:%' and j.appointment_id=a.appointment_id and p.participant_id=j.participant_id and j.revision=a.calendar_revision;
create index calendar_reminder_booking_idx on public.calendar_delivery_jobs(appointment_id,participant_id,event_kind,channel,scheduled_for,reminder_context) where event_kind like 'reminder:%';

create function private.preserve_calendar_reminder() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.appointments; p public.appointment_participants;
begin
 if new.event_kind not like 'reminder:%' then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into a from public.appointments where appointment_id=new.appointment_id;
 select * into p from public.appointment_participants where participant_id=new.participant_id;
 new.reminder_context:=private.calendar_reminder_context(a,p);
 -- Retain sent receipts and active retries, including a job frozen before a vote.
 if exists(select 1 from public.calendar_delivery_jobs j where j.appointment_id=new.appointment_id and j.participant_id=new.participant_id
   and j.event_kind=new.event_kind and j.channel=new.channel and j.scheduled_for=new.scheduled_for and j.reminder_context=new.reminder_context
   and j.status<>'superseded') then return null; end if;
 return new;
end; $$;
revoke all on function private.preserve_calendar_reminder() from public,anon,authenticated,service_role;
create trigger calendar_preserve_reminder before insert on public.calendar_delivery_jobs for each row execute function private.preserve_calendar_reminder();


create or replace function private.calendar_delivery_valid(j public.calendar_delivery_jobs) returns boolean
language sql stable security definer set search_path='' as $$
 select case when j.event_kind like 'time_change:%' then private.calendar_time_change_delivery_valid(j) else (j.support_retry_until is null or j.support_retry_until>clock_timestamp()) and exists(select 1 from public.appointments a join public.appointment_participants p on p.appointment_id=a.appointment_id
   where a.appointment_id=j.appointment_id and a.archived_at is null and not exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision) and p.participant_id=j.participant_id
   and a.calendar_delivery_managed and not private.calendar_is_specialist(a)
   and (a.listing_viewing_round_number is null or j.event_kind like 'reminder:%')
   and not (j.event_kind not like 'reminder:%' and j.event_kind not in ('cancelled','completed','declined','no_show') and exists(
     select 1 from public.appointment_reschedule_requests r where r.appointment_id=a.appointment_id and r.reservation_managed
       and (r.status in ('pending','proposed') or r.updated_at=a.updated_at)))
   and (case when j.event_kind like 'reminder:%' then j.reminder_context=private.calendar_reminder_context(a,p) else a.calendar_revision=j.revision end) and j.expires_at>clock_timestamp()
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

-- Keep one personal copy at the original time until the replacement commits.

create or replace function private.calendar_provider_target(a public.appointments,c private.calendar_provider_connections,existing boolean) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare scoped boolean; closed text; finish timestamptz; payload jsonb;
begin
 scoped:=coalesce(a.organisation_id=c.organisation_id and (c.user_id in (a.agent_id,a.scheduling_owner_user_id,a.created_by)
   or exists(select 1 from public.appointment_participants p where p.appointment_id=a.appointment_id and p.user_id=c.user_id and p.rsvp_revoked_at is null and lower(p.rsvp_status)<>'declined')),false);
 closed:=private.calendar_status(a.status);
 if not scoped or coalesce((to_jsonb(a)->>'is_demo_data')::boolean,false) or a.archived_at is not null or closed in ('draft','cancelled','declined') then return jsonb_build_object('action','delete'); end if;
 if exists(select 1 from private.calendar_repair_entries r where r.appointment_id=a.appointment_id and r.suppressed_revision=a.calendar_revision) then return jsonb_build_object('action','suppress'); end if;
 finish:=private.calendar_end(a);
 if finish is null or (a.end_date_time is null and a.end_time is null and not a.all_day)
   or (a.date_time at time zone a.timezone)::date is distinct from a.appointment_date then
   return jsonb_build_object('action','suppress','error','schedule_needs_review'); end if;
 if closed not in ('confirmed','completed','no_show') and not a.has_confirmed_reservation and not private.calendar_reserves(a,clock_timestamp()) then return jsonb_build_object('action','delete'); end if;
 -- Initial connection only copies active future/in-progress bookings. Retain
 -- already connected completed/past confirmed copies as transparent history.
 if not existing and (finish<=clock_timestamp() or closed in ('completed','no_show')) then return jsonb_build_object('action','delete'); end if;
 payload:=jsonb_build_object('appointmentId',a.appointment_id,'revision',a.calendar_revision,'title',coalesce(nullif(a.title,''),'Appointment'),
   'location',coalesce(a.location,''),'meetingUrl',coalesce(a.meeting_url,''),'start',a.date_time,'end',finish,
   'date',a.appointment_date,'endDate',(finish at time zone a.timezone)::date,'timezone',a.timezone,'allDay',a.all_day,
   'status',case when closed in ('alternative_requested','alternative_proposed') then case when a.has_confirmed_reservation then 'confirmed' else 'requested' end else closed end,'busy',private.calendar_reserves(a,clock_timestamp()));
 return jsonb_build_object('action','upsert','payload',payload,'hash',md5((payload-'revision')::text));
exception when invalid_parameter_value then return jsonb_build_object('action','suppress','error','schedule_needs_review');
end; $$;

-- Adopt the material hash for completed copies without issuing an external write.
-- Never rewrite a frozen create, active claim or an external-change review.
update private.calendar_provider_events set
 synced_hash=case when synced_hash=desired_hash then md5((desired_payload-'revision')::text) else synced_hash end,
 desired_hash=md5((desired_payload-'revision')::text)
 where desired_action='upsert' and status='synced' and external_id is not null and desired_payload is not null
   and job_lease is null and force_hash is null;

create or replace function private.calendar_expected_jobs(a public.appointments)
returns table(participant_id uuid,event_kind text,channel text,recipient_id uuid,recipient_email text,participant_role text,scheduled_for timestamptz,expires_at timestamptz)
language sql volatile security definer set search_path='' as $$
 with kinds as (
  select case private.calendar_status(a.status) when 'requested' then 'invite' when 'accepted' then 'invite'
   when 'confirmed' then 'confirmed' when 'alternative_proposed' then 'reschedule_proposed'
   when 'alternative_requested' then 'reschedule_requested' else private.calendar_status(a.status) end as kind,
   clock_timestamp() as due,least(private.calendar_end(a),case when a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' then private.calendar_end(a) else a.hold_expires_at end) as finish
  where a.invitations_enabled and a.listing_viewing_round_number is null
  union all
  select 'reminder:'||(r->>'reminderType'),a.date_time-(r->>'offsetMinutes')::integer*interval '1 minute',
   a.date_time-(r->>'offsetMinutes')::integer*interval '1 minute'+interval '15 minutes'
  from jsonb_array_elements(coalesce(a.reminder_rules,'[]')) r where a.reminders_enabled
   and a.date_time-(r->>'offsetMinutes')::integer*interval '1 minute'>clock_timestamp()
 ), routes as (
  select p.participant_id,k.kind,c.channel,p.user_id,lower(btrim(coalesce(p.email,''))) as email,p.participant_role,k.due,k.finish
  from public.appointment_participants p cross join kinds k cross join (values('email'),('in_app')) c(channel)
  where p.appointment_id=a.appointment_id and p.rsvp_revoked_at is null
   and ((c.channel='email' and p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (c.channel='in_app' and p.user_id is not null))
 )
 select * from routes r where a.archived_at is null and a.calendar_delivery_managed and not private.calendar_is_specialist(a)
  and private.calendar_status(a.status) not in ('draft','cancelled','completed','declined','no_show')
  and not exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision)
  and private.calendar_delivery_valid(jsonb_populate_record(null::public.calendar_delivery_jobs,jsonb_build_object(
   'appointment_id',a.appointment_id,'participant_id',r.participant_id,'revision',a.calendar_revision,'event_kind',r.kind,
   'channel',r.channel,'recipient_id',r.user_id,'recipient_email',r.email,'participant_role',r.participant_role,'scheduled_for',r.due,'expires_at',r.finish,'reminder_context',(select private.calendar_reminder_context(a,p) from public.appointment_participants p where p.participant_id=r.participant_id))));
$$;

create or replace function private.calendar_health_findings(p_org uuid)
returns table(issue_key text,appointment_id uuid,connection_id uuid,kind text,severity text,revision integer,evidence jsonb)
language sql volatile security definer set search_path='' as $$
 with appointments as materialized (select a.* from public.appointments a where a.organisation_id=p_org),
 jobs as materialized (select j.* from public.calendar_delivery_jobs j join appointments a on a.appointment_id=j.appointment_id
  where j.status in ('queued','processing','failed') and (j.expires_at>clock_timestamp() or j.scheduled_for>clock_timestamp()-interval '7 days')),
 active as materialized (select a.* from appointments a where a.archived_at is null and not private.calendar_is_specialist(a)
  and private.calendar_status(a.status) not in ('draft','cancelled','completed','declined','no_show') and (a.date_time>clock_timestamp()-interval '90 days' or a.date_time is null)),
 expected as materialized (select a.appointment_id,a.calendar_revision,j.* from active a cross join lateral private.calendar_expected_jobs(a) j),
 connections as materialized (select c.* from private.calendar_provider_connections c where c.organisation_id=p_org),
 provider as materialized (select e.*,c.status as connection_status,c.last_checked_at from private.calendar_provider_events e join connections c on c.id=e.connection_id)
 select 'delivery:'||j.id::text,j.appointment_id,null::uuid,
  case when (j.expires_at<=clock_timestamp() or j.support_retry_until<=clock_timestamp()) and j.revision=(select a.calendar_revision from appointments a where a.appointment_id=j.appointment_id) then 'delivery_expired'
   when not private.calendar_delivery_valid(j) then 'obsolete_delivery'
   when j.status='processing' and j.claimed_at<clock_timestamp()-interval '5 minutes' then 'stalled_delivery'
   when j.status='failed' and j.attempt_count>=j.max_attempts then 'delivery_exhausted'
   when j.status='failed' and j.attempt_count>=3 then 'delivery_repeated_failure' else 'delivery_overdue' end,
  'warning',j.revision,jsonb_build_object('jobId',j.id,'attempts',j.attempt_count,'status',j.status,'nextAttemptAt',j.next_attempt_at)
 from jobs j where not private.calendar_delivery_valid(j) or (j.status='processing' and j.claimed_at<clock_timestamp()-interval '5 minutes')
  or (j.status='failed' and j.attempt_count>=3) or (j.status in ('queued','failed') and j.next_attempt_at<clock_timestamp()-interval '10 minutes')
 union all
 select 'missing:'||x.appointment_id||':'||x.participant_id||':'||x.event_kind||':'||x.channel,x.appointment_id,null,
  case when x.event_kind like 'reminder:%' then 'missing_reminder' else 'missing_invitation' end,'warning',x.calendar_revision,
  jsonb_build_object('eventKind',x.event_kind,'channel',x.channel,'scheduledFor',x.scheduled_for)
 from expected x where not exists(select 1 from public.calendar_delivery_jobs j where j.appointment_id=x.appointment_id and (j.revision=x.calendar_revision or (x.event_kind like 'reminder:%' and private.calendar_delivery_valid(j)))
  and j.participant_id=x.participant_id and j.event_kind=x.event_kind and j.channel=x.channel)
 union all
 select 'schedule:'||a.appointment_id,a.appointment_id,null,'schedule_inconsistent','critical',a.calendar_revision,'{}'::jsonb
 from active a where not private.calendar_schedule_consistent(a)
 union all
 select 'links:'||a.appointment_id,a.appointment_id,null,'link_inconsistent','critical',a.calendar_revision,'{}'::jsonb
 from active a where not private.calendar_links_consistent(a)
 union all
 select 'connection:'||c.id,null,c.id,case when c.status='needs_reconnect' then 'provider_disconnected' else 'provider_poll_stale' end,'warning',null,
  jsonb_build_object('provider',c.provider,'userId',c.user_id,'lastCheckedAt',c.last_checked_at)
 from connections c where private.calendar_provider_member(c.organisation_id,c.user_id) and (c.status='needs_reconnect'
  or (c.status='connected' and coalesce(c.last_checked_at,c.connected_at)<clock_timestamp()-interval '20 minutes'))
 union all
 select 'provider:'||e.connection_id||':'||e.appointment_id,e.appointment_id,e.connection_id,
  case when e.status='needs_review' then 'provider_needs_review' when e.status='failed' and e.attempts>=3 then 'provider_repeated_failure' else 'provider_overdue' end,
  'warning',null,jsonb_build_object('status',e.status,'attempts',e.attempts)
 from provider e where e.connection_status='connected' and (e.status='needs_review' or (e.status='failed' and e.attempts>=3)
  or (e.status in ('queued','failed') and e.next_attempt_at<clock_timestamp()-interval '10 minutes')
  or (e.status='processing' and e.claimed_at<clock_timestamp()-interval '5 minutes'))
 union all
 select 'provider_missing:'||c.id||':'||a.appointment_id,a.appointment_id,c.id,'missing_provider_copy','warning',a.calendar_revision,
  jsonb_build_object('provider',c.provider,'userId',c.user_id)
 from active a join connections c on c.status='connected' and private.calendar_provider_member(c.organisation_id,c.user_id)
 where not exists(select 1 from private.calendar_provider_events e where e.connection_id=c.id and e.appointment_id=a.appointment_id)
  and private.calendar_provider_target(a,c,false)->>'action'='upsert';
$$;

create or replace function public.read_calendar_appointment_support(p_organisation_id uuid,p_appointment_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.appointments; jobs jsonb; history jsonb; participants jsonb;
begin
 select * into a from public.appointments where appointment_id=p_appointment_id and organisation_id=p_organisation_id;
 if auth.uid() is null or a.appointment_id is null or public.bridge_is_active_member(p_organisation_id) is not true
  or public.bridge_can_write_appointment_payload(a.transaction_id,a.organisation_id,a.created_by,a.agent_id) is not true then raise exception 'Appointment support access denied.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(j)),'[]') into jobs from (
  select id,revision,event_kind,channel,recipient_id,recipient_email,participant_role,scheduled_for,expires_at,status,attempt_count,max_attempts,
   next_attempt_at,accepted_at,delivered_at,provider_message_id,last_error,support_retry_until,
   (status='failed' and attempt_count>=max_attempts and provider_message_id is null and accepted_at is null and created_at>clock_timestamp()-interval '23 hours'
    and a.archived_at is null and a.calendar_delivery_managed and not private.calendar_is_specialist(a)
    and private.calendar_schedule_consistent(a) and private.calendar_links_consistent(a)
    and not exists(select 1 from private.calendar_repair_entries r where r.appointment_id=a.appointment_id and r.suppressed_revision=a.calendar_revision)
    and not exists(select 1 from private.calendar_support_commands c where c.appointment_id=a.appointment_id and c.action='retry' and c.fingerprint->>'jobId'=j.id::text and c.created_at>clock_timestamp()-interval '2 minutes')
    and private.calendar_delivery_valid(j) and (select count(*) from private.calendar_support_commands c where c.appointment_id=a.appointment_id and c.action='retry' and c.fingerprint->>'jobId'=j.id::text)<2) as retry_allowed
  from public.calendar_delivery_jobs j where appointment_id=a.appointment_id order by created_at desc,id limit 201
 ) j;
 select coalesce(jsonb_agg(to_jsonb(h)),'[]') into history from (
  select 'change'::text as source,created_at,actor_id,revision,status,changed_fields,null::text as reason,null::text as actor_label from private.calendar_change_history where appointment_id=a.appointment_id
  union all select 'time_change',e.created_at,e.actor_id,e.proposal_revision,e.action,array[e.action],null::text,(select coalesce(nullif(p.name,''),p.email) from public.appointment_participants p where p.participant_id=e.participant_id) from private.calendar_time_change_events e where e.appointment_id=a.appointment_id
  union all select 'support',created_at,actor_id,(fingerprint->>'revision')::integer,action,array[action],reason,null::text from private.calendar_support_commands where appointment_id=a.appointment_id
  order by created_at desc limit 101
 ) h;
 select coalesce(jsonb_agg(jsonb_build_object('id',participant_id,'name',name,'email',email,'role',participant_role,'required',is_required,'response',rsvp_status,'respondedAt',responded_at,'revokedAt',rsvp_revoked_at)),'[]')
  into participants from public.appointment_participants where appointment_id=a.appointment_id;
 return jsonb_build_object('verified',true,'organisationId',p_organisation_id,'appointmentId',a.appointment_id,'revision',a.calendar_revision,
  'status',a.status,'archivedAt',a.archived_at,'holdExpiresAt',a.hold_expires_at,'startAt',a.date_time,'endAt',a.end_date_time,
  'historyTruncated',jsonb_array_length(history)>100,'jobsTruncated',jsonb_array_length(jobs)>200,
  'history',case when jsonb_array_length(history)>100 then history-100 else history end,'jobs',case when jsonb_array_length(jobs)>200 then jobs-200 else jobs end,'participants',participants,
  'reconcileAllowed',a.archived_at is null and a.calendar_delivery_managed and not private.calendar_is_specialist(a) and private.calendar_schedule_consistent(a) and private.calendar_links_consistent(a)
   and private.calendar_status(a.status) not in ('draft','cancelled','completed','declined','no_show') and private.calendar_reserves(a,clock_timestamp())
   and not exists(select 1 from private.calendar_repair_entries r where r.appointment_id=a.appointment_id and r.suppressed_revision=a.calendar_revision));
end; $$;

create or replace function public.calendar_support_action(p_organisation_id uuid,p_appointment_id uuid,p_expected_revision integer,p_action text,p_job_id uuid,p_command_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.appointments; j public.calendar_delivery_jobs; v_fingerprint jsonb; receipt jsonb; inserted integer:=0; retired integer:=0;
begin
 if auth.uid() is null or p_command_id is null or p_action is null or p_action not in ('retry','reconcile') or nullif(btrim(p_reason),'') is null or length(p_reason)>500 then raise exception 'Choose a support action and give a short reason.' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into a from public.appointments where appointment_id=p_appointment_id and organisation_id=p_organisation_id for update;
 if a.appointment_id is null or public.bridge_is_active_member(p_organisation_id) is not true or public.bridge_can_write_appointment_payload(a.transaction_id,a.organisation_id,a.created_by,a.agent_id) is not true
  then raise exception 'Appointment support access denied.' using errcode='42501'; end if;
 v_fingerprint:=jsonb_build_object('organisationId',p_organisation_id,'appointmentId',p_appointment_id,'revision',p_expected_revision,'action',p_action,'jobId',p_job_id,'reason',btrim(p_reason));
 select c.receipt into receipt from private.calendar_support_commands c where c.actor_id=auth.uid() and c.command_id=p_command_id and c.fingerprint=v_fingerprint;
 if found then return receipt||jsonb_build_object('replayed',true); end if;
 if exists(select 1 from private.calendar_support_commands where actor_id=auth.uid() and command_id=p_command_id) then raise exception 'Support command already used for different details.' using errcode='22023'; end if;
 if p_expected_revision is null or p_expected_revision<>a.calendar_revision then raise exception 'Appointment changed. Refresh support details.' using errcode='40001'; end if;
 if a.calendar_delivery_managed is not true or private.calendar_is_specialist(a) or a.archived_at is not null
  or exists(select 1 from private.calendar_repair_entries r where r.appointment_id=a.appointment_id and r.suppressed_revision=a.calendar_revision) then raise exception 'This appointment requires its dedicated or reviewed workflow.' using errcode='22023'; end if;
 if not private.calendar_links_consistent(a) then raise exception 'Appointment links need review before recovery.' using errcode='22023'; end if;
 if p_action='retry' then
  select * into j from public.calendar_delivery_jobs where id=p_job_id and appointment_id=a.appointment_id for update;
  if not found or j.status<>'failed' or j.attempt_count<j.max_attempts or j.provider_message_id is not null or j.accepted_at is not null
   or j.created_at<=clock_timestamp()-interval '23 hours' or not private.calendar_schedule_consistent(a) or not private.calendar_delivery_valid(j) then raise exception 'This delivery is not eligible for manual retry.' using errcode='22023'; end if;
  if (select count(*) from private.calendar_support_commands c where c.appointment_id=a.appointment_id and c.action='retry' and c.fingerprint->>'jobId'=j.id::text)>=2
   or exists(select 1 from private.calendar_support_commands c where c.appointment_id=a.appointment_id and c.action='retry' and c.fingerprint->>'jobId'=j.id::text and c.created_at>clock_timestamp()-interval '2 minutes')
   then raise exception 'Manual retry limit or cooldown reached.' using errcode='22023'; end if;
  update public.calendar_delivery_jobs set status='queued',claimed_at=null,support_retry_until=least(coalesce(support_retry_until,'infinity'::timestamptz),created_at+interval '23 hours'),max_attempts=attempt_count+1,next_attempt_at=clock_timestamp(),last_error='Reviewed retry queued.',updated_at=clock_timestamp() where id=j.id;
  inserted:=1;
 else
  if p_job_id is not null or not private.calendar_schedule_consistent(a) or private.calendar_status(a.status) in ('draft','cancelled','completed','declined','no_show') or private.calendar_reserves(a,clock_timestamp()) is not true then raise exception 'Only a valid active reservation can reconcile future reminders.' using errcode='22023'; end if;
  update public.calendar_delivery_jobs existing set status='superseded',claimed_at=null,updated_at=clock_timestamp()
   where appointment_id=a.appointment_id and status in ('queued','processing','failed') and not private.calendar_delivery_valid(existing);
  get diagnostics retired=row_count;
  insert into public.calendar_delivery_jobs(appointment_id,participant_id,revision,event_kind,channel,recipient_id,recipient_email,participant_role,scheduled_for,expires_at,next_attempt_at)
   select a.appointment_id,x.participant_id,a.calendar_revision,x.event_kind,x.channel,x.recipient_id,x.recipient_email,x.participant_role,x.scheduled_for,x.expires_at,x.scheduled_for
   from private.calendar_expected_jobs(a) x where x.event_kind like 'reminder:%' and x.scheduled_for>clock_timestamp()
   on conflict(appointment_id,revision,participant_id,event_kind,channel) do nothing;
  get diagnostics inserted=row_count;
 end if;
 receipt:=jsonb_build_object('verified',true,'organisationId',p_organisation_id,'appointmentId',a.appointment_id,'revision',a.calendar_revision,'action',p_action,'commandId',p_command_id,'queued',inserted,'retired',retired,'replayed',false);
 insert into private.calendar_support_commands(actor_id,command_id,appointment_id,action,reason,fingerprint,receipt) values(auth.uid(),p_command_id,a.appointment_id,p_action,btrim(p_reason),v_fingerprint,receipt);
 return receipt;
end; $$;

create or replace function public.prepare_calendar_delivery(p_id uuid,p_attempt integer,p_payload jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.calendar_delivery_jobs; a public.appointments; person public.appointment_participants; event text;
begin
 if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into j from public.calendar_delivery_jobs where id=p_id for update;
 if not found or j.status<>'processing' or j.attempt_count<>p_attempt or j.claimed_at<clock_timestamp()-interval '5 minutes' then return null; end if;
 if not private.calendar_delivery_valid(j) then update public.calendar_delivery_jobs set status='superseded',claimed_at=null where id=p_id; return null; end if;
 select * into a from public.appointments where appointment_id=j.appointment_id;
 select * into person from public.appointment_participants where participant_id=j.participant_id;
 if j.channel='email' then
   if p_payload is null or lower(p_payload->>'to') is distinct from j.recipient_email or p_payload->>'appointmentId' is distinct from j.appointment_id::text
     or p_payload->>'idempotencyKey' is distinct from 'calendar-appointment:'||j.id::text then raise exception 'Invalid delivery payload'; end if;
   -- Freeze the first attempt so provider idempotency keys always carry identical content.
   update public.calendar_delivery_jobs set payload=coalesce(payload,p_payload) where id=p_id returning * into j;
   return j.payload;
 end if;
 event:=case when j.event_kind like 'reminder:%' then 'appointment_reminder_due' when j.event_kind='invite' then 'appointment_confirmation_required'
   when j.event_kind in ('cancelled','completed','confirmed','declined') then 'appointment_'||j.event_kind else 'appointment_updated' end;
 insert into public.appointment_notification_events(id,appointment_id,transaction_id,event_type,recipient_id,recipient_role,recipient_email,visibility,title,message,email_status,in_app_status,metadata,dedupe_key)
 values(j.id,a.appointment_id,a.transaction_id,event,j.recipient_id,lower(j.participant_role),j.recipient_email,a.visibility_scope,
   case when j.event_kind like 'time_change:%' then case split_part(j.event_kind,':',2) when 'requested' then 'New time requested' when 'proposed' then 'Review proposed time' when 'confirmed' then 'New time confirmed' when 'declined' then 'Current time kept' when 'withdrawn' then 'Time request withdrawn' else 'Time request expired' end else 'Appointment update' end,a.title,'skipped','sent',jsonb_build_object('deliveryJobId',j.id,'calendarRevision',j.revision,'appointmentId',a.appointment_id,'timeChangeStage',case when j.event_kind like 'time_change:%' then split_part(j.event_kind,':',2) end,'actionUrl','/pipeline/calendar?appointmentId='||a.appointment_id::text),'calendar-delivery:'||j.id::text)
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
 update public.calendar_delivery_jobs set status='delivered',delivered_at=clock_timestamp(),claimed_at=null,updated_at=clock_timestamp() where id=p_id;
 return jsonb_build_object('delivered',true);
end; $$;

commit;
