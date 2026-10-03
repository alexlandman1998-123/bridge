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
  'api/private-property/listings/[listingId]/status-update.js',
  'api/private-property/listings/[listingId]/syndication-review.js',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}

assert.equal(PRIVATE_PROPERTY_API_ROUTES.previewListing, '/api/private-property/listings/:listingId/preview')
assert.equal(PRIVATE_PROPERTY_API_ROUTES.publishListing, '/api/private-property/listings/:listingId/publish')
assert.equal(PRIVATE_PROPERTY_API_ROUTES.listingStatus, '/api/private-property/listings/:listingId/status')
assert.equal(PRIVATE_PROPERTY_API_ROUTES.updateListingStatus, '/api/private-property/listings/:listingId/status-update')
assert.equal(PRIVATE_PROPERTY_API_ROUTES.syndicationReview, '/api/private-property/listings/:listingId/syndication-review')

const viteConfig = read('vite.config.js')
assert.match(viteConfig, /createPrivatePropertyApiResponse/)
assert.match(viteConfig, /\/api\/private-property/)

const listingDetail = read('src/pages/AgentListingDetail.jsx')
assert.match(listingDetail, /PRIVATE_PROPERTY_LISTING_API_BASE_PATH/)
assert.match(listingDetail, /callPrivatePropertyListingAction/)
assert.match(listingDetail, /previewPrivatePropertyListing/)
assert.match(listingDetail, /publishPrivatePropertyListing/)
assert.match(listingDetail, /refreshPrivatePropertyListingStatus/)
assert.match(listingDetail, /expirePrivatePropertyListing/)
assert.match(listingDetail, /Submitting to Private Property/)
assert.match(listingDetail, /Add (?:manual|live) link/)
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

let statusUpdateArgs = null
const statusUpdateResponse = await createPrivatePropertyApiResponse({
  method: 'POST',
  url: '/api/private-property/listings/listing-123/status-update',
  headers: authHeaders,
  body: JSON.stringify({ propertyStatus: 'Inactive' }),
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    updateListingStatus: async (args) => {
      statusUpdateArgs = args
      return { status: 'UPDATED', propertyStatus: args.propertyStatus }
    },
  },
})
assert.equal(statusUpdateResponse.status, 200)
assert.equal(statusUpdateResponse.body.update.status, 'UPDATED')
assert.equal(statusUpdateArgs.propertyStatus, 'Inactive')

let reactivationArgs
const reactivationResponse = await createPrivatePropertyApiResponse({
  method: 'POST', url: '/api/private-property/listings/listing-123/status-update', headers: authHeaders, env: baseEnv,
  body: JSON.stringify({ environment: 'production', propertyStatus: 'ForSale', confirm: 'PRIVATE_PROPERTY_REACTIVATE:listing-123:production' }),
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    updateListingStatus: async (args) => { reactivationArgs = args; return { status: 'NOT_CONFIRMED', confirmed: false, externalStatus: 'inactive' } },
  },
})
assert.equal(reactivationResponse.status, 200)
assert.equal(reactivationResponse.body.update.confirmed, false, 'HTTP acceptance must not become confirmed activation')
assert.equal(reactivationArgs.confirmation, 'PRIVATE_PROPERTY_REACTIVATE:listing-123:production')
assert.equal(reactivationArgs.environment, 'production')



let monitorCalls = 0
const cachedQueries = []
const storedResponse = await createPrivatePropertyApiResponse({
  method: 'GET', url: '/api/private-property/listings/listing-123/status?cached=true&environment=production',
  headers: authHeaders, env: baseEnv,
  dependencies: {
    createSupabase: () => ({ from(table) {
      cachedQueries.push(['table', table])
      return { select(columns) { cachedQueries.push(['select', columns]); return this }, eq(column, value) { cachedQueries.push([column, value]); return this },
        async maybeSingle() { return { data: { external_status: 'inactive', is_on_portal: false, private_property_ref: 'T5641227', last_checked_at: '2026-10-03T11:32:00Z' }, error: null } } }
    } }),
    runPostSubmitMonitor: async () => { monitorCalls++; throw new Error('cached status must not call PP or write database') },
  },
})
assert.equal(storedResponse.status, 200)
assert.equal(storedResponse.body.monitor.externalStatus, 'inactive')
assert.equal(storedResponse.body.monitor.generatedAt, '2026-10-03T11:32:00Z')
assert.equal(storedResponse.body.monitor.safety.databaseWritten, false)
assert.equal(monitorCalls, 0)
assert.ok(cachedQueries.some(([key, value]) => key === 'environment' && value === 'production'))
assert.ok(cachedQueries.some(([key, value]) => key === 'private_listing_id' && value === 'listing-123'))
assert.doesNotMatch(JSON.stringify(storedResponse.body), /service-role|test-token/)

console.log('Private Property browser API contract passed')
