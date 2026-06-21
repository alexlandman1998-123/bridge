begin;

-- Phase 2: legal template storage bridge.
-- Canonical object path:
-- organisations/{organisation_id}/{module_type}/{packet_type}/{template_key}/{version_tag}/{file_name}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-templates',
  'legal-templates',
  false,
  26214400,
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/pdf',
    'text/html',
    'application/json',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.bridge_legal_template_storage_org_id(object_name text)
returns uuid
language sql
stable
security definer
set search_path = public, storage
as $$
  select case
    when (storage.foldername(object_name))[1] = 'organisations'
      and coalesce((storage.foldername(object_name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[2])::uuid
    else null::uuid
  end;
$$;

create or replace function public.bridge_is_legal_template_storage_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select
    (storage.foldername(object_name))[1] = 'organisations'
    and coalesce((storage.foldername(object_name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and coalesce((storage.foldername(object_name))[3], '') ~ '^[a-z][a-z0-9_]*$'
    and coalesce((storage.foldername(object_name))[4], '') ~ '^[a-z][a-z0-9_]*$'
    and coalesce((storage.foldername(object_name))[5], '') ~ '^[a-z][a-z0-9_]*$'
    and coalesce((storage.foldername(object_name))[6], '') ~ '^[a-z0-9][a-z0-9._-]*$'
    and object_name ~* '\.(docx|doc|pdf|html|json)$';
$$;

grant execute on function public.bridge_legal_template_storage_org_id(text) to authenticated;
grant execute on function public.bridge_is_legal_template_storage_path(text) to authenticated;

drop policy if exists legal_templates_admin_insert on storage.objects;
create policy legal_templates_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and public.bridge_is_org_admin(public.bridge_legal_template_storage_org_id(name))
);

drop policy if exists legal_templates_admin_update on storage.objects;
create policy legal_templates_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and public.bridge_is_org_admin(public.bridge_legal_template_storage_org_id(name))
)
with check (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and public.bridge_is_org_admin(public.bridge_legal_template_storage_org_id(name))
);

drop policy if exists legal_templates_admin_delete on storage.objects;
create policy legal_templates_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and public.bridge_is_org_admin(public.bridge_legal_template_storage_org_id(name))
);

drop policy if exists legal_templates_registry_read on storage.objects;
create policy legal_templates_registry_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and (
    public.bridge_is_org_admin(public.bridge_legal_template_storage_org_id(name))
    or exists (
      select 1
      from public.document_packet_templates template
      where template.organisation_id = public.bridge_legal_template_storage_org_id(name)
        and template.template_storage_bucket = bucket_id
        and template.template_storage_path = name
        and template.status = 'published'
        and template.is_active = true
        and public.bridge_is_active_member(template.organisation_id)
    )
    or exists (
      select 1
      from public.document_packet_template_versions version
      where version.organisation_id = public.bridge_legal_template_storage_org_id(name)
        and version.storage_bucket = bucket_id
        and version.storage_path = name
        and version.status = 'published'
        and public.bridge_is_active_member(version.organisation_id)
    )
  )
);

commit;
