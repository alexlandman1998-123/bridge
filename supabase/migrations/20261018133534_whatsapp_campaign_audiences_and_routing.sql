begin;

create table public.whatsapp_saved_audiences (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),name text not null check(length(trim(name)) between 1 and 100),
 filters jsonb not null,version integer not null default 1,created_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),archived_at timestamptz,
 unique(id,organisation_id)
);
create index whatsapp_saved_audiences_org on public.whatsapp_saved_audiences(organisation_id,updated_at desc);
create index whatsapp_saved_audiences_actor on public.whatsapp_saved_audiences(created_by);
create table public.whatsapp_campaign_audience_plans (
 campaign_id uuid primary key,organisation_id uuid not null,plan jsonb not null,request_json jsonb not null,saved_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 foreign key(organisation_id,campaign_id) references public.whatsapp_campaigns(organisation_id,id) on delete cascade
);
create index whatsapp_campaign_audience_plans_org on public.whatsapp_campaign_audience_plans(organisation_id);
create index whatsapp_campaign_audience_plans_actor on public.whatsapp_campaign_audience_plans(saved_by);
alter table public.whatsapp_campaign_recipients add column crm_route_snapshot jsonb not null default '{}';
create table public.whatsapp_campaign_reply_routes (
 message_id uuid primary key references public.whatsapp_inbox_messages(id) on delete cascade,organisation_id uuid not null references public.organisations(id),conversation_id uuid not null,
 campaign_id uuid not null,recipient_id uuid not null references public.whatsapp_campaign_recipients(id) on delete cascade,status text not null check(status in ('routed','needs_review','preserved')),
 reason text not null,created_at timestamptz not null default now(),foreign key(conversation_id,organisation_id) references public.whatsapp_inbox_conversations(id,organisation_id),
 foreign key(organisation_id,campaign_id) references public.whatsapp_campaigns(organisation_id,id)
);
create index whatsapp_campaign_reply_routes_org on public.whatsapp_campaign_reply_routes(organisation_id,created_at desc);
create index whatsapp_campaign_reply_routes_thread on public.whatsapp_campaign_reply_routes(conversation_id,created_at desc);
create index whatsapp_campaign_reply_routes_recipient on public.whatsapp_campaign_reply_routes(recipient_id);
create index whatsapp_campaign_reply_routes_campaign on public.whatsapp_campaign_reply_routes(campaign_id);
create index whatsapp_campaign_reply_context on public.whatsapp_inbox_messages(channel_id,reply_to_provider_message_id) where direction='inbound' and reply_to_provider_message_id is not null;

create function private.whatsapp_recruitment_manager(p_org uuid,p_actor uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=p_actor and status='active' and role in ('principal','admin','super_admin'));
$$;
create function private.whatsapp_audience_rows(p_org uuid,p_filters jsonb,p_record uuid default null) returns table(record_id uuid,kind text,phone text,name text,stage text,owner_id uuid,areas text[],contact_id uuid,eligible boolean,state jsonb)
language sql stable security invoker set search_path='' as $$
 with records as (
 select l.lead_id record_id,case when lower(l.lead_category)='vendor' then 'seller' else lower(l.lead_category) end kind,
 public.whatsapp_crm_phone(c.phone) phone,trim(concat_ws(' ',c.first_name,c.last_name)) name,lower(trim(to_jsonb(l)->>'stage')) stage,
 coalesce(l.assigned_user_id,l.assigned_agent_id) owner_id,
 array(select distinct lower(trim(a)) from unnest(
  array[nullif(to_jsonb(l)->>'area_interest',''),nullif(to_jsonb(c)->>'area','')]
  ||coalesce((select array_agg(a) from public.lead_requirements q cross join lateral unnest(coalesce(q.areas,'{}')||coalesce(q.suburbs,'{}')||array[q.city]) a where q.organisation_id=p_org and q.lead_id=l.lead_id and q.status='active'),'{}')
  ||coalesce((select array_agg(a) from public.private_listings p cross join lateral unnest(array[to_jsonb(p)->>'suburb',to_jsonb(p)->>'city']) a where p.organisation_id=p_org and (to_jsonb(p)->>'seller_lead_id'=l.lead_id::text or to_jsonb(p)->>'originating_crm_lead_id'=l.lead_id::text)),'{}')
 ) a where nullif(trim(a),'') is not null) areas,
 jsonb_build_object('org',l.organisation_id::text,'phone',public.whatsapp_crm_phone(c.phone),'name',trim(concat_ws(' ',c.first_name,c.last_name)),'stage',lower(trim(to_jsonb(l)->>'stage')),'owner',coalesce(l.assigned_user_id,l.assigned_agent_id)::text,'status',to_jsonb(l)->>'status','inactive',lower(coalesce(to_jsonb(l)->>'status','')) in ('archived','deleted','closed_lost','closed_won','lost') or lower(coalesce(to_jsonb(l)->>'stage','')) in ('archived','deleted','closed_lost','closed_won','lost') or coalesce((to_jsonb(l)->>'is_archived')::boolean,false) or to_jsonb(l)->>'archived_at' is not null) state
 from public.leads l join public.contacts c on c.contact_id=l.contact_id and c.organisation_id=l.organisation_id
 where p_filters->>'kind' in ('buyer','seller') and l.organisation_id=p_org and lower(coalesce(to_jsonb(l)->>'lead_domain','agency'))='agency' and lower(l.lead_category) in ('buyer','seller','vendor') and (p_record is null or l.lead_id=p_record)
 union all
 select r.id,'recruitment',public.whatsapp_crm_phone(r.phone),r.name,lower(trim(r.status)),null,array[lower(trim(r.area))],jsonb_build_object('org',r.organisation_id::text,'phone',public.whatsapp_crm_phone(r.phone),'name',r.name,'stage',lower(trim(r.status)),'owner',null,'inactive',r.status in ('joined','closed_lost'))
 from public.recruitment_leads r where p_filters->>'kind'='recruitment' and r.organisation_id=p_org and (p_record is null or r.id=p_record)
 ), matched as (
 select * from records r where r.kind=p_filters->>'kind'
 and (coalesce((p_filters->>'includeClosed')::boolean,false) or not coalesce((r.state->>'inactive')::boolean,true) and regexp_replace(coalesce(r.stage,''),'[ -]+','_','g') not in ('closed_won','closed_lost','joined','agent_activated','legacy_joined','lost','archived','deleted'))
 and (coalesce(jsonb_array_length(p_filters->'areas'),0)=0 or r.areas && array(select jsonb_array_elements_text(p_filters->'areas')))
 and (coalesce(jsonb_array_length(p_filters->'stages'),0)=0 or r.stage in (select jsonb_array_elements_text(p_filters->'stages')))
 and (p_filters->>'agentId' is null or r.owner_id=(p_filters->>'agentId')::uuid)
 )
 select r.record_id,r.kind,r.phone,r.name,r.stage,r.owner_id,r.areas,c.id,coalesce(c.consent_status='opted_in' and c.opted_out_at is null,false),r.state
 from matched r left join public.whatsapp_marketing_contacts c on c.organisation_id=p_org and c.phone=r.phone;
