import assert from 'node:assert/strict'
import { createProperty24ApiResponse } from '../server/property24/api.js'
import { buildListingAgentReassignmentPlan } from '../server/property24/listingAgentReassignmentService.js'

const IDS = Object.freeze({
  listing: '11111111-1111-4111-8111-111111111111',
  organisation: '22222222-2222-4222-8222-222222222222',
  previousAgent: '33333333-3333-4333-8333-333333333333',
  targetAgent: '44444444-4444-4444-8444-444444444444',
})

function makePlan(overrides = {}) {
  return {
    listingId: IDS.listing,
    organisationId: IDS.organisation,
    previousAgentId: IDS.previousAgent,
    targetAgentId: IDS.targetAgent,
    targetAgent: {
      userId: IDS.targetAgent,
      membershipId: '55555555-5555-4555-8555-555555555555',
      fullName: 'Pauly Shore',
      email: 'pauly@example.com',
      status: 'active',
    },
    listingType: 'sale',
    property24Reference: null,
    property24Status: 'not_published',
    requiresProperty24Sync: false,
    changed: true,
    ...overrides,
  }
}

function makeEnv(overrides = {}) {
  return {
    PROPERTY24_API_INTERNAL_TOKEN: 'test-token',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    PROPERTY24_BASE_URL: 'https://api.exdev.property24.com',
    PROPERTY24_ENVIRONMENT: 'exdev',
    PROPERTY24_BASIC_AUTH_USERNAME: 'username',
    PROPERTY24_BASIC_AUTH_PASSWORD: 'password',
    PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED: 'true',
    PROPERTY24_SYNDICATION_ENABLED: 'true',
    ...overrides,
  }
}

function makeRequest({ routeType = 'listings', dependencies = {}, env = makeEnv() } = {}) {
  return createProperty24ApiResponse({
    method: 'POST',
    url: `/api/property24/${routeType}/${IDS.listing}/reassign-agent`,
    headers: { authorization: 'Bearer test-token' },
    body: JSON.stringify({ assignedAgentId: IDS.targetAgent }),
    env,
    dependencies: {
      createSupabase: () => ({}),
      recordAgentReassignmentActivity: async () => ({ saved: true, warning: null }),
      ...dependencies,
    },
  })
}

{
  const plan = buildListingAgentReassignmentPlan({
    listing: {
      id: IDS.listing,
      organisation_id: IDS.organisation,
      assigned_agent_id: IDS.previousAgent,
      listing_category: 'private_rental',
      property24_reference: '100314819',
      property24_status: 'published',
    },
    targetAgent: {
      userId: IDS.targetAgent,
      membershipId: 'membership-1',
      fullName: 'Pauly Shore',
      email: 'PAULY@example.com',
      phone: '+27 82 000 0000',
      avatarUrl: 'https://example.com/pauly.jpg',
      status: 'active',
    },
  })
  assert.equal(plan.listingType, 'rental')
  assert.equal(plan.requiresProperty24Sync, true)
  assert.equal(plan.targetAgentId, IDS.targetAgent)
  assert.equal(plan.targetAgent.email, 'pauly@example.com')

  const closedPlan = buildListingAgentReassignmentPlan({
    listing: {
      id: IDS.listing,
      organisation_id: IDS.organisation,
      assigned_agent_id: IDS.previousAgent,
      listing_category: 'private_sale',
      property24_reference: '100314820',
      property24_status: 'withdrawn',
    },
    targetAgent: { userId: IDS.targetAgent, status: 'active' },
  })
  assert.equal(closedPlan.requiresProperty24Sync, false)
}

{
  const writes = []
  const response = await makeRequest({
    dependencies: {
      prepareListingAgentReassignment: async () => makePlan(),
      writeListingAgentAssignment: async (input) => {
        writes.push(input)
        return { id: IDS.listing, assigned_agent_id: input.assignedAgentId }
      },
    },
  })
  assert.equal(response.status, 200)
  assert.equal(response.body.status, 'COMPLETED')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].assignedAgentId, IDS.targetAgent)
  assert.equal(response.body.property24, null)
}

{
  const writes = []
  const liveRentalPlan = makePlan({
    listingType: 'rental',
    property24Reference: '100314819',
    property24Status: 'published',
    requiresProperty24Sync: true,
  })
  const response = await makeRequest({
    routeType: 'rentals',
    dependencies: {
      prepareListingAgentReassignment: async () => liveRentalPlan,
      resolveTargetAgentMapping: async () => ({
        agencyId: '31382',
        property24AgentId: '77970',
        sourceReference: 'ARCH9-PAULY',
      }),
      writeListingAgentAssignment: async (input) => {
        writes.push(input)
        return { id: IDS.listing, assigned_agent_id: input.assignedAgentId }
      },
      resolvePublishConfig: async ({ config }) => ({
        ...config,
        listingId: IDS.listing,
        syndicationEnabled: true,
        rentalLivePublishEnabled: true,
        agencyId: '31382',
        agentId: '77970',
        agentSourceReference: 'ARCH9-PAULY',
        suburbId: '1',
        property24ResolvedMapping: {
          arch9UserId: IDS.targetAgent,
          property24AgentId: '77970',
        },
      }),
      buildRentalSubmitPlan: async () => ({ canSubmit: true, payload: { listingNumber: 100314819 }, summary: {} }),
      createProperty24: () => ({}),
      applyControlledPublish: async () => ({ status: 'FAILED', error: { message: 'Property24 unavailable.' } }),
    },
  })
  assert.equal(response.status, 502)
  assert.equal(response.body.status, 'FAILED')
  assert.equal(response.body.rollbackApplied, true)
  assert.equal(writes.length, 2)
  assert.equal(writes[0].assignedAgentId, IDS.targetAgent)
  assert.equal(writes[1].assignedAgentId, IDS.previousAgent)
  assert.equal(writes[1].expectedCurrentAgentId, IDS.targetAgent)
}

{
  const writes = []
  const response = await makeRequest({
    dependencies: {
      prepareListingAgentReassignment: async () => makePlan({
        property24Reference: '100314820',
        property24Status: 'published',
        requiresProperty24Sync: true,
      }),
      resolveTargetAgentMapping: async () => ({
        agencyId: '31382',
        property24AgentId: '77970',
        sourceReference: 'ARCH9-PAULY',
      }),
      writeListingAgentAssignment: async (input) => {
        writes.push(input)
        return { id: IDS.listing, assigned_agent_id: input.assignedAgentId }
      },
      resolvePublishConfig: async ({ config }) => ({
        ...config,
        listingId: IDS.listing,
        syndicationEnabled: true,
        agencyId: '31382',
        agentId: '77970',
        agentSourceReference: 'ARCH9-PAULY',
        suburbId: '1',
        property24ResolvedMapping: {
          arch9UserId: IDS.targetAgent,
          property24AgentId: '77970',
        },
      }),
      buildSubmitPlan: async () => ({ canSubmit: true, payload: { listingNumber: 100314820 }, summary: {} }),
      createProperty24: () => ({}),
      applyControlledPublish: async () => ({ status: 'SUBMITTED', databaseWrite: { listingNumber: 100314820 } }),
    },
  })
  assert.equal(response.status, 200)
  assert.equal(response.body.status, 'COMPLETED')
  assert.equal(response.body.property24.status, 'SUBMITTED')
  assert.equal(writes.length, 1)
}

console.log('Property24 listing-agent reassignment tests passed.')

