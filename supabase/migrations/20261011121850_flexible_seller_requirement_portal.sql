begin;
alter table document_requirement_private.uploads alter column actor_id drop not null;
alter table document_requirement_private.uploads add column portal_listing_id uuid references public.private_listings(id);
alter table document_requirement_private.uploads add constraint requirement_upload_actor check(actor_id is not null or portal_listing_id is not null);
create table document_requirement_private.portal_receipts (
  listing_id uuid not null,command_id uuid not null,requirement_id uuid not null references public.document_requirement_instances(id),
  envelope jsonb not null,result jsonb not null,primary key(listing_id,command_id)
);
alter table document_requirement_private.portal_receipts enable row level security;
revoke all on document_requirement_private.portal_receipts from public,anon,authenticated;

create function document_requirement_private.seller_session_listing(p_token text,p_access text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare resolution record; o public.private_listing_seller_onboarding; l public.private_listings;
begin
  select * into resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token) where token_valid and token_kind in ('stable','legacy');
  if not found then raise exception 'Seller portal link is invalid or inactive.' using errcode='42501'; end if;
  select * into o from public.private_listing_seller_onboarding where id=resolution.onboarding_id;
  select * into l from public.private_listings where id=o.private_listing_id;
  if l.id is null or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(o),to_jsonb(l))
    or nullif(p_access,'') is null or o.seller_portal_access_token_hash is distinct from encode(extensions.digest(p_access,'sha256'),'hex')
    or o.seller_portal_access_token_expires_at is null or o.seller_portal_access_token_expires_at<=now() then
    raise exception 'Seller portal authentication is required.' using errcode='42501';
  end if;
  return l.id;
end $$;
create function document_requirement_private.seller_requirement_visible(p_requirement uuid,p_listing uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.document_requirement_instances r join public.private_listings l on l.id=p_listing
 where r.id=p_requirement and r.requested_from_role='seller' and 'seller'=any(r.visible_to_roles)
 and ((r.transaction_id is null and ((r.context_type='private_listing' and r.context_id=l.id) or
   (r.context_type='seller_lead' and exists(select 1 from public.leads lead where lead.lead_id=r.context_id and lead.organisation_id=l.organisation_id
    and lead.lead_id::text in (to_jsonb(l)->>'seller_lead_id',to_jsonb(l)->>'originating_crm_lead_id')))))
 or (r.transaction_id=public.bridge_resolve_private_listing_transaction_id(l.id) and exists(select 1 from public.transactions t where t.id=r.transaction_id and t.organisation_id=l.organisation_id))))
$$;

