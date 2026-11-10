begin;
create schema if not exists private;

create table public.whatsapp_screening_profiles (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  listing_id uuid not null references public.private_listings(id), kind text not null check(kind in ('buyer','tenant')),
  channel_id uuid not null references public.organisation_communication_channels(id), sender_version integer not null,
  config jsonb not null, created_by uuid not null references auth.users(id), version integer not null default 1,
  enabled boolean not null default false, enabled_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,listing_id)
);
create table public.whatsapp_screening_sessions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  lead_id uuid not null references public.leads(lead_id), listing_id uuid not null references public.private_listings(id),
  profile_id uuid not null references public.whatsapp_screening_profiles(id), profile_version integer not null,
  channel_id uuid not null references public.organisation_communication_channels(id), phone text, assigned_user_id uuid,
  conversation_id uuid references public.whatsapp_inbox_conversations(id), assignment_version integer,
  kind text not null check(kind in ('buyer','tenant')), context_snapshot jsonb not null,
  answers jsonb not null default '{}', current_key text, version integer not null default 1,
  status text not null default 'queued' check(status in ('queued','awaiting_start','active','paused','completed','handoff','stopped','blocked')),
  reason text, last_prompt_id uuid references public.whatsapp_inbox_messages(id), review_task_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(lead_id,listing_id)
);
create unique index whatsapp_screening_one_active on public.whatsapp_screening_sessions(channel_id,phone)
  where status in ('awaiting_start','active','paused');
create index whatsapp_screening_sessions_org on public.whatsapp_screening_sessions(organisation_id,updated_at desc);
create index whatsapp_screening_sessions_thread on public.whatsapp_screening_sessions(conversation_id,status);