$$;

create function public.whatsapp_audiences_request(p_org uuid,p_actor uuid,p_action text,p_id uuid default null,p_version integer default null,p_config jsonb default null,p_limit integer default 500,p_search text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.whatsapp_saved_audiences%rowtype; f jsonb; items jsonb; total integer; permitted integer; phones integer; invalid integer; ambiguous integer;
begin
 if not public.whatsapp_staff_is_admin(p_org,p_actor) then raise exception 'Agency management must manage CRM campaign audiences';end if;
 if p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(s) order by updated_at desc),'[]') into items from public.whatsapp_saved_audiences s where organisation_id=p_org and archived_at is null and (filters->>'kind'<>'recruitment' or private.whatsapp_recruitment_manager(p_org,p_actor));return jsonb_build_object('audiences',items);
 end if;
 if p_id is not null then select * into a from public.whatsapp_saved_audiences where id=p_id and organisation_id=p_org for update;if a.id is null then raise exception 'Audience not found';end if;end if;
 f:=coalesce(p_config->'filters',a.filters);
 if f->>'kind'='recruitment' and not private.whatsapp_recruitment_manager(p_org,p_actor) then raise exception 'Recruitment management access required';end if;
 if p_action in ('save','preview') and (f->>'kind' not in ('buyer','seller','recruitment') or jsonb_typeof(f->'areas')<>'array' or jsonb_typeof(f->'stages')<>'array') then raise exception 'Choose a valid audience definition';end if;
 if p_action='save' then
  if a.id is null then insert into public.whatsapp_saved_audiences(organisation_id,name,filters,created_by) values(p_org,p_config->>'name',f,p_actor) returning * into a;
  else
   if a.version is distinct from p_version or a.archived_at is not null then raise exception 'Audience changed. Refresh before saving';end if;
   update public.whatsapp_saved_audiences set name=p_config->>'name',filters=f,version=version+1,updated_at=now() where id=a.id returning * into a;
  end if;return jsonb_build_object('audience',to_jsonb(a));
 elsif p_action='archive' then
  if a.id is null or a.version is distinct from p_version then raise exception 'Audience changed. Refresh before archiving';end if;
  update public.whatsapp_saved_audiences set archived_at=now(),version=version+1,updated_at=now() where id=a.id;return jsonb_build_object('archived',true);
 elsif p_action='preview' then
  with ranked as (select *,count(*) over(partition by phone) phone_matches from private.whatsapp_audience_rows(p_org,f)), matches as (select * from ranked where p_search='' or position(lower(p_search) in lower(name||' '||coalesce(phone,'')))>0)
  select count(*),count(*) filter(where eligible),count(distinct phone) filter(where eligible),count(*) filter(where phone is null),count(distinct phone) filter(where phone is not null and phone_matches>1)
  into total,permitted,phones,invalid,ambiguous from matches;
  select coalesce(jsonb_agg(to_jsonb(r) order by name,record_id),'[]') into items from (
   select * from (select *,count(*) over(partition by phone) phone_matches from private.whatsapp_audience_rows(p_org,f)) ranked where p_search='' or position(lower(p_search) in lower(name||' '||coalesce(phone,'')))>0 order by name,record_id limit greatest(1,least(p_limit,501))
  ) r;
  return jsonb_build_object('rows',items,'matched',total,'eligibleRecords',permitted,'eligiblePhones',phones,'invalidPhones',invalid,'ambiguousRecords',ambiguous,'hasMore',total>jsonb_array_length(items));
 elsif p_action='options' then
  select jsonb_build_object('areas',coalesce(jsonb_agg(distinct area) filter(where area is not null),'[]')) into items from private.whatsapp_audience_rows(p_org,jsonb_build_object('kind',coalesce(f->>'kind','buyer'),'areas','[]'::jsonb,'stages','[]'::jsonb,'includeClosed',false)) r cross join lateral unnest(r.areas) area;return items;
 end if;raise exception 'Unknown audience action';
end; $$;

create function private.whatsapp_plan_access(p_org uuid,p_campaign uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=(select auth.uid()) and status='active') then return false;end if;
 if exists(select 1 from public.whatsapp_campaign_audience_plans where organisation_id=p_org and campaign_id=p_campaign and plan->'filters'->>'kind'='recruitment') then return private.whatsapp_recruitment_manager(p_org,(select auth.uid()));end if;
 return true;
end; $$;
create policy whatsapp_campaign_recruitment_scope on public.whatsapp_campaigns as restrictive for select to authenticated using(private.whatsapp_plan_access(organisation_id,id));
create policy whatsapp_recipient_recruitment_scope on public.whatsapp_campaign_recipients as restrictive for select to authenticated using(private.whatsapp_plan_access(organisation_id,campaign_id));

