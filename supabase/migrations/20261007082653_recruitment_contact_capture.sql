begin;
-- Shared recruitment contact intake. No applicant account, membership or email is created.
alter table public.recruitment_leads
  add column contact_capture_json jsonb not null default '{}' check (jsonb_typeof(contact_capture_json) = 'object'),
  add column email_verification_status text not null default 'not_requested' check (email_verification_status in ('not_requested','pending','verified')),
  add column email_verified_at timestamptz,
  add constraint recruitment_email_verification_check check ((email_verification_status = 'verified') = (email_verified_at is not null));

create unique index recruitment_intake_links_org_id_idx on public.recruitment_intake_links(organisation_id,id);
create table public.recruitment_contact_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  link_id uuid not null,
  submission_key uuid not null,
  lead_id uuid not null,
  payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (organisation_id,submission_key),
  foreign key (organisation_id,link_id) references public.recruitment_intake_links(organisation_id,id),
  foreign key (organisation_id,lead_id) references public.recruitment_leads(organisation_id,id)
);
create index recruitment_contact_rate_idx on public.recruitment_contact_receipts(fingerprint,created_at desc);
alter table public.recruitment_contact_receipts enable row level security;
revoke all on public.recruitment_contact_receipts from public,anon,authenticated,service_role;
grant select,insert on public.recruitment_contact_receipts to service_role;

-- Staff can manage leads, but cannot author consent, capture or verification evidence.
-- Actual trusted account binding and email verification are subsequent phases.
create function public.recruitment_contact_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.contact_capture_json is distinct from old.contact_capture_json
      or new.email_verification_status is distinct from old.email_verification_status
      or new.email_verified_at is distinct from old.email_verified_at then
      raise exception 'Contact capture and email verification evidence cannot be changed';
    end if;
    return new;
  end if;
  if new.contact_capture_json = '{}'::jsonb then
    if new.email_verification_status <> 'not_requested' or new.email_verified_at is not null then
      raise exception 'Email verification requires trusted applicant evidence';
    end if;
    return new;
  end if;
  if current_user <> 'service_role' or new.status <> 'lead_received'
    or new.intake_channel not in ('website','public_link')
    or new.contact_capture_json->>'version' is distinct from 'recruitment-contact-v1'
    or new.contact_capture_json->>'consentVersion' is distinct from 'recruitment-contact-v1'
    or new.contact_capture_json->'privacyAccepted' is distinct from 'true'::jsonb
    or new.email_verification_status <> 'pending' or new.email_verified_at is not null
    or new.name is distinct from (new.contact_capture_json->>'firstName') || ' ' || (new.contact_capture_json->>'lastName')
    or new.email is distinct from new.contact_capture_json->>'email'
    or new.phone is distinct from new.contact_capture_json->>'phone'
    or new.source is distinct from (case when new.intake_channel = 'website' then 'Website' else 'Public recruitment link' end) then
    raise exception 'Contacts must be captured through the public recruitment endpoint';
  end if;
  -- Whitelist and stamp the receipt even for a direct service-role insert.
  new.contact_capture_json := jsonb_build_object(
    'version','recruitment-contact-v1','firstName',new.contact_capture_json->>'firstName',
    'lastName',new.contact_capture_json->>'lastName','email',new.email,'phone',new.phone,
    'privacyAccepted',true,'consentVersion','recruitment-contact-v1','capturedAt',now()
  );
  return new;
end;
$$;
revoke all on function public.recruitment_contact_guard() from public,anon,authenticated;
create trigger g_recruitment_contact_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_contact_guard();

