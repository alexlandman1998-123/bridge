begin;

-- Signed originals are private, append-only objects. No browser UPDATE/DELETE.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bond-signed-applications','bond-signed-applications',false,26214400,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.bond_wet_ink_versions (
 id uuid primary key default gen_random_uuid(),
 bond_application_id uuid not null references public.bond_applications(id),
 transaction_id uuid not null references public.transactions(id),
 source_revision integer not null,
 version integer not null,
 snapshot_json jsonb not null,
 snapshot_hash text not null,
 status text not null default 'awaiting_upload' check(status in ('awaiting_upload','awaiting_review','accepted','cancelled')),
 submission_id uuid references public.transaction_bond_application_submissions(id),
 created_at timestamptz not null default now(),
 unique(transaction_id,version)
);
create unique index bond_wet_ink_one_active on public.bond_wet_ink_versions(bond_application_id)
 where status in ('awaiting_upload','awaiting_review');
create table public.bond_wet_ink_uploads (
 id uuid primary key,
 version_id uuid not null references public.bond_wet_ink_versions(id),
 file_path text not null unique,
 file_name text not null,
 bytes integer not null check(bytes between 5 and 26214400),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 storage_object_id uuid not null,
 status text not null default 'awaiting_review' check(status in ('awaiting_review','accepted','rejected')),
 feedback text,
 checks_json jsonb,
 reviewed_by uuid,
 reviewed_at timestamptz,
 document_id uuid references public.documents(id),
 uploaded_at timestamptz not null default now()
);
alter table public.bond_wet_ink_versions enable row level security;
alter table public.bond_wet_ink_uploads enable row level security;
revoke all on public.bond_wet_ink_versions,public.bond_wet_ink_uploads from anon,authenticated;

create function public.bridge_bond_wet_ink_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Signed application evidence cannot be deleted.' using errcode='23514'; end if;
 if tg_table_name='bond_wet_ink_versions' and
  (to_jsonb(old)-'status'-'submission_id') is distinct from (to_jsonb(new)-'status'-'submission_id') then
   raise exception 'Application version is immutable.' using errcode='23514';
 end if;
 if tg_table_name='bond_wet_ink_uploads' then
  if old.status<>'awaiting_review' or (to_jsonb(old)-'status'-'feedback'-'checks_json'-'reviewed_by'-'reviewed_at'-'document_id') is distinct from (to_jsonb(new)-'status'-'feedback'-'checks_json'-'reviewed_by'-'reviewed_at'-'document_id') then
   raise exception 'Signed original and completed reviews are immutable.' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
create trigger bond_wet_ink_version_immutable before update or delete on public.bond_wet_ink_versions for each row execute function public.bridge_bond_wet_ink_immutable();
create trigger bond_wet_ink_upload_immutable before update or delete on public.bond_wet_ink_uploads for each row execute function public.bridge_bond_wet_ink_immutable();

-- Matches the application's canonical JSON for the schema's ASCII field keys.
create function public.bridge_bond_wet_ink_canonical(v jsonb) returns text language sql immutable set search_path='' as $$
 select case jsonb_typeof(v)
 when 'object' then '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||public.bridge_bond_wet_ink_canonical(value),',' order by key collate "C") from jsonb_each(v)),'')||'}'
 when 'number' then trim_scale(v::text::numeric)::text
 when 'array' then '['||coalesce((select string_agg(public.bridge_bond_wet_ink_canonical(value),',' order by ordinal) from jsonb_array_elements(v) with ordinality a(value,ordinal)),'')||']'
 else v::text end
$$;

