begin;

create table if not exists public.listing_media_variants (
  id uuid primary key default gen_random_uuid(),
  listing_media_id uuid not null references public.listing_media(id) on delete cascade,
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  variant_key text not null check (variant_key in ('thumbnail', 'card', 'detail')),
  source_revision text not null,
  storage_bucket text not null,
  storage_path text not null,
  content_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  status text not null default 'ready' check (status in ('pending', 'ready', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_media_id, variant_key)
);

create index if not exists listing_media_variants_listing_idx
  on public.listing_media_variants (listing_id, variant_key, status);
create unique index if not exists listing_media_variants_object_idx
  on public.listing_media_variants (storage_bucket, storage_path);

alter table public.listing_media_variants enable row level security;
drop policy if exists listing_media_variants_select_visible_listing on public.listing_media_variants;
create policy listing_media_variants_select_visible_listing
  on public.listing_media_variants for select to authenticated
  using (exists (
    select 1 from public.private_listings listing
    where listing.id = listing_media_variants.listing_id
  ));

revoke all on table public.listing_media_variants from public, anon, authenticated;
grant select on table public.listing_media_variants to authenticated;
grant all on table public.listing_media_variants to service_role;

alter table public.listing_background_jobs
  drop constraint if exists listing_background_jobs_job_type_check;
alter table public.listing_background_jobs
  add constraint listing_background_jobs_job_type_check check (job_type in (
    'media_reconcile', 'media_variant_refresh', 'property24_publish',
    'private_property_publish', 'document_generate', 'webhook_deliver'
  ));

create or replace function public.bridge_enqueue_listing_job_v1(
  p_listing_id uuid,
  p_job_type text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_max_attempts integer default 5
)
returns public.listing_background_jobs
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_organisation_id uuid;
  v_job public.listing_background_jobs;
  v_key text := nullif(trim(p_idempotency_key), '');
begin
  if p_listing_id is null then raise exception 'Listing id is required.'; end if;
  if p_job_type not in ('media_reconcile', 'media_variant_refresh', 'property24_publish', 'private_property_publish', 'document_generate', 'webhook_deliver') then
    raise exception 'Unsupported listing job type.';
  end if;
  select organisation_id into v_organisation_id from public.private_listings where id = p_listing_id;
  if v_organisation_id is null then raise exception 'Listing is unavailable.' using errcode = '42501'; end if;

  if v_key is not null then
    select * into v_job from public.listing_background_jobs
    where organisation_id = v_organisation_id and job_type = p_job_type and idempotency_key = v_key;
    if v_job.id is not null then return v_job; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_organisation_id::text, 918273));
  if (select count(*) from public.listing_background_jobs
      where organisation_id = v_organisation_id and status in ('queued', 'retry_scheduled', 'processing')) >= 500 then
    raise exception 'Listing job queue is at capacity; retry later.' using errcode = '53300';
  end if;

  insert into public.listing_background_jobs (
    organisation_id, listing_id, job_type, payload, idempotency_key, max_attempts, requested_by
  ) values (
    v_organisation_id, p_listing_id, p_job_type, coalesce(p_payload, '{}'::jsonb), v_key,
    least(20, greatest(1, coalesce(p_max_attempts, 5))), auth.uid()
  )
  on conflict (organisation_id, job_type, idempotency_key) where idempotency_key is not null
  do update set updated_at = public.listing_background_jobs.updated_at
  returning * into v_job;
  return v_job;
end;
$$;

comment on table public.listing_media_variants is
  'Materialized immutable Storage variants. source_revision changes the object path to invalidate CDN caches.';

commit;
