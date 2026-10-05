begin;
alter table public.recruitment_leads
  add column approved_at timestamptz,
  add column approved_by uuid,
  add column approval_notes text not null default '',
  add column approval_snapshot jsonb not null default '{}' check (jsonb_typeof(approval_snapshot)='object');

-- Run after the review guard has derived readiness, before the activity stamp.
create function public.recruitment_approval_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
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
    new.approval_snapshot:=jsonb_build_object('version','recruitment-approval-v1','leadVersion',old.version,'application',old.application_json,'review',old.review_json,'documents',old.documents_json,'agent',jsonb_build_object('name',old.name,'email',old.email,'phone',old.phone,'area',old.area,'source',old.source,'details',old.details_json));
  else
    if new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by or new.approval_notes is distinct from old.approval_notes or new.approval_snapshot is distinct from old.approval_snapshot then raise exception 'Approval details cannot be changed'; end if;
    if old.approved_at is not null and new.documents_json is distinct from old.documents_json then raise exception 'Approved review documents are locked'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.recruitment_approval_guard() from public,anon,authenticated;
create trigger b_recruitment_approval_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_approval_guard();
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
      (old.status = 'under_review' and new.status = 'application_approved' and new.approved_at is not null) or
      (old.status = 'application_submitted' and new.status = 'under_review' and new.review_started_at is not null and old.application_submitted_at is not null) or
      (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined')) or
      (old.status = 'closed_lost' and new.status = case when old.approved_at is not null then 'application_approved' when old.review_started_at is not null then 'under_review' when old.application_submitted_at is not null then 'application_submitted' else 'lead_received' end)
    ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
    if submitting then new.application_submitted_at := now(); end if;
    event_type := case when submitting then 'application_submitted' when old.approved_at is null and new.approved_at is not null then 'application_approved' when old.review_started_at is null and new.review_started_at is not null then 'review_started' when new.review_updated_at is distinct from old.review_updated_at or new.review_json is distinct from old.review_json then 'review_updated' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' and new.status <> 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel','reviewStatus',new.review_status));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;

create function public.recruitment_approve_application(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_notes text)
returns setof public.recruitment_leads language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Organisation management access required' using errcode='42501'; end if;
  return query update public.recruitment_leads set status='application_approved',approval_notes=p_notes
    where organisation_id=p_organisation_id and id=p_lead_id and version=p_version and status='under_review' and approved_at is null returning *;
  if not found then raise exception 'This application changed or access was removed. Reload before approving' using errcode='40001'; end if;
end;
$$;
revoke all on function public.recruitment_approve_application(uuid,uuid,integer,text) from public,anon;
grant execute on function public.recruitment_approve_application(uuid,uuid,integer,text) to authenticated;
-- Retain approved decisions and their referenced files for management users.
create policy recruitment_approved_record_retention on public.recruitment_leads as restrictive for delete to authenticated using (approved_at is null);
create policy recruitment_approved_document_retention on storage.objects as restrictive for delete to authenticated using (
  bucket_id <> 'recruitment-documents' or not exists (
    select 1 from public.recruitment_leads l cross join lateral jsonb_array_elements(l.approval_snapshot->'documents') d
    where l.id::text=(storage.foldername(storage.objects.name))[2]
      and l.organisation_id::text=(storage.foldername(storage.objects.name))[1]
      and l.approved_at is not null and d->>'path'=storage.objects.name
  )
);
-- Also prevent replacing or renaming evidence if another storage policy grants updates.
create policy recruitment_approved_document_immutable on storage.objects as restrictive for update to authenticated using (
  bucket_id <> 'recruitment-documents' or not exists (
    select 1 from public.recruitment_leads l cross join lateral jsonb_array_elements(l.approval_snapshot->'documents') d
    where l.id::text=(storage.foldername(storage.objects.name))[2]
      and l.organisation_id::text=(storage.foldername(storage.objects.name))[1]
      and l.approved_at is not null and d->>'path'=storage.objects.name
  )
) with check (
  bucket_id <> 'recruitment-documents' or not exists (
    select 1 from public.recruitment_leads l cross join lateral jsonb_array_elements(l.approval_snapshot->'documents') d
    where l.id::text=(storage.foldername(storage.objects.name))[2]
      and l.organisation_id::text=(storage.foldername(storage.objects.name))[1]
      and l.approved_at is not null and d->>'path'=storage.objects.name
  )
);
commit;
