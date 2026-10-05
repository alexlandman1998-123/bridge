begin;
alter table public.recruitment_leads
  add column review_json jsonb not null default '{}' check (jsonb_typeof(review_json)='object'),
  add column review_started_at timestamptz,
  add column review_started_by uuid,
  add column review_updated_at timestamptz,
  add column review_updated_by uuid,
  add column review_status text not null default 'not_started' check (review_status in ('not_started','in_progress','needs_information','ready_for_approval'));

-- Review metadata and item stamps are always authored by the database.
create function public.recruitment_review_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
declare starting boolean; saving boolean; proposed jsonb; previous jsonb; checks jsonb := '{}'; documents jsonb := '[]'; item jsonb; old_item jsonb; normalized jsonb; key text; path text; evidence jsonb; complete integer := 0; missing boolean := false; pending_documents boolean := false; follow_up text;
begin
  if tg_op = 'INSERT' then
    if new.review_json is distinct from '{}'::jsonb or new.review_started_at is not null or new.review_started_by is not null or new.review_updated_at is not null or new.review_updated_by is not null then raise exception 'Start review after an application is submitted'; end if;
    new.review_status := 'not_started'; return new;
  end if;
  starting := old.status = 'application_submitted' and new.status = 'under_review' and old.review_started_at is null;
  saving := new.review_json is distinct from old.review_json;
  if starting then
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
revoke all on function public.recruitment_review_guard() from public,anon,authenticated;
create trigger a_recruitment_review_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_review_guard();
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
      (old.status = 'application_submitted' and new.status = 'under_review' and new.review_started_at is not null and old.application_submitted_at is not null) or
      (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined')) or
      (old.status = 'closed_lost' and new.status = case when old.review_started_at is not null then 'under_review' when old.application_submitted_at is not null then 'application_submitted' else 'lead_received' end)
    ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
    if submitting then new.application_submitted_at := now(); end if;
    event_type := case when submitting then 'application_submitted' when old.review_started_at is null and new.review_started_at is not null then 'review_started' when new.review_updated_at is distinct from old.review_updated_at or new.review_json is distinct from old.review_json then 'review_updated' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' and new.status <> 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel','reviewStatus',new.review_status));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;
create function public.recruitment_start_review(p_organisation_id uuid,p_lead_id uuid,p_version integer)
returns setof public.recruitment_leads language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Organisation management access required' using errcode='42501'; end if;
  return query update public.recruitment_leads set status='under_review' where organisation_id=p_organisation_id and id=p_lead_id and version=p_version and status='application_submitted' and application_submitted_at is not null returning *;
  if not found then raise exception 'This application changed or access was removed. Reload before starting review' using errcode='40001'; end if;
end;
$$;
revoke all on function public.recruitment_start_review(uuid,uuid,integer) from public,anon;
grant execute on function public.recruitment_start_review(uuid,uuid,integer) to authenticated;
commit;
