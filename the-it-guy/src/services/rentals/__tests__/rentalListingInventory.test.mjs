import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRentalListingAcceptanceFixture } from '../../../../scripts/lib/rentalListingAcceptanceFixture.mjs'
const { db, actor, org, listing, otherOrg, otherListing, readonlyActor, patch, publication, gallery } = await createRentalListingAcceptanceFixture()
const migrationRoot = new URL('../../../../../supabase/migrations/', import.meta.url)
const sql = async name => readFile(new URL(name, migrationRoot), 'utf8')
const uuid = n => `${n}`.repeat(8) + '-' + `${n}`.repeat(4) + '-4' + `${n}`.repeat(3) + '-8' + `${n}`.repeat(3) + '-' + `${n}`.repeat(12)
try {
  await db.exec(`reset role;
    create table auth.users(id uuid primary key); create table profiles(id uuid primary key);
    create table organisations(id uuid primary key); create table organisation_branches(id uuid primary key, organisation_id uuid);
    create table branch_members(branch_id uuid,user_id uuid,status text);
    insert into auth.users values('${actor}'),('${readonlyActor}'); insert into profiles select id from auth.users;
    insert into organisations values('${org}'),('${otherOrg}');
    insert into organisation_branches values('${uuid(9)}','${org}');
    grant select on organisation_branches, branch_members to authenticated;
    create function bridge_is_org_admin(o uuid) returns boolean language sql stable as $$select false$$;
    alter table private_listings add column branch_id uuid, add column assigned_agent_id uuid references profiles(id), add column created_by uuid references auth.users(id);
    update private_listings set assigned_agent_id='${actor}', created_by='${actor}',address_line_1='10 Test Road', city='Cape Town',asking_price=12000 where id='${listing}';
    grant insert on private_listings to authenticated;
    create policy rental_insert on private_listings for insert to authenticated with check(bridge_is_active_member(organisation_id) and auth.uid()<>'${readonlyActor}'::uuid);`)
  await db.exec(await sql('20260905141005_rental_property_foundation.sql'))
  await db.exec(await sql('20260905141007_rental_unit_foundation.sql'))
  await db.exec(await sql('20261004165101_rental_listing_property_registration.sql'))
  const links = async id => (await db.query('select rental_property_id, rental_unit_id from private_listings where id=$1', [id])).rows[0]
  const original = await links(listing)
  assert.ok(original.rental_property_id); assert.ok(original.rental_unit_id)
  assert.equal((await db.query('select status from rental_properties where id=$1',[original.rental_property_id])).rows[0].status,'active')
  assert.equal((await links(otherListing)).rental_property_id,null)
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false)`)
  const insert = (id, values = {}) => db.query(`insert into private_listings(id, organisation_id, branch_id, assigned_agent_id, created_by, listing_category, address_line_1, city, asking_price, seller_canonical_facts_json)
    values($1,$2,$3,$4,$4,$5,$6,'Cape Town',12000,$7) returning *`, [id, values.org || org, values.branch || null, actor, values.category || 'rental', values.address || '10 Test Road', JSON.stringify(values.facts || {})])
  const same = (await insert(uuid(6))).rows[0]
  assert.equal(same.rental_property_id,original.rental_property_id); assert.equal(same.rental_unit_id,original.rental_unit_id)
  const apartment = (await insert(uuid(7), { facts: { addressProfile: { unitNumber:'2' }, propertyProfile:{ bedrooms:2, bathrooms:1 }, rentalInfo:{ depositAmount:24000,availableFrom:'2026-11-01' } } })).rows[0]
  assert.equal(apartment.rental_property_id,original.rental_property_id); assert.notEqual(apartment.rental_unit_id,original.rental_unit_id)
  const unit=(await db.query('select * from rental_units where id=$1',[apartment.rental_unit_id])).rows[0]
  assert.equal(unit.unit_label,'2');assert.equal(Number(unit.target_rent),12000);assert.equal(Number(unit.deposit_amount),24000);assert.equal(unit.status,'vacant')
  await db.query('update private_listings set asking_price=14000 where id=$1',[listing])
  assert.deepEqual(await links(listing),original)
  await assert.rejects(insert(uuid(8), { org:otherOrg }), /row-level security/)
  await assert.rejects(insert(uuid(8), { branch:uuid(9),address:'Branch home' }), /row-level security/)
  await db.exec('reset role')
  assert.equal((await db.query("select count(*)::int n from rental_properties where address_line_1='Branch home'")).rows[0].n,0)
  await db.exec("select set_config('request.jwt.claim.sub','',false)")
  await db.query('update rental_units set status=$2, active_tenancy_id=$3 where id=$1',[original.rental_unit_id,'occupied',uuid(9)])
  const occupied=(await db.query('select * from rental_units where id=$1',[original.rental_unit_id])).rows[0]
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false)`)
  await db.query('update private_listings set asking_price=15000 where id=$1',[listing])
  assert.deepEqual((await db.query('select * from rental_units where id=$1',[original.rental_unit_id])).rows[0],occupied)
  await assert.rejects(db.query('update private_listings set rental_unit_id=$2 where id=$1',[listing,apartment.rental_unit_id]),/cannot be reassigned/)
  await insert(uuid(8),{category:'sale',address:'Sales home'})
  assert.equal((await links(uuid(8))).rental_property_id,null)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[readonlyActor])
  await assert.rejects(insert(uuid('a'),{address:'Denied home'}),/row-level security/)
  await db.exec('reset role')
  assert.equal((await db.query("select count(*)::int n from rental_properties where address_line_1='Denied home'")).rows[0].n,0)
  await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor])
  const handoff=(await insert(uuid('a'),{address:'Different advert formatting',facts:{propertyId:original.rental_property_id,unitId:original.rental_unit_id}})).rows[0]
  assert.equal(handoff.rental_property_id,original.rental_property_id);assert.equal(handoff.rental_unit_id,original.rental_unit_id)
  assert.equal((await db.query("select count(*)::int n from rental_properties")).rows[0].n,1)
  assert.equal((await db.query("select count(*)::int n from rental_units")).rows[0].n,2)
  const expected=(await db.query('select updated_at from private_listings where id=$1',[listing])).rows[0].updated_at
  const receipt=(await db.query('select save_rental_listing_snapshot_v2($1,$2,$3,$4,$5,0,$6) value',[listing,expected,JSON.stringify(patch),JSON.stringify(publication),JSON.stringify(gallery),'[]'])).rows[0].value
  assert.deepEqual(receipt.facts,patch.sellerCanonicalFacts);assert.deepEqual(await links(listing),original)
  await assert.rejects(insert(uuid('c'),{facts:{propertyId:uuid('d')}}), /unavailable or outside/)
  // A pre-existing building with numbered units cannot acquire a made-up MAIN.
  await db.exec('reset role')
  await db.query(`insert into rental_properties(id,organisation_id,assigned_manager_id,created_by,name,property_type,status,address_line_1,city,address_normalized)
    values($1,$2,$3,$3,'Existing building','apartment','active','20 Test Road','Cape Town','20 test road|cape town')`,[uuid('b'),org,actor])
  await db.query(`insert into rental_units(organisation_id,property_id,unit_label) values($1,$2,'1')`,[org,uuid('b')])
  await db.exec('set role authenticated')
  await assert.rejects(insert(uuid('c'),{address:'20 Test Road'}), /Choose a unit number/)
  const numbered=(await insert(uuid('c'),{address:'20 Test Road',facts:{addressProfile:{unitNumber:'1'}}})).rows[0]
  assert.equal(numbered.rental_property_id,uuid('b'))
  const weekly=(await insert(uuid('d'),{address:'Weekly rental',facts:{rentalInfo:{rentalPriceFrequency:'weekly'}}})).rows[0]
  assert.equal(Number((await db.query('select target_rent from rental_units where id=$1',[weekly.rental_unit_id])).rows[0].target_rent),0)
  await db.exec('reset role')
  const fn=(await db.query("select prosecdef,proconfig from pg_proc where proname='rental_listing_register_inventory'")).rows[0]
  assert.equal(fn.prosecdef,false);assert.ok(fn.proconfig.includes('search_path=""'))
  assert.equal((await db.query("select has_function_privilege('anon','rental_listing_register_inventory()','EXECUTE') allowed")).rows[0].allowed,false)
  console.log('Rental inventory SQL checks passed: legacy repair, creation, exact reuse, units, retries, occupied preservation, workspace denial, rollback, sales isolation and audited snapshot.')
} catch (error) { console.error(error.message, error.where || ""); process.exitCode = 1 } finally { await db.close() }
