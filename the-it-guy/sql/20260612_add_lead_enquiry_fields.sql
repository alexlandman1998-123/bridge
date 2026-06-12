alter table if exists public.leads
  add column if not exists enquired_listing_id text;

alter table if exists public.leads
  add column if not exists enquired_property_title text;

alter table if exists public.leads
  add column if not exists enquired_property_address text;

alter table if exists public.leads
  add column if not exists enquired_property_price numeric(14, 2);

alter table if exists public.leads
  add column if not exists source_reference_id text;

alter table if exists public.leads
  add column if not exists raw_enquiry_payload jsonb;

create index if not exists leads_org_enquired_listing_id_idx
  on public.leads (organisation_id, enquired_listing_id);
