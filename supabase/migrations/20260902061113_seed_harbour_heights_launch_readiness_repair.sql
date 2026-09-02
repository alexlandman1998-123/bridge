-- Repair the three organisation-scoped Harbour Heights demo records so the
-- development workspace reflects the seeded units, listings, leads and deals.
-- This is intentionally constrained to the DEMO-* Harbour Heights records.

alter table public.private_listings
  add column if not exists development_id uuid references public.developments(id) on delete set null;

create index if not exists private_listings_development_id_idx
  on public.private_listings (development_id)
  where development_id is not null;

with targets as (
  select id, organisation_id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
), profile_seed as (
  select
    id as development_id,
    jsonb_build_array('https://app.arch9.co.za/demo-listing-images/revo-sales-cover.png') as image_links,
    jsonb_build_object(
      'mediaLibrary', jsonb_build_object(
        'heroImageUrl', 'https://app.arch9.co.za/demo-listing-images/revo-sales-cover.png',
        'sitePlanUrl', 'https://app.arch9.co.za/demo-listing-images/revo-sales-cover.png'
      ),
      'listingConfiguration', jsonb_build_object('publicVisibility', true)
    ) as marketing_content
  from targets
)
insert into public.development_profiles (development_id, status, image_links, marketing_content)
select development_id, 'Active', image_links, marketing_content
from profile_seed
on conflict (development_id) do update
set
  image_links = case
    when coalesce(public.development_profiles.image_links, '[]'::jsonb) = '[]'::jsonb
      then excluded.image_links
    else public.development_profiles.image_links
  end,
  marketing_content = coalesce(public.development_profiles.marketing_content, '{}'::jsonb) || excluded.marketing_content,
  updated_at = now();

with targets as (
  select id, organisation_id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
)
insert into public.units (
  id, development_id, unit_number, unit_label, phase, block, unit_type,
  bedrooms, bathrooms, parking_count, size_sqm, list_price, current_price,
  price, status, vat_applicable, notes
)
select
  gen_random_uuid(),
  target.id,
  format('A-%s', lpad(series.unit_no::text, 2, '0')),
  format('A-%s', lpad(series.unit_no::text, 2, '0')),
  'Phase 1',
  case when series.unit_no <= 12 then 'Block A' else 'Block B' end,
  case when series.unit_no % 3 = 0 then 'Three Bedroom' when series.unit_no % 2 = 0 then 'Two Bedroom' else 'One Bedroom' end,
  case when series.unit_no % 3 = 0 then 3 when series.unit_no % 2 = 0 then 2 else 1 end,
  case when series.unit_no % 3 = 0 then 2 else 1 end,
  1,
  case when series.unit_no % 3 = 0 then 112 when series.unit_no % 2 = 0 then 82 else 56 end,
  case when series.unit_no % 3 = 0 then 3450000 when series.unit_no % 2 = 0 then 2450000 else 1650000 end,
  case when series.unit_no % 3 = 0 then 3450000 when series.unit_no % 2 = 0 then 2450000 else 1650000 end,
  case when series.unit_no % 3 = 0 then 3450000 when series.unit_no % 2 = 0 then 2450000 else 1650000 end,
  case when series.unit_no in (3, 8, 17) then 'Reserved' when series.unit_no in (5, 14) then 'Sold' else 'Available' end,
  true,
  'Harbour Heights launch-ready demonstration inventory.'
from targets target
cross join generate_series(1, 24) as series(unit_no)
on conflict (development_id, unit_number) do update
set
  unit_label = excluded.unit_label,
  phase = excluded.phase,
  block = excluded.block,
  unit_type = excluded.unit_type,
  bedrooms = excluded.bedrooms,
  bathrooms = excluded.bathrooms,
  parking_count = excluded.parking_count,
  size_sqm = excluded.size_sqm,
  list_price = excluded.list_price,
  current_price = excluded.current_price,
  price = excluded.price,
  status = excluded.status,
  vat_applicable = excluded.vat_applicable,
  notes = excluded.notes;

with targets as (
  select id, organisation_id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
)
update public.private_listings listing
set development_id = target.id
from targets target
where listing.organisation_id = target.organisation_id
  and listing.is_demo_data = true
  and listing.development_id is null;

with targets as (
  select id, organisation_id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
)
update public.transactions transaction
set development_id = target.id
from targets target
where transaction.organisation_id = target.organisation_id
  and transaction.development_id is null;

with targets as (
  select id, organisation_id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
)
update public.developer_leads lead
set primary_development_id = target.id
from targets target
where lead.developer_org_id = target.organisation_id
  and lead.primary_development_id is null;

with targets as (
  select id, organisation_id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
)
insert into public.developer_lead_development_interests (
  developer_lead_interest_id, developer_lead_id, developer_org_id,
  development_id, interest_rank, interest_status, is_primary
)
select gen_random_uuid(), lead.developer_lead_id, lead.developer_org_id,
  target.id, 1, 'interested', true
from public.developer_leads lead
join targets target on target.organisation_id = lead.developer_org_id
where not exists (
  select 1
  from public.developer_lead_development_interests interest
  where interest.developer_lead_id = lead.developer_lead_id
    and interest.development_id = target.id
    and interest.unit_id is null
);
