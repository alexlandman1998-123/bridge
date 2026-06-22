-- Adds nullable Google Places / geocoding fields for Commercial location capture.
-- No backfill is performed; new and edited records populate these fields opportunistically.

do $$
declare
  commercial_table text;
begin
  foreach commercial_table in array array[
    'commercial_companies',
    'commercial_landlords',
    'commercial_tenants',
    'commercial_properties',
    'commercial_vacancies',
    'commercial_requirements',
    'commercial_deals',
    'commercial_listings'
  ]
  loop
    execute format('alter table if exists %I add column if not exists formatted_address text', commercial_table);
    execute format('alter table if exists %I add column if not exists street_number text', commercial_table);
    execute format('alter table if exists %I add column if not exists route text', commercial_table);
    execute format('alter table if exists %I add column if not exists street_name text', commercial_table);
    execute format('alter table if exists %I add column if not exists street_address text', commercial_table);
    execute format('alter table if exists %I add column if not exists suburb text', commercial_table);
    execute format('alter table if exists %I add column if not exists city text', commercial_table);
    execute format('alter table if exists %I add column if not exists province text', commercial_table);
    execute format('alter table if exists %I add column if not exists postal_code text', commercial_table);
    execute format('alter table if exists %I add column if not exists country text', commercial_table);
    execute format('alter table if exists %I add column if not exists latitude numeric', commercial_table);
    execute format('alter table if exists %I add column if not exists longitude numeric', commercial_table);
    execute format('alter table if exists %I add column if not exists place_id text', commercial_table);
    execute format('alter table if exists %I add column if not exists google_place_id text', commercial_table);
    execute format('alter table if exists %I add column if not exists address_components jsonb', commercial_table);
    execute format('alter table if exists %I add column if not exists raw_google_response jsonb', commercial_table);
    execute format('alter table if exists %I add column if not exists geocoding_status text', commercial_table);
  end loop;
end $$;