create function public.bridge_bond_wet_ink_consultant(p_application uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and nullif(public.bridge_request_header('x-bridge-client-portal-token'),'') is null
 and nullif(public.bridge_request_header('x-bridge-bond-application-token'),'') is null
 and exists(select 1 from public.bond_applications a join public.transactions t on t.id=a.transaction_id
 where a.id=p_application and t.primary_bond_consultant_user_id=auth.uid())
$$;

create function public.bridge_bond_wet_ink_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; v public.bond_wet_ink_versions%rowtype;
begin
 a:=public.bridge_buyer_bond_application_runtime_id();
 select * into v from public.bond_wet_ink_versions where bond_application_id=a order by version desc limit 1;
 if v.id is null then return jsonb_build_object('version',null,'uploads','[]'::jsonb); end if;
 return jsonb_build_object('version',to_jsonb(v),'uploads',coalesce((select jsonb_agg(to_jsonb(u) order by uploaded_at) from public.bond_wet_ink_uploads u where version_id=v.id),'[]'::jsonb));
end $$;

create function public.bridge_prepare_bond_wet_ink(p_revision integer,p_declarations jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications%rowtype; v public.bond_wet_ink_versions%rowtype; p record; sections jsonb; shared jsonb;
 participants jsonb:='[]'; signers jsonb:='[]'; declarations jsonb:='[]'; manifest jsonb; snap jsonb; content jsonb; templates jsonb; d jsonb; n integer; stamp text;
begin
 select * into a from public.bond_applications where id=public.bridge_buyer_bond_application_runtime_id() for update;
 select * into v from public.bond_wet_ink_versions where bond_application_id=a.id and status in ('awaiting_upload','awaiting_review') limit 1;
 if v.id is not null then return public.bridge_bond_wet_ink_context(); end if;
 if a.locked_at is not null or a.status in ('submitted','cancelled','preparing_submission','awaiting_signatures') then raise exception 'This application is locked.' using errcode='23514'; end if;
 if a.revision is distinct from p_revision then raise exception 'The application changed. Review it again.' using errcode='40001'; end if;
 if exists(select 1 from public.bond_application_participants where bond_application_id=a.id and role='surety' and status not in ('removed','declined')) then raise exception 'Surety applications need the approved surety signing workflow.' using errcode='23514'; end if;
 if exists(select 1 from public.bond_application_document_requirements where bond_application_id=a.id and status='active' and required_before='required_before_signature' and linked_document_id is null) then raise exception 'Provide the documents required before signing.' using errcode='23514'; end if;
 select coalesce(jsonb_object_agg(section_key,answers_json),'{}') into shared from public.bond_application_sections where bond_application_id=a.id and participant_id is null;
 if coalesce((shared#>>'{application_finance,requestedBondAmount}')::numeric,0)<=0 or coalesce(jsonb_array_length(shared->'selected_banks'),0)=0 then raise exception 'Complete loan details and select banks before signing.' using errcode='23514'; end if;
 templates:='[{"key":"loan_processing_consent","title":"Loan processing and affordability assessment","text":"I consent to loan processing and affordability assessment.","required":true},{"key":"credit_bureau_fraud_bank_data_consent","title":"Credit bureau, fraud and bank data checks","text":"I consent to credit bureau, fraud, and bank data retrieval checks.","required":true},{"key":"insurance_third_party_communication_consent","title":"Insurance and third-party communication","text":"I consent to related insurance and third-party communication where required.","required":true},{"key":"nhfc_first_home_finance_consent","title":"First Home Finance processing","text":"I consent to First Home Finance / NHFC processing where applicable.","required":false},{"key":"application_information_accuracy","title":"Accuracy and completeness","text":"I confirm that all information submitted is true and complete.","required":true},{"key":"marketing_privacy_preference","title":"Marketing preference","text":"I agree to receive relevant marketing communication where permitted.","required":false}]'::jsonb;
 for d in select value from jsonb_array_elements(templates) loop
  if (d->>'required')::boolean and p_declarations->>(d->>'key') is distinct from 'true' then raise exception 'Accept the required declarations before downloading.' using errcode='23514'; end if;
 end loop;
 for p in select * from public.bond_application_participants where bond_application_id=a.id and removed_at is null and status not in ('removed','declined') order by case role when 'primary_applicant' then 0 else 1 end,participant_key loop
  if p.role not in ('primary_applicant','co_applicant') or (p.role='co_applicant' and p.status<>'ready_for_submission') or (p.role='primary_applicant' and p.status<>'ready_for_submission' and exists(select 1 from public.bond_application_participants joint where joint.bond_application_id=a.id and joint.role='co_applicant' and joint.removed_at is null and joint.status not in ('removed','declined'))) then raise exception 'Each applicant must finish reviewing their own details first.' using errcode='23514'; end if;
  select coalesce(jsonb_object_agg(section_key,answers_json),'{}') into sections from public.bond_application_sections where bond_application_id=a.id and participant_id=p.id;
  if coalesce(sections#>>'{personal_contact,personal,first_name}','')='' or coalesce(sections#>>'{personal_contact,personal,surname}','')='' or coalesce(nullif(sections#>>'{personal_contact,personal,identity_number}',''),sections#>>'{personal_contact,personal,passport_number}','')='' or coalesce(sections#>>'{personal_contact,contact,email}','')='' then raise exception 'Required applicant details are missing.' using errcode='23514'; end if;
  declarations:='[]'::jsonb;
  for d in select value from jsonb_array_elements(templates) loop
   declarations:=declarations||jsonb_build_array(d||jsonb_build_object('version','2026-07','contractVersion','phase-6-v1','participantKey',p.participant_key,'participantRole',p.role,'accepted',case when p.role='primary_applicant' then coalesce(p_declarations->>(d->>'key'),'false')='true' else false end));
  end loop;
  participants:=participants||jsonb_build_array(jsonb_build_object('participantId',p.id,'participantKey',p.participant_key,'role',p.role,'answers',sections,'declarations',declarations));
  signers:=signers||jsonb_build_array(jsonb_build_object('participantId',p.id,'participantKey',p.participant_key,'participantRole',p.role,'required',true,'fullName',concat_ws(' ',sections#>>'{personal_contact,personal,first_name}',sections#>>'{personal_contact,personal,surname}'),'email',sections#>>'{personal_contact,contact,email}','identityReference',coalesce(nullif(sections#>>'{personal_contact,personal,identity_number}',''),sections#>>'{personal_contact,personal,passport_number}')));
 end loop;
 if jsonb_array_length(signers)=0 then raise exception 'An applicant is required.' using errcode='23514'; end if;
 select greatest(coalesce((select max(submission_version) from public.transaction_bond_application_submissions where transaction_id=a.transaction_id),0),coalesce((select max(version) from public.bond_wet_ink_versions where transaction_id=a.transaction_id),0))+1 into n;
 select coalesce(jsonb_agg(jsonb_build_object('requirementKey',r.requirement_key,'title',coalesce(r.metadata->>'title',r.requirement_key),'participantRole',coalesce(r.metadata->>'participantRole','primary_applicant'),'minimumFileCount',coalesce((r.metadata->>'minimumFileCount')::integer,1),'requiredBefore',r.required_before,'status',case when r.linked_document_id is null then 'missing' else 'received' end,'documents',case when doc.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id',doc.id,'name',to_jsonb(doc)->>'name','filePath',doc.file_path,'fileBucket',to_jsonb(doc)->>'file_bucket','status',doc.status)) end) order by r.requirement_key),'[]') into manifest from public.bond_application_document_requirements r left join public.documents doc on doc.id=r.linked_document_id where r.bond_application_id=a.id and r.status not in ('inactive','superseded');
 stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 snap:=jsonb_build_object('snapshotSchemaVersion','2','submissionVersion',n,'createdAt',stamp,'application',jsonb_build_object('id',a.id,'transactionId',a.transaction_id),
 'applicationIntent',coalesce(shared#>>'{application_intent,intent}','bond_application'),'shared',jsonb_build_object('property',coalesce(shared->'shared_property_summary','{}'),'purchaserEntity',coalesce(shared->'buyer_entity','{}'),'finance',shared->'application_finance'),
 'participants',participants,'signerManifest',signers,'selectedBanks',shared->'selected_banks','declarations','[]'::jsonb,'documentManifest',manifest,'source',jsonb_build_object('sourceRevision',a.revision,'originatorName',(select to_jsonb(t)->>'bond_originator' from public.transactions t where t.id=a.transaction_id)),
 'versions',jsonb_build_object('applicationSchemaVersion','2','flowVersion','wet-ink-v1','declarationContractVersion','phase-6-v1'));
 content:=snap-'createdAt'-'submissionVersion'-'documentManifest'-'source';
 snap:=snap||jsonb_build_object('reviewedVersion',jsonb_build_object('format','bond-reviewed-version-v1','reference',a.transaction_id::text||'-V'||n,'version',n,'createdAt',stamp,'algorithm','SHA-256','contentHash',encode(extensions.digest(public.bridge_bond_wet_ink_canonical(content),'sha256'),'hex'),'documentBaselineHash',encode(extensions.digest(public.bridge_bond_wet_ink_canonical(manifest),'sha256'),'hex')));
 insert into public.bond_wet_ink_versions(bond_application_id,transaction_id,source_revision,version,snapshot_json,snapshot_hash) values(a.id,a.transaction_id,a.revision,n,snap,encode(extensions.digest(public.bridge_bond_wet_ink_canonical(snap),'sha256'),'hex')) returning * into v;
 update public.bond_applications set status='awaiting_signatures',locked_at=now(),updated_at=now() where id=a.id;
 return public.bridge_bond_wet_ink_context();
end $$;

create function public.bridge_bond_wet_ink_storage_access(p_path text,p_write boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare v public.bond_wet_ink_versions%rowtype; buyer uuid;
begin
 if p_path !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.pdf$' then return false; end if;
 select * into v from public.bond_wet_ink_versions where id=(split_part(p_path,'/',2))::uuid and bond_application_id=(split_part(p_path,'/',1))::uuid;
 if v.id is null then return false; end if;
 begin buyer:=public.bridge_buyer_bond_application_runtime_id(); exception when others then buyer:=null; end;
 if p_write then return buyer=v.bond_application_id and v.status in ('awaiting_upload','awaiting_review') and not exists(select 1 from public.bond_wet_ink_uploads where version_id=v.id and status='awaiting_review'); end if;
 return buyer=v.bond_application_id or public.bridge_bond_wet_ink_consultant(v.bond_application_id);
end $$;
create or replace function document_security.can_read(d public.documents)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  scope text := lower(coalesce(d.visibility_scope, 'internal'));
  recipient text := lower(coalesce(d.client_recipient_role, ''));
  professional boolean := auth.uid() is not null
    and journey_private.can_read_professional_journey(d.transaction_id);
begin
  if d.file_bucket='bond-signed-applications' then return public.bridge_bond_wet_ink_storage_access(d.file_path,false); end if;
  if d.transaction_id is null then return false; end if;
  if scope in ('internal','internal_only','admin_only') then
    return professional and (
      d.uploaded_by_user_id=auth.uid()
      or public.bridge_can_mutate_attorney_lane(d.transaction_id,'transfer_attorney','documents')
      or public.bridge_can_mutate_attorney_lane(d.transaction_id,'bond_attorney','documents')
      or public.bridge_can_mutate_attorney_lane(d.transaction_id,'cancellation_attorney','documents')
    );
  end if;
  if scope not in ('shared','client','client_visible','professional_shared','shared_role_players') then return false; end if;
  if professional then return true; end if;
  if public.bridge_has_external_workspace_transaction_access(d.transaction_id)
    and lower(coalesce(public.bridge_external_workspace_role(),'')) in ('attorney','tuckers','bond_originator','agent','developer') then return true; end if;
  if d.source='developer_document_portal' and exists (
    select 1 from public.bridge_developer_document_portal_active_link() link
    where link.transaction_id=d.transaction_id and link.id is not null
  ) then return true; end if;
  if scope in ('professional_shared','shared_role_players') then return false; end if;
  if recipient not in ('','buyer','seller','both','all','client','shared') then return false; end if;
  if recipient not in ('seller') and (
    public.bridge_has_client_portal_token_transaction_access(d.transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(d.transaction_id)
  ) then return true; end if;
  if recipient not in ('buyer') and exists (
    select 1 from public.transactions t where t.id=d.transaction_id
      and t.listing_id=public.bridge_storage_seller_portal_listing_id()
  ) then return true; end if;
  return false;
end;
$$;

-- Browser mutations cannot relink, replace or remove signed-original metadata.
create policy bond_wet_ink_document_insert_guard on public.documents as restrictive for insert to anon,authenticated with check(coalesce(file_bucket,'documents')<>'bond-signed-applications');
create policy bond_wet_ink_document_update_guard on public.documents as restrictive for update to anon,authenticated using(coalesce(file_bucket,'documents')<>'bond-signed-applications') with check(coalesce(file_bucket,'documents')<>'bond-signed-applications');
create policy bond_wet_ink_document_delete_guard on public.documents as restrictive for delete to anon,authenticated using(coalesce(file_bucket,'documents')<>'bond-signed-applications');
create policy bond_wet_ink_objects_insert on storage.objects for insert to anon,authenticated with check(bucket_id='bond-signed-applications' and public.bridge_bond_wet_ink_storage_access(name,true));
create policy bond_wet_ink_objects_read on storage.objects for select to anon,authenticated using(bucket_id='bond-signed-applications' and public.bridge_bond_wet_ink_storage_access(name,false));
-- Restrictive guards also constrain any older permissive storage policies.
create policy bond_wet_ink_objects_insert_guard on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'bond-signed-applications' or public.bridge_bond_wet_ink_storage_access(name,true));
create policy bond_wet_ink_objects_read_guard on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'bond-signed-applications' or public.bridge_bond_wet_ink_storage_access(name,false));
create policy bond_wet_ink_objects_update_guard on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'bond-signed-applications') with check(bucket_id<>'bond-signed-applications');
create policy bond_wet_ink_objects_delete_guard on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'bond-signed-applications');

create function public.bridge_upload_bond_wet_ink(p_version uuid,p_upload uuid,p_name text,p_bytes integer,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.bond_wet_ink_versions%rowtype; u public.bond_wet_ink_uploads%rowtype; path text; object_id uuid;
begin
 select * into v from public.bond_wet_ink_versions where id=p_version and bond_application_id=public.bridge_buyer_bond_application_runtime_id() for update;
 if v.id is null or v.status not in ('awaiting_upload','awaiting_review') then raise exception 'This signed-copy upload is no longer available.' using errcode='42501'; end if;
 select * into u from public.bond_wet_ink_uploads where id=p_upload and version_id=v.id;
 if u.id is not null then return public.bridge_bond_wet_ink_context(); end if;
 if exists(select 1 from public.bond_wet_ink_uploads where version_id=v.id and status='awaiting_review') then raise exception 'The current upload is awaiting review.' using errcode='23514'; end if;
 path:=v.bond_application_id::text||'/'||v.id::text||'/'||p_upload::text||'.pdf';
 select id into object_id from storage.objects where bucket_id='bond-signed-applications' and name=path;
 if object_id is null then raise exception 'The signed original has not reached secure storage.' using errcode='23514'; end if;
 if length(trim(coalesce(p_name,'')))=0 or p_bytes is null or p_sha256 is null or p_bytes not between 5 and 26214400 or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid signed PDF.' using errcode='22023'; end if;
 insert into public.bond_wet_ink_uploads(id,version_id,file_path,file_name,bytes,sha256,storage_object_id) values(p_upload,v.id,path,left(p_name,180),p_bytes,p_sha256,object_id);
 update public.bond_wet_ink_versions set status='awaiting_review' where id=v.id;
 return public.bridge_bond_wet_ink_context();
end $$;

create function public.bridge_cancel_bond_wet_ink(p_version uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.bond_wet_ink_versions%rowtype;
begin
 select * into v from public.bond_wet_ink_versions where id=p_version and bond_application_id=public.bridge_buyer_bond_application_runtime_id() for update;
 if v.id is null or v.status='accepted' then raise exception 'An accepted application requires the consultant correction workflow.' using errcode='23514'; end if;
 if v.status='cancelled' then return public.bridge_bond_wet_ink_context(); end if;
 update public.bond_wet_ink_versions set status='cancelled' where id=v.id;
 update public.bond_applications set status='draft',locked_at=null,revision=revision+1,updated_at=now() where id=v.bond_application_id;
 return public.bridge_bond_wet_ink_context();
end $$;

create function public.bridge_bond_wet_ink_review_queue() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('version',to_jsonb(v),'uploads',coalesce((select jsonb_agg(to_jsonb(u) order by uploaded_at) from public.bond_wet_ink_uploads u where u.version_id=v.id),'[]'::jsonb)) order by v.created_at),'[]'::jsonb)
 from public.bond_wet_ink_versions v where v.status='awaiting_review' and public.bridge_bond_wet_ink_consultant(v.bond_application_id)
$$;

create function public.bridge_review_bond_wet_ink(p_upload uuid,p_action text,p_feedback text,p_checks jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.bond_wet_ink_versions%rowtype; u public.bond_wet_ink_uploads%rowtype; signer jsonb; check_item jsonb; doc_id uuid; sub_id uuid; signed_date date; consent_evidence jsonb;
begin
 select * into u from public.bond_wet_ink_uploads where id=p_upload;
 select * into v from public.bond_wet_ink_versions where id=u.version_id for update;
 select * into u from public.bond_wet_ink_uploads where id=p_upload for update;
 if v.id is null or not public.bridge_bond_wet_ink_consultant(v.bond_application_id) then raise exception 'Only the assigned consultant can review this application.' using errcode='42501'; end if;
 if u.status=p_action and u.reviewed_by=auth.uid() then return to_jsonb(u); end if;
 if u.status<>'awaiting_review' or v.status<>'awaiting_review' or p_action not in ('accepted','rejected') then raise exception 'This upload can no longer be reviewed.' using errcode='23514'; end if;
 if not exists(select 1 from storage.objects where id=u.storage_object_id and name=u.file_path and bucket_id='bond-signed-applications') then raise exception 'The original signed file is unavailable.' using errcode='23514'; end if;
 if p_action='rejected' then
  if length(trim(coalesce(p_feedback,'')))=0 then raise exception 'Give the applicant a reason for replacement.' using errcode='22023'; end if;
  update public.bond_wet_ink_uploads set status='rejected',feedback=left(p_feedback,2000),reviewed_by=auth.uid(),reviewed_at=now() where id=u.id returning * into u;
  update public.bond_wet_ink_versions set status='awaiting_upload' where id=v.id;
  return to_jsonb(u);
 end if;
 if p_checks->>'versionMatches' is distinct from 'true' or p_checks->>'allPagesPresent' is distinct from 'true' or p_checks->>'noAlterations' is distinct from 'true' then raise exception 'Check the reference, all pages and absence of altered answers.' using errcode='23514'; end if;
 for signer in select value from jsonb_array_elements(v.snapshot_json->'signerManifest') loop
  select value into check_item from jsonb_array_elements(coalesce(p_checks->'signers','[]')) where value->>'participantKey'=signer->>'participantKey';
  if check_item->>'signaturePresent' is distinct from 'true' or check_item->>'identityChecked' is distinct from 'true' or coalesce(check_item->>'signedDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Verify and date every required applicant signature.' using errcode='23514'; end if;
  if (check_item->>'signedDate')::date < (v.created_at at time zone 'Africa/Johannesburg')::date or (check_item->>'signedDate')::date > (now() at time zone 'Africa/Johannesburg')::date then raise exception 'Signature date does not match this application version.' using errcode='23514'; end if;
  signed_date:=greatest(signed_date,(check_item->>'signedDate')::date);
 end loop;
 -- The immutable snapshot stays unsigned. Verified acceptance evidence is
 -- recorded separately from the paper document after consultant review.
 select jsonb_agg(d.value||jsonb_build_object('accepted',case when (d.value->>'required')::boolean then true when d.value->>'key'='marketing_privacy_preference' then coalesce(c.value->>'marketingAccepted','false')='true' when d.value->>'key'='nhfc_first_home_finance_consent' then coalesce(c.value->>'firstHomeFinanceAccepted','false')='true' else false end,'acceptedAt',c.value->>'signedDate','method','wet_ink_upload','verifiedAt',now(),'verifiedBy',auth.uid(),'originalUploadId',u.id)) into consent_evidence
 from jsonb_array_elements(v.snapshot_json->'participants') p
 cross join lateral jsonb_array_elements(p->'declarations') d
 join lateral jsonb_array_elements(p_checks->'signers') c on c.value->>'participantKey'=p->>'participantKey';
 insert into public.documents(transaction_id,name,file_path,file_bucket,mime_type,status,is_client_visible,visibility_scope,uploaded_by_party)
 values(v.transaction_id,u.file_name,u.file_path,'bond-signed-applications','application/pdf','uploaded',false,'internal','buyer') returning id into doc_id;
 insert into public.transaction_bond_application_submissions(transaction_id,bond_application_id,source_application_revision,submission_version,application_schema_version,flow_version,declaration_contract_version,status,snapshot_json,snapshot_hash,source_application_hash,declarations_json,document_manifest_json,selected_bank_ids,signer_manifest_json,signed_document_id,prepared_at,signed_at,submitted_at,metadata)
 values(v.transaction_id,v.bond_application_id,v.source_revision,v.version,'2','wet-ink-v1','phase-6-v1','submitted',v.snapshot_json,v.snapshot_hash,v.snapshot_hash,consent_evidence,v.snapshot_json->'documentManifest',v.snapshot_json->'selectedBanks',v.snapshot_json->'signerManifest',doc_id,v.created_at,signed_date::timestamptz,now(),jsonb_build_object('signingMethod','wet_ink_upload','wetInkVersionId',v.id,'originalUploadId',u.id,'reviewedBy',auth.uid(),'reviewedAt',now(),'signatureChecks',p_checks)) returning id into sub_id;
 update public.bond_wet_ink_uploads set status='accepted',checks_json=p_checks,reviewed_by=auth.uid(),reviewed_at=now(),document_id=doc_id where id=u.id returning * into u;
 update public.bond_wet_ink_versions set status='accepted',submission_id=sub_id where id=v.id;
 update public.bond_applications set status='submitted',active_submission_id=sub_id,submitted_at=now(),updated_at=now() where id=v.bond_application_id;
 update public.bond_application_participants set status='signed' where bond_application_id=v.bond_application_id and removed_at is null and status not in ('removed','declined');
 return to_jsonb(u);
end $$;

revoke all on function public.bridge_bond_wet_ink_immutable(),public.bridge_bond_wet_ink_canonical(jsonb),public.bridge_bond_wet_ink_consultant(uuid),public.bridge_bond_wet_ink_context(),public.bridge_prepare_bond_wet_ink(integer,jsonb),public.bridge_bond_wet_ink_storage_access(text,boolean),public.bridge_upload_bond_wet_ink(uuid,uuid,text,integer,text),public.bridge_cancel_bond_wet_ink(uuid),public.bridge_bond_wet_ink_review_queue(),public.bridge_review_bond_wet_ink(uuid,text,text,jsonb) from public;
grant execute on function public.bridge_bond_wet_ink_context(),public.bridge_prepare_bond_wet_ink(integer,jsonb),public.bridge_bond_wet_ink_storage_access(text,boolean),public.bridge_upload_bond_wet_ink(uuid,uuid,text,integer,text),public.bridge_cancel_bond_wet_ink(uuid) to anon,authenticated;
grant execute on function public.bridge_bond_wet_ink_review_queue(),public.bridge_review_bond_wet_ink(uuid,text,text,jsonb) to authenticated;
commit;
