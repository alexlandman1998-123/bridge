begin;
-- No historical emails are queued. Only publishing a contract or confirming a new return queues mail.
alter table public.recruitment_leads add column contract_returns_json jsonb not null default '[]'
 check(jsonb_typeof(contract_returns_json)='array');
create table public.recruitment_contract_uploads(
 id uuid primary key,organisation_id uuid not null,lead_id uuid not null,contract_version integer not null,
 path text not null unique,name text not null,size integer not null check(size between 5 and 10485760),
 created_at timestamptz not null default now(),committed_at timestamptz,
 foreign key(organisation_id,lead_id) references public.recruitment_leads(organisation_id,id));
create index recruitment_contract_upload_lead_idx on public.recruitment_contract_uploads(lead_id,created_at);
alter table public.recruitment_contract_uploads enable row level security;
revoke all on public.recruitment_contract_uploads from public,anon,authenticated;
grant select,insert,update on public.recruitment_contract_uploads to service_role;
grant select on public.recruitment_contract_uploads to authenticated;
create policy recruitment_contract_upload_manager_read on public.recruitment_contract_uploads for select to authenticated
 using(exists(select 1 from public.recruitment_leads l where l.id=lead_id and l.organisation_id=recruitment_contract_uploads.organisation_id));
create policy recruitment_returned_contract_retention on storage.objects as restrictive for delete to authenticated using(
 bucket_id<>'recruitment-signed-contracts' or not exists(select 1 from public.recruitment_leads l,
 jsonb_array_elements(l.contract_returns_json) r where r->>'path'=storage.objects.name));

alter table public.recruitment_submission_email_queue drop constraint recruitment_submission_email_queue_email_kind_check;
alter table public.recruitment_submission_email_queue add constraint recruitment_submission_email_queue_email_kind_check
 check(email_kind in ('application_thanks','documents_reminder','documents_followup','contract_available'));
alter table public.recruitment_invitation_deliveries drop constraint recruitment_invitation_deliveries_kind_check;
alter table public.recruitment_invitation_deliveries add constraint recruitment_invitation_deliveries_kind_check
 check(kind in ('application','workspace','documents_reminder','approval','application_thanks','documents_followup','contract_available'));

-- Each signed return gets its own stable notification key, including corrected uploads.
alter table public.recruitment_contact_notifications add column event_key uuid not null default '00000000-0000-0000-0000-000000000000';
alter table public.recruitment_contact_notifications drop constraint recruitment_contact_notifications_event_kind_check;
alter table public.recruitment_contact_notifications add constraint recruitment_contact_notifications_event_kind_check
 check(event_kind in ('lead_received','application_received','documents_received','contract_returned'));
do $$ declare item record; begin
 for item in select c.conname from pg_catalog.pg_constraint c where c.conrelid='public.recruitment_contact_notifications'::regclass
  and c.contype='u' and cardinality(c.conkey)=3 loop
  execute format('alter table public.recruitment_contact_notifications drop constraint %I',item.conname);
 end loop;
end; $$;
alter table public.recruitment_contact_notifications add unique(lead_id,event_kind,recipient,event_key);
create or replace function public.recruitment_queue_contact_notifications() returns trigger language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype;
begin
 if new.organisation_id<>'2958d402-368e-43c9-b728-0098e10505f1' then return new; end if;
 select * into candidate from public.recruitment_leads where id=new.lead_id and organisation_id=new.organisation_id;
 if current_user<>'service_role' or candidate.intake_channel not in ('website','public_link')
  or candidate.contact_capture_json->>'version' is distinct from 'recruitment-contact-v1'
  or candidate.intake_key is distinct from new.submission_key then raise exception 'Saved public recruitment contact required'; end if;
 insert into public.recruitment_contact_notifications(organisation_id,lead_id,receipt_id,recipient,contact_json,event_kind)
 select new.organisation_id,new.lead_id,new.id,r,candidate.contact_capture_json,'lead_received'
 from unnest(array['thomas@homeseekers.co.za','admin@homeseekers.co.za','alex@arch9.co.za']) r
 on conflict do nothing;
 return new;
end; $$;

