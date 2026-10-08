begin;

-- Administrative repair is opt-in. Merely applying this migration repairs no data.
create table private.calendar_repair_batches (
 batch_id uuid primary key, organisation_id uuid not null references public.organisations(id),
 reviewed_by uuid not null references public.profiles(id), reason text not null,
 fingerprint jsonb not null, receipt jsonb, created_at timestamptz not null default clock_timestamp()
);
create table private.calendar_repair_entries (
 batch_id uuid not null references private.calendar_repair_batches(batch_id),
 appointment_id uuid not null references public.appointments(appointment_id),
 action text not null, evidence text not null, before_state jsonb not null,
 after_fingerprint text, suppressed_revision integer not null,
 transaction_id bigint not null default txid_current(),
 primary key(batch_id,appointment_id)
);
create index calendar_repair_revision_idx on private.calendar_repair_entries(appointment_id,suppressed_revision);
alter table private.calendar_repair_batches enable row level security;
alter table private.calendar_repair_entries enable row level security;
revoke all on private.calendar_repair_batches,private.calendar_repair_entries from public,anon,authenticated,service_role;

create function private.calendar_repair_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('appointment',to_jsonb(a),
 'participants',coalesce((select jsonb_agg(to_jsonb(p) order by p.participant_id) from public.appointment_participants p where p.appointment_id=a.appointment_id),'[]'::jsonb),
 'proposals',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.appointment_reschedule_requests r where r.appointment_id=a.appointment_id),'[]'::jsonb),
 'reminders',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.appointment_reminders r where r.appointment_id=a.appointment_id),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(to_jsonb(j) order by j.id) from public.calendar_delivery_jobs j where j.appointment_id=a.appointment_id),'[]'::jsonb))
 from public.appointments a where a.appointment_id=p_id;
$$;
revoke all on function private.calendar_repair_snapshot(uuid) from public,anon,authenticated,service_role;

create function private.calendar_repair_service() returns void
language plpgsql set search_path='' as $$
begin
 if current_setting('role')<>'service_role' then raise exception 'A server-side repair operator is required.' using errcode='42501'; end if;
end; $$;
revoke all on function private.calendar_repair_service() from public,anon,authenticated,service_role;

create function private.calendar_repair_reviewer(p_org uuid,p_user uuid) returns void
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.organisation_users m where m.organisation_id=p_org and m.user_id=p_user
   and lower(coalesce(m.membership_status,m.status,''))='active'
   and lower(coalesce(m.workspace_role,m.organization_role,m.organisation_role,m.role,'')) in
   ('principal','owner','admin','organisation_admin','organization_admin','super_admin','head_office','branch_manager')) then
   raise exception 'Record an active organisation manager as the reviewer.' using errcode='42501'; end if;
end; $$;
revoke all on function private.calendar_repair_reviewer(uuid,uuid) from public,anon,authenticated,service_role;

create function private.calendar_repair_conflict(a public.appointments) returns boolean
language plpgsql security definer set search_path='' as $$
begin perform private.assert_calendar_slot(a); return false;
exception when exclusion_violation then return true; when invalid_parameter_value then return null;
end; $$;
revoke all on function private.calendar_repair_conflict(public.appointments) from public,anon,authenticated,service_role;

