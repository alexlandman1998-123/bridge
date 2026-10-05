begin;
alter table public.recruitment_leads
  add column onboarding_json jsonb not null default '{}' check(jsonb_typeof(onboarding_json)='object'),
  add column onboarding_documents_json jsonb not null default '[]' check(jsonb_typeof(onboarding_documents_json)='array'),
  add column onboarding_completed_at timestamptz,
  add column onboarding_completed_by uuid,
  add column onboarding_snapshot jsonb not null default '{}' check(jsonb_typeof(onboarding_snapshot)='object');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('recruitment-onboarding-documents','recruitment-onboarding-documents',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy recruitment_onboarding_document_read on storage.objects for select to authenticated using (
  bucket_id='recruitment-onboarding-documents' and exists(select 1 from public.recruitment_leads l where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2])
);
create policy recruitment_onboarding_document_insert on storage.objects for insert to authenticated with check (
  bucket_id='recruitment-onboarding-documents' and exists(select 1 from public.recruitment_leads l where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2] and l.status='contract_signed' and l.onboarding_completed_at is null)
);
create policy recruitment_onboarding_document_cleanup on storage.objects for delete to authenticated using (
  bucket_id='recruitment-onboarding-documents' and owner_id=(select auth.uid())::text and exists(select 1 from public.recruitment_leads l where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2])
);
create policy recruitment_onboarding_document_retention on storage.objects as restrictive for delete to authenticated using (
  bucket_id<>'recruitment-onboarding-documents' or not exists(select 1 from public.recruitment_leads l cross join lateral jsonb_array_elements(l.onboarding_documents_json) d where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2] and d->>'path'=storage.objects.name)
);
create policy recruitment_onboarding_document_immutable on storage.objects as restrictive for update to authenticated using(bucket_id<>'recruitment-onboarding-documents') with check(bucket_id<>'recruitment-onboarding-documents');

