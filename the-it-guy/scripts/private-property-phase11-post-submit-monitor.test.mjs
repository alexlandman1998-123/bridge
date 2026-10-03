import { runPrivatePropertyEventReconciliation } from '../server/services/privatePropertyEventReconciliationService.js'
import { createRecoveryPortal } from './fixtures/private-property-recovery.mjs'
import { updatePrivatePropertyListingStatus } from '../server/services/privatePropertyListingStatusUpdateService.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_POST_SUBMIT_MONITOR_SERVICE_VERSION,
  parsePrivatePropertyPostSubmitEvents,
  runPrivatePropertyPostSubmitMonitor,
} from '../server/services/privatePropertyPostSubmitMonitorService.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

class FakeQuery {
  constructor(rows = [], table = '', operations = []) {
    this.rows = rows
    this.table = table
    this.operations = operations
    this.filters = []
    this.limitCount = null
    this.write = null
  }

  select() {
    return this
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  in(column, values) { this.filters.push({ type: 'in', column, values }); return this }

  is(column, value) {
    this.filters.push({ type: 'is', column, value })
    return this
  }

  order() {
    return this
  }

  limit(count) {
    this.limitCount = count
    return this
  }

  upsert(payload, options = {}) {
    this.write = { type: 'upsert', payload, options }
    this.operations.push({ table: this.table, type: 'upsert', payload, options })
    return this
  }

  update(payload) {
    this.write = { type: 'update', payload }
    this.operations.push({ table: this.table, type: 'update', payload })
    return this
  }

  applyFilters() {
    let rows = this.rows.filter((row) => this.filters.every((filter) => {
      if (filter.type === 'in') return filter.values.includes(row[filter.column])
      if (filter.type === 'is') return (row[filter.column] ?? null) === filter.value
      return String(row[filter.column] ?? '') === String(filter.value ?? '')
    }))
    if (this.limitCount) rows = rows.slice(0, this.limitCount)
    return rows
  }

  maybeSingle() {
    return Promise.resolve({ data: this.applyFilters()[0] || null, error: null })
  }

  single() {
    if (!this.write) return this.maybeSingle()
    const existing = this.applyFilters()[0] || {}
    return Promise.resolve({
      data: {
        id: existing.id || `fake-${this.table}-id`,
        ...existing,
        ...this.write.payload,
      },
      error: null,
    })
  }

  then(resolve, reject) {
    return Promise.resolve({ data: this.applyFilters(), error: null }).then(resolve, reject)
  }
}

function createFakeClient(tables = {}) {
  const operations = []
  return {
    operations,
    from(table) {
      return new FakeQuery(tables[table] || [], table, operations)
    },
  }
}

const organisationId = '00000000-0000-4000-8000-000000000001'
const branchId = '00000000-0000-4000-8000-000000000002'
const listingId = '00000000-0000-4000-8000-000000000003'
const arch9UserId = '00000000-0000-4000-8000-000000000004'
const agencyConfigId = '00000000-0000-4000-8000-000000000010'
const propertyId = 'PP-MONITOR-001'
const branchGuid = '22222222-2222-4222-8222-222222222222'

const listing = {
  id: listingId,
  organisation_id: organisationId,
  branch_id: branchId,
  assigned_agent_id: arch9UserId,
  assigned_agent_email: 'agent@arch9.test',
  listing_reference: propertyId,
  title: 'Private Property monitor listing',
  street_name: 'Monitor Road',
  street_number: '12',
  suburb: 'Sandton',
  city: 'Johannesburg',
  province: 'Gauteng',
  asking_price: 2500000,
  listing_status: 'active',
  property_type: 'House',
  created_at: '2026-08-26T08:00:00.000Z',
}

const publication = {
  listing_id: listingId,
  title: 'Private Property monitor listing',
  description: 'A controlled listing payload ready for Private Property monitoring.',
  listing_type: 'Sale',
  property_type: 'House',
  asking_price: 2500000,
  bedrooms: 3,
  bathrooms: 2,
  garages: 1,
  erf_size: 500,
  floor_size: 180,
}

const media = [
  { listing_id: listingId, media_type: 'image', file_url: 'https://cdn.arch9.test/one.jpg', sort_order: 1 },
  { listing_id: listingId, media_type: 'image', file_url: 'https://cdn.arch9.test/two.jpg', sort_order: 2 },
  { listing_id: listingId, media_type: 'image', file_url: 'https://cdn.arch9.test/three.jpg', sort_order: 3 },
]

const agencyConfig = {
  id: agencyConfigId,
  organisation_id: organisationId,
  branch_id: branchId,
  environment: 'sandbox',
  vendor_name: 'Arch9',
  branch_guid: branchGuid,
  username_secret_name: 'PRIVATE_PROPERTY_SANDBOX_USERNAME',
  password_secret_name: 'PRIVATE_PROPERTY_SANDBOX_PASSWORD',
  base_url: 'https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx',
  enabled: true,
  status: 'sandbox_ready',
}

const agentMapping = {
  id: '00000000-0000-4000-8000-000000000020',
  agency_config_id: agencyConfigId,
  organisation_id: organisationId,
  branch_id: branchId,
  arch9_user_id: arch9UserId,
  environment: 'sandbox',
  private_property_agent_id: 'ARCH9-SANDBOX-USER-1',
  source_reference: 'ARCH9-SANDBOX-USER-1',
  email_snapshot: 'agent@arch9.test',
  status: 'active',
}

function createTables() {
  return {
    private_listings: [listing],
    listing_publication_data: [publication],
    listing_media: media,
    private_property_listing_syncs: [],
    private_property_agency_configs: [agencyConfig],
    private_property_agent_mappings: [agentMapping],
  }
}

function response(data, method) {
  return {
    status: 200,
    durationMs: 10,
    data,
    summary: {
      method,
      responseChars: data.length,
      resultText: '',
      continuationKey: method === 'GetListingEventFeedByBranch' ? 'cursor-2' : '',
      listingEventCount: method === 'GetListingEventFeedByBranch' ? 1 : 0,
    },
  }
}

function createPortal({ active = false, failedEvent = false } = {}) {
  const calls = []
  return {
    calls,
    async getListingStatus(input) {
      calls.push(['GetListingStatus', input])
      const status = active ? 'For Sale' : failedEvent ? 'Error' : 'Processing'
      return response(`<GetListingStatusResult>${status}</GetListingStatusResult>`, 'GetListingStatus')
    },
    async getListingStatusVerbose(input) {
      calls.push(['GetListingStatusVerbose', input])
      const status = active ? 'For Sale' : failedEvent ? 'Error' : 'Processing'
      return response(`<GetListingStatusVerboseResult>${status}</GetListingStatusVerboseResult>`, 'GetListingStatusVerbose')
    },
    async getReferenceNumberByListing(input) {
      calls.push(['GetReferenceNumberByListing', input])
      return response('<GetReferenceNumberByListingResult>T2870287</GetReferenceNumberByListingResult>', 'GetReferenceNumberByListing')
    },
    async getActiveListings(input) {
      calls.push(['GetActiveListings', input])
      const activeXml = active
        ? `<ActiveListing><ListingType>Sale Listing</ListingType><PrivatePropertyRef>T2870287</PrivatePropertyRef><UniqueId>${propertyId}</UniqueId></ActiveListing>`
        : ''
      return response(`<GetActiveListingsResult>${activeXml}</GetActiveListingsResult>`, 'GetActiveListings')
    },
    async getListingEventFeedByBranch(input) {
      calls.push(['GetListingEventFeedByBranch', input])
      const eventType = failedEvent ? 'ErrorDownloadingImages' : active ? 'Activated' : 'ImagesDownloading'
      const eventStatus = failedEvent ? 'Failed' : active ? 'Active' : 'Pending'
      return response(`<GetListingEventFeedByBranchResult><ContinuationKey>cursor-2</ContinuationKey><ListingEventFeedData><ListingFeedEventType>${eventType}</ListingFeedEventType><PropertyId>${propertyId}</PropertyId><PrivatePropertyRef>T2870287</PrivatePropertyRef><EventDescription>${eventType} T2870287</EventDescription><ListingFeedEventStatus>${eventStatus}</ListingFeedEventStatus><EventDate>2026-08-26T09:00:00Z</EventDate></ListingEventFeedData></GetListingEventFeedByBranchResult>`, 'GetListingEventFeedByBranch')
    },
  }
}

const parsedEvents = parsePrivatePropertyPostSubmitEvents('<LisitngEventFeedData><TimeStamp>2026-08-26T09:00:00Z</TimeStamp><ListingFeedRef>PP-MONITOR-001</ListingFeedRef><ListingFeedEventType>Activated</ListingFeedEventType><EventDescription>T2870287</EventDescription><ListingFeedEventStatus>Active</ListingFeedEventStatus></LisitngEventFeedData>')
assert.equal(parsedEvents[0].propertyId, propertyId)
assert.equal(parsedEvents[0].privatePropertyRef, 'T2870287')
assert.equal(parsedEvents[0].eventStatus, 'Active')

const secrets = {
  PRIVATE_PROPERTY_SANDBOX_USERNAME: 'Arch9User',
  PRIVATE_PROPERTY_SANDBOX_PASSWORD: 'private-property-password',
}

const pendingPortal = createPortal({ active: false })
const pendingClient = createFakeClient(createTables())
const pending = await runPrivatePropertyPostSubmitMonitor({
  client: pendingClient,
  listingId,
  environment: 'sandbox',
  secrets,
  overrides: { suburbId: '12345' },
  privateProperty: pendingPortal,
  continuationKey: '0',
})
assert.equal(pending.version, PRIVATE_PROPERTY_POST_SUBMIT_MONITOR_SERVICE_VERSION)
assert.equal(pending.status, 'PENDING')
assert.equal(pending.safety.privatePropertyApiCalled, true)
assert.equal(pending.safety.databaseWritten, false)
assert.equal(pending.propertyId, propertyId)
assert.equal(pending.eventFeed.continuationKey, 'cursor-2')
assert.equal(pending.eventFeed.matchCount, 1)
assert.equal(pendingPortal.calls.length, 5)
assert.deepEqual(pendingClient.operations, [])

const activePortal = createPortal({ active: true })
const activeClient = createFakeClient(createTables())
const active = await runPrivatePropertyPostSubmitMonitor({
  client: activeClient,
  listingId,
  environment: 'sandbox',
  secrets,
  overrides: { suburbId: '12345' },
  privateProperty: activePortal,
  continuationKey: 'cursor-1',
  recordSync: true,
})
assert.equal(active.status, 'ACTIVATED')
assert.equal(active.externalStatus, 'active')
assert.equal(active.safety.databaseWritten, true)
assert.equal(active.statusProbe.privatePropertyRef, 'T2870287')
assert.ok(activeClient.operations.some((operation) => operation.table === 'private_property_listing_syncs' && operation.type === 'upsert'))
assert.ok(activeClient.operations.some((operation) => operation.table === 'private_listings' && operation.type === 'update'))

const failed = await runPrivatePropertyPostSubmitMonitor({
  client: createFakeClient(createTables()),
  listingId,
  environment: 'sandbox',
  secrets,
  overrides: { suburbId: '12345' },
  privateProperty: createPortal({ failedEvent: true }),
})
assert.equal(failed.status, 'ATTENTION_REQUIRED')
assert.ok(failed.blockers.includes('private_property_listing_event_failed'))

const blocked = await runPrivatePropertyPostSubmitMonitor({
  client: createFakeClient(createTables()),
  listingId,
  environment: 'sandbox',
  secrets: {},
  overrides: { suburbId: '12345' },
  privateProperty: createPortal({ active: true }),
})
assert.equal(blocked.status, 'BLOCKED')
assert.equal(blocked.safety.privatePropertyApiCalled, false)
assert.ok(blocked.blockers.includes('missing_runtime_secret:PRIVATE_PROPERTY_SANDBOX_USERNAME'))

const inactivePortal = createPortal({ active: true })
inactivePortal.getListingStatus = async () => response('<GetListingStatusResult>Inactive</GetListingStatusResult>', 'GetListingStatus')
inactivePortal.getListingStatusVerbose = async () => response('<GetListingStatusVerboseResult>Inactive</GetListingStatusVerboseResult>', 'GetListingStatusVerbose')
const inactiveClient = createFakeClient(createTables())
const inactive = await runPrivatePropertyPostSubmitMonitor({
  client: inactiveClient, listingId, secrets, privateProperty: inactivePortal, recordSync: true,
})
assert.equal(inactive.status, 'ATTENTION_REQUIRED')
assert.equal(inactive.externalStatus, 'inactive')
assert.ok(inactive.blockers.includes('private_property_listing_inactive'))
const inactiveWrite = inactiveClient.operations.find((o) => o.table === 'private_property_listing_syncs').payload
assert.equal(inactiveWrite.is_on_portal, false, 'stale active-list membership cannot override a current inactive probe')
assert.equal(Object.hasOwn(inactiveWrite, 'last_payload_summary'), false)
assert.equal(Object.hasOwn(inactiveWrite, 'submitted_at'), false)
assert.equal(Object.hasOwn(inactiveWrite, 'activated_at'), false)

const missingListingFields = createFakeClient({ ...createTables(), listing_publication_data: [{ ...publication, bathrooms: null }] })
const stillMonitorable = await runPrivatePropertyPostSubmitMonitor({ client: missingListingFields, listingId, secrets, privateProperty: inactivePortal })
assert.equal(stillMonitorable.externalStatus, 'inactive', 'monitoring must work when a listing currently cannot be submitted')

const sortedPortal = createPortal()
sortedPortal.getListingEventFeedByBranch = async () => response(`<GetListingEventFeedByBranchResult>
<ListingEventFeedData><PropertyId>${propertyId}</PropertyId><ListingFeedEventType>Activated</ListingFeedEventType><EventDate>2026-08-25T00:00:00Z</EventDate></ListingEventFeedData>
<ListingEventFeedData><PropertyId>${propertyId}</PropertyId><ListingFeedEventType>Deactivated</ListingFeedEventType><EventDate>2026-08-26T00:00:00Z</EventDate></ListingEventFeedData>
</GetListingEventFeedByBranchResult>`, 'GetListingEventFeedByBranch')
const sorted = await runPrivatePropertyPostSubmitMonitor({ client: createFakeClient(createTables()), listingId, secrets, privateProperty: sortedPortal })
assert.equal(sorted.eventFeed.latestEvent.listingFeedEventType, 'Deactivated')

const statusTables = { ...createTables(), private_property_listing_syncs: [{
  private_listing_id: listingId, environment: 'sandbox', property_id: propertyId, branch_guid: branchGuid,
  listing_type: 'Sale', private_property_ref: 'T2870287',
}] }
const activationClient = createFakeClient(statusTables)
const recoveryAddress = { streetName: 'Monitor Road', streetNumber: '12', suburbId: 12345, suburb: 'Sandton', town: 'Johannesburg', province: 'Gauteng' }
const reactivationPortal = createRecoveryPortal({ propertyId, address: recoveryAddress })
const activation = await updatePrivatePropertyListingStatus({
  client: activationClient, listingId, environment: 'sandbox', propertyStatus: 'ForSale', secrets,
  privateProperty: reactivationPortal,
})
assert.equal(activation.externalStatus, 'inactive')
assert.equal(activation.status, 'NOT_CONFIRMED')
assert.equal(activation.confirmed, false)
assert.equal(reactivationPortal.calls.filter(([call]) => call === 'status-update').length, 1)
const activationWrite = activationClient.operations.find((o) => o.table === 'private_property_listing_syncs').payload
assert.equal(activationWrite.is_on_portal, false, 'acknowledged activation is not confirmed activation')
assert.equal(activationWrite.last_event_type, null, 'do not invent an activation event')
assert.equal(Object.hasOwn(activationWrite, 'activated_at'), false)
assert.equal(Object.hasOwn(activationWrite, 'last_payload_summary'), false)
const confirmedActivation = await updatePrivatePropertyListingStatus({
  client: createFakeClient(statusTables), listingId, environment: 'sandbox', propertyStatus: 'ForSale', secrets,
  privateProperty: createRecoveryPortal({ propertyId, address: recoveryAddress, afterStatus: 'For Sale' }),
})
assert.equal(confirmedActivation.confirmed, true)
assert.equal(confirmedActivation.externalStatus, 'active')
const failedProbePortal = createRecoveryPortal({ propertyId, address: recoveryAddress })
const probeStatus = failedProbePortal.getListingStatus
failedProbePortal.getListingStatus = async (args) => {
  if (failedProbePortal.calls.some(([call]) => call === 'status-update')) throw new Error('observation unavailable')
  return probeStatus(args)
}
const failedProbeClient = createFakeClient(statusTables)
const failedProbeActivation = await updatePrivatePropertyListingStatus({ client: failedProbeClient, listingId, environment: 'sandbox', propertyStatus: 'ForSale', secrets, privateProperty: failedProbePortal })
assert.equal(failedProbeActivation.confirmed, false)
assert.equal(failedProbeActivation.status, 'NOT_CONFIRMED')
const failedProbeWrite = failedProbeClient.operations.find((o) => o.table === 'private_property_listing_syncs').payload
assert.equal(failedProbeWrite.is_on_portal, false)
assert.equal(failedProbeWrite.last_response_summary.resultText, 'Successful', 'a failed observation retains the acknowledged request evidence')
const mismatchedClient = createFakeClient(statusTables)
const mismatchedPortal = createRecoveryPortal({ propertyId, address: { ...recoveryAddress, suburbId: 99 } })
await assert.rejects(updatePrivatePropertyListingStatus({ client: mismatchedClient, listingId, environment: 'sandbox', propertyStatus: 'ForSale', secrets, privateProperty: mismatchedPortal }), /different address/)
assert.equal(mismatchedPortal.calls.some(([call]) => call === 'status-update'), false)
assert.deepEqual(mismatchedClient.operations, [])
const unapprovedClient = createFakeClient(statusTables)
await assert.rejects(updatePrivatePropertyListingStatus({ client: unapprovedClient, listingId, environment: 'production', propertyStatus: 'ForSale', secrets, privateProperty: {} }), /Confirm reactivation/)
assert.deepEqual(unapprovedClient.operations, [])
await assert.rejects(updatePrivatePropertyListingStatus({ client: createFakeClient(statusTables), listingId, environment: 'sandbox', propertyStatus: 'ToLet', secrets, privateProperty: {} }), /does not match/)
const refusedClient = createFakeClient(statusTables)
await assert.rejects(updatePrivatePropertyListingStatus({
  client: refusedClient, listingId, environment: 'sandbox', propertyStatus: 'Inactive', secrets,
  privateProperty: {
    async listingStatusUpdate() { return response('<ListingStatusUpdateResult>Failed</ListingStatusUpdateResult>', 'ListingStatusUpdate') },
    async getListingStatus() { throw new Error('must not record a failed request') },
  },
}), /did not acknowledge/)
assert.deepEqual(refusedClient.operations, [])
const pendingWithdrawalClient = createFakeClient(statusTables)
await assert.rejects(updatePrivatePropertyListingStatus({
  client: pendingWithdrawalClient, listingId, environment: 'sandbox', propertyStatus: 'Inactive', secrets,
  privateProperty: {
    async listingStatusUpdate() { return response('<ListingStatusUpdateResult>Successful</ListingStatusUpdateResult>', 'ListingStatusUpdate') },
    async getListingStatus() { return response('<GetListingStatusResult>For Sale</GetListingStatusResult>', 'GetListingStatus') },
  },
}), /still reports/)
assert.equal(pendingWithdrawalClient.operations.find((o) => o.table === 'private_property_listing_syncs').payload.is_on_portal, true)

const cronTables = {
  ...createTables(),
  private_property_agency_configs: [{ ...agencyConfig, environment: 'production', status: 'active', go_live_approved_at: '2026-08-01' }],
  private_property_listing_syncs: [{ private_listing_id: listingId, environment: 'production', property_id: propertyId, branch_guid: branchGuid, external_status: 'inactive', last_checked_at: '2026-08-27T00:00:00Z' }],
}
const replayClient = createFakeClient(cronTables)
const replay = await runPrivatePropertyEventReconciliation({ client: replayClient, secrets, createPrivateProperty: () => createPortal({ active: true }) })
assert.equal(replay.status, 'COMPLETE')
assert.equal(replay.reports[0].staleEventCount, 1)
assert.equal(replay.processedEventCount, 0)
assert.equal(replayClient.operations.filter((o) => o.table === 'private_property_listing_syncs').length, 0)
const newEventClient = createFakeClient({ ...cronTables, private_property_listing_syncs: [{ ...cronTables.private_property_listing_syncs[0], last_checked_at: '2026-08-25T00:00:00Z' }] })
const newEvent = await runPrivatePropertyEventReconciliation({ client: newEventClient, secrets, createPrivateProperty: () => createPortal({ active: true }) })
assert.equal(newEvent.processedEventCount, 1, 'a genuinely newer activation must still reconcile')
assert.equal(Object.hasOwn(newEventClient.operations.find((o) => o.table === 'private_property_listing_syncs').payload, 'last_payload_summary'), false)

const serviceSource = read('server/services/privatePropertyPostSubmitMonitorService.js')
assert.match(serviceSource, /buildPrivatePropertyGoLiveReadinessReport/)
assert.match(serviceSource, /getListingStatus/)
assert.match(serviceSource, /getListingStatusVerbose/)
assert.match(serviceSource, /getReferenceNumberByListing/)
assert.match(serviceSource, /getActiveListings/)
assert.match(serviceSource, /getListingEventFeedByBranch/)
assert.match(serviceSource, /recordPrivatePropertyListingSync/)
assert.match(serviceSource, /rawCredentialsStored: false/)
assert.doesNotMatch(serviceSource, /requestBody/)

const cliSource = read('scripts/private-property-post-submit-monitor.mjs')
assert.match(cliSource, /runPrivatePropertyPostSubmitMonitor/)
assert.match(cliSource, /--record-sync/)
assert.match(cliSource, /private-property-post-submit-monitor\.json/)
assert.match(cliSource, /privatePropertyApiCalled: false/)
assert.doesNotMatch(cliSource, /PRIVATE_PROPERTY_PASSWORD/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:post-submit-monitor'], 'node scripts/private-property-post-submit-monitor.mjs')
assert.equal(packageJson.scripts['test:private-property-go-live-phase5-post-submit-monitor'], 'node scripts/private-property-phase11-post-submit-monitor.test.mjs')

console.log('Private Property go-live phase 5 post-submit monitor contract passed')
