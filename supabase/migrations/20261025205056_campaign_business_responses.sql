begin;

-- Public links are deliberately created by the campaign owner/manager. The
-- unguessable token is a form capability, never permission to read CRM records.
create table public.marketing_campaign_response_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  campaign_id uuid not null,
  campaign_revision integer not null check(campaign_revision>0),
  intake_link_id uuid not null,
  token uuid not null unique default gen_random_uuid(),
  purpose text not null check(purpose in ('valuation','seller','buyer','referral')),
  assigned_user_id uuid not null references auth.users(id),
  follow_up_days integer not null default 1 check(follow_up_days between 0 and 14),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  foreign key(campaign_id,organisation_id) references public.marketing_campaigns(id,organisation_id) on delete cascade,
  foreign key(intake_link_id,organisation_id) references public.agency_public_intake_links(id,organisation_id) on delete restrict
);
create unique index marketing_campaign_response_link_active on public.marketing_campaign_response_links(campaign_id,campaign_revision,intake_link_id,purpose) where disabled_at is null;
create index marketing_campaign_response_link_scope on public.marketing_campaign_response_links(organisation_id,campaign_id,created_at desc);

-- Public responses are system-recorded, not staff actions. Existing invoker
-- grants cannot set this new origin, and their created_by=auth.uid() RLS stays.
alter table public.marketing_campaign_enquiries add column source_kind text not null default 'recorded' check(source_kind in ('recorded','public_form'));
alter table public.marketing_campaign_enquiries alter column created_by drop not null;
alter table public.marketing_campaign_enquiries add constraint campaign_enquiry_recorder_check check(created_by is not null or source_kind='public_form');

create function public.marketing_campaign_response_owner(c public.marketing_campaigns)
returns uuid language sql immutable security invoker set search_path='' as $$
  select coalesce(nullif(to_jsonb(c)->'campaign_builder'->>'agentId','')::uuid,nullif(to_jsonb(c)->'listing_builder'->>'agentId','')::uuid,c.created_by);
$$;
revoke all on function public.marketing_campaign_response_owner(public.marketing_campaigns) from public,anon;
grant execute on function public.marketing_campaign_response_owner(public.marketing_campaigns) to authenticated,service_role;

alter table public.marketing_campaign_response_links enable row level security;
revoke all on public.marketing_campaign_response_links from public,anon,authenticated;
grant select on public.marketing_campaign_response_links to authenticated;
grant insert(organisation_id,campaign_id,campaign_revision,intake_link_id,purpose,assigned_user_id,follow_up_days,created_by) on public.marketing_campaign_response_links to authenticated;
grant update(disabled_at) on public.marketing_campaign_response_links to authenticated;
grant all on public.marketing_campaign_response_links to service_role;
create policy campaign_response_links_read on public.marketing_campaign_response_links for select to authenticated using (
  public.bridge_is_active_member(organisation_id) and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_response_links.organisation_id and (c.created_by=auth.uid() or public.email_campaign_can_send(c.organisation_id)))
);
create policy campaign_response_links_create on public.marketing_campaign_response_links for insert to authenticated with check (
  created_by=auth.uid() and public.bridge_is_active_member(organisation_id)
  and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_response_links.organisation_id and c.revision=campaign_revision and (c.created_by=auth.uid() or public.email_campaign_can_send(c.organisation_id)) and public.marketing_campaign_response_owner(c)=assigned_user_id)
  and exists(select 1 from public.organisation_users u where u.organisation_id=marketing_campaign_response_links.organisation_id and u.user_id=assigned_user_id and u.status in ('active','accepted'))
  and exists(select 1 from public.agency_public_intake_links i where i.id=intake_link_id and i.organisation_id=marketing_campaign_response_links.organisation_id and i.status='active' and i.disabled_at is null and (coalesce(i.metadata_json->>'surface','')<>'agent_digital_card' or i.default_assigned_agent_id=assigned_user_id)
    and (case when purpose in ('valuation','seller') then 'sell'=any(i.enabled_intents) when purpose='buyer' then 'buy'=any(i.enabled_intents) else i.enabled_intents && array['buy','sell'] end))
);
create policy campaign_response_links_disable on public.marketing_campaign_response_links for update to authenticated using (
  public.bridge_is_active_member(organisation_id) and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_response_links.organisation_id and (c.created_by=auth.uid() or public.email_campaign_can_send(c.organisation_id)))
) with check(disabled_at is not null and public.bridge_is_active_member(organisation_id));

