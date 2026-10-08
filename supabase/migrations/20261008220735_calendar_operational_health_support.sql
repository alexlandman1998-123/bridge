begin;

-- Keep the retry deadline in the authoritative dispatch gate as well as the
-- support command; a delayed worker must not outlive provider deduplication.
alter table public.calendar_delivery_jobs add column support_retry_until timestamptz;

create or replace function private.calendar_delivery_valid(j public.calendar_delivery_jobs) returns boolean
language sql stable security definer set search_path='' as $$
 select (j.support_retry_until is null or j.support_retry_until>clock_timestamp()) and exists(select 1 from public.appointments a join public.appointment_participants p on p.appointment_id=a.appointment_id
   where a.appointment_id=j.appointment_id and a.archived_at is null and not exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision) and p.participant_id=j.participant_id
   and a.calendar_delivery_managed and a.attorney_delivery_enabled is null
   and (a.listing_viewing_round_number is null or j.event_kind like 'reminder:%')
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
   end);
$$;
revoke all on function private.calendar_delivery_valid(public.calendar_delivery_jobs) from public,anon,authenticated,service_role;


create table private.calendar_health_scans (
 organisation_id uuid primary key references public.organisations(id), checked_at timestamptz not null,
 status text not null check(status in ('verified','partial','failed')), finding_count integer, error_code text
);
create table private.calendar_health_incidents (
 organisation_id uuid not null references public.organisations(id), issue_key text not null,
 appointment_id uuid references public.appointments(appointment_id), connection_id uuid references private.calendar_provider_connections(id),
 kind text not null, severity text not null, revision integer, evidence jsonb not null,
 first_seen_at timestamptz not null, last_seen_at timestamptz not null, resolved_at timestamptz,
 primary key(organisation_id,issue_key)
);
create index calendar_health_active_idx on private.calendar_health_incidents(organisation_id,last_seen_at) where resolved_at is null;
create table private.calendar_support_commands (
 actor_id uuid not null references public.profiles(id), command_id uuid not null,
 appointment_id uuid not null references public.appointments(appointment_id), action text not null,
 reason text not null, fingerprint jsonb not null, receipt jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,command_id)
);
create index calendar_support_commands_appointment_idx on private.calendar_support_commands(appointment_id,created_at);
create table private.calendar_change_history (
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments(appointment_id),
 actor_id uuid references public.profiles(id) on delete set null, revision integer not null, previous_revision integer,
 status text, previous_status text, start_at timestamptz, end_at timestamptz, changed_fields text[] not null,
 created_at timestamptz not null default clock_timestamp()
);
create index calendar_change_history_appointment_idx on private.calendar_change_history(appointment_id,created_at);
alter table private.calendar_health_scans enable row level security;
alter table private.calendar_health_incidents enable row level security;
alter table private.calendar_support_commands enable row level security;
alter table private.calendar_change_history enable row level security;
revoke all on private.calendar_health_scans,private.calendar_health_incidents,private.calendar_support_commands,private.calendar_change_history from public,anon,authenticated,service_role;

create function private.calendar_support_org_manager(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.organisation_users m
 where m.organisation_id=p_org and m.user_id=auth.uid() and lower(coalesce(m.membership_status,m.status,''))='active'
 and lower(coalesce(m.workspace_role,m.organization_role,m.organisation_role,m.role,'')) in
 ('principal','owner','admin','organisation_admin','organization_admin','super_admin','head_office','branch_manager'));
$$;
revoke all on function private.calendar_support_org_manager(uuid) from public,anon,authenticated,service_role;

create function private.record_calendar_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare fields text[];
begin
 if tg_op='INSERT' then fields:=array['created'];
 else
  select array_agg(key order by key) into fields from jsonb_each(to_jsonb(new)) value
   where key<>'updated_at' and value.value is distinct from to_jsonb(old)->key;
  if fields is null then return new; end if;
 end if;
 insert into private.calendar_change_history(appointment_id,actor_id,revision,previous_revision,status,previous_status,start_at,end_at,changed_fields)
 values(new.appointment_id,auth.uid(),new.calendar_revision,case when tg_op='UPDATE' then old.calendar_revision end,
 new.status,case when tg_op='UPDATE' then old.status end,new.date_time,new.end_date_time,fields);
 return new;
end; $$;
revoke all on function private.record_calendar_change() from public,anon,authenticated,service_role;
create trigger calendar_change_history after insert or update on public.appointments for each row execute function private.record_calendar_change();

