import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { insertRentalListingOnce, serializeRentalCreationDraft } from '../rentalListingCreationRecovery.js'

const id = '11111111-1111-4111-8111-111111111111'
const actor = '22222222-2222-4222-8222-222222222222'
const org = '33333333-3333-4333-8333-333333333333'
const payload = { organisation_id: org, assigned_agent_id: actor, created_by: actor,
  listing_category: 'rental', listing_status: 'seller_lead', listing_visibility: 'internal', title: 'Original rental' }

async function fixture() {
  const db = new PGlite()
  await db.exec(`create role authenticated; create table private_listings(id uuid primary key,organisation_id uuid,assigned_agent_id uuid,created_by uuid,branch_id uuid,
    listing_category text,listing_status text,listing_visibility text,title text,originating_crm_lead_id uuid,created_at timestamptz default now());
    alter table private_listings enable row level security; grant select,insert on private_listings to authenticated;
    create policy read_listing on private_listings for select to authenticated using(organisation_id='${org}');
    create policy create_listing on private_listings for insert to authenticated with check(organisation_id='${org}' and created_by='${actor}'); set role authenticated;`)
  const state = { inserts: 0, loseResponse: false, failRead: false }
  const client = { from(table) {
    assert.equal(table, 'private_listings')
    const filters = []
    let row
    return {
      select() { return this }, eq(key, value) { filters.push([key, '=', value]); return this },
      neq(key, value) { filters.push([key, '<>', value]); return this }, order() { return this }, limit() { return this },
      insert(value) { row = value; return this },
      async maybeSingle() {
        if (state.failRead) return { error: new Error('Read unavailable') }
        const query = await db.query(`select * from private_listings where ${filters.map(([key, op], index) => `${key}${op}$${index + 1}`).join(' and ')}`, filters.map(([, , value]) => value))
        return { data: query.rows[0] || null }
      },
      async single() {
        state.inserts += 1
        try {
          const keys = Object.keys(row)
          const query = await db.query(`insert into private_listings(${keys.join(',')}) values(${keys.map((_, index) => `$${index + 1}`).join(',')}) returning *`, Object.values(row))
          if (state.loseResponse) throw new Error('Response lost after commit')
          return { data: query.rows[0] }
        } catch (error) { return { error } }
      },
    }
  } }
  return { db, client, state }
}

test('reconciles a lost insert response and never overwrites the accepted rental on retry', async () => {
  const { db, client, state } = await fixture()
  try {
    state.loseResponse = true
    const first = await insertRentalListingOnce(client, payload, id, actor)
    assert.equal(first.data.id, id)
    assert.equal(first.existing, true)
    const retry = await insertRentalListingOnce(client, { ...payload, title: 'Stale browser draft' }, id, actor)
    assert.equal(retry.data.title, 'Original rental')
    assert.equal(state.inserts, 1)
    assert.equal((await db.query('select count(*)::int as count from private_listings')).rows[0].count, 1)
  } finally { await db.close() }
})

test('simultaneous retries use the database primary key to produce one rental', async () => {
  const { db, client } = await fixture()
  try {
    const results = await Promise.all([insertRentalListingOnce(client, payload, id, actor), insertRentalListingOnce(client, payload, id, actor)])
    assert.deepEqual(results.map(result => result.data.id), [id, id])
    assert.equal((await db.query('select count(*)::int as count from private_listings')).rows[0].count, 1)
  } finally { await db.close() }
})

test('blocks unavailable reads, invalid identities and cross-workspace recovery without replacing records', async () => {
  const { db, client, state } = await fixture()
  try {
    state.failRead = true
    await assert.rejects(insertRentalListingOnce(client, payload, id, actor), /Read unavailable/)
    assert.equal(state.inserts, 0)
    state.failRead = false
    await assert.rejects(insertRentalListingOnce(client, payload, 'bad-id', actor), /identity/)
    await insertRentalListingOnce(client, payload, id, actor)
    await assert.rejects(insertRentalListingOnce(client, { ...payload, organisation_id: actor }, id, actor), /unavailable in this workspace/)
    assert.equal(state.inserts, 1)
  } finally { await db.close() }
})

test('retains uploaded photo identity while excluding browser-only URLs and file bytes', () => {
  const draft = serializeRentalCreationDraft({ galleryImages: [
    { id: 'saved', url: 'https://photo.test/image', path: 'stored/path', bucket: 'documents', file: { secretBytes: true } },
    { id: 'pending', url: 'blob:temporary', file: { secretBytes: true } },
  ], coverImageId: 'pending' }, { creationId: id, activeStep: 'review' })
  assert.equal(draft.creationId, id)
  assert.equal(draft.missingPhotoCount, 1)
  assert.equal(draft.form.galleryImages.length, 1)
  assert.equal(draft.form.galleryImages[0].file, undefined)
  assert.equal(draft.form.coverImageId, 'saved')
})
