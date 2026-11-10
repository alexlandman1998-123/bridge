begin;
-- Commercial development links select an existing CRM cohort. Channel consent,
-- suppression, subscription and sender checks continue to run at dispatch.
create or replace function public.bridge_development_campaign_contacts(p_org uuid,p_development uuid)
returns setof uuid language sql stable security invoker set search_path='' as $$
 select distinct c.contact_id from public.developer_leads d
 join public.leads l on l.lead_id=d.source_lead_id and l.organisation_id=p_org
 join public.contacts c on c.contact_id=l.contact_id and c.organisation_id=p_org
 join public.developments v on v.id=p_development and v.organisation_id=p_org
 where (d.developer_org_id=p_org or d.source_agency_org_id=p_org)
 and (d.primary_development_id=p_development or exists(
  select 1 from public.developer_lead_development_interests i where i.developer_lead_id=d.developer_lead_id and i.development_id=p_development and i.developer_org_id=p_org))
$$;
revoke all on function public.bridge_development_campaign_contacts(uuid,uuid) from public,anon;
grant execute on function public.bridge_development_campaign_contacts(uuid,uuid) to authenticated,service_role;

create or replace function public.email_campaign_contact_filter_matches(p_contact public.email_marketing_contacts,p_filter jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare rules jsonb; a public.marketing_audiences;
begin
 rules:=public.email_campaign_resolve_audience_rules(p_contact.organisation_id,p_filter);
 if rules ? 'development_id' then
  if coalesce(rules->>'development_id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
   raise exception 'Choose a valid development audience.' using errcode='22023';
  end if;
  if not exists(select 1 from public.bridge_development_campaign_contacts(p_contact.organisation_id,(rules->>'development_id')::uuid) cohort(contact_id)
   where (p_contact.source_type='crm' and p_contact.source_id=cohort.contact_id) or exists(
    select 1 from public.email_marketing_contact_sources source where source.organisation_id=p_contact.organisation_id and source.marketing_contact_id=p_contact.id and source.source_kind='crm_contact' and source.source_id=cohort.contact_id)) then return false; end if;
 end if;
 if rules ? 'shared_audience_id' then
  select * into a from public.marketing_audiences where id=(rules->>'shared_audience_id')::uuid and organisation_id=p_contact.organisation_id and archived_at is null;
  if a.id is null or not public.bridge_is_active_member(p_contact.organisation_id) or not (a.visibility='agency' or a.created_by=auth.uid()) then raise exception 'The selected audience is unavailable.' using errcode='42501'; end if;
  -- Dispatch is privileged; a manual address must not expose private CRM targeting.
  if not arch9_client_private.email_contact_visible(p_contact.organisation_id,p_contact.email) then return false; end if;
  return exists(select 1 from public.marketing_audience_crm_members(p_contact.organisation_id,a.definition,null) m where m.email_id=p_contact.id and not (coalesce((a.definition->>'quietDays')::integer,0)>0 and m.recent));
 end if;
 p_contact.tags:=coalesce(arch9_client_private.client_tags_for_email(p_contact.organisation_id,p_contact.email),p_contact.tags);
 return (select coalesce(jsonb_typeof(rules)='object'
  and (rules->>'role_type' is null or p_contact.role_type=rules->>'role_type')
  and (rules->>'branch_id' is null or p_contact.branch_id::text=rules->>'branch_id')
  and (rules->>'assigned_user_id' is null or p_contact.assigned_user_id::text=rules->>'assigned_user_id')
  and (rules->>'lead_stage' is null or p_contact.lead_stage=rules->>'lead_stage')
  and (rules->>'area' is null or p_contact.area=rules->>'area')
  and (rules->>'tag' is null or rules->>'tag'=any(p_contact.tags))
  and (coalesce(jsonb_array_length(rules->'contact_ids'),0)=0 or p_contact.id::text in(select value from jsonb_array_elements_text(rules->'contact_ids')))
  and (coalesce(jsonb_typeof(rules->'rules'),'')<>'array' or public.email_audience_rule_matches(p_contact,rules)),false));
end $$;

create or replace function public.bridge_prepare_development_campaign(p_organisation_id uuid,p_development_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v public.developments%rowtype; profile jsonb; events jsonb; whatsapp_ids jsonb; whatsapp_total integer;
begin
 if auth.uid() is null or not public.bridge_has_organisation_membership(p_organisation_id) or not coalesce(public.bridge_can_manage_development_record(p_development_id),false) then
  raise exception 'Open this development with campaign management access.' using errcode='42501'; end if;
 select * into v from public.developments where id=p_development_id and organisation_id=p_organisation_id;
 if not found then raise exception 'Open the organisation workspace that owns this development.' using errcode='42501'; end if;
 select jsonb_build_object('marketing_content',marketing_content,'image_links',image_links,'description',description,'revision',revision) into profile from public.development_profiles where development_id=p_development_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'event_type',event_type,'status',status,'starts_at',starts_at,'location',location,'address',address,'description',description,'image_url',image_url) order by starts_at,id),'[]') into events
 from public.marketing_events where organisation_id=p_organisation_id and subject_type='development' and subject_id=p_development_id and status in ('planning','upcoming') and starts_at>now();
 with matched as (
  select distinct m.id from public.bridge_development_campaign_contacts(p_organisation_id,p_development_id) cohort(contact_id)
  join public.contacts c on c.contact_id=cohort.contact_id and c.organisation_id=p_organisation_id
  join public.whatsapp_marketing_contacts m on m.organisation_id=p_organisation_id and m.phone=public.whatsapp_crm_phone(c.phone)
  where m.consent_status='opted_in' and m.opted_out_at is null
 ) select count(*)::integer,coalesce((select jsonb_agg(id order by id) from (select id from matched order by id limit 500) first_contacts),'[]') into whatsapp_total,whatsapp_ids from matched;
 return jsonb_build_object('development',jsonb_build_object('id',v.id,'name',v.name,'organisation_id',v.organisation_id),
  'profile',coalesce(profile,'{}'),'events',events,'whatsappContactIds',whatsapp_ids,'whatsappTotal',whatsapp_total);
