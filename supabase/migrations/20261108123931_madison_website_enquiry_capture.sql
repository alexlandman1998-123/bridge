begin;
-- Service-only intake; anonymous visitors cannot read or choose lead ownership.
create table public.development_enquiry_submissions (
 id uuid primary key,
 development_id uuid not null references public.developments(id),
 lead_id uuid not null references public.leads(lead_id),
 developer_lead_id uuid not null references public.developer_leads(developer_lead_id),
 fingerprint text not null check(length(fingerprint)=64),
 ip_hash text not null check(length(ip_hash)=64),
 is_verification boolean not null default false,
 created_at timestamptz not null default now()
);
create index development_enquiry_submission_period on public.development_enquiry_submissions(development_id,created_at);
create index development_enquiry_submission_rate on public.development_enquiry_submissions(ip_hash,created_at);
alter table public.development_enquiry_submissions enable row level security;
revoke all on public.development_enquiry_submissions from public,anon,authenticated;
-- Expose only aggregate-safe columns. Fingerprints and IP hashes remain server-side.
grant select(id,development_id,lead_id,developer_lead_id,is_verification,created_at) on public.development_enquiry_submissions to authenticated;
grant all on public.development_enquiry_submissions to service_role;
create policy development_enquiry_submission_staff on public.development_enquiry_submissions for select to authenticated
 using (public.bridge_can_manage_development_record(development_id));

