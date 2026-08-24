import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24ApiResponse,
  PROPERTY24_API_METHODS,
  PROPERTY24_API_ROUTES,
} from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

let rentalPreviewArgs = null
let rentalResolverCalled = false
const rentalPreviewResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/rentals/00000000-0000-4000-8000-000000000010/preview',
  headers: { authorization: 'Bearer test-token' },
  body: JSON.stringify({}),
  env: {
    PROPERTY24_API_INTERNAL_TOKEN: 'test-token',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    PROPERTY24_ENVIRONMENT: 'exdev',
  },
  dependencies: {
    createSupabase: () => ({}),
    resolvePublishConfig: async ({ config }) => {
      rentalResolverCalled = true
      assert.equal(config.listingId, '00000000-0000-4000-8000-000000000010')
      return {
        ...config,
        listingId: config.listingId,
        agencyId: '31382',
        agentId: '',
        agentSourceReference: '',
        environment: 'exdev',
        property24ResolvedMapping: { source: 'none' },
      }
    },
    buildRentalSubmitPlan: async (args) => {
      rentalPreviewArgs = args
      assert.equal(args.suburbId, '')
      assert.equal(args.propertyTypeId, '')
      return {
        phase: 'property24-rental-listing-backend-preview',
        safety: {
          property24ApiCalled: false,
          databaseWritten: false,
          listingPublished: false,
        },
        canPreview: true,
        canSubmit: false,
        dataBlockers: [],
        technicalBlockers: ['sandbox_property24_agent_id_required_before_submit'],
        summary: {
          listingType: 'Rental',
          agencyId: Number(args.agencyId),
          contactAgentIds: [],
          sandboxPayloadTestMode: args.sandboxPayloadTestMode,
          backendAdapterPreviewOnly: true,
        },
        imageByteLoad: null,
        previewPayload: {
          agencyId: Number(args.agencyId),
          contactAgentIds: [],
          listingType: 'Rental',
          price: 22000,
          occupationDate: '2026-09-01T00:00:00.000Z',
          rentalInfo: {
            rentalRate: 'Month',
            depositRequirementsComments: 'Equal to deposit amount R44000',
            leasePeriod: '12 Months',
          },
          photos: [],
        },
        payload: null,
      }
    },
  },
})

assert.equal(rentalResolverCalled, true)
assert.equal(rentalPreviewResponse.status, 200)
assert.equal(rentalPreviewResponse.body.route, 'previewRentalListing')
assert.equal(rentalPreviewResponse.body.status, 'BLOCKED')
assert.equal(rentalPreviewResponse.body.mapping.source, 'none')
assert.equal(rentalPreviewArgs.sandboxPayloadTestMode, true)
assert.equal(rentalPreviewResponse.body.preview.summary.listingType, 'Rental')
assert.equal(rentalPreviewResponse.body.preview.summary.agencyId, 31382)
assert.deepEqual(rentalPreviewResponse.body.preview.summary.contactAgentIds, [])
assert.deepEqual(rentalPreviewResponse.body.preview.technicalBlockers, ['sandbox_property24_agent_id_required_before_submit'])
assert.equal(rentalPreviewResponse.body.report.safety.property24ApiCalled, false)
assert.equal(rentalPreviewResponse.body.report.safety.databaseWritten, false)
assert.equal(rentalPreviewResponse.body.report.safety.listingPublished, false)
assert.equal(rentalPreviewResponse.body.report.redactedPreviewPayload.listingType, 'Rental')
assert.equal(rentalPreviewResponse.body.report.redactedPreviewPayload.rentalInfo.rentalRate, 'Month')
assert.equal(rentalPreviewResponse.body.report.redactedPayload, null)

const wrongMethodResponse = await createProperty24ApiResponse({
  method: 'GET',
  url: '/api/property24/rentals/00000000-0000-4000-8000-000000000010/preview',
  headers: { authorization: 'Bearer test-token' },
  env: {
    PROPERTY24_API_INTERNAL_TOKEN: 'test-token',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  },
})

assert.equal(wrongMethodResponse.status, 405)
assert.equal(wrongMethodResponse.body.error, 'method_not_allowed')
assert.match(wrongMethodResponse.body.message, /previewRentalListing only supports POST/)

assert.equal(PROPERTY24_API_ROUTES.previewRentalListing, '/api/property24/rentals/:listingId/preview')
assert.equal(PROPERTY24_API_METHODS.previewRentalListing, 'POST')

const apiSource = read('server/property24/api.js')
assert.match(apiSource, /previewRentalListing/)
assert.match(apiSource, /buildRentalSubmitPlan/)
assert.match(apiSource, /rentals/)
assert.match(apiSource, /PROPERTY24_DEFAULT_AGENCY_ID or agencyId/)

console.log('Rental Property24 API preview route contract passed')
