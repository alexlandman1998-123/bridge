-- General calendar delivery is persisted atomically with the existing verified save.
-- No historical jobs are backfilled. Dedicated attorney / three-party invitations
-- retain their established invitation owners; ordinary and viewing reminders opt in on save.
begin;
alter table public.appointments
  add column calendar_delivery_managed boolean not null default false,
  add column invitations_enabled boolean not null default true,
  add column reminders_enabled boolean not null default true,
  add column reminder_rules jsonb,
  add column attach_calendar_invite boolean not null default true,
  add column email_theme text,
  add column email_template_key text;

create function private.calendar_default_reminder_rules(p_type text) returns jsonb language sql immutable set search_path='' as $$
 select case lower(replace(coalesce(p_type,''),' ','_'))
 when 'viewing' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'seller_consultation' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'seller_valuation' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'valuation_presentation' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'buyer_consultation' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'mandate_signing' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'otp_signing' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'transfer_signing' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'bond_signing' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'finance_consultation' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'attorney_consultation' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'handover' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'snag_inspection' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'internal_meeting' then '[{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'client_meeting' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'other' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'presentation_appointment' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'mandate_discussion' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'buyer_meeting' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'follow_up_meeting' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'otp_offer_discussion' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'signing_appointment' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'property_inspection' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'inspection' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 when 'bond_consultation' then '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"},{"type":"documents_missing","offsetMinutes":1440,"reminderType":"appointment_documents_required"}]'::jsonb
 when 'general_meeting' then '[{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb
 else '[{"type":"before_start","offsetMinutes":1440,"reminderType":"appointment_reminder_24h"},{"type":"before_start","offsetMinutes":120,"reminderType":"appointment_reminder_2h"},{"type":"at_start","offsetMinutes":0,"reminderType":"appointment_reminder_due"}]'::jsonb end;
$$;
revoke all on function private.calendar_default_reminder_rules(text) from public,anon,authenticated;

create table public.calendar_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  participant_id uuid not null references public.appointment_participants(participant_id) on delete cascade,
  revision integer not null,
  event_kind text not null,
  channel text not null check(channel in ('email','in_app')),
  recipient_id uuid references public.profiles(id),
  recipient_email text,
  participant_role text,
  scheduled_for timestamptz not null,
  expires_at timestamptz not null,
  next_attempt_at timestamptz not null,
  status text not null default 'queued' check(status in ('queued','processing','provider_accepted','delivered','failed','superseded')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  claimed_at timestamptz,
  provider_message_id text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  payload jsonb,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(appointment_id,revision,participant_id,event_kind,channel)
);
create index calendar_delivery_due_idx on public.calendar_delivery_jobs(next_attempt_at,created_at)
  where status in ('queued','failed');
create index calendar_delivery_participant_idx on public.calendar_delivery_jobs(participant_id);
create index calendar_delivery_processing_idx on public.calendar_delivery_jobs(claimed_at) where status='processing';
create index calendar_delivery_provider_idx on public.calendar_delivery_jobs(provider_message_id) where provider_message_id is not null;
alter table public.calendar_delivery_jobs enable row level security;
revoke all on public.calendar_delivery_jobs from public,anon,authenticated;
grant select on public.calendar_delivery_jobs to authenticated;
grant select,insert,update,delete on public.calendar_delivery_jobs to service_role;
-- Expose safe receipts only: payload contains RSVP bearer tokens and remains private.
revoke select on public.calendar_delivery_jobs from authenticated;
grant select(id,appointment_id,participant_id,revision,event_kind,channel,recipient_id,recipient_email,participant_role,
  scheduled_for,expires_at,next_attempt_at,status,attempt_count,max_attempts,claimed_at,provider_message_id,
  accepted_at,delivered_at,last_error,created_at,updated_at) on public.calendar_delivery_jobs to authenticated;
create policy calendar_delivery_read on public.calendar_delivery_jobs for select to authenticated
  using(public.bridge_can_access_appointment(appointment_id));