create table public.whatsapp_screening_jobs (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.whatsapp_screening_sessions(id),
  kind text not null check(kind in ('opening','reply','resume')), inbound_message_id uuid unique references public.whatsapp_inbox_messages(id),
  status text not null default 'queued' check(status in ('queued','leased','sending','sent','failed','unknown','skipped')),
  lease_token uuid, lease_until timestamptz, message_id uuid references public.whatsapp_inbox_messages(id),
  session_version integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index whatsapp_screening_one_opening on public.whatsapp_screening_jobs(session_id) where kind='opening';
create index whatsapp_screening_jobs_pending on public.whatsapp_screening_jobs(created_at) where status in ('queued','leased','sending');
create index whatsapp_screening_jobs_session on public.whatsapp_screening_jobs(session_id,created_at);
create table public.whatsapp_screening_answers (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.whatsapp_screening_sessions(id),
  question_key text not null, answer jsonb not null, inbound_message_id uuid references public.whatsapp_inbox_messages(id),
  recorded_at timestamptz not null default now(), unique(session_id,question_key)
);

-- Only the authenticated server boundary may call these commands. Browser roles
-- have no direct access to configuration, income, answers or worker state.
alter table public.whatsapp_screening_profiles enable row level security;
alter table public.whatsapp_screening_sessions enable row level security;
alter table public.whatsapp_screening_jobs enable row level security;
alter table public.whatsapp_screening_answers enable row level security;
revoke all on public.whatsapp_screening_profiles,public.whatsapp_screening_sessions,public.whatsapp_screening_jobs,public.whatsapp_screening_answers from public,anon,authenticated;
grant all on public.whatsapp_screening_profiles,public.whatsapp_screening_sessions,public.whatsapp_screening_jobs,public.whatsapp_screening_answers to service_role;
grant usage on schema private to service_role;
grant select,update(lead_id) on public.leads to service_role;
grant select,update(contact_id) on public.contacts to service_role;
grant select,update(id) on public.private_listings to service_role;
grant insert,select on public.tasks to service_role;

create function private.whatsapp_screening_review(p_session uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare s public.whatsapp_screening_sessions%rowtype; owner_id uuid; actor_id uuid;
begin
  select * into s from public.whatsapp_screening_sessions where id=p_session for update;
  if s.review_task_id is not null or s.status not in ('completed','handoff') then return; end if;
  select coalesce(l.assigned_user_id,l.assigned_agent_id) into owner_id from public.leads l where l.lead_id=s.lead_id and l.organisation_id=s.organisation_id;
  select created_by into actor_id from public.whatsapp_screening_profiles where id=s.profile_id;
  insert into public.tasks(organisation_id,lead_id,assigned_agent_id,created_by,title,description,due_date,status,priority,metadata)
    values(s.organisation_id,s.lead_id,coalesce(owner_id,actor_id),actor_id,
      case when s.status='completed' then 'Review completed WhatsApp screening' else 'Take over WhatsApp screening' end,
      'Review the saved screening for '||(s.context_snapshot->>'propertyLabel')||'. Identity upload/check and viewing confirmation require agent review. Open the lead and its WhatsApp conversation.',
      current_date,'Pending','Medium',jsonb_build_object('whatsapp_screening_session_id',s.id,'listing_id',s.listing_id,'identity_route',s.answers->'identity_route'))
    returning task_id into s.review_task_id;
  update public.whatsapp_screening_sessions set review_task_id=s.review_task_id where id=s.id;
end; $$;

create function private.whatsapp_screening_enrol(p_lead uuid,p_listing uuid,p_event_at timestamptz) returns uuid
language plpgsql security invoker set search_path='' as $$
declare l jsonb; raw jsonb; p public.whatsapp_screening_profiles%rowtype; flow text; sid uuid; phone text;
begin
  select to_jsonb(item) into l from public.leads item where lead_id=p_lead;
  if l is null then return null; end if;
  raw:=coalesce(l->'raw_enquiry_payload','{}');
  if lower(coalesce(l->>'status','')) in ('archived','deleted','closed_lost','closed_won','lost')
    or lower(coalesce(l->>'stage','')) in ('archived','deleted','closed_lost','closed_won','lost')
    or l->>'archived_at' is not null or coalesce((l->>'is_archived')::boolean,false)
    or coalesce(raw->'arch9_meta'->>'ingestion_source',raw->'ingestion'->>'source','')='historical' then return null; end if;
  if coalesce(raw->>'classification',raw->>'leadType',raw->'rentalCrm'->>'classification',raw->'rental_crm'->>'classification','')='rental'
    or coalesce(raw->>'arch9RentalLead',raw->'rentalCrm'->>'arch9RentalLead','false')='true' then
    if coalesce(raw->>'role',raw->'rentalCrm'->>'role',raw->'rental_crm'->>'role','tenant')<>'tenant' then return null; end if;
    flow:='tenant';
  elsif lower(coalesce(l->>'lead_category',''))='buyer' and lower(coalesce(l->>'lead_domain','agency'))='agency' then flow:='buyer';
  else return null; end if;
  select p1.* into p from public.whatsapp_screening_profiles p1 join public.private_listings item on item.id=p1.listing_id and item.organisation_id=p1.organisation_id
    where p1.organisation_id=(l->>'organisation_id')::uuid and p1.listing_id=p_listing and p1.kind=flow and p1.enabled and p1.enabled_at<=p_event_at for share of p1;
  if p.id is null then return null; end if;
  select public.whatsapp_crm_phone(c.phone) into phone from public.contacts c where c.contact_id=(l->>'contact_id')::uuid and c.organisation_id=p.organisation_id;
  insert into public.whatsapp_screening_sessions(organisation_id,lead_id,listing_id,profile_id,profile_version,channel_id,phone,assigned_user_id,kind,context_snapshot)
    values(p.organisation_id,p_lead,p_listing,p.id,p.version,p.channel_id,phone,coalesce((l->>'assigned_user_id')::uuid,(l->>'assigned_agent_id')::uuid),flow,p.config->'context') on conflict(lead_id,listing_id) do nothing returning id into sid;
  if sid is not null then
    insert into public.whatsapp_screening_jobs(session_id,kind) values(sid,'opening');
    -- The property's questionnaire replaces the older one-shot new-lead
    -- acknowledgement for this lead, without disabling other agency rules.
    if to_regclass('public.whatsapp_automation_runs') is not null and to_regclass('public.whatsapp_automation_rules') is not null then
      execute $sql$update public.whatsapp_automation_runs job set status='skipped',reason='Property screening owns this new enquiry',updated_at=now()
        from public.whatsapp_automation_rules rule where rule.id=job.rule_id and job.organisation_id=$1 and job.record_id=$2
        and job.status in ('queued','leased') and rule.config->>'action'='message' and rule.config->>'trigger'='new_lead'$sql$
        using p.organisation_id,p_lead;
    end if;
  end if;
  return sid;
end; $$;

create function private.whatsapp_screening_lead_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare item jsonb:=to_jsonb(new); listing_text text; at_time timestamptz;
begin
  if not exists(select 1 from public.whatsapp_screening_profiles where enabled) then return null;end if;
  if tg_table_name='lead_listing_interests' then
    if not exists(select 1 from public.leads where lead_id=(item->>'lead_id')::uuid and organisation_id=(item->>'organisation_id')::uuid) then return null;end if;
    listing_text:=item->>'listing_id';at_time:=coalesce((item->>'created_at')::timestamptz,now());
    if listing_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then perform private.whatsapp_screening_enrol((item->>'lead_id')::uuid,listing_text::uuid,at_time);end if;
  else
    listing_text:=coalesce(item->>'listing_id',item->'raw_enquiry_payload'->'relationships'->>'listingId',item->'raw_enquiry_payload'->'rentalCrm'->'relationships'->>'listingId',item->'raw_enquiry_payload'->'rental_crm'->'relationships'->>'listingId');
    if listing_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then perform private.whatsapp_screening_enrol((item->>'lead_id')::uuid,listing_text::uuid,coalesce((item->>'created_at')::timestamptz,now()));end if;
  end if;
  return null;
end; $$;
create trigger whatsapp_screening_lead_event after insert or update on public.leads for each row execute function private.whatsapp_screening_lead_event();
do $$ begin
  if to_regclass('public.lead_listing_interests') is not null then
    execute 'create trigger whatsapp_screening_interest_event after insert on public.lead_listing_interests for each row execute function private.whatsapp_screening_lead_event()';
  end if;
end $$;

create function private.whatsapp_screening_message_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.whatsapp_screening_sessions%rowtype;
begin
  if new.direction='outbound' and coalesce(new.request_json ? 'screeningJob',false) and new.delivery_status='failed' then
    update public.whatsapp_screening_jobs set status='failed',updated_at=now() where id=new.id;
    update public.whatsapp_screening_sessions set status=case when status in ('completed','handoff','stopped') then status else 'blocked' end,
      reason='Meta reported a screening message delivery failure; agent review required',updated_at=now()
      where id=(new.request_json->>'screeningSession')::uuid;
    update public.whatsapp_screening_jobs set status='skipped' where session_id=(new.request_json->>'screeningSession')::uuid and status in ('queued','leased');
    return null;
  end if;
  if tg_op='UPDATE' then return null;end if;
  if new.message_origin='history' or (new.direction='inbound' and not new.live_received) then return null;end if;
  select * into s from public.whatsapp_screening_sessions where conversation_id=new.conversation_id and organisation_id=new.organisation_id
    and status in ('awaiting_start','active','paused') for update;
  if s.id is null then return null;end if;
  if new.direction='outbound' and not coalesce(new.request_json ? 'screeningJob',false) then
    update public.whatsapp_screening_sessions set status='handoff',reason='Agent took over the conversation',version=version+1,updated_at=now() where id=s.id;
    update public.whatsapp_screening_jobs set status='skipped' where session_id=s.id and status in ('queued','leased');
    return null;
  end if;
  if new.direction<>'inbound' then return null;end if;
  if lower(trim(new.body_text)) in ('stop','unsubscribe','opt out','opt-out') then
    perform public.whatsapp_inbox_optout(ch.phone_number_id,ch.waba_id,s.phone,new.event_at)
      from public.organisation_communication_channels ch where ch.id=new.channel_id and ch.organisation_id=new.organisation_id;
    update public.whatsapp_screening_sessions set status='stopped',reason='Customer opted out',version=version+1,updated_at=now() where id=s.id;
    update public.whatsapp_screening_jobs set status='skipped' where session_id=s.id and status in ('queued','leased');
    return null;
  end if;
  insert into public.whatsapp_screening_jobs(session_id,kind,inbound_message_id) values(s.id,'reply',new.id) on conflict(inbound_message_id) do nothing;
  return null;
end; $$;
create trigger whatsapp_screening_message_event after insert or update on public.whatsapp_inbox_messages for each row execute function private.whatsapp_screening_message_event();

create function private.whatsapp_screening_outbox_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.direction='outbound' and coalesce(new.request_json ? 'automationRule',false) and exists(
    select 1 from public.whatsapp_screening_sessions sess join public.whatsapp_inbox_conversations thread
      on thread.channel_id=sess.channel_id and thread.organisation_id=sess.organisation_id and thread.contact_phone=sess.phone
    where thread.id=new.conversation_id and sess.organisation_id=new.organisation_id and sess.status in ('queued','awaiting_start','active','paused')
  ) then raise exception 'Automatic screening is active. Other automatic messages must wait for agent review';end if;
  return new;
end; $$;
create trigger whatsapp_screening_outbox_guard before insert on public.whatsapp_inbox_messages for each row execute function private.whatsapp_screening_outbox_guard();
revoke all on function private.whatsapp_screening_outbox_guard() from public,anon,authenticated;

create function public.whatsapp_screening_command(p_org uuid,p_actor uuid,p_action text,p_id uuid default null,p_version integer default null,p_config jsonb default null,p_lead uuid default null,p_conversation uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare admin boolean; profile public.whatsapp_screening_profiles%rowtype; sender public.organisation_communication_channels%rowtype; items jsonb; s public.whatsapp_screening_sessions%rowtype;
begin
  admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  if p_action='sessions' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc),'[]') into items from (
      select sess.* from public.whatsapp_screening_sessions sess join public.leads l on l.lead_id=sess.lead_id and l.organisation_id=sess.organisation_id
      join public.organisation_communication_channels ch on ch.id=sess.channel_id and ch.organisation_id=sess.organisation_id
      where sess.organisation_id=p_org and ch.owner_user_id is null and (admin or coalesce(l.assigned_user_id,l.assigned_agent_id)=p_actor)
        and (p_lead is null or sess.lead_id=p_lead) and (p_conversation is null or sess.conversation_id=p_conversation)
      order by sess.updated_at desc limit 100) q;
    return jsonb_build_object('sessions',items);
  end if;
  if p_action in ('pause','handoff','resume','retry') then
    select s1.* into s from public.whatsapp_screening_sessions s1 join public.leads l on l.lead_id=s1.lead_id and l.organisation_id=s1.organisation_id
      join public.organisation_communication_channels ch on ch.id=s1.channel_id and ch.organisation_id=s1.organisation_id
      where s1.id=p_id and s1.organisation_id=p_org and ch.owner_user_id is null and (admin or coalesce(l.assigned_user_id,l.assigned_agent_id)=p_actor) for update of s1;
    if s.id is null or s.version is distinct from p_version then raise exception 'Screening or access changed. Refresh before continuing';end if;
    if s.status in ('completed','stopped','handoff') then raise exception 'This screening is closed to automatic messages';end if;
    if p_action not in ('pause','handoff') and exists(select 1 from public.whatsapp_screening_jobs where session_id=s.id and status in ('sending','unknown')) then raise exception 'Review the unconfirmed send in the inbox before taking further action';end if;
    update public.whatsapp_screening_jobs set status='skipped' where session_id=s.id and status in ('queued','leased');
    if p_action in ('pause','handoff') then
      update public.whatsapp_screening_sessions set status=case when p_action='pause' then 'paused' else 'handoff' end,reason='Staff requested '||p_action,version=version+1,updated_at=now() where id=s.id;
      if p_action='handoff' then perform private.whatsapp_screening_review(s.id);end if;
    else
      if p_action='retry' and (s.status<>'blocked' or s.last_prompt_id is not null) then raise exception 'Only a blocked, unsent opening can be retried';end if;
      if p_action='resume' and s.status<>'paused' then raise exception 'Only a paused screening can be resumed';end if;
      update public.whatsapp_screening_sessions set status=case when p_action='retry' then 'queued' else 'paused' end,reason=null,version=version+1,updated_at=now() where id=s.id;
      if p_action='retry' then update public.whatsapp_screening_jobs set status='queued',lease_token=null,lease_until=null where session_id=s.id and kind='opening' and status in ('failed','skipped');
      else insert into public.whatsapp_screening_jobs(session_id,kind) values(s.id,'resume');end if;
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if not admin then raise exception 'Agency management must configure screening';end if;
  if p_action='list' then
    select coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc),'[]') into items from public.whatsapp_screening_profiles p where organisation_id=p_org;
    return jsonb_build_object('profiles',items);
  end if;
  if p_id is not null then
    select * into profile from public.whatsapp_screening_profiles where id=p_id and organisation_id=p_org for update;
    if profile.id is null or profile.version is distinct from p_version then raise exception 'Screening settings changed. Refresh before saving';end if;
  end if;
  if p_action='save' then
    if p_config->>'kind' not in ('buyer','tenant') or jsonb_typeof(p_config->'context')<>'object' or (p_config->>'flowVersion')::integer<>1 then raise exception 'Invalid screening definition';end if;
    if not exists(select 1 from public.private_listings where id=(p_config->>'listingId')::uuid and organisation_id=p_org) then raise exception 'Choose a listing in this workspace';end if;
    select * into sender from public.organisation_communication_channels where id=(p_config->>'senderId')::uuid and organisation_id=p_org and owner_user_id is null and provider='meta' and channel_type='whatsapp' and connection_status='connected' for share;
    if sender.id is null then raise exception 'Screening requires a connected shared company number';end if;
    if p_config->'template'->>'status' is distinct from 'APPROVED' then raise exception 'Choose an approved opening template';end if;
    if profile.id is null then
      insert into public.whatsapp_screening_profiles(organisation_id,listing_id,kind,channel_id,sender_version,config,created_by)
        values(p_org,(p_config->>'listingId')::uuid,p_config->>'kind',sender.id,sender.ownership_version,p_config,p_actor) returning * into profile;
    else
      update public.whatsapp_screening_profiles set listing_id=(p_config->>'listingId')::uuid,kind=p_config->>'kind',channel_id=sender.id,sender_version=sender.ownership_version,config=p_config,created_by=p_actor,version=version+1,enabled=false,enabled_at=null,updated_at=now() where id=profile.id returning * into profile;
    end if;
  elsif p_action in ('enable','disable') and profile.id is not null then
    update public.whatsapp_screening_profiles set enabled=p_action='enable',enabled_at=case when p_action='enable' then now() else null end,created_by=p_actor,version=version+1,updated_at=now() where id=profile.id returning * into profile;
  else raise exception 'Unknown screening action';end if;
  update public.whatsapp_screening_sessions set status='handoff',reason='Screening settings changed or switched off',version=version+1,updated_at=now()
    where profile_id=profile.id and status not in ('completed','handoff','stopped');
  update public.whatsapp_screening_jobs job set status='skipped' from public.whatsapp_screening_sessions sess where sess.id=job.session_id and sess.profile_id=profile.id and job.status in ('queued','leased');
  return jsonb_build_object('profile',to_jsonb(profile));