-- Each record's fingerprint covers the complete authoritative snapshot, including
-- attendance, capability changes, proposals and worker progress. It is a stale
-- data fence, not an authentication token. Personal data stays in the private audit.
create function public.export_calendar_repair_snapshot(p_organisation_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare records jsonb:='[]'; a public.appointments; snap jsonb; entry jsonb; total integer;
begin
 perform private.calendar_repair_service();
 if p_organisation_id is null or not exists(select 1 from public.organisations where id=p_organisation_id) then raise exception 'Select an existing organisation.' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select count(*) into total from public.appointments where organisation_id=p_organisation_id;
 if total>10000 then raise exception 'This organisation exceeds the repair export limit; use a separately reviewed scoped export.' using errcode='54000'; end if;
 for a in select * from public.appointments where organisation_id=p_organisation_id order by appointment_id loop
   perform 1 from public.calendar_delivery_jobs j where j.appointment_id=a.appointment_id order by j.id for share;
   perform 1 from public.appointment_reminders r where r.appointment_id=a.appointment_id order by r.id for share;
   snap:=private.calendar_repair_snapshot(a.appointment_id);
   entry:=jsonb_build_object('appointment',jsonb_build_object(
     'appointment_id',a.appointment_id,'organisation_id',a.organisation_id,'agent_id',a.agent_id,'scheduling_owner_user_id',a.scheduling_owner_user_id,
     'status',a.status,'appointment_type',a.appointment_type,'appointment_date',a.appointment_date,'start_time',a.start_time,'end_time',a.end_time,
     'date_time',a.date_time,'end_date_time',a.end_date_time,'timezone',a.timezone,'all_day',a.all_day,
     'external_calendar_status',a.external_calendar_status,'created_by',a.created_by,'calendar_revision',a.calendar_revision,'created_at',a.created_at,'updated_at',a.updated_at,
     'reservation_managed',a.reservation_managed,'request_issued_at',a.request_issued_at,'hold_expires_at',a.hold_expires_at,'has_confirmed_reservation',a.has_confirmed_reservation,
     'archived_at',a.archived_at,'resource_id',a.resource_id,'attorney_delivery_enabled',a.attorney_delivery_enabled,'listing_viewing_round_number',a.listing_viewing_round_number,
     'calendar_delivery_managed',a.calendar_delivery_managed,'invitations_enabled',a.invitations_enabled,'reminders_enabled',a.reminders_enabled,
     'is_demo_data',coalesce((to_jsonb(a)->>'is_demo_data')::boolean,false)),
     'fingerprint',md5(snap::text),'reservationConflict',private.calendar_repair_conflict(a),
     'linkIntegrity',jsonb_build_object(
       'agent',a.agent_id is null or exists(select 1 from public.organisation_users m where m.organisation_id=a.organisation_id and m.user_id=a.agent_id and lower(coalesce(m.membership_status,m.status,''))='active'),
       'lead',a.lead_id is null or exists(select 1 from public.leads l where l.lead_id=a.lead_id and l.organisation_id=a.organisation_id),
       'contact',a.contact_id is null or exists(select 1 from public.contacts c where c.contact_id=a.contact_id and c.organisation_id=a.organisation_id),
       'transaction',a.transaction_id is null or exists(select 1 from public.transactions t where t.id=a.transaction_id and t.organisation_id=a.organisation_id)),
     'participants',coalesce((select jsonb_agg(jsonb_build_object('participant_id',p.participant_id,'user_id',p.user_id,'organisation_id',p.organisation_id,
       'emailKey',case when nullif(btrim(p.email),'') is not null then md5(a.organisation_id::text||lower(btrim(p.email))) end,
       'hasEmail',nullif(btrim(p.email),'') is not null,'participant_role',p.participant_role,'is_required',p.is_required,'rsvp_status',p.rsvp_status,
       'rsvp_revoked_at',p.rsvp_revoked_at,'rsvp_expires_at',p.rsvp_expires_at,
       'matchingProfileIds',coalesce((select jsonb_agg(distinct pr.id) from public.profiles pr join public.organisation_users m on m.user_id=pr.id
         where m.organisation_id=a.organisation_id and lower(coalesce(m.membership_status,m.status,''))='active' and nullif(lower(btrim(pr.email)),'')=nullif(lower(btrim(p.email)),'')),'[]'::jsonb)) order by p.participant_id)
       from public.appointment_participants p where p.appointment_id=a.appointment_id),'[]'::jsonb),
     'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'participant_id',j.participant_id,'revision',j.revision,'status',j.status,
       'event_kind',j.event_kind,'channel',j.channel,'scheduled_for',j.scheduled_for,'expires_at',j.expires_at,'valid',private.calendar_delivery_valid(j)) order by j.id)
       from public.calendar_delivery_jobs j where j.appointment_id=a.appointment_id),'[]'::jsonb),
     'reminders',coalesce((select jsonb_agg(jsonb_build_object('id',r->>'id','status',r->>'status','recipient_id',r->>'recipient_id','hasRecipientEmail',nullif(r->>'recipient_email','') is not null)) from jsonb_array_elements(snap->'reminders') r),'[]'::jsonb),
     'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',r->>'id','status',r->>'status','hold_expires_at',r->>'hold_expires_at','preferred_start',r->>'preferred_start','preferred_end',r->>'preferred_end')) from jsonb_array_elements(snap->'proposals') r),'[]'::jsonb));
   records:=records||jsonb_build_array(entry);
 end loop;
 return jsonb_build_object('version',1,'organisationId',p_organisation_id,'capturedAt',clock_timestamp(),'complete',true,'total',total,'records',records);
