begin;

-- NULL leaves other products' appointment delivery unchanged. Attorney RPCs
-- opt in explicitly; false persists the user's notifications-off choice.
alter table public.appointments add column attorney_delivery_enabled boolean,
  add column attorney_attach_calendar boolean not null default true,
  add column calendar_revision integer not null default 0 check (calendar_revision >= 0);

create table public.attorney_appointment_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  participant_id uuid not null references public.appointment_participants(participant_id) on delete cascade,
  revision integer not null check (revision >= 0),
  send_number integer not null default 0,
  event_kind text not null check (event_kind in ('invite','updated','confirmed','cancelled','completed','declined','reschedule_requested','reschedule_proposed','reschedule_rejected','reminder_24h','reminder_2h','reminder_due','documents')),
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','superseded')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, revision, participant_id, event_kind, send_number)
);
create index attorney_appointment_delivery_due_idx on public.attorney_appointment_delivery_jobs(next_attempt_at,created_at)
  where status in ('queued','failed');
create index attorney_appointment_delivery_participant_idx on public.attorney_appointment_delivery_jobs(participant_id);
alter table public.attorney_appointment_delivery_jobs enable row level security;
revoke all on public.attorney_appointment_delivery_jobs from public, anon, authenticated;
grant select on public.attorney_appointment_delivery_jobs to authenticated;
grant select, insert, update, delete on public.attorney_appointment_delivery_jobs to service_role;
create policy attorney_delivery_read on public.attorney_appointment_delivery_jobs for select to authenticated
  using (public.bridge_can_access_appointment(appointment_id));