-- Expected routes contain no capabilities or message payloads. The existing
-- dispatch gate remains authoritative for preferences, identity and hold expiry.
create function private.calendar_expected_jobs(a public.appointments)
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
 select * from routes r where a.archived_at is null and a.calendar_delivery_managed and a.attorney_delivery_enabled is null
  and private.calendar_status(a.status) not in ('draft','cancelled','completed','declined','no_show')
  and not exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision)
  and private.calendar_delivery_valid(jsonb_populate_record(null::public.calendar_delivery_jobs,jsonb_build_object(
   'appointment_id',a.appointment_id,'participant_id',r.participant_id,'revision',a.calendar_revision,'event_kind',r.kind,
   'channel',r.channel,'recipient_id',r.user_id,'recipient_email',r.email,'participant_role',r.participant_role,'scheduled_for',r.due,'expires_at',r.finish)));
$$;
revoke all on function private.calendar_expected_jobs(public.appointments) from public,anon,authenticated,service_role;

create function private.calendar_schedule_consistent(a public.appointments) returns boolean
language plpgsql stable set search_path='' as $$
begin
 if a.date_time is null or a.end_date_time is null or a.end_date_time<=a.date_time or a.timezone is null
  or a.appointment_date is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=a.timezone) then return false; end if;
 return coalesce((a.date_time at time zone a.timezone) is not distinct from (a.appointment_date+a.start_time)
  and case when a.all_day then (a.date_time at time zone a.timezone)::time=time '00:00'
   and (a.end_date_time at time zone a.timezone)=((a.appointment_date+1)::timestamp)
  else (a.end_date_time at time zone a.timezone) is not distinct from (a.appointment_date+a.end_time) end,false);
exception when invalid_parameter_value then return false;
end; $$;
revoke all on function private.calendar_schedule_consistent(public.appointments) from public,anon,authenticated,service_role;

create function private.calendar_links_consistent(a public.appointments) returns boolean
language sql stable security definer set search_path='' as $$
 select not ((a.agent_id is not null and not private.calendar_provider_member(a.organisation_id,a.agent_id))
  or (a.lead_id is not null and not exists(select 1 from public.leads l where l.lead_id=a.lead_id and l.organisation_id=a.organisation_id))
  or (a.contact_id is not null and not exists(select 1 from public.contacts c where c.contact_id=a.contact_id and c.organisation_id=a.organisation_id))
  or (a.transaction_id is not null and not exists(select 1 from public.transactions t where t.id=a.transaction_id and t.organisation_id=a.organisation_id))
  or exists(select 1 from public.appointment_participants p where p.appointment_id=a.appointment_id and p.rsvp_revoked_at is null
   and lower(coalesce(p.participant_role,'')) in ('agent','co-agent','principal')
   and (p.organisation_id is distinct from a.organisation_id or p.user_id is null or not private.calendar_provider_member(a.organisation_id,p.user_id))));
$$;
revoke all on function private.calendar_links_consistent(public.appointments) from public,anon,authenticated,service_role;

