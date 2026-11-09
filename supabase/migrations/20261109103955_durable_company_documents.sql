begin;
create schema company_document_private;
revoke all on schema company_document_private from public,anon;
grant usage on schema company_document_private to anon,authenticated;

create table public.company_documents (
  id uuid primary key,
  organisation_id uuid not null references public.organisations(id),
  uploaded_by uuid not null references auth.users(id),
  title text not null check(length(btrim(title)) between 1 and 300),
  category text not null check(length(btrim(category)) between 1 and 200),
  status text not null default 'uploaded' check(status in ('uploaded','pending_review','approved','rejected')),
  visibility text not null default 'management' check(visibility in ('management','organisation')),
  storage_bucket text not null default 'company-documents' check(storage_bucket='company-documents'),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes bigint not null check(size_bytes between 1 and 36700160),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  root_id uuid not null,
  version integer not null default 1 check(version>0),
  revision bigint not null default 1,
  supersedes_document_id uuid references public.company_documents(id),
  legacy_import_key text check(length(legacy_import_key)<=220),
  archived_at timestamptz,
  archived_reason text check(archived_reason in ('removed','superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index company_document_current_root on public.company_documents(root_id) where archived_at is null;
create unique index company_document_legacy_import on public.company_documents(organisation_id,uploaded_by,legacy_import_key) where legacy_import_key is not null;
create index company_documents_organisation_current on public.company_documents(organisation_id,created_at desc,id) where archived_at is null;
alter table public.company_documents enable row level security;
grant select on public.company_documents to authenticated;
grant select on public.company_documents to service_role;
revoke insert,update,delete on public.company_documents from anon,authenticated;

create function company_document_private.can_read(d public.company_documents) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and public.bridge_is_active_member(d.organisation_id)
   and (d.uploaded_by=auth.uid() or public.bridge_is_org_admin(d.organisation_id)
     or (d.visibility='organisation' and d.archived_at is null));
$$;
revoke all on function company_document_private.can_read(public.company_documents) from public,anon;
grant execute on function company_document_private.can_read(public.company_documents) to authenticated;
create policy company_document_read on public.company_documents for select to authenticated
using(company_document_private.can_read(company_documents));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('company-documents','company-documents',false,36700160,array['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
do $$begin
 if exists(select 1 from storage.buckets where id='company-documents' and public) then
   raise exception 'Company document storage must be private. Review the existing bucket before applying this migration.';
 end if;
end $$;

create function company_document_private.own_staged_path(p_path text) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare parts text[]:=string_to_array(p_path,'/');
begin
 if p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$' then return false; end if;
 perform parts[3]::uuid;
 return auth.uid() is not null and parts[2]=auth.uid()::text and public.bridge_is_active_member(parts[1]::uuid);
exception when invalid_text_representation then return false;
end; $$;
create function company_document_private.storage_access(p_path text,p_cleanup boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare d public.company_documents;
begin
 if auth.uid() is null then return false; end if;
 select * into d from public.company_documents where storage_path=p_path;
 if found then return not p_cleanup and company_document_private.can_read(d); end if;
 return company_document_private.own_staged_path(p_path);
end; $$;
revoke all on function company_document_private.own_staged_path(text),company_document_private.storage_access(text,boolean) from public,anon;
grant execute on function company_document_private.own_staged_path(text),company_document_private.storage_access(text,boolean) to anon,authenticated;
-- Dedicated bucket plus restrictive guards prevent broad older Storage policies
-- from granting another organisation access or permitting saved-file overwrite.
create policy company_object_insert on storage.objects for insert to authenticated with check(bucket_id='company-documents' and company_document_private.own_staged_path(name));
create policy company_object_insert_boundary on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'company-documents' or company_document_private.own_staged_path(name));
create policy company_object_read on storage.objects for select to authenticated using(bucket_id='company-documents' and company_document_private.storage_access(name));
create policy company_object_read_boundary on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'company-documents' or company_document_private.storage_access(name));
create policy company_object_no_overwrite on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'company-documents') with check(bucket_id<>'company-documents');
create policy company_object_cleanup on storage.objects for delete to authenticated using(bucket_id='company-documents' and company_document_private.storage_access(name,true));
create policy company_object_delete_boundary on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'company-documents' or company_document_private.storage_access(name,true));

create function company_document_private.save_upload(p_organisation_id uuid,p_upload_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d public.company_documents; previous public.company_documents;
 obj storage.objects; path text:=p_payload->>'storagePath'; prior uuid:=nullif(p_payload->>'previousId','')::uuid;
 scope_visibility text:=coalesce(p_payload->>'visibility','management'); legacy text:=nullif(p_payload->>'legacyImportKey','');
begin
 if actor is null or not public.bridge_is_active_member(p_organisation_id) then raise exception 'Your organisation access could not be verified.' using errcode='42501'; end if;
 if prior is null and p_payload->>'status' in ('approved','rejected') and not public.bridge_is_org_admin(p_organisation_id) then
   raise exception 'Only an administrator or manager can record a company document review.' using errcode='42501'; end if;
 if scope_visibility not in ('management','organisation') or (scope_visibility='organisation' and not public.bridge_is_org_admin(p_organisation_id)) then
   raise exception 'Only an organisation administrator or manager can share company documents with staff.' using errcode='42501'; end if;
 if not company_document_private.own_staged_path(path) or split_part(path,'/',1)<>p_organisation_id::text or split_part(path,'/',3)<>p_upload_id::text
   or p_payload->>'sha256' !~ '^[a-f0-9]{64}$' then raise exception 'The company file location could not be verified.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('company-upload:'||p_upload_id::text,0));
 if legacy is not null and right(legacy,65) is distinct from ':'||(p_payload->>'sha256') then
   raise exception 'The browser recovery reference does not match this file.' using errcode='22023'; end if;
 select * into d from public.company_documents where id=p_upload_id;
 if found then
   if d.organisation_id<>p_organisation_id or d.uploaded_by<>actor or d.storage_path is distinct from path or d.sha256 is distinct from p_payload->>'sha256'
     or d.title is distinct from p_payload->>'title' or d.category is distinct from p_payload->>'category'
     or d.supersedes_document_id is distinct from prior then raise exception 'This upload reference was already used for another file.' using errcode='22023'; end if;
   return jsonb_build_object('saved',true,'document',to_jsonb(d));
 end if;
 if prior is not null then
   select * into previous from public.company_documents where id=prior and organisation_id=p_organisation_id for update;
   if previous.id is null or (previous.uploaded_by<>actor and not public.bridge_is_org_admin(p_organisation_id)) then
     raise exception 'You do not have permission to replace this company document.' using errcode='42501'; end if;
   if previous.archived_at is not null or previous.revision is distinct from (p_payload->>'expectedRevision')::bigint then
     raise exception 'This company document changed. Reload before replacing it.' using errcode='40001'; end if;
 end if;
 select * into obj from storage.objects where bucket_id='company-documents' and name=path for update;
 if obj.id is null or obj.owner_id is distinct from actor::text or (obj.metadata->>'size')::bigint is distinct from (p_payload->>'sizeBytes')::bigint
   or obj.metadata->>'mimetype' is distinct from p_payload->>'mimeType' or obj.user_metadata->>'sha256' is distinct from p_payload->>'sha256' then
   raise exception 'The uploaded company file could not be verified. Keep the file selected and retry.' using errcode='42501'; end if;
 if previous.id is not null then update public.company_documents set archived_at=now(),archived_reason='superseded',updated_at=now(),revision=revision+1 where id=previous.id; end if;
 insert into public.company_documents(id,organisation_id,uploaded_by,title,category,status,visibility,storage_path,file_name,mime_type,size_bytes,sha256,root_id,version,supersedes_document_id,legacy_import_key)
 values(p_upload_id,p_organisation_id,actor,p_payload->>'title',p_payload->>'category',
   case when previous.id is not null then 'pending_review' else coalesce(p_payload->>'status','uploaded') end,
   scope_visibility,path,p_payload->>'fileName',p_payload->>'mimeType',(p_payload->>'sizeBytes')::bigint,p_payload->>'sha256',
   coalesce(previous.root_id,p_upload_id),coalesce(previous.version,0)+1,previous.id,legacy) returning * into d;
 return jsonb_build_object('saved',true,'document',to_jsonb(d));
end; $$;

create function company_document_private.change_document(p_organisation_id uuid,p_document_id uuid,p_revision bigint,p_action text,p_visibility text default null,p_status text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.company_documents; actor uuid:=auth.uid(); manager boolean;
begin
 if actor is null or not public.bridge_is_active_member(p_organisation_id) then raise exception 'Your organisation access could not be verified.' using errcode='42501'; end if;
 manager:=public.bridge_is_org_admin(p_organisation_id);
 select * into d from public.company_documents where id=p_document_id and organisation_id=p_organisation_id for update;
 if d.id is null or (d.uploaded_by<>actor and not manager) then raise exception 'You do not have permission to change this company document.' using errcode='42501'; end if;
 if p_action='archive' and d.archived_at is not null and d.archived_reason='removed' then return jsonb_build_object('saved',true,'document',to_jsonb(d)); end if;
 if p_action in ('visibility','status') and not manager then raise exception 'Only an administrator or manager can change company document sharing.' using errcode='42501'; end if;
 if p_action='status' and p_status=d.status and d.archived_at is null then return jsonb_build_object('saved',true,'document',to_jsonb(d)); end if;
 if p_action='visibility' and p_visibility=d.visibility and d.archived_at is null then return jsonb_build_object('saved',true,'document',to_jsonb(d)); end if;
 if d.archived_at is not null or p_revision is distinct from d.revision then raise exception 'This company document changed. Refresh before trying again.' using errcode='40001'; end if;
 if p_action='archive' then
   update public.company_documents set archived_at=now(),archived_reason='removed',updated_at=now(),revision=revision+1 where id=d.id returning * into d;
 elsif p_action='status' and p_status in ('uploaded','pending_review','approved','rejected') then
   update public.company_documents set status=p_status,updated_at=now(),revision=revision+1 where id=d.id returning * into d;
 elsif p_action='visibility' and p_visibility in ('management','organisation') then
   update public.company_documents set visibility=p_visibility,updated_at=now(),revision=revision+1 where id=d.id returning * into d;
 else raise exception 'Choose a valid company document change.' using errcode='22023'; end if;
 return jsonb_build_object('saved',true,'document',to_jsonb(d));
end; $$;

create function public.bridge_company_document_upload(p_organisation_id uuid,p_upload_id uuid,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select company_document_private.save_upload(p_organisation_id,p_upload_id,p_payload)$$;
create function public.bridge_company_document_change(p_organisation_id uuid,p_document_id uuid,p_revision bigint,p_action text,p_visibility text default null,p_status text default null) returns jsonb
language sql security invoker set search_path='' as $$select company_document_private.change_document(p_organisation_id,p_document_id,p_revision,p_action,p_visibility,p_status)$$;
create function public.bridge_company_document_workspace(p_organisation_id uuid,p_include_history boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('organisationId',p_organisation_id,'canManageAll',public.bridge_is_active_member(p_organisation_id) and public.bridge_is_org_admin(p_organisation_id),
   'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc,d.id) from public.company_documents d
     where d.organisation_id=p_organisation_id and (p_include_history or d.archived_at is null)),'[]'::jsonb))
 where auth.uid() is not null and public.bridge_is_active_member(p_organisation_id);
$$;
revoke all on function company_document_private.save_upload(uuid,uuid,jsonb),company_document_private.change_document(uuid,uuid,bigint,text,text,text),
  public.bridge_company_document_upload(uuid,uuid,jsonb),public.bridge_company_document_change(uuid,uuid,bigint,text,text,text),public.bridge_company_document_workspace(uuid,boolean) from public,anon;
grant execute on function company_document_private.save_upload(uuid,uuid,jsonb),company_document_private.change_document(uuid,uuid,bigint,text,text,text),
  public.bridge_company_document_upload(uuid,uuid,jsonb),public.bridge_company_document_change(uuid,uuid,bigint,text,text,text),public.bridge_company_document_workspace(uuid,boolean) to authenticated;
-- Include company files and retained versions in the existing read-only,
-- service-only persistence snapshot. Preserve its original grants and wrapper.
do $patch$
declare definition text;
  root_marker text:=$text$select 'development_documents' as source, jsonb_build_object$text$;
  refs_marker text:=$text$), direct_refs as ($text$;
  inventory_marker text:=$text$('development_documents'),$text$;
  bucket_marker text:=$text$'documents','legal-templates'$text$;
begin
  if to_regprocedure('public.document_persistence_monitor_snapshot(text)') is null then return; end if;
  select pg_get_functiondef('public.document_persistence_monitor_snapshot(text)'::regprocedure) into definition;
  if position('company_documents' in definition)>0 then return; end if;
  if position(root_marker in definition)=0 or position(refs_marker in definition)=0
    or position(inventory_marker in definition)=0 or position(bucket_marker in definition)=0 then
    raise exception 'Document snapshot changed; review the company document coverage patch.';
  end if;
  definition:=replace(definition,root_marker,$text$select 'company_documents' as source,
    jsonb_build_object('id',t.id,'organisation_id',t.organisation_id,'storage_path',t.storage_path,'storage_bucket',t.storage_bucket) as row
    from public.company_documents t
union all
$text$||root_marker);
  definition:=replace(definition,refs_marker,refs_marker||$text$
select source,row,'storage_path' as field,coalesce(nullif(row->>'storage_bucket',''),'company-documents') as bucket,
  regexp_replace(row->>'storage_path','[?].*$','') as path from roots where source='company_documents'
union all
$text$);
  definition:=replace(definition,inventory_marker,$text$('company_documents'),('development_documents'),$text$);
  definition:=replace(definition,bucket_marker,$text$'company-documents','documents','legal-templates'$text$);
  execute definition;
end; $patch$;
notify pgrst,'reload schema';
commit;
