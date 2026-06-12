begin;

alter table if exists public.commercial_properties
  add column if not exists number_of_units integer,
  add column if not exists building_grade text,
  add column if not exists backup_power boolean not null default false,
  add column if not exists generator boolean not null default false,
  add column if not exists solar boolean not null default false,
  add column if not exists fibre boolean not null default false,
  add column if not exists number_of_lifts integer,
  add column if not exists amenities text,
  add column if not exists yard_size_m2 numeric,
  add column if not exists eaves_height_m numeric,
  add column if not exists roller_doors integer,
  add column if not exists truck_access boolean not null default false,
  add column if not exists sprinklers boolean not null default false,
  add column if not exists warehouse_area_m2 numeric,
  add column if not exists office_area_m2 numeric,
  add column if not exists frontage_m numeric,
  add column if not exists anchor_tenants text,
  add column if not exists foot_traffic text,
  add column if not exists trading_hours text,
  add column if not exists mall_type text,
  add column if not exists visibility_rating text,
  add column if not exists noi numeric,
  add column if not exists cap_rate numeric,
  add column if not exists wale_months integer,
  add column if not exists gross_yield numeric,
  add column if not exists net_yield numeric,
  add column if not exists annual_income numeric,
  add column if not exists land_size_m2 numeric,
  add column if not exists bulk text,
  add column if not exists coverage text,
  add column if not exists services_available text,
  add column if not exists environmental_status text,
  add column if not exists farm_size_ha numeric,
  add column if not exists water_rights text,
  add column if not exists irrigation text,
  add column if not exists crop_type text,
  add column if not exists livestock_capacity text;

alter table if exists public.commercial_vacancies
  add column if not exists marketed_at timestamptz,
  add column if not exists occupied_at timestamptz,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table if exists public.commercial_listings
  add column if not exists internal_reviewed_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists withdrawn_at timestamptz;

update public.commercial_properties property
set branch_id = coalesce(property.branch_id, landlord.branch_id),
    team_id = coalesce(property.team_id, landlord.team_id),
    broker_id = coalesce(property.broker_id, landlord.broker_id)
from public.commercial_landlords landlord
where property.landlord_id = landlord.id
  and (
    property.branch_id is null
    or property.team_id is null
    or property.broker_id is null
  );

update public.commercial_vacancies vacancy
set landlord_id = coalesce(vacancy.landlord_id, property.landlord_id),
    branch_id = coalesce(vacancy.branch_id, property.branch_id),
    team_id = coalesce(vacancy.team_id, property.team_id),
    broker_id = coalesce(vacancy.broker_id, vacancy.broker_assignment, property.broker_id),
    broker_assignment = coalesce(vacancy.broker_assignment, vacancy.broker_id, property.broker_id)
from public.commercial_properties property
where vacancy.property_id = property.id
  and (
    vacancy.landlord_id is null
    or vacancy.branch_id is null
    or vacancy.team_id is null
    or vacancy.broker_id is null
    or vacancy.broker_assignment is null
  );

update public.commercial_listings listing
set landlord_id = coalesce(listing.landlord_id, vacancy.landlord_id, property.landlord_id),
    property_id = coalesce(listing.property_id, vacancy.property_id),
    branch_id = coalesce(listing.branch_id, vacancy.branch_id, property.branch_id),
    team_id = coalesce(listing.team_id, vacancy.team_id, property.team_id),
    broker_id = coalesce(listing.broker_id, vacancy.broker_id, vacancy.broker_assignment, property.broker_id)
from public.commercial_vacancies vacancy
left join public.commercial_properties property on property.id = coalesce(listing.property_id, vacancy.property_id)
where listing.vacancy_id = vacancy.id
  and (
    listing.landlord_id is null
    or listing.property_id is null
    or listing.branch_id is null
    or listing.team_id is null
    or listing.broker_id is null
  );

update public.commercial_listings listing
set landlord_id = coalesce(listing.landlord_id, property.landlord_id),
    branch_id = coalesce(listing.branch_id, property.branch_id),
    team_id = coalesce(listing.team_id, property.team_id),
    broker_id = coalesce(listing.broker_id, property.broker_id)
from public.commercial_properties property
where listing.property_id = property.id
  and (
    listing.landlord_id is null
    or listing.branch_id is null
    or listing.team_id is null
    or listing.broker_id is null
  );

create index if not exists commercial_properties_type_idx
  on public.commercial_properties (organisation_id, property_type, status);

create index if not exists commercial_vacancies_status_idx
  on public.commercial_vacancies (organisation_id, status, availability_date);

create index if not exists commercial_listings_status_idx
  on public.commercial_listings (organisation_id, listing_status, listing_category);

commit;
