begin;

create extension if not exists "pgcrypto";

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  province text,
  country text default 'South Africa',
  google_place_id text,
  latitude numeric,
  longitude numeric,
  listing_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint areas_name_not_blank check (length(btrim(name)) > 0),
  constraint areas_listing_count_nonnegative check (listing_count >= 0)
);

create unique index if not exists areas_unique_normalized_location_idx
  on public.areas (
    lower(btrim(name)),
    lower(btrim(coalesce(city, ''))),
    lower(btrim(coalesce(province, '')))
  );

create index if not exists areas_google_place_id_idx
  on public.areas (google_place_id)
  where google_place_id is not null;

create or replace function public.arch9_touch_areas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_arch9_touch_areas_updated_at on public.areas;
create trigger trg_arch9_touch_areas_updated_at
before update on public.areas
for each row
execute function public.arch9_touch_areas_updated_at();

alter table if exists public.private_listings
  add column if not exists formatted_address text,
  add column if not exists street_address text,
  add column if not exists country text default 'South Africa',
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists google_place_id text;

alter table if exists public.listings
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

alter table if exists public.properties
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

alter table if exists public.developments
  add column if not exists address text,
  add column if not exists formatted_address text,
  add column if not exists street_address text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists google_place_id text;

alter table if exists public.development_profiles
  add column if not exists formatted_address text,
  add column if not exists street_address text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists google_place_id text;

alter table if exists public.organisations
  add column if not exists address text,
  add column if not exists formatted_address text,
  add column if not exists suburb text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists country text default 'South Africa',
  add column if not exists postal_code text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists google_place_id text;

alter table if exists public.organisation_branches
  add column if not exists formatted_address text,
  add column if not exists suburb text,
  add column if not exists country text default 'South Africa',
  add column if not exists postal_code text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists google_place_id text;

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

create index if not exists private_listings_google_place_id_idx
  on public.private_listings (google_place_id)
  where google_place_id is not null;

create index if not exists developments_google_place_id_idx
  on public.developments (google_place_id)
  where google_place_id is not null;

create or replace function public.arch9_upsert_area(
  p_name text,
  p_city text default null,
  p_province text default null,
  p_country text default 'South Africa',
  p_google_place_id text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_increment_listing_count boolean default false
)
returns public.areas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_province text := nullif(btrim(coalesce(p_province, '')), '');
  v_country text := coalesce(nullif(btrim(p_country), ''), 'South Africa');
  v_area public.areas;
begin
  if v_name is null then
    return null;
  end if;

  select *
    into v_area
  from public.areas
  where lower(btrim(name)) = lower(v_name)
    and lower(btrim(coalesce(city, ''))) = lower(coalesce(v_city, ''))
    and lower(btrim(coalesce(province, ''))) = lower(coalesce(v_province, ''))
  limit 1;

  if found then
    update public.areas
      set
        country = coalesce(v_country, public.areas.country),
        google_place_id = coalesce(nullif(btrim(p_google_place_id), ''), public.areas.google_place_id),
        latitude = coalesce(p_latitude, public.areas.latitude),
        longitude = coalesce(p_longitude, public.areas.longitude),
        listing_count = case
          when p_increment_listing_count then public.areas.listing_count + 1
          else public.areas.listing_count
        end,
        updated_at = now()
    where id = v_area.id
    returning * into v_area;

    return v_area;
  end if;

  insert into public.areas (
    name,
    city,
    province,
    country,
    google_place_id,
    latitude,
    longitude,
    listing_count
  )
  values (
    v_name,
    v_city,
    v_province,
    v_country,
    nullif(btrim(p_google_place_id), ''),
    p_latitude,
    p_longitude,
    case when p_increment_listing_count then 1 else 0 end
  )
  returning * into v_area;

  return v_area;
exception
  when unique_violation then
    select *
      into v_area
    from public.areas
    where lower(btrim(name)) = lower(v_name)
      and lower(btrim(coalesce(city, ''))) = lower(coalesce(v_city, ''))
      and lower(btrim(coalesce(province, ''))) = lower(coalesce(v_province, ''))
    limit 1;

    return v_area;
end;
$$;

alter table public.areas enable row level security;

drop policy if exists areas_public_select on public.areas;
create policy areas_public_select on public.areas
for select
using (true);

drop policy if exists areas_authenticated_insert on public.areas;
create policy areas_authenticated_insert on public.areas
for insert to authenticated
with check (true);

drop policy if exists areas_authenticated_update on public.areas;
create policy areas_authenticated_update on public.areas
for update to authenticated
using (true)
with check (true);

grant select on public.areas to anon, authenticated;
grant insert, update on public.areas to authenticated;
grant execute on function public.arch9_upsert_area(text, text, text, text, text, numeric, numeric, boolean) to authenticated;

commit;