create table private.calendar_provider_receipts(provider_event_id text primary key,provider_message_id text not null,event_type text not null,created_at timestamptz not null default now());
create index calendar_provider_receipts_message_idx on private.calendar_provider_receipts(provider_message_id);
alter table private.calendar_provider_receipts enable row level security;
revoke all on private.calendar_provider_receipts from public,anon,authenticated;
create function private.calendar_email_allowed(p_org uuid,p_email text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare allowed boolean:=true;
begin
 if to_regclass('public.notification_recipient_preferences') is not null then
   execute 'select not exists(select 1 from public.notification_recipient_preferences where organisation_id=$1 and recipient_email=$2 and email_enabled=false)'
     into allowed using p_org,p_email;
 end if;
 return allowed and not exists(select 1 from private.calendar_provider_receipts r join public.calendar_delivery_jobs j on j.provider_message_id=r.provider_message_id
   join public.appointments a on a.appointment_id=j.appointment_id where a.organisation_id=p_org and j.recipient_email=p_email and r.event_type<>'email.delivered');
end; $$;
revoke all on function private.calendar_email_allowed(uuid,text) from public,anon,authenticated;

create function private.calendar_delivery_valid(j public.calendar_delivery_jobs) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.appointments a join public.appointment_participants p on p.appointment_id=a.appointment_id
   where a.appointment_id=j.appointment_id and p.participant_id=j.participant_id
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

create function private.reconcile_calendar_delivery(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.appointments; kind text; start_at timestamptz;
begin
 select * into a from public.appointments where appointment_id=p_id;
 if not found or not a.calendar_delivery_managed then return; end if;
 update public.appointment_reminders set status='cancelled',updated_at=clock_timestamp() where appointment_id=p_id and status='pending';
 update public.calendar_delivery_jobs j set status='superseded',claimed_at=null,updated_at=clock_timestamp()
   where j.appointment_id=p_id and j.status in ('queued','processing','failed') and not private.calendar_delivery_valid(j);
 if a.attorney_delivery_enabled is not null then return; end if;
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

create function private.calendar_delivery_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.reconcile_calendar_delivery(new.appointment_id); return new; end; $$;
revoke all on function private.calendar_delivery_changed() from public,anon,authenticated;
create constraint trigger calendar_delivery_changed after insert or update on public.appointments deferrable initially deferred
 for each row execute function private.calendar_delivery_changed();
create constraint trigger calendar_delivery_attendee_changed after insert or update on public.appointment_participants deferrable initially deferred
 for each row execute function private.calendar_delivery_changed();

create function private.calendar_delivery_preferences_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.invitations_enabled,new.reminders_enabled,new.reminder_rules,new.attach_calendar_invite,new.calendar_delivery_managed,new.visibility_scope,new.title,new.appointment_instructions,new.required_documents,new.email_theme,new.email_template_key)
   is distinct from (old.invitations_enabled,old.reminders_enabled,old.reminder_rules,old.attach_calendar_invite,old.calendar_delivery_managed,old.visibility_scope,old.title,old.appointment_instructions,old.required_documents,old.email_theme,old.email_template_key) then
   if (new.calendar_delivery_managed or old.calendar_delivery_managed) and current_user in ('anon','authenticated') then raise exception 'Use the verified appointment save command.' using errcode='42501'; end if;
   if new.calendar_delivery_managed or old.calendar_delivery_managed then new.calendar_revision:=old.calendar_revision+1; end if;
 end if;
 return new;
end; $$;
revoke all on function private.calendar_delivery_preferences_guard() from public,anon,authenticated;
create trigger calendar_delivery_preferences_guard before update on public.appointments for each row execute function private.calendar_delivery_preferences_guard();

create or replace function private.calendar_receipt(a public.appointments) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('appointment',to_jsonb(a),'participants',coalesce(
   (select jsonb_agg(to_jsonb(p) order by p.created_at,p.participant_id) from public.appointment_participants p
     where p.appointment_id=a.appointment_id and (p.rsvp_revoked_at is null or private.calendar_status(a.status) in ('cancelled','completed','declined','no_show'))),'[]'::jsonb),
   'verified',true,'delivery',jsonb_build_object('verified',a.calendar_delivery_managed,'revision',a.calendar_revision,'jobs',coalesce(
     (select jsonb_agg(to_jsonb(j)-'payload'-'provider_payload') from public.calendar_delivery_jobs j where j.appointment_id=a.appointment_id and j.revision=a.calendar_revision),'[]'::jsonb)));
$$;
create or replace function public.save_calendar_appointment(
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
      'follow_up_date','cancellation_reason','offer_invite_id','invitations_enabled','reminders_enabled','reminder_rules','attach_calendar_invite','email_theme','email_template_key']);
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
  if created then
    data:=jsonb_build_object('invitations_enabled',true,'reminders_enabled',true,'attach_calendar_invite',true,
      'reminder_rules',private.calendar_default_reminder_rules(p_payload->>'appointment_type'))||data;
  end if;
  if not (data ? 'reminder_rules') and previous.reminder_rules is null then
    data:=data||jsonb_build_object('reminder_rules',private.calendar_default_reminder_rules(coalesce(p_payload->>'appointment_type',previous.appointment_type)));
  end if;
  if data ? 'reminder_rules' and (jsonb_typeof(data->'reminder_rules') is distinct from 'array' or jsonb_array_length(data->'reminder_rules')>16) then
    raise exception 'Choose valid reminder rules.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(data->'reminder_rules','[]'::jsonb)) rule
    where jsonb_typeof(rule)<>'object' or coalesce(rule->>'reminderType','')!~ '^[a-z][a-z0-9_]{0,79}$'
      or coalesce(rule->>'offsetMinutes','')!~ '^[0-9]{1,5}$' or (rule->>'offsetMinutes')::integer>43200) then
    raise exception 'Choose valid reminder rules.' using errcode='22023'; end if;
  if previous.attorney_delivery_enabled is null then
    data:=data||jsonb_build_object('calendar_delivery_managed',true);
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
  if created then data:=data||jsonb_build_object('created_at',v_now,'reservation_managed',p_viewing_mode is null,'calendar_delivery_managed',true); end if;
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
  perform private.reconcile_calendar_delivery(a.appointment_id);
  result:=private.calendar_receipt(a);
  insert into private.calendar_mutation_receipts(actor_id,command_id,appointment_id,fingerprint,result)
    values(auth.uid(),p_command_id,a.appointment_id,v_fingerprint,result);
  return result;
