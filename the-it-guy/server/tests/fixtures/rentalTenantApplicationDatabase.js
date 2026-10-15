import { readFileSync } from 'node:fs'
import { rentalListingInventoryDatabase, actor, org, property, unit, listing } from './rentalListingInventoryDatabase.js'
export { actor, org, property, unit, listing }
export const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const lead = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const root = new URL('../../../../supabase/migrations/', import.meta.url)
export async function rentalTenantApplicationDatabase({ seedJourney = true } = {}) {
  const db = await rentalListingInventoryDatabase()
  await db.exec(`alter table leads add column contact_id uuid,add column lead_domain text default 'agency',add column lead_category text default 'buyer',add column stage text default 'Application pending',add column listing_id text,add column enquired_listing_id uuid,add column updated_at timestamptz default now(),add column assigned_agent_id uuid;
    alter table rental_applications alter column id set default gen_random_uuid();
    alter table rental_applications add column created_by uuid;
    alter table rental_application_documents add column mime_type text,add column file_size_bytes integer;
    create table rental_application_access_tokens(id uuid primary key default gen_random_uuid(),application_id uuid,token_hash text unique not null,expires_at timestamptz not null,revoked_at timestamptz,last_accessed_at timestamptz,created_by uuid,subject_id text);
    create function bridge_current_workspace_role(workspace_id uuid) returns text language sql as $$ select 'owner'::text $$;
    alter table organisations add column name text,add column display_name text,add column logo_url text;
    create table organisation_settings(organisation_id uuid,settings_json jsonb);
    grant select,update on leads to authenticated;
    alter table leads enable row level security;
    create policy lead_scope on leads to authenticated using(organisation_id='${org}' and assigned_agent_id=auth.uid()) with check(organisation_id='${org}' and assigned_agent_id=auth.uid());
    insert into contacts values('${tenant}','${org}','Saved','Tenant','tenant@example.test','0825550101');
    ${seedJourney ? `insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,raw_enquiry_payload) values('${lead}','${org}','${tenant}','${actor}','{"arch9RentalLead":true,"classification":"rental","role":"tenant","stage":"application_pending"}');` : ''}
  `)
  for (const file of ['20260905141014_rental_applications_and_applicant_access.sql','20261007194611_rental_application_cost_confirmation.sql','20261007204950_rental_application_document_packs.sql','20261007212433_rental_empty_document_pack_readiness.sql']) await db.exec(readFileSync(new URL(file,root),'utf8'))
  // Execute the real journey trigger. The unrelated sales linking RPC requires
  // the complete sales schema and is tested separately by the lead guard suite.
  const journey = readFileSync(new URL('20261014185302_rental_lead_journey_guards.sql',root),'utf8')
  await db.exec(journey.slice(0,journey.indexOf('-- Keep the locked seller-link command'))+'commit;')
  await db.exec(readFileSync(new URL('20261014203952_rental_tenant_application_connections.sql',root),'utf8'))
  if (seedJourney) {
  await db.query('insert into private_listings(id,organisation_id,assigned_agent_id,title,address_line_1,city,asking_price,seller_canonical_facts_json) values($1,$2,$3,$4,$5,$6,11000,$7)',[listing,org,actor,'Saved home','12 Saved Road','Pretoria',JSON.stringify({propertyId:property,unitId:unit,rentalInfo:{rentalPriceFrequency:'monthly',depositAmount:22000,leasePeriodMonths:12}})])
  // A previously accepted uploaded mandate. New authority approval remains
  // covered by the landlord onboarding acceptance tests.
  await db.exec('alter table rental_property_mandates disable trigger user')
  await db.query("insert into rental_property_mandates(organisation_id,property_id,mandate_status,authority_status,metadata_json) values($1,$2,'active','confirmed',$3)",[org,property,JSON.stringify({signedEvidenceReference:'uploads/signed-mandate',signedAt:'2026-10-10'})])
  await db.exec('alter table rental_property_mandates enable trigger user')
  await db.query('insert into rental_property_landlords(organisation_id,property_id,party_id,ownership_share,is_primary_contact) values($1,$2,$3,100,true)',[org,property,actor])
  }
  return db
}
