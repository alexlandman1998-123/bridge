-- Public LWP inventory import: six listings shown on Aspen Sanders' LWP profile.
-- Source pages and image URLs are public LWP assets captured on 2026-09-20.
-- The transaction makes the import atomic; source references are retained for audit.
begin;

with source_listings (source_id, title, property_type, suburb, asking_price, bedrooms, floor_size, description, source_url, image_url) as (
  values
    ('964964', '8 Bedroom House For Sale in Saddlebrook Estate', 'House', 'Saddlebrook Estate', 40000000::numeric, 8, 1500::numeric, 'Opulent mansion in Saddlebrook Country Estate.', 'https://www.lwp.co.za/results/residential/for-sale/midrand/saddlebrook-estate/house/964964/', 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/219/residential/2023/6/219_1465d478460b400b9c9e087b68106445_t_c_w_304_h_171.avif'),
    ('968010', '5 Bedroom Equestrian Property For Sale in Saddlebrook Estate', 'Equestrian Property', 'Saddlebrook Estate', 29999000::numeric, 5, 800::numeric, 'A true masterpiece in Saddlebrook Estate.', 'https://www.lwp.co.za/results/residential/for-sale/midrand/saddlebrook-estate/equestrian-property/968010/', 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/219/residential/2024/4/219_afae9c248658438898818aa77afb12b7_t_c_w_304_h_171.avif'),
    ('966068', '4 Bedroom House For Sale in Blue Hills Equestrian Estate', 'House', 'Blue Hills Equestrian Estate', 24900000::numeric, 4, 1100::numeric, 'A place of peace and tranquillity in Blue Hills Equestrian Estate.', 'https://www.lwp.co.za/results/residential/for-sale/midrand/blue-hills-equestrian-estate/house/966068/', 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/219/residential/2023/6/219_6b1e6190a6b64d95af40272b4b365491_t_c_w_304_h_171.avif'),
    ('3106685', '12 Bedroom House For Sale in Saddlebrook Estate', 'House', 'Saddlebrook Estate', 20000000::numeric, 12, 4000::numeric, 'An expansive estate home in Saddlebrook Estate.', 'https://www.lwp.co.za/results/residential/for-sale/midrand/saddlebrook-estate/house/3106685/', 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/219/residential/2026/3/219_933d6ad195064681901d5cc82b9430c9_t_c_w_304_h_171.avif'),
    ('2250218', '5 Bedroom House For Sale in Blue Hills Equestrian Estate', 'House', 'Blue Hills Equestrian Estate', 18900000::numeric, 5, 840::numeric, 'A spacious five-bedroom home in Blue Hills Equestrian Estate.', 'https://www.lwp.co.za/results/residential/for-sale/midrand/blue-hills-equestrian-estate/house/2250218/', 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/219/residential/2025/1/219_3c78f2736707456d8c366fc8f395a505_t_c_w_304_h_171.avif'),
    ('2203095', '5 Bedroom House For Sale in Blue Hills Equestrian Estate', 'House', 'Blue Hills Equestrian Estate', 17950000::numeric, 5, null::numeric, 'A five-bedroom home in Blue Hills Equestrian Estate.', 'https://www.lwp.co.za/results/residential/for-sale/midrand/blue-hills-equestrian-estate/house/2203095/', 'https://d21tw07c6rnmp0.cloudfront.net/media/uploads/219/residential/2025/1/219_c4adbc72555c410f9677cd3b06241cbf_t_c_w_304_h_171.avif')
), upserted as (
  insert into public.private_listings (
    organisation_id, listing_reference, arch9_reference, listing_status, listing_visibility,
    property_type, listing_category, title, description, asking_price, suburb, city, province,
    is_active, listing_source, stock_source, is_demo_data, bedrooms, floor_size_sqm,
    bridge_listing_public_url, internal_listing_notes
  )
  select
    '7d7c9fc1-c38b-4f83-a508-c659975f985f'::uuid,
    'LWP-ASPEN-' || source_id,
    'A9-LWP-' || source_id,
    'active', 'active_market', property_type, 'residential', title, description, asking_price,
    suburb, 'Midrand', 'Gauteng', true, 'lwp_public_agent_directory_import', 'lwp_public_site', false,
    bedrooms, floor_size::integer, source_url,
    'Imported from Aspen Sanders'' public LWP listing directory on 2026-09-20.'
  from source_listings
  returning id, listing_reference
), publication as (
  insert into public.listing_publication_data (
    listing_id, title, suburb, province, property_type, listing_type, asking_price, bedrooms,
    floor_size, description, features, amenities, status
  )
  select listing.id, source.title, source.suburb, 'Gauteng', source.property_type, 'Sale', source.asking_price,
    source.bedrooms, source.floor_size, source.description,
    jsonb_build_array('Presented by Aspen Sanders', 'LWP Properties', 'Midrand'),
    jsonb_build_array('Saddlebrook and Blue Hills specialist'), 'Published'
  from upserted listing
  join source_listings source on source.source_id = replace(listing.listing_reference, 'LWP-ASPEN-', '')
  on conflict (listing_id) do update set
    title = excluded.title, suburb = excluded.suburb, province = excluded.province,
    property_type = excluded.property_type, listing_type = excluded.listing_type,
    asking_price = excluded.asking_price, bedrooms = excluded.bedrooms, floor_size = excluded.floor_size,
    description = excluded.description, features = excluded.features, amenities = excluded.amenities,
    status = 'Published', updated_at = now()
  returning listing_id
), media as (
  insert into public.listing_media (listing_id, media_type, file_url, caption, sort_order, is_cover)
  select listing.id, 'image', source.image_url, source.title, 0, true
  from upserted listing
  join source_listings source on source.source_id = replace(listing.listing_reference, 'LWP-ASPEN-', '')
  where not exists (
    select 1 from public.listing_media existing
    where existing.listing_id = listing.id and existing.file_url = source.image_url
  )
  returning listing_id
)
insert into public.website_listing_publications (
  website_site_id, listing_id, status, publication_json, media_json,
  published_at, last_synced_at
)
select
  '357961db-9af1-4c9c-aedd-812b829d2a4f'::uuid,
  listing.id,
  'published',
  jsonb_build_object(
    'listing_id', listing.id, 'title', source.title, 'suburb', source.suburb, 'province', 'Gauteng',
    'property_type', source.property_type, 'listing_type', 'Sale', 'asking_price', source.asking_price,
    'bedrooms', source.bedrooms, 'floor_size', source.floor_size, 'description', source.description,
    'features', jsonb_build_array('Presented by Aspen Sanders', 'LWP Properties', 'Midrand'),
    'amenities', jsonb_build_array('Saddlebrook and Blue Hills specialist'),
    'consultant_name', agent.full_name, 'consultant_phone', agent.phone_number,
    'consultant_avatar_url', agent.avatar_url
  ),
  jsonb_build_array(jsonb_build_object('media_type', 'image', 'file_url', source.image_url, 'caption', source.title, 'sort_order', 0)),
  now(), now()
from upserted listing
join source_listings source on source.source_id = replace(listing.listing_reference, 'LWP-ASPEN-', '')
join public.agency_public_agents agent on agent.id = 'de83a5a3-46e9-44e0-974b-7e302a83eacb'::uuid
on conflict (listing_id) do update set
  website_site_id = excluded.website_site_id, status = 'published', publication_json = excluded.publication_json,
  media_json = excluded.media_json, unpublished_at = null, last_synced_at = now(), updated_at = now();

insert into public.listing_external_links (listing_id, platform, url, status, published_at, last_checked_at, notes)
select listing.id, 'LWP', listing.bridge_listing_public_url, 'Live', current_date, current_date,
  'Public source listing for Aspen Sanders import.'
from public.private_listings listing
where listing.organisation_id = '7d7c9fc1-c38b-4f83-a508-c659975f985f'::uuid
  and listing.listing_reference like 'LWP-ASPEN-%'
  and not exists (
    select 1 from public.listing_external_links link where link.listing_id = listing.id and link.url = listing.bridge_listing_public_url
  );

commit;
