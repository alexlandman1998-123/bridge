begin;

-- All configuration and execution is server-mediated. Enabling never backfills.
create table public.whatsapp_automation_rules (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  created_by uuid not null references auth.users(id), config jsonb not null, version integer not null default 1,
  enabled boolean not null default false, enabled_at timestamptz, sender_version integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,organisation_id)
);
create index whatsapp_automation_rules_org on public.whatsapp_automation_rules(organisation_id,created_at desc);
create index whatsapp_automation_rules_creator on public.whatsapp_automation_rules(created_by);
create unique index whatsapp_automation_rules_active on public.whatsapp_automation_rules(organisation_id,(config->>'kind'),(config->>'trigger'),(config->>'stage')) where enabled;
create table public.whatsapp_automation_subjects (
  record_id uuid not null, kind text not null, organisation_id uuid not null references public.organisations(id),
  epoch uuid not null default gen_random_uuid(), snapshot jsonb not null, primary key(record_id,kind)
);
create index whatsapp_automation_subjects_org on public.whatsapp_automation_subjects(organisation_id);
create table public.whatsapp_automation_runs (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), rule_id uuid not null,
  rule_version integer not null, record_id uuid not null, kind text not null, epoch uuid not null, snapshot jsonb not null,
  phone text, trigger_at timestamptz not null, due_at timestamptz not null, expires_at timestamptz not null,
  status text not null default 'queued' check(status in ('queued','leased','sending','sent','task_created','skipped','failed','unknown')),
  anchor_message_id uuid references public.whatsapp_inbox_messages(id), reason text, lease_token uuid, lease_until timestamptz, message_id uuid, task_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(rule_id,organisation_id) references public.whatsapp_automation_rules(id,organisation_id),
  unique(rule_id,rule_version,record_id,epoch)
);
create index whatsapp_automation_runs_due on public.whatsapp_automation_runs(due_at,created_at) where status in ('queued','leased');
create index whatsapp_automation_runs_inflight on public.whatsapp_automation_runs(lease_until) where status='sending';
create index whatsapp_automation_runs_anchor on public.whatsapp_automation_runs(anchor_message_id) where anchor_message_id is not null;
create index whatsapp_automation_runs_org on public.whatsapp_automation_runs(organisation_id,created_at desc,id desc);
create index whatsapp_automation_runs_subject on public.whatsapp_automation_runs(organisation_id,kind,record_id) where status in ('queued','leased');
create index whatsapp_automation_runs_phone on public.whatsapp_automation_runs(organisation_id,phone) where status in ('queued','leased');
alter table public.whatsapp_inbox_messages add column automation_run_id uuid references public.whatsapp_automation_runs(id);
create index whatsapp_inbox_messages_automation on public.whatsapp_inbox_messages(automation_run_id) where automation_run_id is not null;

