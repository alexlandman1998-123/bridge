begin;
alter table public.recruitment_leads
  add column contract_delivery_json jsonb not null default '{}' check (jsonb_typeof(contract_delivery_json)='object'),
  add column contract_signature_json jsonb not null default '{}' check (jsonb_typeof(contract_signature_json)='object');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('recruitment-signed-contracts','recruitment-signed-contracts',false,10485760,array['application/pdf']);
create policy recruitment_signed_contract_read on storage.objects for select to authenticated using (
  bucket_id='recruitment-signed-contracts' and exists(select 1 from public.recruitment_leads l where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2])
);
create policy recruitment_signed_contract_insert on storage.objects for insert to authenticated with check (
  bucket_id='recruitment-signed-contracts' and exists(select 1 from public.recruitment_leads l where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2] and l.status='contract_sent' and l.contract_delivery_json<>'{}'::jsonb)
);
create policy recruitment_signed_contract_cleanup on storage.objects for delete to authenticated using (
  bucket_id='recruitment-signed-contracts' and owner_id=(select auth.uid())::text and exists(select 1 from public.recruitment_leads l where l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.id::text=(storage.foldername(storage.objects.name))[2])
);
create policy recruitment_signed_contract_retention on storage.objects as restrictive for delete to authenticated using (
  bucket_id<>'recruitment-signed-contracts' or not exists(select 1 from public.recruitment_leads l where l.id::text=(storage.foldername(storage.objects.name))[2] and l.organisation_id::text=(storage.foldername(storage.objects.name))[1] and l.contract_signature_json->>'path'=storage.objects.name)
);
create policy recruitment_signed_contract_immutable on storage.objects as restrictive for update to authenticated using(bucket_id<>'recruitment-signed-contracts') with check(bucket_id<>'recruitment-signed-contracts');

