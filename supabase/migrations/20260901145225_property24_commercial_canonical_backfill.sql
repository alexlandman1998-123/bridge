begin;

-- Phase 6: move legacy wizard values into the Phase 3 canonical columns.
-- This is deliberately conservative: an existing canonical value always wins,
-- and only a listing's most recently updated metadata may fill its property.
with legacy_listing_terms as (
  select
    l.id,
    l.metadata_json,
    nullif(l.metadata_json #>> '{lease_terms,operating_costs}', '') as operating_costs_text,
    coalesce(
      nullif(l.metadata_json #>> '{lease_terms,rates_and_taxes}', ''),
      nullif(l.metadata_json #>> '{sale_terms,rates_and_taxes}', '')
    ) as rates_and_taxes_text,
    nullif(l.metadata_json #>> '{lease_terms,lease_term}', '') as lease_term_text,
    nullif(l.metadata_json #>> '{lease_terms,deposit_amount}', '') as deposit_amount_text,
    nullif(l.metadata_json #>> '{lease_terms,utility_policy}', '') as utility_policy_text
  from public.commercial_listings l
  where jsonb_typeof(l.metadata_json) = 'object'
)
update public.commercial_listings l
set
  operating_costs = coalesce(l.operating_costs, case when t.operating_costs_text ~ '^[0-9]+(\\.[0-9]+)?$' then t.operating_costs_text::numeric end),
  rates_and_taxes = coalesce(l.rates_and_taxes, case when t.rates_and_taxes_text ~ '^[0-9]+(\\.[0-9]+)?$' then t.rates_and_taxes_text::numeric end),
  lease_term_months = coalesce(l.lease_term_months, case when t.lease_term_text ~ '^[0-9]+$' then t.lease_term_text::integer end),
  deposit_amount = coalesce(l.deposit_amount, case when t.deposit_amount_text ~ '^[0-9]+(\\.[0-9]+)?$' then t.deposit_amount_text::numeric end),
  utility_policy = coalesce(nullif(btrim(l.utility_policy), ''), nullif(btrim(t.utility_policy_text), ''))
from legacy_listing_terms t
where l.id = t.id
  and (
    (l.operating_costs is null and t.operating_costs_text ~ '^[0-9]+(\\.[0-9]+)?$')
    or (l.rates_and_taxes is null and t.rates_and_taxes_text ~ '^[0-9]+(\\.[0-9]+)?$')
    or (l.lease_term_months is null and t.lease_term_text ~ '^[0-9]+$')
    or (l.deposit_amount is null and t.deposit_amount_text ~ '^[0-9]+(\\.[0-9]+)?$')
    or (nullif(btrim(l.utility_policy), '') is null and nullif(btrim(t.utility_policy_text), '') is not null)
  );

with ranked_listing_facts as (
  select
    l.property_id,
    l.metadata_json -> 'commercial_attributes' as attributes,
    l.metadata_json -> 'lease_terms' as lease_terms,
    l.metadata_json -> 'sale_terms' as sale_terms,
    row_number() over (partition by l.property_id order by l.updated_at desc, l.id desc) as row_rank
  from public.commercial_listings l
  where l.property_id is not null
    and jsonb_typeof(l.metadata_json) = 'object'
), latest_listing_facts as (
  select * from ranked_listing_facts where row_rank = 1
)
update public.commercial_properties p
set
  gla_m2 = coalesce(p.gla_m2, case when f.lease_terms ->> 'gross_lettable_area' ~ '^[0-9]+(\\.[0-9]+)?$' then (f.lease_terms ->> 'gross_lettable_area')::numeric end),
  available_space_m2 = coalesce(p.available_space_m2, case when f.lease_terms ->> 'available_area' ~ '^[0-9]+(\\.[0-9]+)?$' then (f.lease_terms ->> 'available_area')::numeric end),
  zoning = coalesce(nullif(btrim(p.zoning), ''), nullif(btrim(coalesce(f.sale_terms ->> 'zoning', f.attributes ->> 'zoning_land_use_rights')), '')),
  parking_ratio = coalesce(nullif(btrim(p.parking_ratio), ''), nullif(btrim(coalesce(f.lease_terms ->> 'parking_ratio', f.attributes ->> 'parking_ratio')), '')),
  loading_bays = coalesce(p.loading_bays, case when f.attributes ->> 'loading_bays' ~ '^[0-9]+$' then (f.attributes ->> 'loading_bays')::integer end),
  power_supply = coalesce(nullif(btrim(p.power_supply), ''), nullif(btrim(f.attributes ->> 'power_supply'), '')),
  yard_size_m2 = coalesce(p.yard_size_m2, case when f.attributes ->> 'yard_size' ~ '^[0-9]+(\\.[0-9]+)?$' then (f.attributes ->> 'yard_size')::numeric end),
  roller_doors = coalesce(p.roller_doors, case when f.attributes ->> 'roller_shutter_doors' ~ '^[0-9]+$' then (f.attributes ->> 'roller_shutter_doors')::integer end),
  -- These columns pre-date this migration with a false default. A legacy true
  -- is therefore meaningful; a legacy false does not overwrite the canonical value.
  truck_access = p.truck_access or coalesce(case when f.attributes ->> 'truck_access' = 'true' then true end, false),
  sprinklers = p.sprinklers or coalesce(case when f.attributes ->> 'sprinkler_system' = 'true' then true end, false),
  crane_capacity = coalesce(nullif(btrim(p.crane_capacity), ''), nullif(btrim(f.attributes ->> 'crane_capacity'), '')),
  farm_size_ha = coalesce(p.farm_size_ha, case when f.attributes ->> 'farm_size' ~ '^[0-9]+(\\.[0-9]+)?$' then (f.attributes ->> 'farm_size')::numeric end),
  water_rights = coalesce(nullif(btrim(p.water_rights), ''), nullif(btrim(f.attributes ->> 'water_rights'), '')),
  water_supply = coalesce(nullif(btrim(p.water_supply), ''), nullif(btrim(coalesce(f.attributes ->> 'water_supply', f.attributes ->> 'boreholes')), '')),
  irrigation = coalesce(nullif(btrim(p.irrigation), ''), nullif(btrim(f.attributes ->> 'irrigation'), '')),
  agricultural_use = coalesce(nullif(btrim(p.agricultural_use), ''), nullif(btrim(f.attributes ->> 'current_agricultural_use'), '')),
  development_rights = coalesce(nullif(btrim(p.development_rights), ''), nullif(btrim(coalesce(f.attributes ->> 'development_rights', f.attributes ->> 'zoning_land_use_rights')), '')),
  subdivision_status = coalesce(nullif(btrim(p.subdivision_status), ''), nullif(btrim(f.attributes ->> 'subdivision_status'), '')),
  bulk = coalesce(nullif(btrim(p.bulk), ''), nullif(btrim(f.attributes ->> 'bulk'), '')),
  coverage = coalesce(nullif(btrim(p.coverage), ''), nullif(btrim(f.attributes ->> 'coverage'), '')),
  services_available = coalesce(nullif(btrim(p.services_available), ''), nullif(btrim(f.attributes ->> 'services_available'), '')),
  environmental_status = coalesce(nullif(btrim(p.environmental_status), ''), nullif(btrim(f.attributes ->> 'environmental_status'), '')),
  land_size_m2 = coalesce(p.land_size_m2, case when f.sale_terms ->> 'erf_size' ~ '^[0-9]+(\\.[0-9]+)?$' then (f.sale_terms ->> 'erf_size')::numeric end)
from latest_listing_facts f
where p.id = f.property_id
  and (
    (p.gla_m2 is null and f.lease_terms ->> 'gross_lettable_area' is not null)
    or (p.available_space_m2 is null and f.lease_terms ->> 'available_area' is not null)
    or (nullif(btrim(p.zoning), '') is null and coalesce(f.sale_terms ->> 'zoning', f.attributes ->> 'zoning_land_use_rights') is not null)
    or (nullif(btrim(p.parking_ratio), '') is null and coalesce(f.lease_terms ->> 'parking_ratio', f.attributes ->> 'parking_ratio') is not null)
    or (p.loading_bays is null and f.attributes ->> 'loading_bays' is not null)
    or (nullif(btrim(p.power_supply), '') is null and f.attributes ->> 'power_supply' is not null)
    or (p.yard_size_m2 is null and f.attributes ->> 'yard_size' is not null)
    or (p.roller_doors is null and f.attributes ->> 'roller_shutter_doors' is not null)
    or (p.truck_access = false and f.attributes ->> 'truck_access' = 'true')
    or (p.sprinklers = false and f.attributes ->> 'sprinkler_system' = 'true')
    or (nullif(btrim(p.crane_capacity), '') is null and f.attributes ->> 'crane_capacity' is not null)
    or (p.farm_size_ha is null and f.attributes ->> 'farm_size' is not null)
    or (nullif(btrim(p.water_rights), '') is null and f.attributes ->> 'water_rights' is not null)
    or (nullif(btrim(p.water_supply), '') is null and coalesce(f.attributes ->> 'water_supply', f.attributes ->> 'boreholes') is not null)
    or (nullif(btrim(p.irrigation), '') is null and f.attributes ->> 'irrigation' is not null)
    or (nullif(btrim(p.agricultural_use), '') is null and f.attributes ->> 'current_agricultural_use' is not null)
    or (nullif(btrim(p.development_rights), '') is null and coalesce(f.attributes ->> 'development_rights', f.attributes ->> 'zoning_land_use_rights') is not null)
    or (nullif(btrim(p.subdivision_status), '') is null and f.attributes ->> 'subdivision_status' is not null)
    or (nullif(btrim(p.bulk), '') is null and f.attributes ->> 'bulk' is not null)
    or (nullif(btrim(p.coverage), '') is null and f.attributes ->> 'coverage' is not null)
    or (nullif(btrim(p.services_available), '') is null and f.attributes ->> 'services_available' is not null)
    or (nullif(btrim(p.environmental_status), '') is null and f.attributes ->> 'environmental_status' is not null)
    or (p.land_size_m2 is null and f.sale_terms ->> 'erf_size' is not null)
  );

-- Remove only legacy keys that have a confirmed canonical listing column.
-- Property facts above were migrated first, so their source metadata was still
-- available while the property backfill ran.
update public.commercial_listings l
set metadata_json = case
  when jsonb_typeof(l.metadata_json -> 'sale_terms') = 'object' then
    jsonb_set(
      case
        when jsonb_typeof(l.metadata_json -> 'lease_terms') = 'object' then
          jsonb_set(
            l.metadata_json,
            '{lease_terms}',
            (l.metadata_json -> 'lease_terms')
              - case when l.operating_costs is not null then 'operating_costs' else '' end
              - case when l.rates_and_taxes is not null then 'rates_and_taxes' else '' end
              - case when l.lease_term_months is not null then 'lease_term' else '' end
              - case when l.deposit_amount is not null then 'deposit_amount' else '' end
              - case when nullif(btrim(l.utility_policy), '') is not null then 'utility_policy' else '' end,
            true
          )
        else l.metadata_json
      end,
      '{sale_terms}',
      (l.metadata_json -> 'sale_terms') - case when l.rates_and_taxes is not null then 'rates_and_taxes' else '' end,
      true
    )
  when jsonb_typeof(l.metadata_json -> 'lease_terms') = 'object' then
    jsonb_set(
      l.metadata_json,
      '{lease_terms}',
      (l.metadata_json -> 'lease_terms')
        - case when l.operating_costs is not null then 'operating_costs' else '' end
        - case when l.rates_and_taxes is not null then 'rates_and_taxes' else '' end
        - case when l.lease_term_months is not null then 'lease_term' else '' end
        - case when l.deposit_amount is not null then 'deposit_amount' else '' end
        - case when nullif(btrim(l.utility_policy), '') is not null then 'utility_policy' else '' end,
      true
    )
  else l.metadata_json
end
where jsonb_typeof(l.metadata_json) = 'object'
  and (
    (
      jsonb_typeof(l.metadata_json -> 'lease_terms') = 'object'
      and (
        (l.operating_costs is not null and l.metadata_json #> '{lease_terms,operating_costs}' is not null)
        or (l.rates_and_taxes is not null and l.metadata_json #> '{lease_terms,rates_and_taxes}' is not null)
        or (l.lease_term_months is not null and l.metadata_json #> '{lease_terms,lease_term}' is not null)
        or (l.deposit_amount is not null and l.metadata_json #> '{lease_terms,deposit_amount}' is not null)
        or (nullif(btrim(l.utility_policy), '') is not null and l.metadata_json #> '{lease_terms,utility_policy}' is not null)
      )
    )
    or (
      jsonb_typeof(l.metadata_json -> 'sale_terms') = 'object'
      and l.rates_and_taxes is not null
      and l.metadata_json #> '{sale_terms,rates_and_taxes}' is not null
    )
  );

commit;
