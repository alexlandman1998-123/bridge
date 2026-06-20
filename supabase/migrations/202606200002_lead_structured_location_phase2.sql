begin;

alter table if exists public.leads
  add column if not exists formatted_address text,
  add column if not exists street_address text,
  add column if not exists suburb text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists country text default 'South Africa',
  add column if not exists postal_code text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists google_place_id text;

create index if not exists leads_google_place_id_idx
  on public.leads (google_place_id)
  where google_place_id is not null;

create index if not exists leads_location_lookup_idx
  on public.leads (
    organisation_id,
    lower(btrim(coalesce(suburb, ''))),
    lower(btrim(coalesce(city, ''))),
    lower(btrim(coalesce(province, '')))
  );

commit;
