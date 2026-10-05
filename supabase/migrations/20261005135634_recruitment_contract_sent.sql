begin;
alter table public.recruitment_leads add column contracts_json jsonb not null default '[]' check (jsonb_typeof(contracts_json)='array');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('recruitment-contracts','recruitment-contracts',false,10485760,array['application/pdf']);
create policy recruitment_contract_read on storage.objects for select to authenticated using (
  bucket_id='recruitment-contracts' and exists (select 1 from public.recruitment_leads l where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2])
);
create policy recruitment_contract_insert on storage.objects for insert to authenticated with check (
  bucket_id='recruitment-contracts' and exists (select 1 from public.recruitment_leads l where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2] and l.status='application_approved' and l.approved_at is not null)
);
-- Only unregistered uploads can be cleaned up; prepared versions are retained.
create policy recruitment_contract_cleanup on storage.objects for delete to authenticated using (
  bucket_id='recruitment-contracts' and owner_id=(select auth.uid())::text
  and exists (select 1 from public.recruitment_leads l where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2])
);
create policy recruitment_contract_retention on storage.objects as restrictive for delete to authenticated using (
  bucket_id<>'recruitment-contracts' or not exists (select 1 from public.recruitment_leads l cross join lateral jsonb_array_elements(l.contracts_json) c where l.id::text=(storage.foldername(storage.objects.name))[2] and l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and c->>'path'=storage.objects.name)
);
create policy recruitment_contract_immutable_file on storage.objects as restrictive for update to authenticated using (bucket_id<>'recruitment-contracts') with check (bucket_id<>'recruitment-contracts');

create function public.recruitment_contract_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; prefix jsonb; total integer; path text;
begin
  if tg_op='INSERT' then
    if new.contracts_json<>'[]'::jsonb then raise exception 'Prepare a contract after approval'; end if;
    return new;
  end if;
  if new.contracts_json is distinct from old.contracts_json then
    if auth.uid() is null or old.status<>'application_approved' or new.status<>old.status or old.approved_at is null then raise exception 'Prepare a contract only for an approved active application'; end if;
    total:=jsonb_array_length(new.contracts_json);
    if total<>jsonb_array_length(old.contracts_json)+1 or total>20 then raise exception 'Contract versions must be appended and retained'; end if;
    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into prefix from jsonb_array_elements(new.contracts_json) with ordinality where ordinality<total;
    if prefix is distinct from old.contracts_json then raise exception 'Prepared contract versions cannot be changed'; end if;
    item:=new.contracts_json->(total-1); path:=item->>'path';
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 254 or jsonb_typeof(item->'size') is distinct from 'number' or (item->>'size')::numeric not between 1 and 10485760 or (item->>'size')::numeric<>trunc((item->>'size')::numeric) or path is null or path not like new.organisation_id::text||'/'||new.id::text||'/%' or exists(select 1 from jsonb_array_elements(old.contracts_json) c where c->>'path'=path) then raise exception 'Invalid contract PDF details'; end if;
    if not exists(select 1 from storage.objects s where s.bucket_id='recruitment-contracts' and s.name=path) then raise exception 'Upload the private contract PDF before preparing it'; end if;
    new.contracts_json:=old.contracts_json||jsonb_build_array(jsonb_build_object('version',total,'path',path,'name',trim(item->>'name'),'size',(item->>'size')::integer,'preparedAt',now(),'preparedBy',auth.uid(),'approvedAt',old.approved_at,'approvalLeadVersion',old.approval_snapshot->'leadVersion'));
  end if;
  return new;
end;
$$;
revoke all on function public.recruitment_contract_guard() from public,anon,authenticated;
create trigger c_recruitment_contract_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_contract_guard();

create function public.recruitment_prepare_contract(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_document jsonb)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Organisation management access required' using errcode='42501'; end if;
  return query update public.recruitment_leads set contracts_json=contracts_json||jsonb_build_array(p_document)
    where organisation_id=p_organisation_id and id=p_lead_id and version=p_version and status='application_approved' returning *;
  if not found then raise exception 'This application changed or access was removed. Reload before preparing the contract' using errcode='40001'; end if;
end;
$$;
revoke all on function public.recruitment_prepare_contract(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.recruitment_prepare_contract(uuid,uuid,integer,jsonb) to authenticated;
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
    event_type := case when new.contracts_json is distinct from old.contracts_json then 'contract_prepared' when submitting then 'application_submitted' when old.approved_at is null and new.approved_at is not null then 'application_approved' when old.review_started_at is null and new.review_started_at is not null then 'review_started' when new.review_updated_at is distinct from old.review_updated_at or new.review_json is distinct from old.review_json then 'review_updated' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' and new.status <> 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel','reviewStatus',new.review_status));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;

commit;
