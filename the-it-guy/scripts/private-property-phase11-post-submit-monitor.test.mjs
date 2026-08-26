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
