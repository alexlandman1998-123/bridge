import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  PHASE3,
  executePhase3Workflow,
  replaceLastFourTelephoneDigits,
} from './property24-phase3-exdev-agent-management.mjs'
import { PHASE2 } from './property24-phase2-exdev-listings.mjs'

function createAgent({ id, firstname, lastname, sourceReference, mobileNumber, emailAddress, photo }) {
  return {
    id,
    firstname,
    lastname,
    receiveStatsMail: false,
    published: true,
    agencyId: PHASE3.agencyId,
    sourceReference,
    mobileNumber,
    emailAddress,
    countryId: 1,
    status: 'Active',
    jobTitle: 'Agent',
    about: '',
    isBroker: false,
    profilePicture: { bytes: photo, mimeContentType: 'image/jpeg' },
  }
}

function createFakeProperty24({ applyReassignment = true, clearProfileOnAgentUpdate = true } = {}) {
  const agents = [
    createAgent({
      id: PHASE3.jon.agentId,
      firstname: PHASE3.jon.firstname,
      lastname: PHASE3.jon.lastname,
      sourceReference: PHASE3.jon.sourceReference,
      mobileNumber: '0600000001',
      emailAddress: 'jon.snow.p24@arch9.co.za',
      photo: Buffer.from('jon-photo').toString('base64'),
    }),
    createAgent({
      id: PHASE3.pauly.agentId,
      firstname: PHASE3.pauly.firstname,
      lastname: PHASE3.pauly.lastname,
      sourceReference: PHASE3.pauly.sourceReference,
      mobileNumber: '0600000002',
      emailAddress: 'pauly.shore.p24@arch9.co.za',
      photo: Buffer.from('old-pauly-photo').toString('base64'),
    }),
  ]
  const calls = []
  let listingOwner = PHASE3.jon.agentId

  return {
    calls,
    agents,
    get listingOwner() {
      return listingOwner
    },
    async fetchAgencyAgents(agencyId) {
      assert.equal(agencyId, PHASE3.agencyId)
      calls.push({ type: 'read_agents' })
      return { status: 200, data: structuredClone(agents) }
    },
    async fetchListingReconciliation({ agentId }) {
      calls.push({ type: 'read_reconciliation', agentId })
      return {
        status: 200,
        data: listingOwner === agentId
          ? [{ listingNumber: PHASE3.listingNumber, status: 'Active' }]
          : [],
      }
    },
    async checkListingOnPortal(listingNumber) {
      assert.equal(listingNumber, PHASE3.listingNumber)
      calls.push({ type: 'read_portal' })
      return { status: 200, data: true }
    },
    async updateAgent(payload) {
      calls.push({ type: 'update_agent', agentId: payload.id, status: payload.status, mobileNumber: payload.mobileNumber })
      const agent = agents.find((item) => item.id === payload.id)
      assert.ok(agent)
      Object.assign(agent, structuredClone(payload))
      if (clearProfileOnAgentUpdate) delete agent.profilePicture
      return { status: 200, data: payload.id }
    },
    async updateAgentProfilePicture(agentId, payload) {
      calls.push({ type: 'update_photo', agentId })
      const agent = agents.find((item) => item.id === agentId)
      assert.ok(agent)
      agent.profilePicture = { bytes: payload.bytes, mimeContentType: 'image/jpeg' }
      return { status: 200, data: agentId }
    },
    async saveListing(payload) {
      calls.push({
        type: 'save_listing',
        listingNumber: payload.listingNumber,
        contactAgentIds: payload.contactAgentIds,
        photos: payload.photos,
      })
      assert.equal(payload.listingNumber, PHASE3.listingNumber)
      assert.deepEqual(payload.contactAgentIds, [PHASE3.pauly.agentId])
      assert.equal(payload.photos, null)
      if (applyReassignment) listingOwner = PHASE3.pauly.agentId
      return { status: 200, data: PHASE3.listingNumber }
    },
  }
}

const photo = {
  payload: { bytes: Buffer.from('new-pauly-photo').toString('base64') },
  summary: {
    sourceName: 'synthetic-pauly.jpg',
    outputMimeType: 'image/jpeg',
    outputWidth: 800,
    outputHeight: 800,
    outputBytes: 15,
  },
}

function hashPhotoBytes(bytes) {
  return crypto.createHash('sha256').update(Buffer.from(bytes, 'base64')).digest('hex')
}

function createOperationState(overrides = {}) {
  return {
    version: 1,
    agencyId: PHASE3.agencyId,
    paulyAgentId: PHASE3.pauly.agentId,
    profilePicture: {
      sourceSha256: hashPhotoBytes(photo.payload.bytes),
      baselineRemoteSha256: crypto.createHash('sha256').update('old-pauly-photo').digest('hex'),
      confirmedRemoteSha256: null,
      ...overrides,
    },
  }
}

function createSaleState(definition = PHASE2.sale) {
  return {
    definition: { ...definition, status: 'NewListing' },
    state: {
      version: 1,
      agencyId: PHASE3.agencyId,
      listings: {},
    },
  }
}

