begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists listing_media_storage_public_read on storage.objects;
create policy listing_media_storage_public_read
on storage.objects
for select
to public
using (bucket_id = 'listing-media');

drop policy if exists listing_media_storage_member_insert on storage.objects;
create policy listing_media_storage_member_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = 'organisations'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] = 'property24'
  and (storage.foldername(name))[4] in ('exdev', 'production')
  and coalesce((storage.foldername(name))[5], '') ~ '^[0-9]+$'
  and coalesce((storage.foldername(name))[6], '') ~ '^[0-9]+$'
  and public.bridge_is_active_member(((storage.foldername(name))[2])::uuid)
);

drop policy if exists listing_media_storage_member_update on storage.objects;
create policy listing_media_storage_member_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = 'organisations'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] = 'property24'
  and (storage.foldername(name))[4] in ('exdev', 'production')
  and coalesce((storage.foldername(name))[5], '') ~ '^[0-9]+$'
  and coalesce((storage.foldername(name))[6], '') ~ '^[0-9]+$'
  and public.bridge_is_active_member(((storage.foldername(name))[2])::uuid)
)
with check (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = 'organisations'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] = 'property24'
  and (storage.foldername(name))[4] in ('exdev', 'production')
  and coalesce((storage.foldername(name))[5], '') ~ '^[0-9]+$'
  and coalesce((storage.foldername(name))[6], '') ~ '^[0-9]+$'
  and public.bridge_is_active_member(((storage.foldername(name))[2])::uuid)
);

drop policy if exists listing_media_storage_member_delete on storage.objects;
create policy listing_media_storage_member_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = 'organisations'
  and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] = 'property24'
  and (storage.foldername(name))[4] in ('exdev', 'production')
  and coalesce((storage.foldername(name))[5], '') ~ '^[0-9]+$'
  and coalesce((storage.foldername(name))[6], '') ~ '^[0-9]+$'
  and public.bridge_is_active_member(((storage.foldername(name))[2])::uuid)
);

commit;
