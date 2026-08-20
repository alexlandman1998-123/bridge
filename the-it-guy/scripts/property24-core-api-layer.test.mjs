import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24Client,
  createRedactedProperty24Payload,
  fetchProperty24ListingLeads,
  PROPERTY24_API_ROUTES,
  resolveProperty24Environment,
} from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

for (const path of [
  'server/property24/index.js',
  'server/property24/client.js',
  'server/property24/mapper.js',
  'server/property24/listingDataService.js',
  'server/property24/syncService.js',
  'server/property24/publishService.js',
  'server/property24/leadService.js',
  'server/property24/reconciliationService.js',
  'server/property24/apiContract.js',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}

const calls = []
const fakeFetch = async (url, options) => {
  calls.push({ url: String(url), options })
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: async () => ({ leads: [{ listingNumber: 123, contactName: 'Alex' }], nextAfter: '2026-08-20T10:00:00' }),
    text: async () => '',
  }
}

const client = createProperty24Client({
  baseUrl: 'https://api.exdev.property24-test.com',
  username: 'user@example.test',
  password: 'secret',
  fetchImpl: fakeFetch,
})
const leadResult = await fetchProperty24ListingLeads({
  property24: client,
  listingNumber: 100314793,
  startDate: '2026-08-01T00:00:00',
  endDate: '2026-08-20T00:00:00',
})

assert.equal(calls[0].url, 'https://api.exdev.property24-test.com/listing/v53/listings/100314793/leads?startDate=2026-08-01T00%3A00%3A00&endDate=2026-08-20T00%3A00%3A00')
assert.equal(leadResult.summary.count, 1)
assert.equal(leadResult.summary.nextAfter, '2026-08-20T10:00:00')

const redacted = createRedactedProperty24Payload({
  photos: [{ bytes: 'base64-image-data', mimeContentType: 'image/jpeg', caption: 'Front' }],
})
assert.equal(redacted.photos[0].bytes, undefined)
assert.equal(redacted.photos[0].bytesLoaded, true)
assert.equal(resolveProperty24Environment('https://api.exdev.property24-test.com'), 'exdev')
assert.equal(resolveProperty24Environment('https://api.property24.com'), 'production')
assert.equal(PROPERTY24_API_ROUTES.publishListing, '/api/property24/listings/:listingId/publish')
assert.equal(PROPERTY24_API_ROUTES.pullLeads, '/api/property24/leads/pull')
assert.equal(PROPERTY24_API_ROUTES.runReconciliation, '/api/property24/reconciliation/run')

const publishScript = read('scripts/property24-publish-listing.mjs')
assert.match(publishScript, /server\/property24/)

const clientSource = read('server/services/property24Client.js')
assert.match(clientSource, /fetchListingLeads/)
assert.match(clientSource, /fetchListingStatistics/)
assert.match(clientSource, /Array\.isArray/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['test:property24-core-api-layer'], 'node scripts/property24-core-api-layer.test.mjs')

console.log('Property24 core API layer contract passed')