create function public.recruitment_onboarding_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare proposed jsonb; item jsonb; normalized jsonb; key text; path text; evidence jsonb; checks jsonb:='{}'; documents jsonb:='[]'; uploading boolean; saving boolean; completing boolean; ready boolean:=true;
begin
  if tg_op='INSERT' then
    if new.onboarding_json<>'{}'::jsonb or new.onboarding_documents_json<>'[]'::jsonb or new.onboarding_completed_at is not null or new.onboarding_completed_by is not null or new.onboarding_snapshot<>'{}'::jsonb then raise exception 'Record onboarding after the signed contract is verified'; end if;
    return new;
  end if;
  uploading:=new.onboarding_documents_json is distinct from old.onboarding_documents_json;
  saving:=new.onboarding_json is distinct from old.onboarding_json;
  completing:=old.status='contract_signed' and new.status='onboarding_complete';
  if old.onboarding_completed_at is not null then
    if uploading or saving or new.onboarding_completed_at is distinct from old.onboarding_completed_at or new.onboarding_completed_by is distinct from old.onboarding_completed_by or new.onboarding_snapshot is distinct from old.onboarding_snapshot then raise exception 'Completed onboarding records cannot be changed'; end if;
    return new;
  end if;
  if new.onboarding_completed_at is distinct from old.onboarding_completed_at or new.onboarding_completed_by is distinct from old.onboarding_completed_by or new.onboarding_snapshot is distinct from old.onboarding_snapshot then raise exception 'Onboarding completion metadata is authored by the database'; end if;
  if not (uploading or saving or completing) then return new; end if;
  if auth.uid() is null or old.status<>'contract_signed' or new.status not in ('contract_signed','onboarding_complete') or old.contract_signature_json='{}'::jsonb then raise exception 'Record onboarding only after the signed contract is verified'; end if;
  if uploading then
    if completing or saving or jsonb_array_length(new.onboarding_documents_json)<>jsonb_array_length(old.onboarding_documents_json)+1 or (new.onboarding_documents_json-(jsonb_array_length(new.onboarding_documents_json)-1)) is distinct from old.onboarding_documents_json then raise exception 'Append one onboarding document without changing retained documents or findings'; end if;
    item:=new.onboarding_documents_json->(jsonb_array_length(new.onboarding_documents_json)-1); path:=item->>'path';
    if jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 254 or coalesce(item->>'type','') not in ('Identity document','Registration evidence','Qualifications','Training / CPD','Agency handover','Induction','Other') or coalesce(item->>'mimeType','') not in ('application/pdf','image/jpeg','image/png') or jsonb_typeof(item->'size') is distinct from 'number' or (item->>'size')::numeric not between 1 and 10485760 or trunc((item->>'size')::numeric)<>(item->>'size')::numeric then raise exception 'Invalid onboarding document details'; end if;
    if path is null or path not like new.organisation_id::text||'/'||new.id::text||'/%' or exists(select 1 from jsonb_array_elements(old.onboarding_documents_json) d where d->>'path'=path) or not exists(select 1 from storage.objects s where s.bucket_id='recruitment-onboarding-documents' and s.name=path) then raise exception 'Upload the onboarding document for this lead'; end if;
    normalized:=jsonb_build_object('path',path,'name',trim(item->>'name'),'type',item->>'type','mimeType',item->>'mimeType','size',(item->>'size')::integer,'uploadedAt',now(),'uploadedBy',auth.uid());
    new.onboarding_documents_json:=old.onboarding_documents_json||jsonb_build_array(normalized);
    if old.onboarding_json<>'{}'::jsonb then new.onboarding_json:=jsonb_set(old.onboarding_json,'{documents}',(old.onboarding_json->'documents')||jsonb_build_array(jsonb_build_object('path',path,'status','pending','notes',''))); end if;
    return new;
  end if;
  proposed:=new.onboarding_json;
  if proposed->>'version' is distinct from 'recruitment-onboarding-v1' or jsonb_typeof(proposed->'checks') is distinct from 'object' or jsonb_typeof(proposed->'documents') is distinct from 'array' or jsonb_typeof(proposed->'notes') is distinct from 'string' or length(proposed->>'notes')>3000 or jsonb_typeof(proposed->'startDate') is distinct from 'string' then raise exception 'Invalid onboarding checklist or notes'; end if;
  if proposed->>'startDate'<>'' and (proposed->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((proposed->>'startDate')::date,'YYYY-MM-DD')<>proposed->>'startDate') then raise exception 'Choose a valid onboarding joining date'; end if;
  foreach key in array array['identity','registration','qualifications','training','handover','induction'] loop
    item:=proposed->'checks'->key;
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'status','') not in ('pending','complete','needs_information','not_applicable') or jsonb_typeof(item->'notes') is distinct from 'string' or length(item->>'notes')>2000 or (item->>'status'<>'pending' and length(trim(item->>'notes'))<5) or jsonb_typeof(item->'evidence') is distinct from 'array' then raise exception 'Onboarding checks require a valid status and finding or reason'; end if;
    for evidence in select value from jsonb_array_elements(item->'evidence') loop
      path:=evidence#>>'{}';
      if jsonb_typeof(evidence)<>'string' or not exists(select 1 from jsonb_array_elements(new.onboarding_documents_json) d where d->>'path'=path) then raise exception 'Onboarding evidence must belong to this lead document pack'; end if;
    end loop;
    normalized:=jsonb_build_object('status',item->>'status','notes',trim(item->>'notes'),'evidence',item->'evidence');
    if normalized is distinct from ((old.onboarding_json->'checks'->key)-'updatedAt'-'updatedBy') then normalized:=normalized||jsonb_build_object('updatedAt',now(),'updatedBy',auth.uid()); else normalized:=old.onboarding_json->'checks'->key; end if;
    checks:=checks||jsonb_build_object(key,normalized);
    if item->>'status' not in ('complete','not_applicable') then ready:=false; end if;
  end loop;
  for item in select value from jsonb_array_elements(proposed->'documents') loop
    path:=item->>'path';
    if path is null or not exists(select 1 from jsonb_array_elements(new.onboarding_documents_json) d where d->>'path'=path) or exists(select 1 from jsonb_array_elements(documents) d where d->>'path'=path) or coalesce(item->>'status','') not in ('pending','reviewed','needs_information','not_applicable') or jsonb_typeof(item->'notes') is distinct from 'string' or length(item->>'notes')>2000 or (item->>'status'<>'pending' and length(trim(item->>'notes'))<5) then raise exception 'Review every onboarding document with a valid status and finding'; end if;
    if not exists(select 1 from storage.objects s where s.bucket_id='recruitment-onboarding-documents' and s.name=path) then raise exception 'An onboarding document is missing'; end if;
    normalized:=jsonb_build_object('path',path,'status',item->>'status','notes',trim(item->>'notes'),'updatedAt',now(),'updatedBy',auth.uid());
    documents:=documents||jsonb_build_array(normalized);
    if item->>'status' not in ('reviewed','not_applicable') then ready:=false; end if;
  end loop;
  if jsonb_array_length(documents)<>jsonb_array_length(new.onboarding_documents_json) then raise exception 'Review the current onboarding document pack'; end if;
  new.onboarding_json:=jsonb_build_object('version','recruitment-onboarding-v1','checks',checks,'documents',documents,'startDate',proposed->>'startDate','notes',trim(proposed->>'notes'),'updatedAt',now(),'updatedBy',auth.uid());
  if completing then
    if not ready or jsonb_array_length(documents)=0 or proposed->>'startDate'='' or length(trim(proposed->>'notes'))<5 or proposed->'confirmed' is distinct from 'true'::jsonb then raise exception 'Resolve onboarding checks, review the document pack, record joining date and confirm completion'; end if;
    if not exists(select 1 from storage.objects s where s.bucket_id='recruitment-signed-contracts' and s.name=old.contract_signature_json->>'path') then raise exception 'The signed contract evidence is missing'; end if;
    new.onboarding_completed_at:=now(); new.onboarding_completed_by:=auth.uid();
    new.onboarding_snapshot:=jsonb_build_object('version','recruitment-onboarding-completion-v1','completedAt',now(),'completedBy',auth.uid(),'contractSignature',old.contract_signature_json,'onboarding',new.onboarding_json,'documents',new.onboarding_documents_json);
  end if;
  return new;
