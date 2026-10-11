import test from 'node:test'
import assert from 'node:assert/strict'
import { photoDiagnostic } from '../../scripts/lib/listingPhotoDiagnostic.mjs'
import { categories } from '../../scripts/lib/listingDiagnosticCases.mjs'
import { listingPhotoFingerprint, resolveListingPhotoChange } from '../services/listingPhotoChangeService.js'
import { summarizePrivatePropertySyncPayload } from '../services/privatePropertyListingSyncService.js'

globalThis.fetch = async () => { throw new Error('Image downloads must not occur in unchanged-photo tests') }
for (const [category] of categories) for (const mode of ['sale', 'rental']) for (const channel of ['property24', 'private_property']) {
  test(`${category}/${mode}/${channel}: skip only confirmed photos; changed order, cover, replacement and removal resend`, async () => {
    const state = photoDiagnostic(category, mode, channel)
    const initial = await state.build({ photosChanged: false })
    assert.ok(state.photos(initial)?.length, 'A browser flag cannot skip an unconfirmed/new gallery')
    state.accept(initial)
    const original = structuredClone(state.fixture.media)
    // Large byte strings make the payload saving measurable; fingerprint them
    // before acceptance because these fixture bytes represent the actual source.
    const update = await state.build(channel === 'property24' ? { loadImageBytes: true } : {})
    assert.equal(state.photos(update), null)
    if (channel === 'property24') assert.equal(update.imageByteLoad.summary.requested, 0)
    const edits = [
      rows => rows.reverse(),
      rows => { rows[2].is_cover = true },
      rows => { rows[0].file_url = 'https://example.test/replaced.jpg' },
      rows => { rows[0].caption = 'New caption' },
      rows => rows.pop(),
      rows => rows.push({ ...rows[0], file_url: 'https://example.test/new.jpg' }),
    ]
    for (const edit of edits) {
      state.fixture.media = structuredClone(original); edit(state.fixture.media)
      assert.notEqual(state.photos(await state.build()), null, 'Changed gallery must be sent')
    }
    state.fixture.media = original
    const identityKey = channel === 'property24' ? 'listing_number' : 'property_id'
    const savedIdentity = state.sync[identityKey]
    state.sync[identityKey] = channel === 'property24' ? 7654321 : 'replacement-record'
    assert.ok(state.photos(await state.build())?.length, 'A replacement portal advert must receive photos')
    state.sync[identityKey] = savedIdentity
    state.sync.last_error = 'Photo processing failed'
    assert.ok(state.photos(await state.build())?.length)
    delete state.sync.last_error
    state.sync.environment = 'sandbox'
    assert.ok(state.photos(await state.build())?.length, 'A different environment is not evidence')
    state.sync = {}
    assert.ok(state.photos(await state.build())?.length, 'Legacy/missing receipts resend conservatively')
  })
}
test('immutable storage identity survives signing and save row IDs; changed objects do not', () => {
  const media = [{ id: 'old', media_type: 'image', storage_bucket: 'documents', storage_path: 'private-listings/id/unique-a.jpg', file_url: 'https://storage.test/a?token=old', updated_at: 'old' }]
  const scope = { channel: 'property24', environment: 'production' }
  const hash = listingPhotoFingerprint(media, scope)
  const newer = [{ ...media[0], id: 'new', file_url: 'https://storage.test/a?token=new', updated_at: 'new' }]
  assert.equal(listingPhotoFingerprint(newer, scope), hash)
  newer[0].storage_path = 'private-listings/id/unique-b.jpg'
  assert.notEqual(listingPhotoFingerprint(newer, scope), hash)
  assert.notEqual(listingPhotoFingerprint(media, { ...scope, channel: 'private_property' }), hash)
  assert.equal(resolveListingPhotoChange({ media, scope, existingSync: { last_payload_summary: { photoFingerprint: hash } }, identityMatches: true, force: true }).photosChanged, true)
})
test('Private Property sync sanitization retains the fingerprint of the submitted plan', () => {
  const summary = summarizePrivatePropertySyncPayload({ photoFingerprint: 'gallery-v1:abc', untrusted: 'ignored' })
  assert.equal(summary.photoFingerprint, 'gallery-v1:abc')
  assert.equal(summary.untrusted, undefined)
})
test('removing all photos cannot silently publish an empty deletion array', async () => {
  for (const mode of ['sale', 'rental']) for (const channel of ['property24', 'private_property']) {
    const state = photoDiagnostic('residential', mode, channel)
    state.accept(await state.build())
    state.fixture.media = []
    const plan = await state.build()
    assert.equal(channel === 'property24' ? plan.canSubmit : plan.canPreview, false)
    assert.ok(plan.dataBlockers.length)
  }
})

test('Property24 status polling preserves the last submitted gallery evidence', async () => {
  const { createProperty24ApiResponse, buildProperty24ApiConfig } = await import('../property24/api.js')
  assert.equal(buildProperty24ApiConfig({ env: {}, requestUrl: 'http://localhost/', payload: { photosChanged: 'auto' } }).photosChanged, 'auto')
  const state = photoDiagnostic('residential', 'sale', 'property24')
  state.accept(await state.build({ environment: 'exdev' }))
  state.sync.environment = 'exdev'
  const fingerprint = state.sync.last_payload_summary.photoFingerprint
  const client = { from(table) {
    let patch = {}
    const q = {
      select(){return q}, eq(){return q},
      upsert(value){state.sync = { ...state.sync, ...value }; return q},
      update(value){patch = value; return q},
      maybeSingle: async () => ({ data: table === 'property24_listing_syncs' ? state.sync : { ...state.fixture.listing, ...patch } }),
      single: async () => q.maybeSingle(),
      then: resolve => Promise.resolve({ data: [] }).then(resolve),
    }
    return q
  } }
  const response = await createProperty24ApiResponse({
    method: 'GET', url: '/api/property24/listings/fixture/status?refresh=true', headers: { authorization: 'Bearer fixture-token' },
    env: { PROPERTY24_API_INTERNAL_TOKEN: 'fixture-token', PROPERTY24_BASE_URL: 'https://api.exdev.property24-test.com',
      PROPERTY24_BASIC_AUTH_USERNAME: 'fixture', PROPERTY24_BASIC_AUTH_PASSWORD: 'fixture',
      SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'fixture' },
    dependencies: { createSupabase: () => client, createProperty24: () => ({ checkListingOnPortal: async () => ({ status: 200, data: true }) }) },
  })
  assert.equal(response.status, 200, JSON.stringify(response.body))
  assert.equal(state.sync.last_payload_summary.photoFingerprint, fingerprint)
  assert.equal(state.sync.last_payload_summary.photoListingNumber, '1234567')
  assert.equal(state.photos(await state.build({ environment: 'exdev', loadImageBytes: true })), null)
})
