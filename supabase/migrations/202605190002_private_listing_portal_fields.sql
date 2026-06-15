begin;
alter table if exists public.private_listings
  add column if not exists property24_listing_url text,
  add column if not exists property24_reference text,
  add column if not exists property24_status text not null default 'not_published',
  add column if not exists private_property_listing_url text,
  add column if not exists private_property_reference text,
  add column if not exists private_property_status text not null default 'not_published',
  add column if not exists bridge_listing_status text not null default 'not_published',
  add column if not exists bridge_listing_public_url text,
  add column if not exists listing_preview_description text,
  add column if not exists internal_listing_notes text;
do $$
begin
  if to_regclass('public.private_listings') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'private_listings_property24_status_check'
    ) then
      alter table public.private_listings
        add constraint private_listings_property24_status_check
        check (property24_status in ('not_published', 'draft', 'published', 'paused', 'removed'));
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'private_listings_private_property_status_check'
    ) then
      alter table public.private_listings
        add constraint private_listings_private_property_status_check
        check (private_property_status in ('not_published', 'draft', 'published', 'paused', 'removed'));
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'private_listings_bridge_listing_status_check'
    ) then
      alter table public.private_listings
        add constraint private_listings_bridge_listing_status_check
        check (bridge_listing_status in ('not_published', 'draft', 'published', 'paused', 'removed'));
    end if;
  end if;
end $$;
commit;
