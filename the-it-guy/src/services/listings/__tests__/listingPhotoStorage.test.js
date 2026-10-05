import assert from 'node:assert/strict'
import test from 'node:test'
import { refreshListingPhotoUrls } from '../listingPhotoStorage.js'
import { fetchArch9ListingForProperty24Preview } from '../../../../server/services/property24Arch9ListingPreviewService.js'
import { fetchArch9ListingForPrivatePropertyPreview } from '../../../../server/services/privatePropertyListingPreviewService.js'

const listingId = '11111111-1111-4111-8111-111111111111'
const path = `private-listings/${listingId}/gallery/photo.jpg`
const origin = 'https://fixture.supabase.co'
const expired = `${origin}/storage/v1/object/sign/documents/${path}?token=expired`
function fixture(response) {
  const calls = []
  const client = { supabaseUrl: origin, storage: { from(bucket) {
    return { async createSignedUrls(paths, expiry) {
      calls.push({ bucket, paths, expiry })
      return response || { data: paths.map((path) => ({ path, signedUrl: `${origin}/fresh/${path}` })) }
    } }
  } } }
  return { client, calls }
}

test('recovers a trusted legacy URL and renews from durable identity on every load', async () => {
  const { client, calls } = fixture()
  const rows = [{ listing_id: listingId, media_type: 'image', file_url: expired }]
  const first = await refreshListingPhotoUrls(client, rows, { strict: true })
  assert.equal(first[0].storage_bucket, 'documents')
  assert.equal(first[0].storage_path, path)
  assert.equal(first[0].file_url, `${origin}/fresh/${path}`)
  await refreshListingPhotoUrls(client, first, { strict: true })
  assert.equal(calls.length, 2)
  assert.equal(rows[0].file_url, expired)
})

test('keeps external images, videos and other listing namespaces unchanged', async () => {
  const { client, calls } = fixture()
  const rows = [
    { listing_id: listingId, media_type: 'image', file_url: expired.replace(origin, 'https://foreign.supabase.co') },
    { listing_id: listingId, media_type: 'image', file_url: `${origin}/storage/v1/object/sign/documents/private-listings/other/photo.jpg?token=old` },
    { listing_id: listingId, media_type: 'video', file_url: expired },
  ]
  assert.deepEqual(await refreshListingPhotoUrls(client, rows), rows)
  assert.equal(calls.length, 0)
})

test('does not fall back to expired or public links when access is denied', async () => {
  const { client } = fixture({ error: { message: 'denied' } })
  const rows = [{ listing_id: listingId, media_type: 'image', file_url: expired }]
  await assert.rejects(refreshListingPhotoUrls(client, rows, { strict: true }), /Unable to refresh/)
  const result = await refreshListingPhotoUrls(client, rows)
  assert.equal(result[0].file_url, '')
  assert.equal(result[0].mediaLoadError, 'Photo viewing link unavailable')
})

test('handles per-object signing failures and batches large galleries', async () => {
  const { client, calls } = fixture()
  const rows = Array.from({ length: 205 }, (_, index) => ({ listing_id: listingId, media_type: 'image',
    file_url: expired, storage_bucket: 'documents', storage_path: `${path}-${index}` }))
  await refreshListingPhotoUrls(client, rows, { strict: true })
  assert.deepEqual(calls.map((call) => call.paths.length), [100, 100, 5])
  const broken = fixture({ data: [{ path, error: 'missing' }] })
  await assert.rejects(refreshListingPhotoUrls(broken.client, [{ listing_id: listingId, media_type: 'image', file_url: expired }], { strict: true }), /Unable to refresh/)
})

test('both portal loaders refresh rental photos before mapping their payloads', async () => {
  const { client, calls } = fixture()
  client.from = (table) => {
    const data = table === 'private_listings' ? { id: listingId, listing_category: 'rental' }
      : table === 'listing_media' ? [{ listing_id: listingId, media_type: 'image', file_url: expired }] : null
    return {
      select() { return this }, eq() { return this }, order() { return this }, limit() { return this },
      async maybeSingle() { return { data } },
      then(resolve) { resolve({ data: data || [] }) },
    }
  }
  for (const load of [fetchArch9ListingForProperty24Preview, fetchArch9ListingForPrivatePropertyPreview]) {
    const bundle = await load({ client, listingId })
    assert.equal(bundle.media[0].file_url, `${origin}/fresh/${path}`)
  }
  assert.equal(calls.length, 2)
})