end; $$;
revoke all on function public.export_calendar_repair_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.export_calendar_repair_snapshot(uuid) to service_role;

-- Suppression belongs to this repair revision. A subsequent intentional normal
-- save/issue has a new revision and follows the regular delivery preferences.
create or replace function private.calendar_delivery_valid(j public.calendar_delivery_jobs) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.appointments a join public.appointment_participants p on p.appointment_id=a.appointment_id
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
revoke all on function private.calendar_delivery_valid(public.calendar_delivery_jobs) from public,anon,authenticated;

create or replace function private.reconcile_calendar_delivery(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.appointments; kind text; start_at timestamptz;
begin
 select * into a from public.appointments where appointment_id=p_id;
 if not found or not a.calendar_delivery_managed then return; end if;
 update public.appointment_reminders set status='cancelled',updated_at=clock_timestamp() where appointment_id=p_id and status='pending';
 update public.calendar_delivery_jobs j set status='superseded',claimed_at=null,updated_at=clock_timestamp()
   where j.appointment_id=p_id and j.status in ('queued','processing','failed') and not private.calendar_delivery_valid(j);
 if a.archived_at is not null or a.attorney_delivery_enabled is not null or exists(select 1 from private.calendar_repair_entries repair where repair.appointment_id=a.appointment_id and repair.suppressed_revision=a.calendar_revision) then return; end if;
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
   and (p.rsvp_revoked_at is null or (kind in ('cancelled','completed','declined','no_show') and p.rsvp_revoked_at=a.updated_at))
   and (kind in ('cancelled','completed','declined','no_show') or (lower(p.rsvp_status)<>'declined' and private.calendar_end(a)>clock_timestamp()
     and (a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' or a.hold_expires_at>clock_timestamp())))
   and (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
   and ((c.channel='email' and private.calendar_email_allowed(a.organisation_id,lower(btrim(p.email))) and p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (c.channel='in_app' and p.user_id is not null))
 on conflict(appointment_id,revision,participant_id,event_kind,channel) do nothing;
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


-- Both stored instants and the local clock must put the complete old booking
-- in the past. An unknown end uses the end of that day only as a safety bound.
create function private.calendar_repair_past(a public.appointments) returns boolean
language plpgsql stable set search_path='' as $$
begin
 return coalesce(a.date_time<clock_timestamp()
   and coalesce(a.end_date_time,a.date_time+interval '1 day')<=clock_timestamp()
   and (case when a.all_day or a.end_time is null then (a.appointment_date+1)::timestamp
     else a.appointment_date+a.end_time end at time zone a.timezone)<=clock_timestamp(),false);
exception when invalid_parameter_value then return false;
end; $$;
revoke all on function private.calendar_repair_past(public.appointments) from public,anon,authenticated,service_role;

create or replace function private.protect_confirmed_calendar_time() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if private.calendar_repair_past(old) and private.calendar_repair_past(new)
    and exists(select 1 from private.calendar_repair_entries r where r.appointment_id=old.appointment_id
      and r.transaction_id=txid_current() and r.suppressed_revision=new.calendar_revision and r.action in ('correct_past_schedule','rollback')) then return new; end if;
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

create or replace function private.check_final_calendar_reservation() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.appointments; v_id uuid;
begin
  v_id:=case when tg_op='DELETE' then old.appointment_id else new.appointment_id end;
  select * into a from public.appointments where appointment_id=v_id;
  if found then
    -- Recovery can restore a contradictory historical display only when both
    -- interpretations are provably past, with an audit entry in this transaction.
    if private.calendar_repair_past(a) and exists(select 1 from private.calendar_repair_entries r
      where r.appointment_id=a.appointment_id and r.suppressed_revision=a.calendar_revision
      and r.transaction_id=txid_current() and r.action='rollback') then return null; end if;
    perform private.assert_calendar_slot(a);
  end if;
  return null;
end;
$$;
revoke all on function private.check_final_calendar_reservation() from public, anon, authenticated;

-- Internal executor is shared by preview/apply and guarded rollback. There is
-- no browser bypass and no caller-controlled trigger-disable setting.
create function private.execute_calendar_repair(
 p_org uuid,p_batch uuid,p_reviewer uuid,p_reason text,p_entries jsonb,p_preview boolean
) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
 e jsonb; a public.appointments; candidate public.appointments; prior public.appointments;
 snap jsonb; history jsonb; payload jsonb; v_receipt jsonb; results jsonb:='[]'; detail text;
 action text; v_status text; person public.appointment_participants;
 matches integer; previous_batch uuid; previous_action text; after_hash text;
begin
 perform private.calendar_repair_service(); perform private.calendar_repair_reviewer(p_org,p_reviewer);
 if p_org is null or p_batch is null or p_preview is null or nullif(btrim(p_reason),'') is null or length(p_reason)>1000
   or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 100 then
   raise exception 'Supply a reviewed batch of 1 to 100 appointments and a short reason.' using errcode='22023'; end if;
 if (select count(distinct v->>'appointmentId') from jsonb_array_elements(p_entries) v)<>jsonb_array_length(p_entries) then
   raise exception 'Each appointment must occur once in the batch.' using errcode='22023'; end if;
 payload:=jsonb_build_object('organisation',p_org,'reviewer',p_reviewer,'reason',p_reason,'entries',p_entries);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select b.receipt into v_receipt from private.calendar_repair_batches b where b.batch_id=p_batch and b.fingerprint=payload;
 if found then
   return v_receipt||jsonb_build_object('replayed',true,'current',not exists(
     select 1 from private.calendar_repair_entries r where r.batch_id=p_batch and r.after_fingerprint is distinct from md5(private.calendar_repair_snapshot(r.appointment_id)::text)));
 end if;
 if exists(select 1 from private.calendar_repair_batches b where b.batch_id=p_batch) then
   raise exception 'This batch identifier was used for a different plan.' using errcode='22023'; end if;
 -- This subtransaction validates actual trigger/constraint effects, then rolls
 -- them ALL back for preview. Preview is not a weaker simulation of a write.
 begin
  insert into private.calendar_repair_batches(batch_id,organisation_id,reviewed_by,reason,fingerprint)
    values(p_batch,p_org,p_reviewer,btrim(p_reason),payload);
  for e in select v from jsonb_array_elements(p_entries) v order by v->>'appointmentId' loop
   if nullif(btrim(e->>'evidence'),'') is null or length(e->>'evidence')>1000
     or nullif(btrim(e->>'reason'),'') is null or length(e->>'reason')>1000
     or exists(select 1 from jsonb_object_keys(e) k where k not in ('appointmentId','expectedFingerprint','action','reason','evidence','schedule','participantId','userId','originalBatch')) then
     raise exception 'Each repair needs evidence, a reason and only supported fields.' using errcode='22023'; end if;
   select * into a from public.appointments where appointment_id=(e->>'appointmentId')::uuid for update;
   if not found or a.organisation_id<>p_org then raise exception 'Appointment is outside this organisation.' using errcode='42501'; end if;
   -- Serialize worker transitions before checking the snapshot fence.
   perform 1 from public.calendar_delivery_jobs j where j.appointment_id=a.appointment_id order by j.id for update;
   perform 1 from public.appointment_participants p where p.appointment_id=a.appointment_id order by p.participant_id for update;
   perform 1 from public.appointment_reminders r where r.appointment_id=a.appointment_id order by r.id for update;
   perform 1 from public.appointment_reschedule_requests r where r.appointment_id=a.appointment_id order by r.id for update;
   snap:=private.calendar_repair_snapshot(a.appointment_id);
   if e->>'expectedFingerprint' is distinct from md5(snap::text) then
     raise exception 'Appointment or delivery changed. Export and review a fresh snapshot.' using errcode='40001'; end if;
   if a.archived_at is not null or a.attorney_delivery_enabled is not null or a.listing_viewing_round_number is not null
     or private.calendar_is_specialist(a) or coalesce((to_jsonb(a)->>'is_demo_data')::boolean,false) then
     raise exception 'Use the dedicated workflow for archived, specialist or demo appointments.' using errcode='22023'; end if;
   action:=e->>'action'; candidate:=a; v_status:=private.calendar_status(a.status);
   if action not in ('normalise_metadata','correct_past_schedule','link_internal_participant','suppress_historical_delivery','rollback') or action is null then
     raise exception 'Unsupported repair action.' using errcode='22023'; end if;
   if action<>'rollback' and e ? 'originalBatch' then raise exception 'Recovery references are reserved for rollback.' using errcode='22023'; end if;
   if action<>'correct_past_schedule' and e ? 'schedule' or action<>'link_internal_participant' and (e ? 'participantId' or e ? 'userId') then
     raise exception 'Fields do not match the reviewed repair action.' using errcode='22023'; end if;
   if action in ('normalise_metadata','correct_past_schedule') then
     if v_status not in ('draft','requested','accepted','confirmed','alternative_requested','alternative_proposed','cancelled','declined','completed','no_show') then
       raise exception 'Unknown appointment status requires an agent decision.' using errcode='22023'; end if;
     candidate.status:=v_status;
   end if;
   if action='correct_past_schedule' then
     if not private.calendar_repair_past(a) then raise exception 'Future or ongoing bookings require the ordinary reschedule workflow.' using errcode='22023'; end if;
     if jsonb_typeof(e->'schedule') is distinct from 'object' or
       not (e->'schedule' ?& array['date_time','end_date_time','appointment_date','start_time','end_time','timezone','all_day']) or
       exists(select 1 from jsonb_object_keys(e->'schedule') k where k not in ('date_time','end_date_time','appointment_date','start_time','end_time','timezone','all_day'))
       or (e->'schedule'->>'date_time') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or (e->'schedule'->>'end_date_time') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
       raise exception 'Provide the complete reviewed schedule with explicit timestamp offsets.' using errcode='22023'; end if;
     candidate:=jsonb_populate_record(candidate,e->'schedule');
     if candidate.date_time is null or candidate.end_date_time is null or candidate.appointment_date is null or candidate.start_time is null or candidate.end_time is null
       or candidate.timezone is null or candidate.all_day is null or candidate.end_date_time>clock_timestamp() then
       raise exception 'The corrected complete appointment must be in the past.' using errcode='22023'; end if;
   end if;
   if action in ('normalise_metadata','correct_past_schedule') then
     if candidate.end_date_time is null and candidate.end_time is null and not candidate.all_day then
       raise exception 'Missing duration requires schedule evidence; no default duration is inferred.' using errcode='22023'; end if;
     candidate.end_date_time:=private.calendar_end(candidate);
     if candidate.end_date_time is null or (candidate.date_time at time zone candidate.timezone)::date is distinct from candidate.appointment_date
       or candidate.date_time is null then raise exception 'Review contradictory appointment times before repair.' using errcode='22023'; end if;
     candidate.reservation_managed:=true;
     candidate.has_confirmed_reservation:=v_status='confirmed' or (a.has_confirmed_reservation and v_status in ('requested','accepted','alternative_requested','alternative_proposed'));
     if v_status not in ('draft','cancelled','declined','completed','no_show') then
       candidate.request_issued_at:=coalesce(a.request_issued_at,a.created_at);
       if candidate.request_issued_at is null then raise exception 'Missing original request evidence.' using errcode='22023'; end if;
       candidate.hold_expires_at:=least(a.hold_expires_at,candidate.request_issued_at+interval '24 hours',candidate.date_time);
     else candidate.hold_expires_at:=least(a.hold_expires_at,clock_timestamp()); end if;
   elsif action='link_internal_participant' then
     select * into person from public.appointment_participants p where p.participant_id=(e->>'participantId')::uuid and p.appointment_id=a.appointment_id;
     if not found or person.user_id is not null or person.rsvp_revoked_at is not null or person.organisation_id is distinct from p_org
       or lower(person.participant_role) not in ('agent','co-agent') or nullif(btrim(person.email),'') is null then
       raise exception 'Only an existing unlinked internal attendee can be matched.' using errcode='22023'; end if;
     select count(distinct pr.id) into matches from public.profiles pr join public.organisation_users m on m.user_id=pr.id
       where m.organisation_id=p_org and lower(coalesce(m.membership_status,m.status,''))='active'
       and lower(btrim(pr.email))=lower(btrim(person.email));
     if matches<>1 or not exists(select 1 from public.profiles pr join public.organisation_users m on m.user_id=pr.id
       where pr.id=(e->>'userId')::uuid and m.organisation_id=p_org and lower(coalesce(m.membership_status,m.status,''))='active'
       and lower(btrim(pr.email))=lower(btrim(person.email))) then
       raise exception 'The attendee needs a unique, exact active profile match in this organisation.' using errcode='22023'; end if;
   elsif action='rollback' then
     previous_batch:=(e->>'originalBatch')::uuid;
     select r.before_state,r.action into history,previous_action from private.calendar_repair_entries r join private.calendar_repair_batches b on b.batch_id=r.batch_id
       where r.batch_id=previous_batch and r.appointment_id=a.appointment_id and b.organisation_id=p_org;
     if not found or previous_action='rollback' then raise exception 'No eligible repair recovery record.' using errcode='22023'; end if;
     prior:=jsonb_populate_record(null::public.appointments,history->'appointment');
     if previous_action in ('normalise_metadata','correct_past_schedule') then
       candidate.status:=prior.status; candidate.reservation_managed:=prior.reservation_managed;
       candidate.has_confirmed_reservation:=prior.has_confirmed_reservation;
       candidate.request_issued_at:=prior.request_issued_at;
       -- Recovery must never extend or resurrect a reservation deadline.
       candidate.hold_expires_at:=least(a.hold_expires_at,prior.hold_expires_at);
       candidate.end_date_time:=prior.end_date_time;
       if previous_action='correct_past_schedule' then
         candidate.date_time:=prior.date_time; candidate.appointment_date:=prior.appointment_date;
         candidate.start_time:=prior.start_time; candidate.end_time:=prior.end_time;
         candidate.timezone:=prior.timezone; candidate.all_day:=prior.all_day;
         if not private.calendar_repair_past(candidate) then raise exception 'Recovery cannot move an appointment into the future.' using errcode='22023'; end if;
       end if;
     end if;
   end if;
   candidate.calendar_revision:=a.calendar_revision+1;
   insert into private.calendar_repair_entries(batch_id,appointment_id,action,evidence,before_state,suppressed_revision)
     values(p_batch,a.appointment_id,action,jsonb_build_object('reason',e->>'reason','evidence',e->>'evidence')::text,snap,candidate.calendar_revision);
   update public.appointments set status=candidate.status,date_time=candidate.date_time,end_date_time=candidate.end_date_time,
     appointment_date=candidate.appointment_date,start_time=candidate.start_time,end_time=candidate.end_time,timezone=candidate.timezone,all_day=candidate.all_day,
     reservation_managed=candidate.reservation_managed,has_confirmed_reservation=candidate.has_confirmed_reservation,
     request_issued_at=candidate.request_issued_at,hold_expires_at=candidate.hold_expires_at,
     calendar_revision=candidate.calendar_revision,updated_at=clock_timestamp() where appointment_id=a.appointment_id;
   if action='link_internal_participant' then
     update public.appointment_participants set user_id=(e->>'userId')::uuid,updated_at=clock_timestamp() where participant_id=person.participant_id;
   elsif action='rollback' and previous_action='link_internal_participant' then
     update public.appointment_participants p set user_id=(h->>'user_id')::uuid,updated_at=clock_timestamp()
       from jsonb_array_elements(history->'participants') h
       where p.participant_id=(h->>'participant_id')::uuid and p.appointment_id=a.appointment_id and p.user_id is distinct from (h->>'user_id')::uuid;
   end if;
   if action in ('normalise_metadata','correct_past_schedule') then
     update public.appointment_participants set rsvp_expires_at=least(rsvp_expires_at,case when candidate.has_confirmed_reservation then candidate.date_time else candidate.hold_expires_at end,candidate.date_time),
       rsvp_revoked_at=case when action='correct_past_schedule' then coalesce(rsvp_revoked_at,clock_timestamp()) else rsvp_revoked_at end,
       updated_at=clock_timestamp() where appointment_id=a.appointment_id and rsvp_revoked_at is null;
   end if;
   update public.calendar_delivery_jobs j set status='superseded',claimed_at=null,updated_at=clock_timestamp()
     where appointment_id=a.appointment_id and j.status in ('queued','processing','failed');
   update public.appointment_reminders rem set status='cancelled',updated_at=clock_timestamp() where appointment_id=a.appointment_id and rem.status='pending';
   results:=results||jsonb_build_array(jsonb_build_object('appointmentId',a.appointment_id,'action',action,'beforeFingerprint',e->>'expectedFingerprint','revision',candidate.calendar_revision));
  end loop;
  set constraints all immediate;
  for e in select v from jsonb_array_elements(results) v loop
    after_hash:=md5(private.calendar_repair_snapshot((e->>'appointmentId')::uuid)::text);
    update private.calendar_repair_entries set after_fingerprint=after_hash where batch_id=p_batch and appointment_id=(e->>'appointmentId')::uuid;
  end loop;
  select jsonb_agg(v||jsonb_build_object('afterFingerprint',r.after_fingerprint) order by v->>'appointmentId') into results
    from jsonb_array_elements(results) v join private.calendar_repair_entries r on r.appointment_id=(v->>'appointmentId')::uuid and r.batch_id=p_batch;
  v_receipt:=jsonb_build_object('verified',true,'preview',p_preview,'batchId',p_batch,'organisationId',p_org,'reviewedBy',p_reviewer,'entries',results);
  update private.calendar_repair_batches set receipt=v_receipt where batch_id=p_batch;
  if p_preview then raise exception using errcode='P7001',message='Repair preview complete',detail=v_receipt::text; end if;
 exception when sqlstate 'P7001' then get stacked diagnostics detail=pg_exception_detail; return detail::jsonb;
 end;
 return v_receipt;
end; $$;
revoke all on function private.execute_calendar_repair(uuid,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated,service_role;

create function public.repair_calendar_appointments(p_organisation_id uuid,p_batch_id uuid,p_reviewed_by uuid,p_reason text,p_entries jsonb,p_preview boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.calendar_repair_service();
 if exists(select 1 from jsonb_array_elements(p_entries) e where e->>'action'='rollback' or e ? 'originalBatch') then
   raise exception 'Use the verified rollback command for recovery.' using errcode='22023'; end if;
 return private.execute_calendar_repair(p_organisation_id,p_batch_id,p_reviewed_by,p_reason,p_entries,p_preview);
end; $$;
revoke all on function public.repair_calendar_appointments(uuid,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.repair_calendar_appointments(uuid,uuid,uuid,text,jsonb,boolean) to service_role;

create function public.rollback_calendar_repair(p_organisation_id uuid,p_original_batch_id uuid,p_batch_id uuid,p_reviewed_by uuid,p_reason text,p_preview boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entries jsonb;
begin
 perform private.calendar_repair_service();
 select jsonb_agg(jsonb_build_object('appointmentId',r.appointment_id,'expectedFingerprint',r.after_fingerprint,'action','rollback',
   'originalBatch',p_original_batch_id,'reason',p_reason,'evidence','Recover verified repair batch '||p_original_batch_id::text) order by r.appointment_id)
 into entries from private.calendar_repair_entries r join private.calendar_repair_batches b on b.batch_id=r.batch_id
 where b.batch_id=p_original_batch_id and b.organisation_id=p_organisation_id and r.action<>'rollback';
 if entries is null then raise exception 'No eligible repair batch in this organisation.' using errcode='22023'; end if;
 return private.execute_calendar_repair(p_organisation_id,p_batch_id,p_reviewed_by,p_reason,entries,p_preview);
end; $$;
revoke all on function public.rollback_calendar_repair(uuid,uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.rollback_calendar_repair(uuid,uuid,uuid,uuid,text,boolean) to service_role;
-- A lost operation response can be recovered read-only even after the original
-- snapshot/approval window closes. It exposes receipts, never private before-state.
create function public.get_calendar_repair_receipt(p_organisation_id uuid,p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.calendar_repair_service();
 select b.receipt into result from private.calendar_repair_batches b where b.organisation_id=p_organisation_id and b.batch_id=p_batch_id;
 if result is null then raise exception 'No verified repair receipt in this organisation.' using errcode='22023'; end if;
 return result||jsonb_build_object('replayed',true,'current',not exists(select 1 from private.calendar_repair_entries r where r.batch_id=p_batch_id
   and r.after_fingerprint is distinct from md5(private.calendar_repair_snapshot(r.appointment_id)::text)));
end; $$;
revoke all on function public.get_calendar_repair_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_calendar_repair_receipt(uuid,uuid) to service_role;

-- Keep worker completion lock order aligned with repair and ordinary saves.
create or replace function public.complete_calendar_delivery(p_id uuid,p_attempt integer,p_status text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.calendar_delivery_jobs;
begin
 if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 if p_status not in ('provider_accepted','failed','superseded') or (p_status='provider_accepted' and nullif(btrim(p_provider_id),'') is null) then raise exception 'Invalid provider receipt'; end if;
 select * into j from public.calendar_delivery_jobs where id=p_id for update;
 if not found or j.attempt_count<>p_attempt then return false; end if;
 if j.status<>'processing' then
   if j.status='superseded' and p_status='provider_accepted' then
     update public.calendar_delivery_jobs set provider_message_id=coalesce(provider_message_id,p_provider_id),
       accepted_at=coalesce(accepted_at,clock_timestamp()),updated_at=clock_timestamp() where id=p_id;
   end if;
   return false;
 end if;
 -- An in-flight external request cannot be recalled; record its real receipt,
 -- even if a concurrent edit superseded it. Never resurrect obsolete queued work.
 if not private.calendar_delivery_valid(j) then p_status:='superseded'; end if;
 update public.calendar_delivery_jobs set status=p_status,claimed_at=null,provider_message_id=coalesce(p_provider_id,provider_message_id),
   accepted_at=case when p_provider_id is not null then clock_timestamp() else accepted_at end,
   last_error=case when p_status='failed' then case when j.attempt_count>=j.max_attempts then 'Delivery failed; retry limit reached.' else 'Delivery failed; automatic retry scheduled.' end else null end,
   next_attempt_at=case when p_status='failed' then clock_timestamp()+least(3600,30*(2^least(j.attempt_count,6))::integer)*interval '1 second' else next_attempt_at end,
   updated_at=clock_timestamp() where id=p_id;
 if p_status='provider_accepted' and j.event_kind in ('invite','confirmed') then
   update public.appointment_participants set invitation_sent_at=coalesce(invitation_sent_at,clock_timestamp()),last_invitation_sent_at=clock_timestamp() where participant_id=j.participant_id and rsvp_revoked_at is null;
 end if;
 return true;
end; $$;


commit;
