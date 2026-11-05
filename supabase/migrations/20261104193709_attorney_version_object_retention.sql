-- Match the permanent metadata version-retention rule at the Storage boundary.
-- Uploading a new version remains permitted; stored audit versions are immutable.
create function document_security.retained_attorney_version_object(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.documents d where d.attorney_version_root_id is not null
 and coalesce(d.file_bucket,'documents')=p_bucket and d.file_path=p_path);
$$;
revoke all on function document_security.retained_attorney_version_object(text,text) from public;
grant execute on function document_security.retained_attorney_version_object(text,text) to anon,authenticated;
create policy attorney_version_object_delete_retention on storage.objects
as restrictive for delete to anon,authenticated
using(not document_security.retained_attorney_version_object(bucket_id,name));
create policy attorney_version_object_update_retention on storage.objects
as restrictive for update to anon,authenticated
using(not document_security.retained_attorney_version_object(bucket_id,name))
with check(not document_security.retained_attorney_version_object(bucket_id,name));