create function public.marketing_campaign_create_response_link(p_org uuid,p_campaign uuid,p_revision integer,p_intake uuid,p_purpose text,p_followup_days integer default 1)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.marketing_campaigns; r public.marketing_campaign_response_links; i public.agency_public_intake_links; owner_id uuid;
begin
  select * into c from public.marketing_campaigns where id=p_campaign and organisation_id=p_org for share;
  if c.id is null or c.revision<>p_revision or not public.bridge_is_active_member(p_org) or not (c.created_by=auth.uid() or public.email_campaign_can_send(p_org)) then raise exception 'Reload the current campaign before creating its response link.' using errcode='42501'; end if;
  owner_id:=public.marketing_campaign_response_owner(c);
  select * into i from public.agency_public_intake_links where id=p_intake and organisation_id=p_org and status='active' and disabled_at is null;
  if i.id is null then raise exception 'Choose an active public intake link in this agency.'; end if;
  insert into public.marketing_campaign_response_links(organisation_id,campaign_id,campaign_revision,intake_link_id,purpose,assigned_user_id,follow_up_days,created_by)
    values(p_org,p_campaign,p_revision,p_intake,p_purpose,owner_id,p_followup_days,auth.uid()) on conflict(campaign_id,campaign_revision,intake_link_id,purpose) where disabled_at is null do nothing;
  select * into r from public.marketing_campaign_response_links where campaign_id=p_campaign and campaign_revision=p_revision and intake_link_id=p_intake and purpose=p_purpose and disabled_at is null;
  if r.id is null or r.follow_up_days<>p_followup_days then raise exception 'An existing response link has different follow-up settings. Revoke it before creating a replacement.'; end if;
  return to_jsonb(r)||jsonb_build_object('slug',i.slug);
end;
$$;
revoke all on function public.marketing_campaign_create_response_link(uuid,uuid,integer,uuid,text,integer) from public,anon;
grant execute on function public.marketing_campaign_create_response_link(uuid,uuid,integer,uuid,text,integer) to authenticated;

create table public.marketing_campaign_response_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  response_link_id uuid not null references public.marketing_campaign_response_links(id) on delete cascade,
  campaign_id uuid not null,
  campaign_revision integer not null,
  idempotency_key text not null check(length(idempotency_key) between 16 and 128),
  payload_hash text not null,
  submission_id uuid not null unique references public.agency_public_intake_submissions(id) on delete restrict,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  enquiry_id uuid not null references public.marketing_campaign_enquiries(id) on delete cascade,
  task_id uuid not null references public.tasks(task_id) on delete restrict,
  privacy_consent boolean not null check(privacy_consent),
  privacy_version text not null,
  email_marketing_consent boolean not null default false,
  marketing_consent_version text,
  received_at timestamptz not null default now(),
  unique(response_link_id,idempotency_key),
  foreign key(campaign_id,organisation_id) references public.marketing_campaigns(id,organisation_id) on delete cascade,
  check((email_marketing_consent and marketing_consent_version='campaign-email-marketing-v1') or (not email_marketing_consent and marketing_consent_version is null))
);
alter table public.marketing_campaign_response_receipts enable row level security;
revoke all on public.marketing_campaign_response_receipts from public,anon,authenticated;
grant select on public.marketing_campaign_response_receipts to authenticated;
grant all on public.marketing_campaign_response_receipts to service_role;
create policy campaign_response_receipts_read on public.marketing_campaign_response_receipts for select to authenticated using (
  public.bridge_is_active_member(organisation_id) and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_response_receipts.organisation_id and (c.created_by=auth.uid() or public.email_campaign_can_send(c.organisation_id)))
);