create or replace function public.recruitment_queue_application_notifications() returns trigger language plpgsql security definer set search_path='' as $$
declare event text; receipt uuid; contact jsonb;
begin
 if new.organisation_id<>'2958d402-368e-43c9-b728-0098e10505f1' or new.application_submitted_at is null
  or new.email_verification_status<>'verified' or new.application_json->>'questionnaireVersion' is distinct from 'recruitment-profile-v1'
  or new.status in ('closed_lost','legacy_joined') then return new; end if;
 if old.application_submitted_at is null then event:='application_received';
 elsif (new.documents_json is distinct from old.documents_json or new.document_waivers_json is distinct from old.document_waivers_json)
  and public.recruitment_requested_documents_complete(new.organisation_id,new.documents_json,new.document_waivers_json)
  and not public.recruitment_requested_documents_complete(old.organisation_id,old.documents_json,old.document_waivers_json)
 then event:='documents_received'; end if;
 if event is null then return new; end if;
 select id into receipt from public.recruitment_contact_receipts where organisation_id=new.organisation_id and lead_id=new.id order by created_at desc limit 1;
 contact:=new.contact_capture_json||jsonb_build_object('email',new.email,'name',new.name);
 insert into public.recruitment_contact_notifications(organisation_id,lead_id,receipt_id,recipient,contact_json,event_kind)
 select new.organisation_id,new.id,receipt,r,contact,event
 from unnest(array['thomas@homeseekers.co.za','admin@homeseekers.co.za','alex@arch9.co.za']) r
 on conflict do nothing;
 if event='documents_received' then
  update public.recruitment_submission_email_queue set status='cancelled',last_error='documents_complete',lease_id=null,leased_until=null
   where lead_id=new.id and email_kind='documents_followup' and status in ('pending','sending');
 end if;
 return new;
end; $$;

