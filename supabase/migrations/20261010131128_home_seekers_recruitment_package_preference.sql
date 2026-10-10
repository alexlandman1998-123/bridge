begin;
-- Home Seekers preferences stay on the existing draft and immutable submitted application.
-- No preference is inferred for older drafts or submitted applications.

create or replace function public.recruitment_normalize_profile(p_answers jsonb) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:='{}'; key text;
begin
  for key in select jsonb_object_keys('{"firstName":{"label":"First name","page":0,"required":true,"max":60},"middleName":{"label":"Middle name","page":0,"max":60},"lastName":{"label":"Surname","page":0,"required":true,"max":60},"preferredName":{"label":"Preferred name","page":0,"max":60},"dateOfBirth":{"label":"Date of birth","page":0,"required":true,"type":"birth","max":10},"email":{"label":"Email address","page":1,"required":true,"type":"email","max":254},"mobileCountryCode":{"label":"Mobile country code","page":1,"required":true,"type":"code","max":4},"mobileNumber":{"label":"Mobile phone number","page":1,"required":true,"type":"phone","max":30},"whatsappCountryCode":{"label":"WhatsApp country code","page":1,"type":"code","max":4},"whatsappNumber":{"label":"WhatsApp number","page":1,"type":"phone","max":30},"yearsExperience":{"label":"Years of experience","page":2,"required":true,"options":["0","1","2","3","4","5","6-10","11-20","21+"],"max":5},"licenseStatus":{"label":"License status","page":2,"required":true,"options":["valid","pending","expired"],"max":10},"ffcNumber":{"label":"FFC number","page":2,"max":80},"ffcType":{"label":"FFC practitioner type","page":2,"options":["candidate","non_principal","principal"],"max":20},"propertiesListed":{"label":"Properties listed (last 12 months)","page":2,"required":true,"type":"count","max":3},"propertiesSold":{"label":"Properties sold (last 12 months)","page":2,"required":true,"type":"count","max":3},"southAfricanCitizen":{"label":"South African citizen","page":2,"required":true,"type":"yesno","max":3},"sequestrationStatus":{"label":"Currently under sequestration or administration","page":2,"required":true,"type":"yesno","max":3},"currentEmployer":{"label":"Current brokerage / employer","page":3,"required":true,"max":100},"referralSource":{"label":"How did you find out about us?","page":3,"required":true,"options":["referral","social_media","website","search","event","other"],"max":20},"streetAddress":{"label":"Street address","page":3,"required":true,"max":200},"city":{"label":"City / town","page":3,"required":true,"max":100},"province":{"label":"Province","page":3,"required":true,"options":["Eastern Cape","Free State","Gauteng","KwaZulu-Natal","Limpopo","Mpumalanga","North West","Northern Cape","Western Cape"],"max":30},"postalCode":{"label":"Postal code","page":3,"required":true,"type":"postal","max":5},"expectedStartDate":{"label":"Expected start date","page":3,"required":true,"type":"future","max":10}}'::jsonb) loop
    result:=result||jsonb_build_object(key,case when jsonb_typeof(p_answers->key)='string' then trim(p_answers->>key) else '' end);
  end loop;
  result:=jsonb_set(result,'{email}',to_jsonb(lower(result->>'email')));
  if result->>'licenseStatus'<>'valid' then result:=result||jsonb_build_object('ffcNumber','','ffcType',''); end if;
  if result->>'whatsappNumber'='' then result:=jsonb_set(result,'{whatsappCountryCode}','""'::jsonb); end if;
  if p_answers ? 'packagePreference' then
    result:=result||jsonb_build_object('packagePreference',case when jsonb_typeof(p_answers->'packagePreference')='string' then trim(p_answers->>'packagePreference') else '' end);
  end if;
  return result;
end; $$;

