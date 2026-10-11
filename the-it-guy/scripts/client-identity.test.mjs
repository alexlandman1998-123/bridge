import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const org = randomUUID(), otherOrg = randomUUID(), owner = randomUUID(), agent = randomUUID(), outsider = randomUUID()
const contactA = randomUUID(), contactB = randomUUID(), leadA = randomUUID(), leadB = randomUUID(), transactionId = randomUUID(), buyerId = randomUUID()
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const asActor = async (id, sql, params = []) => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || ''])
  await db.exec('set role authenticated')
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
const profileFor = async (kind, id) => one('select c.* from agency_client_profiles c join agency_client_links l on l.client_id=c.id where l.source_kind=$1 and l.source_id=$2', [kind, id])
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table organisations(id uuid primary key,type text);
    create table organisation_users(id uuid primary key,user_id uuid,organisation_id uuid,workspace_role text,membership_status text,status text);
    create table contacts(contact_id uuid primary key,organisation_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,created_at timestamptz default now(),is_demo_data boolean default false);
    create table leads(lead_id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,contact_id uuid,created_at timestamptz default now());
    create table buyers(id uuid primary key,organisation_id uuid,name text,email text,phone text,created_at timestamptz default now(),is_demo_data boolean default false);
    create table canvassing_prospects(id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,created_at timestamptz default now());
    create table transactions(id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,owner_user_id uuid,buyer_id uuid,seller_name text,seller_email text,seller_phone text,created_at timestamptz default now());
    create table private_listings(id uuid primary key,organisation_id uuid,assigned_agent_id uuid,seller_lead_id text,seller_canonical_facts_json jsonb,created_at timestamptz default now());
    create table private_listing_seller_onboarding(private_listing_id uuid primary key,form_data jsonb,canonical_facts_json jsonb);
    create function bridge_agency_open_operations(p_organisation_id uuid) returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from organisation_users where organisation_id=p_organisation_id and user_id=auth.uid() and workspace_role in ('owner','principal') and membership_status='active'); $$;
    create function bridge_agency_record_scope(p_org uuid,p_user uuid,p_agent uuid default null,p_owner uuid default null) returns boolean language sql stable security definer set search_path=public as $$
      select bridge_agency_open_operations(p_org) or exists(select 1 from organisation_users where organisation_id=p_org and user_id=auth.uid() and membership_status='active' and coalesce(p_user,p_agent,p_owner) in (user_id,id)); $$;
  `)
  await db.query('insert into organisations values ($1,$2),($3,$2)', [org, 'agency', otherOrg])
  for (const [userId, agencyId, role] of [[owner,org,'owner'],[agent,org,'agent'],[outsider,otherOrg,'owner']]) {
    await db.query('insert into organisation_users values ($1,$2,$3,$4,$5,$5)', [randomUUID(),userId,agencyId,role,'active'])
  }
  // Existing records must be backfilled once; matching names/phones must stay separate.
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,last_name,email,phone) values ($1,$2,$3,$4,$5,$6,$7),($8,$2,$3,$4,$5,$9,$7)', [contactA,org,agent,'Alex','Test','A@example.test','0821234567',contactB,'b@example.test'])
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id,contact_id) values ($1,$2,$3,$4),($5,$2,$3,$6)', [leadA,org,agent,contactA,leadB,contactB])
  await db.exec(await readFile(new URL('../../supabase/migrations/20261009113042_agency_client_identity_and_reviewed_merge.sql', import.meta.url),'utf8'))
  let a = await profileFor('lead',leadA), b = await profileFor('lead',leadB)
  assert.notEqual(a.id,b.id,'A shared name and phone must not merge identities')
  assert.equal(a.id,(await profileFor('contact',contactA)).id,'The enquiry and its contact share an identity')
  assert.equal(a.primary_email,'a@example.test')
  assert.equal(a.primary_phone,'27821234567')
  assert.equal((await asActor(owner,'select * from agency_client_profiles')).rows.length,2)
  assert.equal((await asActor(agent,'select * from agency_client_profiles')).rows.length,2,'Assigned staff can read their own complete profiles')
  assert.equal((await asActor(outsider,'select * from agency_client_profiles')).rows.length,0)
  assert.equal((await asActor(null,'select * from agency_client_profiles')).rows.length,0)
  await db.exec('set role anon')
  await assert.rejects(db.query('select * from agency_client_profiles'),/permission denied/)
  await db.exec('reset role')
  await assert.rejects(asActor(agent,'insert into agency_client_profiles(organisation_id,name) values ($1,$2)',[org,'Bypass']),/permission denied/)
  await assert.rejects(asActor(agent,'select agency_client_merge($1,$2,$3,$4,$5)',[a.id,b.id,a.version,b.version,'same person']),/owner or principal/)
  await assert.rejects(asActor(outsider,'select agency_client_update($1,$2,$3,$4::text[],$5::text[])',[a.id,a.version,'Wrong agency',['x@example.test'],[]]),/owner or principal/)
  await assert.rejects(asActor(owner,'select arch9_client_private.attach_source($1,$2,$3,$4,$5,$6)',[org,'contact',randomUUID(),'Forgery','forged@example.test','']),/permission denied/)
  await assert.rejects(asActor(owner,'select agency_client_update($1,$2,$3,$4::text[],$5::text[])',[a.id,a.version,'Alex',['b@example.test'],[]]),/belongs to another client/)
  await assert.rejects(asActor(owner,'select agency_client_update($1,$2,$3,$4::text[],$5::text[])',[a.id,a.version,'Alex',['bad email'],[]]),/valid email/)
  // Editing retains historical aliases and does not rewrite enquiry contacts.
  await asActor(owner,'select agency_client_update($1,$2,$3,$4::text[],$5::text[])',[a.id,a.version,'Alex Primary',['new@example.test','a@example.test'],['0821234567']])
  a = await profileFor('lead',leadA)
  await assert.rejects(asActor(owner,'select agency_client_merge($1,$2,$3,$4,$5)',[a.id,b.id,a.version-1,b.version,'same person']),/details changed/)
  const before = await one("select jsonb_build_object('contacts',(select jsonb_agg(c) from contacts c),'leads',(select jsonb_agg(l) from leads l)) as snapshot")
  const merged = (await asActor(owner,'select agency_client_merge($1,$2,$3,$4,$5) as result',[a.id,b.id,a.version,b.version,'Client confirmed both emails belong to them'])).rows[0].result
  assert.equal(merged.client_id,a.id)
  assert.equal((await profileFor('lead',leadB)).id,a.id)
  assert.equal((await one('select merged_into from agency_client_profiles where id=$1',[b.id])).merged_into,a.id)
  assert.deepEqual(before,(await one("select jsonb_build_object('contacts',(select jsonb_agg(c) from contacts c),'leads',(select jsonb_agg(l) from leads l)) as snapshot")))
  assert.equal((await one('select count(*)::int n from agency_client_identifiers where client_id=$1 and kind=$2',[a.id,'email'])).n,3)
  const audit = await one('select * from agency_client_merge_audit where id=$1',[merged.audit_id])
  assert.equal(audit.actor_id,owner)
  assert.equal(audit.before_snapshot.secondary.id,b.id)
  assert.equal(audit.before_snapshot.links.length,4)
  assert.equal((await asActor(agent,'select * from agency_client_merge_audit')).rows.length,0)
  await assert.rejects(asActor(owner,'delete from agency_client_merge_audit'),/permission denied/)
  // Subsequent enquiries using the secondary email or the original contact preserve the retained ID.
  const contactC=randomUUID(),leadC=randomUUID()
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,$4,$5)',[contactC,org,agent,'Alex','B@EXAMPLE.TEST'])
  await db.query('insert into leads(lead_id,organisation_id,assigned_user_id,contact_id) values ($1,$2,$3,$4)',[leadC,org,agent,contactC])
  assert.equal((await profileFor('lead',leadC)).id,a.id)
  await db.query('update contacts set email=$1 where contact_id=$2',['third@example.test',contactB])
  assert.equal((await profileFor('contact',contactB)).id,a.id)
  // Transactions remain untouched and both party roles are indexed separately.
  await db.query('insert into buyers(id,organisation_id,name,email,phone) values ($1,$2,$3,$4,$5)',[buyerId,org,'Alex Buyer','b@example.test','0821234567'])
  await db.query('insert into transactions(id,organisation_id,assigned_user_id,buyer_id,seller_name,seller_email) values ($1,$2,$3,$4,$5,$6)',[transactionId,org,agent,buyerId,'Different Seller','seller@example.test'])
  assert.equal((await profileFor('transaction_buyer',transactionId)).id,a.id)
  assert.notEqual((await profileFor('transaction_seller',transactionId)).id,a.id)
  // Prospect and listing seller intake share only an exact known identity.
  const prospectId=randomUUID(), listingId=randomUUID()
  await db.query('insert into canvassing_prospects(id,organisation_id,assigned_user_id,first_name,email) values ($1,$2,$3,$4,$5)',[prospectId,org,agent,'Alex','new@example.test'])
  assert.equal((await profileFor('prospect',prospectId)).id,a.id)
  await db.query('insert into private_listings(id,organisation_id,assigned_agent_id,seller_canonical_facts_json) values ($1,$2,$3,$4::jsonb)',[listingId,org,agent,JSON.stringify({fullName:'Alex Seller',email:'new@example.test'})])
  assert.equal((await profileFor('listing_seller',listingId)).id,a.id)
  // Older listing sellers captured only in onboarding are indexed when their form is saved.
  const onboardingListing=randomUUID()
  await db.query('insert into private_listings(id,organisation_id,assigned_agent_id) values ($1,$2,$3)',[onboardingListing,org,agent])
  await db.query('insert into private_listing_seller_onboarding(private_listing_id,form_data) values ($1,$2::jsonb)',[onboardingListing,JSON.stringify({sellerName:'Alex Onboarding',sellerEmail:'b@example.test'})])
  assert.equal((await profileFor('listing_seller',onboardingListing)).id,a.id)
  // Changing the buyer or enquiry contact moves that association to the new person.
  const replacementBuyer=randomUUID(),replacementContact=randomUUID()
  await db.query('insert into buyers(id,organisation_id,name,email) values ($1,$2,$3,$4)',[replacementBuyer,org,'Another Buyer','another@example.test'])
  await db.query('update transactions set buyer_id=$1 where id=$2',[replacementBuyer,transactionId])
  assert.equal((await profileFor('transaction_buyer',transactionId)).id,(await profileFor('buyer',replacementBuyer)).id)
  assert.notEqual((await profileFor('transaction_buyer',transactionId)).id,a.id)
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,$4,$5)',[replacementContact,org,agent,'Another Client','another-contact@example.test'])
  await db.query('update leads set contact_id=$1 where lead_id=$2',[replacementContact,leadC])
  assert.equal((await profileFor('lead',leadC)).id,(await profileFor('contact',replacementContact)).id)
  // Old references resolve for staff when they can read every linked source.
  assert.equal((await asActor(agent,'select * from agency_client_profiles where id=$1',[b.id])).rows.length,1)
  // A second agency may independently have the same email address.
  const foreignContact=randomUUID()
  await db.query('insert into contacts(contact_id,organisation_id,assigned_agent_id,first_name,email) values ($1,$2,$3,$4,$5)',[foreignContact,otherOrg,outsider,'Alex Other Agency','b@example.test'])
  const foreign = await profileFor('contact',foreignContact)
  assert.notEqual(foreign.id,a.id)
  a=await profileFor('lead',leadA)
  await assert.rejects(asActor(owner,'select agency_client_merge($1,$2,$3,$4,$5)',[a.id,foreign.id,a.version,foreign.version,'Cross agency']),/this agency/)
  // A profile that combines records assigned to different agents cannot widen staff access.
  await db.query('update leads set assigned_user_id=$1 where lead_id=$2',[owner,leadB])
  assert.equal((await asActor(agent,'select * from agency_client_profiles where id=$1',[a.id])).rows.length,0)
  assert.equal((await asActor(agent,'select * from agency_client_identifiers where client_id=$1',[a.id])).rows.length,0)
  assert.equal((await asActor(owner,'select * from agency_client_profiles where id=$1',[a.id])).rows.length,1)
  // Merge chains flatten old references without changing earlier audit snapshots.
  const seller=await profileFor('transaction_seller',transactionId)
  await asActor(owner,'select agency_client_merge($1,$2,$3,$4,$5)',[seller.id,a.id,seller.version,a.version,'Synthetic chain verification'])
  assert.equal((await one('select merged_into from agency_client_profiles where id=$1',[b.id])).merged_into,seller.id)
  assert.equal((await one('select before_snapshot from agency_client_merge_audit where id=$1',[merged.audit_id])).before_snapshot.secondary.id,b.id)
  console.log('Client identity database checks passed: backfill, automatic intake, aliases, reviewed merge, audit, redirects, version conflicts, original-record preservation, agency/staff isolation and denied bypasses.')
} catch (error) { console.error(error.message, error.code || '', error.position || '', error.where || ''); process.exitCode=1 } finally { await db.close() }
