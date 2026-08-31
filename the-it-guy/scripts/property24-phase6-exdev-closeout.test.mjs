import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  PROPERTY24_PHASE6,
  executeProperty24Phase6Closeout,
} from '../server/property24/phase6CloseoutService.js'
import {
  parseProperty24Phase6Args,
  runProperty24Phase6,
} from './property24-phase6-exdev-closeout.mjs'
import { PROPERTY24_EXDEV_BASE_URL } from '../server/services/property24Client.js'

function createAgent(definition, overrides = {}) {
  return {
    id: definition.agentId,
    firstname: definition.firstname,
    lastname: definition.lastname,
    receiveStatsMail: false,
    published: true,
    agencyId: PROPERTY24_PHASE6.agencyId,
    sourceReference: definition.sourceReference,
    mobileNumber: definition.key === 'jon' ? '0600001123' : '0600000002',
    emailAddress: `${definition.key}@example.test`,
    countryId: 1,
    status: 'Active',
    jobTitle: 'Agent',
    about: '',
    isBroker: false,
    profilePicture: { bytes: Buffer.from(`${definition.key}-photo`).toString('base64') },
    ...overrides,
  }
}

function createFakeProperty24({
  failListingNumber = null,
  wrongJonIdentity = false,
  clearProfileOnAgentUpdate = true,
  initialListingStatuses = {},
  initialAgentStatuses = {},
} = {}) {
  const statuses = new Map(PROPERTY24_PHASE6.listings.map((listing) => [
    listing.listingNumber,
    initialListingStatuses[listing.listingNumber] || 'Active',
  ]))
  const portals = new Map(PROPERTY24_PHASE6.listings.map((listing) => [
    listing.listingNumber,
    !['Rented', 'Sold'].includes(statuses.get(listing.listingNumber)),
  ]))
  const agents = PROPERTY24_PHASE6.agents.map((definition) => createAgent(definition, {
    status: initialAgentStatuses[definition.agentId] || 'Active',
    ...(wrongJonIdentity && definition.key === 'jon' ? { sourceReference: 'WRONG-JON' } : {}),
  }))
  const calls = []
  return {
    calls,
    statuses,
    portals,
    agents,
    async fetchAgencyAgents(agencyId) {
      assert.equal(agencyId, PROPERTY24_PHASE6.agencyId)
      calls.push({ type: 'read_agents' })
      return { status: 200, data: structuredClone(agents) }
    },
    async fetchListingReconciliation({ agencyId }) {
      assert.equal(agencyId, PROPERTY24_PHASE6.agencyId)
      calls.push({ type: 'read_reconciliation' })
      return {
        status: 200,
        data: PROPERTY24_PHASE6.listings.map((listing) => ({ listingNumber: listing.listingNumber, status: statuses.get(listing.listingNumber) })),
      }
    },
    async fetchListingUpdates(fromDate) {
      assert.ok(fromDate)
      calls.push({ type: 'read_updates' })
      return {
        status: 200,
        data: {
          listings: PROPERTY24_PHASE6.listings.map((listing) => ({
            listingNumber: listing.listingNumber,
            currentStatus: statuses.get(listing.listingNumber),
            isOnPortal: portals.get(listing.listingNumber),
            reasonType: 'Valid',
            comment: '',
          })),
        },
      }
    },
    async checkListingOnPortal(listingNumber) {
      calls.push({ type: 'read_portal', listingNumber })
      return { status: 200, data: portals.get(listingNumber) }
    },
    async updateListingStatus(listingNumber, listingStatus) {
      calls.push({ type: 'update_listing', listingNumber, listingStatus })
      if (listingNumber !== failListingNumber) {
        statuses.set(listingNumber, listingStatus)
        portals.set(listingNumber, false)
      }
      return { status: 200, data: listingNumber }
    },
    async updateAgent(payload) {
      for (const listing of PROPERTY24_PHASE6.listings) {
        assert.equal(statuses.get(listing.listingNumber), listing.targetStatus, 'Both listing statuses must be closed before agent deactivation.')
        assert.equal(portals.get(listing.listingNumber), false, 'Both listings must be off-portal before agent deactivation.')
      }
      calls.push({ type: 'update_agent', agentId: payload.id, status: payload.status })
      const agent = agents.find((candidate) => candidate.id === payload.id)
      assert.ok(agent)
      Object.assign(agent, structuredClone(payload))
      if (clearProfileOnAgentUpdate) delete agent.profilePicture
      return { status: 200, data: payload.id }
    },
    async updateAgentProfilePicture(agentId, payload) {
      calls.push({ type: 'update_photo', agentId })
      const agent = agents.find((candidate) => candidate.id === agentId)
      assert.ok(agent)
      agent.profilePicture = { bytes: payload.bytes }
      return { status: 200, data: agentId }
    },
  }
}

const fixedFromDate = '2026-08-30T00:00:00.000Z'
const noWait = async () => {}

assert.equal(parseProperty24Phase6Args([]).apply, false)
assert.equal(parseProperty24Phase6Args(['--apply']).apply, true)
assert.throws(() => parseProperty24Phase6Args(['--unknown']), /Unknown option/)
assert.deepEqual(PROPERTY24_PHASE6.listings.map((listing) => [listing.listingNumber, listing.targetStatus]), [
  [100314819, 'Rented'],
  [100314820, 'Sold'],
])