create function private.calendar_health_findings(p_org uuid)
returns table(issue_key text,appointment_id uuid,connection_id uuid,kind text,severity text,revision integer,evidence jsonb)
language sql volatile security definer set search_path='' as $$
 with appointments as materialized (select a.* from public.appointments a where a.organisation_id=p_org),
 jobs as materialized (select j.* from public.calendar_delivery_jobs j join appointments a on a.appointment_id=j.appointment_id
  where j.status in ('queued','processing','failed') and (j.expires_at>clock_timestamp() or j.scheduled_for>clock_timestamp()-interval '7 days')),
 active as materialized (select a.* from appointments a where a.archived_at is null and a.attorney_delivery_enabled is null
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
 from expected x where not exists(select 1 from public.calendar_delivery_jobs j where j.appointment_id=x.appointment_id and j.revision=x.calendar_revision
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
revoke all on function private.calendar_health_findings(uuid) from public,anon,authenticated,service_role;

create function public.read_calendar_health(p_organisation_id uuid,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb; scan private.calendar_health_scans; total integer; maximum integer:=greatest(1,least(coalesce(p_limit,100),100));
begin
 if auth.uid() is null or public.bridge_is_active_member(p_organisation_id) is not true then raise exception 'Calendar health access denied.' using errcode='42501'; end if;
 if (select count(*) from public.appointments where organisation_id=p_organisation_id)>10000 then raise exception 'Calendar health needs a scoped operator review.' using errcode='54000'; end if;
 select * into scan from private.calendar_health_scans where organisation_id=p_organisation_id;
 select coalesce(jsonb_agg(to_jsonb(f)),'[]') into rows from (
  select h.*,case when a.organisation_id=p_organisation_id and public.bridge_can_access_appointment(a.appointment_id) then a.title end as title,
   coalesce(a.organisation_id=p_organisation_id and public.bridge_can_write_appointment_payload(a.transaction_id,a.organisation_id,a.created_by,a.agent_id),false) as "inspectAllowed"
  from private.calendar_health_findings(p_organisation_id) h left join public.appointments a on a.appointment_id=h.appointment_id
  left join private.calendar_provider_connections c on c.id=h.connection_id
  where (h.connection_id is not null and (c.user_id=auth.uid() or private.calendar_support_org_manager(p_organisation_id)))
   or (h.connection_id is null and a.organisation_id=p_organisation_id and public.bridge_can_access_appointment(a.appointment_id)
    and (a.created_by=auth.uid() or a.agent_id=auth.uid() or private.calendar_support_org_manager(p_organisation_id)))
  order by (h.severity='critical') desc,h.issue_key limit maximum+1
 ) f;
 total:=jsonb_array_length(rows);
 return jsonb_build_object('verified',true,'organisationId',p_organisation_id,'checkedAt',clock_timestamp(),'truncated',total>maximum,
  'issues',case when total>maximum then rows-maximum else rows end,
  'monitor',jsonb_build_object('lastCheckedAt',scan.checked_at,'status',case when scan.organisation_id is null then 'not_started'
   when scan.status<>'verified' then scan.status when scan.checked_at<clock_timestamp()-interval '10 minutes' then 'stale' else 'current' end));
end; $$;
revoke all on function public.read_calendar_health(uuid,integer) from public,anon;
grant execute on function public.read_calendar_health(uuid,integer) to authenticated;

-- Bounded, fair background collection. A failed/partial scan never resolves an
-- incident it did not verify. It observes state without retrying or sending work.
create function public.collect_calendar_health(p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o record; findings jsonb; f jsonb; checked integer:=0; started timestamptz:=clock_timestamp(); total integer; failed integer:=0; partial integer:=0;
begin
 if current_setting('role') not in ('service_role','none') then raise exception 'Calendar monitor requires server authorization.' using errcode='42501'; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('calendar_health_monitor',0)) then return jsonb_build_object('verified',false,'busy',true); end if;
 for o in select org.id from public.organisations org left join private.calendar_health_scans s on s.organisation_id=org.id
  where exists(select 1 from public.appointments a where a.organisation_id=org.id) or exists(select 1 from private.calendar_provider_connections c where c.organisation_id=org.id)
  order by s.checked_at nulls first,org.id limit greatest(1,least(coalesce(p_limit,25),50)) loop
  exit when clock_timestamp()-started>interval '20 seconds';
  begin
   if (select count(*) from public.appointments where organisation_id=o.id)>10000 then raise exception 'Scoped review required'; end if;
   select coalesce(jsonb_agg(to_jsonb(h)),'[]') into findings from (select * from private.calendar_health_findings(o.id) order by issue_key limit 1001) h;
   total:=jsonb_array_length(findings);
   if total>1000 then findings:=findings-1000; partial:=partial+1; end if;
   for f in select value from jsonb_array_elements(findings) loop
    insert into private.calendar_health_incidents(organisation_id,issue_key,appointment_id,connection_id,kind,severity,revision,evidence,first_seen_at,last_seen_at)
    values(o.id,f->>'issue_key',(f->>'appointment_id')::uuid,(f->>'connection_id')::uuid,f->>'kind',f->>'severity',(f->>'revision')::integer,f->'evidence',clock_timestamp(),clock_timestamp())
    on conflict(organisation_id,issue_key) do update set kind=excluded.kind,severity=excluded.severity,revision=excluded.revision,evidence=excluded.evidence,last_seen_at=excluded.last_seen_at,resolved_at=null;
   end loop;
   if total<=1000 then update private.calendar_health_incidents i set resolved_at=clock_timestamp() where organisation_id=o.id and resolved_at is null
   and not exists(select 1 from jsonb_array_elements(findings) current_finding where current_finding->>'issue_key'=i.issue_key); end if;
   insert into private.calendar_health_scans values(o.id,clock_timestamp(),case when total>1000 then 'partial' else 'verified' end,total,null)
    on conflict(organisation_id) do update set checked_at=excluded.checked_at,status=excluded.status,finding_count=excluded.finding_count,error_code=null;
  exception when others then
   failed:=failed+1;
   insert into private.calendar_health_scans values(o.id,clock_timestamp(),'failed',null,'scan_failed:'||sqlstate)
    on conflict(organisation_id) do update set checked_at=excluded.checked_at,status='failed',finding_count=null,error_code=excluded.error_code;
  end;
  checked:=checked+1;
 end loop;
 return jsonb_build_object('verified',failed=0 and partial=0,'organisationsChecked',checked,'failedScans',failed,'partialScans',partial);
end; $$;
revoke all on function public.collect_calendar_health(integer) from public,anon,authenticated;
grant execute on function public.collect_calendar_health(integer) to service_role;

create function public.read_calendar_appointment_support(p_organisation_id uuid,p_appointment_id uuid) returns jsonb
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
    and a.archived_at is null and a.calendar_delivery_managed and a.attorney_delivery_enabled is null
    and private.calendar_schedule_consistent(a) and private.calendar_links_consistent(a)
    and not exists(select 1 from private.calendar_repair_entries r where r.appointment_id=a.appointment_id and r.suppressed_revision=a.calendar_revision)
    and not exists(select 1 from private.calendar_support_commands c where c.appointment_id=a.appointment_id and c.action='retry' and c.fingerprint->>'jobId'=j.id::text and c.created_at>clock_timestamp()-interval '2 minutes')
    and private.calendar_delivery_valid(j) and (select count(*) from private.calendar_support_commands c where c.appointment_id=a.appointment_id and c.action='retry' and c.fingerprint->>'jobId'=j.id::text)<2) as retry_allowed
  from public.calendar_delivery_jobs j where appointment_id=a.appointment_id order by created_at desc,id limit 201
 ) j;
 select coalesce(jsonb_agg(to_jsonb(h)),'[]') into history from (
  select 'change'::text as source,created_at,actor_id,revision,status,changed_fields,null::text as reason from private.calendar_change_history where appointment_id=a.appointment_id
  union all select 'support',created_at,actor_id,(fingerprint->>'revision')::integer,action,array[action],reason from private.calendar_support_commands where appointment_id=a.appointment_id
  order by created_at desc limit 101
 ) h;
 select coalesce(jsonb_agg(jsonb_build_object('id',participant_id,'name',name,'email',email,'role',participant_role,'required',is_required,'response',rsvp_status,'respondedAt',responded_at,'revokedAt',rsvp_revoked_at)),'[]')
  into participants from public.appointment_participants where appointment_id=a.appointment_id;
 return jsonb_build_object('verified',true,'organisationId',p_organisation_id,'appointmentId',a.appointment_id,'revision',a.calendar_revision,
  'status',a.status,'archivedAt',a.archived_at,'holdExpiresAt',a.hold_expires_at,'startAt',a.date_time,'endAt',a.end_date_time,
  'historyTruncated',jsonb_array_length(history)>100,'jobsTruncated',jsonb_array_length(jobs)>200,
  'history',case when jsonb_array_length(history)>100 then history-100 else history end,'jobs',case when jsonb_array_length(jobs)>200 then jobs-200 else jobs end,'participants',participants,
  'reconcileAllowed',a.archived_at is null and a.calendar_delivery_managed and a.attorney_delivery_enabled is null and private.calendar_schedule_consistent(a) and private.calendar_links_consistent(a)
   and private.calendar_status(a.status) not in ('draft','cancelled','completed','declined','no_show') and private.calendar_reserves(a,clock_timestamp())
   and not exists(select 1 from private.calendar_repair_entries r where r.appointment_id=a.appointment_id and r.suppressed_revision=a.calendar_revision));
end; $$;
revoke all on function public.read_calendar_appointment_support(uuid,uuid) from public,anon;
grant execute on function public.read_calendar_appointment_support(uuid,uuid) to authenticated;

create function public.calendar_support_action(p_organisation_id uuid,p_appointment_id uuid,p_expected_revision integer,p_action text,p_job_id uuid,p_command_id uuid,p_reason text) returns jsonb
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
 if a.calendar_delivery_managed is not true or a.attorney_delivery_enabled is not null or a.archived_at is not null
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
revoke all on function public.calendar_support_action(uuid,uuid,integer,text,uuid,uuid,text) from public,anon;
grant execute on function public.calendar_support_action(uuid,uuid,integer,text,uuid,uuid,text) to authenticated;
commit;