end;
$$;

-- Versioned entry point prevents old servers from accepting a browser save
-- without the required durable queue migration.
create function public.save_calendar_appointment_with_delivery(
 p_organisation_id uuid,p_appointment_id uuid,p_payload jsonb,p_participants jsonb,p_expected_revision integer,p_command_id uuid,
 p_action text default 'save',p_viewing_mode text default null,p_confirmation_note text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select public.save_calendar_appointment(p_organisation_id,p_appointment_id,p_payload,p_participants,p_expected_revision,p_command_id,p_action,p_viewing_mode,p_confirmation_note);
$$;
revoke all on function public.save_calendar_appointment_with_delivery(uuid,uuid,jsonb,jsonb,integer,uuid,text,text,text) from public,anon;
grant execute on function public.save_calendar_appointment_with_delivery(uuid,uuid,jsonb,jsonb,integer,uuid,text,text,text) to authenticated;

-- Worker endpoints are service-only and every completion is fenced by the claim attempt.
create function public.claim_calendar_delivery(p_limit integer default 10) returns setof public.calendar_delivery_jobs
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
 update public.calendar_delivery_jobs j set status='superseded',claimed_at=null,updated_at=clock_timestamp()
   where status in ('queued','failed','processing') and not private.calendar_delivery_valid(j);
 update public.calendar_delivery_jobs set status='failed',claimed_at=null,next_attempt_at=clock_timestamp(),
   last_error='Worker interrupted; retry scheduled.',updated_at=clock_timestamp()
   where status='processing' and claimed_at<clock_timestamp()-interval '5 minutes';
 return query with due as (select id from public.calendar_delivery_jobs where status in ('queued','failed')
   and attempt_count<max_attempts and next_attempt_at<=clock_timestamp() and expires_at>clock_timestamp()
   order by next_attempt_at,created_at limit greatest(0,least(coalesce(p_limit,10),25)) for update skip locked)
 update public.calendar_delivery_jobs j set status='processing',attempt_count=j.attempt_count+1,claimed_at=clock_timestamp(),updated_at=clock_timestamp()
 from due where due.id=j.id returning j.*;
end; $$;

create function public.prepare_calendar_delivery(p_id uuid,p_attempt integer,p_payload jsonb default null) returns jsonb
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
   'Appointment update',a.title,'skipped','sent',jsonb_build_object('deliveryJobId',j.id,'calendarRevision',j.revision),'calendar-delivery:'||j.id::text)
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
 update public.calendar_delivery_jobs set status='delivered',delivered_at=clock_timestamp(),claimed_at=null,updated_at=clock_timestamp() where id=p_id;
 return jsonb_build_object('delivered',true);
end; $$;

