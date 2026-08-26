import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PROPERTY24_API_ROUTES,
  buildProperty24ApiConfig,
  createProperty24ApiResponse,
} from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const baseEnv = {
  PROPERTY24_BASE_URL: 'https://api.exdev.property24-test.com',
  PROPERTY24_BASIC_AUTH_USERNAME: 'user@example.test',
  PROPERTY24_BASIC_AUTH_PASSWORD: 'secret',
  PROPERTY24_DEFAULT_AGENCY_ID: '31382',
  PROPERTY24_DEFAULT_AGENT_ID: '77959',
  PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE: 'ARCH9-AGENT-001',
  PROPERTY24_DEFAULT_SUBURB_ID: '5864',
  PROPERTY24_DEFAULT_PROPERTY_TYPE_ID: '4',
  PROPERTY24_DEFAULT_EXPIRY_DATE: '2026-12-31',
  PROPERTY24_API_INTERNAL_TOKEN: 'test-token',
  PROPERTY24_SYNDICATION_ENABLED: 'true',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}

const authHeaders = {
  host: 'app.arch9.co.za',
  authorization: 'Bearer test-token',
}

const fakePreview = {
  canSubmit: true,
  dataBlockers: [],
  technicalBlockers: [],
  summary: {
    listingNumber: 100314793,
    title: 'Test listing',
  },
  imageByteLoad: {
    summary: {
      loaded: 1,
    },
  },
  payload: {
    listingNumber: 100314793,
    status: 'Active',
    photos: [
      {
        bytes: 'RAW_IMAGE_BYTES_SHOULD_NOT_LEAK',
        mimeContentType: 'image/jpeg',
        caption: 'Front',
      },
    ],
  },
}

for (const path of [
  'server/property24/api.js',
  'api/property24/listings/[listingId]/preview.js',
  'api/property24/listings/[listingId]/publish.js',
  'api/property24/listings/[listingId]/status.js',
  'api/property24/listings/[listingId]/leads.js',
  'api/property24/leads/pull.js',
  'api/property24/reconciliation/run.js',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}

assert.equal(PROPERTY24_API_ROUTES.previewListing, '/api/property24/listings/:listingId/preview')
assert.equal(PROPERTY24_API_ROUTES.runReconciliation, '/api/property24/reconciliation/run')

const viteConfig = read('vite.config.js')
assert.match(viteConfig, /createProperty24ApiResponse/)
assert.match(viteConfig, /\/api\/property24/)

const options = await createProperty24ApiResponse({
  method: 'OPTIONS',
  url: '/api/property24/listings/abc/preview',
})
assert.equal(options.status, 204)

const missingToken = await createProperty24ApiResponse({
  method: 'GET',
  url: '/api/property24/listings/abc/status',
  env: { ...baseEnv, PROPERTY24_API_INTERNAL_TOKEN: '' },
})
assert.equal(missingToken.status, 503)
assert.equal(missingToken.body.error, 'property24_api_token_not_configured')

const unauthorized = await createProperty24ApiResponse({
  method: 'GET',
  url: '/api/property24/listings/abc/status',
  headers: { authorization: 'Bearer wrong' },
  env: { ...baseEnv, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
})
assert.equal(unauthorized.status, 401)

const wrongMethod = await createProperty24ApiResponse({
  method: 'GET',
  url: '/api/property24/listings/abc/preview',
  headers: authHeaders,
  env: baseEnv,
})
assert.equal(wrongMethod.status, 405)

let buildSubmitPlanArgs = null
const previewResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: '/listings/listing-123/preview',
  headers: authHeaders,
  body: JSON.stringify({ maxImages: 3 }),
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    resolvePublishConfig: async ({ config }) => config,
    buildSubmitPlan: async (args) => {
      buildSubmitPlanArgs = args
      return fakePreview
    },
  },
})
assert.equal(previewResponse.status, 200)
assert.equal(previewResponse.body.status, 'DRY_RUN_READY')
assert.equal(buildSubmitPlanArgs.listingId, 'listing-123')
assert.equal(buildSubmitPlanArgs.maxImages, 3)
assert.equal(buildSubmitPlanArgs.loadImageBytes, false)
assert.equal(previewResponse.body.report.redactedPayload.photos[0].bytes, undefined)
assert.equal(previewResponse.body.report.redactedPayload.photos[0].bytesLoaded, true)
assert.doesNotMatch(JSON.stringify(previewResponse.body), /RAW_IMAGE_BYTES_SHOULD_NOT_LEAK/)

const blockedPublish = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/listings/listing-123/publish',
  headers: authHeaders,
  env: { ...baseEnv, PROPERTY24_SYNDICATION_ENABLED: 'false' },
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    resolvePublishConfig: async ({ config }) => config,
  },
})
assert.equal(blockedPublish.status, 400)
assert.ok(blockedPublish.body.missingConfiguration.includes('PROPERTY24_SYNDICATION_ENABLED=true'))

