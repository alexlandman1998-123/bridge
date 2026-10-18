begin;

-- Use the same strict international/ZA local-number rules as campaigns. Never
-- match by suffix: two countries can have the same local subscriber number.
create function public.whatsapp_crm_phone(p_value text) returns text
language plpgsql immutable parallel safe security invoker set search_path='' as $$
declare phone text := regexp_replace(trim(coalesce(p_value,'')), '[[:space:]().-]', '', 'g');
begin
  if left(phone,1)='+' then phone:=substr(phone,2);
  elsif left(phone,2)='00' then phone:=substr(phone,3);
  elsif phone ~ '^0[0-9]{9}$' then phone:='27'||substr(phone,2); end if;
  return case when phone ~ '^[1-9][0-9]{7,14}$' then phone else null end;
end; $$;
revoke all on function public.whatsapp_crm_phone(text) from public,anon;
grant execute on function public.whatsapp_crm_phone(text) to authenticated,service_role;
create index contacts_whatsapp_crm_phone on public.contacts(organisation_id,public.whatsapp_crm_phone(phone));
create index recruitment_whatsapp_crm_phone on public.recruitment_leads(organisation_id,public.whatsapp_crm_phone(phone));
create index leads_whatsapp_crm_contact on public.leads(organisation_id,contact_id);
create index whatsapp_crm_conversation_phone on public.whatsapp_inbox_conversations(organisation_id,contact_phone,last_message_at desc);

-- This is deliberately invoked with the user's JWT, never the service client:
-- both lead and contact RLS apply, including recruitment's separate boundary.
create function public.whatsapp_crm_records(p_org uuid,p_phone text default null,p_kind text default null,p_record uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.kind,candidate.name,candidate."recordId"),'[]'::jsonb) from (
    select * from (
      select case when lower(l.lead_category) in ('seller','vendor') then 'seller' else 'buyer' end as kind,
        l.lead_id as "recordId",trim(concat_ws(' ',c.first_name,c.last_name)) as name,c.phone,
        l.lead_source as source,
        l.xmin::text||':'||c.xmin::text||':'||(select string_agg(m.xmin::text,',' order by m.xmin::text) from public.organisation_users m where m.organisation_id=p_org and m.user_id=(select auth.uid()) and m.status='active') as "accessStamp"
      from public.leads l join public.contacts c on c.contact_id=l.contact_id and c.organisation_id=l.organisation_id
      where l.organisation_id=p_org and lower(l.lead_category) in ('buyer','seller','vendor')
        and (p_record is null and public.whatsapp_crm_phone(c.phone)=public.whatsapp_crm_phone(p_phone)
          or p_record=l.lead_id and (p_kind is null or p_kind=case when lower(l.lead_category) in ('seller','vendor') then 'seller' else 'buyer' end))
      union all
      select 'recruitment',r.id,r.name,r.phone,r.source,
        r.xmin::text||':'||(select string_agg(m.xmin::text,',' order by m.xmin::text) from public.organisation_users m where m.organisation_id=p_org and m.user_id=(select auth.uid()) and m.status='active')
      from public.recruitment_leads r where r.organisation_id=p_org
        and (p_record is null and public.whatsapp_crm_phone(r.phone)=public.whatsapp_crm_phone(p_phone)
          or p_record=r.id and p_kind='recruitment')
    ) visible_records
    where (select auth.uid()) is not null and exists (
      select 1 from public.organisation_users m where m.organisation_id=p_org and m.user_id=(select auth.uid())
        and m.status='active' and m.role in ('owner','principal','director','admin','super_admin','developer','agency_admin','agent','senior_agent','manager','branch_manager','broker','assistant')
    ) order by kind,name,"recordId" limit 51
  ) candidate;