create function private.whatsapp_automation_snapshot(p_kind text,p_record uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; person jsonb;
begin
  if p_kind='recruitment' then
    select to_jsonb(r) into item from public.recruitment_leads r where id=p_record for share;
    if item is null then return null; end if;
    return jsonb_build_object('org',item->>'organisation_id','phone',public.whatsapp_crm_phone(item->>'phone'),'name',item->>'name','stage',lower(trim(item->>'status')),'owner',null,'inactive',item->>'status' in ('joined','closed_lost'));
  end if;
  select to_jsonb(l) into item from public.leads l where lead_id=p_record for share;
  if item is null or lower(coalesce(item->>'lead_domain','agency'))<>'agency' or lower(item->>'lead_category') not in ('buyer','seller','vendor') or p_kind<>(case when lower(item->>'lead_category')='vendor' then 'seller' else lower(item->>'lead_category') end) then return null; end if;
  select to_jsonb(c) into person from public.contacts c where contact_id=(item->>'contact_id')::uuid and organisation_id=(item->>'organisation_id')::uuid for share;
  return jsonb_build_object('org',item->>'organisation_id','phone',public.whatsapp_crm_phone(person->>'phone'),'name',trim(concat_ws(' ',person->>'first_name',person->>'last_name')),'stage',lower(trim(item->>'stage')),'owner',coalesce(item->>'assigned_user_id',item->>'assigned_agent_id'),'status',item->>'status',
    'inactive',lower(coalesce(item->>'status','')) in ('archived','deleted','closed_lost','closed_won','lost') or lower(coalesce(item->>'stage','')) in ('archived','deleted','closed_lost','closed_won','lost') or coalesce((item->>'is_archived')::boolean,false) or item->>'archived_at' is not null);
end; $$;

create function private.whatsapp_automation_subject(p_kind text,p_record uuid,p_org uuid) returns public.whatsapp_automation_subjects language plpgsql security invoker set search_path='' as $$
declare state jsonb; subject public.whatsapp_automation_subjects%rowtype;
begin
  -- Keep ordinary CRM writes quiet while the agency has no enabled rules.
  if not exists(select 1 from public.whatsapp_automation_rules where organisation_id=p_org and enabled and config->>'kind'=p_kind) then return null;end if;
  state:=private.whatsapp_automation_snapshot(p_kind,p_record);
  if state is null or (state->>'org')::uuid is distinct from p_org then return null; end if;
  insert into public.whatsapp_automation_subjects(record_id,kind,organisation_id,snapshot) values(p_record,p_kind,p_org,state)
    on conflict(record_id,kind) do update set snapshot=excluded.snapshot,epoch=case when whatsapp_automation_subjects.snapshot-'name'-'status' is distinct from excluded.snapshot-'name'-'status' then gen_random_uuid() else whatsapp_automation_subjects.epoch end returning * into subject;
  update public.whatsapp_automation_runs set status='skipped',reason='Lead stage, contact or assignment changed',updated_at=now()
    where organisation_id=p_org and record_id=p_record and kind=p_kind and epoch<>subject.epoch and status in ('queued','leased');
  return subject;
end; $$;

create function private.whatsapp_automation_enqueue(p_subject public.whatsapp_automation_subjects,p_trigger text,p_at timestamptz,p_anchor uuid default null) returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_subject.record_id is null or coalesce((p_subject.snapshot->>'inactive')::boolean,true) then return; end if;
  insert into public.whatsapp_automation_runs(organisation_id,rule_id,rule_version,record_id,kind,epoch,snapshot,phone,trigger_at,due_at,expires_at,anchor_message_id)
    select r.organisation_id,r.id,r.version,p_subject.record_id,p_subject.kind,p_subject.epoch,p_subject.snapshot,p_subject.snapshot->>'phone',p_at,
      p_at+make_interval(mins=>(r.config->>'delayMinutes')::integer),p_at+make_interval(mins=>(r.config->>'delayMinutes')::integer)+interval '7 days',p_anchor
    from public.whatsapp_automation_rules r where r.organisation_id=p_subject.organisation_id and r.enabled and r.enabled_at<=p_at
      and r.config->>'kind'=p_subject.kind and r.config->>'trigger'=p_trigger
      and (p_trigger<>'stage_changed' or r.config->>'stage'=p_subject.snapshot->>'stage')
    on conflict(rule_id,rule_version,record_id,epoch) do nothing;
end; $$;

-- Assignment only fills an empty new Buyer/Seller lead. Existing choices win.
create function private.whatsapp_automation_assign() returns trigger language plpgsql security definer set search_path='' as $$
declare agent uuid;
begin
  if new.assigned_user_id is not null or new.assigned_agent_id is not null or lower(coalesce(new.lead_domain,'agency'))<>'agency' or coalesce(to_jsonb(new)->'raw_enquiry_payload'->'arch9_meta'->>'ingestion_source','')='historical' then return new; end if;
  select (r.config->>'assignAgentId')::uuid into agent from public.whatsapp_automation_rules r join public.organisation_users m on m.organisation_id=r.organisation_id and m.user_id=(r.config->>'assignAgentId')::uuid and m.status='active' and m.role in ('owner','principal','director','admin','super_admin','developer','agency_admin','agent','senior_agent','manager','branch_manager','broker','assistant')
    where r.organisation_id=new.organisation_id and r.enabled and r.config->>'trigger'='new_lead'
      and r.config->>'kind'=case when lower(new.lead_category)='vendor' then 'seller' else lower(new.lead_category) end
      and new.created_at>=r.enabled_at and exists(select 1 from public.organisation_users a where a.organisation_id=r.organisation_id and a.user_id=r.created_by and a.status='active' and a.role in ('owner','principal','director','admin','super_admin','developer','agency_admin')) limit 1;
  if agent is not null then new.assigned_agent_id:=agent;new.assigned_user_id:=agent;new.ownership_status:='assigned';new.assigned_at:=now();
    update public.contacts set assigned_agent_id=agent where contact_id=new.contact_id and organisation_id=new.organisation_id and assigned_agent_id is null;
  end if;
  return new;
end; $$;
create trigger z_whatsapp_automation_assign before insert on public.leads for each row execute function private.whatsapp_automation_assign();

create function private.whatsapp_automation_crm() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; prior jsonb; kind text; target_record uuid; target_org uuid; subject public.whatsapp_automation_subjects%rowtype;
begin
  item:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;prior:=case when tg_op='UPDATE' then to_jsonb(old) else null end;
  kind:=case when tg_table_name='recruitment_leads' then 'recruitment' when lower(item->>'lead_category')='vendor' then 'seller' else lower(item->>'lead_category') end;
  target_record:=coalesce(item->>'lead_id',item->>'id')::uuid;target_org:=(item->>'organisation_id')::uuid;
  if kind is null or kind not in ('buyer','seller','recruitment') then update public.whatsapp_automation_runs j set status='skipped',reason='Lead category changed',updated_at=now() where j.record_id=target_record and status in ('queued','leased');return null;end if;
  if tg_op='DELETE' then
    update public.whatsapp_automation_runs set status='skipped',reason='Lead deleted',updated_at=now() where organisation_id=target_org and record_id=target_record and status in ('queued','leased');return null;
  end if;
  if tg_op='UPDATE' and (item->>'organisation_id' is distinct from prior->>'organisation_id' or tg_table_name='leads' and item->>'lead_category' is distinct from prior->>'lead_category') then
    update public.whatsapp_automation_runs j set status='skipped',reason='Lead category or organisation changed',updated_at=now() where j.record_id=target_record and status in ('queued','leased');
  end if;
  subject:=private.whatsapp_automation_subject(kind,target_record,target_org);
  if tg_op='INSERT' and coalesce(item->'raw_enquiry_payload'->'arch9_meta'->>'ingestion_source',item->'details_json'->'arch9_meta'->>'ingestion_source',item->'meta_source_json'->>'ingestion_source','')<>'historical' then
    perform private.whatsapp_automation_enqueue(subject,'new_lead',coalesce((item->>'created_at')::timestamptz,now()));
  elsif tg_op='UPDATE' and (case when kind='recruitment' then item->>'status' else item->>'stage' end) is distinct from (case when kind='recruitment' then prior->>'status' else prior->>'stage' end) then
    perform private.whatsapp_automation_enqueue(subject,'stage_changed',now());
  end if;
  return null;
end; $$;
create trigger whatsapp_automation_crm after insert or update or delete on public.leads for each row execute function private.whatsapp_automation_crm();
create trigger whatsapp_automation_crm after insert or update or delete on public.recruitment_leads for each row execute function private.whatsapp_automation_crm();

create function private.whatsapp_automation_contact() returns trigger language plpgsql security definer set search_path='' as $$
declare l record;
begin
  if new.phone is distinct from old.phone or new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name then
    for l in select lead_id,case when lower(lead_category)='vendor' then 'seller' else lower(lead_category) end kind from public.leads where contact_id=new.contact_id and organisation_id=new.organisation_id and lower(lead_category) in ('buyer','seller','vendor') loop
      perform private.whatsapp_automation_subject(l.kind,l.lead_id,new.organisation_id);
    end loop;
  end if;
  return null;
end; $$;
create trigger whatsapp_automation_contact after update on public.contacts for each row execute function private.whatsapp_automation_contact();

create function private.whatsapp_automation_message() returns trigger language plpgsql security definer set search_path='' as $$
declare thread public.whatsapp_inbox_conversations%rowtype; linked public.whatsapp_inbox_crm_links%rowtype; subject public.whatsapp_automation_subjects%rowtype; target_kind text;
begin
  if new.automation_run_id is not null and new.delivery_status in ('sent','delivered','read','failed') then
    update public.whatsapp_automation_runs set status=case when new.delivery_status='failed' then 'failed' else 'sent' end,reason=case when new.delivery_status='failed' then 'Meta reported delivery failure' else 'Submitted to Meta; delivery status is in the inbox' end,updated_at=now() where id=new.automation_run_id and organisation_id=new.organisation_id and status in ('sending','unknown','sent');
  end if;
  if new.automation_run_id is not null and new.delivery_status in ('sent','delivered','read') then
    update public.whatsapp_inbox_conversations set last_message_at=new.event_at,last_message_preview=left(new.body_text,240),updated_at=now() where id=new.conversation_id and organisation_id=new.organisation_id and coalesce(last_message_at,'-infinity')<=new.event_at;
  end if;
  select * into thread from public.whatsapp_inbox_conversations where id=new.conversation_id and organisation_id=new.organisation_id;
  if new.direction='inbound' and new.live_received and new.message_origin<>'history' then
    update public.whatsapp_automation_runs set status='skipped',reason='Customer replied',updated_at=now() where organisation_id=new.organisation_id and phone=thread.contact_phone and trigger_at<=new.event_at and status in ('queued','leased');
  elsif new.direction='outbound' and new.delivery_status in ('sent','delivered','read') and new.message_origin<>'history' and new.revoked_at is null
    and (tg_op='INSERT' or old.delivery_status not in ('sent','delivered','read')) then
    if new.automation_run_id is not null and exists(select 1 from public.whatsapp_automation_runs j join public.whatsapp_automation_rules r on r.id=j.rule_id where j.id=new.automation_run_id and r.config->>'trigger'='no_response') then return null; end if;
    select * into linked from public.whatsapp_inbox_crm_links where conversation_id=thread.id and organisation_id=new.organisation_id;
    if linked.lead_id is null and linked.recruitment_lead_id is null then return null; end if;
    if linked.recruitment_lead_id is not null then target_kind:='recruitment';else select case when lower(lead_category)='vendor' then 'seller' else lower(lead_category) end into target_kind from public.leads where lead_id=linked.lead_id and organisation_id=new.organisation_id;end if;
    subject:=private.whatsapp_automation_subject(target_kind,coalesce(linked.lead_id,linked.recruitment_lead_id),new.organisation_id);
    if subject.snapshot->>'phone'=thread.contact_phone then perform private.whatsapp_automation_enqueue(subject,'no_response',new.event_at,new.id); end if;
  end if;
  return null;
end; $$;
create trigger whatsapp_automation_message after insert or update on public.whatsapp_inbox_messages for each row execute function private.whatsapp_automation_message();

create function private.whatsapp_automation_optout() returns trigger language plpgsql security definer set search_path='' as $$
declare target_phone text;
begin
  if tg_table_name='whatsapp_inbox_permissions' then
    if new.status<>'opted_out' then return null; end if;
    select c.contact_phone into target_phone from public.whatsapp_inbox_conversations c where c.id=new.conversation_id and c.organisation_id=new.organisation_id;
  else
    if new.consent_status<>'opted_out' then return null; end if;target_phone:=new.phone;
  end if;
  update public.whatsapp_automation_runs j set status='skipped',reason='Customer opted out',updated_at=now() where j.organisation_id=new.organisation_id and j.phone=target_phone and j.status in ('queued','leased');
  return null;
end; $$;
create trigger whatsapp_automation_optout after insert or update on public.whatsapp_inbox_permissions for each row execute function private.whatsapp_automation_optout();
create trigger whatsapp_automation_optout after insert or update on public.whatsapp_marketing_contacts for each row execute function private.whatsapp_automation_optout();

create function private.whatsapp_automation_conversation() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.assigned_user_id is distinct from old.assigned_user_id or new.status='closed' and old.status<>'closed' then
    update public.whatsapp_automation_runs set status='skipped',reason='Conversation assignment or status changed',updated_at=now() where organisation_id=new.organisation_id and phone=new.contact_phone and status in ('queued','leased');
  end if;
  return null;
end; $$;
create trigger whatsapp_automation_conversation after update on public.whatsapp_inbox_conversations for each row execute function private.whatsapp_automation_conversation();
revoke all on function private.whatsapp_automation_conversation() from public,anon,authenticated;

create function public.whatsapp_automation_rules_request(p_org uuid,p_actor uuid,p_action text,p_id uuid default null,p_version integer default null,p_config jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare rule public.whatsapp_automation_rules%rowtype; sender public.organisation_communication_channels%rowtype; items jsonb; recruitment_admin boolean;
begin
  recruitment_admin:=exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=p_actor and status='active' and role in ('principal','admin','super_admin'));
  if not public.whatsapp_staff_is_admin(p_org,p_actor) then raise exception 'Agency management must manage WhatsApp automations'; end if;
  if p_action='list' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]') into items from public.whatsapp_automation_rules r where organisation_id=p_org and (recruitment_admin or config->>'kind'<>'recruitment');
    return jsonb_build_object('rules',items);
  elsif p_action='runs' then
    select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at desc,j.id desc),'[]') into items from (select id,rule_id,kind,record_id,snapshot->>'name' contact_name,status,reason,due_at,created_at,updated_at,message_id,task_id from public.whatsapp_automation_runs where organisation_id=p_org and (recruitment_admin or kind<>'recruitment') and (p_id is null or rule_id=p_id) order by created_at desc,id desc limit 100) j;
    return jsonb_build_object('runs',items);
  end if;
  if p_id is not null then
    select * into rule from public.whatsapp_automation_rules where id=p_id and organisation_id=p_org for update;
    if rule.id is null or rule.version is distinct from p_version then raise exception 'This rule changed. Refresh before saving'; end if;
  end if;
  if (p_action='save' and p_config->>'kind'='recruitment' or rule.config->>'kind'='recruitment') and not recruitment_admin then raise exception 'Recruitment management access required';end if;
  if p_action='save' then
    if p_config->>'kind' not in ('buyer','seller','recruitment') or p_config->>'trigger' not in ('new_lead','no_response','stage_changed') or p_config->>'action' not in ('message','task') or length(trim(p_config->>'name')) not between 1 and 100 then raise exception 'Invalid automation rule'; end if;
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_config->>'timezone') or jsonb_array_length(p_config->'days') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(p_config->'days') d where d::integer not between 1 and 7)
      or (p_config->>'startMinute')::integer not between 0 and 1439 or (p_config->>'endMinute')::integer not between 1 and 1440 or (p_config->>'startMinute')::integer>=(p_config->>'endMinute')::integer or (p_config->>'delayMinutes')::integer not between 0 and 10080 or p_config->>'trigger'='no_response' and (p_config->>'delayMinutes')::integer<1 then raise exception 'Invalid automation schedule'; end if;
    if p_config->>'trigger'='stage_changed' and nullif(p_config->>'stage','') is null then raise exception 'Choose a trigger stage'; end if;
    if p_config->>'assignAgentId' is not null then
      if p_config->>'kind'='recruitment' or p_config->>'trigger'<>'new_lead' then raise exception 'Only new Buyer/Seller leads can be assigned'; end if;
      perform public.whatsapp_staff_is_admin(p_org,(p_config->>'assignAgentId')::uuid);
    end if;
    if p_config->>'action'='message' then
      select * into sender from public.organisation_communication_channels where id=(p_config->>'senderId')::uuid and organisation_id=p_org and provider='meta' and channel_type='whatsapp' and connection_status='connected' for share;
      if sender.id is null then raise exception 'Choose a connected WhatsApp number'; end if;
      if p_config->>'kind'='recruitment' and sender.owner_user_id is not null then raise exception 'Recruitment messages require an agency number'; end if;
      if p_config->'template'->>'status'<>'APPROVED' then raise exception 'Choose an approved Meta template'; end if;
    elsif length(trim(p_config->>'taskTitle')) not between 1 and 200 then raise exception 'Write a task title'; end if;
    if rule.id is null then
      insert into public.whatsapp_automation_rules(organisation_id,created_by,config,sender_version) values(p_org,p_actor,p_config,sender.ownership_version) returning * into rule;
    else
      update public.whatsapp_automation_rules set config=p_config,created_by=p_actor,sender_version=sender.ownership_version,enabled=false,enabled_at=null,version=version+1,updated_at=now() where id=rule.id returning * into rule;
    end if;
  elsif p_action in ('enable','disable') and rule.id is not null then
    if p_action='enable' and rule.enabled then return jsonb_build_object('rule',to_jsonb(rule)); end if;
    if p_action='enable' and exists(select 1 from public.whatsapp_automation_rules r where r.organisation_id=p_org and r.enabled and r.id<>rule.id and (r.config->>'kind',r.config->>'trigger',r.config->>'stage')=(rule.config->>'kind',rule.config->>'trigger',rule.config->>'stage')) then raise exception 'Disable the existing rule for this lead type and trigger first'; end if;
    update public.whatsapp_automation_rules set created_by=p_actor,enabled=p_action='enable',enabled_at=case when p_action='enable' then now() else null end,version=version+1,updated_at=now() where id=rule.id returning * into rule;
  else raise exception 'Unknown automation action'; end if;
  update public.whatsapp_automation_runs set status='skipped',reason='Rule edited or switched off',updated_at=now() where rule_id=rule.id and status in ('queued','leased');
  return jsonb_build_object('rule',to_jsonb(rule));
