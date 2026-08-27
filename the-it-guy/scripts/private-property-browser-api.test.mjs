import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_API_ROUTES,
  createPrivatePropertyApiResponse,
} from '../server/private-property/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const baseEnv = {
  PRIVATE_PROPERTY_API_INTERNAL_TOKEN: 'test-token',
  PRIVATE_PROPERTY_ENVIRONMENT: 'sandbox',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}

const authHeaders = {
  host: 'app.arch9.co.za',
  authorization: 'Bearer test-token',
}

for (const path of [
  'server/private-property/api.js',
  'api/private-property/listings/[listingId]/preview.js',
  'api/private-property/listings/[listingId]/publish.js',
  'api/private-property/listings/[listingId]/status.js',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}

assert.equal(PRIVATE_PROPERTY_API_ROUTES.previewListing, '/api/private-property/listings/:listingId/preview')
assert.equal(PRIVATE_PROPERTY_API_ROUTES.publishListing, '/api/private-property/listings/:listingId/publish')
assert.equal(PRIVATE_PROPERTY_API_ROUTES.listingStatus, '/api/private-property/listings/:listingId/status')

const viteConfig = read('vite.config.js')
assert.match(viteConfig, /createPrivatePropertyApiResponse/)
assert.match(viteConfig, /\/api\/private-property/)

const listingDetail = read('src/pages/AgentListingDetail.jsx')
assert.match(listingDetail, /PRIVATE_PROPERTY_LISTING_API_BASE_PATH/)
assert.match(listingDetail, /callPrivatePropertyListingAction/)
assert.match(listingDetail, /previewPrivatePropertyListing/)
assert.match(listingDetail, /publishPrivatePropertyListing/)
assert.match(listingDetail, /refreshPrivatePropertyListingStatus/)
assert.match(listingDetail, /Submitting to Private Property/)
assert.match(listingDetail, /Add manual link/)
assert.doesNotMatch(
  listingDetail,
  /name: 'Private Property'[\s\S]{0,900}onClick=\{\(\) => openExternalLinkPanel\(privatePropertyLink, 'Private Property'\)\}[\s\S]{0,120}<Send size=\{15\} \/>[\s\S]{0,80}Publish/,
)

const options = await createPrivatePropertyApiResponse({
  method: 'OPTIONS',
  url: '/api/private-property/listings/listing-123/preview',
})
assert.equal(options.status, 204)

const missingToken = await createPrivatePropertyApiResponse({
  method: 'GET',
  url: '/api/private-property/listings/listing-123/status',
  env: { ...baseEnv, PRIVATE_PROPERTY_API_INTERNAL_TOKEN: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
})
assert.equal(missingToken.status, 503)
assert.equal(missingToken.body.error, 'private_property_api_token_not_configured')

const wrongMethod = await createPrivatePropertyApiResponse({
  method: 'GET',
  url: '/api/private-property/listings/listing-123/preview',
  headers: authHeaders,
  env: baseEnv,
})
assert.equal(wrongMethod.status, 405)

let readinessArgs = null
const previewResponse = await createPrivatePropertyApiResponse({
  method: 'POST',
  url: '/api/private-property/listings/listing-123/preview',
  headers: authHeaders,
  body: JSON.stringify({ suburbId: '12345' }),
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    buildReadiness: async (args) => {
      readinessArgs = args
      return {
        status: 'READY',
        ready: true,
        blockers: [],
        warnings: [],
        preview: {
          canPreview: true,
          dataBlockers: [],
          technicalBlockers: [],
          summary: {
            listingId: args.listingId,
            propertyId: 'PP-BROWSER-001',
          },
          payloadPreview: {
            title: 'Browser test listing',
          },
        },
      }
    },
  },
})
assert.equal(previewResponse.status, 200)
assert.equal(previewResponse.body.ready, true)
assert.equal(previewResponse.body.preview.canSubmit, true)
assert.equal(readinessArgs.listingId, 'listing-123')
assert.equal(readinessArgs.overrides.suburbId, '12345')

let publishArgs = null
const publishResponse = await createPrivatePropertyApiResponse({
  method: 'POST',
  url: '/api/private-property/listings/listing-123/publish',
  headers: authHeaders,
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    runControlledPublish: async (args) => {
      publishArgs = args
      return {
        status: 'SUBMITTED',
        safety: {
          privatePropertyApiCalled: true,
          databaseWritten: true,
          listingPublished: true,
        },
        apiResponse: {
          privatePropertyReference: 'T2870999',
        },
        syncResult: {
          arch9Status: 'draft',
        },
      }
    },
  },
})
assert.equal(publishResponse.status, 200)
assert.equal(publishResponse.body.status, 'SUBMITTED')
assert.equal(publishArgs.apply, true)
assert.equal(publishArgs.recordSync, true)

let monitorArgs = null
const statusResponse = await createPrivatePropertyApiResponse({
  method: 'GET',
  url: '/api/private-property/listings/listing-123/status?recordSync=true',
  headers: authHeaders,
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    runPostSubmitMonitor: async (args) => {
      monitorArgs = args
      return {
        status: 'ACTIVATED',
        externalStatus: 'active',
        generatedAt: '2026-08-27T08:00:00.000Z',
        statusProbe: {
          privatePropertyRef: 'T2870999',
        },
        syncResult: {
          arch9Status: 'published',
        },
      }
    },
  },
})
assert.equal(statusResponse.status, 200)
assert.equal(statusResponse.body.status, 'ACTIVATED')
assert.equal(statusResponse.body.monitor.statusProbe.privatePropertyRef, 'T2870999')
assert.equal(monitorArgs.recordSync, true)

console.log('Private Property browser API contract passed')