create function private.whatsapp_target_reason(p_org uuid,p_target jsonb,p_plan jsonb,p_actor uuid) returns text language plpgsql security invoker set search_path='' as $$
declare a public.whatsapp_saved_audiences%rowtype; r record; admin boolean; current_state jsonb;
begin
 begin admin:=public.whatsapp_staff_is_admin(p_org,p_actor);exception when others then return 'Campaign manager is no longer active';end;
 if not admin then return 'Campaign manager no longer has management access';end if;
 if p_plan->'filters'->>'kind'='recruitment' and not private.whatsapp_recruitment_manager(p_org,p_actor) then return 'Recruitment management access changed';end if;
 if p_plan->>'mode'='agent' then
  begin perform public.whatsapp_staff_is_admin(p_org,(p_plan->>'agentId')::uuid);exception when others then return 'Reply agent is no longer active';end;
 end if;
 if p_plan->>'audienceId' is null then return null;end if;
 select * into a from public.whatsapp_saved_audiences where organisation_id=p_org and id=(p_plan->>'audienceId')::uuid for share;
 if a.id is null or a.archived_at is not null or a.version is distinct from (p_plan->>'version')::integer then return 'Saved audience changed or was archived; review recipients';end if;
 current_state:=private.whatsapp_automation_snapshot(p_target->>'kind',(p_target->>'recordId')::uuid);
 if current_state is null or current_state is distinct from p_target->'state' then return 'CRM phone, assignment or stage changed; review recipients';end if;
 perform 1 from public.lead_requirements where organisation_id=p_org and lead_id=(p_target->>'recordId')::uuid for share;
 perform 1 from public.private_listings where organisation_id=p_org and (to_jsonb(private_listings)->>'seller_lead_id'=p_target->>'recordId' or to_jsonb(private_listings)->>'originating_crm_lead_id'=p_target->>'recordId') for share;
 select * into r from private.whatsapp_audience_rows(p_org,a.filters,(p_target->>'recordId')::uuid) where kind=p_target->>'kind' and contact_id=(p_target->>'contactId')::uuid;
 if not found or not r.eligible then return 'CRM recipient, area, stage or campaign permission changed';end if;
 if r.state is distinct from p_target->'state' then return 'CRM phone, assignment or stage changed; review recipients';end if;
 return null;
end; $$;