end; $$;

create function public.whatsapp_automation_next() returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.whatsapp_automation_runs%rowtype;
begin
  -- An expired provider attempt is uncertain, never eligible for replay.
  with expired as (update public.whatsapp_automation_runs set status='unknown',reason='Delivery result unconfirmed; automatic resend blocked',updated_at=now() where status='sending' and lease_until<now() returning message_id)
    update public.whatsapp_inbox_messages set delivery_status='unknown',error_message='Delivery result unconfirmed; automatic resend blocked' where id in (select message_id from expired) and delivery_status='sending';
  select * into job from public.whatsapp_automation_runs where (status='queued' or status='leased' and lease_until<now()) and due_at<=now() order by due_at,created_at for update skip locked limit 1;
  if job.id is null then return null; end if;
  update public.whatsapp_automation_runs set status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now() where id=job.id returning * into job;
  return to_jsonb(job);
end; $$;

create function private.whatsapp_automation_time(p_config jsonb,p_at timestamptz) returns timestamptz language plpgsql stable security invoker set search_path='' as $$
declare local_day date; d date; starts timestamptz; ends timestamptz; offset_day integer;
begin
  local_day:=(p_at at time zone (p_config->>'timezone'))::date;
  for offset_day in 0..7 loop
    d:=local_day+offset_day;
    if p_config->'days' @> to_jsonb(array[extract(isodow from d)::integer]) then
      starts:=(d::timestamp+make_interval(mins=>(p_config->>'startMinute')::integer)) at time zone (p_config->>'timezone');
      ends:=(d::timestamp+make_interval(mins=>(p_config->>'endMinute')::integer)) at time zone (p_config->>'timezone');
      if p_at<ends then return greatest(p_at,starts); end if;
    end if;
  end loop;
  raise exception 'Invalid sending window';
