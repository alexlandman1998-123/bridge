// Isolated PostgreSQL fixture; imports no hosted credentials and sends no email.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { rentalListingInventoryDatabase, actor, org, property, unit } from './rentalListingInventoryDatabase.js'
export { actor, org, property, unit }
export const owner='99999999-9999-4999-8999-999999999999'
const migration=name=>readFileSync(new URL(`../../../../supabase/migrations/${name}`,import.meta.url),'utf8')
export async function rentalLandlordProfileDatabase({ sharedRules = false, selectedSignatories = false } = {}) {
  const db=await rentalListingInventoryDatabase()
  await installRentalLandlordProfileSaving(db, { sharedRules, selectedSignatories })
  return db
}
// Add the current profile chain to either the focused profile database or the
// complete rental journey, so acceptance checks cannot silently use older rules.
export async function installRentalLandlordProfileSaving(db, { sharedRules = true, selectedSignatories = true, conditionalMatrix = true } = {}) {
  await db.exec(`insert into auth.users(id) values('${owner}');
    alter table organisations add column type text default 'agency';
    create table organisation_users(id uuid primary key default gen_random_uuid(),organisation_id uuid,user_id uuid,workspace_role text,membership_status text default 'active',status text default 'active');
    insert into organisation_users(organisation_id,user_id,workspace_role) values('${org}','${actor}','agent'),('${org}','${owner}','owner');
    alter table contacts add column if not exists assigned_agent_id uuid,add column if not exists created_at timestamptz default now();
    alter table leads add column if not exists contact_id uuid,add column assigned_user_id uuid,add column if not exists assigned_agent_id uuid,add column if not exists created_at timestamptz default now();
    create table buyers(id uuid primary key,organisation_id uuid,name text,email text,phone text,created_at timestamptz default now());
    create table canvassing_prospects(id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,created_at timestamptz default now());
    create table transactions(id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,owner_user_id uuid,buyer_id uuid,seller_name text,seller_email text,seller_phone text,created_at timestamptz default now());
    create table private_listing_seller_onboarding(private_listing_id uuid primary key,form_data jsonb,canonical_facts_json jsonb);
    alter table private_listings add column seller_lead_id text,add column if not exists created_at timestamptz default now(),add column seller_type text,add column seller_canonical_fact_readiness_json jsonb default '{}',add column seller_canonical_facts_updated_at timestamptz;
    create function bridge_agency_open_operations(p_organisation_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organisation_users where organisation_id=p_organisation_id and user_id=auth.uid() and workspace_role='owner'); $$;
    create function bridge_agency_record_scope(p_org uuid,p_user uuid,p_agent uuid default null,p_owner uuid default null) returns boolean language sql stable security definer set search_path='' as $$ select public.bridge_agency_open_operations(p_org) or auth.uid()=coalesce(p_user,p_agent,p_owner); $$;`)
  await db.exec(migration('20261009113042_agency_client_identity_and_reviewed_merge.sql'))
  await db.exec(migration('20261015083559_rental_landlord_profile_consistent_saving.sql'))
  if (sharedRules || selectedSignatories) {
    if (conditionalMatrix) await db.exec(migration('20261008120849_rental_landlord_conditional_document_requirements.sql'))
    await db.exec(migration('20261015100645_rental_landlord_shared_conditional_rules.sql'))
  }
  if (selectedSignatories) await db.exec(migration('20261015103158_rental_landlord_selected_signatories.sql'))
}
export async function seedRentalLandlordProfile(db,{nested=true}={}) {
  const id=randomUUID(),contact=randomUUID(),listings=[randomUUID(),randomUUID()]
  const profile={type:'company',name:'Original Owner',email:`${id}@example.test`,phone:'0821234567',registrationNumber:'KEEP',notes:'Private notes',people:[{id:'director',name:'Director',signingAuthority:true}]}
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,last_name,email,phone) values($1,$2,$3,$4,$5,$6,$7)',[contact,org,actor,'Original','Owner',profile.email,profile.phone])
  const data={role:'landlord',classification:'rental',stage:'new',workflow:{events:[]},unrelated:'KEEP',landlordProfile:profile,landlordPortfolio:listings.map((listingId,i)=>({id:`home-${i}`,address:'Saved road',listingId}))}
  await db.query('insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,raw_enquiry_payload) values($1,$2,$3,$4,$5)',[id,org,contact,actor,JSON.stringify(nested?{rentalCrm:data,legacy:'KEEP'}:data)])
  for(const listingId of listings) await db.query('insert into private_listings(id,organisation_id,assigned_agent_id,seller_canonical_facts_json) values($1,$2,$3,$4)',[listingId,org,actor,JSON.stringify({propertyId:property,unitId:unit,landlordLeadId:id,landlordContactId:contact,landlordName:profile.name,landlordEmail:profile.email,landlordPhone:profile.phone,landlordType:profile.type,mandateStatus:'signed',rentalCaptureDraft:{version:1,form:{landlordName:profile.name,monthlyRent:'12000'}},privateNotes:'KEEP'})])
  const client=(await db.query("select c.* from agency_client_profiles c join agency_client_links l on l.client_id=c.id where l.source_kind='lead' and l.source_id=$1",[id])).rows[0]
  await db.query('insert into rental_landlord_onboarding(lead_id,organisation_id) values($1,$2)',[id,org])
  const snapshot=(await db.query('select rental_landlord_onboarding_snapshot($1,$2) data',[id,JSON.stringify({organisation_id:org})])).rows[0].data
  return {id,contact,listings,profile,client,snapshot}
}