create function public.whatsapp_campaign_plan_request(p_org uuid,p_actor uuid,p_action text,p_id uuid default null,p_version integer default null,p_fields jsonb default null,p_plan jsonb default null,p_existing boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_campaigns%rowtype; prior public.whatsapp_campaign_audience_plans%rowtype; a public.whatsapp_saved_audiences%rowtype; normalized jsonb; item jsonb; reason text; ids uuid[]; admin boolean; items jsonb; comparisons jsonb;
begin
 admin:=public.whatsapp_staff_is_admin(p_org,p_actor);
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',campaign_row.id,'plan',case when admin then p.plan else null end)),'[]') into items from public.whatsapp_campaigns campaign_row left join public.whatsapp_campaign_audience_plans p on p.campaign_id=campaign_row.id and p.organisation_id=campaign_row.organisation_id
   where campaign_row.organisation_id=p_org and (p.plan->'filters'->>'kind' is distinct from 'recruitment' or private.whatsapp_recruitment_manager(p_org,p_actor));return jsonb_build_object('campaigns',items);
 end if;
 select * into c from public.whatsapp_campaigns where id=p_id and organisation_id=p_org for update;
 select * into prior from public.whatsapp_campaign_audience_plans where campaign_id=p_id and organisation_id=p_org;
 if prior.plan->'filters'->>'kind'='recruitment' and not private.whatsapp_recruitment_manager(p_org,p_actor) then raise exception 'Recruitment management access required';end if;
 if prior.campaign_id is not null and not admin and p_action in ('save','validate') then raise exception 'Agency management must review campaigns with CRM audiences or reply routes';end if;
 if p_action='validate' then
  if c.id is null then raise exception 'Campaign not found';end if;
  if prior.campaign_id is not null then
   for item in select value from jsonb_array_elements(prior.plan->'targets') loop
    reason:=private.whatsapp_target_reason(p_org,item,prior.plan,prior.saved_by);if reason is not null then raise exception '%',reason;end if;
   end loop;
   if jsonb_array_length(prior.plan->'targets')=0 then reason:=private.whatsapp_target_reason(p_org,'{}',prior.plan,prior.saved_by);if reason is not null then raise exception '%',reason;end if;end if;
  end if;return jsonb_build_object('valid',true);
 end if;
 if p_action<>'save' then raise exception 'Unknown campaign plan action';end if;
 if c.id is not null and c.status<>'draft' then raise exception 'This campaign has already started';end if;
 if p_existing and (c.id is null or c.revision is distinct from p_version) then raise exception 'This draft changed. Reopen it before saving';end if;
 ids:=array(select jsonb_array_elements_text(p_fields->'contact_ids')::uuid);
 if cardinality(ids)>500 or cardinality(ids)<>(select count(distinct v) from unnest(ids) v) then raise exception 'Choose up to 500 distinct recipients';end if;
 if not p_existing and c.id is not null then
  comparisons:=jsonb_build_object('name',c.name,'sender_id',c.sender_id,'template',c.template,'parameter_values',c.parameter_values,'contact_ids',c.contact_ids);
  if comparisons is distinct from p_fields-'scheduled_at' or c.scheduled_at is distinct from (p_fields->>'scheduled_at')::timestamptz or prior.request_json is distinct from p_plan then raise exception 'This draft was already saved with different details. Reopen it first';end if;
  return jsonb_build_object('campaign',to_jsonb(c)||jsonb_build_object('audience_plan',prior.request_json));
 end if;
 if p_plan is not null then
  if not admin then raise exception 'Agency management must select CRM audiences or campaign reply routes';end if;
  if p_plan->>'mode' not in ('record_owner','agent','agency_queue') then raise exception 'Choose a reply route';end if;
  normalized:=p_plan||jsonb_build_object('filters',null);
  if p_plan->>'audienceId' is not null then
   select * into a from public.whatsapp_saved_audiences where organisation_id=p_org and id=(p_plan->>'audienceId')::uuid for share;
   if a.id is null or a.archived_at is not null or a.version is distinct from (p_plan->>'version')::integer then raise exception 'Audience changed. Preview it again';end if;
   if a.filters->>'kind'='recruitment' and (not private.whatsapp_recruitment_manager(p_org,p_actor) or p_plan->>'mode'='agent') then raise exception 'Recruitment replies stay in the management queue';end if;
   normalized:=normalized||jsonb_build_object('filters',a.filters);
   if jsonb_array_length(p_plan->'targets')<>cardinality(ids) then raise exception 'Choose one CRM record for each selected phone';end if;
   if (select count(distinct value->>'contactId') from jsonb_array_elements(p_plan->'targets'))<>cardinality(ids) then raise exception 'Choose each recipient once';end if;
   for item in select value from jsonb_array_elements(p_plan->'targets') loop
    if not ((item->>'contactId')::uuid=any(ids)) then raise exception 'Audience selection does not match the draft recipients';end if;
    reason:=private.whatsapp_target_reason(p_org,item,normalized,p_actor);if reason is not null then raise exception '%',reason;end if;
   end loop;
  elsif jsonb_array_length(p_plan->'targets')<>0 or p_plan->>'mode'='record_owner' then raise exception 'Select a CRM audience before routing to record owners';end if;
  reason:=private.whatsapp_target_reason(p_org,'{}',normalized-'audienceId',p_actor);if reason is not null then raise exception '%',reason;end if;
 end if;
 if c.id is null then
  insert into public.whatsapp_campaigns(id,organisation_id,created_by,name,sender_id,template,parameter_values,contact_ids,scheduled_at) values(p_id,p_org,p_actor,p_fields->>'name',(p_fields->>'sender_id')::uuid,p_fields->'template',p_fields->'parameter_values',ids,(p_fields->>'scheduled_at')::timestamptz) returning * into c;
 else
  update public.whatsapp_campaigns set name=p_fields->>'name',sender_id=(p_fields->>'sender_id')::uuid,template=p_fields->'template',parameter_values=p_fields->'parameter_values',contact_ids=ids,scheduled_at=(p_fields->>'scheduled_at')::timestamptz,revision=revision+1,updated_at=now() where id=c.id returning * into c;
 end if;
 if p_plan is null then delete from public.whatsapp_campaign_audience_plans where campaign_id=c.id;
 else insert into public.whatsapp_campaign_audience_plans(campaign_id,organisation_id,plan,request_json,saved_by) values(c.id,p_org,normalized,p_plan,p_actor) on conflict(campaign_id) do update set plan=excluded.plan,request_json=excluded.request_json,saved_by=excluded.saved_by,updated_at=now();end if;
 return jsonb_build_object('campaign',to_jsonb(c)||jsonb_build_object('audience_plan',p_plan));
end; $$;

-- The existing enqueue and leased claim keep their ownership, consent, pause
-- and unknown-result guards. This additional guard freezes exact CRM routing.
create function private.whatsapp_campaign_target_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.whatsapp_campaign_audience_plans%rowtype; target jsonb; reason text;
begin
 if tg_op='INSERT' then
  select * into p from public.whatsapp_campaign_audience_plans where campaign_id=new.campaign_id and organisation_id=new.organisation_id for share;
  if p.campaign_id is null then return new;end if;
  if p.plan->>'audienceId' is not null then select value into target from jsonb_array_elements(p.plan->'targets') where value->>'contactId'=new.contact_id::text;if target is null then raise exception 'No reviewed CRM target for this recipient';end if;end if;
  reason:=private.whatsapp_target_reason(new.organisation_id,coalesce(target,'{}'),p.plan,p.saved_by);if reason is not null then raise exception '%',reason;end if;
  new.crm_route_snapshot:=jsonb_build_object('plan',p.plan-'targets','target',target,'savedBy',p.saved_by);
 elsif new.crm_route_snapshot is distinct from old.crm_route_snapshot then raise exception 'A prepared campaign route cannot be changed';
 elsif new.status='processing' and old.status='queued' and new.crm_route_snapshot<>'{}' then
  perform 1 from public.organisation_communication_channels ch join public.whatsapp_campaigns c on c.sender_id=ch.id and c.organisation_id=ch.organisation_id where c.id=new.campaign_id and c.organisation_id=new.organisation_id and ch.connection_status='connected' and ch.owner_user_id is null and ch.phone_number_id=c.phone_number_id and ch.waba_id=c.waba_id for share of ch;
  if not found then new.status:='skipped';new.error_message:='Campaign sender disconnected or changed';return new;end if;
  reason:=private.whatsapp_target_reason(new.organisation_id,coalesce(new.crm_route_snapshot->'target','{}'),new.crm_route_snapshot->'plan',(new.crm_route_snapshot->>'savedBy')::uuid);
  if reason is not null then new.status:='skipped';new.error_message:=reason;end if;
 end if;
 return new;
end; $$;
create trigger whatsapp_campaign_target_guard before insert or update on public.whatsapp_campaign_recipients for each row execute function private.whatsapp_campaign_target_guard();

create function private.whatsapp_route_campaign_reply(p_message uuid) returns void language plpgsql security invoker set search_path='' as $$
declare m public.whatsapp_inbox_messages%rowtype; t public.whatsapp_inbox_conversations%rowtype; r public.whatsapp_campaign_recipients%rowtype; linked public.whatsapp_inbox_crm_links%rowtype;
 target jsonb; plan jsonb; current_state jsonb; issuer uuid; agent uuid; outcome text:='routed'; note text:='Exact campaign reply assigned to the selected reply queue'; admin boolean;
begin
 if exists(select 1 from public.whatsapp_campaign_reply_routes where message_id=p_message) then return;end if;
 select * into m from public.whatsapp_inbox_messages where id=p_message and direction='inbound' and reply_to_provider_message_id is not null;
 if m.id is null then return;end if;
 select recipient.* into r from public.whatsapp_campaign_recipients recipient join public.whatsapp_campaigns campaign on campaign.id=recipient.campaign_id and campaign.organisation_id=recipient.organisation_id
 join public.organisation_communication_channels channel on channel.id=campaign.sender_id and channel.organisation_id=campaign.organisation_id
 join public.whatsapp_inbox_conversations thread on thread.id=m.conversation_id and thread.channel_id=channel.id and thread.organisation_id=channel.organisation_id
 where recipient.organisation_id=m.organisation_id and recipient.phone=thread.contact_phone and recipient.provider_message_id=m.reply_to_provider_message_id
 and m.channel_id=channel.id and channel.phone_number_id=campaign.phone_number_id and channel.waba_id=campaign.waba_id and channel.connection_status='connected' and recipient.status not in ('queued','skipped');
 if r.id is null or r.crm_route_snapshot='{}' then return;end if;
 select * into t from public.whatsapp_inbox_conversations where id=m.conversation_id and organisation_id=m.organisation_id for update;
 if exists(select 1 from public.whatsapp_campaign_reply_routes where message_id=m.id) then return;end if;
 plan:=r.crm_route_snapshot->'plan';target:=r.crm_route_snapshot->'target';issuer:=(r.crm_route_snapshot->>'savedBy')::uuid;
 begin admin:=public.whatsapp_staff_is_admin(m.organisation_id,issuer);exception when others then admin:=false;end;
 if not coalesce(admin,false) then outcome:='needs_review';note:='Campaign manager access changed; agency review required';end if;
 if outcome='routed' and target is not null and target<>'null'::jsonb then
  current_state:=private.whatsapp_automation_snapshot(target->>'kind',(target->>'recordId')::uuid);
  if current_state is null or current_state->>'org'<>m.organisation_id::text or current_state->>'phone' is distinct from t.contact_phone or current_state->>'owner' is distinct from target->'state'->>'owner' then outcome:='needs_review';note:='CRM record phone or agent changed since this campaign; review the reply';end if;
  if target->>'kind'='recruitment' and not private.whatsapp_recruitment_manager(m.organisation_id,issuer) then outcome:='needs_review';note:='Recruitment management review required';end if;
 end if;
 if outcome='routed' then
  agent:=case when plan->>'mode'='agent' then (plan->>'agentId')::uuid when plan->>'mode'='record_owner' then (current_state->>'owner')::uuid else null end;
  if agent is not null then begin perform public.whatsapp_staff_is_admin(m.organisation_id,agent);exception when others then outcome:='needs_review';note:='Reply agent is no longer active; agency review required';end;end if;
 end if;
 if outcome='routed' and t.assignment_version>1 and t.assigned_user_id is distinct from agent then outcome:='preserved';note:='Existing manual conversation assignment preserved; review the campaign reply';end if;
 if outcome='routed' and target is not null and target<>'null'::jsonb then
  note:='Exact campaign reply linked to the selected CRM record and reply queue';
  select * into linked from public.whatsapp_inbox_crm_links where conversation_id=t.id and organisation_id=m.organisation_id for update;
  if linked.conversation_id is not null and coalesce(linked.lead_id,linked.recruitment_lead_id) is distinct from (target->>'recordId')::uuid then outcome:='needs_review';note:='Existing CRM link preserved; review the campaign reply';
  elsif linked.conversation_id is null then
   insert into public.whatsapp_inbox_crm_links(conversation_id,organisation_id,lead_id,recruitment_lead_id,linked_by) values(t.id,m.organisation_id,case when target->>'kind'<>'recruitment' then (target->>'recordId')::uuid end,case when target->>'kind'='recruitment' then (target->>'recordId')::uuid end,issuer);
   insert into public.whatsapp_inbox_crm_link_events(organisation_id,conversation_id,actor_user_id,lead_id,recruitment_lead_id,version) values(m.organisation_id,t.id,issuer,case when target->>'kind'<>'recruitment' then (target->>'recordId')::uuid end,case when target->>'kind'='recruitment' then (target->>'recordId')::uuid end,1);
  end if;
 end if;
 if outcome='routed' and t.assigned_user_id is distinct from agent then update public.whatsapp_inbox_conversations set assigned_user_id=agent,assigned_by=issuer,updated_at=now() where id=t.id;end if;
 update public.whatsapp_inbox_messages set campaign_recipient_id=r.id where id=m.id and campaign_recipient_id is null;
 insert into public.whatsapp_campaign_reply_routes(message_id,organisation_id,conversation_id,campaign_id,recipient_id,status,reason) values(m.id,m.organisation_id,t.id,r.campaign_id,r.id,outcome,note) on conflict(message_id) do nothing;
end; $$;

create function private.whatsapp_campaign_reply_capture() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if pg_trigger_depth()>1 then return null;end if;
 if new.direction='inbound' and new.reply_to_provider_message_id is not null then perform private.whatsapp_route_campaign_reply(new.id);end if;
 return null;
end; $$;
create trigger whatsapp_campaign_reply_capture after insert or update of reply_to_provider_message_id,campaign_recipient_id on public.whatsapp_inbox_messages for each row execute function private.whatsapp_campaign_reply_capture();
create function private.whatsapp_campaign_reply_reconcile() returns trigger language plpgsql security invoker set search_path='' as $$
declare message_id uuid;
begin
 if new.provider_message_id is null or new.crm_route_snapshot='{}' then return null;end if;
 for message_id in select m.id from public.whatsapp_inbox_messages m join public.whatsapp_inbox_conversations t on t.id=m.conversation_id and t.organisation_id=m.organisation_id
 join public.whatsapp_campaigns c on c.id=new.campaign_id and c.organisation_id=new.organisation_id
 where m.direction='inbound' and m.organisation_id=new.organisation_id and m.channel_id=c.sender_id and t.contact_phone=new.phone and m.reply_to_provider_message_id=new.provider_message_id loop perform private.whatsapp_route_campaign_reply(message_id);end loop;
 return null;
end; $$;
create trigger whatsapp_campaign_reply_reconcile after insert or update of provider_message_id on public.whatsapp_campaign_recipients for each row execute function private.whatsapp_campaign_reply_reconcile();
create function public.whatsapp_campaign_reply_status(p_org uuid,p_actor uuid,p_conversation uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare items jsonb;
begin
 perform public.whatsapp_inbox_request(p_org,p_actor,'access',p_conversation);
 select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]') into items from (select status,reason,created_at from public.whatsapp_campaign_reply_routes where organisation_id=p_org and conversation_id=p_conversation order by created_at desc limit 5) r;
 return jsonb_build_object('routes',items);
end; $$;

create table public.meta_lead_ads_campaign_routes (
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),form_mapping_id uuid not null references public.meta_lead_ads_forms(id),
 campaign_id text not null check(campaign_id ~ '^[0-9]{1,30}$'),campaign_name text not null default '',lead_type text not null check(lead_type in ('buyer','seller','recruitment')),
 assigned_agent_id uuid references auth.users(id),branch_id uuid,enabled boolean not null default true,version integer not null default 1,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 unique(form_mapping_id,campaign_id),check(lead_type<>'recruitment' or (assigned_agent_id is null and branch_id is null))
);
create index meta_campaign_routes_org on public.meta_lead_ads_campaign_routes(organisation_id,updated_at desc);
create index meta_campaign_routes_agent on public.meta_lead_ads_campaign_routes(assigned_agent_id);
create index meta_campaign_routes_actor on public.meta_lead_ads_campaign_routes(updated_by);
create function public.meta_campaign_routes_request(p_org uuid,p_actor uuid,p_action text,p_id uuid default null,p_version integer default null,p_config jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.meta_lead_ads_campaign_routes%rowtype; form public.meta_lead_ads_forms%rowtype; rows jsonb; forms jsonb; selected_mapping_id uuid;
begin
 if not public.whatsapp_staff_is_admin(p_org,p_actor) then raise exception 'Agency management must manage Meta campaign routing';end if;
 if p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(r) order by updated_at desc),'[]') into rows from public.meta_lead_ads_campaign_routes r where organisation_id=p_org and (lead_type<>'recruitment' or private.whatsapp_recruitment_manager(p_org,p_actor));
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'formId',f.form_id,'name',f.form_name,'leadType',f.lead_type,'pageId',f.page_id)),'[]') into forms from public.meta_lead_ads_forms f join public.meta_lead_ads_connections c on c.id=f.connection_id and c.organisation_id=f.organisation_id where f.organisation_id=p_org and f.is_active and c.connection_status='connected' and (f.lead_type<>'recruitment' or private.whatsapp_recruitment_manager(p_org,p_actor));
  return jsonb_build_object('routes',rows,'forms',forms);
 end if;
 if p_id is not null then select * into item from public.meta_lead_ads_campaign_routes where id=p_id and organisation_id=p_org;if item.id is null or item.version is distinct from p_version then raise exception 'Campaign route changed. Refresh before saving';end if;end if;
 selected_mapping_id:=coalesce((p_config->>'formMappingId')::uuid,item.form_mapping_id);
 perform 1 from public.meta_lead_ads_forms where organisation_id=p_org and id in (selected_mapping_id,item.form_mapping_id) order by id for update;
 if p_id is not null then select * into item from public.meta_lead_ads_campaign_routes where id=p_id and organisation_id=p_org for update;if item.version is distinct from p_version then raise exception 'Campaign route changed. Refresh before saving';end if;end if;
 select f.* into form from public.meta_lead_ads_forms f join public.meta_lead_ads_connections c on c.id=f.connection_id and c.organisation_id=f.organisation_id where f.id=selected_mapping_id and f.organisation_id=p_org and f.is_active and c.connection_status='connected' for update of f;
 if form.id is null then raise exception 'Choose an enabled form on a connected Page';end if;
 if exists(select 1 from public.meta_lead_ads_imports where form_mapping_id=form.id and status in ('previewing','ready','importing','paused')) then raise exception 'Finish the historical import before changing campaign routing';end if;
 if coalesce(p_config->>'leadType',item.lead_type)='recruitment' and not private.whatsapp_recruitment_manager(p_org,p_actor) then raise exception 'Recruitment management access required';end if;
 if p_action='disable' and item.id is not null then update public.meta_lead_ads_campaign_routes set enabled=false,version=version+1,updated_by=p_actor,updated_at=now() where id=item.id;return jsonb_build_object('disabled',true);end if;
 if p_action<>'save' or p_config->>'campaignId' !~ '^[0-9]{1,30}$' or p_config->>'leadType' not in ('buyer','seller','recruitment') or length(p_config->>'campaignName')>200 then raise exception 'Enter the exact Meta campaign ID and lead destination';end if;
 if p_config->>'agentId' is not null then perform public.whatsapp_staff_is_admin(p_org,(p_config->>'agentId')::uuid);end if;
 if p_config->>'leadType'='recruitment' and (p_config->>'agentId' is not null or p_config->>'branchId' is not null) then raise exception 'Recruitment routes to management';end if;
 if p_config->>'branchId' is not null and not exists(select 1 from public.organisation_branches where organisation_id=p_org and id=(p_config->>'branchId')::uuid) then raise exception 'Choose a branch in this agency';end if;
 if item.id is null then insert into public.meta_lead_ads_campaign_routes(organisation_id,form_mapping_id,campaign_id,campaign_name,lead_type,assigned_agent_id,branch_id,updated_by) values(p_org,form.id,p_config->>'campaignId',coalesce(p_config->>'campaignName',''),p_config->>'leadType',(p_config->>'agentId')::uuid,(p_config->>'branchId')::uuid,p_actor) returning * into item;
 else update public.meta_lead_ads_campaign_routes set form_mapping_id=form.id,campaign_id=p_config->>'campaignId',campaign_name=coalesce(p_config->>'campaignName',''),lead_type=p_config->>'leadType',assigned_agent_id=(p_config->>'agentId')::uuid,branch_id=(p_config->>'branchId')::uuid,enabled=true,version=version+1,updated_by=p_actor,updated_at=now() where id=item.id returning * into item;end if;
 return jsonb_build_object('route',to_jsonb(item));
