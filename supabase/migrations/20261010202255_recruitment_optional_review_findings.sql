-- Findings are optional for approved and not-applicable items.
-- Rejected items still require a reason; ownership, audit and stage guards are preserved.
begin;

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
      if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'status','') not in ('pending','verified','needs_information','not_applicable') or jsonb_typeof(item->'notes') is distinct from 'string' or length(item->>'notes') > 2000 or (item->>'status' = 'needs_information' and length(trim(item->>'notes')) < 5) or jsonb_typeof(item->'evidence') is distinct from 'array' then raise exception 'Review checks require a valid status, notes up to 2000 characters and a reason for rejected items'; end if;
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
      if jsonb_typeof(item) is distinct from 'object' or not exists (select 1 from jsonb_array_elements(new.documents_json) d where d->>'path'=path) or exists (select 1 from jsonb_array_elements(documents) d where d->>'path'=path) or coalesce(item->>'status','') not in ('pending','reviewed','needs_information','not_applicable') or jsonb_typeof(item->'notes') is distinct from 'string' or length(item->>'notes') > 2000 or (item->>'status' = 'needs_information' and length(trim(item->>'notes')) < 5) then raise exception 'Document reviews require a valid document, status, notes up to 2000 characters and a reason for rejected items'; end if;
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

commit;
