import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const one = '11111111-1111-4111-8111-111111111111'
const two = '22222222-2222-4222-8222-222222222222'
const listing = '33333333-3333-4333-8333-333333333333'
const agent = '44444444-4444-4444-8444-444444444444'
const config = '55555555-5555-4555-8555-555555555555'
const otherConfig = '66666666-6666-4666-8666-666666666666'
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(), decrypted_secret text, name text, description text);
    create view vault.decrypted_secrets as select * from vault.secrets;
    create function vault.create_secret(secret text, name text, description text) returns uuid language sql as $$
      insert into vault.secrets(decrypted_secret,name,description) values(secret,name,description) returning id $$;
    create function vault.update_secret(secret_id uuid, secret text) returns void language sql as $$
      update vault.secrets set decrypted_secret=secret where id=secret_id $$;
    create table public.private_property_agency_configs(id uuid primary key, organisation_id uuid, environment text, enabled boolean,
      status text, go_live_approved_at timestamptz, metadata_json jsonb default '{}', updated_at timestamptz default now());
    create table public.private_listings(id uuid primary key, organisation_id uuid, assigned_agent_id uuid, assigned_agent_email text, branch_id uuid, title text);
    create table public.contacts(contact_id uuid primary key, organisation_id uuid, assigned_agent_id uuid, first_name text, last_name text,
      phone text, email text, contact_type text, updated_at timestamptz);
    create table public.leads(lead_id uuid primary key, organisation_id uuid, contact_id uuid, lead_domain text, assigned_agent_id uuid,
      assigned_user_id uuid, assigned_agent_email text, branch_id uuid, lead_category text, lead_direction text, lead_source text, source_channel text,
      stage text, status text, priority text, listing_id text, enquired_listing_id uuid, enquired_property_title text, source_reference_id text,
      source_received_at timestamptz, raw_enquiry_payload jsonb, notes text, updated_at timestamptz,
      constraint leads_source_channel_check check (source_channel is null or source_channel in ('instagram','facebook','linkedin','website','whatsapp','email','qr','referral','manual','agent_profile','other')));
    create table public.lead_ingestion_logs(log_id uuid primary key, organisation_id uuid, source text, external_reference text,
      payload jsonb, status text, lead_id uuid, contact_id uuid, listing_id uuid, assigned_agent_id uuid, processed_at timestamptz,
      unique(organisation_id, source, external_reference));
    create table public.lead_listing_interests(organisation_id uuid, lead_id uuid, contact_id uuid, listing_id uuid,
      source text, status text, is_original_enquiry boolean);
  `)
  const migration = await fs.readFile(new URL('../../supabase/migrations/20261005060708_portal_lead_intake_global_fix.sql', import.meta.url), 'utf8')
  const correction = await fs.readFile(new URL('../../supabase/migrations/20261005064727_private_property_lead_channel_correction.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(correction)
  await db.exec(migration)
  await db.exec(correction)
  await db.query(`insert into public.private_property_agency_configs(id,organisation_id,environment,enabled,status,go_live_approved_at)
    values($1,$2,'production',true,'approved',now()),($3,$4,'production',true,'approved',now())`, [config,one,otherConfig,two])
  await db.query('insert into private_listings values($1,$2,$3,$4,$5,$6)', [listing,one,agent,'fixture-agent@example.test',one,'Fixture property'])
  const save = (id, agency, secret) => db.query('select public.set_private_property_webhook_configuration($1,$2,$3) as saved',[id,agency,secret])
  assert.equal((await save(config,'100','fixture-hmac-secret')).rows[0].saved,true)
  assert.equal((await db.query('select public.get_private_property_webhook_secret($1) as secret',[config])).rows[0].secret,'fixture-hmac-secret')
  assert.equal((await save(config,'100',null)).rows[0].saved,true)
  await assert.rejects(save(otherConfig,'100','other-secret'),/already connected/)
  await assert.rejects(save(config,'200',null),/changed agency/)
  await assert.rejects(save(otherConfig,'invalid','other-secret'),/numeric agency/)
  const state = (await db.query('select enabled,status,go_live_approved_at from private_property_agency_configs where id=$1',[config])).rows[0]
  assert.equal(state.enabled,true); assert.equal(state.status,'approved'); assert.ok(state.go_live_approved_at)
  for (const fn of ['get_private_property_webhook_secret(uuid)','set_private_property_webhook_configuration(uuid,text,text)','private_property_ingest_lead(uuid,text,text,text,text,text,uuid,jsonb)']) {
    for (const role of ['anon','authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',[role,fn,'EXECUTE'])).rows[0].allowed,false)
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',['service_role',fn,'EXECUTE'])).rows[0].allowed,true)
  }
  async function ingest({ org=one, reference='PP:123', listingId=listing, name='Fixture Buyer Person', email='fixture@example.test', phone='', payload={} }={}) {
    return (await db.query('select public.private_property_ingest_lead($1,$2,$3,$4,$5,$6,$7,$8) as lead_id',
      [org,reference,name,email,phone,'Fixture enquiry',listingId,JSON.stringify(payload)])).rows[0].lead_id
  }
  const leadId=await ingest({payload:{leadDateTime:'2026-10-05T08:00:00+02:00',listingType:'Sale'}})
  assert.equal(await ingest(),leadId)
  const rows=(await db.query('select * from leads')).rows
  assert.equal(rows.length,1); assert.equal(rows[0].assigned_agent_id,agent); assert.equal(rows[0].assigned_user_id,agent)
  assert.equal(rows[0].assigned_agent_email,'fixture-agent@example.test'); assert.equal(rows[0].lead_source,'Private Property')
  assert.equal(rows[0].source_channel,'other')
  assert.equal(rows[0].source_received_at.toISOString(),'2026-10-05T06:00:00.000Z')
  assert.equal((await db.query('select count(*)::int as count from lead_listing_interests')).rows[0].count,1)
  assert.equal((await db.query('select last_name from contacts')).rows[0].last_name,'Buyer Person')
  await assert.rejects(ingest({org:two,reference:'PP:124'}),/does not belong/)
  await assert.rejects(ingest({reference:'PP:125',name:'',email:''}),/identity/)
  const rental=await ingest({org:two,reference:'PP:126',listingId:null,payload:{listingType:'Rental'}})
  const rentalRow=(await db.query('select raw_enquiry_payload from leads where lead_id=$1',[rental])).rows[0].raw_enquiry_payload
  assert.equal(rentalRow.arch9RentalLead,true); assert.equal(rentalRow.role,'tenant')
  await db.exec(`alter table lead_listing_interests add constraint fixture_reject_listing check(listing_id <> '${listing}'::uuid) not valid`)
  const before=(await db.query('select (select count(*) from contacts)::int as contacts,(select count(*) from leads)::int as leads,(select count(*) from lead_ingestion_logs)::int as logs')).rows[0]
  await assert.rejects(ingest({reference:'PP:127',email:'atomic-fixture@example.test'}),/fixture_reject_listing/)
  const after=(await db.query('select (select count(*) from contacts)::int as contacts,(select count(*) from leads)::int as leads,(select count(*) from lead_ingestion_logs)::int as logs')).rows[0]
  assert.deepEqual(after,before,'A failed lead write must roll back its contact, lead and ingestion log together.')
  console.log('Portal lead database checks passed: encrypted setup, access controls, agency isolation, assignment, duplicate replay and atomic rollback')
} finally {await db.close()}