create function public.recruitment_contract_applicant_ready(p_organisation_id uuid,p_lead_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform public.recruitment_assert_joining_manager(p_organisation_id);
 return exists(select 1 from public.recruitment_leads l join public.recruitment_applicant_links b on b.organisation_id=l.organisation_id and b.lead_id=l.id
  join auth.users u on u.id=b.user_id where l.organisation_id=p_organisation_id and l.id=p_lead_id
  and l.organisation_id='2958d402-368e-43c9-b728-0098e10505f1' and l.email_verification_status='verified'
  and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(l.email));
end; $$;
revoke all on function public.recruitment_contract_applicant_ready(uuid,uuid) from public,anon;
grant execute on function public.recruitment_contract_applicant_ready(uuid,uuid) to authenticated;

create or replace function public.recruitment_signature_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; current_contract jsonb; key text; sent_on date; signed_on date; today date := (now() at time zone 'Africa/Johannesburg')::date; signed_path text;
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
    if item->>'source'='applicant_portal' then
      if not public.recruitment_contract_applicant_ready(old.organisation_id,old.id) then raise exception 'A verified My Profile applicant is required'; end if;
      item:=jsonb_build_object('contractVersion',current_contract->'version','recipientName',old.name,'recipientContact',old.email,'channel','portal','sentOn',to_char(today,'YYYY-MM-DD'),'notes','Published in My Profile.','confirmed',true);
      sent_on:=today;
    else
    foreach key in array array['recipientName','recipientContact','channel','sentOn','notes'] loop
      if jsonb_typeof(item->key) is distinct from 'string' then raise exception 'Contract delivery details must be text'; end if;
    end loop;
    if item->'contractVersion' is distinct from current_contract->'version' or item->>'channel' not in ('email','whatsapp','in_person','other') or length(trim(item->>'recipientName')) not between 2 and 120 or length(trim(item->>'recipientContact')) not between 3 and 254 or length(trim(item->>'notes')) not between 5 and 3000 or item->'confirmed' is distinct from 'true'::jsonb then raise exception 'Confirm the contract version, recipient, delivery details and evidence note'; end if;
    if item->>'sentOn' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid contract delivery date'; end if;
    sent_on:=(item->>'sentOn')::date;
    if to_char(sent_on,'YYYY-MM-DD')<>item->>'sentOn' or sent_on>today or sent_on<(old.approved_at at time zone 'Africa/Johannesburg')::date then raise exception 'Contract delivery date must be between approval and today'; end if;
    if not exists(select 1 from storage.objects s where s.bucket_id='recruitment-contracts' and s.name=current_contract->>'path') then raise exception 'The prepared contract PDF is missing'; end if;
    end if;
    new.contract_delivery_json:=jsonb_build_object('contractVersion',current_contract->'version','contractPath',current_contract->>'path','recipientName',trim(item->>'recipientName'),'recipientContact',trim(item->>'recipientContact'),'channel',item->>'channel','sentOn',to_char(sent_on,'YYYY-MM-DD'),'notes',trim(item->>'notes'),'confirmed',true,'source',case when item->>'channel'='portal' then 'applicant_portal' else 'staff_recorded' end,'recordedAt',now(),'recordedBy',auth.uid());
  end if;
  if new.contract_signature_json is distinct from old.contract_signature_json then
    if old.contract_signature_json<>'{}'::jsonb then raise exception 'Recorded contract signatures cannot be changed'; end if;
    if auth.uid() is null or old.status<>'contract_sent' or new.status<>'contract_signed' or old.contract_delivery_json='{}'::jsonb or new.contract_delivery_json is distinct from old.contract_delivery_json or new.contracts_json is distinct from old.contracts_json then raise exception 'Capture signatures only after contract delivery is recorded'; end if;
    item:=new.contract_signature_json; signed_path:=item->>'path';
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
    if signed_path is null or signed_path not like new.organisation_id::text||'/'||new.id::text||'/%' or not exists(select 1 from storage.objects s where s.bucket_id='recruitment-signed-contracts' and s.name=signed_path) or not exists(select 1 from storage.objects s where s.bucket_id='recruitment-contracts' and s.name=old.contract_delivery_json->>'contractPath') then raise exception 'Upload the signed contract PDF for this lead and retain the original'; end if;
    if exists(select 1 from public.recruitment_contract_uploads u where u.path=signed_path)
      and not exists(select 1 from jsonb_array_elements(old.contract_returns_json) r where r->>'path'=signed_path and r->'contractVersion'=item->'contractVersion')
    then raise exception 'Use a confirmed return for this contract version'; end if;
    new.contract_signature_json:=jsonb_build_object('contractVersion',old.contract_delivery_json->'contractVersion','contractPath',old.contract_delivery_json->>'contractPath','path',signed_path,'name',trim(item->>'name'),'size',(item->>'size')::integer,'agentSigner',trim(item->>'agentSigner'),'organisationSigner',trim(item->>'organisationSigner'),'signedOn',to_char(signed_on,'YYYY-MM-DD'),'method',item->>'method','reference',trim(item->>'reference'),'notes',trim(item->>'notes'),'checks',jsonb_build_object('sameVersion',true,'allPages',true,'agentSignature',true,'organisationSignature',true),'source','staff_verified','recordedAt',now(),'recordedBy',auth.uid());
  end if;
  return new;
end;
$$;

create function public.recruitment_publish_contract(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_document jsonb default null)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype;
begin
 perform public.recruitment_assert_joining_manager(p_organisation_id);
 select * into l from public.recruitment_leads where organisation_id=p_organisation_id and id=p_lead_id for update;
 if l.id is null then raise exception 'Application unavailable' using errcode='42501'; end if;
 if l.status='contract_sent' and l.contract_delivery_json->>'source'='applicant_portal'
  and (p_document is null or l.contract_delivery_json->>'contractPath'=p_document->>'path') then return next l; return; end if;
 if l.version<>p_version or l.status<>'application_approved' then raise exception 'Reload the changed application' using errcode='40001'; end if;
 if p_document is not null then
  select * into l from public.recruitment_prepare_contract(p_organisation_id,p_lead_id,p_version,p_document);
 end if;
 return query update public.recruitment_leads set status='contract_sent',contract_delivery_json=jsonb_build_object('source','applicant_portal')
  where id=l.id and organisation_id=p_organisation_id and version=l.version returning *;
end; $$;
revoke all on function public.recruitment_publish_contract(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.recruitment_publish_contract(uuid,uuid,integer,jsonb) to authenticated;

create function public.recruitment_applicant_contract(p_organisation_id uuid,p_token_hash text,p_return_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype; c jsonb; r jsonb;
begin
 select * into l from public.recruitment_applicant_document_access(p_organisation_id,p_token_hash);
 if l.id is null then return jsonb_build_object('unavailable',true); end if;
 if l.contract_delivery_json->>'source' is distinct from 'applicant_portal' then return null; end if;
 select d into c from jsonb_array_elements(l.contracts_json) d where d->'version'=l.contract_delivery_json->'contractVersion';
 if p_return_id is not null then
  select d into r from jsonb_array_elements(l.contract_returns_json) d where d->>'id'=p_return_id::text and d->'contractVersion'=c->'version';
  if r is null then return jsonb_build_object('unavailable',true); end if;
 end if;
 return jsonb_build_object('version',c->'version','name',c->>'name','publishedAt',l.contract_delivery_json->>'recordedAt',
  'path',coalesce(r->>'path',c->>'path'),'bucket',case when r is null then 'recruitment-contracts' else 'recruitment-signed-contracts' end,
  'downloadName',coalesce(r->>'name',c->>'name'),'canUpload',l.status='contract_sent' and l.contract_signature_json='{}'::jsonb,
  'verified',l.contract_signature_json<>'{}'::jsonb,'returns',coalesce((select jsonb_agg(d-'path'-'size') from jsonb_array_elements(l.contract_returns_json) d where d->'contractVersion'=c->'version'),'[]'::jsonb));
end; $$;
create function public.recruitment_prepare_contract_return(p_organisation_id uuid,p_token_hash text,p_request_id uuid,p_document jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype; a public.recruitment_contract_uploads%rowtype;
begin
 select * into l from public.recruitment_applicant_document_access(p_organisation_id,p_token_hash);
 if l.id is null then return jsonb_build_object('unavailable',true); end if;
 select * into l from public.recruitment_leads where id=l.id for update;
 if p_request_id is null or p_document->>'mimeType' is distinct from 'application/pdf'
  or length(trim(coalesce(p_document->>'name',''))) not between 1 and 254
  or coalesce(p_document->>'name','')~'[/\\]' or coalesce(p_document->>'size','')!~'^[0-9]{1,8}$'
  or (p_document->>'size')::integer not between 5 and 10485760 then raise exception 'Choose a signed PDF up to 10 MB'; end if;
 select * into a from public.recruitment_contract_uploads where id=p_request_id;
 if a.id is not null then
  if a.organisation_id<>p_organisation_id or a.lead_id<>l.id or a.contract_version<>(l.contract_delivery_json->>'contractVersion')::integer
   or a.name<>p_document->>'name' or a.size<>(p_document->>'size')::integer then raise exception 'Upload belongs to another contract'; end if;
  if a.committed_at is not null then return jsonb_build_object('path',a.path,'committed',true); end if;
 end if;
 if l.status<>'contract_sent' or l.contract_delivery_json->>'source' is distinct from 'applicant_portal' then return jsonb_build_object('unavailable',true); end if;
 if a.id is null then
  if (select count(*) from public.recruitment_contract_uploads where lead_id=l.id and created_at>now()-interval '1 hour')>=10
   or jsonb_array_length(l.contract_returns_json)>=20 then raise exception 'Upload limit reached. Contact the agency'; end if;
  insert into public.recruitment_contract_uploads(id,organisation_id,lead_id,contract_version,path,name,size)
   values(p_request_id,p_organisation_id,l.id,(l.contract_delivery_json->>'contractVersion')::integer,
    p_organisation_id::text||'/'||l.id::text||'/'||p_request_id::text,p_document->>'name',(p_document->>'size')::integer) returning * into a;
 end if;
 return jsonb_build_object('path',a.path,'committed',a.committed_at is not null);
end; $$;
create function public.recruitment_commit_contract_return(p_organisation_id uuid,p_token_hash text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype; a public.recruitment_contract_uploads%rowtype; metadata jsonb;
begin
 select * into l from public.recruitment_applicant_document_access(p_organisation_id,p_token_hash);
 if l.id is null then return jsonb_build_object('unavailable',true); end if;
 select * into l from public.recruitment_leads where id=l.id for update;
 select * into a from public.recruitment_contract_uploads where id=p_request_id and organisation_id=p_organisation_id and lead_id=l.id for update;
 if a.id is null then raise exception 'Prepare this signed upload first'; end if;
 if a.committed_at is not null then return jsonb_build_object('saved',true,'duplicate',true); end if;
 if l.status<>'contract_sent' or l.contract_delivery_json->>'source' is distinct from 'applicant_portal'
  or a.contract_version<>(l.contract_delivery_json->>'contractVersion')::integer then return jsonb_build_object('unavailable',true); end if;
 select s.metadata into metadata from storage.objects s where s.bucket_id='recruitment-signed-contracts' and s.name=a.path;
 if metadata is null or (metadata->>'size')::bigint is distinct from a.size::bigint or metadata->>'mimetype' is distinct from 'application/pdf'
 then raise exception 'Uploaded PDF could not be verified'; end if;
 update public.recruitment_contract_uploads set committed_at=now() where id=a.id;
 update public.recruitment_leads set contract_returns_json=l.contract_returns_json||jsonb_build_array(jsonb_build_object(
  'id',a.id,'path',a.path,'name',a.name,'size',a.size,'contractVersion',a.contract_version,'submittedAt',now())) where id=l.id;
 return jsonb_build_object('saved',true,'duplicate',false);
end; $$;
create function public.recruitment_contract_return_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 if tg_op='INSERT' then
  if new.contract_returns_json<>'[]'::jsonb then raise exception 'Return contracts through My Profile'; end if;
 elsif new.contract_returns_json is distinct from old.contract_returns_json then
  if current_user<>'service_role' or old.status<>'contract_sent' or new.status<>old.status or old.contract_delivery_json->>'source' is distinct from 'applicant_portal'
   or new.contract_delivery_json is distinct from old.contract_delivery_json or new.contract_signature_json is distinct from old.contract_signature_json
   or jsonb_array_length(new.contract_returns_json)<>jsonb_array_length(old.contract_returns_json)+1
   or new.contract_returns_json-(jsonb_array_length(new.contract_returns_json)-1) is distinct from old.contract_returns_json
  then raise exception 'Confirmed applicant returns are immutable'; end if;
  r:=new.contract_returns_json->(jsonb_array_length(new.contract_returns_json)-1);
  if not exists(select 1 from public.recruitment_contract_uploads a where a.id::text=r->>'id' and a.organisation_id=old.organisation_id
   and a.lead_id=old.id and a.path=r->>'path' and a.name=r->>'name' and to_jsonb(a.size)=r->'size'
   and to_jsonb(a.contract_version)=r->'contractVersion' and r->'contractVersion'=old.contract_delivery_json->'contractVersion'
   and a.committed_at is not null) then raise exception 'Confirm the saved upload for this contract version'; end if;
 end if;
 return new;
end; $$;
create trigger b1_recruitment_contract_return_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_contract_return_guard();
revoke all on function public.recruitment_applicant_contract(uuid,text,uuid),public.recruitment_prepare_contract_return(uuid,text,uuid,jsonb),public.recruitment_commit_contract_return(uuid,text,uuid),public.recruitment_contract_return_guard() from public,anon,authenticated;
grant execute on function public.recruitment_applicant_contract(uuid,text,uuid),public.recruitment_prepare_contract_return(uuid,text,uuid,jsonb),public.recruitment_commit_contract_return(uuid,text,uuid) to service_role;

create function public.recruitment_queue_contract_notifications() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; r jsonb;
begin
 if new.organisation_id<>'2958d402-368e-43c9-b728-0098e10505f1' then return new; end if;
 if old.contract_delivery_json='{}'::jsonb and new.contract_delivery_json->>'source'='applicant_portal' then
  select b.user_id into owner_id from public.recruitment_applicant_links b join auth.users u on u.id=b.user_id
   where b.organisation_id=new.organisation_id and b.lead_id=new.id and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(new.email);
  if owner_id is null then raise exception 'Verified contract applicant required'; end if;
  insert into public.recruitment_submission_email_queue(organisation_id,lead_id,actor_id,email_kind)
   values(new.organisation_id,new.id,owner_id,'contract_available') on conflict(lead_id,email_kind) do nothing;
 end if;
 if new.contract_returns_json is distinct from old.contract_returns_json then
  r:=new.contract_returns_json->(jsonb_array_length(new.contract_returns_json)-1);
  insert into public.recruitment_contact_notifications(organisation_id,lead_id,recipient,contact_json,event_kind,event_key)
   select new.organisation_id,new.id,recipient,new.contact_capture_json||jsonb_build_object('name',new.name,'email',new.email,'contractVersion',r->'contractVersion','contractFilename',r->>'name'),'contract_returned',(r->>'id')::uuid
    from unnest(array['thomas@homeseekers.co.za','admin@homeseekers.co.za','alex@arch9.co.za']) recipient
    on conflict(lead_id,event_kind,recipient,event_key) do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.recruitment_queue_contract_notifications() from public,anon,authenticated;
create trigger zz_recruitment_contract_notifications after update on public.recruitment_leads for each row execute function public.recruitment_queue_contract_notifications();
commit;
