import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { prepareProperty24ListingAgentReassignment, writePrivateListingAgentAssignment } from '../server/property24/listingAgentReassignmentService.js'
import { createProperty24ApiResponse } from '../server/property24/api.js'

test('database validates agency contacts, removes duplicates and preserves listing ownership', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.private_listings(id uuid primary key, organisation_id uuid, assigned_agent_id uuid, title text);
      create table public.organisation_users(id uuid primary key, organisation_id uuid, user_id uuid, role text, status text);`)
    await db.exec(await readFile(new URL('../../supabase/migrations/20261012180210_listing_additional_agents.sql', import.meta.url), 'utf8'))
    const organisation = randomUUID(), primary = randomUUID(), extra = randomUUID(), foreign = randomUUID(), inactive = randomUUID(), assistant = randomUUID(), listing = randomUUID()
    for (const [id, org, role, status] of [[primary, organisation, 'agent', 'active'], [extra, organisation, 'agent', 'active'], [foreign, randomUUID(), 'agent', 'active'], [inactive, organisation, 'agent', 'inactive'], [assistant, organisation, 'assistant', 'active']]) {
      await db.query('insert into organisation_users values($1,$2,$3,$4,$5)', [randomUUID(), org, id, role, status])
    }
    await db.query('insert into private_listings(id,organisation_id,assigned_agent_id,title) values($1,$2,$3,$4)', [listing, organisation, primary, 'Listing'])
    const save = (ids) => db.query('update private_listings set additional_agent_ids=$1 where id=$2 returning *', [ids, listing])
    const saved = (await save([extra, extra, primary])).rows[0]
    assert.deepEqual(saved.additional_agent_ids, [extra])
    assert.equal(saved.assigned_agent_id, primary)
    for (const invalid of [foreign, inactive, assistant, randomUUID(), null]) {
      await assert.rejects(save([invalid]), { code: '23514' })
    }
    assert.deepEqual((await db.query('select additional_agent_ids from private_listings')).rows[0].additional_agent_ids, [extra])
    await assert.rejects(db.query('update private_listings set organisation_id=$1 where id=$2', [randomUUID(), listing]), { code: '23514' })
    const promoted = (await db.query('update private_listings set assigned_agent_id=$1 where id=$2 returning *', [extra, listing])).rows[0]
    assert.deepEqual(promoted.additional_agent_ids, [])
    await save([primary])
    await db.query("update organisation_users set status='inactive' where user_id=$1", [primary])
    await db.query("update private_listings set title='Unrelated edit' where id=$1", [listing])
    await save([])
    await db.query('update private_listings set assigned_agent_id=null where id=$1', [listing])
    await assert.rejects(save([extra]), { code: '23514' })
    const permissions = (await db.query("select prosecdef, has_function_privilege('anon', oid, 'execute') anonymous from pg_proc where proname='validate_private_listing_contact_agents'")).rows[0]
    assert.equal(permissions.prosecdef, false)
    assert.equal(permissions.anonymous, false)
  } finally { await db.close() }
})

function fakeClient(tables) {
  return { from(table) {
    const filters = []
    let patch
    const rows = () => (tables[table] || []).filter((row) => filters.every((filter) => filter(row)))
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (column, value) => { filters.push((row) => Array.isArray(row[column]) ? `{${row[column].join(',')}}` === value : String(row[column]) === String(value)); return query },
      is: (column, value) => { filters.push((row) => (row[column] ?? null) === value); return query },
      in: (column, values) => { filters.push((row) => values.includes(row[column])); return query },
      update: (value) => { patch = value; return query },
      maybeSingle: async () => { const row = rows()[0]; if (row && patch) Object.assign(row, patch); return { data: row || null, error: null } },
      then: (resolve, reject) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    }
    return query
  } }
}

test('saving contacts checks membership and detects stale changes before writing', async () => {
  const primary = randomUUID(), extra = randomUUID(), organisation = randomUUID(), listingId = randomUUID()
  const tables = {
    private_listings: [{ id: listingId, organisation_id: organisation, assigned_agent_id: primary, additional_agent_ids: [], updated_at: '2026-10-12T12:00:00Z' }],
    organisation_users: [{ id: randomUUID(), user_id: primary, organisation_id: organisation, role: 'agent', status: 'active' }, { id: randomUUID(), user_id: extra, organisation_id: organisation, role: 'agent', status: 'active' }],
  }
  const supabase = fakeClient(tables)
  const prepare = (options = {}) => prepareProperty24ListingAgentReassignment({ supabase, listingId, targetAgentId: primary, additionalAgentIds: [extra], expectedAdditionalAgentIds: [], ...options })
  const plan = await prepare()
  assert.equal(plan.contactAgentsOnly, true)
  assert.equal(plan.requiresProperty24Sync, false)
  assert.equal(plan.changed, true)
  await assert.rejects(prepare({ expectedAdditionalAgentIds: [extra] }), { code: 'listing_assignment_changed' })
  await assert.rejects(prepare({ additionalAgentIds: 'invalid' }), { code: 'listing_contact_agent_invalid' })
  await assert.rejects(prepare({ targetAgentId: extra }), { code: 'listing_contact_agent_invalid' })
  const write = () => writePrivateListingAgentAssignment({ supabase, plan, assignedAgentId: primary, expectedCurrentAgentId: primary })
  tables.private_listings[0].updated_at = '2026-10-12T12:01:00Z'
  await assert.rejects(write(), { code: 'listing_assignment_changed' })
  tables.private_listings[0].updated_at = plan.expectedUpdatedAt
  const saved = await write()
  assert.deepEqual(saved.additional_agent_ids, [extra])
  assert.equal(saved.assigned_agent_id, primary)
  await assert.rejects(write(), { code: 'listing_assignment_changed' })
})

test('sale and rental API save contacts without sending an advert and reject stale retries', async () => {
  for (const route of ['listings', 'rentals']) {
    const primary = randomUUID(), extra = randomUUID(), organisation = randomUUID(), listingId = randomUUID()
    const tables = {
      private_listings: [{ id: listingId, organisation_id: organisation, assigned_agent_id: primary, additional_agent_ids: [], listing_category: route === 'rentals' ? 'private_rental' : 'private_sale' }],
      organisation_users: [{ id: randomUUID(), user_id: primary, organisation_id: organisation, role: 'agent', status: 'active' }, { id: randomUUID(), user_id: extra, organisation_id: organisation, role: 'agent', status: 'active' }],
    }
    let portalCalls = 0
    const request = (additionalAgentIds, expectedAdditionalAgentIds) => createProperty24ApiResponse({
      method: 'POST', url: `/api/property24/${route}/${listingId}/reassign-agent`, headers: { authorization: 'Bearer test-token' },
      body: JSON.stringify({ assignedAgentId: primary, additionalAgentIds, expectedAdditionalAgentIds }),
      env: { PROPERTY24_API_INTERNAL_TOKEN: 'test-token', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test', PROPERTY24_ENVIRONMENT: 'exdev' },
      dependencies: { createSupabase: () => fakeClient(tables), recordAgentReassignmentActivity: async () => ({ saved: true }), createProperty24: () => { portalCalls++; throw new Error('Unexpected portal call') } },
    })
    const saved = await request([extra], [])
    assert.equal(saved.status, 200)
    assert.equal(saved.body.portalUpdateRequired, true)
    assert.deepEqual(saved.body.listing.additional_agent_ids, [extra])
    assert.equal(saved.body.listing.assigned_agent_id, primary)
    assert.equal(portalCalls, 0)
    const unchanged = await request([extra], [extra])
    assert.equal(unchanged.body.status, 'UNCHANGED')
    assert.equal(unchanged.body.portalUpdateRequired, true)
    assert.equal((await request([], [])).status, 409)
    const removed = await request([], [extra])
    assert.equal(removed.status, 200)
    assert.deepEqual(removed.body.listing.additional_agent_ids, [])
  }
})
