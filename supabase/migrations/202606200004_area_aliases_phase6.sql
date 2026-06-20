begin;

alter table public.areas
  add column if not exists canonical_area_id uuid references public.areas(id) on delete set null;

create index if not exists areas_canonical_area_id_idx
  on public.areas (canonical_area_id)
  where canonical_area_id is not null;

create table if not exists public.area_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_area_id uuid not null references public.areas(id) on delete cascade,
  alias_name text not null,
  alias_city text,
  alias_province text,
  country text not null default 'South Africa',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint area_aliases_alias_name_not_blank check (length(btrim(alias_name)) > 0)
);

create unique index if not exists area_aliases_unique_normalized_idx
  on public.area_aliases (
    lower(btrim(alias_name)),
    lower(btrim(coalesce(alias_city, ''))),
    lower(btrim(coalesce(alias_province, '')))
  );

create index if not exists area_aliases_canonical_area_id_idx
  on public.area_aliases (canonical_area_id);

drop trigger if exists trg_arch9_touch_area_aliases_updated_at on public.area_aliases;
create trigger trg_arch9_touch_area_aliases_updated_at
before update on public.area_aliases
for each row
execute function public.arch9_touch_areas_updated_at();

alter table public.area_aliases enable row level security;

drop policy if exists area_aliases_public_select on public.area_aliases;
create policy area_aliases_public_select on public.area_aliases
for select
using (true);

drop policy if exists area_aliases_authenticated_insert on public.area_aliases;
create policy area_aliases_authenticated_insert on public.area_aliases
for insert to authenticated
with check (true);

drop policy if exists area_aliases_authenticated_update on public.area_aliases;
create policy area_aliases_authenticated_update on public.area_aliases
for update to authenticated
using (true)
with check (true);

grant select on public.area_aliases to anon, authenticated;
grant insert, update on public.area_aliases to authenticated;

create or replace function public.arch9_find_area_alias(
  p_name text,
  p_city text default null,
  p_province text default null
)
returns public.area_aliases
language plpgsql
stable
set search_path = public
as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_province text := nullif(btrim(coalesce(p_province, '')), '');
  v_alias public.area_aliases;
begin
  if v_name is null then
    return null;
  end if;

  select *
    into v_alias
  from public.area_aliases
  where lower(btrim(alias_name)) = lower(v_name)
    and lower(btrim(coalesce(alias_city, ''))) = lower(coalesce(v_city, ''))
    and lower(btrim(coalesce(alias_province, ''))) = lower(coalesce(v_province, ''))
  limit 1;

  if found then
    return v_alias;
  end if;

  select *
    into v_alias
  from public.area_aliases
  where lower(btrim(alias_name)) = lower(v_name)
  order by
    case
      when v_city is not null and lower(btrim(coalesce(alias_city, ''))) = lower(v_city) then 0
      when v_province is not null and lower(btrim(coalesce(alias_province, ''))) = lower(v_province) then 1
      else 2
    end,
    updated_at desc
  limit 1;

  return v_alias;
end;
$$;

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
  v_alias public.area_aliases;
begin
  if v_name is null then
    return null;
  end if;

  v_alias := public.arch9_find_area_alias(v_name, v_city, v_province);
  if v_alias.id is not null then
    select *
      into v_area
    from public.areas
    where id = v_alias.canonical_area_id
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
  end if;

  select *
    into v_area
  from public.areas
  where canonical_area_id is null
    and lower(btrim(name)) = lower(v_name)
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

create or replace function public.arch9_alias_area(
  p_alias_name text,
  p_alias_city text,
  p_alias_province text,
  p_canonical_name text,
  p_canonical_city text default null,
  p_canonical_province text default null,
  p_country text default 'South Africa',
  p_source text default 'manual'
)
returns public.areas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alias_name text := nullif(btrim(p_alias_name), '');
  v_alias_city text := nullif(btrim(coalesce(p_alias_city, '')), '');
  v_alias_province text := nullif(btrim(coalesce(p_alias_province, '')), '');
  v_source text := coalesce(nullif(btrim(p_source), ''), 'manual');
  v_canonical public.areas;
  v_dirty public.areas;
  v_dirty_was_active boolean := false;