let applyPublishArgs = null
let applyControlledPublishArgs = null
const publishResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/listings/listing-123/publish',
  headers: authHeaders,
  body: JSON.stringify({ listingNumber: '100314793' }),
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    createProperty24: () => ({ type: 'property24' }),
    resolvePublishConfig: async ({ config }) => config,
    buildSubmitPlan: async () => fakePreview,
    applyPublish: async (args) => {
      applyPublishArgs = args
      return args.report
    },
    applyControlledPublish: async (args) => {
      applyControlledPublishArgs = args
      return {
        ...args.report,
        status: 'SUBMITTED',
        safety: {
          property24ApiCalled: true,
          databaseWritten: true,
          listingPublished: true,
        },
        databaseWrite: {
          listingNumber: 100314793,
        },
      }
    },
  },
})
assert.equal(publishResponse.status, 200)
assert.equal(publishResponse.body.status, 'SUBMITTED')
assert.equal(applyPublishArgs, null)
assert.equal(applyControlledPublishArgs.config.listingNumber, '100314793')
assert.equal(applyControlledPublishArgs.allowPublishWithoutMandate, true)

const statusResponse = await createProperty24ApiResponse({
  method: 'GET',
  url: '/api/property24/listings/listing-123/status',
  headers: authHeaders,
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    fetchListingStatus: async ({ config }) => ({
      listingNumber: '100314793',
      environment: config.environment,
      listing: { id: config.listingId, property24_status: 'published' },
      sync: { listing_number: 100314793, is_on_portal: true },
    }),
  },
})
assert.equal(statusResponse.status, 200)
assert.equal(statusResponse.body.status.listing.property24_status, 'published')

let statusUpdateArgs = null
const statusUpdateResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/listings/listing-123/status-update',
  headers: authHeaders,
  body: JSON.stringify({ listingNumber: '100314793', status: 'Withdrawn' }),
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    createProperty24: () => ({ type: 'property24' }),
    resolvePublishConfig: async ({ config }) => config,
    applyStatusUpdate: async (args) => {
      statusUpdateArgs = args
      return {
        status: 'SUBMITTED',
        listingNumber: args.listingNumber,
        listingStatus: args.listingStatus,
      }
    },
  },
})
assert.equal(statusUpdateResponse.status, 200)
assert.equal(statusUpdateResponse.body.status, 'SUBMITTED')
assert.equal(statusUpdateArgs.listingNumber, '100314793')
assert.equal(statusUpdateArgs.listingStatus, 'Withdrawn')

const listingLeadsResponse = await createProperty24ApiResponse({
  method: 'GET',
  url: '/api/property24/listings/listing-123/leads?startDate=2026-08-01',
  headers: authHeaders,
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    createProperty24: () => ({ type: 'property24' }),
    fetchListingLeads: async ({ config }) => ({
      listingNumber: '100314793',
      summary: { count: 1 },
      startDate: config.startDate,
    }),
  },
})
assert.equal(listingLeadsResponse.status, 200)
assert.equal(listingLeadsResponse.body.leads.summary.count, 1)
assert.equal(listingLeadsResponse.body.leads.startDate, '2026-08-01')

const pullLeadsResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/leads/pull',
  headers: authHeaders,
  body: JSON.stringify({ after: '2026-08-20T00:00:00' }),
  env: baseEnv,
  dependencies: {
    createProperty24: () => ({ type: 'property24' }),
    fetchAllLeads: async ({ config }) => ({
      summary: { count: 2, nextAfter: config.after },
      data: [{ id: 1 }, { id: 2 }],
    }),
  },
})
assert.equal(pullLeadsResponse.status, 200)
assert.equal(pullLeadsResponse.body.leads.summary.count, 2)
assert.equal(pullLeadsResponse.body.leads.summary.nextAfter, '2026-08-20T00:00:00')

const reconciliationResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/reconciliation/run',
  headers: authHeaders,
  body: JSON.stringify({ includeLeads: true, includePortalChecks: true }),
  env: baseEnv,
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    createProperty24: () => ({ type: 'property24' }),
    runReconciliation: async ({ config }) => ({
      status: 'OK',
      includeLeads: config.includeLeads,
      includePortalChecks: config.includePortalChecks,
    }),
  },
})
assert.equal(reconciliationResponse.status, 200)
assert.equal(reconciliationResponse.body.route, 'runReconciliation')
assert.equal(reconciliationResponse.body.report.includeLeads, true)
assert.equal(reconciliationResponse.body.report.includePortalChecks, true)

const config = buildProperty24ApiConfig({
  env: baseEnv,
  requestUrl: new URL('https://app.arch9.co.za/api/property24/listings/listing-123/status?refresh=true'),
  route: { listingId: 'listing-123' },
})
assert.equal(config.refresh, true)
assert.equal(config.environment, 'exdev')

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['test:property24-api-layer'], 'node scripts/property24-api-layer.test.mjs')

console.log('Property24 API route layer contract passed')
