begin;

alter table public.canvassing_prospects
  add column if not exists enquiry_listing_id uuid,
  add column if not exists buyer_status text,
  add column if not exists area_of_interest text,
  add column if not exists area_of_interest_place_id text,
  add column if not exists preferred_property_type text,
  add column if not exists budget_range text,
  add column if not exists bedrooms text,
  add column if not exists finance_status text,
  add column if not exists timeframe text,
  add column if not exists subject_to_sale text;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'listings'
  ) then
    alter table public.canvassing_prospects
      drop constraint if exists canvassing_prospects_enquiry_listing_id_fkey;
    alter table public.canvassing_prospects
      add constraint canvassing_prospects_enquiry_listing_id_fkey
      foreign key (enquiry_listing_id)
      references public.listings(id)
      on delete set null;
  end if;
end $$;

update public.canvassing_prospects
set
  buyer_status = coalesce(nullif(buyer_status, ''), nullif(status, '')),
  area_of_interest = coalesce(nullif(area_of_interest, ''), nullif(area, '')),
  preferred_property_type = coalesce(nullif(preferred_property_type, ''), nullif(property_type, '')),
  budget_range = coalesce(nullif(budget_range, ''), nullif(estimated_property_value, ''))
where lower(coalesce(prospect_type, '')) like '%buyer%';

create index if not exists canvassing_prospects_org_buyer_status_idx
  on public.canvassing_prospects (organisation_id, buyer_status, created_at desc)
  where buyer_status is not null;

create index if not exists canvassing_prospects_org_area_interest_idx
  on public.canvassing_prospects (organisation_id, lower(area_of_interest), created_at desc)
  where area_of_interest is not null;

create index if not exists canvassing_prospects_org_budget_range_idx
  on public.canvassing_prospects (organisation_id, budget_range, created_at desc)
  where budget_range is not null;

create index if not exists canvassing_prospects_org_finance_status_idx
  on public.canvassing_prospects (organisation_id, finance_status, created_at desc)
  where finance_status is not null;

create index if not exists canvassing_prospects_org_enquiry_listing_idx
  on public.canvassing_prospects (organisation_id, enquiry_listing_id, created_at desc)
  where enquiry_listing_id is not null;

commit;