$$;
revoke all on function public.whatsapp_crm_records(uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.whatsapp_crm_records(uuid,text,text,uuid) to authenticated;

-- No CRM identifier is added to the general inbox projection. The server only
-- reveals linked record details after re-reading them under the caller's RLS.
create table public.whatsapp_inbox_crm_links (
  conversation_id uuid primary key,
  organisation_id uuid not null references public.organisations(id),
  lead_id uuid references public.leads(lead_id) on delete set null,
  recruitment_lead_id uuid references public.recruitment_leads(id) on delete set null,
  version integer not null default 1 check(version>0),
  linked_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  check(num_nonnulls(lead_id,recruitment_lead_id)<=1),
  foreign key(conversation_id,organisation_id) references public.whatsapp_inbox_conversations(id,organisation_id)
);
create index whatsapp_crm_link_lead on public.whatsapp_inbox_crm_links(organisation_id,lead_id) where lead_id is not null;
create index whatsapp_crm_link_recruitment on public.whatsapp_inbox_crm_links(organisation_id,recruitment_lead_id) where recruitment_lead_id is not null;
create table public.whatsapp_inbox_crm_link_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  conversation_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  previous_lead_id uuid,previous_recruitment_lead_id uuid,lead_id uuid,recruitment_lead_id uuid,
  version integer not null,
  created_at timestamptz not null default now(),
  foreign key(conversation_id,organisation_id) references public.whatsapp_inbox_conversations(id,organisation_id)
);
create index whatsapp_crm_link_events_thread on public.whatsapp_inbox_crm_link_events(conversation_id,created_at desc);
alter table public.whatsapp_inbox_crm_links enable row level security;
alter table public.whatsapp_inbox_crm_link_events enable row level security;
revoke all on public.whatsapp_inbox_crm_links,public.whatsapp_inbox_crm_link_events from public,anon,authenticated;
grant all on public.whatsapp_inbox_crm_links,public.whatsapp_inbox_crm_link_events to service_role;

-- Attribute only a reply to the actual campaign message, never a phone match.
alter table public.whatsapp_inbox_messages
  add column campaign_recipient_id uuid references public.whatsapp_campaign_recipients(id) on delete set null,
  add column reply_to_provider_message_id text;
create index whatsapp_inbox_campaign_receipt on public.whatsapp_inbox_messages(campaign_recipient_id) where campaign_recipient_id is not null;

create function public.whatsapp_crm_link_request(
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
      where c.organisation_id=p_org and (is_admin or c.assigned_user_id=p_actor)
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
  if p_action='link' and (phone is null or phone is distinct from thread.contact_phone) then raise exception 'The CRM phone no longer matches this conversation'; end if;
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
revoke all on function public.whatsapp_crm_link_request(uuid,uuid,text,uuid,text,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.whatsapp_crm_link_request(uuid,uuid,text,uuid,text,uuid,integer,integer,text) to service_role;
-- Row locks preserve the exact CRM/membership snapshot checked under user RLS.
grant select on public.leads,public.contacts,public.recruitment_leads to service_role;
grant update(lead_id) on public.leads to service_role;
grant update(contact_id) on public.contacts to service_role;
grant update(id) on public.recruitment_leads to service_role;

-- Attribute a reply only when Meta supplies the ID of the actual campaign
-- message. A phone match alone is not proof that a campaign generated a reply.
create function public.whatsapp_inbox_campaign_reply(p_phone_id text,p_waba_id text,p_from text,p_message_id text,p_reply_to text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  -- Keep the provider's reply context even when its delivery callback has not
  -- arrived yet. Context reads can resolve the campaign once that callback lands.
  update public.whatsapp_inbox_messages message set reply_to_provider_message_id=p_reply_to
  from public.organisation_communication_channels channel,public.whatsapp_inbox_conversations thread
  where channel.phone_number_id=p_phone_id and channel.waba_id=p_waba_id and channel.provider='meta' and channel.channel_type='whatsapp'
    and channel.connection_status='connected' and thread.channel_id=channel.id and thread.organisation_id=channel.organisation_id and thread.contact_phone=p_from
    and message.conversation_id=thread.id and message.channel_id=channel.id and message.organisation_id=channel.organisation_id
    and message.provider_message_id=p_message_id and message.direction='inbound' and message.reply_to_provider_message_id is null and nullif(p_reply_to,'') is not null;
  update public.whatsapp_inbox_messages message set campaign_recipient_id=recipient.id
  from public.organisation_communication_channels channel,public.whatsapp_campaigns campaign,public.whatsapp_campaign_recipients recipient
  where channel.phone_number_id=p_phone_id and channel.waba_id=p_waba_id and channel.provider='meta' and channel.channel_type='whatsapp'
    and channel.connection_status='connected' and campaign.sender_id=channel.id and campaign.organisation_id=channel.organisation_id
    and recipient.campaign_id=campaign.id and recipient.organisation_id=channel.organisation_id and recipient.phone=p_from
    and recipient.provider_message_id=p_reply_to and message.reply_to_provider_message_id=p_reply_to
    and message.channel_id=channel.id and message.organisation_id=channel.organisation_id and message.provider_message_id=p_message_id
    and exists(select 1 from public.whatsapp_inbox_conversations thread where thread.id=message.conversation_id and thread.organisation_id=channel.organisation_id and thread.contact_phone=p_from)
    and message.direction='inbound' and message.campaign_recipient_id is null;
  return found;
end; $$;
revoke all on function public.whatsapp_inbox_campaign_reply(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_inbox_campaign_reply(text,text,text,text,text) to service_role;
commit;