create function public.recruitment_signature_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; current_contract jsonb; key text; sent_on date; signed_on date; today date := (now() at time zone 'Africa/Johannesburg')::date; path text;
begin
  if tg_op='INSERT' then
    if new.contract_delivery_json<>'{}'::jsonb or new.contract_signature_json<>'{}'::jsonb then raise exception 'Record contract delivery and signatures after approval'; end if;
    return new;
  end if;
  current_contract:=old.contracts_json->(jsonb_array_length(old.contracts_json)-1);
  if new.contract_delivery_json is distinct from old.contract_delivery_json then
    if old.contract_delivery_json<>'{}'::jsonb then raise exception 'Recorded contract delivery cannot be changed'; end if;
    if auth.uid() is null or old.status<>'application_approved' or new.status<>'contract_sent' or old.approved_at is null or current_contract is null or new.contracts_json is distinct from old.contracts_json then raise exception 'Record prior delivery for the current prepared contract before signatures'; end if;
    item:=new.contract_delivery_json;
    foreach key in array array['recipientName','recipientContact','channel','sentOn','notes'] loop
      if jsonb_typeof(item->key) is distinct from 'string' then raise exception 'Contract delivery details must be text'; end if;
    end loop;
    if item->'contractVersion' is distinct from current_contract->'version' or item->>'channel' not in ('email','whatsapp','in_person','other') or length(trim(item->>'recipientName')) not between 2 and 120 or length(trim(item->>'recipientContact')) not between 3 and 254 or length(trim(item->>'notes')) not between 5 and 3000 or item->'confirmed' is distinct from 'true'::jsonb then raise exception 'Confirm the contract version, recipient, delivery details and evidence note'; end if;
    if item->>'sentOn' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid contract delivery date'; end if;
    sent_on:=(item->>'sentOn')::date;
    if to_char(sent_on,'YYYY-MM-DD')<>item->>'sentOn' or sent_on>today or sent_on<(old.approved_at at time zone 'Africa/Johannesburg')::date then raise exception 'Contract delivery date must be between approval and today'; end if;
    if not exists(select 1 from storage.objects s where s.bucket_id='recruitment-contracts' and s.name=current_contract->>'path') then raise exception 'The prepared contract PDF is missing'; end if;
    new.contract_delivery_json:=jsonb_build_object('contractVersion',current_contract->'version','contractPath',current_contract->>'path','recipientName',trim(item->>'recipientName'),'recipientContact',trim(item->>'recipientContact'),'channel',item->>'channel','sentOn',to_char(sent_on,'YYYY-MM-DD'),'notes',trim(item->>'notes'),'confirmed',true,'source','staff_recorded','recordedAt',now(),'recordedBy',auth.uid());
  end if;
  if new.contract_signature_json is distinct from old.contract_signature_json then
    if old.contract_signature_json<>'{}'::jsonb then raise exception 'Recorded contract signatures cannot be changed'; end if;
    if auth.uid() is null or old.status<>'contract_sent' or new.status<>'contract_signed' or old.contract_delivery_json='{}'::jsonb or new.contract_delivery_json is distinct from old.contract_delivery_json or new.contracts_json is distinct from old.contracts_json then raise exception 'Capture signatures only after contract delivery is recorded'; end if;
    item:=new.contract_signature_json; path:=item->>'path';
    foreach key in array array['name','agentSigner','organisationSigner','signedOn','method','reference','notes'] loop
      if jsonb_typeof(item->key) is distinct from 'string' then raise exception 'Contract signature details must be text'; end if;
    end loop;
    if item->'contractVersion' is distinct from old.contract_delivery_json->'contractVersion' or length(trim(item->>'name')) not between 1 and 254 or length(trim(item->>'agentSigner')) not between 2 and 120 or length(trim(item->>'organisationSigner')) not between 2 and 120 or length(trim(item->>'notes')) not between 5 and 3000 or length(item->>'reference')>254 or item->>'method' not in ('wet_ink','external_electronic') or (item->>'method'='external_electronic' and length(trim(item->>'reference'))<3) or jsonb_typeof(item->'size') is distinct from 'number' or (item->>'size')::numeric not between 5 and 10485760 or trunc((item->>'size')::numeric)<>(item->>'size')::numeric then raise exception 'Invalid signed contract details or signer verification'; end if;
    foreach key in array array['sameVersion','allPages','agentSignature','organisationSignature'] loop
      if item->'checks'->key is distinct from 'true'::jsonb then raise exception 'Verify the contract version, all pages and both signatures'; end if;
    end loop;
    if item->>'signedOn' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid contract signature date'; end if;
    signed_on:=(item->>'signedOn')::date; sent_on:=(old.contract_delivery_json->>'sentOn')::date;
    if to_char(signed_on,'YYYY-MM-DD')<>item->>'signedOn' or signed_on<sent_on or signed_on>today then raise exception 'Contract signature date must be between delivery and today'; end if;
    if path is null or path not like new.organisation_id::text||'/'||new.id::text||'/%' or not exists(select 1 from storage.objects s where s.bucket_id='recruitment-signed-contracts' and s.name=path) or not exists(select 1 from storage.objects s where s.bucket_id='recruitment-contracts' and s.name=old.contract_delivery_json->>'contractPath') then raise exception 'Upload the signed contract PDF for this lead and retain the original'; end if;
    new.contract_signature_json:=jsonb_build_object('contractVersion',old.contract_delivery_json->'contractVersion','contractPath',old.contract_delivery_json->>'contractPath','path',path,'name',trim(item->>'name'),'size',(item->>'size')::integer,'agentSigner',trim(item->>'agentSigner'),'organisationSigner',trim(item->>'organisationSigner'),'signedOn',to_char(signed_on,'YYYY-MM-DD'),'method',item->>'method','reference',trim(item->>'reference'),'notes',trim(item->>'notes'),'checks',jsonb_build_object('sameVersion',true,'allPages',true,'agentSignature',true,'organisationSignature',true),'source','staff_verified','recordedAt',now(),'recordedBy',auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.recruitment_signature_guard() from public,anon,authenticated;
create trigger d_recruitment_signature_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_signature_guard();
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
      (old.status = 'contract_sent' and new.status = 'contract_signed' and new.contract_signature_json <> '{}'::jsonb) or
      (old.status = 'under_review' and new.status = 'application_approved' and new.approved_at is not null) or
      (old.status = 'application_submitted' and new.status = 'under_review' and new.review_started_at is not null and old.application_submitted_at is not null) or
      (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined')) or
      (old.status = 'closed_lost' and new.status = case when old.contract_signature_json <> '{}'::jsonb then 'contract_signed' when old.contract_delivery_json <> '{}'::jsonb then 'contract_sent' when old.approved_at is not null then 'application_approved' when old.review_started_at is not null then 'under_review' when old.application_submitted_at is not null then 'application_submitted' else 'lead_received' end)
    ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
    if submitting then new.application_submitted_at := now(); end if;
    event_type := case when new.contract_signature_json is distinct from old.contract_signature_json then 'contract_signed' when new.contract_delivery_json is distinct from old.contract_delivery_json then 'contract_delivery_recorded' when new.contracts_json is distinct from old.contracts_json then 'contract_prepared' when submitting then 'application_submitted' when old.approved_at is null and new.approved_at is not null then 'application_approved' when old.review_started_at is null and new.review_started_at is not null then 'review_started' when new.review_updated_at is distinct from old.review_updated_at or new.review_json is distinct from old.review_json then 'review_updated' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' and new.status <> 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel','reviewStatus',new.review_status));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;


create function public.recruitment_record_contract_delivery(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_delivery jsonb)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Organisation management access required' using errcode='42501'; end if;
  return query update public.recruitment_leads set status='contract_sent',contract_delivery_json=p_delivery where organisation_id=p_organisation_id and id=p_lead_id and version=p_version and status='application_approved' returning *;
  if not found then raise exception 'This contract changed or access was removed. Reload before recording delivery' using errcode='40001'; end if;
end;
$$;
create function public.recruitment_record_contract_signature(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_signature jsonb)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Organisation management access required' using errcode='42501'; end if;
  return query update public.recruitment_leads set status='contract_signed',contract_signature_json=p_signature where organisation_id=p_organisation_id and id=p_lead_id and version=p_version and status='contract_sent' returning *;
  if not found then raise exception 'This contract changed or access was removed. Reload before recording signatures' using errcode='40001'; end if;
end;
$$;
revoke all on function public.recruitment_record_contract_delivery(uuid,uuid,integer,jsonb) from public,anon;
revoke all on function public.recruitment_record_contract_signature(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.recruitment_record_contract_delivery(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.recruitment_record_contract_signature(uuid,uuid,integer,jsonb) to authenticated;
commit;