end; $$;

-- Preparation is repeatable until the final, atomic message claim. Nothing after
-- that claim can ever requeue a send, even if the provider response is lost.
create function public.whatsapp_automation_prepare(p_id uuid,p_token uuid,p_dispatch boolean default false,p_body text default '',p_template jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.whatsapp_automation_runs%rowtype; r public.whatsapp_automation_rules%rowtype; state jsonb; subject public.whatsapp_automation_subjects%rowtype;
  sender public.organisation_communication_channels%rowtype; thread public.whatsapp_inbox_conversations%rowtype; permission public.whatsapp_inbox_permissions%rowtype;
  linked public.whatsapp_inbox_crm_links%rowtype; owner uuid; stop_reason text; next_time timestamptz; receipt jsonb; task uuid; optout timestamptz;
begin
  select * into j from public.whatsapp_automation_runs where id=p_id for update;
  if j.id is null or j.status<>'leased' or j.lease_token is distinct from p_token or j.lease_until<=now() then return jsonb_build_object('ready',false); end if;
  select * into r from public.whatsapp_automation_rules where id=j.rule_id and organisation_id=j.organisation_id for share;
  if not r.enabled or r.version<>j.rule_version then stop_reason:='Rule edited or switched off';
  elsif j.expires_at<=now() then stop_reason:='Action expired before delivery';
  else
    begin if not public.whatsapp_staff_is_admin(j.organisation_id,r.created_by) then stop_reason:='Rule owner no longer has management access'; end if;
    exception when others then stop_reason:='Rule owner no longer has management access'; end;
  end if;
  if stop_reason is null and j.kind='recruitment' and not exists(select 1 from public.organisation_users where organisation_id=j.organisation_id and user_id=r.created_by and status='active' and role in ('principal','admin','super_admin')) then stop_reason:='Recruitment management access changed';end if;
  if stop_reason is null then
    state:=private.whatsapp_automation_snapshot(j.kind,j.record_id);
    select * into subject from public.whatsapp_automation_subjects where record_id=j.record_id and kind=j.kind for share;
    if state is null or state is distinct from j.snapshot or subject.epoch is distinct from j.epoch or coalesce((state->>'inactive')::boolean,true) then stop_reason:='Lead stage, contact or assignment changed'; end if;
  end if;
  if stop_reason is null then
    owner:=coalesce((state->>'owner')::uuid,r.created_by);
    begin perform public.whatsapp_staff_is_admin(j.organisation_id,owner);exception when others then stop_reason:='Assigned agent is no longer active';end;
    if exists(select 1 from public.whatsapp_inbox_messages m join public.whatsapp_inbox_conversations c on c.id=m.conversation_id and c.organisation_id=m.organisation_id where c.organisation_id=j.organisation_id and c.contact_phone=j.phone and m.direction='inbound' and m.live_received and m.message_origin<>'history' and m.event_at>=j.trigger_at) then stop_reason:='Customer replied'; end if;
  end if;
  if stop_reason is null and r.config->>'trigger'='no_response' and not exists(select 1 from public.whatsapp_inbox_messages where id=j.anchor_message_id and organisation_id=j.organisation_id and direction='outbound' and delivery_status in ('sent','delivered','read') and revoked_at is null) then stop_reason:='Original message failed or was removed';end if;
  if stop_reason is null then
    next_time:=private.whatsapp_automation_time(r.config,now());
    if next_time>now() then update public.whatsapp_automation_runs set status='queued',due_at=next_time,lease_token=null,lease_until=null,reason='Waiting for sending hours',updated_at=now() where id=j.id;return jsonb_build_object('ready',false); end if;
  end if;
  if stop_reason is null and r.config->>'action'='message' then
    select * into sender from public.organisation_communication_channels where id=(r.config->>'senderId')::uuid and organisation_id=j.organisation_id for share;
    if sender.id is null or sender.connection_status<>'connected' or sender.ownership_version is distinct from r.sender_version or sender.provider<>'meta' or sender.channel_type<>'whatsapp' then stop_reason:='Sender disconnected or ownership changed';
    elsif sender.owner_user_id is not null and sender.owner_user_id is distinct from (state->>'owner')::uuid then stop_reason:='Agent number does not belong to the lead agent';
    elsif j.phone is null then stop_reason:='Lead has no valid WhatsApp number'; end if;
    if stop_reason is null then
      -- A previous recorded agreement for this sender is required; no inferred consent or blank conversations.
      select * into thread from public.whatsapp_inbox_conversations where channel_id=sender.id and contact_phone=j.phone and organisation_id=j.organisation_id for update;
      if thread.assigned_user_id is not null and thread.assigned_user_id is distinct from (state->>'owner')::uuid or thread.status='closed' then stop_reason:='Conversation closed or assigned to another agent'; end if;
      select * into permission from public.whatsapp_inbox_permissions where conversation_id=thread.id and organisation_id=j.organisation_id for share;
      select max(coalesce(opted_out_at,updated_at)) into optout from public.whatsapp_marketing_contacts where organisation_id=j.organisation_id and phone=j.phone and consent_status='opted_out';
      if permission.status is distinct from 'opted_in' or permission.consent_at<=coalesce(optout,'-infinity') then stop_reason:='No current one-to-one WhatsApp permission for this sender'; end if;
      select * into linked from public.whatsapp_inbox_crm_links where conversation_id=thread.id and organisation_id=j.organisation_id for update;
      if linked.conversation_id is not null and (coalesce(linked.lead_id,linked.recruitment_lead_id) is distinct from j.record_id) then stop_reason:='Conversation is linked to another CRM record'; end if;
    end if;
  end if;
  if stop_reason is not null then update public.whatsapp_automation_runs set status='skipped',reason=stop_reason,updated_at=now() where id=j.id;return jsonb_build_object('ready',false); end if;
  if r.config->>'action'='task' then
    insert into public.tasks(organisation_id,lead_id,assigned_agent_id,created_by,title,description,due_date,status,priority,metadata)
      values(j.organisation_id,case when j.kind<>'recruitment' then j.record_id end,owner,r.created_by,r.config->>'taskTitle','Created by WhatsApp automation: '||(r.config->>'name')||' · '||coalesce(state->>'name','Lead')||' · '||case when j.kind='recruitment' then '/agency/recruitment/' else '/pipeline/leads/' end||j.record_id::text,(now() at time zone (r.config->>'timezone'))::date,'Pending','Medium',jsonb_build_object('whatsapp_automation_run_id',j.id,'recruitment_lead_id',case when j.kind='recruitment' then j.record_id end)) returning task_id into task;
    update public.whatsapp_automation_runs set status='task_created',task_id=task,reason='Task created',updated_at=now() where id=j.id;
    return jsonb_build_object('ready',false);
  end if;
  if not p_dispatch then return jsonb_build_object('ready',true,'rule',to_jsonb(r),'snapshot',state,'senderId',sender.id); end if;
  if p_template is distinct from r.config->'template' then raise exception 'The Meta template changed'; end if;
  if linked.conversation_id is null then
    insert into public.whatsapp_inbox_crm_links(conversation_id,organisation_id,lead_id,recruitment_lead_id,linked_by) values(thread.id,j.organisation_id,case when j.kind<>'recruitment' then j.record_id end,case when j.kind='recruitment' then j.record_id end,r.created_by);
    insert into public.whatsapp_inbox_crm_link_events(organisation_id,conversation_id,actor_user_id,lead_id,recruitment_lead_id,version) values(j.organisation_id,thread.id,r.created_by,case when j.kind<>'recruitment' then j.record_id end,case when j.kind='recruitment' then j.record_id end,1);
  end if;
  receipt:=public.whatsapp_inbox_claim(j.organisation_id,r.created_by,thread.id,j.id,jsonb_build_object('automationRule',r.id,'version',r.version),thread.assignment_version,sender.ownership_version,false,'template',p_body,'{}',null,jsonb_build_object('name',p_template->>'name','language',p_template->>'language','category',p_template->>'category'));
  if not (receipt->>'claimed')::boolean then return jsonb_build_object('ready',false); end if;
  update public.whatsapp_inbox_messages set automation_run_id=j.id where id=j.id;
  update public.whatsapp_automation_runs set status='sending',message_id=j.id,reason=null,lease_until=now()+interval '90 seconds',updated_at=now() where id=j.id;
  return jsonb_build_object('ready',true,'messageId',j.id,'senderId',sender.id);
end; $$;

create function public.whatsapp_automation_finish(p_id uuid,p_token uuid,p_status text,p_provider_id text default null) returns void language plpgsql security invoker set search_path='' as $$
declare j public.whatsapp_automation_runs%rowtype; ch public.organisation_communication_channels%rowtype;
begin
  select * into j from public.whatsapp_automation_runs where id=p_id and lease_token=p_token and status in ('leased','sending','unknown') for update;
  if j.id is null then return; end if;
  if p_status not in ('sent','failed','unknown') then raise exception 'Invalid delivery result'; end if;
  if j.status='leased' then
    update public.whatsapp_automation_runs set status='failed',reason='Action could not be prepared; check sender, template and rule settings',updated_at=now() where id=j.id;return;
  end if;
  if p_status='sent' and nullif(p_provider_id,'') is not null then
    select c.* into ch from public.organisation_communication_channels c join public.whatsapp_inbox_messages m on m.channel_id=c.id and m.organisation_id=c.organisation_id where m.id=j.message_id;
    perform public.whatsapp_inbox_status(ch.phone_number_id,ch.waba_id,p_provider_id,'arch9-inbox:'||j.message_id,'sent',now(),null);
  else
    update public.whatsapp_inbox_messages set delivery_status=p_status,error_message=case when p_status='failed' then 'Meta rejected this automatic message' else 'Delivery result unconfirmed; automatic resend blocked' end where id=j.message_id and delivery_status='sending';
  end if;
  update public.whatsapp_automation_runs set status=p_status,reason=case when p_status='sent' then 'Submitted to Meta; delivery status is in the inbox' when p_status='failed' then 'Meta rejected this message' else 'Delivery result unconfirmed; automatic resend blocked' end,updated_at=now() where id=j.id;
end; $$;

-- Recruitment follow-up tasks retain the recruitment management boundary.
create policy whatsapp_automation_recruitment_task_scope on public.tasks as restrictive for all to authenticated
using (metadata->>'recruitment_lead_id' is null or exists(select 1 from public.organisation_users m where m.organisation_id=tasks.organisation_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('principal','admin','super_admin')))
with check (metadata->>'recruitment_lead_id' is null or exists(select 1 from public.organisation_users m where m.organisation_id=tasks.organisation_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('principal','admin','super_admin')));

alter table public.whatsapp_automation_rules enable row level security;
alter table public.whatsapp_automation_subjects enable row level security;
alter table public.whatsapp_automation_runs enable row level security;
revoke all on public.whatsapp_automation_rules,public.whatsapp_automation_subjects,public.whatsapp_automation_runs from public,anon,authenticated;
grant all on public.whatsapp_automation_rules,public.whatsapp_automation_subjects,public.whatsapp_automation_runs to service_role;
grant select,update on public.leads,public.contacts,public.recruitment_leads to service_role;
grant insert,select on public.tasks to service_role;
revoke all on function public.whatsapp_automation_rules_request(uuid,uuid,text,uuid,integer,jsonb),public.whatsapp_automation_next(),public.whatsapp_automation_prepare(uuid,uuid,boolean,text,jsonb),public.whatsapp_automation_finish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_automation_rules_request(uuid,uuid,text,uuid,integer,jsonb),public.whatsapp_automation_next(),public.whatsapp_automation_prepare(uuid,uuid,boolean,text,jsonb),public.whatsapp_automation_finish(uuid,uuid,text,text) to service_role;
revoke all on function private.whatsapp_automation_snapshot(text,uuid),private.whatsapp_automation_subject(text,uuid,uuid),private.whatsapp_automation_enqueue(public.whatsapp_automation_subjects,text,timestamptz,uuid),private.whatsapp_automation_assign(),private.whatsapp_automation_crm(),private.whatsapp_automation_contact(),private.whatsapp_automation_message(),private.whatsapp_automation_optout(),private.whatsapp_automation_time(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function private.whatsapp_automation_snapshot(text,uuid),private.whatsapp_automation_subject(text,uuid,uuid),private.whatsapp_automation_time(jsonb,timestamptz) to service_role;

create function private.run_whatsapp_automation_worker() returns jsonb language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text; headers jsonb; request_id bigint;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
  if not exists(select 1 from public.whatsapp_automation_runs where status in ('queued','leased','sending') and due_at<=now()) then return jsonb_build_object('scheduled',false); end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
  if nullif(trim(project_url),'') is null or nullif(trim(service_key),'') is null then return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing'); end if;
  headers:=jsonb_build_object('Content-Type','application/json','apikey',service_key);
  if left(service_key,10)<>'sb_secret_' then headers:=headers||jsonb_build_object('Authorization','Bearer '||service_key); end if;
  select net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/whatsapp-automation-worker',headers:=headers,body:='{}'::jsonb,timeout_milliseconds:=90000) into request_id;
  return jsonb_build_object('scheduled',true,'request_id',request_id);
end; $$;
revoke all on function private.run_whatsapp_automation_worker() from public,anon,authenticated;
grant execute on function private.run_whatsapp_automation_worker() to service_role;
do $$ begin
  if to_regclass('cron.job') is not null then perform cron.schedule('whatsapp-automation-worker','* * * * *','select private.run_whatsapp_automation_worker();');
  else raise notice 'Enable pg_cron and pg_net, then schedule private.run_whatsapp_automation_worker() every minute.';end if;
end; $$;
commit;
