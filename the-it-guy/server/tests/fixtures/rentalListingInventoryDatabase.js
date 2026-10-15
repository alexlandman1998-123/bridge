import { readFileSync } from 'node:fs'
import { rentalOnboardingDatabase, actor, org, property, unit } from './rentalOnboardingDatabase.js'
export { actor, org, property, unit }
export const listing = '77777777-7777-4777-8777-777777777777'
const root = new URL('../../../../supabase/migrations/', import.meta.url)

export async function rentalListingInventoryDatabase() {
  const db = await rentalOnboardingDatabase()
  await db.exec(`
    create table profiles(id uuid primary key); insert into profiles values('${actor}');
    create table organisation_branches(id uuid primary key);
    alter table rental_properties add column name text,add column property_type text default 'house',add column status text default 'active',add column address_line_1 text,add column address_line_2 text,add column suburb text,add column city text,add column province text,add column postal_code text,add column address_normalized text,add column assigned_manager_id uuid,add column created_by uuid,add column metadata_json jsonb default '{}';
    update rental_properties set assigned_manager_id='${actor}',created_by='${actor}',name='Saved home',address_line_1='12 Saved Road',city='Pretoria',address_normalized='saved';
    create unique index rental_properties_address_unique on rental_properties(organisation_id,address_normalized) where status<>'archived';
    alter table rental_units add column property_id uuid,add column branch_id uuid,add column unit_label text,add column bedrooms numeric default 0,add column bathrooms numeric default 0,add column parking_count integer default 0,add column floor_area_sqm numeric,add column target_rent numeric default 0,add column deposit_amount numeric default 0,add column available_from date,add column created_by uuid,add column metadata_json jsonb default '{}';
    update rental_units set property_id='${property}',unit_label='MAIN',status='vacant';
    alter table rental_units alter column id set default gen_random_uuid();
    alter table rental_properties alter column id set default gen_random_uuid();
    create unique index rental_units_label_unique on rental_units(property_id,upper(unit_label));
    alter table rental_vacancies add column branch_id uuid,add column assigned_agent_id uuid,add column status text default 'draft',add column available_from date,add column vacancy_reason text,add column metadata_json jsonb default '{}',add column created_by uuid,add column created_at timestamptz default now(),add column updated_at timestamptz default now();
    alter table rental_vacancies alter column id set default gen_random_uuid();
    delete from rental_vacancies;
    create function bridge_is_org_admin(target_org uuid) returns boolean language sql as $$ select false $$;
    alter table rental_property_mandates add column branch_id uuid,add column authority_status text default 'pending',add column starts_on date,add column ends_on date,add column management_fee_type text default 'percentage',add column management_fee_amount numeric default 0,add column created_by uuid,add column created_at timestamptz default now(),add column updated_at timestamptz default now();
    create table contacts(contact_id uuid primary key,organisation_id uuid,first_name text,last_name text,email text,phone text);
    insert into contacts values('${actor}','${org}','Saved','Landlord','owner@example.test','123');
    grant select on contacts to authenticated;
    alter table private_listings add column listing_category text default 'rental',add column title text,add column property_type text default 'house',add column address_line_1 text,add column street_address text,add column suburb text,add column city text,add column province text,add column postal_code text,add column asking_price numeric,add column assigned_agent_id uuid,add column created_by uuid,add column seller_canonical_facts_json jsonb default '{}',add column listing_status text default 'seller_lead',add column listing_visibility text default 'internal',add column updated_at timestamptz default now();
    create trigger private_listings_updated_at before update on private_listings for each row execute function rental_set_updated_at();
    create function bridge_can_access_private_listing(listing_id uuid) returns boolean language sql set search_path='' as $$ select exists(select 1 from public.private_listings where id=listing_id and organisation_id='${org}'::uuid and auth.uid()='${actor}'::uuid) $$;
    grant select,insert,update on private_listings,rental_properties,rental_units to authenticated;
    alter table private_listings enable row level security;
    create policy listing_scope on private_listings to authenticated using(organisation_id='${org}' and assigned_agent_id=auth.uid()) with check(organisation_id='${org}' and assigned_agent_id=auth.uid());
    alter table rental_properties enable row level security;
    create policy property_scope on rental_properties to authenticated using(organisation_id='${org}' and assigned_manager_id=auth.uid()) with check(organisation_id='${org}' and assigned_manager_id=auth.uid());
    alter table rental_units enable row level security;
    create policy unit_scope on rental_units to authenticated using(organisation_id='${org}') with check(organisation_id='${org}');
  `)
  for (const file of ['20260905141009_rental_landlord_mandate_foundation.sql', '20260905141010_rental_vacancy_foundation.sql', '20261004165101_rental_listing_property_registration.sql', '20261014200329_rental_listing_vacancy_handoff.sql'])
    await db.exec(readFileSync(new URL(file, root), 'utf8'))
  return db
}
