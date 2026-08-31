import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  createProperty24ApiResponse,
  PROPERTY24_API_METHODS,
  PROPERTY24_API_ROUTES,
} from '../server/property24/index.js'

const listingId = '00000000-0000-4000-8000-000000000011'
const env = {
  PROPERTY24_API_INTERNAL_TOKEN: 'test-token',
  PROPERTY24_BASIC_AUTH_USERNAME: 'exdev-user',
  PROPERTY24_BASIC_AUTH_PASSWORD: 'exdev-password',
  PROPERTY24_SYNDICATION_ENABLED: 'true',
  PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED: 'true',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  PROPERTY24_ENVIRONMENT: 'exdev',
}

let buildArgs = null
let controlledArgs = null
const response = await createProperty24ApiResponse({
  method: 'POST',
  url: `/api/property24/rentals/${listingId}/publish`,
  headers: { authorization: 'Bearer test-token' },
  env,
  dependencies: {
    createSupabase: () => ({ name: 'supabase' }),
    createProperty24: () => ({ name: 'property24' }),
    resolvePublishConfig: async ({ config }) => ({
      ...config,
      listingId,
      agencyId: '31382',
      agentId: '77959',
      agentSourceReference: 'arch9-agent-1',
      suburbId: '5864',
      propertyTypeId: '4',
      expiryDate: '2026-12-31',
      syndicationEnabled: true,
      rentalLivePublishEnabled: true,
      property24ResolvedMapping: { source: 'property24_agent_mappings', property24AgentId: '77959' },
    }),
    buildRentalSubmitPlan: async (args) => {
      buildArgs = args
      return {
        canSubmit: true,
        dataBlockers: [],
        technicalBlockers: [],
        summary: { listingType: 'Rental', monthlyRent: 22000 },
        previewPayload: { listingType: 'Rental' },
        payload: { listingType: 'Rental', photos: [{ bytes: 'base64-image' }] },
      }
    },
    applyControlledPublish: async (args) => {
      controlledArgs = args
      return {
        ...args.report,
        status: 'SUBMITTED',
        safety: { property24ApiCalled: true, databaseWritten: true, listingPublished: true },
        databaseWrite: { listingNumber: '1001001', property24Reference: '1001001' },
        syncAttempt: { status: 'succeeded', idempotency_key: 'property24:exdev:create:test' },
      }
    },
  },
})

assert.equal(response.status, 200)
assert.equal(response.body.route, 'publishRentalListing')
assert.equal(response.body.status, 'SUBMITTED')
assert.equal(response.body.report.phase, 'property24-rental-publish-listing')
assert.equal(buildArgs.sandboxPayloadTestMode, false)
assert.equal(buildArgs.loadImageBytes, true)
assert.equal(buildArgs.convertImagesToJpeg, true)
assert.equal(controlledArgs.allowPublishWithoutMandate, false)
assert.equal(controlledArgs.config.agentId, '77959')

const disabled = await createProperty24ApiResponse({
  method: 'POST',
  url: `/api/property24/rentals/${listingId}/publish`,
  headers: { authorization: 'Bearer test-token' },
  env: { ...env, PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED: 'false' },
})
assert.equal(disabled.status, 400)
assert.ok(disabled.body.missingConfiguration.includes('PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED=true'))

assert.equal(PROPERTY24_API_ROUTES.publishRentalListing, '/api/property24/rentals/:listingId/publish')
assert.equal(PROPERTY24_API_METHODS.publishRentalListing, 'POST')
assert.equal(PROPERTY24_API_ROUTES.rentalStatus, '/api/property24/rentals/:listingId/status')
assert.equal(PROPERTY24_API_METHODS.withdrawRentalListing, 'POST')
assert.equal(PROPERTY24_API_METHODS.reconcileRentalListing, 'POST')
assert.match(fs.readFileSync(new URL('../api/property24/rentals/[listingId]/publish.js', import.meta.url), 'utf8'), /handleProperty24NodeRequest/)
assert.match(fs.readFileSync(new URL('../api/property24/rentals/[listingId]/preview.js', import.meta.url), 'utf8'), /handleProperty24NodeRequest/)
for (const routeFile of ['lifecycle.js', 'status.js', 'status-update.js', 'withdraw.js', 'reconcile.js']) {
  assert.match(fs.readFileSync(new URL(`../api/property24/rentals/[listingId]/${routeFile}`, import.meta.url), 'utf8'), /handleProperty24NodeRequest/)
}

const lifecycle = await createProperty24ApiResponse({
  method: 'GET',
  url: `/api/property24/rentals/${listingId}/status`,
  headers: { authorization: 'Bearer test-token' },
  env,
  dependencies: {
    createSupabase: () => ({ name: 'supabase' }),
    fetchListingStatus: async () => ({ lifecycle: { state: 'published', listingNumber: '1001001' } }),
  },
})
assert.equal(lifecycle.status, 200)
assert.equal(lifecycle.body.route, 'rentalStatus')
assert.equal(lifecycle.body.lifecycle.state, 'published')

console.log('rental Property24 publish API contract passed')