const dryRunProperty24 = createFakeProperty24()
const dryRun = await executeProperty24Phase6Closeout({
  property24: dryRunProperty24,
  apply: false,
  fromDate: fixedFromDate,
})
assert.equal(dryRun.status, 'PHASE6_DRY_RUN_READY')
assert.equal(dryRun.preflight.listings.rental.status, 'Active')
assert.equal(dryRun.preflight.listings.sale.status, 'Active')
assert.deepEqual(
  dryRunProperty24.calls.filter((call) => call.type.startsWith('update_')),
  [],
  'Dry-run must not make any Property24 writes.',
)

const applyProperty24 = createFakeProperty24()
const applied = await executeProperty24Phase6Closeout({
  property24: applyProperty24,
  apply: true,
  fromDate: fixedFromDate,
  wait: noWait,
})
assert.equal(applied.status, 'PHASE6_COMPLETE')
assert.equal(applied.final.listings.rental.status, 'Rented')
assert.equal(applied.final.listings.rental.isOnPortal, false)
assert.equal(applied.final.listings.sale.status, 'Sold')
assert.equal(applied.final.listings.sale.isOnPortal, false)
assert.equal(applied.final.agents.jon.status, 'Inactive')
assert.equal(applied.final.agents.pauly.status, 'Inactive')
assert.ok(applied.final.agents.jon.profilePictureSha256)
assert.ok(applied.final.agents.pauly.profilePictureSha256)

const writes = applyProperty24.calls.filter((call) => call.type.startsWith('update_'))
assert.deepEqual(writes, [
  { type: 'update_listing', listingNumber: 100314819, listingStatus: 'Rented' },
  { type: 'update_listing', listingNumber: 100314820, listingStatus: 'Sold' },
  { type: 'update_agent', agentId: 77969, status: 'Inactive' },
  { type: 'update_photo', agentId: 77969 },
  { type: 'update_agent', agentId: 77970, status: 'Inactive' },
  { type: 'update_photo', agentId: 77970 },
])
const allListingsVerified = applied.completed.findIndex((item) => item.step === 'verify_all_listings_closed')
assert.ok(allListingsVerified > -1)

const writeCountBeforeRerun = applyProperty24.calls.filter((call) => call.type.startsWith('update_')).length
const rerun = await executeProperty24Phase6Closeout({
  property24: applyProperty24,
  apply: true,
  fromDate: fixedFromDate,
  wait: noWait,
})
assert.equal(rerun.status, 'PHASE6_COMPLETE')
assert.equal(
  applyProperty24.calls.filter((call) => call.type.startsWith('update_')).length,
  writeCountBeforeRerun,
  'A completed Phase 6 rerun must be externally idempotent.',
)

const failedListingProperty24 = createFakeProperty24({ failListingNumber: 100314820 })
const failedListing = await executeProperty24Phase6Closeout({
  property24: failedListingProperty24,
  apply: true,
  fromDate: fixedFromDate,
  wait: noWait,
})
assert.equal(failedListing.status, 'PHASE6_PARTIAL_FAILURE')
assert.equal(failedListing.error.step, 'verify_sale_listing')
assert.equal(failedListingProperty24.calls.some((call) => call.type === 'update_agent'), false)
assert.match(failedListing.safety, /did not begin/)

const wrongIdentityProperty24 = createFakeProperty24({ wrongJonIdentity: true })
const wrongIdentity = await executeProperty24Phase6Closeout({
  property24: wrongIdentityProperty24,
  apply: true,
  fromDate: fixedFromDate,
  wait: noWait,
})
assert.equal(wrongIdentity.status, 'PHASE6_BLOCKED')
assert.equal(wrongIdentity.error.step, 'preflight')
assert.equal(wrongIdentityProperty24.calls.some((call) => call.type.startsWith('update_')), false)

const partialStart = createFakeProperty24({
  initialListingStatuses: { 100314819: 'Rented', 100314820: 'Active' },
  initialAgentStatuses: { 77969: 'Inactive' },
})
const partialStartReport = await executeProperty24Phase6Closeout({
  property24: partialStart,
  apply: true,
  fromDate: fixedFromDate,
  wait: noWait,
})
assert.equal(partialStartReport.status, 'PHASE6_COMPLETE')
assert.equal(partialStartReport.completed.some((item) => item.step === 'close_rental_listing' && item.status === 'ALREADY_CLOSED'), true)
assert.equal(partialStartReport.completed.some((item) => item.step === 'deactivate_jon' && item.status === 'ALREADY_INACTIVE'), true)

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'property24-phase6-closeout-'))
try {
  const outputPath = path.join(temporaryDirectory, 'phase6.json')
  const cliProperty24 = createFakeProperty24()
  const previousExitCode = process.exitCode
  process.exitCode = undefined
  const cli = await runProperty24Phase6([
    `--output=${outputPath}`,
  ], {
    property24: cliProperty24,
    config: { baseUrl: PROPERTY24_EXDEV_BASE_URL, missing: [] },
    fromDate: fixedFromDate,
    wait: noWait,
  })
  assert.equal(cli.report.status, 'PHASE6_DRY_RUN_READY')
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).status, 'PHASE6_DRY_RUN_READY')
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600)
  assert.equal(process.exitCode, undefined)
  process.exitCode = previousExitCode
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(packageJson.scripts['property24:phase6-exdev-closeout'], 'node scripts/property24-phase6-exdev-closeout.mjs')
assert.equal(packageJson.scripts['test:property24-phase6-exdev-closeout'], 'node scripts/property24-phase6-exdev-closeout.test.mjs')

console.log('Property24 Phase 6 XDev closeout tests passed')
