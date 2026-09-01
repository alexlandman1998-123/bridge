begin;

-- Phase 3: category-specific facts remain canonical commercial data. They are
-- intentionally not Property24 copies; future portal mappers read these fields.
alter table if exists public.commercial_properties
  add column if not exists crane_capacity text,
  add column if not exists water_supply text,
  add column if not exists agricultural_use text,
  add column if not exists development_rights text,
  add column if not exists subdivision_status text;

-- Marketing terms belong to a listing/vacancy, not to the physical property.
-- Persist the values that were previously available only in metadata_json.
alter table if exists public.commercial_listings
  add column if not exists operating_costs numeric,
  add column if not exists rates_and_taxes numeric,
  add column if not exists lease_term_months integer,
  add column if not exists deposit_amount numeric,
  add column if not exists utility_policy text;

commit;
