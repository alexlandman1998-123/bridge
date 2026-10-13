import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { dispatchListingExpiry, listingExpiryOutcome, runListingChannelExpiryJobs } from '../services/listingChannelExpiryJobs.js'
import { readListingAdvertisingExpiry } from '../services/listingAdvertisingExpiry.js'
import { buildDirectListingOnboardingFormData } from '../../src/lib/directListingIntakeModel.js'
import { listingExpiryError } from '../../src/services/listings/listingExpiryModel.js'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
test('expiry is captured independently from the mandate, with calendar-date validation', () => {
  const saved = buildDirectListingOnboardingFormData({ listingExpiryDate: '2099-11-30', mandateEndDate: '2099-12-31' })
  assert.equal(saved.listingExpiryDate, '2099-11-30'); assert.equal(saved.mandateEndDate, '2099-12-31')
  assert.match(listingExpiryError('2099-02-30'), /valid/)
  assert.match(listingExpiryError('2020-01-01'), /future/)
  assert.equal(listingExpiryError('2099-11-30'), '')
})
test('actual migration enforces scope, atomic saves, concurrent edits, due dates and service-only claims', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table auth.users(id uuid primary key,email text);
      create table private_listings(id uuid primary key,assigned_agent_id uuid,created_by uuid,listing_status text,listing_visibility text);
      create table private_listing_seller_onboarding(private_listing_id uuid primary key,form_data jsonb);
      create table private_listing_activity(private_listing_id uuid,performed_by uuid,visibility text,activity_type text,activity_title text,metadata jsonb);
      create table property24_listing_syncs(private_listing_id uuid,environment text,listing_number int,external_status text);
      create table private_property_listing_syncs(private_listing_id uuid,environment text,property_id text,external_status text);
      create table website_listing_publications(listing_id uuid,status text);
      create table website_partner_listing_publications(listing_id uuid,status text);
      create table listing_publication_jobs(listing_id uuid,state text);
      create function listing_publication_actor_allowed(l uuid,a uuid) returns boolean language sql security definer as $$select exists(select 1 from public.private_listings where id=l and assigned_agent_id=a)$$;
      create function bridge_can_access_private_listing(l uuid) returns boolean language sql security definer as $$select public.listing_publication_actor_allowed(l,auth.uid())$$;
      create function website_get_listing_publication_status(uuid) returns jsonb language sql as $$select jsonb_build_object('status','published','actor',auth.uid())$$;
      create function website_get_partner_listing_status(uuid) returns jsonb language sql as $$select jsonb_build_object('status','published','actor',auth.uid())$$;
      insert into auth.users values('${id(1)}','agent@example.test'),('${id(2)}','other@example.test');
      insert into private_listings values('${id(3)}','${id(1)}','${id(1)}','active','private');
      insert into private_listing_seller_onboarding values('${id(3)}','{}');`)
    await db.exec(await readFile(new URL('../../../supabase/migrations/20261013121907_listing_channel_expiry_schedule.sql', import.meta.url), 'utf8'))
    await db.exec(`insert into property24_listing_syncs values('${id(3)}','production',123,'on_portal');
      insert into private_property_listing_syncs values('${id(3)}','production','existing','active');
      insert into website_listing_publications values('${id(3)}','published');
      insert into website_partner_listing_publications values('${id(3)}','published');`)
    const save = (channels, expected = {}, date = '2099-12-31') => db.query('select save_listing_channel_expiry($1,$2,$3,$4) as settings', [id(3), date, channels, expected])
    const actor = async n => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)])
    await actor(2); await assert.rejects(save(['property24'], { property24: null }), /cannot change/)
    await actor(1); await db.exec('set role authenticated')
    await assert.rejects(db.query('select claim_listing_channel_expiries()'), /permission denied/)
    await assert.rejects(db.query('select claim_id from listing_channel_expiries'), /permission denied/)
    await assert.rejects(db.exec(`insert into listing_channel_expiries(listing_id) values('${id(3)}')`), /permission denied/)
    await assert.rejects(save(['property24'], { property24: null }, '2020-01-01'), /future/)
    const first = (await save(['property24'], { property24: null })).rows[0].settings
    assert.deepEqual(first.map(row => row.channel), ['property24'])
    await assert.rejects(save(['property24', 'private_property'], { property24: null, private_property: null }), /changed elsewhere/)
    assert.equal((await db.query('select channel from listing_channel_expiries')).rows.length, 1)
    const expected = { property24: first[0].updated_at, private_property: null, agency_website: null, kingdom_website: null }
    const all = (await save(Object.keys(expected), expected)).rows[0].settings
    assert.equal(all.length, 4)
    await actor(2); assert.equal((await db.query('select channel from listing_channel_expiries')).rows.length, 0)
    await db.exec('reset role'); await actor(1)
    const claims = (await db.query('select * from claim_listing_channel_expiries()')).rows
    assert.deepEqual(claims.map(row => row.state), ['updating', 'updating'])
    assert.equal((await db.query('select * from claim_listing_channel_expiries()')).rows.length, 0)
    await assert.rejects(save(['property24'], { property24: claims.find(row => row.channel === 'property24').updated_at }), /pending or uncertain/)
    await db.exec("update listing_channel_expiries set claimed_at=now()-interval '11 minutes' where state='updating'")
    await db.query('select * from claim_listing_channel_expiries()')
    assert.equal((await db.query("select state from listing_channel_expiries where channel='property24'")).rows[0].state, 'update_uncertain')
    // Selected day remains advertised; only the following SAST day is due.
    await db.exec("update listing_channel_expiries set expiry_date=(now() at time zone 'Africa/Johannesburg')::date,state='scheduled'")
    assert.equal((await db.query('select * from claim_listing_channel_expiries()')).rows.length, 0)
    await db.exec("update listing_channel_expiries set expiry_date=(now() at time zone 'Africa/Johannesburg')::date-1 where channel='agency_website'")
    const due = (await db.query('select * from claim_listing_channel_expiries()')).rows[0]
    assert.equal(due.channel, 'agency_website'); assert.equal(due.state, 'expiring')
    await assert.rejects(db.query('select listing_expiry_website_context($1,$2,true)', [due.id, due.claim_id]), /unavailable/)
    const context = (await db.query('select listing_expiry_website_context($1,$2,false) as context', [due.id, due.claim_id])).rows[0].context
    assert.equal(context.actorId, id(1)); assert.equal(context.status.actor, id(1))
    await db.exec("update website_listing_publications set status='unpublished'")
    // The same claimed job may read status after its successful removal.
    assert.equal((await db.query('select listing_expiry_website_context($1,$2,false) as context', [due.id, due.claim_id])).rows[0].context.actorId, id(1))
    await db.exec(`update private_listings set assigned_agent_id='${id(2)}'`)
    await assert.rejects(db.query('select listing_expiry_website_context($1,$2,false)', [due.id, due.claim_id]), /unavailable/)
    await db.query('select * from claim_listing_channel_expiries()')
    assert.equal((await db.query("select state from listing_channel_expiries where channel='property24'")).rows[0].state, 'cancelled')
    // Capture is dormant until first publication; unchanged setup never resets
    // a date deliberately changed for only one advert.
    await db.exec(`delete from listing_channel_expiries; update private_listings set assigned_agent_id='${id(1)}';
      update private_listing_seller_onboarding set form_data='{"listingExpiryDate":"2099-11-30","mandateEndDate":"2099-12-31"}';`)
    assert.equal((await db.query('select * from listing_channel_expiries')).rows.length, 0)
    await db.exec("update property24_listing_syncs set external_status='submitted'")
    const setup = (await db.query('select * from listing_channel_expiries')).rows[0]
    assert.equal(new Date(setup.expiry_date).toISOString().slice(0, 10), '2099-11-30'); assert.equal(setup.state, 'scheduled')
    await save(['property24'], { property24: setup.updated_at }, '2099-12-15')
    await db.exec("update property24_listing_syncs set external_status='on_portal'")
    assert.equal(new Date((await db.query('select expiry_date from listing_channel_expiries')).rows[0].expiry_date).toISOString().slice(0, 10), '2099-12-15')
    await db.exec(`update private_listing_seller_onboarding set form_data='{"listingExpiryDate":"2099-12-20"}'; update property24_listing_syncs set external_status='submitted';`)
    assert.equal(new Date((await db.query('select expiry_date from listing_channel_expiries')).rows[0].expiry_date).toISOString().slice(0, 10), '2099-12-20')
    await db.exec(`insert into private_listings values('${id(4)}','${id(1)}','${id(1)}','active','private');
      insert into private_listing_seller_onboarding values('${id(4)}','{"listingExpiryDate":"2099-11-30"}');
      insert into website_listing_publications values('${id(4)}','published');`)
    assert.equal((await db.query('select state from listing_channel_expiries where listing_id=$1', [id(4)])).rows[0]?.state, 'scheduled')
    await db.exec(`update listing_channel_expiries set expiry_date='2020-01-01',state='expired' where listing_id='${id(4)}'; update website_listing_publications set status='unpublished' where listing_id='${id(4)}'`)
    await assert.rejects(db.exec(`update website_listing_publications set status='published' where listing_id='${id(4)}'`), /before republishing/)
  } finally { await db.close() }
})
test('saved channel date survives normal updates; a new setup date supersedes the old setup', async () => {
  const row = { expiry_date: '2099-12-15', setup_expiry_date: '2099-11-30' }
  const client = { from: () => ({ select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: row }) }) }
  assert.equal(await readListingAdvertisingExpiry(client, 'listing', 'property24', '2099-11-30'), '2099-12-15')
  assert.equal(await readListingAdvertisingExpiry(client, 'listing', 'property24', '2099-12-20'), '2099-12-20')
})
test('worker sends native expiry dates, preserves under offer and uses platform removal actions', async () => {
  const calls = []
  const client = { auth: { admin: { getUserById: async () => ({ data: { user: { id: 'actor' } } }) } }, from: () => ({ select() { return this }, eq() { return this }, single: async () => ({ data: { listing_category: 'private_sale', listing_status: 'under_offer' } }) }), functions: { invoke: async (...args) => { calls.push(args); return { data: { publication: { status: 'unpublished' } } } } } }
  const deps = { client, property24: async value => { calls.push(value); return { status: 200, body: { status: 'SUBMITTED' } } }, privateProperty: async value => { calls.push(value); return { status: 200, body: { update: { status: 'UPDATED' } } } } }
  const job = { id: 'job', claim_id: 'claim', listing_id: 'listing', requested_by: 'actor', expiry_date: '2099-12-15' }
  await dispatchListingExpiry({ ...job, state: 'updating', channel: 'property24' }, deps)
  assert.equal(calls[0].body.expiryDate, job.expiry_date); assert.equal(calls[0].body.status, 'Pending')
  assert.equal((await calls[0].dependencies.createSupabase().auth.getUser()).data.user.id, 'actor')
  await dispatchListingExpiry({ ...job, state: 'expiring', channel: 'property24' }, deps); assert.equal(calls[1].body.status, 'Expired')
  await dispatchListingExpiry({ ...job, state: 'expiring', channel: 'private_property' }, deps); assert.equal(calls[2].body.propertyStatus, 'Inactive')
  await dispatchListingExpiry({ ...job, state: 'expiring', channel: 'kingdom_website' }, deps)
  assert.equal(calls[3][0], 'website-partner-listing-publication'); assert.equal(calls[3][1].body.action, 'unpublish')
  assert.equal(listingExpiryOutcome({ status: 503 }, 'update').state, 'update_uncertain')
  assert.equal(listingExpiryOutcome({ status: 200, channel: 'private_property', body: { update: { status: 'UPDATED' } } }, 'expire').state, 'expired')
})
test('worker stores independent results and never repeats an uncertain provider call', async () => {
  const writes = [], calls = []
  const jobs = ['property24', 'private_property'].map(channel => ({ id: channel, channel, state: 'updating', claim_id: 'claim' }))
  const client = { rpc: async () => ({ data: jobs }), from() { return { update(value) { writes.push(value); return this }, eq() { return this }, select() { return this }, single: async () => ({ data: { id: 'receipt' } }), insert: async () => ({}) } } }
  await runListingChannelExpiryJobs({ client, dispatch: async job => { calls.push(job.channel); if (job.channel === 'property24') throw new Error('Lost response'); return { status: 422, body: {} } } })
  assert.deepEqual(calls, ['property24', 'private_property']); assert.deepEqual(writes.map(row => row.state), ['update_uncertain', 'update_failed'])
})
