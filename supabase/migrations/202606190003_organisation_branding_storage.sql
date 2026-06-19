insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organisation-branding',
  'organisation-branding',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists organisation_branding_public_read on storage.objects;
create policy organisation_branding_public_read
on storage.objects
for select
to public
using (bucket_id = 'organisation-branding');

drop policy if exists organisation_branding_member_insert on storage.objects;
create policy organisation_branding_member_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organisation-branding'
  and (storage.foldername(name))[1] = 'organisations'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.bridge_is_active_member(((storage.foldername(name))[2])::uuid)
);

drop policy if exists organisation_branding_member_update on storage.objects;
create policy organisation_branding_member_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organisation-branding'
  and (storage.foldername(name))[1] = 'organisations'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.bridge_is_active_member(((storage.foldername(name))[2])::uuid)
)
with check (
  bucket_id = 'organisation-branding'
  and (storage.foldername(name))[1] = 'organisations'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.bridge_is_active_member(((storage.foldername(name))[2])::uuid)
);

drop policy if exists organisation_branding_member_delete on storage.objects;
create policy organisation_branding_member_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organisation-branding'
  and (storage.foldername(name))[1] = 'organisations'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.bridge_is_active_member(((storage.foldername(name))[2])::uuid)
);
