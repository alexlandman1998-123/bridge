begin;
-- Country-specific questionnaire drafts stay on the captured lead, separate from submitted applications.
alter table public.recruitment_leads
  add column applicant_draft_json jsonb not null default '{}' check(jsonb_typeof(applicant_draft_json)='object'),
  add column applicant_draft_revision integer not null default 0 check(applicant_draft_revision>=0),
  add column applicant_draft_saved_at timestamptz;

create function public.recruitment_normalize_profile(p_answers jsonb) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:='{}'; key text;
begin
  for key in select jsonb_object_keys('{"firstName":{"label":"First name","page":0,"required":true,"max":60},"middleName":{"label":"Middle name","page":0,"max":60},"lastName":{"label":"Surname","page":0,"required":true,"max":60},"preferredName":{"label":"Preferred name","page":0,"max":60},"dateOfBirth":{"label":"Date of birth","page":0,"required":true,"type":"birth","max":10},"email":{"label":"Email address","page":1,"required":true,"type":"email","max":254},"mobileCountryCode":{"label":"Mobile country code","page":1,"required":true,"type":"code","max":4},"mobileNumber":{"label":"Mobile phone number","page":1,"required":true,"type":"phone","max":30},"whatsappCountryCode":{"label":"WhatsApp country code","page":1,"type":"code","max":4},"whatsappNumber":{"label":"WhatsApp number","page":1,"type":"phone","max":30},"yearsExperience":{"label":"Years of experience","page":2,"required":true,"options":["0","1","2","3","4","5","6-10","11-20","21+"],"max":5},"licenseStatus":{"label":"License status","page":2,"required":true,"options":["valid","pending","expired"],"max":10},"ffcNumber":{"label":"FFC number","page":2,"max":80},"ffcType":{"label":"FFC practitioner type","page":2,"options":["candidate","non_principal","principal"],"max":20},"propertiesListed":{"label":"Properties listed (last 12 months)","page":2,"required":true,"type":"count","max":3},"propertiesSold":{"label":"Properties sold (last 12 months)","page":2,"required":true,"type":"count","max":3},"southAfricanCitizen":{"label":"South African citizen","page":2,"required":true,"type":"yesno","max":3},"sequestrationStatus":{"label":"Currently under sequestration or administration","page":2,"required":true,"type":"yesno","max":3},"currentEmployer":{"label":"Current brokerage / employer","page":3,"required":true,"max":100},"referralSource":{"label":"How did you find out about us?","page":3,"required":true,"options":["referral","social_media","website","search","event","other"],"max":20},"streetAddress":{"label":"Street address","page":3,"required":true,"max":200},"city":{"label":"City / town","page":3,"required":true,"max":100},"province":{"label":"Province","page":3,"required":true,"options":["Eastern Cape","Free State","Gauteng","KwaZulu-Natal","Limpopo","Mpumalanga","North West","Northern Cape","Western Cape"],"max":30},"postalCode":{"label":"Postal code","page":3,"required":true,"type":"postal","max":5},"expectedStartDate":{"label":"Expected start date","page":3,"required":true,"type":"future","max":10}}'::jsonb) loop
    result:=result||jsonb_build_object(key,case when jsonb_typeof(p_answers->key)='string' then trim(p_answers->>key) else '' end);
  end loop;
  result:=jsonb_set(result,'{email}',to_jsonb(lower(result->>'email')));
  if result->>'licenseStatus'<>'valid' then result:=result||jsonb_build_object('ffcNumber','','ffcType',''); end if;
  if result->>'whatsappNumber'='' then result:=jsonb_set(result,'{whatsappCountryCode}','""'::jsonb); end if;
  return result;
end; $$;