create function public.freeze_calendar_provider_payload(p_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.calendar_delivery_jobs;
begin
 if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into j from public.calendar_delivery_jobs where id=p_id for update;
 if not found or j.channel<>'email' or j.status<>'processing' or j.claimed_at<clock_timestamp()-interval '5 minutes' then return null; end if;
 if not private.calendar_delivery_valid(j) then update public.calendar_delivery_jobs set status='superseded',claimed_at=null where id=p_id;return null;end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload ? 'apiKey' or p_payload->>'idempotencyKey' is distinct from 'calendar-appointment:'||j.id::text
   or lower(p_payload->>'to') is distinct from j.recipient_email then raise exception 'Invalid provider payload'; end if;
 update public.calendar_delivery_jobs set provider_payload=coalesce(provider_payload,p_payload) where id=p_id returning * into j;
 return j.provider_payload;
end; $$;
revoke all on function public.freeze_calendar_provider_payload(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.freeze_calendar_provider_payload(uuid,jsonb) to service_role;

create function public.complete_calendar_delivery(p_id uuid,p_attempt integer,p_status text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.calendar_delivery_jobs;
begin
 if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
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

-- Store webhook events separately so delivery confirmation arriving before the
-- worker receipt (or retried after a DB failure) still reconciles correctly.
create function public.record_calendar_provider_receipt(p_event_id text,p_provider_id text,p_event_type text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
 if nullif(btrim(p_event_id),'') is null or nullif(btrim(p_provider_id),'') is null or p_event_type not in ('email.delivered','email.bounced','email.complained','email.suppressed') then return false; end if;
 insert into private.calendar_provider_receipts values(p_event_id,p_provider_id,p_event_type,clock_timestamp()) on conflict do nothing;
 update public.calendar_delivery_jobs j set status=case when p_event_type='email.delivered' then 'delivered' else 'failed' end,
   delivered_at=case when p_event_type='email.delivered' then clock_timestamp() else delivered_at end,
   last_error=case when p_event_type='email.delivered' then null else 'Provider reported a delivery failure.' end,
   attempt_count=case when p_event_type<>'email.delivered' then max_attempts else attempt_count end,updated_at=clock_timestamp()
 where provider_message_id=p_provider_id and status in ('provider_accepted','delivered')
   and not exists(select 1 from private.calendar_provider_receipts r where r.provider_message_id=p_provider_id and r.event_type<>'email.delivered');
 -- Negative receipts win over a delayed delivered event and are never retried.
 update public.calendar_delivery_jobs set status='failed',attempt_count=max_attempts,last_error='Provider reported a delivery failure.',updated_at=clock_timestamp()
 where provider_message_id=p_provider_id and exists(select 1 from private.calendar_provider_receipts r where r.provider_message_id=p_provider_id and r.event_type<>'email.delivered');
 return exists(select 1 from public.calendar_delivery_jobs where provider_message_id=p_provider_id);
end; $$;
create function private.calendar_provider_receipt_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.provider_message_id is not null and new.status='provider_accepted' then
   update public.calendar_delivery_jobs j set status=case when exists(select 1 from private.calendar_provider_receipts r where r.provider_message_id=new.provider_message_id and r.event_type<>'email.delivered') then 'failed' else 'delivered' end,
     delivered_at=case when not exists(select 1 from private.calendar_provider_receipts r where r.provider_message_id=new.provider_message_id and r.event_type<>'email.delivered') then clock_timestamp() else null end,
     attempt_count=case when exists(select 1 from private.calendar_provider_receipts r where r.provider_message_id=new.provider_message_id and r.event_type<>'email.delivered') then j.max_attempts else j.attempt_count end
   where j.id=new.id and exists(select 1 from private.calendar_provider_receipts r where r.provider_message_id=new.provider_message_id);
 end if; return new;
end; $$;
revoke all on function private.calendar_provider_receipt_changed() from public,anon,authenticated;
create trigger calendar_provider_receipt_changed after update of provider_message_id on public.calendar_delivery_jobs for each row execute function private.calendar_provider_receipt_changed();

revoke all on function public.claim_calendar_delivery(integer),public.prepare_calendar_delivery(uuid,integer,jsonb),public.complete_calendar_delivery(uuid,integer,text,text),public.record_calendar_provider_receipt(text,text,text) from public,anon,authenticated;
grant execute on function public.claim_calendar_delivery(integer),public.prepare_calendar_delivery(uuid,integer,jsonb),public.complete_calendar_delivery(uuid,integer,text,text),public.record_calendar_provider_receipt(text,text,text) to service_role;
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
      'calendar_delivery_managed',stored.calendar_delivery_managed,'invitations_enabled',stored.invitations_enabled,'reminders_enabled',stored.reminders_enabled,'reminder_rules',stored.reminder_rules,'attach_calendar_invite',stored.attach_calendar_invite,'email_theme',stored.email_theme,'email_template_key',stored.email_template_key,'attorney_delivery_enabled',stored.attorney_delivery_enabled,'listing_viewing_round_number',stored.listing_viewing_round_number)
    order by a.date_time asc nulls last, a.created_at desc
  ), '[]'::jsonb)
  from public.bridge_list_calendar_appointments(p_organisation_id, p_include_all, p_listing_id, p_from, p_to) a
  join public.appointments stored
    on stored.appointment_id = a.appointment_id and stored.organisation_id = a.organisation_id;
$$;

commit;
