begin;

alter table public.listing_media
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists content_type text,
  add column if not exists byte_size bigint,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists checksum text,
  add column if not exists processing_status text not null default 'ready';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listing_media_byte_size_nonnegative'
  ) then
    alter table public.listing_media
      add constraint listing_media_byte_size_nonnegative check (byte_size is null or byte_size >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'listing_media_dimensions_positive'
  ) then
    alter table public.listing_media
      add constraint listing_media_dimensions_positive check (
        (width is null or width > 0) and (height is null or height > 0)
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'listing_media_processing_status_check'
  ) then
    alter table public.listing_media
      add constraint listing_media_processing_status_check check (
        processing_status in ('pending', 'processing', 'ready', 'failed')
      );
  end if;
end;
$$;

with parsed as (
  select
    id,
    regexp_match(
      file_url,
      '/storage/v1/object/(?:sign|public|authenticated)/([^/?]+)/([^?]+)'
    ) as object_parts
  from public.listing_media
  where nullif(trim(coalesce(storage_path, '')), '') is null
    and file_url like '%/storage/v1/object/%'
)
update public.listing_media media
set
  storage_bucket = nullif(parsed.object_parts[1], ''),
  storage_path = nullif(parsed.object_parts[2], '')
from parsed
where media.id = parsed.id
  and parsed.object_parts is not null;

create index if not exists listing_media_storage_object_idx
  on public.listing_media (storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

create index if not exists listing_media_processing_status_idx
  on public.listing_media (processing_status, updated_at)
  where processing_status <> 'ready';

comment on column public.listing_media.storage_bucket is
  'Canonical Supabase Storage bucket. Persist this with storage_path; never persist signed URLs as object identity.';
comment on column public.listing_media.storage_path is
  'Canonical immutable object path. file_url is a temporary compatibility/delivery field.';
comment on column public.listing_media.processing_status is
  'Media processing lifecycle for future asynchronous optimization.';

commit;
