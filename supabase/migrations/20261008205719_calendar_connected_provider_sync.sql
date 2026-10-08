begin;
-- Connections and credentials are never exposed as browser-readable tables.
create table private.calendar_provider_connections (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), user_id uuid not null references public.profiles(id),
 provider text not null check(provider in ('google','outlook')), status text not null default 'disconnected' check(status in ('connected','disconnected','needs_reconnect')),
 account_id text, account_label text, credential jsonb, generation integer not null default 0,
 worker_lease uuid, lease_expires_at timestamptz, last_checked_at timestamptz, connected_at timestamptz, last_error text,
 unique(organisation_id,user_id,provider)
);
create index calendar_provider_connection_due_idx on private.calendar_provider_connections(last_checked_at nulls first,id) where status='connected' and credential is not null;
create table private.calendar_provider_oauth_states (
 state_hash text primary key, connection_id uuid not null references private.calendar_provider_connections(id), generation integer not null,
 verifier text not null, return_url text not null, expires_at timestamptz not null default clock_timestamp()+interval '10 minutes', consumed_at timestamptz
);
create table private.calendar_provider_events (
 connection_id uuid not null references private.calendar_provider_connections(id), appointment_id uuid not null references public.appointments(appointment_id),
 copy_key uuid not null default gen_random_uuid(), enabled boolean not null default true, version integer not null default 1,
 desired_action text not null check(desired_action in ('upsert','delete','suppress')), desired_hash text, desired_payload jsonb, create_payload jsonb,
 external_id text, remote_hash text, synced_hash text, remote_etag text, external_url text,
 status text not null check(status in ('queued','processing','synced','removed','failed','needs_review','paused','suppressed')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default clock_timestamp(), job_lease uuid, job_connection_lease uuid,
 claimed_at timestamptz, last_synced_at timestamptz, last_error text, observed jsonb, observed_hash text, review_token uuid, force_hash text,
 primary key(connection_id,appointment_id)
);
create index calendar_provider_due_idx on private.calendar_provider_events(connection_id,next_attempt_at) where status in ('queued','failed','synced','processing');
create index calendar_provider_appointment_idx on private.calendar_provider_events(appointment_id);
create table private.calendar_provider_audit (
 id bigint generated always as identity primary key, connection_id uuid not null, appointment_id uuid not null, copy_key uuid not null,
 operation text not null, external_id text, created_at timestamptz not null default clock_timestamp()
);
alter table private.calendar_provider_connections enable row level security;
alter table private.calendar_provider_oauth_states enable row level security;
alter table private.calendar_provider_events enable row level security;
alter table private.calendar_provider_audit enable row level security;
revoke all on private.calendar_provider_connections,private.calendar_provider_oauth_states,private.calendar_provider_events,private.calendar_provider_audit from public,anon,authenticated,service_role;

create function private.calendar_provider_service() returns void language plpgsql set search_path='' as $$
begin if current_setting('role')<>'service_role' then raise exception 'Provider worker authorization required.' using errcode='42501'; end if; end; $$;
create function private.calendar_provider_member(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organisation_users m where m.organisation_id=p_org and m.user_id=p_user and lower(coalesce(m.membership_status,m.status,''))='active');
$$;
revoke all on function private.calendar_provider_service(),private.calendar_provider_member(uuid,uuid) from public,anon,authenticated,service_role;

create function private.calendar_provider_target(a public.appointments,c private.calendar_provider_connections,existing boolean) returns jsonb
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
   'status',closed,'busy',private.calendar_reserves(a,clock_timestamp()));
 return jsonb_build_object('action','upsert','payload',payload,'hash',md5(payload::text));
exception when invalid_parameter_value then return jsonb_build_object('action','suppress','error','schedule_needs_review');
end; $$;
revoke all on function private.calendar_provider_target(public.appointments,private.calendar_provider_connections,boolean) from public,anon,authenticated,service_role;

