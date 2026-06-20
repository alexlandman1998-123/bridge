begin;

alter table public.canvassing_prospects
  add column if not exists source text,
  add column if not exists area_suburb text,
  add column if not exists area_suburb_place_id text,
  add column if not exists street_address text,
  add column if not exists formatted_address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists country text,
  add column if not exists postal_code text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists google_place_id text,
  add column if not exists estimated_property_value text,
  add column if not exists selling_intent text,
  add column if not exists last_contact_outcome text,
  add column if not exists property_occupancy text;

alter table public.canvassing_activities
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.canvassing_prospects
set
  source = coalesce(nullif(source, ''), nullif(canvassing_method, ''), 'Cold Call'),
  area_suburb = coalesce(nullif(area_suburb, ''), nullif(area, ''))
where source is null
   or source = ''
   or area_suburb is null
   or area_suburb = '';

create index if not exists canvassing_prospects_org_source_idx
  on public.canvassing_prospects (organisation_id, source, created_at desc);

create index if not exists canvassing_prospects_org_area_suburb_idx
  on public.canvassing_prospects (organisation_id, lower(area_suburb), created_at desc)
  where area_suburb is not null;

create index if not exists canvassing_prospects_org_selling_intent_idx
  on public.canvassing_prospects (organisation_id, selling_intent, created_at desc)
  where selling_intent is not null;

create index if not exists canvassing_prospects_org_last_contact_outcome_idx
  on public.canvassing_prospects (organisation_id, last_contact_outcome, created_at desc)
  where last_contact_outcome is not null;

commit;
