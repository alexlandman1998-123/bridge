-- Read-only Phase 0 evidence pack. Run in Supabase SQL Editor against staging first.
-- EXPLAIN ANALYZE executes SELECT statements only; this file contains no mutations.

select
  count(*) as total_listings,
  count(distinct organisation_id) as organisations,
  count(*) filter (where listing_status = 'withdrawn') as withdrawn,
  count(*) filter (where listing_visibility = 'archived') as archived
from public.private_listings;

select organisation_id, branch_id, listing_status, count(*) as listings
from public.private_listings
group by organisation_id, branch_id, listing_status
order by listings desc;

select
  count(*) as media_rows,
  count(distinct listing_id) as listings_with_media,
  round(avg(asset_count), 2) as average_assets_per_listing,
  max(asset_count) as maximum_assets_per_listing
from (
  select listing_id, count(*) as asset_count
  from public.listing_media
  group by listing_id
) media_counts;

select schemaname, relname, seq_scan, idx_scan, n_live_tup, n_dead_tup
from pg_stat_user_tables
where relname in ('private_listings', 'listing_publication_data', 'listing_media', 'listing_external_links')
order by relname;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('private_listings', 'listing_publication_data', 'listing_media', 'listing_external_links')
order by tablename, indexname;

explain (analyze, buffers, format text)
select *
from public.private_listings
where organisation_id = (
  select organisation_id
  from public.private_listings
  where organisation_id is not null
  group by organisation_id
  order by count(*) desc
  limit 1
)
  and listing_status <> 'withdrawn'
  and listing_visibility <> 'archived'
order by updated_at desc;

explain (analyze, buffers, format text)
select listing_id, media_type, file_url, caption, sort_order, is_cover
from public.listing_media
where listing_id in (
  select id
  from public.private_listings
  order by updated_at desc
  limit 50
)
order by listing_id, sort_order;

-- Phase 2 media identity migration evidence.
select
  count(*) as media_rows,
  count(*) filter (where storage_bucket is not null and storage_path is not null) as canonical_identity_rows,
  count(*) filter (
    where media_type in ('image', 'floor_plan')
      and (storage_bucket is null or storage_path is null)
  ) as binary_assets_requiring_repair,
  count(*) filter (where processing_status <> 'ready') as assets_not_ready
from public.listing_media;