-- Keep the existing portal activation/session and final-artifact fences. Replace
-- only exact canonical identities, never another request with the same label.
alter function public.bridge_private_listing_seller_portal_payload(text,text,boolean) rename to bridge_seller_payload_before_flexible;
revoke all on function public.bridge_seller_payload_before_flexible(text,text,boolean) from public,anon,authenticated,service_role;
create function document_requirement_private.seller_payload(p_token text,p_access_token text,p_require_access boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; listing uuid; ids uuid[]; requirements jsonb; docs jsonb; shared_requirements jsonb;
begin
 result:=public.bridge_seller_payload_before_flexible(p_token,p_access_token,p_require_access);
 if result is null or coalesce((result->>'authRequired')::boolean,false) then return result; end if;
 -- A lightweight pre-login payload must not gain access to protected files.
 if nullif(p_access_token,'') is null then return result; end if;
 listing:=document_requirement_private.seller_session_listing(p_token,p_access_token);
 select coalesce(array_agg(id),'{}'::uuid[]) into ids from public.document_requirement_instances r
 where document_requirement_private.seller_requirement_visible(r.id,listing)
 and (r.requirement_origin='manual' or r.applicability_override='removed' or r.latest_upload_id is not null);
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'private_listing_id',listing,
   'requirement_key',coalesce(r.document_definition_key,'custom_'||r.id),'requirement_name',coalesce(r.custom_label,d.display_label,r.document_definition_key),
   'canonical_requirement_instance_id',r.id,'requirement_group','compliance','applies_to','seller','requested_from_role','seller',
   'document_visibility','seller_visible','is_required',r.requirement_level in ('required','blocker'),'status',r.status,
   'canonical_shared_requirement',true,'command_revision',r.command_revision,'latest_upload_id',r.latest_upload_id,
   'satisfied_by_document_id',r.satisfied_by_document_id,'uploadable_by_roles',r.uploadable_by_roles)),'[]'::jsonb) into requirements
 from public.document_requirement_instances r left join public.document_definitions d on d.key=r.document_definition_key
 where r.id=any(ids) and r.applicability_override is null and r.status<>'not_applicable';
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'private_listing_id',listing,'requirement_id',r.id,
   'canonical_requirement_instance_id',r.id,'document_type',coalesce(r.document_definition_key,'custom_'||r.id),
   'document_name',u.file_name,'storage_path',u.file_path,'storage_bucket','documents','status',r.status,
   'visibility','seller_visible','uploaded_at',u.created_at,'created_at',u.created_at)),'[]'::jsonb) into docs
 from public.document_requirement_instances r join document_requirement_private.uploads u on u.id=r.latest_upload_id
 where r.id=any(ids) and r.applicability_override is null and r.status<>'not_applicable';
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'document_definition_key',r.document_definition_key,'custom_label',r.custom_label,
  'context_type',r.context_type,'context_id',r.context_id,'requested_from_role',r.requested_from_role,'requested_from_contact_id',r.requested_from_contact_id,
  'subject_id',r.subject_id,'subject_kind',r.subject_kind,'pack_key',r.pack_key,'status',r.status,'requirement_level',r.requirement_level,
  'applicability_override',r.applicability_override,'latest_upload_id',r.latest_upload_id,'satisfied_by_document_id',r.satisfied_by_document_id,
  'uploadable_by_roles',r.uploadable_by_roles,'document_definitions',jsonb_build_object('display_label',d.display_label))),'[]'::jsonb) into shared_requirements
 from public.document_requirement_instances r left join public.document_definitions d on d.key=r.document_definition_key where r.id=any(ids);
 result:=result||jsonb_build_object('sharedDocumentRequirements',shared_requirements);
 result:=jsonb_set(result,'{requirements}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(result->'requirements','[]'))
   where coalesce(value->>'canonical_requirement_instance_id','')<>all(select unnest(ids)::text)),'[]'::jsonb)||requirements);
 result:=jsonb_set(result,'{documents}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(result->'documents','[]'))
   where coalesce(value->>'canonical_requirement_instance_id','')<>all(select r.id::text from public.document_requirement_instances r where r.id=any(ids) and (r.applicability_override='removed' or r.status='not_applicable' or r.latest_upload_id is not null))),'[]'::jsonb)||docs);
 return result;