create function public.recruitment_profile_errors(p_answers jsonb,p_page integer default null,p_required boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a jsonb:=public.recruitment_normalize_profile(p_answers); errors jsonb:='{}'; entry record; value text; kind text; mandatory boolean; d date; today date:=(now() at time zone 'Africa/Johannesburg')::date; prefix text; digits integer;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' or length(p_answers::text)>16000 then return '{"form":"Invalid questionnaire"}'::jsonb; end if;
  for entry in select schema_entry.key,schema_entry.value as spec from jsonb_each('{"firstName":{"label":"First name","page":0,"required":true,"max":60},"middleName":{"label":"Middle name","page":0,"max":60},"lastName":{"label":"Surname","page":0,"required":true,"max":60},"preferredName":{"label":"Preferred name","page":0,"max":60},"dateOfBirth":{"label":"Date of birth","page":0,"required":true,"type":"birth","max":10},"email":{"label":"Email address","page":1,"required":true,"type":"email","max":254},"mobileCountryCode":{"label":"Mobile country code","page":1,"required":true,"type":"code","max":4},"mobileNumber":{"label":"Mobile phone number","page":1,"required":true,"type":"phone","max":30},"whatsappCountryCode":{"label":"WhatsApp country code","page":1,"type":"code","max":4},"whatsappNumber":{"label":"WhatsApp number","page":1,"type":"phone","max":30},"yearsExperience":{"label":"Years of experience","page":2,"required":true,"options":["0","1","2","3","4","5","6-10","11-20","21+"],"max":5},"licenseStatus":{"label":"License status","page":2,"required":true,"options":["valid","pending","expired"],"max":10},"ffcNumber":{"label":"FFC number","page":2,"max":80},"ffcType":{"label":"FFC practitioner type","page":2,"options":["candidate","non_principal","principal"],"max":20},"propertiesListed":{"label":"Properties listed (last 12 months)","page":2,"required":true,"type":"count","max":3},"propertiesSold":{"label":"Properties sold (last 12 months)","page":2,"required":true,"type":"count","max":3},"southAfricanCitizen":{"label":"South African citizen","page":2,"required":true,"type":"yesno","max":3},"sequestrationStatus":{"label":"Currently under sequestration or administration","page":2,"required":true,"type":"yesno","max":3},"currentEmployer":{"label":"Current brokerage / employer","page":3,"required":true,"max":100},"referralSource":{"label":"How did you find out about us?","page":3,"required":true,"options":["referral","social_media","website","search","event","other"],"max":20},"streetAddress":{"label":"Street address","page":3,"required":true,"max":200},"city":{"label":"City / town","page":3,"required":true,"max":100},"province":{"label":"Province","page":3,"required":true,"options":["Eastern Cape","Free State","Gauteng","KwaZulu-Natal","Limpopo","Mpumalanga","North West","Northern Cape","Western Cape"],"max":30},"postalCode":{"label":"Postal code","page":3,"required":true,"type":"postal","max":5},"expectedStartDate":{"label":"Expected start date","page":3,"required":true,"type":"future","max":10}}'::jsonb) as schema_entry loop
    if p_page is not null and (entry.spec->>'page')::integer<>p_page then continue; end if;
    if entry.key in ('ffcNumber','ffcType') and a->>'licenseStatus'<>'valid' then continue; end if;
    value:=a->>entry.key; kind:=entry.spec->>'type';
    mandatory:=coalesce((entry.spec->>'required')::boolean,false) or (entry.key in ('ffcNumber','ffcType') and a->>'licenseStatus'='valid');
    if p_answers ? entry.key and jsonb_typeof(p_answers->entry.key)<>'string' then
      errors:=errors||jsonb_build_object(entry.key,'Check this answer.'); continue;
    end if;
    if value='' then
      if p_required and mandatory then errors:=errors||jsonb_build_object(entry.key,'This answer is required.'); end if;
      continue;
    end if;
    if length(value)>(entry.spec->>'max')::integer
      or (entry.spec ? 'options' and not ((entry.spec->'options') ? value))
      or (kind='yesno' and value not in ('yes','no'))
      or (kind='email' and value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      or (kind='code' and value !~ '^\+[1-9][0-9]{0,2}$')
      or (kind='phone' and value !~ '^[0-9 ()-]+$')
      or (kind='count' and value !~ '^[0-9]{1,3}$')
      or (kind='postal' and value !~ '^[0-9]{4,5}$') then
      errors:=errors||jsonb_build_object(entry.key,'Check this answer.');
    end if;
    if kind in ('birth','future') then
      begin
        if value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date'; end if;
        d:=value::date;
        if to_char(d,'YYYY-MM-DD')<>value then raise exception 'Invalid date'; end if;
        if kind='future' and d<=today then errors:=errors||jsonb_build_object(entry.key,'Choose a future start date.'); end if;
        if kind='birth' and extract(year from age(today,d))<18 then errors:=errors||jsonb_build_object(entry.key,'You must be at least 18 years old to apply.'); end if;
      exception when others then errors:=errors||jsonb_build_object(entry.key,'Choose a valid date.'); end;
    end if;
  end loop;
  if (p_page is null or p_page=0) and length((a->>'firstName')||' '||(a->>'lastName'))>120 then errors:=errors||jsonb_build_object('lastName','Keep your full name to 120 characters.'); end if;
  if p_page is null or p_page=1 then
    foreach prefix in array array['mobile','whatsapp'] loop
      if a->>(prefix||'Number')<>'' then
        if a->>(prefix||'CountryCode') !~ '^\+[1-9][0-9]{0,2}$' then errors:=errors||jsonb_build_object(prefix||'CountryCode','Enter a country code.'); end if;
        digits:=length(regexp_replace((a->>(prefix||'CountryCode'))||(a->>(prefix||'Number')),'[^0-9]','','g'));
        if digits not between 9 and 15 then errors:=errors||jsonb_build_object(prefix||'Number','Use 9-15 digits including the country code.'); end if;
      end if;
    end loop;
  end if;
  return errors;
end; $$;

create function public.recruitment_profile_guard() returns trigger language plpgsql security invoker set search_path='' as $$
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
    or new.applicant_draft_json->'answers'->>'email' is distinct from new.contact_capture_json->>'email' then raise exception 'Invalid questionnaire'; end if;
  new.applicant_draft_json:=jsonb_build_object('version','recruitment-profile-v1','country','ZA','page',new.applicant_draft_json->'page','complete',new.applicant_draft_json->'complete','answers',public.recruitment_normalize_profile(new.applicant_draft_json->'answers'));
  new.applicant_draft_revision:=old.applicant_draft_revision+1; new.applicant_draft_saved_at:=now();
  -- Run after the existing journey stamp, retaining its version and immutable history.
  new.activity_json:=jsonb_set(new.activity_json,array[(jsonb_array_length(new.activity_json)-1)::text,'type'],'"application_draft_saved"'::jsonb);
  return new;
end; $$;
create trigger z_recruitment_profile_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_profile_guard();

create or replace function public.recruitment_resume_applicant(p_organisation_id uuid,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype;
begin
  if current_user<>'service_role' then raise exception 'Server authentication required' using errcode='42501'; end if;
  select l.* into candidate from public.recruitment_applicant_sessions s
    join public.recruitment_leads l on l.organisation_id=s.organisation_id and l.id=s.lead_id
    join auth.users u on u.id=s.user_id
    where s.token_hash=p_token_hash and s.organisation_id=p_organisation_id and s.expires_at>now()
      and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and lower(u.email)=lower(l.contact_capture_json->>'email') and l.email_verification_status='verified'
      and l.status not in ('closed_lost','agent_activated','legacy_joined');
  if not found then return null; end if;
  return jsonb_build_object('emailVerification','verified','stage',candidate.status,'applicationSubmitted',candidate.application_submitted_at is not null,'profile',case when candidate.applicant_draft_json='{}'::jsonb then null else candidate.applicant_draft_json end,'profileRevision',candidate.applicant_draft_revision,'profileSavedAt',candidate.applicant_draft_saved_at,
    'contact',jsonb_build_object('firstName',candidate.contact_capture_json->>'firstName','lastName',candidate.contact_capture_json->>'lastName',
      'email',candidate.contact_capture_json->>'email','phone',candidate.contact_capture_json->>'phone'));
end; $$;

create function public.recruitment_save_profile(p_organisation_id uuid,p_token_hash text,p_answers jsonb,p_revision integer,p_page integer,p_intent text)
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
revoke all on function public.recruitment_normalize_profile(jsonb),public.recruitment_profile_errors(jsonb,integer,boolean),public.recruitment_profile_guard(),public.recruitment_save_profile(uuid,text,jsonb,integer,integer,text) from public,anon,authenticated;
grant execute on function public.recruitment_normalize_profile(jsonb),public.recruitment_profile_errors(jsonb,integer,boolean),public.recruitment_save_profile(uuid,text,jsonb,integer,integer,text) to service_role;
commit;