-- Preserve all eight existing journey guards; only extend the public INSERT boundary.
create or replace function public.recruitment_lead_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
declare event_type text; submitting boolean;
begin
  submitting := coalesce(current_user = 'service_role' and new.status = 'application_submitted'
    and new.application_json->>'version' = 'recruitment-application-v1'
    and new.application_json->'answers'->>'privacyAccepted' = 'true'
    and new.application_json->'answers'->>'declarationAccepted' = 'true',false);
  if tg_op = 'INSERT' then
    if new.status <> 'lead_received' and not submitting then raise exception 'New recruitment enquiries must start at Lead Received'; end if;
    if new.intake_channel <> 'manual' and not submitting and not (current_user = 'service_role' and new.contact_capture_json->>'version' = 'recruitment-contact-v1') then raise exception 'Public intake requires a submitted application'; end if;
    if not submitting and (new.application_json <> '{}' or new.application_submitted_at is not null) then raise exception 'Applications must be submitted through the Join Us form'; end if;
    new.received_at := now(); new.created_at := now(); new.updated_at := now(); new.captured_by := auth.uid(); new.version := 1;
    new.activity_json := jsonb_build_array(jsonb_build_object('type','lead_received','at',now(),'actorId',auth.uid(),'source',new.source));
    if submitting then
      new.application_submitted_at := now();
      new.activity_json := new.activity_json || jsonb_build_array(jsonb_build_object('type','application_submitted','at',now(),'channel',new.application_json->>'channel','reviewStatus',new.review_status));
    end if;
  else
    if new.organisation_id <> old.organisation_id then raise exception 'Recruitment leads cannot move organisations'; end if;
    if new.received_at is distinct from old.received_at or new.captured_by is distinct from old.captured_by or new.intake_channel is distinct from old.intake_channel or new.intake_key is distinct from old.intake_key or new.created_at is distinct from old.created_at then raise exception 'Recruitment receipt details cannot be changed'; end if;
    submitting := coalesce(submitting,false) and old.status = 'lead_received' and old.application_submitted_at is null;
    if not submitting and (new.application_json is distinct from old.application_json or new.application_submitted_at is distinct from old.application_submitted_at) then raise exception 'Applications must be submitted through the Join Us form'; end if;
    if new.status is distinct from old.status and not (submitting or
      (old.status = 'application_approved' and new.status = 'contract_sent' and new.contract_delivery_json <> '{}'::jsonb) or
      (old.status = 'onboarding_complete' and new.status = 'agent_activated' and new.activated_at is not null) or
      (old.status = 'contract_signed' and new.status = 'onboarding_complete' and new.onboarding_completed_at is not null) or
      (old.status = 'contract_sent' and new.status = 'contract_signed' and new.contract_signature_json <> '{}'::jsonb) or
      (old.status = 'under_review' and new.status = 'application_approved' and new.approved_at is not null) or
      (old.status = 'application_submitted' and new.status = 'under_review' and new.review_started_at is not null and old.application_submitted_at is not null) or
      (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined')) or
      (old.status = 'closed_lost' and new.status = case when old.onboarding_completed_at is not null then 'onboarding_complete' when old.contract_signature_json <> '{}'::jsonb then 'contract_signed' when old.contract_delivery_json <> '{}'::jsonb then 'contract_sent' when old.approved_at is not null then 'application_approved' when old.review_started_at is not null then 'under_review' when old.application_submitted_at is not null then 'application_submitted' else 'lead_received' end)
    ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
    if submitting then new.application_submitted_at := now(); end if;
    event_type := case when old.activated_at is null and new.activated_at is not null then 'agent_activated' when new.activation_json is distinct from old.activation_json then 'agent_access_prepared' when old.onboarding_completed_at is null and new.onboarding_completed_at is not null then 'onboarding_completed' when new.onboarding_documents_json is distinct from old.onboarding_documents_json then 'onboarding_document_uploaded' when new.onboarding_json is distinct from old.onboarding_json then 'onboarding_updated' when new.contract_signature_json is distinct from old.contract_signature_json then 'contract_signed' when new.contract_delivery_json is distinct from old.contract_delivery_json then 'contract_delivery_recorded' when new.contracts_json is distinct from old.contracts_json then 'contract_prepared' when submitting then 'application_submitted' when old.approved_at is null and new.approved_at is not null then 'application_approved' when old.review_started_at is null and new.review_started_at is not null then 'review_started' when new.review_updated_at is distinct from old.review_updated_at or new.review_json is distinct from old.review_json then 'review_updated' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' and new.status <> 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel','reviewStatus',new.review_status));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;

