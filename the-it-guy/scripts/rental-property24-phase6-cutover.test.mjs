import assert from 'node:assert/strict'
import { buildRentalProperty24Phase6CutoverGate } from '../src/services/rentals/rentalProperty24Phase6CutoverModel.js'
import { evaluateProperty24RentalProductionPilotPolicy } from '../server/property24/rentalProductionPilotPolicy.js'
import { createProperty24ApiResponse } from '../server/property24/index.js'

const phase5 = { status: 'ACCEPTED_FOR_PHASE6' }
const production = {
  credentialsReady: true,
  environment: 'production',
  productionAccessAuditStatus: 'READY',
  agencyId: '31382',
  agencyAllowlist: ['31382'],
  approvalId: 'P24-RENTAL-PILOT-APPROVAL-1',
  pilotListingId: 'rental-pilot-1',
  requestedListingId: 'rental-pilot-1',
  rentalLivePublishEnabled: true,
}

const readyForPilot = buildRentalProperty24Phase6CutoverGate({ phase5, production })
assert.equal(readyForPilot.status, 'READY_FOR_SINGLE_APPROVED_PILOT')
assert.equal(readyForPilot.safety.productionActivatedByThisCheck, false)
assert.equal(readyForPilot.safety.portalCallsMade, false)

const completedPilot = buildRentalProperty24Phase6CutoverGate({
  phase5,
  production,
  pilot: {
    listingId: 'rental-pilot-1',
    status: 'SUBMITTED',
    listingNumber: '1001001',
    portalVisible: true,
    reconciliationStatus: 'OK',
    leadRoutingVerified: true,
    failureMonitoringVerified: true,
  },
})
assert.equal(completedPilot.status, 'PILOT_COMPLETE_EXPANSION_REQUIRES_APPROVAL')

const blockedWithoutPhase5 = buildRentalProperty24Phase6CutoverGate({ production })
assert.equal(blockedWithoutPhase5.status, 'PRODUCTION_CUTOVER_BLOCKED')
assert.ok(blockedWithoutPhase5.failedChecks.some((item) => item.key === 'phase5_acceptance'))

const exdevPolicy = evaluateProperty24RentalProductionPilotPolicy({ environment: 'exdev' })
assert.equal(exdevPolicy.allowed, true)
assert.equal(exdevPolicy.enforced, false)

const blockedProductionPolicy = evaluateProperty24RentalProductionPilotPolicy({
  environment: 'production', rentalLivePublishEnabled: true, agencyId: '31382', listingId: 'rental-pilot-1',
})
assert.equal(blockedProductionPolicy.allowed, false)
assert.ok(blockedProductionPolicy.blockers.includes('property24_rental_production_approval_required'))

const productionPolicy = evaluateProperty24RentalProductionPilotPolicy({
  environment: 'production',
  rentalLivePublishEnabled: true,
  rentalProductionApprovalId: 'P24-RENTAL-PILOT-APPROVAL-1',
  rentalProductionAgencyAllowlist: '31382',
  rentalProductionPilotListingId: 'rental-pilot-1',
  agencyId: '31382',
  listingId: 'rental-pilot-1',
})
assert.equal(productionPolicy.allowed, true)
assert.equal(productionPolicy.enforced, true)

const wrongListingPolicy = evaluateProperty24RentalProductionPilotPolicy({
  environment: 'production',
  rentalLivePublishEnabled: true,
  rentalProductionApprovalId: 'P24-RENTAL-PILOT-APPROVAL-1',
  rentalProductionAgencyAllowlist: ['31382'],
  rentalProductionPilotListingId: 'rental-pilot-1',
  agencyId: '31382',
  listingId: 'another-rental',
})
assert.equal(wrongListingPolicy.allowed, false)
assert.ok(wrongListingPolicy.blockers.includes('property24_rental_listing_not_selected_for_pilot'))

let publishPlanCalled = false
const blockedApiResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/rentals/rental-not-approved/publish',
  headers: { authorization: 'Bearer phase6-test-token' },
  body: JSON.stringify({}),
  env: {
    PROPERTY24_API_INTERNAL_TOKEN: 'phase6-test-token',
    PROPERTY24_ENVIRONMENT: 'production',
    PROPERTY24_PRODUCTION_BASE_URL: 'https://api.property24.com',
    PROPERTY24_PRODUCTION_BASIC_AUTH_USERNAME: 'production-user',
    PROPERTY24_PRODUCTION_BASIC_AUTH_PASSWORD: 'production-password',
    PROPERTY24_SYNDICATION_ENABLED: 'true',
    PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED: 'true',
    PROPERTY24_RENTAL_PRODUCTION_APPROVAL_ID: 'P24-RENTAL-PILOT-APPROVAL-1',
    PROPERTY24_RENTAL_PRODUCTION_AGENCY_ALLOWLIST: '31382',
    PROPERTY24_RENTAL_PRODUCTION_PILOT_LISTING_ID: 'rental-pilot-1',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  },
  dependencies: {
    createSupabase: () => ({}),
    resolvePublishConfig: async ({ config }) => ({ ...config, agencyId: '31382', agentId: '77', agentSourceReference: 'agent-77' }),
    buildRentalSubmitPlan: async () => {
      publishPlanCalled = true
      return null
    },
  },
})
assert.equal(blockedApiResponse.status, 409)
assert.equal(blockedApiResponse.body.error, 'rental_production_pilot_blocked')
assert.ok(blockedApiResponse.body.blockers.includes('property24_rental_listing_not_selected_for_pilot'))
assert.equal(publishPlanCalled, false)

console.log('Rental Property24 Phase 6 production cutover checks passed')
