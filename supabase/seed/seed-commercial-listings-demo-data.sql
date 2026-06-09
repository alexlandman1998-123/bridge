begin;

with demo_org as (
  select id as organisation_id
  from public.organisations
  order by created_at nulls last
  limit 1
),
demo_scope as (
  select
    demo_org.organisation_id,
    (
      select id
      from public.organisation_branches
      where organisation_id = demo_org.organisation_id
      order by is_head_office desc nulls last, created_at nulls last
      limit 1
    ) as branch_id,
    (
      select user_id
      from public.organisation_users
      where organisation_id = demo_org.organisation_id
        and user_id is not null
        and (
          coalesce(module_context, '') in ('commercial', 'commercial_brokerage', 'commercial_agency')
          or coalesce(workspace_role, organisation_role, role, '') like 'commercial_%'
        )
      order by accepted_at nulls last, created_at nulls last
      limit 1
    ) as broker_id
  from demo_org
),
category_counts as (
  select *
  from (values
    ('office', 22),
    ('industrial', 22),
    ('retail', 16),
    ('agricultural', 12),
    ('development_land', 12),
    ('mixed_use', 12)
  ) as rows(listing_category, listing_count)
),
generated as (
  select
    demo_scope.organisation_id,
    demo_scope.branch_id,
    demo_scope.broker_id,
    category_counts.listing_category,
    item_index,
    case category_counts.listing_category
      when 'office' then format('Grade %s Office Suite %s', case when item_index % 3 = 0 then 'A' when item_index % 3 = 1 then 'P' else 'B' end, item_index)
      when 'industrial' then format('Logistics Warehouse %s', item_index)
      when 'retail' then format('Retail Shop %s', item_index)
      when 'agricultural' then format('Irrigated Farm Opportunity %s', item_index)
      when 'development_land' then format('Development Land Parcel %s', item_index)
      else format('Mixed Use Commercial Block %s', item_index)
    end as title,
    case category_counts.listing_category
      when 'office' then 'Office listing with GLA, parking, backup services, access control, and occupation metadata.'
      when 'industrial' then 'Industrial listing with warehouse, yard, power, roller door, height, and truck access metadata.'
      when 'retail' then 'Retail listing with centre, shop, foot traffic, visibility, loading, and signage metadata.'
      when 'agricultural' then 'Agricultural listing with water, arable, irrigation, storage, housing, and equipment metadata.'
      when 'development_land' then 'Development land listing with zoning, rights, services, subdivision, and municipality metadata.'
      else 'Mixed use listing with commercial component and development metadata.'
    end as description,
    case category_counts.listing_category
      when 'office' then 145 + (item_index * 8)
      when 'industrial' then 72 + (item_index * 4)
      when 'retail' then 210 + (item_index * 7)
      when 'agricultural' then 2800000 + (item_index * 175000)
      when 'development_land' then 1500000 + (item_index * 225000)
      else 950000 + (item_index * 125000)
    end::numeric as pricing,
    case
      when item_index % 7 = 0 then 'coming_soon'
      when item_index % 6 = 0 then 'under_offer'
      else 'active'
    end as listing_status,
    (current_date + ((item_index % 9) * 14))::date as available_from,
    item_index % 5 = 0 as featured
  from demo_scope
  cross join category_counts
  cross join lateral generate_series(1, category_counts.listing_count) as series(item_index)
)
insert into public.commercial_listings (
  organisation_id,
  branch_id,
  broker_id,
  listing_type,
  listing_category,
  listing_status,
  status,
  title,
  description,
  pricing,
  pricing_notes,
  featured,
  available_from,
  metadata_json,
  marketing_json,
  media_json,
  performance_json
)
select
  organisation_id,
  branch_id,
  broker_id,
  case when listing_category in ('agricultural', 'development_land', 'mixed_use') then 'sale' else 'lease' end,
  listing_category,
  listing_status,
  'active',
  title,
  description,
  pricing,
  case when listing_category in ('office', 'industrial', 'retail') then 'Rate shown per m2 unless stated otherwise.' else 'Guide price captured for portal demo data.' end,
  featured,
  available_from,
  case listing_category
    when 'office' then jsonb_build_object(
      'office_grade', case when item_index % 3 = 0 then 'A' when item_index % 3 = 1 then 'P' else 'B' end,
      'gla', 180 + (item_index * 35),
      'parking_bays', 8 + item_index,
      'open_parking', 4 + item_index,
      'basement_parking', 3 + (item_index % 12),
      'backup_generator', item_index % 2 = 0,
      'backup_water', item_index % 4 = 0,
      'fibre', true,
      'occupation_date', available_from,
      'rental', pricing,
      'operating_costs', 28 + (item_index % 9),
      'municipal_costs', 18 + (item_index % 7),
      'security', '24 hour guarding',
      'access_control', 'Boom and biometric access'
    )
    when 'industrial' then jsonb_build_object(
      'warehouse_size', 1200 + (item_index * 180),
      'yard_size', 450 + (item_index * 65),
      'power_supply', '250kVA expandable',
      'three_phase_power', true,
      'amperage', 160 + (item_index * 10),
      'roller_doors', 2 + (item_index % 4),
      'dock_levellers', item_index % 3,
      'height_to_eaves', 7 + (item_index % 5),
      'truck_access', true,
      'superlink_access', item_index % 2 = 0,
      'sprinklers', item_index % 3 = 0,
      'cranes', case when item_index % 5 = 0 then '5 ton gantry crane' else null end,
      'security', 'Access controlled industrial park',
      'loading_areas', 'Dedicated loading apron'
    )
    when 'retail' then jsonb_build_object(
      'centre_name', format('Neighbourhood Centre %s', item_index),
      'shop_number', format('Shop %s', 100 + item_index),
      'gla', 65 + (item_index * 18),
      'anchor_tenants', 'Grocery, pharmacy, banking',
      'foot_traffic', case when item_index % 3 = 0 then 'High' else 'Medium' end,
      'parking_availability', 'Open customer parking',
      'loading_access', 'Rear loading access',
      'visibility_rating', case when item_index % 2 = 0 then 'Prime frontage' else 'Internal mall' end,
      'trading_hours', 'Centre trading hours',
      'signage_opportunities', 'Facade and pylon signage'
    )
    when 'agricultural' then jsonb_build_object(
      'farm_size', 90 + (item_index * 18),
      'arable_hectares', 45 + (item_index * 6),
      'irrigated_hectares', 18 + (item_index * 3),
      'water_rights', 'Registered abstraction rights',
      'boreholes', 1 + (item_index % 4),
      'dams', item_index % 3,
      'pivot_systems', case when item_index % 2 = 0 then 'Two centre pivots' else 'Moveable irrigation' end,
      'livestock_capacity', 80 + (item_index * 12),
      'staff_housing', true,
      'main_house', item_index % 2 = 0,
      'pack_house', item_index % 3 = 0,
      'cold_storage', item_index % 4 = 0,
      'silos', item_index % 5 = 0,
      'equipment_included', case when item_index % 2 = 0 then 'Selected implements included' else 'Negotiable' end
    )
    when 'development_land' then jsonb_build_object(
      'land_size', 6500 + (item_index * 850),
      'zoning', case when item_index % 2 = 0 then 'Business 3' else 'Industrial 1' end,
      'bulk_rights', format('%s m2 bulk', 2800 + (item_index * 340)),
      'coverage', '60%',
      'far', '1.2',
      'services_installed', case when item_index % 3 = 0 then 'Bulk services available' else 'Services to boundary' end,
      'subdivision_potential', item_index % 2 = 0,
      'environmental_status', 'No known fatal flaws',
      'municipality', 'Local municipality'
    )
    else jsonb_build_object(
      'gla', 1200 + (item_index * 110),
      'land_size', 2400 + (item_index * 220),
      'zoning', 'Mixed use',
      'retail_component', 'Ground floor retail',
      'office_component', 'Upper floor office',
      'industrial_component', case when item_index % 2 = 0 then 'Light industrial rear component' else null end,
      'parking_bays', 20 + item_index,
      'services_installed', 'Municipal services connected'
    )
  end,
  jsonb_build_object('status', case when listing_status = 'active' then 'live' else 'draft' end),
  jsonb_build_object('photos', jsonb_build_array(), 'videos', jsonb_build_array(), 'brochure', null),
  jsonb_build_object(
    'views', 25 + (item_index * 8),
    'enquiries', item_index % 11,
    'requirements_matched', item_index % 7,
    'deals_created', item_index % 4,
    'conversion_rate', round(((item_index % 5)::numeric / 10) * 100, 1)
  )
from generated
where not exists (
  select 1
  from public.commercial_listings existing
  where existing.organisation_id = generated.organisation_id
    and existing.title = generated.title
    and existing.listing_category = generated.listing_category
);

commit;