end $$;
revoke all on function public.bridge_prepare_development_campaign(uuid,uuid) from public,anon;
grant execute on function public.bridge_prepare_development_campaign(uuid,uuid) to authenticated;

-- A prepared channel save also creates its real plan/activity link. These
-- relationship writes roll back with the channel save if anything is denied.
create or replace function public.bridge_link_development_campaign_plan()
returns trigger language plpgsql security invoker set search_path='' as $$
declare context jsonb; old_context jsonb; v_dev public.developments%rowtype; plan uuid; linked uuid; v_channel text; v_event public.marketing_events%rowtype;
begin
 v_channel:=case tg_table_name when 'email_campaigns' then 'email' else 'whatsapp' end;
 context:=case v_channel when 'email' then to_jsonb(new)->'content_json'->'arch9_context' else to_jsonb(new)->'parameter_values'->'__arch9_context' end;
 if tg_op='UPDATE' then
  old_context:=case v_channel when 'email' then to_jsonb(old)->'content_json'->'arch9_context' else to_jsonb(old)->'parameter_values'->'__arch9_context' end;
  if old_context->>'source'='development_workspace' and ((context->>'source',context->>'version',context->>'development_id',context->>'event_id') is distinct from (old_context->>'source',old_context->>'version',old_context->>'development_id',old_context->>'event_id')) then
   raise exception 'Create a separate campaign to choose another development or event.' using errcode='22023'; end if;
 end if;
 if context->>'source' is distinct from 'development_workspace' then return new; end if;
 select campaign_id into linked from public.marketing_campaign_activities where organisation_id=new.organisation_id and
  ((v_channel='email' and email_campaign_id=new.id) or (v_channel='whatsapp' and whatsapp_campaign_id=new.id));
 if linked is not null then return new; end if;
 select * into v_dev from public.developments where id=(context->>'development_id')::uuid and organisation_id=new.organisation_id;
 if not found or context->>'organisation_id' is distinct from new.organisation_id::text then raise exception 'The campaign development belongs to another workspace.' using errcode='42501'; end if;
 if context->>'event_id' is not null then
  select * into v_event from public.marketing_events where id=(context->>'event_id')::uuid and organisation_id=new.organisation_id and subject_type='development' and subject_id=v_dev.id and status in ('planning','upcoming') and starts_at>now();
  if not found then raise exception 'Refresh the development event before preparing its campaign.' using errcode='22023'; end if;
 end if;
 insert into public.marketing_campaigns(organisation_id,name,goal,objective,audience,status,planned_channels,created_by)
 values(new.organisation_id,left(new.name,120),'buyer_leads',left(case when v_event.id is not null then 'Invite interested buyers to '||v_event.title else 'Promote '||v_dev.name end,240),left('Contacts linked to '||v_dev.name,600),'draft',array[v_channel],new.created_by) returning id into plan;
 if plan is null then raise exception 'The campaign plan could not be confirmed.' using errcode='42501'; end if;
 if current_user='service_role' then
  insert into public.marketing_campaign_activities(organisation_id,campaign_id,channel,email_campaign_id,whatsapp_campaign_id,created_by)
  values(new.organisation_id,plan,v_channel,case when v_channel='email' then new.id end,case when v_channel='whatsapp' then new.id end,new.created_by);
 else
  -- Browser writers have column grants; the existing auth.uid() default owns
  -- their activity. Do not widen those grants to supply another creator.
  insert into public.marketing_campaign_activities(organisation_id,campaign_id,channel,email_campaign_id,whatsapp_campaign_id)
  values(new.organisation_id,plan,v_channel,case when v_channel='email' then new.id end,case when v_channel='whatsapp' then new.id end);
 end if;
 if not found then raise exception 'The campaign activity could not be confirmed.' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function public.bridge_link_development_campaign_plan() from public,anon,authenticated;