-- The organisation comes from canonical server/session scope, never a browser flag.
create function public.recruitment_home_seekers_package_errors(p_organisation_id uuid,p_answers jsonb,p_page integer default null,p_required boolean default false)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare preference text:=trim(coalesce(p_answers->>'packagePreference',''));
begin
  if p_organisation_id is distinct from '2958d402-368e-43c9-b728-0098e10505f1'::uuid then
    if p_answers ? 'packagePreference' then return '{"packagePreference":"Package preference is available only for Home Seekers."}'::jsonb; end if;
    return '{}'::jsonb;
  end if;
  if p_answers ? 'packagePreference' and jsonb_typeof(p_answers->'packagePreference') is distinct from 'string'
    or preference<>'' and preference not in ('deals','monthly','upfront','decide_later') then
    return '{"packagePreference":"Select an available package preference."}'::jsonb;
  end if;
  if p_required and (p_page is null or p_page=3) and preference='' then
    return '{"packagePreference":"Choose a package preference or decide later."}'::jsonb;
  end if;
  return '{}'::jsonb;
end; $$;

create or replace function public.recruitment_profile_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.applicant_draft_json<>'{}'::jsonb or new.applicant_draft_revision<>0 or new.applicant_draft_saved_at is not null then raise exception 'Applicant drafts require verified access'; end if;
    return new;
  end if;
  if new.applicant_draft_json is not distinct from old.applicant_draft_json then
    if new.applicant_draft_revision is distinct from old.applicant_draft_revision or new.applicant_draft_saved_at is distinct from old.applicant_draft_saved_at then raise exception 'Draft evidence cannot be changed'; end if;
    return new;
  end if;
  if current_user<>'service_role' then raise exception 'Applicant drafts require verified access'; end if;
  if old.status<>'lead_received' or new.status<>old.status or old.application_submitted_at is not null
    or new.application_json is distinct from old.application_json or new.application_submitted_at is distinct from old.application_submitted_at
    or new.contact_capture_json is distinct from old.contact_capture_json or new.email_verification_status is distinct from old.email_verification_status
    or not exists(select 1 from public.recruitment_applicant_links b join auth.users u on u.id=b.user_id where b.organisation_id=new.organisation_id and b.lead_id=new.id
      and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=new.contact_capture_json->>'email')
    or new.email_verification_status<>'verified' then raise exception 'Applicant drafts require verified access'; end if;
  if new.applicant_draft_json->>'version' is distinct from 'recruitment-profile-v1' or new.applicant_draft_json->>'country' is distinct from 'ZA'
    or new.applicant_draft_json->'page' not in ('0'::jsonb,'1'::jsonb,'2'::jsonb,'3'::jsonb)
    or jsonb_typeof(new.applicant_draft_json->'page') is distinct from 'number'
    or new.applicant_draft_json->'complete' not in ('true'::jsonb,'false'::jsonb)
    or jsonb_typeof(new.applicant_draft_json->'complete') is distinct from 'boolean'
    or public.recruitment_profile_errors(new.applicant_draft_json->'answers',null,(new.applicant_draft_json->>'complete')::boolean)<>'{}'::jsonb
    or public.recruitment_home_seekers_package_errors(new.organisation_id,new.applicant_draft_json->'answers',null,(new.applicant_draft_json->>'complete')::boolean)<>'{}'::jsonb
    or new.applicant_draft_json->'answers'->>'email' is distinct from new.contact_capture_json->>'email' then raise exception 'Invalid questionnaire'; end if;
  new.applicant_draft_json:=jsonb_build_object('version','recruitment-profile-v1','country','ZA','page',new.applicant_draft_json->'page','complete',new.applicant_draft_json->'complete','answers',public.recruitment_normalize_profile(new.applicant_draft_json->'answers'));
  new.applicant_draft_revision:=old.applicant_draft_revision+1; new.applicant_draft_saved_at:=now();
  -- Run after the existing journey stamp, retaining its version and immutable history.
  new.activity_json:=jsonb_set(new.activity_json,array[(jsonb_array_length(new.activity_json)-1)::text,'type'],'"application_draft_saved"'::jsonb);
  return new;
end; $$;

