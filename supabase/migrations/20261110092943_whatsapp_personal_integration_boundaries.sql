begin;

-- Secondary readers and background company work must respect personal numbers.

create or replace function public.whatsapp_crm_link_request(
  p_org uuid,p_actor uuid,p_action text,p_conversation uuid default null,p_kind text default null,
  p_record uuid default null,p_version integer default null,p_assignment_version integer default null,p_record_stamp text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare is_admin boolean; thread public.whatsapp_inbox_conversations%rowtype;
  previous public.whatsapp_inbox_crm_links%rowtype; saved public.whatsapp_inbox_crm_links%rowtype;
  phone text; target_org uuid; target_kind text; items jsonb; target_stamp text; member_stamp text;
begin
  is_admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  select string_agg(m.xmin::text,',' order by m.xmin::text) into member_stamp from public.organisation_users m where m.organisation_id=p_org and m.user_id=p_actor and m.status='active';
  if p_action in ('link','record_threads') then
    if p_kind='recruitment' then
      select r.organisation_id,public.whatsapp_crm_phone(r.phone),'recruitment',r.xmin::text||':'||member_stamp into target_org,phone,target_kind,target_stamp from public.recruitment_leads r where r.id=p_record for share;
    elsif p_kind in ('buyer','seller') then
      select l.organisation_id,public.whatsapp_crm_phone(c.phone),case when lower(l.lead_category) in ('seller','vendor') then 'seller' else 'buyer' end,
        l.xmin::text||':'||c.xmin::text||':'||member_stamp
        into target_org,phone,target_kind,target_stamp from public.leads l join public.contacts c on c.contact_id=l.contact_id and c.organisation_id=l.organisation_id
        where l.lead_id=p_record and lower(l.lead_category) in ('buyer','seller','vendor') for share of l,c;
    end if;
    if target_org is distinct from p_org or target_kind is distinct from p_kind then raise exception 'CRM record is unavailable' using errcode='42501'; end if;
  end if;
  if p_action='record_threads' then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.last_message_at desc,item.id),'[]'::jsonb) into items from (
      select c.id,c.contact_name,c.contact_phone,c.status,c.last_message_at,ch.display_phone_number,
        (case when p_kind='recruitment' then linked.recruitment_lead_id=p_record else linked.lead_id=p_record end) is true as linked
      from public.whatsapp_inbox_conversations c
      join public.organisation_communication_channels ch on ch.id=c.channel_id and ch.organisation_id=p_org
      left join public.whatsapp_inbox_crm_links linked on linked.conversation_id=c.id and linked.organisation_id=p_org
      where c.organisation_id=p_org and (is_admin or c.assigned_user_id=p_actor) and (ch.owner_user_id is null or ch.owner_user_id=p_actor)
        and (c.contact_phone=phone or case when p_kind='recruitment' then linked.recruitment_lead_id=p_record else linked.lead_id=p_record end)
      order by c.last_message_at desc,c.id limit 100
    ) item;
    return jsonb_build_object('conversations',items);
  end if;
  -- Locks and checks current inbox access again at the point of mutation.
  perform public.whatsapp_inbox_request(p_org,p_actor,'access',p_conversation);
  select * into thread from public.whatsapp_inbox_conversations where id=p_conversation and organisation_id=p_org for update;
  select * into previous from public.whatsapp_inbox_crm_links where conversation_id=thread.id and organisation_id=p_org;
  if p_action='context' then
    select coalesce(jsonb_agg(to_jsonb(item)),'[]'::jsonb) into items from (
      select distinct campaign.id,campaign.name from public.whatsapp_inbox_messages m
      join public.whatsapp_campaign_recipients recipient on (recipient.id=m.campaign_recipient_id or recipient.provider_message_id=m.reply_to_provider_message_id)
        and recipient.organisation_id=p_org and recipient.phone=thread.contact_phone
      join public.whatsapp_campaigns campaign on campaign.id=recipient.campaign_id and campaign.organisation_id=p_org and campaign.sender_id=m.channel_id
      where m.conversation_id=thread.id and m.organisation_id=p_org limit 20
    ) item;
    return jsonb_build_object('version',coalesce(previous.version,0),'leadId',previous.lead_id,'recruitmentLeadId',previous.recruitment_lead_id,'campaigns',items);
  end if;
  if p_action not in ('link','unlink') then raise exception 'Unknown CRM link action'; end if;
  if p_assignment_version is distinct from thread.assignment_version then raise exception 'Conversation assignment changed. Refresh before linking' using errcode='40001'; end if;
  if p_version is distinct from coalesce(previous.version,0) then raise exception 'CRM link changed. Refresh before saving' using errcode='40001'; end if;
  if p_action='link' and p_record_stamp is distinct from target_stamp then raise exception 'CRM record or permissions changed. Refresh before linking' using errcode='40001'; end if;
  insert into public.whatsapp_inbox_crm_links(conversation_id,organisation_id,lead_id,recruitment_lead_id,version,linked_by)
    values(thread.id,p_org,case when p_action='link' and p_kind in ('buyer','seller') then p_record end,
      case when p_action='link' and p_kind='recruitment' then p_record end,coalesce(previous.version,0)+1,p_actor)
    on conflict(conversation_id) do update set lead_id=excluded.lead_id,recruitment_lead_id=excluded.recruitment_lead_id,
      version=excluded.version,linked_by=excluded.linked_by,linked_at=now() returning * into saved;
  insert into public.whatsapp_inbox_crm_link_events(organisation_id,conversation_id,actor_user_id,previous_lead_id,previous_recruitment_lead_id,lead_id,recruitment_lead_id,version)
    values(p_org,thread.id,p_actor,previous.lead_id,previous.recruitment_lead_id,saved.lead_id,saved.recruitment_lead_id,saved.version);
  return jsonb_build_object('saved',true,'version',saved.version);