assert.equal(replaceLastFourTelephoneDigits('0600000001'), '0600001123')
assert.equal(replaceLastFourTelephoneDigits('+27 82 555 0101'), '+27 82 555 1123')
assert.throws(() => replaceLastFourTelephoneDigits('123'), /at least four digits/)

const dryRunProperty24 = createFakeProperty24()
const dryRun = await executePhase3Workflow({
  property24: dryRunProperty24,
  photo,
  apply: false,
  loadSale: async () => createSaleState(),
  persistSale: async () => assert.fail('Dry-run must not persist listing state.'),
  loadOperationState: async () => createOperationState(),
  persistOperationState: async () => assert.fail('Dry-run must not persist Phase 3 state.'),
})
assert.equal(dryRun.status, 'PHASE3_DRY_RUN_READY')
assert.equal(dryRun.preflight.actions.telephone.to, '0600001123')
assert.equal(dryRun.preflight.actions.listingReassignment.payload.photos, null)
assert.deepEqual(
  dryRunProperty24.calls.filter((call) => ['update_agent', 'update_photo', 'save_listing'].includes(call.type)),
  [],
)

const applyProperty24 = createFakeProperty24()
let persisted = null
let persistedOperationState = null
const applyReport = await executePhase3Workflow({
  property24: applyProperty24,
  photo,
  apply: true,
  loadSale: async () => createSaleState(),
  persistSale: async (value) => {
    persisted = value
  },
  loadOperationState: async () => createOperationState(),
  persistOperationState: async (value) => {
    persistedOperationState = value
  },
  wait: async () => {},
})
assert.equal(applyReport.status, 'PHASE3_COMPLETE')
assert.equal(applyProperty24.listingOwner, PHASE3.pauly.agentId)
assert.equal(persisted.definition.agentId, PHASE3.pauly.agentId)
assert.equal(persisted.status, 'Active')
assert.equal(persistedOperationState.profilePicture.sourceSha256, hashPhotoBytes(photo.payload.bytes))
assert.notEqual(persistedOperationState.profilePicture.confirmedRemoteSha256, persistedOperationState.profilePicture.baselineRemoteSha256)
assert.deepEqual(
  applyProperty24.calls.filter((call) => ['update_agent', 'update_photo', 'save_listing'].includes(call.type)),
  [
    { type: 'update_agent', agentId: PHASE3.jon.agentId, status: 'Active', mobileNumber: '0600001123' },
    { type: 'update_photo', agentId: PHASE3.jon.agentId },
    { type: 'update_photo', agentId: PHASE3.pauly.agentId },
    { type: 'save_listing', listingNumber: PHASE3.listingNumber, contactAgentIds: [PHASE3.pauly.agentId], photos: null },
    { type: 'update_agent', agentId: PHASE3.jon.agentId, status: 'Inactive', mobileNumber: '0600001123' },
    { type: 'update_photo', agentId: PHASE3.jon.agentId },
  ],
)
assert.equal(applyReport.final.jon.mobileNumber, '0600001123')
assert.equal(applyReport.final.jon.status, 'Inactive')
assert.equal(applyReport.final.assignment.jonHasListing, false)
assert.equal(applyReport.final.assignment.paulyHasListing, true)
assert.equal(applyReport.final.assignment.isOnPortal, true)

const writesBeforeRerun = applyProperty24.calls.filter((call) => ['update_agent', 'update_photo', 'save_listing'].includes(call.type)).length
const rerun = await executePhase3Workflow({
  property24: applyProperty24,
  photo,
  apply: true,
  loadSale: async () => createSaleState({
    ...PHASE2.sale,
    agentId: PHASE3.pauly.agentId,
    agentSourceReference: PHASE3.pauly.sourceReference,
    agentName: 'Pauly Shore',
  }),
  persistSale: async () => {},
  loadOperationState: async () => persistedOperationState,
  persistOperationState: async () => {},
  wait: async () => {},
})
assert.equal(rerun.status, 'PHASE3_COMPLETE')
assert.equal(
  applyProperty24.calls.filter((call) => ['update_agent', 'update_photo', 'save_listing'].includes(call.type)).length,
  writesBeforeRerun,
  'A completed Phase 3 rerun must be externally idempotent.',
)

const failedReassignmentProperty24 = createFakeProperty24({ applyReassignment: false })
const failedReassignment = await executePhase3Workflow({
  property24: failedReassignmentProperty24,
  photo,
  apply: true,
  loadSale: async () => createSaleState(),
  persistSale: async () => {},
  loadOperationState: async () => createOperationState(),
  persistOperationState: async () => {},
  wait: async () => {},
})
assert.equal(failedReassignment.status, 'PHASE3_PARTIAL_FAILURE')
assert.equal(failedReassignment.error.step, 'verify_listing_reassignment')
assert.equal(
  failedReassignmentProperty24.calls.some((call) => call.type === 'update_agent' && call.status === 'Inactive'),
  false,
  'Jon must never be deactivated before listing reassignment is verified.',
)

console.log('Property24 Phase 3 ExDev agent management contract passed')
