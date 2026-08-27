import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createProperty24Client } from '../server/property24/client.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const calls = []
const fakeFetch = async (url, options) => {
  calls.push({ url: String(url), options })
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: () => 'application/json',
    },
    json: async () => ({ listingNumber: 123456, isOnPortal: true, reasons: [] }),
    text: async () => '',
  }
}

const client = createProperty24Client({
  baseUrl: 'https://api.exdev.property24-test.com',
  username: 'user@example.test',
  password: 'secret',
  fetchImpl: fakeFetch,
})
const result = await client.saveListing({
  agencyId: 31382,
  contactAgentIds: [77959],
  listingType: 'Sale',
  status: 'NewListing',
  price: 1234567,
  isPOA: false,
  photos: [
    {
      bytes: 'base64-image-data',
      mimeContentType: 'image/jpeg',
      isFloorPlan: false,
    },
  ],
})

assert.equal(result.status, 200)
assert.equal(calls[0].url, 'https://api.exdev.property24-test.com/listing/v53/listings')
assert.equal(calls[0].options.method, 'POST')
assert.equal(JSON.parse(calls[0].options.body).photos[0].bytes, 'base64-image-data')

const scriptSource = read('scripts/property24-publish-listing.mjs')
assert.match(scriptSource, /--apply/)
assert.match(scriptSource, /DRY_RUN/)
assert.match(scriptSource, /property24-publish-listing\.json/)
assert.match(scriptSource, /property24ApiCalled:\s*false/)
assert.match(scriptSource, /convertImagesToJpeg:\s*true/)
assert.match(scriptSource, /buildProperty24ListingSubmitPlan/)
assert.match(scriptSource, /applyProperty24ListingPublish/)
assert.doesNotMatch(scriptSource, /31382@arch9\.co\.za/i)

const previewServiceSource = read('server/services/property24Arch9ListingPreviewService.js')
assert.match(previewServiceSource, /import\('sharp'\)/)
assert.match(previewServiceSource, /sips/)
assert.match(previewServiceSource, /convertedToJpeg/)

const publishServiceSource = read('server/property24/publishService.js')
assert.match(publishServiceSource, /redactedPayload/)
assert.match(publishServiceSource, /includeSubmitPayload:\s*true/)
assert.match(publishServiceSource, /saveListing/)
assert.match(publishServiceSource, /recordProperty24ListingSync/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:publish-listing'], 'node scripts/property24-publish-listing.mjs')
assert.equal(packageJson.scripts['test:property24-publish-listing'], 'node scripts/property24-publish-listing.test.mjs')

console.log('Property24 publish listing contract passed')
