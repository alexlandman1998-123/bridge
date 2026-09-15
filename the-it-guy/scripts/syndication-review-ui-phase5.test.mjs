import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  PRIVATE_PROPERTY_API_ROUTES,
  createPrivatePropertyApiResponse,
} from '../server/private-property/index.js'

assert.equal(
  PRIVATE_PROPERTY_API_ROUTES.syndicationReview,
  '/api/private-property/listings/:listingId/syndication-review',
)

let fetchCalled = 0
let buildCalled = 0
const response = await createPrivatePropertyApiResponse({
  method: 'GET',
  url: '/api/private-property/listings/listing-1/syndication-review',
  headers: { host: 'app.arch9.co.za', authorization: 'Bearer internal-review-token' },
  env: {
    PRIVATE_PROPERTY_API_INTERNAL_TOKEN: 'internal-review-token',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  },
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    fetchSyndicationPreflightInput: async ({ listingId }) => {
      fetchCalled += 1
      assert.equal(listingId, 'listing-1')
      return { listing: { id: listingId, organisation_id: 'organisation-1' }, publication: {} }
    },
    buildSyndicationPreflight: (input) => {
      buildCalled += 1
      assert.equal(input.organisationId, 'organisation-1')
      return { overall: { status: 'partially_ready' }, channels: {} }
    },
  },
})

assert.equal(response.status, 200)
assert.equal(response.body.route, 'syndicationReview')
assert.equal(response.body.review.overall.status, 'partially_ready')
assert.equal(fetchCalled, 1)
assert.equal(buildCalled, 1)

const [modalSource, pageSource] = await Promise.all([
  readFile(new URL('../src/components/listings/SyndicationReviewModal.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
])

for (const expected of [
  'Review channel settings',
  'Private Property',
  'Property24',
  'Check Private Property readiness',
  'Check Property24 readiness',
]) {
  assert.ok(modalSource.includes(expected), `Expected review modal content: ${expected}`)
}

for (const expected of [
  "SyndicationReviewModal",
  "openSyndicationReview",
  "syndication-review",
  "Review channels",
]) {
  assert.ok(pageSource.includes(expected), `Expected listing review integration: ${expected}`)
}

console.log('Syndication review UI phase 5 contract passed')
