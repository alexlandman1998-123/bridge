begin;

create or replace function public.arch9_backfill_area_directory()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer := 0;
  v_after integer := 0;
  v_candidates integer := 0;
  v_listing_candidates integer := 0;
  v_candidate record;
begin
  select count(*) into v_before from public.areas;

  create temp table if not exists arch9_area_backfill_candidates (
    name text,
    city text,
    province text,
    country text,
    google_place_id text,
    latitude numeric,
    longitude numeric,
    increment_listing_count boolean not null default false
  ) on commit drop;

  truncate table arch9_area_backfill_candidates;

  if to_regclass('public.lead_requirements') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'lead_requirements' and column_name = 'areas'
    ) then
      execute $sql$
        insert into arch9_area_backfill_candidates (name, city, province, country)
        select
          nullif(btrim(area_name), ''),
          nullif(btrim(coalesce(city, '')), ''),
          nullif(btrim(coalesce(province, '')), ''),
          'South Africa'
        from public.lead_requirements
        cross join lateral unnest(coalesce(areas, '{}'::text[])) as area_name
        where nullif(btrim(area_name), '') is not null
      $sql$;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'lead_requirements' and column_name = 'suburbs'
    ) then
      execute $sql$
        insert into arch9_area_backfill_candidates (name, city, province, country)
        select
          nullif(btrim(suburb_name), ''),
          nullif(btrim(coalesce(city, '')), ''),
          nullif(btrim(coalesce(province, '')), ''),
          'South Africa'
        from public.lead_requirements
        cross join lateral unnest(coalesce(suburbs, '{}'::text[])) as suburb_name
        where nullif(btrim(suburb_name), '') is not null
      $sql$;
    end if;
  end if;

  if to_regclass('public.leads') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'leads' and column_name = 'area_interest'
    ) then
      execute $sql$
        insert into arch9_area_backfill_candidates (name, city, province, country)
        select
          nullif(btrim(area_name), ''),
          nullif(btrim(coalesce(city, '')), ''),
          nullif(btrim(coalesce(province, '')), ''),
          coalesce(nullif(btrim(country), ''), 'South Africa')
        from public.leads
        cross join lateral unnest(regexp_split_to_array(coalesce(area_interest, ''), '[,;\n]+')) as area_name
        where nullif(btrim(area_name), '') is not null
      $sql$;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'leads' and column_name = 'suburb'
    ) then
      execute $sql$
        insert into arch9_area_backfill_candidates (
          name,
          city,
          province,
          country,
          google_place_id,
          latitude,
          longitude
        )
        select
          nullif(btrim(suburb), ''),
          nullif(btrim(coalesce(city, '')), ''),
          nullif(btrim(coalesce(province, '')), ''),
          coalesce(nullif(btrim(country), ''), 'South Africa'),
          nullif(btrim(coalesce(google_place_id, '')), ''),
          latitude,
          longitude
        from public.leads
        where nullif(btrim(suburb), '') is not null
      $sql$;
    end if;
  end if;

  if to_regclass('public.listings') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'listings' and column_name = 'suburb'
  ) then
    execute $sql$
      insert into arch9_area_backfill_candidates (
        name,
        city,
        province,
        country,
        google_place_id,
        latitude,
        longitude,
        increment_listing_count
      )
      select
        nullif(btrim(suburb), ''),
        nullif(btrim(coalesce(city, '')), ''),
        nullif(btrim(coalesce(province, '')), ''),
        coalesce(nullif(btrim(country), ''), 'South Africa'),
        nullif(btrim(coalesce(google_place_id, '')), ''),
        latitude,
        longitude,
        true
      from public.listings
      where nullif(btrim(suburb), '') is not null
    $sql$;
  end if;

  if to_regclass('public.properties') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties' and column_name = 'suburb'
  ) then
    execute $sql$
      insert into arch9_area_backfill_candidates (
        name,
        city,
        province,
        country,
        google_place_id,
        latitude,
        longitude,
        increment_listing_count
      )
      select
        nullif(btrim(suburb), ''),
        nullif(btrim(coalesce(city, '')), ''),
        nullif(btrim(coalesce(province, '')), ''),
        coalesce(nullif(btrim(country), ''), 'South Africa'),
        nullif(btrim(coalesce(google_place_id, '')), ''),
        latitude,
        longitude,
        true
      from public.properties
      where nullif(btrim(suburb), '') is not null
    $sql$;
  end if;

  if to_regclass('public.private_listings') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'private_listings' and column_name = 'suburb'
  ) then
    execute $sql$
      insert into arch9_area_backfill_candidates (
        name,
        city,
        province,
        country,
        google_place_id,
        latitude,
        longitude,
        increment_listing_count
      )
      select
        nullif(btrim(suburb), ''),
        nullif(btrim(coalesce(city, '')), ''),
        nullif(btrim(coalesce(province, '')), ''),
        coalesce(nullif(btrim(country), ''), 'South Africa'),
        nullif(btrim(coalesce(google_place_id, '')), ''),
        latitude,
        longitude,
        true
      from public.private_listings
      where nullif(btrim(suburb), '') is not null
    $sql$;
  end if;

  if to_regclass('public.organisations') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organisations' and column_name = 'suburb'
  ) then
    execute $sql$
      insert into arch9_area_backfill_candidates (
        name,
        city,
        province,
        country,
        google_place_id,
        latitude,
        longitude
      )
      select
        nullif(btrim(suburb), ''),
        nullif(btrim(coalesce(city, '')), ''),
        nullif(btrim(coalesce(province, '')), ''),
        coalesce(nullif(btrim(country), ''), 'South Africa'),
        nullif(btrim(coalesce(google_place_id, '')), ''),
        latitude,
        longitude
      from public.organisations
      where nullif(btrim(suburb), '') is not null
    $sql$;
  end if;

  if to_regclass('public.organisation_branches') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organisation_branches' and column_name = 'suburb'
  ) then
    execute $sql$
      insert into arch9_area_backfill_candidates (
        name,
        city,
        province,
        country,
        google_place_id,
        latitude,
        longitude
      )
      select
        nullif(btrim(suburb), ''),
        nullif(btrim(coalesce(city, '')), ''),
        nullif(btrim(coalesce(province, '')), ''),
        coalesce(nullif(btrim(country), ''), 'South Africa'),
        nullif(btrim(coalesce(google_place_id, '')), ''),
        latitude,
        longitude
      from public.organisation_branches
      where nullif(btrim(suburb), '') is not null
    $sql$;
  end if;

  select count(*) into v_candidates from arch9_area_backfill_candidates;
  select count(*) into v_listing_candidates from arch9_area_backfill_candidates where increment_listing_count;

  for v_candidate in
    select
      name,
      city,
      province,
      coalesce(country, 'South Africa') as country,
      google_place_id,
      latitude,
      longitude,
      bool_or(increment_listing_count) as increment_listing_count
    from arch9_area_backfill_candidates
    where nullif(btrim(name), '') is not null
    group by
      lower(btrim(name)),
      name,
      lower(btrim(coalesce(city, ''))),
      city,
      lower(btrim(coalesce(province, ''))),
      province,
      coalesce(country, 'South Africa'),
      google_place_id,
      latitude,
      longitude
  loop
    perform public.arch9_upsert_area(
      v_candidate.name,
      v_candidate.city,
      v_candidate.province,
      v_candidate.country,
      v_candidate.google_place_id,
      v_candidate.latitude,
      v_candidate.longitude,
      false
    );
  end loop;

  with listing_counts as (
    select
      lower(btrim(name)) as normalized_name,
      lower(btrim(coalesce(city, ''))) as normalized_city,
      lower(btrim(coalesce(province, ''))) as normalized_province,
      count(*)::integer as listing_count
    from arch9_area_backfill_candidates
    where increment_listing_count
      and nullif(btrim(name), '') is not null
    group by
      lower(btrim(name)),
      lower(btrim(coalesce(city, ''))),
      lower(btrim(coalesce(province, '')))
  )
  update public.areas area
    set listing_count = greatest(area.listing_count, listing_counts.listing_count),
        updated_at = now()
  from listing_counts
  where lower(btrim(area.name)) = listing_counts.normalized_name
    and lower(btrim(coalesce(area.city, ''))) = listing_counts.normalized_city
    and lower(btrim(coalesce(area.province, ''))) = listing_counts.normalized_province;

  select count(*) into v_after from public.areas;

  return jsonb_build_object(
    'candidates_processed', v_candidates,
    'listing_candidates_processed', v_listing_candidates,
    'areas_before', v_before,
    'areas_after', v_after,
    'areas_created', greatest(v_after - v_before, 0)
  );
end;
$$;

grant execute on function public.arch9_backfill_area_directory() to authenticated;

select public.arch9_backfill_area_directory();

commit;