end; $$;

-- Saving form choices is authoritative and atomic: unchecked forms stop intake.
create function public.meta_form_routes_save(p_org uuid,p_actor uuid,p_connection uuid,p_forms jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.meta_lead_ads_connections%rowtype; f public.meta_lead_ads_forms%rowtype; item jsonb; branch uuid; agent uuid; kind text;
begin
 if not public.whatsapp_staff_is_admin(p_org,p_actor) then raise exception 'Agency management must manage form routing';end if;
 select * into c from public.meta_lead_ads_connections where id=p_connection and organisation_id=p_org and connection_status='connected' for share;
 if c.id is null then raise exception 'Choose a connected Page';end if;
 if jsonb_typeof(p_forms)<>'array' or jsonb_array_length(p_forms)>1000 then raise exception 'Choose valid Page forms';end if;
 perform pg_advisory_xact_lock(hashtextextended('meta-form-routes:'||p_connection::text,0));
 if exists(select 1 from public.meta_lead_ads_imports i join public.meta_lead_ads_forms mf on mf.id=i.form_mapping_id where mf.connection_id=p_connection and mf.organisation_id=p_org and i.status in ('previewing','ready','importing','paused')) then raise exception 'Finish historical imports before changing form routing';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_forms))<>jsonb_array_length(p_forms) then raise exception 'Choose each form once';end if;
 for item in select value from jsonb_array_elements(p_forms) loop
  kind:=coalesce(item->>'leadType','buyer');branch:=(item->>'branchId')::uuid;agent:=(item->>'assignedAgentId')::uuid;
  if item->>'id' !~ '^[0-9]{1,30}$' or kind not in ('buyer','seller','recruitment') then raise exception 'Invalid Meta form route';end if;
  if kind='recruitment' then
   if not private.whatsapp_recruitment_manager(p_org,p_actor) then raise exception 'Recruitment management access required';end if;branch:=null;agent:=null;
  end if;
  if agent is not null then perform public.whatsapp_staff_is_admin(p_org,agent);end if;
  if branch is not null and not exists(select 1 from public.organisation_branches where id=branch and organisation_id=p_org) then raise exception 'Choose a branch in this agency';end if;
  select * into f from public.meta_lead_ads_forms where organisation_id=p_org and form_id=item->>'id' for update;
  if f.lead_type='recruitment' and not private.whatsapp_recruitment_manager(p_org,p_actor) then raise exception 'Recruitment management access required';end if;
  if f.id is not null and f.connection_id<>p_connection then raise exception 'This form belongs to another Page connection';end if;
  if f.id is null then insert into public.meta_lead_ads_forms(organisation_id,connection_id,page_id,form_id,form_name,lead_type,assigned_agent_id,branch_id,is_active) values(p_org,p_connection,c.page_id,item->>'id',item->>'name',kind,agent,branch,true);
  else update public.meta_lead_ads_forms set lead_type=kind,assigned_agent_id=agent,branch_id=branch,is_active=true,form_name=item->>'name' where id=f.id;end if;
 end loop;
 update public.meta_lead_ads_forms set is_active=false where organisation_id=p_org and connection_id=p_connection and form_id not in (select value->>'id' from jsonb_array_elements(p_forms));
 return jsonb_build_object('formsSelected',jsonb_array_length(p_forms));
