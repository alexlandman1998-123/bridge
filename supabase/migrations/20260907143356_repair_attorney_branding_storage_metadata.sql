-- Early branding uploads stored a signed URL but not its stable Storage address.
-- Signed URLs expire, so recover the bucket/path only when the referenced object
-- still exists. The application can then issue a fresh signed URL at session boot.
with signed_logo_paths as (
  select
    branding.id,
    split_part(split_part(branding.logo_url, '/object/sign/', 2), '/', 1) as bucket_id,
    regexp_replace(
      regexp_replace(split_part(branding.logo_url, '/object/sign/', 2), '^[^/]+/', ''),
      '\?.*$',
      ''
    ) as object_name
  from public.attorney_firm_branding branding
  where coalesce(branding.logo_bucket, '') = ''
    and coalesce(branding.logo_path, '') = ''
    and branding.logo_url like '%/storage/v1/object/sign/%'
)
update public.attorney_firm_branding branding
set
  logo_bucket = signed_logo_paths.bucket_id,
  logo_path = signed_logo_paths.object_name,
  updated_at = now()
from signed_logo_paths
join storage.objects object_row
  on object_row.bucket_id = signed_logo_paths.bucket_id
 and object_row.name = signed_logo_paths.object_name
where branding.id = signed_logo_paths.id;
