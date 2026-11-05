begin;

-- Tenant-only branding correction. Retain every other setting and agency.
update public.organisation_branding
set support_email=case when support_email='hello@homeseekers-onboarding.test' then 'admin@homeseekers.co.za' else support_email end,
 support_website=case when support_website='https://homeseekers-onboarding.test' then 'https://www.homeseeker.co.za' else support_website end
where organisation_id='2958d402-368e-43c9-b728-0098e10505f1'
 and (support_email='hello@homeseekers-onboarding.test' or support_website='https://homeseekers-onboarding.test');

alter table public.recruitment_contact_notifications drop constraint recruitment_contact_notifications_event_kind_check;
alter table public.recruitment_contact_notifications add constraint recruitment_contact_notifications_event_kind_check
 check(event_kind in ('lead_received','application_received','documents_received','contract_returned','join_follow_up'));
alter table public.recruitment_contact_notifications drop constraint recruitment_contact_notifications_recipient_check;
alter table public.recruitment_contact_notifications add constraint recruitment_contact_notifications_recipient_check
 check(recipient in ('thomas@homeseekers.co.za','admin@homeseekers.co.za','alex@arch9.co.za')
  or (event_kind='join_follow_up' and contact_json->>'version'='home-seekers-join-v1' and recipient=contact_json->>'email'));

create function public.home_seekers_queue_join_follow_up(p_key text,p_contact jsonb,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 org constant uuid:='2958d402-368e-43c9-b728-0098e10505f1';
 event_id uuid; saved_lead uuid; existing jsonb; destination text; pending_count int; failed_count int;
begin
 if current_user<>'service_role' then raise exception 'Server capture required' using errcode='42501'; end if;
 if coalesce(p_key,'') !~ '^[A-Za-z0-9._:-]{16,128}$' or coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(p_contact) is distinct from 'object' or length(p_contact::text)>16000
  or p_contact->>'version' is distinct from 'home-seekers-join-v1'
  or p_contact->'privacyAccepted' is distinct from 'true'::jsonb
  or coalesce(p_contact->>'type','') not in ('call','booking','breakdown','application_contact','application','session')
  or length(coalesce(p_contact->>'name','')) not between 2 and 160
  or coalesce(p_contact->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  or length(coalesce(p_contact->>'email',''))>254
  or length(coalesce(p_contact->>'subject','')) not between 1 and 240
  or length(coalesce(p_contact->>'details','')) not between 1 and 12000
 then raise exception 'Invalid Join enquiry' using errcode='22023'; end if;
 event_id:=md5(org::text||':join:'||p_key)::uuid;
 perform pg_advisory_xact_lock(hashtextextended('home-seekers-join:'||p_fingerprint,0));
 perform pg_advisory_xact_lock(hashtextextended('home-seekers-join:'||p_key,0));
 select contact_json-'fingerprint',lead_id into existing,saved_lead from public.recruitment_contact_notifications
 where organisation_id=org and event_kind='join_follow_up' and event_key=event_id limit 1;
 if found then
  if existing is distinct from p_contact then return jsonb_build_object('conflict',true); end if;
 else
  -- Ordinary application notifications already carry the contact details. Add a
  -- separate contextual email only when the visitor used the calculator.
  if p_contact->>'type' in ('application_contact','application') and p_contact->'calculator'='null'::jsonb then
   return jsonb_build_object('accepted',true,'contextNotRequired',true,'deliveryAccepted',true);
  end if;
  if (select count(distinct event_key) from public.recruitment_contact_notifications
   where organisation_id=org and event_kind='join_follow_up' and contact_json->>'fingerprint'=p_fingerprint
    and created_at>now()-interval '1 hour')>=10 then return jsonb_build_object('rateLimited',true); end if;
  select id into saved_lead from public.recruitment_leads where organisation_id=org and lower(email)=p_contact->>'email'
    and status not in ('closed_lost','legacy_joined','agent_activated') order by created_at desc limit 1;
  if saved_lead is null then
   insert into public.recruitment_leads(organisation_id,name,email,phone,source,status,intake_channel,intake_key,details_json)
   values(org,p_contact->>'name',p_contact->>'email',p_contact->>'phone','Website · Join','lead_received','website',event_id,
    jsonb_build_object('joinContext',p_contact)) returning id into saved_lead;
  end if;
  foreach destination in array array['thomas@homeseekers.co.za','admin@homeseekers.co.za'] loop
   insert into public.recruitment_contact_notifications(organisation_id,lead_id,recipient,contact_json,event_kind,event_key)
   values(org,saved_lead,destination,p_contact||jsonb_build_object('fingerprint',p_fingerprint),'join_follow_up',event_id);
  end loop;
  if p_contact->>'type' in ('call','breakdown') and p_contact->>'email' not in ('thomas@homeseekers.co.za','admin@homeseekers.co.za') then
   insert into public.recruitment_contact_notifications(organisation_id,lead_id,recipient,contact_json,event_kind,event_key)
   values(org,saved_lead,p_contact->>'email',p_contact||jsonb_build_object('fingerprint',p_fingerprint),'join_follow_up',event_id);
  end if;
 end if;
 select count(*) filter(where status in ('pending','sending')),count(*) filter(where status in ('needs_attention','suppressed'))
 into pending_count,failed_count from public.recruitment_contact_notifications where organisation_id=org and event_kind='join_follow_up' and event_key=event_id;
 return jsonb_build_object('accepted',true,'duplicate',existing is not null,'deliveryAccepted',pending_count=0 and failed_count=0,'deliveryQueued',pending_count>0,'deliveryFailed',failed_count>0);
end;
$$;
revoke all on function public.home_seekers_queue_join_follow_up(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.home_seekers_queue_join_follow_up(text,jsonb,text) to service_role;

-- Do not enqueue historical requests or resend any old notifications here.
commit;
