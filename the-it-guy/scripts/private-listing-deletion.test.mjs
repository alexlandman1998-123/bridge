import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { getListingDeletionBlock, resolveListingDeletion, verifyListingDeletion } from '../src/services/privateListingDeletion.js'
function client(rows, error = null) {
  return { from() {
    const filters = []
    const q = { select() { return q }, eq(k,v) { filters.push([k,v]); return q },
      async maybeSingle() { return { data: rows.find(r => filters.every(([k,v]) => r[k]===v)) || null, error } },
      async limit(n) { return { data: rows.filter(r => filters.every(([k,v]) => r[k]===v)).slice(0,n), error } }
    }; return q
  } }
}
const listing={ id:'remote',organisation_id:'kingdom',listing_reference:'PRV-TEST' }
test('stale draft UUID resolves to real server listing in the same organisation',async()=>{
  assert.deepEqual(await resolveListingDeletion(client([listing]),'local',{organisationId:'kingdom',listingReference:'PRV-TEST'}),listing)
})
test('never substitutes another organisation or a conflicting existing UUID',async()=>{
  assert.equal(await resolveListingDeletion(client([listing]),'local',{organisationId:'other',listingReference:'PRV-TEST'}),null)
  await assert.rejects(resolveListingDeletion(client([listing]),'remote',{organisationId:'kingdom',listingReference:'different'}),/identity has changed/)
})
test('ambiguous references and failed reads stop deletion',async()=>{
  await assert.rejects(resolveListingDeletion(client([listing,{...listing,id:'second'}]),'local',{organisationId:'kingdom',listingReference:'PRV-TEST'}),/More than one/)
  await assert.rejects(resolveListingDeletion(client([],new Error('offline')),'remote'),/offline/)
})
test('a success response cannot hide a listing that still exists',async()=>{
  await assert.rejects(verifyListingDeletion(client([listing]),listing),/still saved/)
  await verifyListingDeletion(client([]),listing)
})

test('deletion errors distinguish withdrawal from deletion without weakening ownership errors', () => {
  assert.equal(getListingDeletionBlock({ code: '23503' }).reason, 'linked_records')
  assert.match(getListingDeletionBlock({ code: '23503' }).message, /still withdraw/)
  assert.equal(getListingDeletionBlock({ code: 'listing_must_be_withdrawn' }).reason, 'live_channels')
  assert.equal(getListingDeletionBlock({ code: 'website_launch_must_be_rolled_back' }).reason, 'website_launch')
  assert.equal(getListingDeletionBlock({ code: 'listing_portal_request_pending' }).reason, 'pending_portal_request')
  assert.equal(getListingDeletionBlock({ code: '42501', message: 'Permission denied.' }), null)
  assert.equal(getListingDeletionBlock({ message: 'Network unavailable.' }), null)
})

