-- Upgrade Harbour Heights from the generic vector placeholder to the
-- illustrated masterplan and place each unit marker on its building footprint.
with target_developments as (
  select id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
), ordered_units as (
  select
    unit.id,
    unit.development_id,
    row_number() over (partition by unit.development_id order by unit.unit_number)::integer as position
  from public.units as unit
  join target_developments as development on development.id = unit.development_id
), site_plan_maps as (
  select
    development_id,
    jsonb_object_agg(
      id::text,
      jsonb_build_object(
        'x', case
          when position <= 8 then 28 + ((position - 1) % 4) * 7
          when position <= 16 then 27 + ((position - 9) % 4) * 8
          else 64 + ((position - 17) % 4) * 7
        end,
        'y', case
          when position <= 8 then 24 + ((position - 1) / 4) * 10
          when position <= 16 then 60 + ((position - 9) / 4) * 10
          else 60 + ((position - 17) / 4) * 10
        end
      )
    ) as site_plan_map
  from ordered_units
  group by development_id
)
update public.development_profiles as profile
set marketing_content = jsonb_set(
  jsonb_set(
    coalesce(profile.marketing_content, '{}'::jsonb),
    '{mediaLibrary}',
    coalesce(profile.marketing_content -> 'mediaLibrary', '{}'::jsonb)
      || jsonb_build_object(
        'sitePlanUrl', 'https://app.arch9.co.za/demo-listing-images/harbour-heights-site-plan-v2.png',
        'masterplanUrl', 'https://app.arch9.co.za/demo-listing-images/harbour-heights-site-plan-v2.png'
      ),
    true
  ),
  '{mediaLibrary,sitePlanMap}',
  maps.site_plan_map,
  true
)
from site_plan_maps as maps
where profile.development_id = maps.development_id;
