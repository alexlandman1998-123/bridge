import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildProperty24AgentLifecycleUpdatePayload,
  syncCanonicalProperty24AgentLifecycle,
} from '../server/property24/agentLifecycleService.js'
import {
  buildAgentDeactivationReadiness,
  reassignAgentListingsForOffboarding,
  resolveOffboardingListingType,
} from '../src/services/agentOffboardingService.js'

const IDS = Object.freeze({
  organisation: '11111111-1111-4111-8111-111111111111',
  sourceAgent: '22222222-2222-4222-8222-222222222222',
  targetAgent: '33333333-3333-4333-8333-333333333333',
  saleListing: '44444444-4444-4444-8444-444444444444',
  rentalListing: '55555555-5555-4555-8555-555555555555',
  mapping: '66666666-6666-4666-8666-666666666666',
})

function createSupabase(mappingRows = [], listingRows = []) {
  const rows = mappingRows.map((row) => ({ ...row }))
  const listings = listingRows.map((row) => ({ ...row }))
  return {
    rows,
    from(table) {
      assert.ok(['property24_agent_mappings', 'private_listings'].includes(table))
      const sourceRows = table === 'private_listings' ? listings : rows
      const filters = []
      let patch = null
      const query = {
        select() { return query },
        update(value) { patch = value; return query },
        eq(column, value) { filters.push([column, value]); return query },
        limit() { return query },
        maybeSingle() {
          let matches = sourceRows.filter((row) => filters.every(([column, value]) => row[column] === value))
          if (patch && matches[0]) Object.assign(matches[0], patch)
          matches = sourceRows.filter((row) => filters.every(([column, value]) => row[column] === value))
          return Promise.resolve({ data: matches[0] || null, error: null })
        },
        then(resolve, reject) {
          const matches = sourceRows.filter((row) => filters.every(([column, value]) => row[column] === value))
          return Promise.resolve({ data: matches, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
}

function createProperty24({ clearPhotoOnUpdate = false } = {}) {
  const agents = [{
    id: 77969,
    firstname: 'Jon',
    lastname: 'Snow',
    receiveStatsMail: false,
    published: true,
    agencyId: 31382,
    sourceReference: 'ARCH9-JON',
    mobileNumber: '0600001123',
    emailAddress: 'jon@example.com',
    countryId: 1,
    status: 'Active',
    jobTitle: 'Agent',
    about: '',
    isBroker: false,
    profilePicture: { bytes: Buffer.from('jon-photo').toString('base64') },
  }]
  const calls = []
  return {
    agents,
    calls,
    async fetchAgencyAgents(agencyId) {
      calls.push({ type: 'fetch', agencyId })
      return { status: 200, data: structuredClone(agents) }
    },
    async updateAgent(payload) {
      calls.push({ type: 'update', payload: structuredClone(payload) })
      const agent = agents.find((candidate) => candidate.id === payload.id)
      Object.assign(agent, payload)
      if (clearPhotoOnUpdate) agent.profilePicture = null
      return { status: 200, data: structuredClone(agent) }
    },
    async updateAgentProfilePicture(agentId, payload) {
      calls.push({ type: 'photo', agentId })
      const agent = agents.find((candidate) => candidate.id === agentId)
      agent.profilePicture = { bytes: payload.bytes }
      return { status: 200, data: agentId }
    },
  }
}

const payload = buildProperty24AgentLifecycleUpdatePayload(createProperty24().agents[0], 'inactive')
assert.equal(payload.status, 'Inactive')
assert.equal(payload.mobileNumber, '0600001123')
assert.equal(payload.emailAddress, 'jon@example.com')
assert.throws(
  () => buildProperty24AgentLifecycleUpdatePayload({ id: 1 }, 'inactive'),
  /payload is missing/i,
)

const mapping = {
  id: IDS.mapping,
  organisation_id: IDS.organisation,
  environment: 'exdev',
  agency_id: 31382,
  arch9_user_id: IDS.sourceAgent,
  property24_agent_id: 77969,
  source_reference: 'ARCH9-JON',
  status: 'active',
}
const supabase = createSupabase([mapping])
const property24 = createProperty24({ clearPhotoOnUpdate: true })
const lifecycle = await syncCanonicalProperty24AgentLifecycle({
  supabase,
  property24,
  organisationId: IDS.organisation,
  environment: 'exdev',
  agencyId: 31382,
  arch9UserId: IDS.sourceAgent,
  targetStatus: 'inactive',
})
assert.equal(lifecycle.status, 'INACTIVE')
assert.equal(lifecycle.changed, true)
assert.equal(lifecycle.photoRestored, true)
assert.equal(lifecycle.agent.status, 'inactive')
assert.equal(supabase.rows[0].status, 'inactive')
assert.equal(property24.agents[0].mobileNumber, '0600001123')
assert.equal(property24.agents[0].emailAddress, 'jon@example.com')
assert.equal(property24.calls.filter((call) => call.type === 'photo').length, 1)

const repeated = await syncCanonicalProperty24AgentLifecycle({
  supabase,
  property24,
  organisationId: IDS.organisation,
  environment: 'exdev',
  agencyId: 31382,
  arch9UserId: IDS.sourceAgent,
  targetStatus: 'inactive',
})
assert.equal(repeated.status, 'ALREADY_INACTIVE')
assert.equal(repeated.changed, false)
assert.equal(property24.calls.filter((call) => call.type === 'update').length, 1)

const unmappedProperty24 = createProperty24()
const unmapped = await syncCanonicalProperty24AgentLifecycle({
  supabase: createSupabase([]),
  property24: unmappedProperty24,
  organisationId: IDS.organisation,
  environment: 'exdev',
  agencyId: 31382,
  arch9UserId: IDS.sourceAgent,
  targetStatus: 'inactive',
})
assert.equal(unmapped.status, 'SKIPPED_NOT_MAPPED')
assert.equal(unmappedProperty24.calls.length, 0)

await assert.rejects(
  syncCanonicalProperty24AgentLifecycle({
    supabase: createSupabase([mapping], [{
      id: IDS.saleListing,
      organisation_id: IDS.organisation,
      assigned_agent_id: IDS.sourceAgent,
      listing_status: 'Active',
      listing_visibility: 'public',
      listing_reference: 'ARCH9-LISTING-1',
    }]),
    property24: createProperty24(),
    organisationId: IDS.organisation,
    environment: 'exdev',
    agencyId: 31382,
    arch9UserId: IDS.sourceAgent,
    targetStatus: 'inactive',
  }),
  (error) => error.code === 'agent_deactivation_listings_remaining',
)

assert.equal(resolveOffboardingListingType({ listing_category: 'private_sale' }), 'sale')
assert.equal(resolveOffboardingListingType({ listing_category: 'residential_rental' }), 'rental')
assert.equal(resolveOffboardingListingType({ seller_canonical_facts_json: { rentalInfo: { monthlyRent: 20_000 } } }), 'rental')

const reassignmentCalls = []
const listingReports = await reassignAgentListingsForOffboarding({
  listings: [
    { id: IDS.saleListing, listing_category: 'private_sale' },
    { id: IDS.rentalListing, listing_category: 'rental' },
    { id: IDS.saleListing, listing_category: 'private_sale' },
  ],
  destinationAgent: { userId: IDS.targetAgent },
  reassignListing: async (listingId, agentId, options) => {
    reassignmentCalls.push({ listingId, agentId, ...options })
    return { status: 'REASSIGNED' }
  },
})
assert.equal(listingReports.length, 2)
assert.deepEqual(reassignmentCalls, [
  { listingId: IDS.saleListing, agentId: IDS.targetAgent, listingType: 'sale' },
  { listingId: IDS.rentalListing, agentId: IDS.targetAgent, listingType: 'rental' },
])

assert.deepEqual(buildAgentDeactivationReadiness({ totalAssets: 0 }), {
  ready: true,
  blockers: [],
  totalBlockingAssets: 0,
})
const blocked = buildAgentDeactivationReadiness({ activeListings: 2, sellerLeads: 1 })
assert.equal(blocked.ready, false)
assert.equal(blocked.totalBlockingAssets, 3)

const offboardingSource = fs.readFileSync(new URL('../src/services/agentOffboardingService.js', import.meta.url), 'utf8')
assert.match(offboardingSource, /reassignAgentListingsForOffboarding/)
assert.doesNotMatch(offboardingSource, /updateRows\('private_listings'/)
const agentStatusRouteSource = fs.readFileSync(new URL('../api/property24/settings/agent-status.js', import.meta.url), 'utf8')
assert.match(agentStatusRouteSource, /auth\.getUser\(token\)/)
assert.match(agentStatusRouteSource, /hasManageSettingsRole/)

console.log('Property24 canonical agent lifecycle and offboarding tests passed.')