create function public.recruitment_capture_contact(p_link_id uuid,p_submission_key uuid,p_contact jsonb,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  link public.recruitment_intake_links%rowtype;
  receipt public.recruitment_contact_receipts%rowtype;
  contact jsonb;
  lead_id uuid;
  full_name text;
begin
  if current_user <> 'service_role' then raise exception 'Server contact capture required' using errcode = '42501'; end if;
  if p_submission_key is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_contact) is distinct from 'object' or length(p_contact::text) > 16000
    or p_contact->'privacyAccepted' is distinct from 'true'::jsonb
    or p_contact->>'consentVersion' is distinct from 'recruitment-contact-v1'
    or jsonb_typeof(p_contact->'firstName') is distinct from 'string'
    or jsonb_typeof(p_contact->'lastName') is distinct from 'string'
    or jsonb_typeof(p_contact->'email') is distinct from 'string'
    or jsonb_typeof(p_contact->'phone') is distinct from 'string' then
    raise exception 'Invalid recruitment contact' using errcode = '22023';
  end if;
  contact := jsonb_build_object('firstName',trim(p_contact->>'firstName'),'lastName',trim(p_contact->>'lastName'),
    'email',lower(trim(p_contact->>'email')),'phone',trim(p_contact->>'phone'),
    'privacyAccepted',true,'consentVersion','recruitment-contact-v1');
  full_name := (contact->>'firstName') || ' ' || (contact->>'lastName');
  if length(contact->>'firstName') not between 1 and 60 or length(contact->>'lastName') not between 1 and 60
    or length(full_name) not between 2 and 120 or length(contact->>'email') > 254
    or contact->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(contact->>'phone') > 50 or length(regexp_replace(contact->>'phone','[^0-9]','','g')) not between 9 and 15 then
    raise exception 'Invalid recruitment contact' using errcode = '22023';
  end if;
  -- Sender lock serialises rate checks across links; agency/key lock serialises uncertain retries across senders.
  perform pg_advisory_xact_lock(hashtextextended('recruitment-contact:' || p_fingerprint,0));
  select * into link from public.recruitment_intake_links where id = p_link_id for share;
  if not found or link.revoked_at is not null or link.expires_at <= now() or link.submitted_at is not null
    or link.lead_id is not null or link.channel not in ('website','public_link') then
    return jsonb_build_object('unavailable',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(link.organisation_id::text || ':contact:' || p_submission_key::text,0));
  select * into receipt from public.recruitment_contact_receipts where organisation_id = link.organisation_id and submission_key = p_submission_key;
  if found then
    if receipt.link_id <> link.id or receipt.payload_json is distinct from contact then return jsonb_build_object('conflict',true); end if;
    return jsonb_build_object('accepted',true,'duplicate',true);
  end if;
  if (select count(*) from public.recruitment_contact_receipts where fingerprint = p_fingerprint and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('rateLimited',true);
  end if;
  insert into public.recruitment_leads(organisation_id,name,email,phone,source,status,intake_channel,intake_key,contact_capture_json,email_verification_status)
  values(link.organisation_id,full_name,contact->>'email',contact->>'phone',
    case when link.channel = 'website' then 'Website' else 'Public recruitment link' end,
    'lead_received',link.channel,p_submission_key,contact || jsonb_build_object('version','recruitment-contact-v1'),'pending') returning id into lead_id;
  insert into public.recruitment_contact_receipts(organisation_id,link_id,submission_key,lead_id,payload_json,fingerprint)
  values(link.organisation_id,link.id,p_submission_key,lead_id,contact,p_fingerprint);
  -- No internal identifiers or existing lead/contact details leave the anonymous intake endpoint.
  return jsonb_build_object('accepted',true,'duplicate',false);
end;
$$;
revoke all on function public.recruitment_capture_contact(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.recruitment_capture_contact(uuid,uuid,jsonb,text) to service_role;
commit;