-- Invoker, service-role-only RPC: the public API owns validation/rate limiting.
-- All authoritative scope, routing, consent and idempotency checks repeat here.
-- No email/WhatsApp subscription or notification/send is created by this RPC.
create function public.marketing_campaign_accept_response(p_token uuid,p_slug text,p_data jsonb,p_ip_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
  r public.marketing_campaign_response_links; i public.agency_public_intake_links; receipt public.marketing_campaign_response_receipts;
  v_contact_id uuid; v_lead_id uuid; v_enquiry_id uuid; v_task_id uuid:=gen_random_uuid(); v_submission_id uuid:=gen_random_uuid(); v_receipt_id uuid:=gen_random_uuid(); owner_id uuid;
  intent text:=p_data->>'intent'; name text:=btrim(p_data->>'contactName'); email text:=lower(btrim(coalesce(p_data->>'contactEmail',''))); phone text:=btrim(coalesce(p_data->>'contactPhone','')); request_key text:=p_data->>'idempotencyKey'; payload_hash text:=md5(p_data::text);
  first_name text; last_name text; category text; due_on date; followup_title text; marketing boolean:=coalesce((p_data->>'emailMarketingConsent')::boolean,false); now_at timestamptz:=now(); submission_key text;
begin
  if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>32768 then raise exception 'Use a valid bounded campaign response.'; end if;
  select * into r from public.marketing_campaign_response_links where token=p_token for update;
  if r.id is null or r.disabled_at is not null then raise exception 'This campaign response link is unavailable.' using errcode='42501'; end if;
  select * into i from public.agency_public_intake_links where id=r.intake_link_id and organisation_id=r.organisation_id and slug=p_slug and status='active' and disabled_at is null;
  if i.id is null or not exists(select 1 from public.marketing_campaigns c where c.id=r.campaign_id and c.organisation_id=r.organisation_id) or not exists(select 1 from public.organisation_users u where u.organisation_id=r.organisation_id and u.user_id=r.assigned_user_id and u.status in ('active','accepted')) then raise exception 'This campaign response link is unavailable.' using errcode='42501'; end if;
  if intent not in ('buy','sell') or not intent=any(i.enabled_intents) or (r.purpose in ('valuation','seller') and intent<>'sell') or (r.purpose='buyer' and intent<>'buy') then raise exception 'Choose the enquiry type supported by this campaign.'; end if;
  if request_key is null or length(request_key) not between 16 and 128 or request_key!~'^[A-Za-z0-9._:-]+$' or name is null or length(name) not between 1 and 240 or length(email)>254 or length(phone)>40 or (email='' and length(regexp_replace(phone,'[^0-9]','','g')) not between 7 and 20) or (email<>'' and email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (p_data->>'privacyConsent') is distinct from 'true' or (p_data->>'privacyVersion') is distinct from coalesce(nullif(i.privacy_policy_version,''),'agency-public-intake-v1') or (marketing and (email='' or (p_data->>'marketingConsentVersion') is distinct from 'campaign-email-marketing-v1')) then raise exception 'Complete the contact and current privacy consent details.'; end if;
  select * into receipt from public.marketing_campaign_response_receipts where response_link_id=r.id and idempotency_key=request_key;
  if receipt.id is not null then
    if receipt.payload_hash<>payload_hash then raise exception 'This enquiry was already saved with different details. Start a new enquiry to submit a change.' using errcode='23505'; end if;
    return jsonb_build_object('accepted',true,'duplicate',true,'followUpPrepared',true,'marketingConsentRecorded',receipt.email_marketing_consent);
  end if;
  if p_ip_hash is not null and p_ip_hash!~'^[0-9a-f]{64}$' then raise exception 'Invalid request metadata.'; end if;
  if p_ip_hash is not null and ((select count(*) from public.agency_public_intake_submissions s where s.intake_link_id=i.id and s.ip_hash=p_ip_hash and s.created_at>now_at-interval '10 minutes')>=5 or (select count(*) from public.agency_public_intake_submissions s where s.intake_link_id=i.id and s.ip_hash=p_ip_hash and s.created_at>now_at-interval '1 hour')>=15) then raise exception 'Too many intake submissions. Please try again later.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.organisation_id::text||':'||case when email<>'' then email else regexp_replace(phone,'[^0-9]','','g') end,0));
  select c.contact_id into v_contact_id from public.contacts c where c.organisation_id=r.organisation_id and ((email<>'' and lower(c.email)=email) or (phone<>'' and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=regexp_replace(phone,'[^0-9]','','g') and (email='' or nullif(c.email,'') is null))) order by case when lower(c.email)=email and email<>'' then 0 else 1 end,c.created_at limit 1;
  owner_id:=r.assigned_user_id;
  if v_contact_id is null then
    v_contact_id:=gen_random_uuid(); first_name:=split_part(name,' ',1); last_name:=btrim(substr(name,length(first_name)+1));
    insert into public.contacts(contact_id,organisation_id,assigned_agent_id,first_name,last_name,email,phone,contact_type,updated_at) values(v_contact_id,r.organisation_id,owner_id,first_name,last_name,nullif(email,''),nullif(phone,''),'Lead',now_at);
  end if;
  category:=case when intent='sell' then 'seller' else 'buyer' end;
  select l.lead_id,coalesce(l.assigned_user_id,l.assigned_agent_id,r.assigned_user_id) into v_lead_id,owner_id from public.leads l where l.organisation_id=r.organisation_id and l.contact_id=v_contact_id and coalesce(l.lead_domain,'agency')='agency' and l.lead_category=category and lower(coalesce(l.stage,l.status,'')) not in ('closed','won','lost','converted','archived','disqualified','sold','completed') order by case when coalesce(l.assigned_user_id,l.assigned_agent_id)=r.assigned_user_id then 0 else 1 end,l.updated_at desc limit 1;
  if v_lead_id is null then
    v_lead_id:=gen_random_uuid(); owner_id:=r.assigned_user_id;
    insert into public.leads(lead_id,organisation_id,branch_id,assigned_user_id,assigned_agent_id,contact_id,lead_domain,lead_category,lead_direction,lead_source,source_channel,campaign_code,stage,status,priority,budget,area_interest,property_interest,seller_property_address,estimated_value,source_reference_id,raw_enquiry_payload,notes,updated_at)
    values(v_lead_id,r.organisation_id,i.default_branch_id,owner_id,owner_id,v_contact_id,'agency',category,'Inbound','Campaign response','website','campaign-'||r.campaign_id::text,'New Lead','New Lead','High',coalesce(nullif(p_data->>'budgetMax','')::numeric,0),nullif(p_data->>'area',''),nullif(p_data->>'propertyType',''),case when intent='sell' then nullif(p_data->>'propertyAddress','') end,coalesce(nullif(p_data->>'estimatedValue','')::numeric,0),'campaign-response:'||v_receipt_id::text,jsonb_build_object('campaignId',r.campaign_id,'campaignRevision',r.campaign_revision,'responsePurpose',r.purpose,'message',p_data->>'message'),'Campaign response: '||r.purpose||case when nullif(p_data->>'message','') is not null then E'\n'||(p_data->>'message') else '' end,now_at);
  end if;
  if not exists(select 1 from public.organisation_users u where u.organisation_id=r.organisation_id and u.user_id=owner_id and u.status in ('active','accepted')) then owner_id:=r.assigned_user_id; end if;
  submission_key:='campaign-response:'||r.token::text||':'||md5(request_key);
  insert into public.agency_public_intake_submissions(id,intake_link_id,organisation_id,lead_id,idempotency_key,intent,status,source_channel,campaign_code,privacy_consent,privacy_consented_at,privacy_policy_version,contact_name,contact_email,contact_phone,budget_min,budget_max,payload_json,ip_hash,processed_at)
    values(v_submission_id,i.id,r.organisation_id,v_lead_id,submission_key,intent,'accepted','website','campaign-'||r.campaign_id::text,true,now_at,p_data->>'privacyVersion',name,nullif(email,''),nullif(phone,''),nullif(p_data->>'budgetMin','')::numeric,nullif(p_data->>'budgetMax','')::numeric,p_data,p_ip_hash,now_at);
  insert into public.marketing_campaign_enquiries(organisation_id,campaign_id,lead_id,channel,responded_at,created_by,source_kind)
    values(r.organisation_id,r.campaign_id,v_lead_id,'form',now_at,null,'public_form') on conflict(campaign_id,lead_id) do nothing;
  select e.id into v_enquiry_id from public.marketing_campaign_enquiries e where e.campaign_id=r.campaign_id and e.lead_id=v_lead_id and e.organisation_id=r.organisation_id;
  if intent='buy' and not exists(select 1 from public.lead_requirements q where q.organisation_id=r.organisation_id and q.lead_id=v_lead_id and q.is_primary and q.status='active') then
    insert into public.lead_requirements(organisation_id,lead_id,contact_id,title,intent_type,property_types,areas,budget_min,budget_max,consent_to_receive_matches,status,is_primary)
      values(r.organisation_id,v_lead_id,v_contact_id,'Campaign buyer requirement','buy',case when nullif(p_data->>'propertyType','') is not null then array[p_data->>'propertyType'] end,case when nullif(p_data->>'area','') is not null then regexp_split_to_array(p_data->>'area',E'\\s*,\\s*') end,nullif(p_data->>'budgetMin','')::numeric,nullif(p_data->>'budgetMax','')::numeric,false,'active',true);
  end if;
  due_on:=(now_at at time zone 'Africa/Johannesburg')::date+r.follow_up_days;
  followup_title:=case r.purpose when 'valuation' then 'Arrange a requested valuation' when 'seller' then 'Discuss the seller’s property plans' when 'buyer' then 'Confirm the buyer’s requirements' else 'Follow up on the personal introduction' end;
  insert into public.tasks(task_id,organisation_id,lead_id,assigned_agent_id,created_by,title,description,due_date,status,priority,metadata)
    values(v_task_id,r.organisation_id,v_lead_id,owner_id,null,followup_title,'A public campaign enquiry was received. Respond to this enquiry; marketing consent and channel subscription are separate.',due_on,'Pending','High',jsonb_build_object('marketing_campaign_id',r.campaign_id,'campaign_enquiry_id',v_enquiry_id,'campaign_response_id',v_receipt_id));
  insert into public.lead_activities(organisation_id,lead_id,agent_id,activity_type,activity_note,activity_date,outcome)
    values(r.organisation_id,v_lead_id,null,'Campaign response','Public '||r.purpose||' enquiry recorded; a follow-up task was prepared. Marketing subscription was not changed.',now_at,'New Lead');
  insert into public.marketing_campaign_response_receipts(id,organisation_id,response_link_id,campaign_id,campaign_revision,idempotency_key,payload_hash,submission_id,lead_id,enquiry_id,task_id,privacy_consent,privacy_version,email_marketing_consent,marketing_consent_version)
    values(v_receipt_id,r.organisation_id,r.id,r.campaign_id,r.campaign_revision,request_key,payload_hash,v_submission_id,v_lead_id,v_enquiry_id,v_task_id,true,p_data->>'privacyVersion',marketing,case when marketing then 'campaign-email-marketing-v1' end);
  return jsonb_build_object('accepted',true,'duplicate',false,'followUpPrepared',true,'marketingConsentRecorded',marketing);
end;
$$;
revoke all on function public.marketing_campaign_accept_response(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.marketing_campaign_accept_response(uuid,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
