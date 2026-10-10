begin;
-- Forward-only journey extension. Retain the internal onboarding milestone and
-- existing canonical membership/contract guards; no historical stages are rewritten.
alter table public.recruitment_leads
 add column contacted_at timestamptz,
 add column contacted_by uuid,
 add column documents_uploaded_at timestamptz,
 add column document_waivers_json jsonb not null default '{}' check(jsonb_typeof(document_waivers_json)='object'),
 add column rejection_json jsonb not null default '{}' check(jsonb_typeof(rejection_json)='object');
alter table public.recruitment_leads drop constraint recruitment_leads_status_check;
alter table public.recruitment_leads add constraint recruitment_leads_status_check check(status in
 ('lead_received','application_submitted','documents_uploaded','under_review','application_approved','contract_sent','contract_signed','onboarding_complete','agent_activated','closed_lost','legacy_joined'));

create function public.recruitment_documents_complete(p_documents jsonb,p_waivers jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
 select not exists(select 1 from unnest(array['CV','Identity document','Qualifications','Registration evidence']) t(kind)
 where not exists(select 1 from jsonb_array_elements(p_documents) d where d->>'type'=t.kind and nullif(d->>'path','') is not null)
 and length(trim(coalesce(p_waivers->>t.kind,'')))<5);
$$;
revoke all on function public.recruitment_documents_complete(jsonb,jsonb) from public,anon;
grant execute on function public.recruitment_documents_complete(jsonb,jsonb) to authenticated,service_role;

create function public.recruitment_journey_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare key text; value jsonb; item jsonb;
begin
 if tg_op='INSERT' then
  if new.contacted_at is not null or new.contacted_by is not null or new.documents_uploaded_at is not null
   or new.document_waivers_json<>'{}' or new.rejection_json<>'{}' then raise exception 'Journey evidence is recorded after receipt'; end if;
  return new;
 end if;
 if new.contacted_at is distinct from old.contacted_at or new.contacted_by is distinct from old.contacted_by then
  if auth.uid() is null or old.status<>'lead_received' or new.status<>old.status or old.contacted_at is not null
   or new.contacted_at is null then raise exception 'Contacting a lead does not submit an application'; end if;
  new.contacted_at:=now(); new.contacted_by:=auth.uid();
 end if;
 if new.documents_uploaded_at is distinct from old.documents_uploaded_at then raise exception 'Document receipt is authored by the database'; end if;
 if new.document_waivers_json is distinct from old.document_waivers_json then
  if auth.uid() is null or old.application_submitted_at is null or old.approved_at is not null
   or old.status not in ('application_submitted','documents_uploaded','under_review') then raise exception 'Only staff can record document exceptions before approval'; end if;
  for key,value in select * from jsonb_each(new.document_waivers_json) loop
   if key not in ('CV','Identity document','Qualifications','Registration evidence') or jsonb_typeof(value)<>'string'
    or length(trim(value#>>'{}')) not between 5 and 2000 then raise exception 'Record a document exception reason (5–2000 characters)'; end if;
  end loop;
 end if;
 if new.documents_json is distinct from old.documents_json then
  if old.approved_at is not null or old.status in ('closed_lost','agent_activated','legacy_joined') then raise exception 'Reviewed documents are locked after approval or closure'; end if;
  for item in select * from jsonb_array_elements(new.documents_json) loop
   if item->>'type' not in ('CV','Identity document','Qualifications','Registration evidence','Other') or length(coalesce(item->>'name','')) not between 1 and 254
    or item->>'path' not like new.organisation_id::text||'/'||new.id::text||'/%'
    or not exists(select 1 from storage.objects s where s.bucket_id='recruitment-documents' and s.name=item->>'path') then raise exception 'Documents must be retained private files belonging to this lead'; end if;
  end loop;
  if old.application_submitted_at is not null and jsonb_array_length(new.documents_json)>0 then
   new.documents_uploaded_at:=coalesce(old.documents_uploaded_at,now());
   if old.status='application_submitted' then new.status:='documents_uploaded'; end if;
  end if;
 end if;
 if new.status='documents_uploaded' and old.status<>new.status and old.status<>'closed_lost' then
  if old.status<>'application_submitted' or old.application_submitted_at is null or new.documents_uploaded_at is null
   or new.documents_json is not distinct from old.documents_json then raise exception 'Upload documents after submitting the verified application'; end if;
 end if;
 if new.rejection_json is distinct from old.rejection_json then
  if auth.uid() is null or old.status<>'under_review' or new.status<>'closed_lost' or old.approved_at is not null
   or length(trim(coalesce(new.rejection_json->>'reason',''))) not between 5 and 3000 then raise exception 'Record a rejection reason during application review'; end if;
  new.rejection_json:=jsonb_build_object('reason',trim(new.rejection_json->>'reason'),'rejectedAt',now(),'rejectedBy',auth.uid());
 end if;
 return new;
end; $$;
revoke all on function public.recruitment_journey_guard() from public,anon,authenticated;
-- Run before the review guard so document receipts are visible to that guard.
create trigger a0_recruitment_journey_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_journey_guard();

create function public.recruitment_record_contact(p_organisation_id uuid,p_lead_id uuid,p_version integer)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
begin
 perform public.recruitment_assert_joining_manager(p_organisation_id);
 return query update public.recruitment_leads set contacted_at=now() where organisation_id=p_organisation_id and id=p_lead_id
  and version=p_version and status='lead_received' and contacted_at is null returning *;
 if not found then raise exception 'This lead changed. Reload before recording contact' using errcode='40001'; end if;
end; $$;
revoke all on function public.recruitment_record_contact(uuid,uuid,integer) from public,anon,service_role;
grant execute on function public.recruitment_record_contact(uuid,uuid,integer) to authenticated;

create function public.recruitment_reject_application(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_reason text)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
begin
 perform public.recruitment_assert_joining_manager(p_organisation_id);
 return query update public.recruitment_leads set status='closed_lost',rejection_json=jsonb_build_object('reason',p_reason)
  where organisation_id=p_organisation_id and id=p_lead_id and version=p_version and status='under_review' and approved_at is null returning *;
 if not found then raise exception 'This application changed. Reload before rejecting' using errcode='40001'; end if;
end; $$;
revoke all on function public.recruitment_reject_application(uuid,uuid,integer,text) from public,anon,service_role;
grant execute on function public.recruitment_reject_application(uuid,uuid,integer,text) to authenticated;

-- Applicants never receive an organisation JWT or direct table/storage grants.
create table public.recruitment_applicant_uploads(
 id uuid primary key,organisation_id uuid not null,lead_id uuid not null,path text not null unique,
 name text not null,type text not null,mime_type text not null,size integer not null check(size between 1 and 10485760),
 created_at timestamptz not null default now(),committed_at timestamptz,
 foreign key(organisation_id,lead_id) references public.recruitment_leads(organisation_id,id));
alter table public.recruitment_applicant_uploads enable row level security;
revoke all on public.recruitment_applicant_uploads from public,anon,authenticated;
grant select,insert,update on public.recruitment_applicant_uploads to service_role;

create function public.recruitment_applicant_document_access(p_organisation_id uuid,p_token_hash text)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Server authentication required' using errcode='42501'; end if;
 return query select l.* from public.recruitment_applicant_sessions s join public.recruitment_leads l on l.organisation_id=s.organisation_id and l.id=s.lead_id
  join auth.users u on u.id=s.user_id
  where s.organisation_id=p_organisation_id and s.token_hash=p_token_hash and s.expires_at>now()
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
   and lower(u.email)=lower(l.contact_capture_json->>'email') and l.email_verification_status='verified'
   and l.application_submitted_at is not null and l.status not in ('closed_lost','agent_activated','legacy_joined');
end; $$;

create function public.recruitment_prepare_applicant_document(p_organisation_id uuid,p_token_hash text,p_request_id uuid,p_document jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype; a public.recruitment_applicant_uploads%rowtype;
begin
 select * into l from public.recruitment_applicant_document_access(p_organisation_id,p_token_hash);
 if l.id is null or l.approved_at is not null or l.status not in ('application_submitted','documents_uploaded','under_review') then return jsonb_build_object('unavailable',true); end if;
 select * into l from public.recruitment_leads where id=l.id for update;
 if l.approved_at is not null or l.status not in ('application_submitted','documents_uploaded','under_review') then return jsonb_build_object('unavailable',true); end if;
 if p_request_id is null or p_document->>'type' not in ('CV','Identity document','Qualifications','Registration evidence','Other')
  or p_document->>'mimeType' not in ('application/pdf','image/jpeg','image/png')
  or length(trim(coalesce(p_document->>'name',''))) not between 1 and 254
  or coalesce(p_document->>'name','')~'[/\\]' or coalesce(p_document->>'size','')!~'^[0-9]{1,8}$'
  or (p_document->>'size')::integer not between 1 and 10485760 then raise exception 'Choose a PDF, JPG or PNG up to 10 MB'; end if;
 select * into a from public.recruitment_applicant_uploads where id=p_request_id;
 if a.id is not null then
  if a.organisation_id<>p_organisation_id or a.lead_id<>l.id or a.name<>p_document->>'name' or a.type<>p_document->>'type'
   or a.mime_type<>p_document->>'mimeType' or a.size<>(p_document->>'size')::integer then raise exception 'Upload request belongs to different document details'; end if;
 else
  if (select count(*) from public.recruitment_applicant_uploads where lead_id=l.id and created_at>now()-interval '1 hour')>=20
   or jsonb_array_length(l.documents_json)>=30 then raise exception 'Document upload limit reached. Contact the agency'; end if;
  insert into public.recruitment_applicant_uploads(id,organisation_id,lead_id,path,name,type,mime_type,size)
   values(p_request_id,p_organisation_id,l.id,p_organisation_id::text||'/'||l.id::text||'/'||p_request_id::text,
    p_document->>'name',p_document->>'type',p_document->>'mimeType',(p_document->>'size')::integer) returning * into a;
 end if;
 return jsonb_build_object('path',a.path,'committed',a.committed_at is not null);
end; $$;

create function public.recruitment_commit_applicant_document(p_organisation_id uuid,p_token_hash text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype; a public.recruitment_applicant_uploads%rowtype; metadata jsonb;
begin
 select * into l from public.recruitment_applicant_document_access(p_organisation_id,p_token_hash);
 if l.id is null then return jsonb_build_object('unavailable',true); end if;
 select * into l from public.recruitment_leads where id=l.id for update;
 select * into a from public.recruitment_applicant_uploads where id=p_request_id and organisation_id=p_organisation_id and lead_id=l.id for update;
 if a.id is null then raise exception 'Prepare this document upload first'; end if;
 if a.committed_at is not null then return jsonb_build_object('saved',true,'duplicate',true); end if;
 if l.approved_at is not null or l.status not in ('application_submitted','documents_uploaded','under_review') then return jsonb_build_object('unavailable',true); end if;
 select s.metadata into metadata from storage.objects s where s.bucket_id='recruitment-documents' and s.name=a.path;
 if metadata is null or (metadata->>'size')::bigint is distinct from a.size::bigint
  or metadata->>'mimetype' is distinct from a.mime_type then raise exception 'The uploaded file could not be verified'; end if;
 update public.recruitment_leads set documents_json=l.documents_json||jsonb_build_array(jsonb_build_object(
  'path',a.path,'name',a.name,'type',a.type,'uploadedAt',now(),'uploadedBy','applicant')) where id=l.id;
 update public.recruitment_applicant_uploads set committed_at=now() where id=a.id;
 return jsonb_build_object('saved',true,'duplicate',false);
end; $$;
revoke all on function public.recruitment_applicant_document_access(uuid,text),public.recruitment_prepare_applicant_document(uuid,text,uuid,jsonb),public.recruitment_commit_applicant_document(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.recruitment_applicant_document_access(uuid,text),public.recruitment_prepare_applicant_document(uuid,text,uuid,jsonb),public.recruitment_commit_applicant_document(uuid,text,uuid) to service_role;

create or replace function public.recruitment_review_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
declare starting boolean; saving boolean; proposed jsonb; previous jsonb; checks jsonb := '{}'; documents jsonb := '[]'; item jsonb; old_item jsonb; normalized jsonb; key text; path text; evidence jsonb; complete integer := 0; missing boolean := false; pending_documents boolean := false; follow_up text;
begin
  if tg_op = 'INSERT' then
    if new.review_json is distinct from '{}'::jsonb or new.review_started_at is not null or new.review_started_by is not null or new.review_updated_at is not null or new.review_updated_by is not null then raise exception 'Start review after an application is submitted'; end if;
    new.review_status := 'not_started'; return new;
  end if;
  starting := old.status in ('application_submitted','documents_uploaded') and new.status = 'under_review' and old.review_started_at is null;
  saving := new.review_json is distinct from old.review_json;
  if starting then
    if not public.recruitment_documents_complete(new.documents_json,new.document_waivers_json) then raise exception 'Complete the required document pack before starting review'; end if;
    if auth.uid() is null or old.application_submitted_at is null or old.application_json->>'version' is distinct from 'recruitment-application-v1' then raise exception 'A submitted application is required to start review'; end if;
    new.review_started_at := now(); new.review_started_by := auth.uid();
    proposed := jsonb_build_object('version','recruitment-review-v1','checks','{}'::jsonb,'documents','[]'::jsonb,'notes','','followUpOn','');
    previous := '{}';
  else
    if new.review_started_at is distinct from old.review_started_at or new.review_started_by is distinct from old.review_started_by then raise exception 'Review start details cannot be changed'; end if;
    if not saving and (new.review_updated_at is distinct from old.review_updated_at or new.review_updated_by is distinct from old.review_updated_by) then raise exception 'Review update details cannot be changed'; end if;
    if saving and (auth.uid() is null or old.status <> 'under_review' or new.status <> 'under_review' or old.review_started_at is null) then raise exception 'Review findings can only be saved during Under Review'; end if;
    proposed := new.review_json; previous := old.review_json;
  end if;
  if starting or saving then
    if jsonb_typeof(proposed) is distinct from 'object' or proposed->>'version' is distinct from 'recruitment-review-v1' or jsonb_typeof(proposed->'checks') is distinct from 'object' or jsonb_typeof(proposed->'documents') is distinct from 'array' then raise exception 'Invalid review record'; end if;
    if jsonb_typeof(proposed->'notes') is distinct from 'string' or length(proposed->>'notes') > 3000 or jsonb_typeof(proposed->'followUpOn') is distinct from 'string' then raise exception 'Invalid review notes or follow-up date'; end if;
    follow_up := proposed->>'followUpOn';
    if follow_up <> '' and (follow_up !~ '^\d{4}-\d{2}-\d{2}$' or to_char(follow_up::date,'YYYY-MM-DD') <> follow_up) then raise exception 'Invalid review follow-up date'; end if;
    foreach key in array array['registration','qualifications','training','handover'] loop
      item := case when starting then jsonb_build_object('status','pending','notes','','evidence','[]'::jsonb) else proposed->'checks'->key end;
      if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'status','') not in ('pending','verified','needs_information','not_applicable') or jsonb_typeof(item->'notes') is distinct from 'string' or length(item->>'notes') > 2000 or (item->>'status' <> 'pending' and length(trim(item->>'notes')) < 5) or jsonb_typeof(item->'evidence') is distinct from 'array' then raise exception 'Review checks require a valid status and a finding or reason'; end if;
      for evidence in select value from jsonb_array_elements(item->'evidence') loop
        path := evidence #>> '{}';
        if jsonb_typeof(evidence) <> 'string' or not exists (select 1 from jsonb_array_elements(new.documents_json) d where d->>'path'=path) or path not like new.organisation_id::text || '/' || new.id::text || '/%' or not exists (select 1 from storage.objects s where s.bucket_id='recruitment-documents' and s.name=path) then raise exception 'Review evidence must be an uploaded document belonging to this lead'; end if;
      end loop;
      normalized := jsonb_build_object('status',item->>'status','notes',trim(item->>'notes'),'evidence',item->'evidence');
      old_item := previous->'checks'->key;
      if normalized is distinct from (old_item - 'updatedAt' - 'updatedBy') then normalized := normalized || jsonb_build_object('updatedAt',now(),'updatedBy',auth.uid()); else normalized := old_item; end if;
      checks := checks || jsonb_build_object(key,normalized);
    end loop;
    for item in select value from jsonb_array_elements(proposed->'documents') loop
      path := item->>'path';
      if jsonb_typeof(item) is distinct from 'object' or not exists (select 1 from jsonb_array_elements(new.documents_json) d where d->>'path'=path) or exists (select 1 from jsonb_array_elements(documents) d where d->>'path'=path) or coalesce(item->>'status','') not in ('pending','reviewed','needs_information','not_applicable') or jsonb_typeof(item->'notes') is distinct from 'string' or length(item->>'notes') > 2000 or (item->>'status' <> 'pending' and length(trim(item->>'notes')) < 5) then raise exception 'Document reviews require a valid document, status and finding'; end if;
      if item->>'status' <> 'pending' and (path not like new.organisation_id::text || '/' || new.id::text || '/%' or not exists (select 1 from storage.objects s where s.bucket_id='recruitment-documents' and s.name=path)) then raise exception 'Document reviews require an uploaded file belonging to this lead'; end if;
      normalized := jsonb_build_object('path',path,'status',item->>'status','notes',trim(item->>'notes'));
      select d into old_item from jsonb_array_elements(coalesce(previous->'documents','[]')) d where d->>'path'=path;
      if normalized is distinct from (old_item - 'updatedAt' - 'updatedBy') then normalized := normalized || jsonb_build_object('updatedAt',now(),'updatedBy',auth.uid()); else normalized := old_item; end if;
      documents := documents || jsonb_build_array(normalized);
    end loop;
    if not starting and jsonb_array_length(documents) <> jsonb_array_length(new.documents_json) then raise exception 'Review the current set of uploaded documents'; end if;
    new.review_json := jsonb_build_object('version','recruitment-review-v1','checks',checks,'documents',documents,'notes',trim(proposed->>'notes'),'followUpOn',follow_up);
    new.review_updated_at := now(); new.review_updated_by := auth.uid();
  end if;
  if new.review_started_at is null then new.review_status := 'not_started'; return new; end if;
  for item in select value from jsonb_each(new.review_json->'checks') loop
    if item->>'status' in ('verified','not_applicable') then complete := complete + 1; end if;
    if item->>'status' = 'needs_information' then missing := true; end if;
  end loop;
  for item in select value from jsonb_array_elements(new.documents_json) loop
    select d into normalized from jsonb_array_elements(new.review_json->'documents') d where d->>'path'=item->>'path';
    if normalized->>'status' = 'needs_information' then missing := true; end if;
    if normalized is null or normalized->>'status' not in ('reviewed','not_applicable') then pending_documents := true; end if;
  end loop;
  new.review_status := case when missing then 'needs_information' when complete=4 and not pending_documents then 'ready_for_approval' else 'in_progress' end;
  return new;
end;
$$;

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
      (old.status = 'application_submitted' and new.status = 'documents_uploaded' and new.documents_uploaded_at is not null) or
      (old.status in ('application_submitted','documents_uploaded') and new.status = 'under_review' and new.review_started_at is not null and old.application_submitted_at is not null) or
      (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined')) or
      (old.status = 'closed_lost' and new.status = case when old.onboarding_completed_at is not null then 'onboarding_complete' when old.contract_signature_json <> '{}'::jsonb then 'contract_signed' when old.contract_delivery_json <> '{}'::jsonb then 'contract_sent' when old.approved_at is not null then 'application_approved' when old.review_started_at is not null then 'under_review' when old.documents_uploaded_at is not null then 'documents_uploaded' when old.application_submitted_at is not null then 'application_submitted' else 'lead_received' end)
    ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
    if submitting then new.application_submitted_at := now(); end if;
    event_type := case when new.rejection_json is distinct from old.rejection_json then 'application_rejected' when old.contacted_at is null and new.contacted_at is not null then 'lead_contacted' when new.documents_json is distinct from old.documents_json then 'document_uploaded' when new.document_waivers_json is distinct from old.document_waivers_json then 'document_exception_recorded' when old.activated_at is null and new.activated_at is not null then 'agent_activated' when new.activation_json is distinct from old.activation_json then 'agent_access_prepared' when old.onboarding_completed_at is null and new.onboarding_completed_at is not null then 'onboarding_completed' when new.onboarding_documents_json is distinct from old.onboarding_documents_json then 'onboarding_document_uploaded' when new.onboarding_json is distinct from old.onboarding_json then 'onboarding_updated' when new.contract_signature_json is distinct from old.contract_signature_json then 'contract_signed' when new.contract_delivery_json is distinct from old.contract_delivery_json then 'contract_delivery_recorded' when new.contracts_json is distinct from old.contracts_json then 'contract_prepared' when submitting then 'application_submitted' when old.approved_at is null and new.approved_at is not null then 'application_approved' when old.review_started_at is null and new.review_started_at is not null then 'review_started' when new.review_updated_at is distinct from old.review_updated_at or new.review_json is distinct from old.review_json then 'review_updated' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' and new.status <> 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel','reviewStatus',new.review_status));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;


create or replace function public.recruitment_start_review(p_organisation_id uuid,p_lead_id uuid,p_version integer)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
begin
 perform public.recruitment_assert_joining_manager(p_organisation_id);
 return query update public.recruitment_leads set status='under_review' where organisation_id=p_organisation_id and id=p_lead_id and version=p_version
  and status in ('application_submitted','documents_uploaded') and application_submitted_at is not null returning *;
 if not found then raise exception 'This application changed. Reload before starting review' using errcode='40001'; end if;
end; $$;

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
    'applicationSubmittedAt',candidate.application_submitted_at,'documents',candidate.documents_json,'documentWaivers',candidate.document_waivers_json,'documentsEditable',candidate.application_submitted_at is not null and candidate.approved_at is null,'documentsComplete',public.recruitment_documents_complete(candidate.documents_json,candidate.document_waivers_json),'submittedApplication',case when candidate.application_json->>'questionnaireVersion'='recruitment-profile-v1' then jsonb_build_object('answers',candidate.application_json->'answers','submittedAt',candidate.application_submitted_at,'consentVersion',candidate.application_json->>'consentVersion') else null end,
    'contact',jsonb_build_object('firstName',candidate.contact_capture_json->>'firstName','lastName',candidate.contact_capture_json->>'lastName',
      'email',candidate.contact_capture_json->>'email','phone',candidate.contact_capture_json->>'phone'));
end; $$;


alter table public.recruitment_invitation_deliveries drop constraint recruitment_invitation_deliveries_kind_check;
alter table public.recruitment_invitation_deliveries add constraint recruitment_invitation_deliveries_kind_check check(kind in ('application','workspace','documents_reminder','approval'));
create or replace function public.recruitment_begin_invitation_email(p_actor uuid,p_organisation_id uuid,p_lead_id uuid,p_kind text,p_reference_id uuid,p_request_id uuid,p_token_hash text,p_message jsonb,p_allow_duplicate boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.recruitment_leads%rowtype; i public.invites%rowtype; k public.recruitment_intake_links%rowtype; a public.recruitment_invitation_deliveries%rowtype; latest public.recruitment_invitation_deliveries%rowtype;
begin
 if p_actor is null or not exists(select 1 from public.organisation_users m where m.user_id=p_actor and m.organisation_id=p_organisation_id and m.status='active' and m.role in ('owner','principal','admin','super_admin')) then raise exception 'Organisation management access required' using errcode='42501'; end if;
 select * into l from public.recruitment_leads where id=p_lead_id and organisation_id=p_organisation_id for update;
 if l.id is null then raise exception 'Recruitment record unavailable'; end if;
 if l.email is null or lower(trim(l.email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Save a valid applicant email before sending'; end if;
 if p_kind='application' then
  select * into k from public.recruitment_intake_links where id=p_reference_id and organisation_id=p_organisation_id and lead_id=l.id for share;
  if l.status<>'lead_received' or k.id is null or k.channel<>'private_link' or k.revoked_at is not null or k.submitted_at is not null or k.expires_at<=now() or k.token_hash is distinct from p_token_hash then raise exception 'Application invitation is unavailable, expired or does not match this record'; end if;
 elsif p_kind='workspace' then
  select * into i from public.invites where id=p_reference_id for share;
  if l.status<>'onboarding_complete' or l.onboarding_completed_at is null or l.activation_json->>'state' is distinct from 'awaiting_acceptance' or l.activation_json->>'inviteId' is distinct from p_reference_id::text or i.id is null or i.target_workspace_id is distinct from p_organisation_id or i.status<>'pending' or i.token is null or (i.expires_at is not null and i.expires_at<=now()) or i.invite_type not in ('workspace_invite','branch_invite') or lower(trim(i.email)) is distinct from lower(trim(l.email)) or i.target_workspace_role is distinct from coalesce(l.activation_json->'joiningPlan'->>'role','agent') or (l.activation_json ? 'joiningPlan' and i.target_branch_id is distinct from (l.activation_json->'joiningPlan'->>'branchId')::uuid) then raise exception 'Workspace invitation is unavailable, expired or does not match the reviewed access'; end if;
  if l.activation_json ? 'joiningPlan' then perform public.recruitment_activation_plan(p_organisation_id,l.activation_json->'joiningPlan'); end if;
 elsif p_kind in ('documents_reminder','approval') then
  if p_reference_id is distinct from l.id or l.status in ('closed_lost','agent_activated','legacy_joined') then raise exception 'Recruitment email is unavailable'; end if;
  if p_kind='documents_reminder' and (l.application_submitted_at is null or l.email_verification_status<>'verified' or l.approved_at is not null or lower(l.email) is distinct from lower(l.contact_capture_json->>'email')) then raise exception 'A submitted verified application is required for a document reminder'; end if;
  if p_kind='approval' and (l.approved_at is null or lower(trim(l.email)) is distinct from lower(l.approval_snapshot->'agent'->>'email')) then raise exception 'Approve the application before sending an approval notice'; end if;
 else raise exception 'Choose a recruitment email'; end if;
 select * into a from public.recruitment_invitation_deliveries where id=p_request_id;
 if a.id is not null and (a.organisation_id<>p_organisation_id or a.lead_id<>p_lead_id or a.kind<>p_kind or a.reference_id<>p_reference_id or a.recipient<>lower(trim(l.email))) then raise exception 'Sending request belongs to another invitation'; end if;
 select * into latest from public.recruitment_invitation_deliveries where organisation_id=p_organisation_id and lead_id=p_lead_id and kind=p_kind and reference_id=p_reference_id order by created_at desc limit 1;
 if a.id is not null and a.status<>'provider_accepted' and latest.id is distinct from a.id then a:=latest; end if;
 if a.id is null and latest.status in ('sending','unknown','failed') then
  if latest.created_at>now()-interval '23 hours' then a:=latest;
  elsif latest.status<>'failed' and p_allow_duplicate is distinct from true then raise exception 'Previous email result is uncertain. Review it before explicitly sending another email'; end if;
 end if;
 if p_kind='approval' and latest.status='provider_accepted' then a:=latest; end if;
 if a.status='provider_accepted' then return jsonb_build_object('send',false,'attempt',to_jsonb(a)-'message_json'-'lease_id'-'leased_at'); end if;
 if a.id is not null then
  if a.created_at<=now()-interval '23 hours' then raise exception 'Retry window ended. Review the previous result and explicitly send another email'; end if;
  if a.recipient is distinct from lower(trim(l.email)) then raise exception 'Recipient changed. Review the saved record before sending again'; end if;
  if a.status='sending' and a.leased_at>now()-interval '60 seconds' then return jsonb_build_object('send',false,'busy',true,'attempt',to_jsonb(a)-'message_json'-'lease_id'-'leased_at'); end if;
  update public.recruitment_invitation_deliveries set status='sending',lease_id=gen_random_uuid(),leased_at=now(),updated_at=now() where id=a.id returning * into a;
 else
  if p_request_id is null or p_message is null or jsonb_typeof(p_message)<>'object' or p_message->>'to' is distinct from lower(trim(l.email)) then raise exception 'Email request is incomplete'; end if;
  if latest.created_at>now()-interval '60 seconds' then raise exception 'Please wait a minute before sending another email'; end if;
  insert into public.recruitment_invitation_deliveries(id,organisation_id,lead_id,kind,reference_id,recipient,requested_by,message_json) values(p_request_id,p_organisation_id,p_lead_id,p_kind,p_reference_id,lower(trim(l.email)),p_actor,p_message) returning * into a;
 end if;
 return jsonb_build_object('send',true,'attempt',to_jsonb(a));
end;
$$;

create or replace function public.recruitment_invitation_status(p_organisation_id uuid,p_lead_id uuid,p_kind text,p_reference_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.recruitment_leads%rowtype; i public.invites%rowtype; k public.recruitment_intake_links%rowtype; a public.recruitment_invitation_deliveries%rowtype; state text; expiry timestamptz;
begin
 perform public.recruitment_assert_joining_manager(p_organisation_id);
 select * into l from public.recruitment_leads where id=p_lead_id and organisation_id=p_organisation_id;
 if l.id is null then raise exception 'Recruitment record unavailable'; end if;
 if p_kind='application' then
  select * into k from public.recruitment_intake_links where id=p_reference_id and lead_id=l.id and organisation_id=p_organisation_id;
  if k.id is null then raise exception 'Application invitation unavailable'; end if;
  state:=case when k.submitted_at is not null then 'submitted' when k.revoked_at is not null then 'revoked' when k.expires_at<=now() then 'expired' when l.status<>'lead_received' then 'unavailable' else 'prepared' end; expiry:=k.expires_at;
 elsif p_kind='workspace' then
  select * into i from public.invites where id=p_reference_id and target_workspace_id=p_organisation_id;
  if i.id is null or not coalesce((p_reference_id=l.joining_invite_id or p_reference_id::text=l.activation_json->>'inviteId' or exists(select 1 from jsonb_array_elements(coalesce(l.activation_json->'inviteHistory','[]')) h where h->>'inviteId'=p_reference_id::text)),false) then raise exception 'Workspace invitation unavailable'; end if;
  state:=case when i.status='pending' and i.expires_at<=now() then 'expired' when i.status='pending' then 'prepared' else i.status end; expiry:=i.expires_at;
 elsif p_kind in ('documents_reminder','approval') then
  if p_reference_id is distinct from l.id then raise exception 'Recruitment email unavailable'; end if;
  state:=case when l.status in ('closed_lost','agent_activated','legacy_joined') then 'unavailable' when p_kind='approval' and l.approved_at is not null then 'prepared' when p_kind='documents_reminder' and l.application_submitted_at is not null and l.email_verification_status='verified' and l.approved_at is null then 'prepared' else 'unavailable' end;
 else raise exception 'Unknown invitation type'; end if;
 select * into a from public.recruitment_invitation_deliveries where organisation_id=p_organisation_id and lead_id=p_lead_id and kind=p_kind and reference_id=p_reference_id order by created_at desc limit 1;
 return jsonb_build_object('referenceStatus',state,'expiresAt',expiry,'recipient',l.email,'queueStatus',case when p_kind='approval' then (select q.status from public.recruitment_approval_email_queue q where q.lead_id=l.id) else null end,'attempt',case when a.id is null then null else (to_jsonb(a)-'message_json'-'lease_id'-'leased_at')||jsonb_build_object('reviewRequired',a.status in ('unknown','sending') and a.created_at<=now()-interval '23 hours','retryWindowEnded',a.created_at<=now()-interval '23 hours') end);
end;
$$;

create or replace function public.recruitment_joining_progress(p_organisation_id uuid,p_branch_id uuid default null,p_offset integer default 0,p_commercial boolean default false,p_limited boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_limited then perform recruitment_private.assert_branch(p_organisation_id,p_branch_id);
 else perform public.recruitment_assert_joining_manager(p_organisation_id); end if;
 select coalesce(jsonb_agg(row_value order by created_at desc,id),'[]'::jsonb) into result from (
  select l.id,l.created_at,jsonb_build_object('id',l.id,'name',l.name,'status',l.status,'joining_branch_id',l.joining_json->>'branchId','activation_state',l.activation_json->>'state',
   'invitation_state',case
    when i.status='accepted' then 'access_accepted'
    when i.status='revoked' then 'access_revoked'
    when i.status='expired' or (i.expires_at<=now() and i.status='pending') then 'access_expired'
    when l.application_submitted_at is not null and i.id is null then 'application_submitted'
    when k.submitted_at is not null and i.id is null then 'application_submitted'
    when k.revoked_at is not null and i.id is null then 'application_revoked'
    when k.expires_at<=now() and i.id is null then 'application_expired'
    when a.status='failed' then 'email_failed'
    when a.status in ('sending','unknown') then 'email_uncertain'
    when a.status='provider_accepted' then 'email_provider_accepted'
    when i.status='pending' then 'access_prepared'
    when k.id is not null then 'application_prepared'
    else 'not_prepared' end)||case when p_limited then '{}'::jsonb else jsonb_build_object('email',l.email,'phone',l.phone) end row_value
  from public.recruitment_leads l
  left join public.invites i on i.id=(l.activation_json->>'inviteId')::uuid and i.target_workspace_id=l.organisation_id
  left join lateral(select * from public.recruitment_intake_links x where x.organisation_id=l.organisation_id and x.lead_id=l.id and x.channel='private_link' order by x.created_at desc,x.id limit 1) k on true
  left join lateral(select x.status from public.recruitment_invitation_deliveries x where x.organisation_id=l.organisation_id and x.lead_id=l.id and x.reference_id=coalesce(i.id,k.id) and x.kind=case when i.id is not null then 'workspace' else 'application' end order by x.created_at desc,x.id limit 1) a on true
  where l.organisation_id=p_organisation_id and l.status in ('lead_received','application_submitted','documents_uploaded','under_review','application_approved','contract_sent','contract_signed','onboarding_complete')
   and (p_branch_id is null or l.joining_json->>'branchId'=p_branch_id::text)
   and (not p_commercial or l.joining_json->>'role'='commercial_broker' or l.joining_json->'origin'->>'entryPoint'='commercial_brokers')
  order by l.created_at desc,l.id limit 200 offset greatest(coalesce(p_offset,0),0)
 ) rows;
 return result;
end;
$$;

-- Approval notices are queued atomically with the decision. No historical approvals
-- are backfilled. A scheduled worker recovers a browser close or provider timeout.
create table public.recruitment_approval_email_queue(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,lead_id uuid not null unique,actor_id uuid not null,
 status text not null default 'pending' check(status in ('pending','sending','provider_accepted','needs_attention')),
 next_attempt_at timestamptz not null default now(),attempts integer not null default 0,
 created_at timestamptz not null default now(),last_error text,
 foreign key(organisation_id,lead_id) references public.recruitment_leads(organisation_id,id));
alter table public.recruitment_approval_email_queue enable row level security;
revoke all on public.recruitment_approval_email_queue from public,anon,authenticated;
grant select,insert,update on public.recruitment_approval_email_queue to service_role;
create function public.recruitment_queue_approval_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.approved_at is null and new.approved_at is not null then
  insert into public.recruitment_approval_email_queue(organisation_id,lead_id,actor_id)
   values(new.organisation_id,new.id,new.approved_by) on conflict(lead_id) do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.recruitment_queue_approval_email() from public,anon,authenticated;
create trigger zz_recruitment_approval_email after update on public.recruitment_leads for each row execute function public.recruitment_queue_approval_email();

create function public.recruitment_claim_approval_emails(p_limit integer default 10)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 -- Never reuse an uncertain provider idempotency key outside its safe window.
 update public.recruitment_approval_email_queue set status='needs_attention',last_error='retry_window_ended'
  where status in ('pending','sending') and created_at<now()-interval '23 hours';
 with claimed as (
  update public.recruitment_approval_email_queue q set status='sending',attempts=q.attempts+1,next_attempt_at=now()+interval '2 minutes'
   where q.id in (select id from public.recruitment_approval_email_queue where status in ('pending','sending') and next_attempt_at<=now()
    order by created_at for update skip locked limit greatest(1,least(coalesce(p_limit,10),10))) returning *
 ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
 return result;
end; $$;
create function public.recruitment_complete_approval_email(p_id uuid,p_accepted boolean,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 update public.recruitment_approval_email_queue set status=case when p_accepted then 'provider_accepted' when p_error='controlled_test_recipient' then 'needs_attention' else 'pending' end,
  last_error=left(p_error,80),next_attempt_at=now()+interval '5 minutes' where id=p_id and status='sending';
 return found;
end; $$;
revoke all on function public.recruitment_claim_approval_emails(integer),public.recruitment_complete_approval_email(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.recruitment_claim_approval_emails(integer),public.recruitment_complete_approval_email(uuid,boolean,text) to service_role;

create function public.recruitment_run_approval_dispatcher() returns jsonb
language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text; request_id bigint;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
 select decrypted_secret into service_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
 if nullif(trim(project_url),'') is null or nullif(trim(service_key),'') is null then return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing'); end if;
 select net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/recruitment-approval-dispatcher',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key,'apikey',service_key),
  body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return jsonb_build_object('scheduled',true,'requestId',request_id);
end; $$;
revoke all on function public.recruitment_run_approval_dispatcher() from public,anon,authenticated;
grant execute on function public.recruitment_run_approval_dispatcher() to service_role;
-- Local PostgreSQL fixtures have no cron extension; production uses the existing
-- platform Vault/pg_net scheduler, with no new secrets or untrusted callback URLs.
do $$ begin
 if to_regclass('cron.job') is not null then
  execute $cron$select cron.schedule('arch9-recruitment-approval-dispatcher-1m','* * * * *','select public.recruitment_run_approval_dispatcher();')$cron$;
 end if;
end $$;
create or replace function public.recruitment_approval_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
declare approving boolean; doc jsonb; evidence jsonb;
begin
  if tg_op='INSERT' then
    if new.approved_at is not null or new.approved_by is not null or new.approval_notes<>'' or new.approval_snapshot<>'{}'::jsonb then raise exception 'Approval requires a completed saved review'; end if;
    return new;
  end if;
  approving := old.status='under_review' and new.status='application_approved' and old.approved_at is null;
  if approving then
    if auth.uid() is null or old.application_submitted_at is null or old.review_started_at is null or old.review_status<>'ready_for_approval' or new.review_status<>'ready_for_approval' then raise exception 'Approval requires a completed saved review'; end if;
    if new.review_json is distinct from old.review_json or new.documents_json is distinct from old.documents_json or new.details_json is distinct from old.details_json or row(new.name,new.email,new.phone,new.area,new.source) is distinct from row(old.name,old.email,old.phone,old.area,old.source) then raise exception 'Save all changes before approval'; end if;
    if length(trim(new.approval_notes))<5 or length(new.approval_notes)>3000 then raise exception 'Approval requires a decision reason of 5 to 3000 characters'; end if;
    for doc in select value from jsonb_array_elements(old.documents_json) loop
      if not exists (select 1 from storage.objects s where s.bucket_id='recruitment-documents' and s.name=doc->>'path') then raise exception 'Approval evidence is missing; restore the uploaded document before approval'; end if;
    end loop;
    for evidence in select e.value from jsonb_each(old.review_json->'checks') c cross join lateral jsonb_array_elements(c.value->'evidence') e loop
      if not exists (select 1 from jsonb_array_elements(old.documents_json) d where d->>'path'=evidence #>> '{}') then raise exception 'Approval evidence must belong to the reviewed documents'; end if;
    end loop;
    new.approved_at:=now(); new.approved_by:=auth.uid(); new.approval_notes:=trim(new.approval_notes);
    new.approval_snapshot:=jsonb_build_object('version','recruitment-approval-v1','leadVersion',old.version,'application',old.application_json,'review',old.review_json,'documents',old.documents_json,'documentExceptions',old.document_waivers_json,'agent',jsonb_build_object('name',old.name,'email',old.email,'phone',old.phone,'area',old.area,'source',old.source,'details',old.details_json));
  else
    if new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by or new.approval_notes is distinct from old.approval_notes or new.approval_snapshot is distinct from old.approval_snapshot then raise exception 'Approval details cannot be changed'; end if;
    if old.approved_at is not null and new.documents_json is distinct from old.documents_json then raise exception 'Approved review documents are locked'; end if;
  end if;
  return new;
end;
$$;

notify pgrst,'reload schema';
commit;