create function private.queue_attorney_appointment_delivery(p_id uuid, p_kind text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.appointments; v_kind text; v_start timestamptz;
begin
  -- Trigger-only helper: caller write/RPC policies have already authorised the
  -- change, including an anonymous holder responding through the scoped RSVP RPC.
  select * into a from public.appointments where appointment_id=p_id;
  if not found or a.attorney_delivery_enabled is distinct from true then return; end if;
  v_kind := coalesce(p_kind, case lower(a.status)
    when 'cancelled' then 'cancelled' when 'canceled' then 'cancelled'
    when 'completed' then 'completed' when 'declined' then 'declined'
    when 'confirmed' then 'confirmed' when 'reschedule requested' then 'reschedule_requested' when 'alternative_proposed' then 'reschedule_proposed' when 'alternative_requested' then 'reschedule_requested'
    else 'invite' end);
  insert into public.attorney_appointment_delivery_jobs(appointment_id,participant_id,revision,event_kind)
    select a.appointment_id,p.participant_id,a.calendar_revision,v_kind
    from public.appointment_participants p where p.appointment_id=a.appointment_id
      and nullif(trim(p.email),'') is not null
      and (v_kind not in ('invite','reminder_24h','reminder_2h','reminder_due') or (lower(p.participant_role) <> 'attorney' and not p.is_scheduling_owner))
    on conflict (appointment_id,revision,participant_id,event_kind,send_number) do nothing;
  -- Persist the same in-app channels used by the existing appointment service.
  -- Future reminders remain queue jobs and appear when due, rather than today.
  if to_regclass('public.appointment_notification_events') is not null then
    insert into public.appointment_notification_events(id,appointment_id,transaction_id,event_type,recipient_id,recipient_role,recipient_email,visibility,title,message,email_status,in_app_status,metadata,dedupe_key)
    select j.id,a.appointment_id,a.transaction_id,
      case v_kind when 'invite' then 'appointment_confirmation_required' when 'updated' then 'appointment_updated' when 'documents' then 'appointment_documents_required'
        when 'reminder_due' then 'appointment_reminder_due' else 'appointment_'||v_kind end,
      p.user_id,lower(p.participant_role),p.email,a.visibility_scope,'Appointment update',
      case when v_kind='cancelled' then a.cancellation_reason else a.title end,'pending','sent',jsonb_build_object('deliveryJobId',j.id,'calendarRevision',a.calendar_revision),
      'attorney-delivery:'||j.id::text
    from public.attorney_appointment_delivery_jobs j join public.appointment_participants p on p.participant_id=j.participant_id
    where j.appointment_id=a.appointment_id and j.revision=a.calendar_revision and j.event_kind=v_kind
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if a.transaction_id is not null and a.visibility_scope='client_visible' and to_regclass('public.client_portal_notifications') is not null then
    insert into public.client_portal_notifications(id,transaction_id,client_role,notification_type,title,description,related_entity_type,related_entity_id,action_label,action_route,visibility,metadata,dedupe_key)
    select j.id,a.transaction_id,case when lower(p.participant_role)='seller' then 'seller' else 'buyer' end,
      case v_kind when 'invite' then 'appointment_requested' when 'updated' then 'message_shared' when 'documents' then 'appointment_documents_required'
        when 'declined' then 'appointment_cancelled' when 'reminder_due' then 'appointment_reminder_due' else 'appointment_'||v_kind end,
      'Appointment update',case when v_kind='cancelled' then a.cancellation_reason else a.title end,'appointment',a.appointment_id,
      'View appointment','appointments','client_visible',jsonb_build_object('deliveryJobId',j.id,'calendarRevision',a.calendar_revision),'attorney-delivery:'||j.id::text
    from public.attorney_appointment_delivery_jobs j join public.appointment_participants p on p.participant_id=j.participant_id
    where j.appointment_id=a.appointment_id and j.revision=a.calendar_revision and j.event_kind=v_kind
      and lower(p.participant_role) in ('client','buyer','seller')
      and not exists(select 1 from public.client_portal_notifications n where n.transaction_id=a.transaction_id and n.dedupe_key='attorney-delivery:'||j.id::text);
  end if;
  if lower(a.status) in ('cancelled','canceled','completed','declined','no_show','reschedule requested','alternative_requested','alternative_proposed') then return; end if;
  v_start := coalesce(a.date_time,(a.appointment_date+a.start_time) at time zone 'Africa/Johannesburg');
  insert into public.attorney_appointment_delivery_jobs(appointment_id,participant_id,revision,event_kind,next_attempt_at)
    select a.appointment_id,p.participant_id,a.calendar_revision,r.kind,v_start-r.offset_time
    from public.appointment_participants p cross join
      (values ('reminder_24h',interval '24 hours'),('reminder_2h',interval '2 hours'),('reminder_due',interval '0')) r(kind,offset_time)
    where p.appointment_id=a.appointment_id and nullif(trim(p.email),'') is not null
      and lower(p.rsvp_status)<>'declined' and lower(p.participant_role)<>'attorney' and not p.is_scheduling_owner
      and v_start-r.offset_time>now()
    on conflict (appointment_id,revision,participant_id,event_kind,send_number) do nothing;
end; $$;
revoke all on function private.queue_attorney_appointment_delivery(uuid,text) from public, anon, authenticated;

create function private.attorney_calendar_delivery_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.attorney_delivery_enabled is null then return new; end if;
  if tg_op='INSERT' then new.calendar_revision := 0; return new; end if;
  -- Keep worker receipts and unrelated notes from invalidating delivery. A
  -- calendar revision advances only for the externally visible event changes.
  if row(new.date_time,new.appointment_date,new.start_time,new.end_time,new.location,new.meeting_url,new.status,new.resource_id,new.scheduling_owner_user_id)
    is distinct from row(old.date_time,old.appointment_date,old.start_time,old.end_time,old.location,old.meeting_url,old.status,old.resource_id,old.scheduling_owner_user_id) then
    new.calendar_revision := old.calendar_revision+1;
  elsif new.calendar_revision=old.calendar_revision+1 and private.attorney_calendar_can_manage(new.appointment_id) then
    null; -- A changed counter-proposal advances the externally visible revision.
  else new.calendar_revision := old.calendar_revision; end if;
  return new;
end; $$;
revoke all on function private.attorney_calendar_delivery_revision() from public, anon, authenticated;
create trigger attorney_calendar_delivery_revision before insert or update on public.appointments
  for each row execute function private.attorney_calendar_delivery_revision();

create function private.attorney_calendar_delivery_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text;
begin
  if new.attorney_delivery_enabled is null then return new; end if;
  if tg_op='UPDATE' and old.attorney_delivery_enabled is null then
    update public.appointment_reminders set status='cancelled',updated_at=now() where appointment_id=new.appointment_id and status='pending';
  end if;
  if new.attorney_delivery_enabled=false then
    update public.attorney_appointment_delivery_jobs set status='superseded',claimed_at=null,updated_at=now()
      where appointment_id=new.appointment_id and status in ('queued','failed','processing');
    return new;
  end if;
  if tg_op='UPDATE' and new.calendar_revision=old.calendar_revision then return new; end if;
  update public.attorney_appointment_delivery_jobs set status='superseded',claimed_at=null,updated_at=now()
    where appointment_id=new.appointment_id and revision<>new.calendar_revision and status in ('queued','failed','processing');
  if tg_op='UPDATE' and lower(new.status)=lower(old.status) and lower(new.status) not in ('alternative_proposed','alternative_requested','reschedule requested') then v_kind := 'updated'; end if;
  if lower(new.status)='no_show' then return new; end if;
  perform private.queue_attorney_appointment_delivery(new.appointment_id,v_kind);
  return new;
end; $$;
revoke all on function private.attorney_calendar_delivery_changed() from public, anon, authenticated;
create trigger attorney_calendar_delivery_changed after insert or update on public.appointments
  for each row execute function private.attorney_calendar_delivery_changed();

create function private.attorney_calendar_delivery_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.queue_attorney_appointment_delivery(new.appointment_id);
  return new;
end; $$;
revoke all on function private.attorney_calendar_delivery_participant() from public, anon, authenticated;
create trigger attorney_calendar_delivery_participant after insert on public.appointment_participants
  for each row execute function private.attorney_calendar_delivery_participant();

-- Save the appointment, identities, RSVP tokens and queue in one transaction.
create function public.create_attorney_appointment_invite(p_appointment jsonb,p_participants jsonb,p_send_notifications boolean default true,p_attach_calendar boolean default true)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.appointments; p jsonb; v_id uuid := (p_appointment->>'appointment_id')::uuid; v_start timestamptz; v_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in before creating an appointment'; end if;
  if coalesce(jsonb_typeof(p_participants),'null')<>'array' or jsonb_array_length(p_participants)<1 then raise exception 'An invite recipient is required'; end if;
  if not exists(select 1 from jsonb_array_elements(p_participants) candidate(value) where lower(candidate.value->>'participant_role') <> 'attorney') then raise exception 'An invite recipient is required'; end if;
  v_start := ((p_appointment->>'appointment_date')::date+(p_appointment->>'start_time')::time) at time zone 'Africa/Johannesburg';
  v_end := ((p_appointment->>'appointment_date')::date+(p_appointment->>'end_time')::time) at time zone 'Africa/Johannesburg';
  if v_start is null or v_end is null or v_start<=now() or v_end<=v_start
    or extract(isodow from v_start at time zone 'Africa/Johannesburg')>5
    or (v_start at time zone 'Africa/Johannesburg')::time<time '08:00'
    or (v_end at time zone 'Africa/Johannesburg')::time>time '17:00' then
    raise exception 'Choose a future weekday appointment between 08:00 and 17:00 SAST';
  end if;
  insert into public.appointments(appointment_id,organisation_id,transaction_id,appointment_type,title,appointment_date,start_time,end_time,date_time,timezone,
    location_type,location,meeting_url,linked_workflow,linked_workflow_stage,linked_transaction_stage,visibility_scope,appointment_instructions,required_documents,
    resource_id,status,notes,created_by,attorney_delivery_enabled,attorney_attach_calendar)
  values(v_id,(p_appointment->>'organisation_id')::uuid,nullif(p_appointment->>'transaction_id','')::uuid,p_appointment->>'appointment_type',p_appointment->>'title',
    (p_appointment->>'appointment_date')::date,(p_appointment->>'start_time')::time,(p_appointment->>'end_time')::time,v_start,'Africa/Johannesburg',
    coalesce(nullif(p_appointment->>'location_type',''),'to_be_confirmed'),p_appointment->>'location',p_appointment->>'meeting_url',p_appointment->>'linked_workflow',
    p_appointment->>'linked_workflow_stage',p_appointment->>'linked_transaction_stage',coalesce(p_appointment->>'visibility_scope','client_visible'),
    p_appointment->>'appointment_instructions',coalesce(p_appointment->'required_documents','[]'::jsonb),nullif(p_appointment->>'resource_id','')::uuid,
    'Pending Confirmation',p_appointment->>'notes',auth.uid(),coalesce(p_send_notifications,true),coalesce(p_attach_calendar,true));
  if nullif(p_appointment->>'transaction_id','') is not null and not exists(select 1 from public.transactions t where t.id=(p_appointment->>'transaction_id')::uuid and t.organisation_id=(p_appointment->>'organisation_id')::uuid) then raise exception 'Use the selected matter organisation for this appointment'; end if;
  if not private.attorney_calendar_can_manage(v_id) then raise exception 'Not authorised to create an attorney appointment in this organisation'; end if;
  for p in select value from jsonb_array_elements(p_participants) loop
    if coalesce(p->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Every invite recipient needs an email address'; end if;
    if lower(p->>'participant_role')='attorney' and nullif(p->>'user_id','')::uuid is distinct from auth.uid() then raise exception 'The organiser must be the signed-in attorney'; end if;
    insert into public.appointment_participants(participant_id,appointment_id,organisation_id,user_id,name,email,participant_role,rsvp_status,rsvp_expires_at)
    values(coalesce(nullif(p->>'participant_id','')::uuid,gen_random_uuid()),v_id,(p_appointment->>'organisation_id')::uuid,
      case when lower(p->>'participant_role')='attorney' then auth.uid() else null end,
      p->>'name',lower(trim(p->>'email')),p->>'participant_role',case when lower(p->>'participant_role')='attorney' then 'Accepted' else 'Pending' end,
      case when lower(p->>'participant_role')='attorney' then null else v_start end);
  end loop;
  select * into a from public.appointments where appointment_id=v_id;
  return jsonb_build_object('appointment',to_jsonb(a),'participants',(select coalesce(jsonb_agg(to_jsonb(ap)-'rsvp_token'),'[]'::jsonb) from public.appointment_participants ap where appointment_id=v_id));
end; $$;
revoke all on function public.create_attorney_appointment_invite(jsonb,jsonb,boolean,boolean) from public, anon;
grant execute on function public.create_attorney_appointment_invite(jsonb,jsonb,boolean,boolean) to authenticated;

-- Reuse Phase 2's scoped, optimistic and conflict-checked management operation.
alter function public.manage_attorney_appointment(uuid,text,timestamptz,jsonb) set schema private;
create function public.manage_attorney_appointment(p_appointment_id uuid,p_action text,p_expected_updated_at timestamptz,p_changes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if not private.attorney_calendar_can_manage(p_appointment_id) then raise exception 'Not authorised to manage this appointment'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
  update public.appointments set attorney_delivery_enabled=coalesce(attorney_delivery_enabled,true)
    where appointment_id=p_appointment_id;
  return private.manage_attorney_appointment(p_appointment_id,p_action,p_expected_updated_at,p_changes);
end; $$;
revoke all on function public.manage_attorney_appointment(uuid,text,timestamptz,jsonb) from public, anon;
grant execute on function public.manage_attorney_appointment(uuid,text,timestamptz,jsonb) to authenticated;

create function private.claim_attorney_appointment_delivery(p_limit integer)
returns setof public.attorney_appointment_delivery_jobs language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
  update public.attorney_appointment_delivery_jobs set status='failed',claimed_at=null,next_attempt_at=now(),last_error='Worker interrupted; retrying.',updated_at=now()
    where status='processing' and claimed_at<now()-interval '5 minutes';
  return query with due as (
    select j.id from public.attorney_appointment_delivery_jobs j
    where j.status in ('queued','failed') and j.attempt_count<j.max_attempts and j.next_attempt_at<=now()
    order by j.next_attempt_at,j.created_at limit greatest(0,least(coalesce(p_limit,10),25)) for update skip locked
  ) update public.attorney_appointment_delivery_jobs j set status='processing',attempt_count=j.attempt_count+1,claimed_at=now(),updated_at=now()
    from due where j.id=due.id returning j.*;
end; $$;
revoke all on function private.claim_attorney_appointment_delivery(integer) from public, anon, authenticated;
grant execute on function private.claim_attorney_appointment_delivery(integer) to service_role;
create function public.claim_attorney_appointment_delivery(p_limit integer default 10)
returns setof public.attorney_appointment_delivery_jobs language sql security invoker set search_path = '' as $$select * from private.claim_attorney_appointment_delivery(p_limit)$$;
revoke all on function public.claim_attorney_appointment_delivery(integer) from public, anon, authenticated;
grant execute on function public.claim_attorney_appointment_delivery(integer) to service_role;

create function private.complete_attorney_appointment_delivery(p_id uuid,p_attempt integer,p_status text,p_error text,p_provider_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
  if p_status not in ('sent','failed','superseded') then raise exception 'Invalid delivery status'; end if;
  update public.attorney_appointment_delivery_jobs j set status=p_status,claimed_at=null,updated_at=now(),
    sent_at=case when p_status='sent' then now() else j.sent_at end,
    provider_message_id=case when p_status='sent' then nullif(p_provider_id,'') else j.provider_message_id end,
    last_error=case when p_status='failed' then left(coalesce(p_error,'Delivery failed'),500) else null end,
    next_attempt_at=case when p_status='failed' then now()+make_interval(mins=>least(60,(2^greatest(j.attempt_count-1,0))::integer)) else j.next_attempt_at end
    where j.id=p_id and j.status='processing' and j.attempt_count=p_attempt;
  get diagnostics v_count=row_count;
  if v_count=1 and to_regclass('public.appointment_notification_events') is not null then
    update public.appointment_notification_events set email_status=case when p_status='superseded' then 'cancelled' else p_status end,updated_at=now()
      where dedupe_key='attorney-delivery:'||p_id::text;
  end if;
  return v_count=1;
end; $$;
revoke all on function private.complete_attorney_appointment_delivery(uuid,integer,text,text,text) from public, anon, authenticated;
grant execute on function private.complete_attorney_appointment_delivery(uuid,integer,text,text,text) to service_role;
create function public.complete_attorney_appointment_delivery(p_id uuid,p_attempt integer,p_status text,p_error text default null,p_provider_id text default null)
returns boolean language sql security invoker set search_path = '' as $$select private.complete_attorney_appointment_delivery(p_id,p_attempt,p_status,p_error,p_provider_id)$$;
revoke all on function public.complete_attorney_appointment_delivery(uuid,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_attorney_appointment_delivery(uuid,integer,text,text,text) to service_role;

create function private.retry_attorney_appointment_delivery(p_id uuid,p_kind text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer; a public.appointments;
begin
  if auth.uid() is null or not private.attorney_calendar_can_manage(p_id) then raise exception 'Not authorised to send this appointment'; end if;
  select * into a from public.appointments where appointment_id=p_id for update;
  if a.attorney_delivery_enabled is distinct from true then raise exception 'Notifications are switched off for this appointment'; end if;
  if lower(a.status) in ('completed','cancelled','canceled','declined','no_show') then raise exception 'Closed appointments cannot receive reminders or invitations'; end if;
  if p_kind not in ('invite','updated','documents','reminder_due') then raise exception 'Unknown communication type'; end if;
  if p_kind='invite' and lower(a.status)='confirmed' then p_kind:='confirmed'; end if;
  perform private.queue_attorney_appointment_delivery(p_id,p_kind);
  -- Failed work retains the job/provider key and monotonically increasing lease
  -- number. An explicit resend of already-sent work gets a new job/key; repeated
  -- clicks reuse queued work until that resend completes.
  insert into public.attorney_appointment_delivery_jobs(appointment_id,participant_id,revision,event_kind,send_number)
    select p_id,p.participant_id,a.calendar_revision,p_kind,coalesce(max(j.send_number),0)+1
    from public.appointment_participants p join public.attorney_appointment_delivery_jobs j on j.participant_id=p.participant_id
    where j.appointment_id=p_id and j.revision=a.calendar_revision and j.event_kind=p_kind
      and not exists(select 1 from public.attorney_appointment_delivery_jobs pending where pending.appointment_id=p_id
        and pending.revision=a.calendar_revision and pending.participant_id=p.participant_id and pending.event_kind=p_kind and pending.status in ('queued','processing','failed'))
    group by p.participant_id having bool_and(j.status='sent');
  update public.attorney_appointment_delivery_jobs set status='queued',max_attempts=greatest(max_attempts,attempt_count+5),next_attempt_at=now(),claimed_at=null,last_error=null,updated_at=now()
    where appointment_id=p_id and revision=a.calendar_revision and event_kind=p_kind and status='failed';
  select count(*) into v_count from public.attorney_appointment_delivery_jobs
    where appointment_id=p_id and revision=a.calendar_revision and event_kind=p_kind and status in ('queued','processing');
  return v_count;
end; $$;
revoke all on function private.retry_attorney_appointment_delivery(uuid,text) from public, anon;
grant execute on function private.retry_attorney_appointment_delivery(uuid,text) to authenticated;
create function public.retry_attorney_appointment_delivery(p_id uuid,p_kind text default 'invite')
returns integer language sql security invoker set search_path = '' as $$select private.retry_attorney_appointment_delivery(p_id,p_kind)$$;
revoke all on function public.retry_attorney_appointment_delivery(uuid,text) from public, anon;
grant execute on function public.retry_attorney_appointment_delivery(uuid,text) to authenticated;

-- Activate durable delivery during existing attorney reschedule RPCs as well.
create function private.attorney_delivery_reschedule_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('proposed','accepted','rejected') and private.attorney_calendar_can_manage(new.appointment_id) then
    update public.appointments set attorney_delivery_enabled=coalesce(attorney_delivery_enabled,true) where appointment_id=new.appointment_id;
  end if;
  return new;
end; $$;
revoke all on function private.attorney_delivery_reschedule_guard() from public, anon, authenticated;
create function private.attorney_delivery_proposal_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='proposed' and row(new.preferred_start,new.preferred_end,new.reason,new.status)
    is distinct from row(old.preferred_start,old.preferred_end,old.reason,old.status) then
    update public.appointments set calendar_revision=calendar_revision+1 where appointment_id=new.appointment_id and attorney_delivery_enabled=true;
  end if;
  return new;
end; $$;
revoke all on function private.attorney_delivery_proposal_changed() from public, anon, authenticated;
create trigger attorney_delivery_proposal_changed after update on public.appointment_reschedule_requests
  for each row execute function private.attorney_delivery_proposal_changed();
create trigger attorney_delivery_reschedule_guard before update on public.appointment_reschedule_requests
  for each row execute function private.attorney_delivery_reschedule_guard();

-- Freeze the first prepared provider request so retrying a lost receipt never
-- changes the body associated with its idempotency key. RSVP tokens stay private.
create table private.attorney_appointment_email_payloads (
  job_id uuid primary key references public.attorney_appointment_delivery_jobs(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.attorney_appointment_email_payloads enable row level security;
revoke all on private.attorney_appointment_email_payloads from public, anon, authenticated;
create function private.save_attorney_delivery_payload(p_id uuid,p_attempt integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.attorney_appointment_delivery_jobs; v_payload jsonb;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
  select * into j from public.attorney_appointment_delivery_jobs where id=p_id for update;
  if not found or j.status<>'processing' or j.attempt_count<>p_attempt then return null; end if;
  if not exists(select 1 from public.appointments a where a.appointment_id=j.appointment_id and a.calendar_revision=j.revision and a.attorney_delivery_enabled=true) then return null; end if;
  insert into private.attorney_appointment_email_payloads(job_id,payload) values(p_id,p_payload) on conflict(job_id) do nothing;
  select payload into v_payload from private.attorney_appointment_email_payloads where job_id=p_id;
  return v_payload;
end; $$;
revoke all on function private.save_attorney_delivery_payload(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function private.save_attorney_delivery_payload(uuid,integer,jsonb) to service_role;
create function public.save_attorney_delivery_payload(p_id uuid,p_attempt integer,p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$select private.save_attorney_delivery_payload(p_id,p_attempt,p_payload)$$;
revoke all on function public.save_attorney_delivery_payload(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_attorney_delivery_payload(uuid,integer,jsonb) to service_role;

create function private.attorney_delivery_recipient_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(new.email,new.name) is distinct from row(old.email,old.name) and private.attorney_calendar_can_manage(new.appointment_id) then
    update public.appointments set calendar_revision=calendar_revision+1 where appointment_id=new.appointment_id and attorney_delivery_enabled=true;
  end if;
  return new;
end; $$;
revoke all on function private.attorney_delivery_recipient_changed() from public, anon, authenticated;
create trigger attorney_delivery_recipient_changed after update on public.appointment_participants
  for each row execute function private.attorney_delivery_recipient_changed();

-- Due reminders and explicit resends receive durable in-app messages when the
-- worker prepares them. A repeated lease preserves read/dismissed state.
create function private.record_attorney_delivery_in_app(p_id uuid,p_attempt integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.attorney_appointment_delivery_jobs; a public.appointments; p public.appointment_participants; v_event text; v_portal_event text;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
  select * into j from public.attorney_appointment_delivery_jobs where id=p_id for update;
  if not found or j.status<>'processing' or j.attempt_count<>p_attempt then return false; end if;
  select * into a from public.appointments where appointment_id=j.appointment_id;
  select * into p from public.appointment_participants where participant_id=j.participant_id;
  if a.attorney_delivery_enabled is distinct from true or a.calendar_revision<>j.revision then return false; end if;
  v_event:=case when j.event_kind like 'reminder_%' then 'appointment_reminder_due'
    when j.event_kind='invite' then 'appointment_confirmation_required' when j.event_kind='documents' then 'appointment_documents_required'
    else 'appointment_'||j.event_kind end;
  v_portal_event:=case when j.event_kind='invite' then 'appointment_requested' when j.event_kind='updated' then 'message_shared'
    when j.event_kind='declined' then 'appointment_cancelled' else v_event end;
  if to_regclass('public.appointment_notification_events') is not null then
    insert into public.appointment_notification_events(id,appointment_id,transaction_id,event_type,recipient_id,recipient_role,recipient_email,visibility,title,message,email_status,in_app_status,metadata,dedupe_key)
      values(j.id,a.appointment_id,a.transaction_id,v_event,p.user_id,lower(p.participant_role),p.email,a.visibility_scope,'Appointment update',a.title,'pending','sent',
        jsonb_build_object('deliveryJobId',j.id,'calendarRevision',j.revision),'attorney-delivery:'||j.id::text) on conflict(id) do nothing;
  end if;
  if a.transaction_id is not null and a.visibility_scope='client_visible' and lower(p.participant_role) in ('client','buyer','seller')
    and to_regclass('public.client_portal_notifications') is not null then
    insert into public.client_portal_notifications(id,transaction_id,client_role,notification_type,title,description,related_entity_type,related_entity_id,action_label,action_route,visibility,metadata,dedupe_key)
      values(j.id,a.transaction_id,case when lower(p.participant_role)='seller' then 'seller' else 'buyer' end,v_portal_event,'Appointment update',a.title,
        'appointment',a.appointment_id,'View appointment','appointments','client_visible',jsonb_build_object('deliveryJobId',j.id,'calendarRevision',j.revision),
        'attorney-delivery:'||j.id::text) on conflict(id) do nothing;
  end if;
  return true;
end; $$;
revoke all on function private.record_attorney_delivery_in_app(uuid,integer) from public, anon, authenticated;
grant execute on function private.record_attorney_delivery_in_app(uuid,integer) to service_role;
create function public.record_attorney_delivery_in_app(p_id uuid,p_attempt integer)
returns boolean language sql security invoker set search_path = '' as $$select private.record_attorney_delivery_in_app(p_id,p_attempt)$$;
revoke all on function public.record_attorney_delivery_in_app(uuid,integer) from public, anon, authenticated;
grant execute on function public.record_attorney_delivery_in_app(uuid,integer) to service_role;

grant usage on schema private to service_role;
notify pgrst, 'reload schema';
commit;