end; $$;

-- Rechecked immediately before creating an outgoing inbox receipt. Never select
-- another sender, infer permission from an enquiry, or transfer a CRM link.
create function private.whatsapp_screening_ready(p_session uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.whatsapp_screening_sessions%rowtype; p public.whatsapp_screening_profiles%rowtype; ch public.organisation_communication_channels%rowtype;
  c public.whatsapp_inbox_conversations%rowtype; l jsonb; person jsonb; listing jsonb; reason text; opted_out timestamptz; phone text; management boolean:=false;
begin
  select * into s from public.whatsapp_screening_sessions where id=p_session for update;
  select * into p from public.whatsapp_screening_profiles where id=s.profile_id for share;
  select * into ch from public.organisation_communication_channels where id=s.channel_id and organisation_id=s.organisation_id for share;
  select to_jsonb(item) into l from public.leads item where lead_id=s.lead_id and organisation_id=s.organisation_id for share;
  select to_jsonb(item) into listing from public.private_listings item where id=s.listing_id and organisation_id=s.organisation_id for share;
  select to_jsonb(item) into person from public.contacts item where contact_id=(l->>'contact_id')::uuid and organisation_id=s.organisation_id for share;
  phone:=public.whatsapp_crm_phone(person->>'phone');
  begin management:=public.whatsapp_staff_is_admin(s.organisation_id,p.created_by);exception when others then management:=false;end;
  if not p.enabled or p.version<>s.profile_version or not management then reason:='Screening settings or management access changed';
  elsif ch.id is null or ch.owner_user_id is not null or ch.ownership_version<>p.sender_version or ch.connection_status<>'connected' then reason:='Shared sender disconnected or ownership changed';
  elsif l is null or listing is null or phone is null or phone is distinct from s.phone then reason:='Lead, property or contact changed';
  elsif s.assigned_user_id is distinct from coalesce((l->>'assigned_user_id')::uuid,(l->>'assigned_agent_id')::uuid) then reason:='Lead assignment changed; agent review required';
  elsif (s.kind='tenant') is distinct from (coalesce(listing->>'listing_category','')='rental') then reason:='Property classification changed';
  elsif s.kind='buyer' and (lower(coalesce(l->>'lead_category',''))<>'buyer' or coalesce(l->'raw_enquiry_payload'->>'classification','')='rental') then reason:='Lead classification changed';
  elsif s.kind='tenant' and coalesce(l->'raw_enquiry_payload'->>'role',l->'raw_enquiry_payload'->'rentalCrm'->>'role',l->'raw_enquiry_payload'->'rental_crm'->>'role','tenant')<>'tenant' then reason:='Rental lead role changed';
  elsif lower(coalesce(l->>'status','')) in ('archived','deleted','closed_lost','closed_won','lost') or lower(coalesce(l->>'stage','')) in ('archived','deleted','closed_lost','closed_won','lost') or l->>'archived_at' is not null or coalesce((l->>'is_archived')::boolean,false) then reason:='Lead is no longer active';
  elsif coalesce(listing->>'is_active','true')='false' or lower(coalesce(listing->>'listing_status','active')) not in ('active','under_offer') then reason:='Property is no longer available for screening';
  elsif nullif(listing->>'asking_price','')::numeric is distinct from (s.context_snapshot->>'price')::numeric then reason:='Property price changed; review screening settings';end if;
  select * into c from public.whatsapp_inbox_conversations where channel_id=s.channel_id and organisation_id=s.organisation_id and contact_phone=s.phone for update;
  select max(coalesce(mc.opted_out_at,mc.updated_at)) into opted_out from public.whatsapp_marketing_contacts mc where mc.organisation_id=s.organisation_id and mc.phone=s.phone and mc.consent_status='opted_out';
  if reason is null and (c.id is null or c.status='closed') then reason:='Open the contact in the shared WhatsApp inbox and record permission first';end if;
  if reason is null and not exists(select 1 from public.whatsapp_inbox_permissions where conversation_id=c.id and organisation_id=s.organisation_id and status='opted_in' and consent_at<=now() and consent_at>coalesce(opted_out,'-infinity')) then reason:='No current WhatsApp permission for this company number';end if;
  if reason is null and s.assignment_version is not null and s.assignment_version is distinct from c.assignment_version then reason:='Conversation assignment changed; agent review required';end if;
  if reason is null and c.assigned_user_id is not null and c.assigned_user_id is distinct from coalesce((l->>'assigned_user_id')::uuid,(l->>'assigned_agent_id')::uuid) then reason:='Conversation belongs to another agent';end if;
  if reason is null and exists(select 1 from public.whatsapp_inbox_crm_links where conversation_id=c.id and organisation_id=s.organisation_id and (lead_id is distinct from s.lead_id or recruitment_lead_id is not null)) then reason:='Conversation is linked to another lead';end if;
  if reason is not null then return jsonb_build_object('ready',false,'reason',reason);end if;
  update public.whatsapp_screening_sessions set conversation_id=c.id,assignment_version=c.assignment_version where id=s.id;
  return jsonb_build_object('ready',true,'sender',to_jsonb(ch),'thread',to_jsonb(c),'profile',to_jsonb(p),'name',trim(concat_ws(' ',person->>'first_name',person->>'last_name')));
end; $$;

create function public.whatsapp_screening_next() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.whatsapp_screening_jobs%rowtype; s public.whatsapp_screening_sessions%rowtype; incoming jsonb; eligibility jsonb;
begin
  update public.whatsapp_screening_jobs job set status='skipped',updated_at=now() from public.whatsapp_screening_sessions sess
    where sess.id=job.session_id and sess.status in ('completed','handoff','stopped','blocked') and job.status in ('queued','leased');
  update public.whatsapp_inbox_messages set delivery_status='unknown',error_message='Unconfirmed screening send; automatic resend blocked'
    where delivery_status='sending' and id in(select message_id from public.whatsapp_screening_jobs where status='sending' and lease_until<now());
  with expired as (update public.whatsapp_screening_jobs set status='unknown',updated_at=now() where status='sending' and lease_until<now() returning session_id)
    update public.whatsapp_screening_sessions set status=case when status in ('completed','handoff','stopped') then status else 'blocked' end,reason='Unconfirmed send; automatic resend blocked',updated_at=now() where id in(select session_id from expired);
  select job.* into j from public.whatsapp_screening_jobs job join public.whatsapp_screening_sessions sess on sess.id=job.session_id
    where (job.status='queued' or job.status='leased' and job.lease_until<now()) and sess.status in ('queued','awaiting_start','active','paused')
      and not exists(select 1 from public.whatsapp_screening_jobs prior where prior.session_id=job.session_id and prior.id<>job.id and prior.status in ('queued','leased','sending','unknown') and (prior.created_at,prior.id)<(job.created_at,job.id))
      and not exists(select 1 from public.whatsapp_screening_sessions other where other.channel_id=sess.channel_id and other.phone=sess.phone and other.id<>sess.id and other.status in ('awaiting_start','active','paused'))
    order by job.created_at,job.id for update of job skip locked limit 1;
  if j.id is null then return null;end if;
  select * into s from public.whatsapp_screening_sessions where id=j.session_id for update;
  eligibility:=private.whatsapp_screening_ready(s.id);
  if not (eligibility->>'ready')::boolean then
    update public.whatsapp_screening_sessions set status='blocked',reason=eligibility->>'reason',updated_at=now() where id=s.id;
    update public.whatsapp_screening_jobs set status='skipped',updated_at=now() where id=j.id;
    return jsonb_build_object('skipped',true);
  end if;
  if j.inbound_message_id is not null then
    select to_jsonb(m) into incoming from public.whatsapp_inbox_messages m where m.id=j.inbound_message_id and m.conversation_id=(eligibility->'thread'->>'id')::uuid;
    -- A reply which arrived before the current question was created cannot
    -- answer the next question, even if provider webhooks arrived in a batch.
    if incoming is null or exists(select 1 from public.whatsapp_inbox_messages prompt where prompt.id=s.last_prompt_id and
      ((incoming->>'created_at')::timestamptz<prompt.created_at or prompt.delivery_status not in ('sent','delivered','read') or
       incoming->'media_json'->>'replyTo' is not null and incoming->'media_json'->>'replyTo' is distinct from prompt.provider_message_id)) then
      update public.whatsapp_screening_jobs set status='skipped' where id=j.id;return jsonb_build_object('skipped',true);
    end if;
  end if;
  update public.whatsapp_screening_jobs set status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',session_version=s.version,updated_at=now() where id=j.id returning * into j;
  return jsonb_build_object('job',to_jsonb(j),'session',to_jsonb(s),'incoming',incoming)||eligibility;
end; $$;

create function public.whatsapp_screening_dispatch(p_id uuid,p_token uuid,p_state jsonb,p_template jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.whatsapp_screening_jobs%rowtype; s public.whatsapp_screening_sessions%rowtype; ready jsonb; receipt jsonb; actor_id uuid; body text; pair record;
begin
  select * into j from public.whatsapp_screening_jobs where id=p_id and status='leased' and lease_token=p_token and lease_until>now() for update;
  if j.id is null then return jsonb_build_object('ready',false);end if;
  select * into s from public.whatsapp_screening_sessions where id=j.session_id for update;
  if s.version is distinct from j.session_version or s.status not in ('queued','awaiting_start','active','paused') then update public.whatsapp_screening_jobs set status='skipped' where id=j.id;return jsonb_build_object('ready',false);end if;
  perform pg_advisory_xact_lock(hashtextextended(s.channel_id::text||':'||coalesce(s.phone,''),0));
  if exists(select 1 from public.whatsapp_screening_sessions other where other.channel_id=s.channel_id and other.phone=s.phone and other.id<>s.id and other.status in ('awaiting_start','active','paused')) then
    update public.whatsapp_screening_jobs set status='queued',lease_token=null,lease_until=null where id=j.id;return jsonb_build_object('ready',false);
  end if;
  ready:=private.whatsapp_screening_ready(s.id);
  if not (ready->>'ready')::boolean then
    update public.whatsapp_screening_jobs set status='skipped' where id=j.id;
    update public.whatsapp_screening_sessions set status='blocked',reason=ready->>'reason',updated_at=now() where id=s.id;
    return jsonb_build_object('ready',false);
  end if;
  actor_id:=(ready->'profile'->>'created_by')::uuid;
  if p_state->>'status' not in ('awaiting_start','active','paused','completed','handoff','stopped') or jsonb_typeof(p_state->'answers')<>'object' then raise exception 'Invalid screening result';end if;
  if not (p_state->'answers' @> s.answers) then raise exception 'Saved screening answers cannot be overwritten by an automatic step';end if;
  if p_template is not null and p_template is distinct from ready->'profile'->'config'->'template' then raise exception 'Opening template changed';end if;
  body:=p_state->>'body';
  if body is not null then
    receipt:=public.whatsapp_inbox_claim(s.organisation_id,actor_id,(ready->'thread'->>'id')::uuid,j.id,jsonb_build_object('screeningJob',j.id,'screeningSession',s.id),
      (ready->'thread'->>'assignment_version')::integer,(ready->'sender'->>'ownership_version')::integer,false,
      case when p_template is null then 'text' else 'template' end,body,'{}',null,case when p_template is not null then jsonb_build_object('name',p_template->>'name','language',p_template->>'language','category',p_template->>'category') end);
    if not coalesce((receipt->>'claimed')::boolean,false) then return jsonb_build_object('ready',false);end if;
  end if;
  for pair in select key,value from jsonb_each(p_state->'answers') where not(s.answers ? key) loop
    insert into public.whatsapp_screening_answers(session_id,question_key,answer,inbound_message_id) values(s.id,pair.key,pair.value,j.inbound_message_id) on conflict(session_id,question_key) do nothing;
  end loop;
  update public.whatsapp_screening_sessions set answers=p_state->'answers',current_key=p_state->>'current_key',status=p_state->>'status',version=version+1,reason=null,
    last_prompt_id=case when body is not null then j.id else last_prompt_id end,updated_at=now() where id=s.id;
  perform private.whatsapp_screening_review(s.id);
  update public.whatsapp_screening_jobs set status=case when body is null then 'sent' else 'sending' end,message_id=case when body is not null then id end,lease_until=now()+interval '90 seconds',updated_at=now() where id=j.id;
  return jsonb_build_object('ready',body is not null,'messageId',j.id);
end; $$;

create function public.whatsapp_screening_finish(p_id uuid,p_token uuid,p_status text,p_provider_id text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare j public.whatsapp_screening_jobs%rowtype; s public.whatsapp_screening_sessions%rowtype; ch public.organisation_communication_channels%rowtype;
begin
  select * into j from public.whatsapp_screening_jobs where id=p_id and lease_token=p_token and status in ('leased','sending','unknown') for update;
  if j.id is null then return;end if;
  if p_status not in ('sent','failed','unknown') then raise exception 'Invalid delivery result';end if;
  select * into s from public.whatsapp_screening_sessions where id=j.session_id for update;
  if p_status='sent' and j.status<>'leased' and nullif(p_provider_id,'') is not null then
    select * into ch from public.organisation_communication_channels where id=s.channel_id;
    perform public.whatsapp_inbox_status(ch.phone_number_id,ch.waba_id,p_provider_id,'arch9-inbox:'||j.message_id,'sent',now(),null);
    update public.whatsapp_screening_jobs set status=case when exists(select 1 from public.whatsapp_inbox_messages where id=j.message_id and delivery_status='failed') then 'failed' else 'sent' end,updated_at=now() where id=j.id;
  else
    update public.whatsapp_screening_jobs set status=case when p_status='sent' then 'unknown' else p_status end,updated_at=now() where id=j.id;
    update public.whatsapp_inbox_messages set delivery_status=case when p_status='failed' then 'failed' else 'unknown' end,error_message='Automatic screening send did not receive confirmed acceptance' where id=j.message_id and delivery_status='sending';
    update public.whatsapp_screening_sessions set status=case when status in ('completed','handoff','stopped') then status else 'blocked' end,reason=case when p_status='failed' then 'Message preparation or delivery failed; agent review required' else 'Unconfirmed send; automatic resend blocked' end,updated_at=now() where id=s.id;
  end if;
end; $$;

revoke all on function public.whatsapp_screening_command(uuid,uuid,text,uuid,integer,jsonb,uuid,uuid),public.whatsapp_screening_next(),public.whatsapp_screening_dispatch(uuid,uuid,jsonb,jsonb),public.whatsapp_screening_finish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_screening_command(uuid,uuid,text,uuid,integer,jsonb,uuid,uuid),public.whatsapp_screening_next(),public.whatsapp_screening_dispatch(uuid,uuid,jsonb,jsonb),public.whatsapp_screening_finish(uuid,uuid,text,text) to service_role;
revoke all on function private.whatsapp_screening_review(uuid),private.whatsapp_screening_enrol(uuid,uuid,timestamptz),private.whatsapp_screening_lead_event(),private.whatsapp_screening_message_event(),private.whatsapp_screening_ready(uuid) from public,anon,authenticated;
grant execute on function private.whatsapp_screening_review(uuid),private.whatsapp_screening_ready(uuid) to service_role;

create function private.run_whatsapp_screening_worker() returns jsonb language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text; request_id bigint;
begin
  if current_setting('role') not in ('service_role','none') and pg_trigger_depth()=0 then raise exception 'Worker authorization required';end if;
  if not exists(select 1 from public.whatsapp_screening_jobs where status in ('queued','leased','sending')) then return jsonb_build_object('scheduled',false);end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
  if nullif(trim(project_url),'') is null or nullif(trim(service_key),'') is null then return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing');end if;
  select net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/whatsapp-screening-worker',headers:=jsonb_build_object('Content-Type','application/json','apikey',service_key),body:='{}'::jsonb,timeout_milliseconds:=90000) into request_id;
  return jsonb_build_object('scheduled',true,'request_id',request_id);
end; $$;
revoke all on function private.run_whatsapp_screening_worker() from public,anon,authenticated;
grant execute on function private.run_whatsapp_screening_worker() to service_role;
-- Wake after a real enquiry/reply commits, rather than making the applicant
-- wait for the recovery tick after every question. pg_net runs after commit.
create function private.whatsapp_screening_wake() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return new;end if;
  perform private.run_whatsapp_screening_worker();
  return new;
exception when others then
  -- Ingress remains durable if the wake-up transport is unavailable. The
  -- minute recovery worker can still claim the same unsent job.
  return new;
end; $$;
revoke all on function private.whatsapp_screening_wake() from public,anon,authenticated;
create trigger whatsapp_screening_wake after insert on public.whatsapp_screening_jobs for each row execute function private.whatsapp_screening_wake();
do $$ begin
  if to_regclass('cron.job') is not null then perform cron.schedule('whatsapp-screening-worker','* * * * *','select private.run_whatsapp_screening_worker();');end if;
end $$;
commit;