end;
$$;
revoke all on function public.recruitment_onboarding_guard() from public,anon,authenticated;
create trigger e_recruitment_onboarding_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_onboarding_guard();

create or replace function public.recruitment_lead_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
declare event_type text; submitting boolean;
begin
  submitting := coalesce(current_user = 'service_role' and new.status = 'application_submitted'
    and new.application_json->>'version' = 'recruitment-application-v1'
    and new.application_json->'answers'->>'privacyAccepted' = 'true'
    and new.application_json->'answers'->>'declarationAccepted' = 'true',false);
  if tg_op = 'INSERT' then
    if new.status <> 'lead_received' and not submitting then raise exception 'New recruitment enquiries must start at Lead Received'; end if;
    if new.intake_channel <> 'manual' and not submitting then raise exception 'Public intake requires a submitted application'; end if;
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
      (old.status = 'contract_signed' and new.status = 'onboarding_complete' and new.onboarding_completed_at is not null) or
      (old.status = 'contract_sent' and new.status = 'contract_signed' and new.contract_signature_json <> '{}'::jsonb) or
      (old.status = 'under_review' and new.status = 'application_approved' and new.approved_at is not null) or
      (old.status = 'application_submitted' and new.status = 'under_review' and new.review_started_at is not null and old.application_submitted_at is not null) or
      (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined')) or
      (old.status = 'closed_lost' and new.status = case when old.onboarding_completed_at is not null then 'onboarding_complete' when old.contract_signature_json <> '{}'::jsonb then 'contract_signed' when old.contract_delivery_json <> '{}'::jsonb then 'contract_sent' when old.approved_at is not null then 'application_approved' when old.review_started_at is not null then 'under_review' when old.application_submitted_at is not null then 'application_submitted' else 'lead_received' end)
    ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
    if submitting then new.application_submitted_at := now(); end if;
    event_type := case when old.onboarding_completed_at is null and new.onboarding_completed_at is not null then 'onboarding_completed' when new.onboarding_documents_json is distinct from old.onboarding_documents_json then 'onboarding_document_uploaded' when new.onboarding_json is distinct from old.onboarding_json then 'onboarding_updated' when new.contract_signature_json is distinct from old.contract_signature_json then 'contract_signed' when new.contract_delivery_json is distinct from old.contract_delivery_json then 'contract_delivery_recorded' when new.contracts_json is distinct from old.contracts_json then 'contract_prepared' when submitting then 'application_submitted' when old.approved_at is null and new.approved_at is not null then 'application_approved' when old.review_started_at is null and new.review_started_at is not null then 'review_started' when new.review_updated_at is distinct from old.review_updated_at or new.review_json is distinct from old.review_json then 'review_updated' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' and new.status <> 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel','reviewStatus',new.review_status));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;



create function public.recruitment_save_onboarding(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_onboarding jsonb,p_complete boolean default false)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Organisation management access required' using errcode='42501'; end if;
  return query update public.recruitment_leads set onboarding_json=p_onboarding,status=case when p_complete then 'onboarding_complete' else 'contract_signed' end where organisation_id=p_organisation_id and id=p_lead_id and version=p_version and status='contract_signed' returning *;
  if not found then raise exception 'Onboarding changed or access was removed. Reload before saving' using errcode='40001'; end if;
end;
$$;
create function public.recruitment_add_onboarding_document(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_document jsonb)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Organisation management access required' using errcode='42501'; end if;
  return query update public.recruitment_leads set onboarding_documents_json=onboarding_documents_json||jsonb_build_array(p_document) where organisation_id=p_organisation_id and id=p_lead_id and version=p_version and status='contract_signed' returning *;
  if not found then raise exception 'Onboarding changed or access was removed. Reload before uploading' using errcode='40001'; end if;
end;
$$;
revoke all on function public.recruitment_save_onboarding(uuid,uuid,integer,jsonb,boolean) from public,anon;
revoke all on function public.recruitment_add_onboarding_document(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.recruitment_save_onboarding(uuid,uuid,integer,jsonb,boolean) to authenticated;
grant execute on function public.recruitment_add_onboarding_document(uuid,uuid,integer,jsonb) to authenticated;
commit;