create function public.madison_capture_website_enquiry(p_id uuid,p_name text,p_email text,p_phone text,p_interest text,p_message text,p_fingerprint text,p_ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 dev constant uuid := 'abcf1b8a-df2e-4dec-8b11-9958f18fc2f4';
 org uuid; listing uuid; agent public.organisation_users%rowtype; manager public.organisation_users%rowtype;
 receipt public.development_enquiry_submissions%rowtype;
 crm uuid := gen_random_uuid(); dl uuid := gen_random_uuid(); contact uuid := gen_random_uuid();
 ref text := 'MP-E-'||upper(substr(replace(p_id::text,'-',''),1,12)); recipient record;
 raw jsonb; note text;
begin
 if p_id is null or length(trim(p_name)) not between 2 and 160 or length(p_email)>254
  or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or length(trim(p_phone)) not between 6 and 40 or length(p_interest)>100 or length(p_message)>4000
  or p_name is null or p_email is null or p_phone is null or p_interest is null or p_message is null
  or p_fingerprint is null or p_ip_hash is null or length(p_fingerprint)<>64 or length(p_ip_hash)<>64 then
  raise exception 'Invalid enquiry details' using errcode='22023';
 end if;
 -- Serialize retries and duplicate content before checking rate limits.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 perform pg_advisory_xact_lock(hashtextextended(p_fingerprint,12));
 select * into receipt from public.development_enquiry_submissions where id=p_id;
 if found then
  if receipt.fingerprint<>p_fingerprint then raise exception 'Request identity already used' using errcode='22023'; end if;
  return jsonb_build_object('reference','MP-E-'||upper(substr(replace(receipt.id::text,'-',''),1,12)),'duplicate',true);
 end if;
 select * into receipt from public.development_enquiry_submissions where development_id=dev and fingerprint=p_fingerprint and created_at>now()-interval '10 minutes' order by created_at desc limit 1;
 if found then return jsonb_build_object('reference','MP-E-'||upper(substr(replace(receipt.id::text,'-',''),1,12)),'duplicate',true); end if;
 select organisation_id into org from public.developments where id=dev;
 if org is null or public.get_public_development_landing('madison-place-abcf1b8a')->>'id' is distinct from dev::text then
  raise exception 'Development is not published' using errcode='55000';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ip_hash,13));
 if (select count(*) from public.development_enquiry_submissions where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=10 then
  raise exception 'Enquiry rate exceeded' using errcode='54000';
 end if;
 -- Reuse the published development listing's active assigned agent; never accept a caller's user/email.
 select l.id into listing from public.private_listings l where l.development_id=dev and l.organisation_id=org order by l.created_at limit 1;
 select u.* into agent from public.organisation_users u join public.private_listings l
  on (u.user_id=l.assigned_agent_id or u.id=l.assigned_agent_id)
  where l.id=listing and u.organisation_id=org and u.status in ('active','accepted') order by u.updated_at desc nulls last limit 1;
 select u.* into manager from public.organisation_users u where u.organisation_id=org and u.status in ('active','accepted')
  and lower(u.role) in ('owner','principal','agency_principal','admin','super_admin') and nullif(trim(u.email),'') is not null
  order by case when lower(u.role) in ('owner','principal','agency_principal') then 0 else 1 end,u.user_id limit 1;
 note := concat_ws(E'\n','Madison Place website enquiry','Interest: '||p_interest,nullif(trim(p_message),''));
 raw := jsonb_build_object('development_id',dev,'developerLeadId',dl,'source','madison_website','consent',true,'consentCapturedAt',now());
 insert into public.contacts(contact_id,organisation_id,first_name,last_name,email,phone,contact_type)
 values(contact,org,split_part(trim(p_name),' ',1),trim(substr(trim(p_name),length(split_part(trim(p_name),' ',1))+1)),lower(trim(p_email)),trim(p_phone),'buyer');
 insert into public.leads(lead_id,organisation_id,contact_id,lead_category,lead_domain,lead_source,source_channel,stage,status,notes,assigned_agent_id,assigned_user_id,assigned_agent_email,enquired_listing_id,enquired_property_title,raw_enquiry_payload)
 values(crm,org,contact,'buyer','agency','Madison Place website','website','New Lead','New Lead',note,agent.user_id,agent.user_id,agent.email,listing,'Madison Place',raw);
 insert into public.developer_leads(developer_lead_id,developer_org_id,source_agency_org_id,source_lead_id,primary_development_id,assigned_agent_id,lead_source,public_reference,lead_status)
 values(dl,org,org,crm,dev,agent.user_id,'Madison Place website',ref,'new');
 insert into public.developer_lead_private_details(developer_lead_id,buyer_full_name,buyer_email,buyer_phone,private_notes,consent_reference,consent_captured_at)
 values(dl,trim(p_name),lower(trim(p_email)),trim(p_phone),note,'Madison Place website contact consent',now());
 insert into public.developer_lead_development_interests(developer_lead_id,developer_org_id,development_id,is_primary) values(dl,org,dev,true);
 insert into public.development_enquiry_submissions(id,development_id,lead_id,developer_lead_id,fingerprint,ip_hash) values(p_id,dev,crm,dl,p_fingerprint,p_ip_hash);
 -- Both staff alerts share the existing durable outbox. Client intro stays separate.
 for recipient in select 'agent' as kind,agent.user_id as user_id,agent.email as email,agent.first_name as first_name,agent.last_name as last_name
  union all select 'manager',manager.user_id,manager.email,manager.first_name,manager.last_name
 loop
  insert into public.lead_agent_email_jobs(organisation_id,lead_id,kind) values(org,crm,recipient.kind) on conflict(organisation_id,lead_id,kind) do nothing;
  if recipient.user_id is not null and nullif(trim(recipient.email),'') is not null then
   update public.lead_agent_email_jobs set payload_json=jsonb_build_object(
    'to',lower(trim(recipient.email)),'recipientUserId',recipient.user_id,'recipientName',trim(concat_ws(' ',recipient.first_name,recipient.last_name)),
    'eventKind',case when recipient.kind='agent' then 'new_enquiry_assigned_agent' else 'new_website_enquiry_principal' end,
    'leadName',trim(p_name),'leadEmail',lower(trim(p_email)),'leadPhone',trim(p_phone),'leadSource','Madison Place website','leadCategory','buyer',
    'propertyLabel','Madison Place','enquiryMessage',note,'developerLeadId',dl)
   where organisation_id=org and lead_id=crm and kind=recipient.kind;
  end if;
 end loop;
 return jsonb_build_object('reference',ref,'duplicate',false);
end $$;
revoke all on function public.madison_capture_website_enquiry(uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.madison_capture_website_enquiry(uuid,text,text,text,text,text,text,text) to service_role;

CREATE OR REPLACE FUNCTION public.get_development_visual_analytics(requested_development_id uuid, requested_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with scoped as (
    select *
    from public.development_visual_events e
    where e.development_id = requested_development_id
      and e.occurred_at >= now() - make_interval(days => greatest(1, least(coalesce(requested_days, 30), 365)))
  ), summary as (
    select
      count(distinct session_id) sessions,
      count(*) filter (where event_type = 'scene_viewed') scene_views,
      count(*) filter (where event_type = 'unit_opened') unit_opens,
      count(*) filter (where event_type = 'enquiry_started') enquiries,
      count(*) filter (where event_type = 'fallback_encountered') fallbacks,
      count(*) filter (where event_type = 'journey_abandoned') abandonments
    from scoped
  )
  select jsonb_build_object(
    'periodDays', greatest(1, least(coalesce(requested_days, 30), 365)),
    'summary', jsonb_build_object(
      'sessions', summary.sessions,
      'sceneViews', summary.scene_views,
      'unitOpens', summary.unit_opens,
      'enquiries', summary.enquiries,
      'submittedEnquiries', (select count(*) from public.development_enquiry_submissions r where r.development_id = requested_development_id and not r.is_verification and r.created_at >= now() - make_interval(days => greatest(1, least(coalesce(requested_days, 30), 365)))),
      'fallbacks', summary.fallbacks,
      'abandonments', summary.abandonments,
      'enquiryRate', case when summary.sessions > 0 then round(summary.enquiries::numeric * 100 / summary.sessions, 1) else 0 end
    ),
    'scenes', coalesce((select jsonb_agg(row_data order by views desc) from (
      select scene_id as id, max(metadata->>'sceneName') as name,
        count(*) filter (where event_type = 'scene_viewed') as views,
        count(*) filter (where event_type = 'enquiry_started') as enquiries,
        count(*) filter (where event_type = 'fallback_encountered') as fallbacks
      from scoped where scene_id is not null group by scene_id order by views desc limit 20
    ) row_data), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(row_data order by opens desc) from (
      select unit_id as id, max(metadata->>'unitNumber') as unit_number,
        count(*) filter (where event_type = 'unit_opened') as opens,
        count(*) filter (where event_type = 'shortlisted') as shortlists
      from scoped where unit_id is not null group by unit_id order by opens desc limit 20
    ) row_data), '[]'::jsonb),
    'dropoffs', coalesce((select jsonb_agg(row_data order by abandonments desc) from (
      select scene_id as id, max(metadata->>'sceneName') as name, count(*) as abandonments
      from scoped where event_type = 'journey_abandoned' and scene_id is not null group by scene_id order by abandonments desc limit 20
    ) row_data), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(row_data order by sessions desc) from (
      select viewport as device, count(distinct session_id) as sessions from scoped group by viewport
    ) row_data), '[]'::jsonb)
  )
  from summary;
$function$;


notify pgrst, 'reload schema';
commit;
