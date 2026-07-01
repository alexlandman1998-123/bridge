alter table public.leads
  add column if not exists enquired_listing_id uuid,
  add column if not exists enquired_property_title text,
  add column if not exists enquired_property_address text,
  add column if not exists enquired_property_price numeric,
  add column if not exists source_reference_id text,
  add column if not exists raw_enquiry_payload jsonb;

create index if not exists leads_enquired_listing_idx
  on public.leads (organisation_id, enquired_listing_id)
  where enquired_listing_id is not null;

create index if not exists leads_source_reference_idx
  on public.leads (organisation_id, lower(source_reference_id))
  where source_reference_id is not null;