create trigger development_email_campaign_plan after insert or update of content_json on public.email_campaigns for each row execute function public.bridge_link_development_campaign_plan();
create trigger development_whatsapp_campaign_plan after insert or update of parameter_values on public.whatsapp_campaigns for each row execute function public.bridge_link_development_campaign_plan();
-- The primary development landing pages share the existing trusted campaign
-- conversion pipeline. Only published, tenant-owned canonical targets qualify.
create or replace function public.bridge_development_attribution_target(p_org uuid,p_url text)
returns uuid language sql stable security invoker set search_path='' as $$
 select d.id from public.developments d join public.development_profiles p on p.development_id=d.id
 where d.organisation_id=p_org and p.marketing_content#>>'{listingConfiguration,publicVisibility}'='true'
 and p.marketing_content#>>'{listingConfiguration,marketingStatus}'='live'
 and ((split_part(split_part(p_url,'?',1),'#',1)='https://app.arch9.co.za/development/'||(p.marketing_content#>>'{listingConfiguration,listingSlug}')
       and p.marketing_content#>>'{listingConfiguration,listingSlug}' ~ '^[a-z0-9][a-z0-9_-]*$')
   or (d.id='abcf1b8a-df2e-4dec-8b11-9958f18fc2f4'::uuid and split_part(split_part(p_url,'?',1),'#',1) in ('https://madisonplace.co.za','https://madisonplace.co.za/','https://www.madisonplace.co.za','https://www.madisonplace.co.za/')))
 order by d.id limit 1
$$;
revoke all on function public.bridge_development_attribution_target(uuid,text) from public,anon,authenticated;
grant execute on function public.bridge_development_attribution_target(uuid,text) to service_role;
create or replace function public.marketing_create_attribution_link(p_channel text,p_campaign_id uuid,p_recipient_id uuid,p_target_url text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare org uuid; recipient_org uuid; recipient_campaign uuid; link public.marketing_attribution_links%rowtype;
begin
  if p_target_url !~* '^https?://' or length(p_target_url)>4096 then raise exception 'Use an HTTP or HTTPS destination.' using errcode='22023'; end if;
  if p_channel='email' then
    select organisation_id into org from public.email_campaigns where id=p_campaign_id;
    if p_recipient_id is not null then select organisation_id,campaign_id into recipient_org,recipient_campaign from public.email_campaign_recipients where id=p_recipient_id; end if;
  elsif p_channel='whatsapp' then
    select organisation_id into org from public.whatsapp_campaigns where id=p_campaign_id;
    if p_recipient_id is not null then select organisation_id,campaign_id into recipient_org,recipient_campaign from public.whatsapp_campaign_recipients where id=p_recipient_id; end if;
  else raise exception 'Invalid marketing channel.' using errcode='22023'; end if;
  if org is null or (p_recipient_id is not null and (recipient_org is distinct from org or recipient_campaign is distinct from p_campaign_id)) then
    raise exception 'Campaign recipient does not match this organisation.' using errcode='23514';
  end if;
  insert into public.marketing_attribution_links(organisation_id,channel,email_campaign_id,whatsapp_campaign_id,email_recipient_id,whatsapp_recipient_id,target_url)
    values(org,p_channel,case when p_channel='email' then p_campaign_id end,case when p_channel='whatsapp' then p_campaign_id end,
      case when p_channel='email' then p_recipient_id end,case when p_channel='whatsapp' then p_recipient_id end,p_target_url)
    on conflict(channel,campaign_id,recipient_id,target_key) do update set target_url=excluded.target_url where public.marketing_attribution_links.target_url=excluded.target_url returning * into link;
  if link.id is null then raise exception 'Destination fingerprint conflict. Use another destination.' using errcode='23505'; end if;
  return jsonb_build_object('token',link.token,'id',link.id,'firstParty',(exists(select 1 from public.website_domains d join public.website_sites s on s.id=d.website_site_id where s.organisation_id=org and s.status='published' and d.status='active' and lower(d.hostname)=substring(lower(p_target_url) from '^https?://([^/:?#]+)')) or public.bridge_development_attribution_target(org,p_target_url) is not null));
end $$;
create or replace function public.marketing_resolve_attribution_link(p_token text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('url',a.target_url,'firstParty',(exists(select 1 from public.website_domains d join public.website_sites s on s.id=d.website_site_id where s.organisation_id=a.organisation_id and s.status='published' and d.status='active' and lower(d.hostname)=substring(lower(a.target_url) from '^https?://([^/:?#]+)')) or public.bridge_development_attribution_target(a.organisation_id,a.target_url) is not null)) from public.marketing_attribution_links a where a.token=p_token
$$;
revoke all on function public.marketing_create_attribution_link(text,uuid,uuid,text),public.marketing_resolve_attribution_link(text) from public,anon,authenticated;
grant execute on function public.marketing_create_attribution_link(text,uuid,uuid,text),public.marketing_resolve_attribution_link(text) to service_role;
alter table public.development_enquiry_submissions add column campaign_attribution_link_id uuid references public.marketing_attribution_links(id);
create or replace function public.madison_capture_campaign_enquiry(p_id uuid,p_name text,p_email text,p_phone text,p_interest text,p_message text,p_fingerprint text,p_ip_hash text,p_attribution_token text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt jsonb; submission public.development_enquiry_submissions%rowtype; link public.marketing_attribution_links%rowtype; org uuid;
begin
 receipt:=public.madison_capture_website_enquiry(p_id,p_name,p_email,p_phone,p_interest,p_message,p_fingerprint,p_ip_hash);
 select * into submission from public.development_enquiry_submissions where id=p_id;
 if submission.is_verification or submission.id is null then return receipt; end if;
 select organisation_id into org from public.leads where lead_id=submission.lead_id;
 select * into link from public.marketing_attribution_links where organisation_id=org
 and ((submission.campaign_attribution_link_id is not null and id=submission.campaign_attribution_link_id)
  or (submission.campaign_attribution_link_id is null and token=p_attribution_token))
 and public.bridge_development_attribution_target(org,target_url)=submission.development_id
 and public.marketing_attribution_in_window(id,submission.created_at);
 if link.id is not null then
  update public.development_enquiry_submissions set campaign_attribution_link_id=link.id where id=p_id and campaign_attribution_link_id is null;
  insert into public.marketing_conversions(organisation_id,link_id,channel,campaign_id,kind,source_key,lead_id,occurred_at)
  values(org,link.id,link.channel,link.campaign_id,'lead_created','lead:'||submission.lead_id::text,submission.lead_id,submission.created_at) on conflict do nothing;
 end if;
 return receipt;
end $$;
revoke all on function public.madison_capture_campaign_enquiry(uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.madison_capture_campaign_enquiry(uuid,text,text,text,text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
