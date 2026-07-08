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

drop policy if exists attorney_firm_branding_owner_select on storage.objects;
create policy attorney_firm_branding_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id in ('organisation-branding', 'documents')
  and (storage.foldername(name))[1] = 'attorney-firms'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[3] = 'branding'
);

drop policy if exists attorney_firm_branding_owner_insert on storage.objects;
create policy attorney_firm_branding_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('organisation-branding', 'documents')
  and (storage.foldername(name))[1] = 'attorney-firms'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[3] = 'branding'
  and lower(storage.filename(name)) ~ '\.(png|jpe?g|webp|svg)$'
);

drop policy if exists attorney_firm_branding_owner_update on storage.objects;
create policy attorney_firm_branding_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id in ('organisation-branding', 'documents')
  and (storage.foldername(name))[1] = 'attorney-firms'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[3] = 'branding'
)
with check (
  bucket_id in ('organisation-branding', 'documents')
  and (storage.foldername(name))[1] = 'attorney-firms'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[3] = 'branding'
  and lower(storage.filename(name)) ~ '\.(png|jpe?g|webp|svg)$'
);

drop policy if exists attorney_firm_branding_owner_delete on storage.objects;
create policy attorney_firm_branding_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('organisation-branding', 'documents')
  and (storage.foldername(name))[1] = 'attorney-firms'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[3] = 'branding'
);