create function private.reconcile_calendar_provider_event(p_connection uuid,p_appointment uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.appointments; c private.calendar_provider_connections; e private.calendar_provider_events; target jsonb; had boolean;
begin
 select * into c from private.calendar_provider_connections where id=p_connection for update;
 if not found or c.status<>'connected' or not private.calendar_provider_member(c.organisation_id,c.user_id) then return; end if;
 select * into a from public.appointments where appointment_id=p_appointment;
 if not found then return; end if;
 select * into e from private.calendar_provider_events where connection_id=c.id and appointment_id=a.appointment_id for update; had:=found;
 if had and not e.enabled then return; end if;
 target:=private.calendar_provider_target(a,c,had);
 if not had then
   if target->>'action'='delete' then return; end if;
   insert into private.calendar_provider_events(connection_id,appointment_id,desired_action,desired_hash,desired_payload,status,last_error)
   values(c.id,a.appointment_id,target->>'action',target->>'hash',target->'payload',case when target->>'error' is not null then 'needs_review' when target->>'action'='suppress' then 'suppressed' else 'queued' end,target->>'error');
 elsif (e.desired_action,e.desired_hash) is distinct from (target->>'action',target->>'hash') then
   update private.calendar_provider_events set desired_action=target->>'action',desired_hash=target->>'hash',desired_payload=target->'payload',version=version+1,
     status=case when target->>'error' is not null then 'needs_review' when target->>'action'='suppress' then 'suppressed' when e.status='needs_review' and e.last_error='outside_change' then 'needs_review' else 'queued' end,
     last_error=case when e.status='needs_review' and e.last_error='outside_change' then e.last_error else target->>'error' end,
     attempts=0,next_attempt_at=clock_timestamp() where connection_id=c.id and appointment_id=a.appointment_id;
 end if;
end; $$;
revoke all on function private.reconcile_calendar_provider_event(uuid,uuid) from public,anon,authenticated,service_role;
create function private.reconcile_calendar_provider_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare c private.calendar_provider_connections; v_id uuid; v_org uuid;
begin
 v_id:=case when tg_op='DELETE' then old.appointment_id else new.appointment_id end;
 select organisation_id into v_org from public.appointments where appointment_id=v_id;
 for c in select * from private.calendar_provider_connections where status='connected' and (organisation_id=v_org or exists(select 1 from private.calendar_provider_events e where e.connection_id=calendar_provider_connections.id and e.appointment_id=v_id)) order by id loop
   perform private.reconcile_calendar_provider_event(c.id,v_id);
 end loop; return null;
end; $$;
revoke all on function private.reconcile_calendar_provider_trigger() from public,anon,authenticated,service_role;
create constraint trigger calendar_provider_appointment after insert or update on public.appointments deferrable initially deferred for each row execute function private.reconcile_calendar_provider_trigger();
create constraint trigger calendar_provider_participant after insert or update or delete on public.appointment_participants deferrable initially deferred for each row execute function private.reconcile_calendar_provider_trigger();

create function public.begin_calendar_provider_oauth(p_org uuid,p_user uuid,p_provider text,p_state_hash text,p_verifier text,p_return_url text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.calendar_provider_connections;
begin
 perform private.calendar_provider_service();
 if not private.calendar_provider_member(p_org,p_user) or p_provider not in ('google','outlook') or p_provider is null then raise exception 'Active workspace membership is required.' using errcode='42501'; end if;
 if p_state_hash !~ '^[a-f0-9]{64}$' or length(p_verifier) not between 43 and 128 or p_return_url !~ '^https://[^/]+/' then raise exception 'Invalid authorization request.' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 insert into private.calendar_provider_connections(organisation_id,user_id,provider) values(p_org,p_user,p_provider) on conflict(organisation_id,user_id,provider) do nothing;
 select * into c from private.calendar_provider_connections where organisation_id=p_org and user_id=p_user and provider=p_provider for update;
 delete from private.calendar_provider_oauth_states where connection_id=c.id and (consumed_at is not null or expires_at<=clock_timestamp());
 insert into private.calendar_provider_oauth_states(state_hash,connection_id,generation,verifier,return_url) values(p_state_hash,c.id,c.generation,p_verifier,p_return_url);
 return jsonb_build_object('connectionId',c.id);
end; $$;
revoke all on function public.begin_calendar_provider_oauth(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_calendar_provider_oauth(uuid,uuid,text,text,text,text) to service_role;
create function public.consume_calendar_provider_oauth(p_state_hash text,p_provider text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.calendar_provider_oauth_states; c private.calendar_provider_connections;
begin
 perform private.calendar_provider_service();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into s from private.calendar_provider_oauth_states where state_hash=p_state_hash for update;
 if not found or s.consumed_at is not null or s.expires_at<=clock_timestamp() then raise exception 'Authorization expired or was already used.' using errcode='22023'; end if;
 select * into c from private.calendar_provider_connections where id=s.connection_id for update;
 if c.provider is distinct from p_provider or c.generation<>s.generation or not private.calendar_provider_member(c.organisation_id,c.user_id) then raise exception 'Authorization is no longer valid.' using errcode='42501'; end if;
 update private.calendar_provider_oauth_states set consumed_at=clock_timestamp() where state_hash=s.state_hash;
 return jsonb_build_object('connectionId',c.id,'generation',c.generation,'verifier',s.verifier,'returnUrl',s.return_url,'accountId',c.account_id);
end; $$;
revoke all on function public.consume_calendar_provider_oauth(text,text) from public,anon,authenticated;
grant execute on function public.consume_calendar_provider_oauth(text,text) to service_role;
create function public.finish_calendar_provider_oauth(p_state_hash text,p_account_id text,p_account_label text,p_credential jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.calendar_provider_oauth_states; c private.calendar_provider_connections; a public.appointments;
begin
 perform private.calendar_provider_service();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into s from private.calendar_provider_oauth_states where state_hash=p_state_hash for update;
 if not found or s.consumed_at is null or s.expires_at<=clock_timestamp() then raise exception 'Authorization is no longer valid.' using errcode='22023'; end if;
 select * into c from private.calendar_provider_connections where id=s.connection_id for update;
 if c.generation<>s.generation or not private.calendar_provider_member(c.organisation_id,c.user_id) then raise exception 'Authorization is no longer valid.' using errcode='42501'; end if;
 if nullif(p_account_id,'') is null or (c.account_id is not null and c.account_id<>p_account_id) then raise exception 'Reconnect the same account to preserve its existing copies.' using errcode='22023'; end if;
 if jsonb_typeof(p_credential) is distinct from 'object' or p_credential->>'v' is distinct from '1' or nullif(p_credential->>'ciphertext','') is null or nullif(p_credential->>'iv','') is null then raise exception 'Encrypted credentials are required.' using errcode='22023'; end if;
 update private.calendar_provider_connections set status='connected',account_id=p_account_id,account_label=left(p_account_label,254),credential=p_credential,
   generation=generation+1,worker_lease=null,lease_expires_at=null,connected_at=clock_timestamp(),last_error=null where id=c.id;
 delete from private.calendar_provider_oauth_states where connection_id=c.id;
 update private.calendar_provider_events set status='queued',attempts=0,next_attempt_at=clock_timestamp() where connection_id=c.id and enabled and status in ('failed','processing','paused');
 for a in select * from public.appointments where (organisation_id=c.organisation_id and date_time>clock_timestamp()-interval '1 day')
   or exists(select 1 from private.calendar_provider_events e where e.connection_id=c.id and e.appointment_id=appointments.appointment_id) order by appointment_id loop
   perform private.reconcile_calendar_provider_event(c.id,a.appointment_id);
 end loop;
 return jsonb_build_object('verified',true,'connectionId',c.id,'status','connected');
end; $$;
revoke all on function public.finish_calendar_provider_oauth(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_calendar_provider_oauth(text,text,text,jsonb) to service_role;

create function public.read_calendar_provider_status(p_organisation_id uuid,p_appointment_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.calendar_provider_member(p_organisation_id,auth.uid()) then raise exception 'Active workspace membership is required.' using errcode='42501'; end if;
 return jsonb_build_object('verified',true,'connections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'provider',c.provider,'status',c.status,'accountLabel',c.account_label,'connectedAt',c.connected_at,'lastCheckedAt',c.last_checked_at,'lastError',c.last_error) order by c.provider)
   from private.calendar_provider_connections c where c.organisation_id=p_organisation_id and c.user_id=auth.uid()),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(jsonb_build_object('provider',c.provider,'appointmentId',e.appointment_id,'status',e.status,'version',e.version,'lastSyncedAt',e.last_synced_at,'lastError',e.last_error,'observed',e.observed,'reviewToken',e.review_token,'enabled',e.enabled) order by c.provider)
   from private.calendar_provider_events e join private.calendar_provider_connections c on c.id=e.connection_id
   where c.organisation_id=p_organisation_id and c.user_id=auth.uid() and e.appointment_id=p_appointment_id),'[]'::jsonb));
end; $$;
revoke all on function public.read_calendar_provider_status(uuid,uuid) from public,anon;
grant execute on function public.read_calendar_provider_status(uuid,uuid) to authenticated;
create function public.disconnect_calendar_provider(p_connection_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 update private.calendar_provider_connections set status='disconnected',credential=null,generation=generation+1,worker_lease=null,lease_expires_at=null,last_error=null where id=p_connection_id and user_id=auth.uid();
 if not found then raise exception 'This connection is not yours.' using errcode='42501'; end if;
 delete from private.calendar_provider_oauth_states where connection_id=p_connection_id;
 update private.calendar_provider_events set status='paused',job_lease=null where connection_id=p_connection_id;
 return jsonb_build_object('verified',true,'status','disconnected');
end; $$;
revoke all on function public.disconnect_calendar_provider(uuid) from public,anon;
grant execute on function public.disconnect_calendar_provider(uuid) to authenticated;

create function public.calendar_provider_event_action(p_org uuid,p_appointment uuid,p_provider text,p_action text,p_review_token uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.calendar_provider_connections; e private.calendar_provider_events;
begin
 if auth.uid() is null or not private.calendar_provider_member(p_org,auth.uid()) then raise exception 'Active workspace membership is required.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into c from private.calendar_provider_connections where organisation_id=p_org and user_id=auth.uid() and provider=p_provider for update;
 if not found or c.status<>'connected' then raise exception 'Connect your calendar first.' using errcode='22023'; end if;
 if p_action not in ('sync','restore','pause','remove') or p_action is null then raise exception 'Unsupported calendar action.' using errcode='22023'; end if;
 perform private.reconcile_calendar_provider_event(c.id,p_appointment);
 select * into e from private.calendar_provider_events where connection_id=c.id and appointment_id=p_appointment for update;
 if not found then raise exception 'No eligible personal copy for this appointment.' using errcode='42501'; end if;
 if p_action in ('restore','remove') and e.status='needs_review' and (p_review_token is null or p_review_token is distinct from e.review_token) then raise exception 'The outside change was updated. Refresh its review.' using errcode='40001'; end if;
 if p_action='sync' and e.status='needs_review' then raise exception 'Review the outside change before retrying.' using errcode='22023'; end if;
 if p_action='pause' then
   update private.calendar_provider_events set enabled=false,status='paused',version=version+1 where connection_id=c.id and appointment_id=p_appointment;
 else
   if e.desired_action='suppress' then raise exception 'Review the appointment schedule or historical repair before syncing.' using errcode='22023'; end if;
   update private.calendar_provider_events set enabled=p_action<>'remove',desired_action=case when p_action='remove' then 'delete' else desired_action end,
     status='queued',version=version+1,attempts=0,next_attempt_at=clock_timestamp(),last_error=null,
     force_hash=case when e.status='needs_review' and p_action in ('restore','remove') then e.observed_hash else null end,
     copy_key=case when e.status='removed' or (p_action='restore' and e.observed->>'deleted'='true') then gen_random_uuid() else copy_key end,
     external_id=case when e.status='removed' or (p_action='restore' and e.observed->>'deleted'='true') then null else external_id end,
     create_payload=case when e.status='removed' or (p_action='restore' and e.observed->>'deleted'='true') then null else create_payload end,
     remote_hash=case when e.status='removed' or (p_action='restore' and e.observed->>'deleted'='true') then null else remote_hash end
     where connection_id=c.id and appointment_id=p_appointment;
 end if;
 if p_action in ('sync','restore') then perform private.reconcile_calendar_provider_event(c.id,p_appointment); end if;
 return public.read_calendar_provider_status(p_org,p_appointment)||jsonb_build_object('queued',p_action<>'pause');
end; $$;
revoke all on function public.calendar_provider_event_action(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.calendar_provider_event_action(uuid,uuid,text,text,uuid) to authenticated;
create function public.claim_calendar_provider_connections(p_limit integer default 2) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.calendar_provider_connections; a public.appointments; lease uuid; results jsonb:='[]';
begin
 perform private.calendar_provider_service();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 for c in select * from private.calendar_provider_connections where status='connected' and credential is not null
   and (lease_expires_at is null or lease_expires_at<=clock_timestamp())
   order by last_checked_at nulls first,id limit greatest(0,least(coalesce(p_limit,2),5)) for update skip locked loop
   if not private.calendar_provider_member(c.organisation_id,c.user_id) then
     update private.calendar_provider_connections set status='needs_reconnect',credential=null,generation=generation+1,last_error='membership_inactive' where id=c.id;
     update private.calendar_provider_events set status='paused' where connection_id=c.id; continue;
   end if;
   -- Re-evaluate logical hold expiry even if no appointment row changed.
   for a in select * from public.appointments where (organisation_id=c.organisation_id and date_time>clock_timestamp()-interval '1 day')
     or exists(select 1 from private.calendar_provider_events e where e.connection_id=c.id and e.appointment_id=appointments.appointment_id) order by appointment_id loop
     perform private.reconcile_calendar_provider_event(c.id,a.appointment_id);
   end loop;
   update private.calendar_provider_events set status='queued',job_lease=null where connection_id=c.id and status='processing';
   lease:=gen_random_uuid();
   update private.calendar_provider_connections set worker_lease=lease,lease_expires_at=clock_timestamp()+interval '5 minutes',last_checked_at=clock_timestamp() where id=c.id;
   results:=results||jsonb_build_array(jsonb_build_object('id',c.id,'provider',c.provider,'generation',c.generation,'lease',lease,'credential',c.credential));
 end loop;
 return results;
end; $$;
revoke all on function public.claim_calendar_provider_connections(integer) from public,anon,authenticated;
grant execute on function public.claim_calendar_provider_connections(integer) to service_role;

create function public.prepare_calendar_provider_event(p_connection uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.calendar_provider_connections; e private.calendar_provider_events; nonce uuid;
begin
 perform private.calendar_provider_service();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into c from private.calendar_provider_connections where id=p_connection for update;
 if not found or c.status<>'connected' or c.worker_lease is distinct from p_lease or c.lease_expires_at<=clock_timestamp()
   or not private.calendar_provider_member(c.organisation_id,c.user_id) then return null; end if;
 select * into e from private.calendar_provider_events where connection_id=c.id
   and (status in ('queued','failed') and attempts<5 or status='synced') and next_attempt_at<=clock_timestamp()
   order by next_attempt_at,appointment_id limit 1 for update skip locked;
 if not found then return null; end if;
 perform private.reconcile_calendar_provider_event(c.id,e.appointment_id);
 select * into e from private.calendar_provider_events where connection_id=c.id and appointment_id=e.appointment_id;
 if e.status in ('paused','suppressed','needs_review','removed') then return null; end if;
 nonce:=gen_random_uuid();
 update private.calendar_provider_events set status='processing',job_lease=nonce,job_connection_lease=p_lease,claimed_at=clock_timestamp(),attempts=attempts+1,
   create_payload=case when external_id is null and desired_action='upsert' then coalesce(create_payload,jsonb_build_object('payload',desired_payload,'hash',desired_hash)) else create_payload end
   where connection_id=c.id and appointment_id=e.appointment_id returning * into e;
 return to_jsonb(e);
end; $$;
revoke all on function public.prepare_calendar_provider_event(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_calendar_provider_event(uuid,uuid) to service_role;
create function public.validate_calendar_provider_event(p_connection uuid,p_lease uuid,p_appointment uuid,p_job uuid,p_version integer) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.calendar_provider_service();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 perform private.reconcile_calendar_provider_event(p_connection,p_appointment);
 return exists(select 1 from private.calendar_provider_connections c join private.calendar_provider_events e on e.connection_id=c.id
   where c.id=p_connection and c.status='connected' and c.worker_lease=p_lease and c.lease_expires_at>clock_timestamp()
   and private.calendar_provider_member(c.organisation_id,c.user_id) and e.appointment_id=p_appointment and e.job_lease=p_job
   and e.version=p_version and e.status='processing');
end; $$;
revoke all on function public.validate_calendar_provider_event(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.validate_calendar_provider_event(uuid,uuid,uuid,uuid,integer) to service_role;
create function public.refresh_calendar_provider_credential(p_connection uuid,p_lease uuid,p_previous jsonb,p_credential jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.calendar_provider_service();
 update private.calendar_provider_connections set credential=p_credential where id=p_connection and worker_lease=p_lease and lease_expires_at>clock_timestamp()
   and status='connected' and credential=p_previous and private.calendar_provider_member(organisation_id,user_id);
 return found;
end; $$;
revoke all on function public.refresh_calendar_provider_credential(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.refresh_calendar_provider_credential(uuid,uuid,jsonb,jsonb) to service_role;

create function public.finish_calendar_provider_event(p_connection uuid,p_lease uuid,p_appointment uuid,p_job uuid,p_copy_key uuid,p_version integer,p_result jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare c private.calendar_provider_connections; e private.calendar_provider_events; outcome text; fresh boolean;
begin
 perform private.calendar_provider_service();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into c from private.calendar_provider_connections where id=p_connection for update;
 if c.status='connected' then perform private.reconcile_calendar_provider_event(p_connection,p_appointment); end if;
 select * into e from private.calendar_provider_events where connection_id=p_connection and appointment_id=p_appointment for update;
 if not found then return false; end if;
 outcome:=p_result->>'status';
 if outcome not in ('synced','removed','needs_review','failed','needs_reconnect','superseded') or outcome is null then raise exception 'Unsupported provider receipt.' using errcode='22023'; end if;
 if outcome='synced' and (nullif(p_result->>'externalId','') is null or nullif(p_result->>'remoteHash','') is null or nullif(p_result->>'etag','') is null or nullif(p_result->>'writtenHash','') is null) then raise exception 'A verified provider event receipt is required.' using errcode='22023'; end if;
 -- An unchanged verified poll updates last_synced_at but does not grow the
 -- append-only audit. Actual writes, outside changes and late receipts remain.
 if outcome<>'synced' or (e.copy_key,e.external_id,e.synced_hash,e.remote_hash,e.version,c.worker_lease,e.job_lease,c.status)
   is distinct from (p_copy_key,p_result->>'externalId',p_result->>'writtenHash',p_result->>'remoteHash',p_version,p_lease,p_job,'connected') then
   insert into private.calendar_provider_audit(connection_id,appointment_id,copy_key,operation,external_id) values(p_connection,p_appointment,p_copy_key,outcome,p_result->>'externalId');
 end if;
 -- Late creation receipts remain recoverable; they cannot mark a newer target
 -- synced or resurrect a disconnected connection. No provider ID is discarded.
 if e.copy_key=p_copy_key and nullif(p_result->>'externalId','') is not null and e.external_id is null then
   update private.calendar_provider_events set external_id=p_result->>'externalId',remote_hash=case when outcome='synced' then p_result->>'remoteHash' else remote_hash end,remote_etag=case when outcome='synced' then p_result->>'etag' else remote_etag end
     where connection_id=p_connection and appointment_id=p_appointment;
 end if;
 fresh:=c.status='connected' and c.worker_lease=p_lease and c.lease_expires_at>clock_timestamp() and e.job_connection_lease=p_lease and e.job_lease=p_job
   and e.copy_key=p_copy_key and e.version=p_version and private.calendar_provider_member(c.organisation_id,c.user_id);
 if outcome='needs_reconnect' and c.status='connected' and c.worker_lease=p_lease and c.lease_expires_at>clock_timestamp() and e.job_connection_lease=p_lease and e.job_lease=p_job then
   update private.calendar_provider_connections set status='needs_reconnect',last_error='authorization_expired' where id=c.id;
 end if;
 if not fresh then
   if e.copy_key=p_copy_key and e.job_lease=p_job and c.status='connected' and e.status<>'paused' then
     update private.calendar_provider_events set status=case when outcome='needs_review' then 'needs_review' when outcome='removed' and desired_action='delete' then 'removed' else 'queued' end,next_attempt_at=clock_timestamp(),
       observed=case when outcome='needs_review' then p_result->'observed' else observed end,
       observed_hash=case when outcome='needs_review' then p_result->>'remoteHash' else observed_hash end,
       review_token=case when outcome='needs_review' then gen_random_uuid() else review_token end,
       last_error=case when outcome='needs_review' then 'outside_change' else last_error end,
       external_id=case when outcome='removed' then null else external_id end,
       copy_key=case when outcome='removed' then gen_random_uuid() else copy_key end,
       create_payload=case when outcome='removed' then null else create_payload end,
       remote_hash=case when outcome='removed' then null when outcome='synced' then coalesce(p_result->>'remoteHash',remote_hash) else remote_hash end,
       remote_etag=case when outcome='removed' then null when outcome='synced' then coalesce(p_result->>'etag',remote_etag) else remote_etag end
       where connection_id=p_connection and appointment_id=p_appointment;
   end if; return false;
 end if;
 if outcome='needs_reconnect' then
   update private.calendar_provider_connections set status='needs_reconnect',last_error='authorization_expired' where id=c.id;
 end if;
 update private.calendar_provider_events set
   status=case when outcome='synced' and p_result->>'writtenHash' is distinct from desired_hash then 'queued' when outcome in ('needs_reconnect','superseded') then 'failed' else outcome end,
   external_id=case when outcome='removed' then null else coalesce(nullif(p_result->>'externalId',''),external_id) end,
   copy_key=case when outcome='removed' then gen_random_uuid() else copy_key end,
   create_payload=case when outcome='removed' then null else create_payload end,
   synced_hash=case when outcome='synced' then p_result->>'writtenHash' else synced_hash end,
   remote_hash=case when outcome='removed' then null when outcome='synced' then coalesce(p_result->>'remoteHash',remote_hash) else remote_hash end,
   remote_etag=case when outcome='removed' then null when outcome='synced' then coalesce(p_result->>'etag',remote_etag) else remote_etag end,
   job_lease=null,claimed_at=null,force_hash=null,
   observed=case when outcome='needs_review' then p_result->'observed' else null end,
   observed_hash=case when outcome='needs_review' then p_result->>'remoteHash' else null end,
   review_token=case when outcome='needs_review' then gen_random_uuid() else null end,
   last_error=case when outcome='needs_review' then 'outside_change' when outcome='failed' then 'provider_unavailable' when outcome='needs_reconnect' then 'authorization_expired' else null end,
   attempts=case when outcome in ('synced','removed') then 0 else attempts end,
   next_attempt_at=case when outcome='synced' and p_result->>'writtenHash' is distinct from desired_hash then clock_timestamp() when outcome='synced' then clock_timestamp()+interval '5 minutes'
     else clock_timestamp()+least(3600,greatest(coalesce((p_result->>'retryAfter')::integer,0),30*(2^least(attempts,6))::integer))*interval '1 second' end,
   last_synced_at=case when outcome in ('synced','removed') then clock_timestamp() else last_synced_at end
   where connection_id=c.id and appointment_id=e.appointment_id;
 return true;
end; $$;
revoke all on function public.finish_calendar_provider_event(uuid,uuid,uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.finish_calendar_provider_event(uuid,uuid,uuid,uuid,uuid,integer,jsonb) to service_role;
create function public.release_calendar_provider_connection(p_connection uuid,p_lease uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.calendar_provider_service();
 update private.calendar_provider_connections set worker_lease=null,lease_expires_at=null where id=p_connection and worker_lease=p_lease;
end; $$;
revoke all on function public.release_calendar_provider_connection(uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_calendar_provider_connection(uuid,uuid) to service_role;
commit;