end; $$;

create or replace function public.whatsapp_manual_chat_import(p_org uuid,p_actor uuid,p_sender uuid,p_contact text,p_name text,p_fingerprint text,p_options jsonb,p_messages jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sender public.organisation_communication_channels%rowtype; receipt public.whatsapp_manual_chat_imports%rowtype;
  row jsonb; stamp timestamptz; thread_id uuid; message_id uuid; native_count integer; imported integer:=0; duplicates integer:=0; admin boolean;
begin
  admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
  select * into sender from public.organisation_communication_channels where id=p_sender and organisation_id=p_org and provider='meta' and channel_type='whatsapp' and connection_status='connected' and onboarding_mode='coexistence' for share;
  if sender.id is not null and ((sender.owner_user_id is not null and sender.owner_user_id<>p_actor) or (sender.owner_user_id is null and not admin)) then raise exception 'Only the number owner can import personal chat history' using errcode='42501';end if;
  if sender.id is null then raise exception 'Choose a connected WhatsApp Business app number in this organisation'; end if;
  if p_contact is null or p_contact !~ '^[1-9][0-9]{6,14}$' or p_contact=regexp_replace(coalesce(sender.display_phone_number,''),'[^0-9]','','g') then raise exception 'Choose the customer’s international phone number'; end if;
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_options) is distinct from 'object' or jsonb_typeof(p_messages) is distinct from 'array' then raise exception 'Invalid chat export'; end if;
  if jsonb_array_length(p_messages) not between 1 and 500 then raise exception 'Import between 1 and 500 messages'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wa-inbox:'||sender.id::text||':'||p_contact,0));
  select * into receipt from public.whatsapp_manual_chat_imports where channel_id=p_sender and contact_phone=p_contact and source_fingerprint=p_fingerprint;
  if receipt.id is not null then
    if receipt.options<>p_options then raise exception 'This file was already imported with different date or participant settings'; end if;
    select id into thread_id from public.whatsapp_inbox_conversations where channel_id=p_sender and contact_phone=p_contact;
    return jsonb_build_object('imported',0,'duplicates',jsonb_array_length(p_messages),'conversationId',thread_id,'importId',receipt.id);
  end if;
  insert into public.whatsapp_manual_chat_imports(organisation_id,channel_id,actor_id,contact_phone,source_fingerprint,options) values(p_org,p_sender,p_actor,p_contact,p_fingerprint,p_options) returning * into receipt;
  for row in select value from jsonb_array_elements(p_messages) loop
    stamp:=(row->>'at')::timestamptz;
    if stamp is null or stamp<'2000-01-01'::timestamptz or stamp>now()+interval '1 minute' or coalesce(row->>'direction','') not in ('inbound','outbound') or coalesce(row->>'precision','') not in ('minute','second') or coalesce(row->>'key','') !~ '^[a-f0-9]{64}$' or length(coalesce(row->>'body','')) not between 1 and 16000 or coalesce((row->>'occurrence')::integer,0) not between 1 and 500 then raise exception 'Invalid exported message'; end if;
    if exists(select 1 from public.whatsapp_inbox_messages where channel_id=p_sender and provider_message_id='arch9-export:'||(row->>'key')) then duplicates:=duplicates+1; continue; end if;
    select count(*) into native_count from public.whatsapp_inbox_messages m join public.whatsapp_inbox_conversations c on c.id=m.conversation_id and c.organisation_id=m.organisation_id
      where m.channel_id=p_sender and c.contact_phone=p_contact and m.direction=row->>'direction' and m.body_text=row->>'body' and not(m.media_json ? 'manualImport')
      and m.event_at>=date_trunc(row->>'precision',stamp) and m.event_at<date_trunc(row->>'precision',stamp)+case when row->>'precision'='minute' then interval '1 minute' else interval '1 second' end;
    if native_count>=(row->>'occurrence')::integer then duplicates:=duplicates+1; continue; end if;
    message_id:=public.whatsapp_business_app_ingest(sender.phone_number_id,sender.waba_id,p_contact,'arch9-export:'||(row->>'key'),stamp,row->>'direction','text',row->>'body',jsonb_build_object('manualImport',jsonb_build_object('id',receipt.id,'precision',row->>'precision','occurrence',(row->>'occurrence')::integer)),left(p_name,160),'history','sent');
    if message_id is null then raise exception 'The WhatsApp connection changed. Refresh and try again'; end if;
    imported:=imported+1;
  end loop;
  select id into thread_id from public.whatsapp_inbox_conversations where channel_id=p_sender and contact_phone=p_contact;
  update public.whatsapp_manual_chat_imports set imported_count=imported,duplicate_count=duplicates where id=receipt.id;
  return jsonb_build_object('imported',imported,'duplicates',duplicates,'conversationId',thread_id,'importId',receipt.id);