end $$;
create function public.bridge_private_listing_seller_portal_payload(p_token text,p_access_token text default null,p_require_access boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select document_requirement_private.seller_payload(p_token,p_access_token,p_require_access)$$;

create function document_requirement_private.seller_upload_receipt(p_token text,p_access_token text,p_command_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare listing uuid; receipt document_requirement_private.portal_receipts;
begin
 listing:=document_requirement_private.seller_session_listing(p_token,p_access_token);
 select * into receipt from document_requirement_private.portal_receipts where listing_id=listing and command_id=p_command_id;
 if not found then return null; end if;
 if not document_requirement_private.seller_requirement_visible(receipt.requirement_id,listing) then raise exception 'Requirement access changed.' using errcode='42501'; end if;
 return jsonb_build_object('envelope',receipt.envelope,'result',receipt.result);
end $$;
create function public.bridge_seller_requirement_upload_receipt(p_token text,p_access_token text,p_command_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select document_requirement_private.seller_upload_receipt(p_token,p_access_token,p_command_id)$$;

create function document_requirement_private.seller_upload(p_token text,p_access_token text,p_command_id uuid,p_requirement_id uuid,p_expected_revision bigint,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare listing uuid; r public.document_requirement_instances; receipt document_requirement_private.portal_receipts;
 envelope jsonb; result jsonb; path text; filename text; mime text; size bigint; object storage.objects;
begin
 listing:=document_requirement_private.seller_session_listing(p_token,p_access_token);
 if p_command_id is null or p_requirement_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid upload command.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('seller-requirement:'||listing||':'||p_command_id,0));
 -- Match the professional command/handover lock order.
 select * into r from public.document_requirement_instances where id=p_requirement_id;
 if r.transaction_id is not null then
   perform pg_advisory_xact_lock(hashtextextended(r.transaction_id::text,0));
   perform pg_advisory_xact_lock(hashtextextended('attorney-documents:'||r.transaction_id,0));
 else perform pg_advisory_xact_lock(hashtextextended('requirement-source:'||r.context_type||':'||r.context_id,0)); end if;
 select * into r from public.document_requirement_instances where id=p_requirement_id for update;
 if not document_requirement_private.seller_requirement_visible(r.id,listing) or not coalesce('seller'=any(r.uploadable_by_roles),false) then raise exception 'This requirement does not accept your upload.' using errcode='42501'; end if;
 envelope:=jsonb_build_object('requirementId',p_requirement_id,'expectedRevision',p_expected_revision,'payload',p_payload);
 select * into receipt from document_requirement_private.portal_receipts where listing_id=listing and command_id=p_command_id;
 if found then
   if receipt.envelope is distinct from envelope then raise exception 'Retry the original upload command.' using errcode='22023'; end if;
   return receipt.result;
 end if;
 if coalesce(r.document_definition_key,'') ~ '(signed_|mandate|disclosure|fica_declaration|signature)' then raise exception 'Use the approved signing workflow for this document.' using errcode='42501'; end if;
 if r.applicability_override='removed' or r.status='not_applicable' then raise exception 'This document is no longer requested.' using errcode='22023'; end if;
 if p_expected_revision is distinct from r.command_revision or nullif(p_payload->>'replacesUploadId','')::uuid is distinct from r.latest_upload_id then raise exception 'This requirement changed. Refresh before uploading.' using errcode='40001'; end if;
 path:=p_payload->>'filePath'; filename:=p_payload->>'fileName'; mime:=p_payload->>'mimeType'; size:=(p_payload->>'sizeBytes')::bigint;
 if filename is null or filename !~ '^[A-Za-z0-9_.-]{1,200}$' or path is distinct from 'document-requirements/'||r.id||'/'||listing||'/'||p_command_id||'/'||filename
   or size is null or size not between 1 and 36700160 or coalesce(p_payload->>'sha256','') !~ '^[a-f0-9]{64}$'
   or not coalesce((filename ~* '\.pdf$' and mime='application/pdf') or (filename ~* '\.jpe?g$' and mime='image/jpeg') or (filename ~* '\.png$' and mime='image/png') or
    (filename ~* '\.doc$' and mime='application/msword') or (filename ~* '\.docx$' and mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'),false) then raise exception 'Invalid private upload metadata.' using errcode='22023'; end if;
 select * into object from storage.objects where bucket_id='documents' and name=path for update;
 if object.id is null or (object.metadata->>'size')::bigint is distinct from size or object.metadata->>'mimetype' is distinct from mime
  or object.user_metadata->>'sha256' is distinct from p_payload->>'sha256' or not exists(select 1 from storage.buckets where id='documents' and public=false) then raise exception 'The private upload could not be verified.' using errcode='42501'; end if;
 insert into document_requirement_private.uploads(id,requirement_id,file_path,file_name,mime_type,size_bytes,portal_listing_id,replaces_upload_id)
 values(p_command_id,r.id,path,filename,mime,size,listing,r.latest_upload_id);
 if r.transaction_id is not null then
  insert into public.documents(id,transaction_id,name,file_path,file_bucket,category,document_type,canonical_requirement_instance_id,visibility_scope,is_client_visible,client_recipient_role,source)
  values(p_command_id,r.transaction_id,filename,path,'documents','General',coalesce(r.document_definition_key,'custom_'||r.id),r.id,'client_visible',true,'seller','document_requirement_command');
  update document_requirement_private.uploads set document_id=p_command_id where id=p_command_id;
 end if;
 update public.document_requirement_instances set latest_upload_id=p_command_id,satisfied_by_document_id=case when transaction_id is not null then p_command_id else satisfied_by_document_id end,
 status='under_review',rejection_reason=null,waiver_reason=null where id=r.id returning * into r;
 update public.document_requests set requested_document_id=p_command_id,status='uploaded',updated_at=now() where canonical_requirement_instance_id=r.id and status not in ('completed','cancelled') and r.transaction_id is not null;
 select * into r from public.document_requirement_instances where id=r.id;
 insert into public.document_requirement_events(requirement_instance_id,event_type,actor_role,message,metadata_json)
 values(r.id,'uploaded','seller','Seller uploaded requested evidence.',jsonb_build_object('commandId',p_command_id,'uploadId',p_command_id));
 result:=jsonb_build_object('saved',true,'commandId',p_command_id,'requirement',to_jsonb(r),'uploadId',p_command_id);
 insert into document_requirement_private.portal_receipts values(listing,p_command_id,r.id,envelope,result);
 return result;
end $$;
create function public.bridge_seller_requirement_upload(p_token text,p_access_token text,p_command_id uuid,p_requirement_id uuid,p_expected_revision bigint,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select document_requirement_private.seller_upload(p_token,p_access_token,p_command_id,p_requirement_id,p_expected_revision,p_payload)$$;

alter function document_requirement_private.object_access(text,text,boolean) rename to professional_object_access;
create function document_requirement_private.object_access(p_bucket text,p_name text,p_write boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare listing uuid; r public.document_requirement_instances; registered boolean;
begin
 if split_part(p_name,'/',1)<>'document-requirements' then return true; end if;
 if document_requirement_private.professional_object_access(p_bucket,p_name,p_write) then return true; end if;
 if p_bucket<>'documents' then return false; end if;
 listing:=document_requirement_private.seller_session_listing(public.bridge_storage_request_header('x-bridge-seller-portal-token'),public.bridge_storage_request_header('x-bridge-seller-portal-access-token'));
 select * into r from public.document_requirement_instances where id=split_part(p_name,'/',2)::uuid;
 if not document_requirement_private.seller_requirement_visible(r.id,listing) then return false; end if;
 select exists(select 1 from document_requirement_private.uploads where file_path=p_name and requirement_id=r.id) into registered;
 if registered then return not p_write; end if;
 return p_write and r.applicability_override is null and r.status<>'not_applicable' and 'seller'=any(r.uploadable_by_roles)
  and split_part(p_name,'/',3)=listing::text and split_part(p_name,'/',4) ~ '^[0-9a-f-]{36}$'
  and split_part(p_name,'/',5) ~ '^[A-Za-z0-9_.-]{1,200}$' and split_part(p_name,'/',6)='';
 exception when others then return false;
end $$;
-- Existing policies bind the old function OID; recreate them against the wrapper.
drop policy requirement_upload_read_boundary on storage.objects;
drop policy requirement_upload_insert_boundary on storage.objects;
drop policy requirement_upload_update_boundary on storage.objects;
drop policy requirement_upload_delete_boundary on storage.objects;
drop policy requirement_upload_insert on storage.objects;
drop policy requirement_upload_read on storage.objects;
create policy requirement_upload_read_boundary on storage.objects as restrictive for select to anon,authenticated using(document_requirement_private.object_access(bucket_id,name,false));
create policy requirement_upload_insert_boundary on storage.objects as restrictive for insert to anon,authenticated with check(document_requirement_private.object_access(bucket_id,name,true));
create policy requirement_upload_update_boundary on storage.objects as restrictive for update to anon,authenticated using(document_requirement_private.object_access(bucket_id,name,true)) with check(document_requirement_private.object_access(bucket_id,name,true));
create policy requirement_upload_delete_boundary on storage.objects as restrictive for delete to anon,authenticated using(document_requirement_private.object_access(bucket_id,name,true));
create policy requirement_upload_insert on storage.objects for insert to anon,authenticated with check(bucket_id='documents' and split_part(name,'/',1)='document-requirements' and document_requirement_private.object_access(bucket_id,name,true));
create policy requirement_upload_read on storage.objects for select to anon,authenticated using(bucket_id='documents' and split_part(name,'/',1)='document-requirements' and document_requirement_private.object_access(bucket_id,name,false));
revoke all on function document_requirement_private.seller_session_listing(text,text),document_requirement_private.seller_requirement_visible(uuid,uuid),document_requirement_private.seller_payload(text,text,boolean),document_requirement_private.seller_upload_receipt(text,text,uuid),document_requirement_private.seller_upload(text,text,uuid,uuid,bigint,jsonb),document_requirement_private.object_access(text,text,boolean) from public,anon,authenticated;
grant execute on function document_requirement_private.seller_payload(text,text,boolean),document_requirement_private.seller_upload_receipt(text,text,uuid),document_requirement_private.seller_upload(text,text,uuid,uuid,bigint,jsonb),document_requirement_private.object_access(text,text,boolean) to anon,authenticated;
revoke all on function public.bridge_private_listing_seller_portal_payload(text,text,boolean),public.bridge_seller_requirement_upload_receipt(text,text,uuid),public.bridge_seller_requirement_upload(text,text,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_private_listing_seller_portal_payload(text,text,boolean),public.bridge_seller_requirement_upload_receipt(text,text,uuid),public.bridge_seller_requirement_upload(text,text,uuid,uuid,bigint,jsonb) to anon,authenticated;
-- Retain the full document audience ACL while allowing this exact shared
-- requirement to follow the current listing transaction after handover.
do $audience$
declare body text; previous text := 't.listing_id=public.bridge_storage_seller_portal_listing_id()';
begin
 select pg_get_functiondef('document_security.can_read(public.documents)'::regprocedure) into body;
 if position(previous in body)=0 then raise exception 'Review seller document audience compatibility before applying this migration.'; end if;
 execute replace(body,previous,'(t.listing_id=public.bridge_storage_seller_portal_listing_id() or (d.source=''document_requirement_command'' and document_requirement_private.seller_requirement_visible(d.canonical_requirement_instance_id,public.bridge_storage_seller_portal_listing_id())))');
end $audience$;

-- Existing token-based buyer uploads continue through their established atomic
-- RPC. A custom type has no global definition and always requires review.
do $patch$
declare signature regprocedure; body text;
begin
 signature:=to_regprocedure('public.bridge_upload_buyer_portal_document(uuid,text,text,text,text,text,text,uuid,uuid,text,text,text,uuid)');
 if signature is not null then
  select pg_get_functiondef(signature) into body;
  if position('case when v_review_required then' in body)=0 then raise exception 'Review buyer upload review-status compatibility before applying this migration.'; end if;
  if position('if v_previous_status in (''approved'', ''completed'', ''waived'') then' in body)=0 then raise exception 'Review buyer replacement-status compatibility before applying this migration.'; end if;
  body:=replace(body,'case when v_review_required then','case when coalesce(v_review_required,true) then');
  execute replace(body,'if v_previous_status in (''approved'', ''completed'', ''waived'') then','if v_requirement.document_definition_key is not null and v_previous_status in (''approved'', ''completed'', ''waived'') then');
 end if;
end $patch$;
create function document_requirement_private.align_external_evidence() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.satisfied_by_document_id is distinct from old.satisfied_by_document_id and new.satisfied_by_document_id is distinct from new.latest_upload_id then
   new.latest_upload_id:=null;
 end if;
 return new;
end $$;
create trigger zy_requirement_external_evidence before update of satisfied_by_document_id on public.document_requirement_instances
for each row execute function document_requirement_private.align_external_evidence();
revoke all on function document_requirement_private.align_external_evidence() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