test('shared SQL deletion requires withdrawal for sales and rentals, retaining access and workflow guards', async () => {
  const db = new PGlite()
  const id = '11111111-1111-4111-8111-111111111111'
  const org = '22222222-2222-4222-8222-222222222222'
  const agent = '33333333-3333-4333-8333-333333333333'
  const other = '44444444-4444-4444-8444-444444444444'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('fixture.uid', true), '')::uuid $$;
      create function public.bridge_is_active_member(uuid) returns boolean language sql as $$
        select $1 = '${org}'::uuid and current_setting('fixture.member', true) = 'true' $$;
      create function public.bridge_is_org_admin(uuid) returns boolean language sql as $$
        select current_setting('fixture.admin', true) = 'true' $$;
      create function public.bridge_can_access_private_listing(uuid) returns boolean language sql as $$ select true $$;
      create table private_listings(id uuid primary key, organisation_id uuid, assigned_agent_id uuid,
        created_by uuid, seller_lead_id uuid, originating_crm_lead_id uuid, listing_reference text,
        title text, listing_category text, property24_status text, private_property_status text);
      create table property24_listing_syncs(private_listing_id uuid references private_listings on delete cascade,
        environment text, is_on_portal boolean);
      create table private_property_listing_syncs(private_listing_id uuid references private_listings on delete cascade,
        environment text, is_on_portal boolean);
      create table fixture_publications(listing_id uuid references private_listings on delete cascade,
        agency_status text, kingdom_status text);
      create function public.website_get_listing_publication_status(uuid) returns jsonb language sql as $$
        select jsonb_build_object('status', coalesce((select agency_status from fixture_publications where listing_id=$1), 'not_published')) $$;
      create function public.website_get_partner_listing_status(uuid) returns jsonb language sql as $$
        select jsonb_build_object('status', coalesce((select kingdom_status from fixture_publications where listing_id=$1), 'not_published')) $$;
      create table website_production_dark_launches(id uuid primary key default gen_random_uuid(),
        listing_id uuid references private_listings on delete set null, status text);
      create table fixture_linked_workflows(listing_id uuid references private_listings);
      create table website_partner_listing_publications(listing_id uuid references private_listings,
        status text not null check (status in ('published','unpublished')));
    `)
    const migration = await fs.readFile(new URL('../../supabase/migrations/20261005075454_listing_deletion_withdrawal_guard.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const cleanup = await fs.readFile(new URL('../../supabase/migrations/20261012083836_listing_delete_unpublished_partner_cleanup.sql', import.meta.url), 'utf8')
    await db.exec(cleanup)
    await db.exec(cleanup)
    await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261004155515_rental_publication_attempt_recovery.sql', import.meta.url), 'utf8'))
    const archive = await fs.readFile(new URL('../../supabase/migrations/20261012101600_listing_delete_completed_portal_history.sql', import.meta.url), 'utf8')
    await db.exec(archive)
    await db.exec(archive)
    const setting = (name, value) => db.query('select set_config($1,$2,false)', [name, value])
    await setting('fixture.uid', agent); await setting('fixture.member', 'true'); await setting('fixture.admin', 'false')
    const remove = async () => (await db.query('select public.delete_private_listing($1) as result', [id])).rows[0].result
    const exists = async () => (await db.query('select count(*)::int as count from private_listings where id=$1', [id])).rows[0].count === 1
    const insert = (category) => db.query(`insert into private_listings(id,organisation_id,assigned_agent_id,created_by,title,listing_reference,listing_category)
      values($1,$2,$3,$3,'Fixture home','FIXTURE',$4)`, [id, org, agent, category])
    const addAttempt = (state = 'accepted', resolved = true) => db.query(`insert into rental_publication_attempts
      (private_listing_id,organisation_id,channel,environment,operation,state,identity,payload_digest,receipt,resolved_at)
      values($1,$2,'property24','production','status_update',$3,'{"listingNumber":117681272}', 'original-digest',
        '{"accepted":true,"reference":"117681272"}',case when $4 then now() else null end) returning to_jsonb(rental_publication_attempts) as record`, [id,org,state,resolved])
    for (const category of ['sale', 'rental']) {
      await insert(category)
      const originalAttempts = []
      for (let i = 0; i < 6; i++) originalAttempts.push((await addAttempt()).rows[0].record)
      originalAttempts.push((await addAttempt('rejected')).rows[0].record)
      originalAttempts.push((await addAttempt('reconciled')).rows[0].record)
      for (const [column, statuses] of [
        ['property24_status', ['Active', 'on-portal', 'Published', 'Pending', 'Back On Market', 'awaiting verification']],
        ['private_property_status', ['ToLet', 'To Let', 'To Rent', 'Current', 'Accepted', 'UNCERTAIN']],
      ]) {
        for (const status of statuses) {
          await db.query(`update private_listings set ${column}=$1 where id=$2`, [status, id])
          assert.equal((await remove()).code, 'listing_must_be_withdrawn', `${category}: ${column}=${status}`)
          assert.equal(await exists(), true)
        }
        await db.query(`update private_listings set ${column}='withdrawn' where id=$1`, [id])
      }
      await db.query("insert into property24_listing_syncs values($1,'production',true)", [id])
      assert.equal((await remove()).deleted, false)
      await db.query('update property24_listing_syncs set is_on_portal=false where private_listing_id=$1', [id])
      await db.query("insert into private_property_listing_syncs values($1,'production',true)", [id])
      assert.equal((await remove()).code, 'listing_must_be_withdrawn', 'a live PP sync still protects the record even when the listing field says withdrawn')
      await db.query('update private_property_listing_syncs set is_on_portal=false where private_listing_id=$1', [id])
      await db.query("insert into fixture_publications values($1,'published','not_published')", [id])
      assert.equal((await remove()).deleted, false)
      await db.query("update fixture_publications set agency_status='unpublished',kingdom_status='published'", [])
      assert.equal((await remove()).deleted, false)
      await db.query("update fixture_publications set kingdom_status='unpublished'", [])
      await db.query("insert into website_partner_listing_publications values($1,'published')", [id])
      assert.equal((await remove()).code, 'listing_must_be_withdrawn', 'a published partner row cannot be removed even if the status helper is stale')
      assert.equal((await db.query('select count(*)::int as count from website_partner_listing_publications where listing_id=$1', [id])).rows[0].count, 1)
      await db.query("update website_partner_listing_publications set status='unpublished' where listing_id=$1", [id])
      assert.equal((await db.query('select count(*)::int as n from rental_publication_attempts where private_listing_id=$1', [id])).rows[0].n, 8)
      for (const [state, resolved] of [['dispatching', false], ['uncertain', false], ['accepted', false]]) {
        const pending = (await addAttempt(state, resolved)).rows[0].record
        assert.equal((await remove()).code, 'listing_portal_request_pending')
        assert.equal(await exists(), true)
        assert.equal((await db.query('select count(*)::int as n from rental_publication_attempt_archives where attempt_id=$1', [pending.id])).rows[0].n, 0)
        assert.equal((await db.query('select status from website_partner_listing_publications where listing_id=$1', [id])).rows[0].status, 'unpublished')
        await db.query('delete from rental_publication_attempts where id=$1', [pending.id])
      }
      await assert.rejects(db.query('delete from private_listings where id=$1', [id]), /foreign key/)
      assert.equal((await remove()).deleted, true)
      assert.equal(await exists(), false)
      assert.equal((await db.query('select count(*)::int as count from website_partner_listing_publications where listing_id=$1', [id])).rows[0].count, 0, 'an unpublished website projection does not prevent permanent deletion')
      assert.equal((await remove()).mode, 'already_removed')
      for (const original of originalAttempts) {
        const saved = (await db.query('select * from rental_publication_attempt_archives where attempt_id=$1', [original.id])).rows[0]
        assert.deepEqual(saved.attempt_record, original, 'retain every field of the original portal attempt')
        assert.equal(saved.source_listing_id, id)
        assert.equal(saved.organisation_id, org)
        assert.equal(saved.listing_snapshot.title, 'Fixture home')
        assert.equal(saved.archived_by, agent)
      }
      assert.equal((await db.query('select count(*)::int as n from rental_publication_attempts where private_listing_id=$1', [id])).rows[0].n, 0)
    }
    await insert('rental')
    await setting('fixture.uid', '')
    await assert.rejects(remove(), /Authentication is required/)
    await setting('fixture.uid', other)
    await assert.rejects(remove(), /permission/)
    await setting('fixture.admin', 'true'); await setting('fixture.member', 'false')
    await assert.rejects(remove(), /permission/)
    await setting('fixture.member', 'true'); await setting('fixture.admin', 'false')
    await db.query('update private_listings set created_by=$1 where id=$2', [other,id])
    await db.query("insert into website_production_dark_launches(listing_id,status) values($1,'active')", [id])
    assert.equal((await remove()).code, 'website_launch_must_be_rolled_back')
    await db.query("update website_production_dark_launches set status='rolled_back'", [])
    await db.query('insert into fixture_linked_workflows values($1)', [id])
    const retainedAttempt = (await addAttempt()).rows[0].record
    await db.query("insert into website_partner_listing_publications values($1,'unpublished')", [id])
    await assert.rejects(remove(), /linked records/)
    assert.deepEqual((await db.query('select to_jsonb(rental_publication_attempts) as record from rental_publication_attempts where id=$1', [retainedAttempt.id])).rows[0].record, retainedAttempt, 'a real linked workflow rolls back release of completed attempts')
    assert.equal((await db.query('select count(*)::int as n from rental_publication_attempt_archives where attempt_id=$1', [retainedAttempt.id])).rows[0].n, 0, 'failed deletion cannot leave a partial archive')
    assert.equal(await exists(), true)
    assert.equal((await db.query('select count(*)::int as count from website_partner_listing_publications where listing_id=$1', [id])).rows[0].count, 1, 'a protected workflow failure rolls back the publication cleanup too')
    assert.equal((await db.query('select listing_id from website_production_dark_launches')).rows[0].listing_id, id)
    await db.query('delete from fixture_linked_workflows', [])
    assert.equal((await remove()).deleted, true)
    assert.equal((await db.query('select listing_id from website_production_dark_launches')).rows[0].listing_id, null)
    await insert('rental')
    await setting('fixture.admin', 'true')
    await db.query("insert into private_listings(id,organisation_id,assigned_agent_id) values($1,$2,$3)", [other,org,agent])
    await db.query("insert into website_partner_listing_publications values($1,'unpublished')", [other])
    assert.equal((await remove()).deleted, true)
    assert.equal((await db.query('select count(*)::int as count from website_partner_listing_publications where listing_id=$1', [other])).rows[0].count, 1, 'other listings and their website records are untouched')
    for (const [role, allowed] of [['anon', false], ['authenticated', true]]) {
      assert.equal((await db.query("select has_function_privilege($1,'public.delete_private_listing(uuid)','EXECUTE') as allowed", [role])).rows[0].allowed, allowed)
    }
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query("select has_table_privilege($1,'public.rental_publication_attempt_archives','SELECT') as allowed", [role])).rows[0].allowed, false)
      assert.equal((await db.query("select has_table_privilege($1,'public.rental_publication_attempt_archives','INSERT') as allowed", [role])).rows[0].allowed, false)
    }
    assert.equal((await db.query("select relrowsecurity as enabled from pg_class where oid='public.rental_publication_attempt_archives'::regclass")).rows[0].enabled, true)
    assert.equal((await db.query("select has_table_privilege('service_role','public.rental_publication_attempt_archives','UPDATE') as allowed")).rows[0].allowed, false)
    assert.equal((await db.query("select has_table_privilege('service_role','public.rental_publication_attempt_archives','DELETE') as allowed")).rows[0].allowed, false)
  } finally { await db.close() }
})