end; $$;
revoke all on function public.meta_form_routes_save(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.meta_form_routes_save(uuid,uuid,uuid,jsonb) to service_role;
grant insert,update on public.meta_lead_ads_forms to service_role;

create function private.meta_campaign_effective_form(p_org uuid,p_page text,p_form text,p_payload jsonb) returns public.meta_lead_ads_forms language plpgsql security invoker set search_path='' as $$
declare form public.meta_lead_ads_forms%rowtype; route public.meta_lead_ads_campaign_routes%rowtype;
begin
 select * into form from public.meta_lead_ads_forms where organisation_id=p_org and page_id=p_page and form_id=p_form and is_active for share;
 if form.id is null then return null;end if;
 select * into route from public.meta_lead_ads_campaign_routes where organisation_id=p_org and form_mapping_id=form.id and campaign_id=p_payload->>'campaign_id' and enabled for share;
 if route.id is not null then
  if not public.whatsapp_staff_is_admin(p_org,route.updated_by) or route.lead_type='recruitment' and not private.whatsapp_recruitment_manager(p_org,route.updated_by) then raise exception 'Campaign route manager access changed';end if;
  form.lead_type:=route.lead_type;form.assigned_agent_id:=route.assigned_agent_id;form.branch_id:=case when route.lead_type='recruitment' then null else coalesce(route.branch_id,form.branch_id) end;
 end if;
 return form;
end; $$;

-- Extend the existing ingestion functions in place so live webhooks, historical
-- imports and old callers share the same rule. Stop if the expected guard moved.
do $$
declare definition text; needle text; target regprocedure;
begin
 target:='public.meta_ingest_lead_ad(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid)'::regprocedure;
 definition:=pg_get_functiondef(target);
 needle:='  select * into v_mapping from public.meta_lead_ads_forms
   where organisation_id=p_organisation_id and page_id=p_page_id and form_id=p_form_id and is_active;';
 if strpos(definition,needle)=0 then raise exception 'Meta property ingestion changed; review campaign route integration';end if;
 definition:=replace(definition,needle,'  v_mapping:=private.meta_campaign_effective_form(p_organisation_id,p_page_id,p_form_id,p_payload);');
 definition:=replace(definition,'SECURITY DEFINER','SECURITY INVOKER');execute definition;
 target:='public.meta_ingest_lead_ad_routed(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid)'::regprocedure;
 definition:=pg_get_functiondef(target);
 needle:='  if mapping.lead_type in (''buyer'',''seller'') then';
 if strpos(definition,needle)=0 then raise exception 'Routed Meta ingestion changed; review campaign route integration';end if;
 definition:=replace(definition,needle,'  mapping:=private.meta_campaign_effective_form(p_organisation_id,p_page_id,p_form_id,p_payload);'||chr(10)||needle);execute definition;
 -- A BEFORE guard may turn an attempted claim into a skip. Return only actual
 -- claims, including to older workers, so no provider call follows that skip.
 for target in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname='whatsapp_campaign_claim' loop
  definition:=pg_get_functiondef(target);
  needle:='return query update public.whatsapp_campaign_recipients set status=';
  if strpos(definition,needle)>0 then
   definition:=replace(definition,needle,'return query with claimed as (update public.whatsapp_campaign_recipients set status=');
   definition:=replace(definition,'where id=r.id returning *;','where id=r.id returning *) select * from claimed where claimed.status=''processing'';');
   definition:=replace(definition,'where id = r.id returning *;','where id = r.id returning *) select * from claimed where claimed.status=''processing'';');execute definition;
  else raise exception 'Campaign claim changed; review CRM route guard';end if;
 end loop;
end; $$;

grant select,insert,update on public.contacts,public.leads,public.recruitment_leads,public.lead_activities to service_role;
grant select,update(requirement_id) on public.lead_requirements to service_role;
grant select,update(id) on public.private_listings to service_role;
grant select,update(id) on public.meta_lead_ads_forms to service_role;
grant select,update(id) on public.meta_lead_ads_connections to service_role;
grant select on public.meta_lead_ads_imports,public.organisation_branches to service_role;

alter table public.whatsapp_saved_audiences enable row level security;
alter table public.whatsapp_campaign_audience_plans enable row level security;
alter table public.whatsapp_campaign_reply_routes enable row level security;
alter table public.meta_lead_ads_campaign_routes enable row level security;
revoke all on public.whatsapp_saved_audiences,public.whatsapp_campaign_audience_plans,public.whatsapp_campaign_reply_routes,public.meta_lead_ads_campaign_routes from public,anon,authenticated;
grant all on public.whatsapp_saved_audiences,public.whatsapp_campaign_audience_plans,public.whatsapp_campaign_reply_routes,public.meta_lead_ads_campaign_routes to service_role;
revoke select on public.whatsapp_campaign_recipients from authenticated;
grant select(id,organisation_id,campaign_id,contact_id,full_name,phone,payload,status,provider_message_id,error_message,consent_snapshot,attempted_at,sent_at,delivered_at,read_at,failed_at,updated_at) on public.whatsapp_campaign_recipients to authenticated;
-- Private policy function checks the actual signed-in user's membership.
revoke all on function private.whatsapp_plan_access(uuid,uuid) from public,anon,authenticated;
grant usage on schema private to authenticated,service_role;
grant execute on function private.whatsapp_plan_access(uuid,uuid) to authenticated,service_role;
revoke all on function private.whatsapp_recruitment_manager(uuid,uuid),private.whatsapp_audience_rows(uuid,jsonb,uuid),private.whatsapp_target_reason(uuid,jsonb,jsonb,uuid),private.whatsapp_campaign_target_guard(),private.whatsapp_route_campaign_reply(uuid),private.whatsapp_campaign_reply_capture(),private.whatsapp_campaign_reply_reconcile(),private.meta_campaign_effective_form(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.whatsapp_recruitment_manager(uuid,uuid),private.whatsapp_audience_rows(uuid,jsonb,uuid),private.whatsapp_target_reason(uuid,jsonb,jsonb,uuid),private.whatsapp_campaign_target_guard(),private.whatsapp_route_campaign_reply(uuid),private.whatsapp_campaign_reply_capture(),private.whatsapp_campaign_reply_reconcile(),private.meta_campaign_effective_form(uuid,text,text,jsonb) to service_role;
revoke all on function public.whatsapp_audiences_request(uuid,uuid,text,uuid,integer,jsonb,integer,text),public.whatsapp_campaign_plan_request(uuid,uuid,text,uuid,integer,jsonb,jsonb,boolean),public.whatsapp_campaign_reply_status(uuid,uuid,uuid),public.meta_campaign_routes_request(uuid,uuid,text,uuid,integer,jsonb),public.meta_ingest_lead_ad(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid),public.meta_ingest_lead_ad_routed(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_audiences_request(uuid,uuid,text,uuid,integer,jsonb,integer,text),public.whatsapp_campaign_plan_request(uuid,uuid,text,uuid,integer,jsonb,jsonb,boolean),public.whatsapp_campaign_reply_status(uuid,uuid,uuid),public.meta_campaign_routes_request(uuid,uuid,text,uuid,integer,jsonb),public.meta_ingest_lead_ad(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid),public.meta_ingest_lead_ad_routed(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid) to service_role;
commit;