end; $$;

create or replace function public.whatsapp_automation_rules_request(p_org uuid,p_actor uuid,p_action text,p_id uuid default null,p_version integer default null,p_config jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare rule public.whatsapp_automation_rules%rowtype; sender public.organisation_communication_channels%rowtype; items jsonb; recruitment_admin boolean;
begin
  recruitment_admin:=exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=p_actor and status='active' and role in ('principal','admin','super_admin'));
  if not public.whatsapp_staff_is_admin(p_org,p_actor) then raise exception 'Agency management must manage WhatsApp automations'; end if;
  if p_action='list' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]') into items from public.whatsapp_automation_rules r where organisation_id=p_org and not exists(select 1 from public.organisation_communication_channels personal_sender where personal_sender.id=nullif(config->>'senderId','')::uuid and personal_sender.owner_user_id is not null) and (recruitment_admin or config->>'kind'<>'recruitment');
    return jsonb_build_object('rules',items);
  elsif p_action='runs' then
    select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at desc,j.id desc),'[]') into items from (select id,rule_id,kind,record_id,snapshot->>'name' contact_name,status,reason,due_at,created_at,updated_at,message_id,task_id from public.whatsapp_automation_runs where organisation_id=p_org and not exists(select 1 from public.whatsapp_automation_rules hidden_rule join public.organisation_communication_channels personal_sender on personal_sender.id=nullif(hidden_rule.config->>'senderId','')::uuid where hidden_rule.id=rule_id and personal_sender.owner_user_id is not null) and not exists(select 1 from public.whatsapp_inbox_messages private_anchor join public.organisation_communication_channels personal_sender on personal_sender.id=private_anchor.channel_id where private_anchor.id=anchor_message_id and personal_sender.owner_user_id is not null) and (recruitment_admin or kind<>'recruitment') and (p_id is null or rule_id=p_id) order by created_at desc,id desc limit 100) j;
    return jsonb_build_object('runs',items);
  end if;
  if p_id is not null then
    select * into rule from public.whatsapp_automation_rules where id=p_id and organisation_id=p_org for update;
    if rule.id is null or rule.version is distinct from p_version then raise exception 'This rule changed. Refresh before saving'; end if;
  end if;
  if rule.id is not null and exists(select 1 from public.organisation_communication_channels personal_sender where personal_sender.id=nullif(rule.config->>'senderId','')::uuid and personal_sender.owner_user_id is not null) then raise exception 'Company automations require a shared organisation number';end if;
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
      if sender.owner_user_id is not null then raise exception 'Company automations require a shared organisation number';end if;
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

