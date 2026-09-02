-- Only show Harbour Heights markers that can be placed on a building footprint.
-- The remaining inventory remains accessible in the adjacent availability list.
with target_developments as (
  select id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
), mapped_units as (
  select
    unit.id,
    unit.development_id,
    nullif(regexp_replace(coalesce(unit.unit_number, ''), '[^0-9]', '', 'g'), '')::integer as unit_position
  from public.units as unit
  join target_developments as development on development.id = unit.development_id
), site_plan_maps as (
  select
    development_id,
    jsonb_object_agg(
      id::text,
      jsonb_build_object(
        'x', case unit_position
          when 1 then 28 when 2 then 34 when 3 then 40 when 4 then 46 when 5 then 52
          when 7 then 31 when 8 then 38 when 9 then 45 when 10 then 52
          when 13 then 29 when 14 then 35 when 15 then 41
          when 17 then 76 when 18 then 87
        end,
        'y', case
          when unit_position between 1 and 5 then 29
          when unit_position between 7 and 10 then 36
          when unit_position between 13 and 15 then 64
          when unit_position between 17 and 18 then 64
        end
      )
    ) as site_plan_map
  from mapped_units
  where unit_position in (1, 2, 3, 4, 5, 7, 8, 9, 10, 13, 14, 15, 17, 18)
  group by development_id
)
update public.development_profiles as profile
set marketing_content = jsonb_set(
  coalesce(profile.marketing_content, '{}'::jsonb),
  '{mediaLibrary,sitePlanMap}',
  maps.site_plan_map,
  true
)
from site_plan_maps as maps
where profile.development_id = maps.development_id;
