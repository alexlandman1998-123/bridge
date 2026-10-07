begin;
-- Submit the exact questionnaire reviewed by its verified owner. Existing legacy invitations remain compatible.
create function public.recruitment_profile_application_answers(p_answers jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select public.recruitment_normalize_profile(p_answers) || jsonb_build_object(
    'name',trim(p_answers->>'firstName')||' '||trim(p_answers->>'lastName'),
    'phone',p_answers->>'mobileCountryCode'||regexp_replace(p_answers->>'mobileNumber','[^0-9]','','g'),
    'currentAgency',p_answers->>'currentEmployer','preferredStartDate',p_answers->>'expectedStartDate',
    'ffcStatus',case p_answers->>'licenseStatus' when 'valid' then 'current' else p_answers->>'licenseStatus' end,
    'practitionerStatus',p_answers->>'ffcType','privacyAccepted',true,'declarationAccepted',true);
$$;
create function public.recruitment_verified_submission_guard() returns trigger
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
    or new.application_json->'answers' is distinct from answers then raise exception 'Submit the complete saved questionnaire'; end if;
  new.application_json:=jsonb_build_object('version','recruitment-application-v1','questionnaireVersion','recruitment-profile-v1',
    'country','ZA','channel',old.intake_channel,'submissionKey',new.application_json->>'submissionKey',
    'profileRevision',old.applicant_draft_revision,'answers',answers,'submittedAt',now(),'consentVersion','recruitment-submission-v1',
    'consent',jsonb_build_object('privacyAccepted',true,'declarationAccepted',true,'acceptedAt',now(),'applicantUserId',applicant_id,
      'privacyText','I agree that the agency may process my application and contact me about recruitment.',
      'declarationText','I confirm that the information in my application is accurate to the best of my knowledge.'));
  return new;
end; $$;
create trigger h_recruitment_verified_submission_guard before insert or update on public.recruitment_leads
  for each row execute function public.recruitment_verified_submission_guard();
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
    'applicationSubmittedAt',candidate.application_submitted_at,'submittedApplication',case when candidate.application_json->>'questionnaireVersion'='recruitment-profile-v1' then jsonb_build_object('answers',candidate.application_json->'answers','submittedAt',candidate.application_submitted_at,'consentVersion',candidate.application_json->>'consentVersion') else null end,
    'contact',jsonb_build_object('firstName',candidate.contact_capture_json->>'firstName','lastName',candidate.contact_capture_json->>'lastName',
      'email',candidate.contact_capture_json->>'email','phone',candidate.contact_capture_json->>'phone'));
end; $$;

create function public.recruitment_submit_verified_profile(p_organisation_id uuid,p_token_hash text,p_revision integer,p_submission_key uuid,p_privacy_accepted boolean,p_declaration_accepted boolean)
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
  errors:=public.recruitment_profile_errors(candidate.applicant_draft_json->'answers',null,true);
  if errors<>'{}'::jsonb then return jsonb_build_object('invalid',true,'errors',errors,'error','Check and save your questionnaire before submitting.'); end if;
  answers:=public.recruitment_profile_application_answers(candidate.applicant_draft_json->'answers');
  update public.recruitment_leads set name=answers->>'name',email=answers->>'email',phone=answers->>'phone',status='application_submitted',
    application_json=jsonb_build_object('version','recruitment-application-v1','questionnaireVersion','recruitment-profile-v1','country','ZA',
      'profileRevision',p_revision,'submissionKey',p_submission_key,'consentVersion','recruitment-submission-v1','answers',answers)
    where organisation_id=p_organisation_id and id=candidate.id;
  return jsonb_build_object('accepted',true,'duplicate',false,'applicant',public.recruitment_resume_applicant(p_organisation_id,p_token_hash));
end; $$;
revoke all on function public.recruitment_profile_application_answers(jsonb),public.recruitment_verified_submission_guard(),public.recruitment_submit_verified_profile(uuid,text,integer,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.recruitment_profile_application_answers(jsonb),public.recruitment_submit_verified_profile(uuid,text,integer,uuid,boolean,boolean) to service_role;
commit;