create or replace function public.whatsapp_automation_prepare(p_id uuid,p_token uuid,p_dispatch boolean default false,p_body text default '',p_template jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.whatsapp_automation_runs%rowtype; r public.whatsapp_automation_rules%rowtype; state jsonb; subject public.whatsapp_automation_subjects%rowtype;
  sender public.organisation_communication_channels%rowtype; thread public.whatsapp_inbox_conversations%rowtype; permission public.whatsapp_inbox_permissions%rowtype;
  linked public.whatsapp_inbox_crm_links%rowtype; owner uuid; stop_reason text; next_time timestamptz; receipt jsonb; task uuid; optout timestamptz;
begin
  select * into j from public.whatsapp_automation_runs where id=p_id for update;
  if j.id is null or j.status<>'leased' or j.lease_token is distinct from p_token or j.lease_until<=now() then return jsonb_build_object('ready',false); end if;
  select * into r from public.whatsapp_automation_rules where id=j.rule_id and organisation_id=j.organisation_id for share;
  if exists(select 1 from public.organisation_communication_channels personal_sender where personal_sender.id=nullif(r.config->>'senderId','')::uuid and personal_sender.owner_user_id is not null) or exists(select 1 from public.whatsapp_inbox_messages private_anchor join public.organisation_communication_channels personal_sender on personal_sender.id=private_anchor.channel_id where private_anchor.id=j.anchor_message_id and personal_sender.owner_user_id is not null) then
    update public.whatsapp_automation_runs set status='skipped',reason='Personal numbers are excluded from company automations',updated_at=now() where id=j.id;return jsonb_build_object('ready',false);
  end if;
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
    if exists(select 1 from public.whatsapp_inbox_messages m join public.whatsapp_inbox_conversations c on c.id=m.conversation_id and c.organisation_id=m.organisation_id where c.organisation_id=j.organisation_id and exists(select 1 from public.organisation_communication_channels visible_sender where visible_sender.id=c.channel_id and visible_sender.owner_user_id is null) and c.contact_phone=j.phone and m.direction='inbound' and m.live_received and m.message_origin<>'history' and m.event_at>=j.trigger_at) then stop_reason:='Customer replied'; end if;
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

create or replace function private.whatsapp_automation_message() returns trigger language plpgsql security definer set search_path='' as $$
declare thread public.whatsapp_inbox_conversations%rowtype; linked public.whatsapp_inbox_crm_links%rowtype; subject public.whatsapp_automation_subjects%rowtype; target_kind text;
begin
  if exists(select 1 from public.organisation_communication_channels personal_sender where personal_sender.id=new.channel_id and personal_sender.owner_user_id is not null) then return new;end if;
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

create or replace function private.whatsapp_automation_conversation() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.organisation_communication_channels personal_sender where personal_sender.id=new.channel_id and personal_sender.owner_user_id is not null) then return null;end if;
  if new.assigned_user_id is distinct from old.assigned_user_id or new.status='closed' and old.status<>'closed' then
    update public.whatsapp_automation_runs set status='skipped',reason='Conversation assignment or status changed',updated_at=now() where organisation_id=new.organisation_id and phone=new.contact_phone and status in ('queued','leased');
  end if;
  return null;
end; $$;

revoke all on function public.whatsapp_crm_link_request(uuid,uuid,text,uuid,text,uuid,integer,integer,text),
 public.whatsapp_manual_chat_import(uuid,uuid,uuid,text,text,text,jsonb,jsonb),
 public.whatsapp_automation_rules_request(uuid,uuid,text,uuid,integer,jsonb),
 public.whatsapp_automation_prepare(uuid,uuid,boolean,text,jsonb),
 private.whatsapp_automation_message(),private.whatsapp_automation_conversation() from public,anon,authenticated;
grant execute on function public.whatsapp_crm_link_request(uuid,uuid,text,uuid,text,uuid,integer,integer,text),
 public.whatsapp_manual_chat_import(uuid,uuid,uuid,text,text,text,jsonb,jsonb),
 public.whatsapp_automation_rules_request(uuid,uuid,text,uuid,integer,jsonb),
 public.whatsapp_automation_prepare(uuid,uuid,boolean,text,jsonb),
 private.whatsapp_automation_message(),private.whatsapp_automation_conversation() to service_role;

commit;