begin
  if v_alias_name is null then
    return null;
  end if;

  v_canonical := public.arch9_upsert_area(
    p_canonical_name,
    p_canonical_city,
    p_canonical_province,
    p_country,
    null,
    null,
    null,
    false
  );

  select *
    into v_dirty
  from public.areas
  where lower(btrim(name)) = lower(v_alias_name)
    and lower(btrim(coalesce(city, ''))) = lower(coalesce(v_alias_city, ''))
    and lower(btrim(coalesce(province, ''))) = lower(coalesce(v_alias_province, ''))
    and id <> v_canonical.id
  limit 1;

  v_dirty_was_active := found and v_dirty.canonical_area_id is null;

  insert into public.area_aliases (
    canonical_area_id,
    alias_name,
    alias_city,
    alias_province,
    country,
    source
  )
  values (
    v_canonical.id,
    v_alias_name,
    v_alias_city,
    v_alias_province,
    coalesce(nullif(btrim(p_country), ''), 'South Africa'),
    v_source
  )
  on conflict (
    lower(btrim(alias_name)),
    lower(btrim(coalesce(alias_city, ''))),
    lower(btrim(coalesce(alias_province, '')))
  )
  do update
    set canonical_area_id = excluded.canonical_area_id,
        country = excluded.country,
        source = excluded.source,
        updated_at = now();

  if v_dirty.id is not null then
    if v_dirty_was_active and coalesce(v_dirty.listing_count, 0) > 0 then
      update public.areas
        set listing_count = public.areas.listing_count + coalesce(v_dirty.listing_count, 0),
            updated_at = now()
      where id = v_canonical.id
      returning * into v_canonical;
    end if;

    update public.areas
      set canonical_area_id = v_canonical.id,
          listing_count = 0,
          updated_at = now()
    where id = v_dirty.id;
  end if;

  return v_canonical;
end;
$$;

create or replace function public.arch9_search_areas(
  p_query text,
  p_limit integer default 8
)
returns table (
  id uuid,
  name text,
  city text,
  province text,
  country text,
  google_place_id text,
  latitude numeric,
  longitude numeric,
  listing_count integer,
  match_source text
)
language sql
stable
set search_path = public
as $$
  with normalized as (
    select nullif(btrim(p_query), '') as query_text,
           greatest(1, least(coalesce(p_limit, 8), 25)) as result_limit
  ),
  area_matches as (
    select
      a.id,
      a.name,
      a.city,
      a.province,
      a.country,
      a.google_place_id,
      a.latitude,
      a.longitude,
      a.listing_count,
      'area'::text as match_source,
      0 as rank_order
    from public.areas a
    cross join normalized n
    where n.query_text is not null
      and a.canonical_area_id is null
      and (
        a.name ilike '%' || n.query_text || '%'
        or a.city ilike '%' || n.query_text || '%'
        or a.province ilike '%' || n.query_text || '%'
      )
  ),
  alias_matches as (
    select
      a.id,
      a.name,
      a.city,
      a.province,
      a.country,
      a.google_place_id,
      a.latitude,
      a.longitude,
      a.listing_count,
      'alias'::text as match_source,
      1 as rank_order
    from public.area_aliases alias
    join public.areas a on a.id = alias.canonical_area_id
    cross join normalized n
    where n.query_text is not null
      and (
        alias.alias_name ilike '%' || n.query_text || '%'
        or alias.alias_city ilike '%' || n.query_text || '%'
        or alias.alias_province ilike '%' || n.query_text || '%'
      )
  ),
  deduped as (
    select distinct on (id)
      id,
      name,
      city,
      province,
      country,
      google_place_id,
      latitude,
      longitude,
      listing_count,
      match_source,
      rank_order
    from (
      select * from area_matches
      union all
      select * from alias_matches
    ) matches
    order by id, rank_order
  )
  select
    id,
    name,
    city,
    province,
    country,
    google_place_id,
    latitude,
    longitude,
    listing_count,
    match_source
  from deduped
  order by listing_count desc, name asc
  limit (select result_limit from normalized);
$$;

grant execute on function public.arch9_find_area_alias(text, text, text) to anon, authenticated;
grant execute on function public.arch9_alias_area(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.arch9_search_areas(text, integer) to anon, authenticated;

select public.arch9_alias_area('Garsfontiein', 'Pretoria', 'Gauteng', 'Garsfontein', 'Pretoria', 'Gauteng', 'South Africa', 'phase6_seed');
select public.arch9_alias_area('Garsfontien', null, null, 'Garsfontein', 'Pretoria', 'Gauteng', 'South Africa', 'phase6_seed');
select public.arch9_alias_area('Olympus', 'Pretoria', 'Gautenf', 'Olympus', 'Pretoria', 'Gauteng', 'South Africa', 'phase6_seed');
select public.arch9_alias_area('Bartlet', null, null, 'Bartlett', null, null, 'South Africa', 'phase6_seed');

commit;