create or replace function public.recruitment_save_profile(p_organisation_id uuid,p_token_hash text,p_answers jsonb,p_revision integer,p_page integer,p_intent text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype; desired jsonb; answers jsonb; errors jsonb;
begin
  if current_user<>'service_role' then raise exception 'Server applicant access required' using errcode='42501'; end if;
  if p_revision is null or p_revision<0 or p_page is null or p_page not between 0 and 3 or p_intent is null or p_intent not in ('save','continue','complete') then raise exception 'Invalid questionnaire request'; end if;
  select l.* into candidate from public.recruitment_applicant_sessions s
    join public.recruitment_leads l on l.organisation_id=s.organisation_id and l.id=s.lead_id join auth.users u on u.id=s.user_id
    where s.token_hash=p_token_hash and s.organisation_id=p_organisation_id and s.expires_at>now()
      and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and lower(u.email)=lower(l.contact_capture_json->>'email') and l.email_verification_status='verified'
      and l.status='lead_received' and l.application_submitted_at is null for update of l;
  if not found then return '{"unavailable":true}'::jsonb; end if;
  errors:=public.recruitment_profile_errors(p_answers,null,false);
  if p_intent='continue' then errors:=errors||public.recruitment_profile_errors(p_answers,p_page,true); end if;
  if p_intent='complete' then errors:=errors||public.recruitment_profile_errors(p_answers,null,true); end if;
  errors:=errors||public.recruitment_home_seekers_package_errors(p_organisation_id,p_answers,case when p_intent='continue' then p_page else null end,p_intent<>'save');
  answers:=public.recruitment_normalize_profile(p_answers);
  if answers->>'email' is distinct from candidate.contact_capture_json->>'email' then errors:=errors||jsonb_build_object('email','Keep your verified email address.'); end if;
  if errors<>'{}'::jsonb then return jsonb_build_object('invalid',true,'errors',errors); end if;
  desired:=jsonb_build_object('version','recruitment-profile-v1','country','ZA','answers',answers,'page',case when p_intent='continue' then least(p_page+1,3) else p_page end,'complete',p_intent='complete');
  -- Recover an uncertain response without advancing revisions or duplicating activity.
  if desired=candidate.applicant_draft_json then return jsonb_build_object('saved',true,'duplicate',true,'applicant',public.recruitment_resume_applicant(p_organisation_id,p_token_hash)); end if;
  if candidate.applicant_draft_revision<>p_revision then return jsonb_build_object('conflict',true); end if;
  update public.recruitment_leads set applicant_draft_json=desired where organisation_id=p_organisation_id and id=candidate.id;
  return jsonb_build_object('saved',true,'duplicate',false,'applicant',public.recruitment_resume_applicant(p_organisation_id,p_token_hash));
end; $$;

create or replace function public.recruitment_verified_submission_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare applicant_id uuid; answers jsonb;
begin
  if new.application_json->>'questionnaireVersion' is distinct from 'recruitment-profile-v1' then return new; end if;
  if tg_op='UPDATE' and new.application_json is not distinct from old.application_json then return new; end if;
  if tg_op='INSERT' then raise exception 'Verified applications require an existing enquiry'; end if;
  if current_user<>'service_role' or old.status<>'lead_received' or old.application_submitted_at is not null
    or new.status<>'application_submitted' or old.email_verification_status<>'verified'
    or old.applicant_draft_json->'complete' is distinct from 'true'::jsonb
    or new.applicant_draft_json is distinct from old.applicant_draft_json
    or new.applicant_draft_revision is distinct from old.applicant_draft_revision
    or new.application_json->>'version' is distinct from 'recruitment-application-v1'
    or new.application_json->>'country' is distinct from 'ZA'
    or new.application_json->'profileRevision' is distinct from to_jsonb(old.applicant_draft_revision)
    or new.application_json->>'consentVersion' is distinct from 'recruitment-submission-v1'
    or new.application_json->>'submissionKey' is null
    or new.application_json->>'submissionKey' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid verified submission'; end if;
  select b.user_id into applicant_id from public.recruitment_applicant_links b join auth.users u on u.id=b.user_id
    where b.organisation_id=old.organisation_id and b.lead_id=old.id and u.email_confirmed_at is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=old.contact_capture_json->>'email';
  if not found then raise exception 'Verified applicant required'; end if;
  answers:=public.recruitment_profile_application_answers(old.applicant_draft_json->'answers');
  if public.recruitment_profile_errors(old.applicant_draft_json->'answers',null,true)<>'{}'::jsonb
    or public.recruitment_home_seekers_package_errors(old.organisation_id,old.applicant_draft_json->'answers',null,true)<>'{}'::jsonb
    or new.application_json->'answers' is distinct from answers then raise exception 'Submit the complete saved questionnaire'; end if;
  new.application_json:=jsonb_build_object('version','recruitment-application-v1','questionnaireVersion','recruitment-profile-v1',
    'country','ZA','channel',old.intake_channel,'submissionKey',new.application_json->>'submissionKey',
    'profileRevision',old.applicant_draft_revision,'answers',answers,'submittedAt',now(),'consentVersion','recruitment-submission-v1',
    'consent',jsonb_build_object('privacyAccepted',true,'declarationAccepted',true,'acceptedAt',now(),'applicantUserId',applicant_id,
      'privacyText','I agree that the agency may process my application and contact me about recruitment.',
      'declarationText','I confirm that the information in my application is accurate to the best of my knowledge.'));
  return new;
end; $$;

create or replace function public.recruitment_submit_verified_profile(p_organisation_id uuid,p_token_hash text,p_revision integer,p_submission_key uuid,p_privacy_accepted boolean,p_declaration_accepted boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype; answers jsonb; errors jsonb;
begin
  if current_user<>'service_role' then raise exception 'Server applicant access required' using errcode='42501'; end if;
  if p_revision is null or p_revision<0 or p_submission_key is null or p_privacy_accepted is distinct from true or p_declaration_accepted is distinct from true then
    return jsonb_build_object('invalid',true,'error','Confirm processing consent and the accuracy declaration.'); end if;
  select l.* into candidate from public.recruitment_applicant_sessions s
    join public.recruitment_leads l on l.organisation_id=s.organisation_id and l.id=s.lead_id join auth.users u on u.id=s.user_id
    where s.token_hash=p_token_hash and s.organisation_id=p_organisation_id and s.expires_at>now()
      and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and lower(u.email)=lower(l.contact_capture_json->>'email') and l.email_verification_status='verified'
      and l.status not in ('closed_lost','agent_activated','legacy_joined') for update of l;
  if not found then return '{"unavailable":true}'::jsonb; end if;
  -- A lost response or a second device cannot create another application or activity entry.
  if candidate.application_submitted_at is not null then
    return jsonb_build_object('accepted',true,'duplicate',true,'applicant',public.recruitment_resume_applicant(p_organisation_id,p_token_hash)); end if;
  if candidate.status<>'lead_received' then return '{"unavailable":true}'::jsonb; end if;
  if candidate.applicant_draft_revision<>p_revision then return '{"conflict":true}'::jsonb; end if;
  if candidate.applicant_draft_json->'complete' is distinct from 'true'::jsonb then
    return jsonb_build_object('invalid',true,'error','Complete and save your questionnaire before submitting.'); end if;
  errors:=public.recruitment_profile_errors(candidate.applicant_draft_json->'answers',null,true)||public.recruitment_home_seekers_package_errors(p_organisation_id,candidate.applicant_draft_json->'answers',null,true);
  if errors<>'{}'::jsonb then return jsonb_build_object('invalid',true,'errors',errors,'error','Check and save your questionnaire before submitting.'); end if;
  answers:=public.recruitment_profile_application_answers(candidate.applicant_draft_json->'answers');
  update public.recruitment_leads set name=answers->>'name',email=answers->>'email',phone=answers->>'phone',status='application_submitted',
    application_json=jsonb_build_object('version','recruitment-application-v1','questionnaireVersion','recruitment-profile-v1','country','ZA',
      'profileRevision',p_revision,'submissionKey',p_submission_key,'consentVersion','recruitment-submission-v1','answers',answers)
    where organisation_id=p_organisation_id and id=candidate.id;
  return jsonb_build_object('accepted',true,'duplicate',false,'applicant',public.recruitment_resume_applicant(p_organisation_id,p_token_hash));
end; $$;

revoke all on function public.recruitment_normalize_profile(jsonb),public.recruitment_home_seekers_package_errors(uuid,jsonb,integer,boolean),public.recruitment_profile_guard(),public.recruitment_save_profile(uuid,text,jsonb,integer,integer,text),public.recruitment_verified_submission_guard(),public.recruitment_submit_verified_profile(uuid,text,integer,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.recruitment_normalize_profile(jsonb),public.recruitment_home_seekers_package_errors(uuid,jsonb,integer,boolean),public.recruitment_save_profile(uuid,text,jsonb,integer,integer,text),public.recruitment_submit_verified_profile(uuid,text,integer,uuid,boolean,boolean) to service_role;
commit;
