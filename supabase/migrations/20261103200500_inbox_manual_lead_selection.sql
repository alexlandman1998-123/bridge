begin;

-- Explicit manual lead selection; record visibility, assignment and version checks remain.
create function public.whatsapp_crm_search_leads(p_org uuid,p_search text default '') returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(candidate)),'[]'::jsonb) from (
 select l.lead_id as "recordId",case when lower(l.lead_category) in ('seller','vendor') then 'seller' else 'buyer' end as kind,
 trim(concat_ws(' ',c.first_name,c.last_name)) as name,c.phone
 from public.leads l join public.contacts c on c.contact_id=l.contact_id and c.organisation_id=l.organisation_id
 where l.organisation_id=p_org and lower(l.lead_category) in ('buyer','seller','vendor')
 and (select auth.uid()) is not null
 and exists(select 1 from public.organisation_users m where m.organisation_id=p_org and m.user_id=(select auth.uid()) and m.status='active'
 and m.role in ('owner','principal','director','admin','super_admin','developer','agency_admin','agent','senior_agent','manager','branch_manager','broker','assistant'))
 and (coalesce(p_search,'')='' or position(lower(left(p_search,100)) in lower(concat_ws(' ',c.first_name,c.last_name,c.phone)))>0)
 order by c.first_name,c.last_name,l.lead_id limit 100
 ) candidate;
$$;

revoke all on function public.whatsapp_crm_search_leads(uuid,text) from public,anon,service_role;

grant execute on function public.whatsapp_crm_search_leads(uuid,text) to authenticated;

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

commit;
