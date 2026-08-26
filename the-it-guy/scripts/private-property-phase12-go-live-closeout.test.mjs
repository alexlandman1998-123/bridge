import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_GO_LIVE_CLOSEOUT_SERVICE_VERSION,
  runPrivatePropertyGoLiveCloseout,
} from '../server/services/privatePropertyGoLiveCloseoutService.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

class FakeQuery {
  constructor(rows = []) {
    this.rows = rows
    this.filters = []
    this.limitCount = null
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

  then(resolve, reject) {
    return Promise.resolve({ data: this.applyFilters(), error: null }).then(resolve, reject)
  }
}

function createFakeClient(tables = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(table)
      return new FakeQuery(tables[table] || [])
    },
  }
}

const organisationId = '00000000-0000-4000-8000-000000000001'
const branchId = '00000000-0000-4000-8000-000000000002'
const listingId = '00000000-0000-4000-8000-000000000003'
const arch9UserId = '00000000-0000-4000-8000-000000000004'
const branchGuid = '22222222-2222-4222-8222-222222222222'
const propertyId = 'PP-CLOSEOUT-001'

const listing = {
  id: listingId,
  organisation_id: organisationId,
  branch_id: branchId,
  assigned_agent_id: arch9UserId,
  assigned_agent_email: 'agent@arch9.test',
  listing_reference: propertyId,
  title: 'Private Property closeout listing',
  street_name: 'Closeout Road',
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
  title: 'Private Property closeout listing',
  description: 'A controlled listing payload ready for Private Property production closeout.',
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

function agencyConfig(environment = 'production', status = 'approved', goLiveApprovedAt = '2026-08-26T10:00:00.000Z') {
  return {
    id: `00000000-0000-4000-8000-00000000001${environment === 'production' ? '1' : '0'}`,
    organisation_id: organisationId,
    branch_id: branchId,
    environment,
    vendor_name: 'Arch9',
    branch_guid: branchGuid,
    username_secret_name: environment === 'production' ? 'PRIVATE_PROPERTY_PRODUCTION_USERNAME' : 'PRIVATE_PROPERTY_SANDBOX_USERNAME',
    password_secret_name: environment === 'production' ? 'PRIVATE_PROPERTY_PRODUCTION_PASSWORD' : 'PRIVATE_PROPERTY_SANDBOX_PASSWORD',
    base_url: environment === 'production'
      ? 'https://services.privateproperty.co.za/AgentImport/AgentImport.asmx'
      : 'https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx',
    enabled: true,
    status,
    go_live_approved_at: goLiveApprovedAt,
  }
}

function agentMapping(environment = 'production') {
  const config = agencyConfig(environment)
  return {
    id: `00000000-0000-4000-8000-00000000002${environment === 'production' ? '1' : '0'}`,
    agency_config_id: config.id,
    organisation_id: organisationId,
    branch_id: branchId,
    arch9_user_id: arch9UserId,
    environment,
    private_property_agent_id: environment === 'production' ? 'ARCH9-PROD-USER-1' : 'ARCH9-SANDBOX-USER-1',
    source_reference: environment === 'production' ? 'ARCH9-PROD-USER-1' : 'ARCH9-SANDBOX-USER-1',
    email_snapshot: 'agent@arch9.test',
    status: 'active',
  }
}

function createTables({ productionStatus = 'approved', goLiveApprovedAt = '2026-08-26T10:00:00.000Z', syncActive = true } = {}) {
  return {
    private_listings: [listing],
    listing_publication_data: [publication],
    listing_media: media,
    private_property_agency_configs: [
      agencyConfig('sandbox', 'sandbox_ready', ''),
      agencyConfig('production', productionStatus, goLiveApprovedAt),
    ],
    private_property_agent_mappings: [
      agentMapping('sandbox'),
      agentMapping('production'),
    ],
    private_property_listing_syncs: syncActive ? [{
      id: '00000000-0000-4000-8000-000000000030',
      private_listing_id: listingId,
      environment: 'sandbox',
      branch_guid: branchGuid,
      property_id: propertyId,
      listing_type: 'Sale',
      private_property_ref: 'T2870287',
      external_status: 'active',
      is_on_portal: true,
      last_event_type: 'Activated',
      last_event_status: 'Active',
      continuation_key: 'cursor-2',
      last_checked_at: '2026-08-26T09:10:00.000Z',
      activated_at: '2026-08-26T09:00:00.000Z',
    }] : [],
  }
}

const secrets = {
  PRIVATE_PROPERTY_PRODUCTION_USERNAME: 'Arch9User',
  PRIVATE_PROPERTY_PRODUCTION_PASSWORD: 'private-property-password',
}

const sandboxPublishReport = {
  phase: 'private-property-go-live-phase4-controlled-publish-rehearsal',
  status: 'SUBMITTED',
  apply: true,
  recordSync: true,
  safety: {
    privatePropertyApiCalled: true,
    databaseWritten: true,
    listingPublished: true,
    rawCredentialsStored: false,
  },
  submitCandidate: {
    propertyId,
    payloadDigest: 'a'.repeat(64),
    listingXmlDigest: 'b'.repeat(64),
  },
  apiResponse: {
    privatePropertyReference: 'T2870287',
  },
}

const sandboxMonitorReport = {
  phase: 'private-property-go-live-phase5-post-submit-monitor',
  status: 'ACTIVATED',
  externalStatus: 'active',
  propertyId,
  safety: {
    privatePropertyApiCalled: true,
    databaseWritten: true,
    rawCredentialsStored: false,
  },
  statusProbe: {
    privatePropertyRef: 'T2870287',
  },
  eventFeed: {
    continuationKey: 'cursor-2',
    matchCount: 1,
    latestEvent: {
      listingFeedEventType: 'Activated',
      eventStatus: 'Active',
    },
  },
}

const evidence = {
  approvedBy: 'alex@arch9.co.za',
  approvalReference: 'Private Property go-live approval 2026-08-26',
  supportContact: 'support@arch9.co.za',
  rollbackOwner: 'alex@arch9.co.za',
}

const ready = await runPrivatePropertyGoLiveCloseout({
  client: createFakeClient(createTables()),
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  sandboxPublishReport,
  sandboxMonitorReport,
  evidence,
})

assert.equal(ready.version, PRIVATE_PROPERTY_GO_LIVE_CLOSEOUT_SERVICE_VERSION)
assert.equal(ready.phase, 'private-property-go-live-phase6-closeout')
assert.equal(ready.status, 'GO_LIVE_READY')
assert.equal(ready.ready, true)
assert.deepEqual(ready.blockers, [])
assert.equal(ready.safety.privatePropertyApiCalled, false)
assert.equal(ready.safety.databaseWritten, false)
assert.equal(ready.safety.rawCredentialsStored, false)
assert.equal(ready.safety.listingPublished, false)
assert.equal(ready.checks.every((check) => check.status === 'PASS'), true)
assert.match(ready.production.expectedConfirmation, new RegExp(`PRIVATE_PROPERTY_PUBLISH:${listingId}:production`))
assert.match(ready.production.publishCommand, /--environment=production/)
assert.match(ready.production.publishCommand, /--apply --record-sync/)
assert.match(ready.production.monitorCommand, /private-property:post-submit-monitor/)

const missingApproval = await runPrivatePropertyGoLiveCloseout({
  client: createFakeClient(createTables()),
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  sandboxPublishReport,
  sandboxMonitorReport,
  evidence: {},
})
assert.equal(missingApproval.status, 'BLOCKED')
assert.ok(missingApproval.blockers.includes('missing_go_live_approved_by'))
assert.ok(missingApproval.blockers.includes('missing_support_contact'))

const missingActivation = await runPrivatePropertyGoLiveCloseout({
  client: createFakeClient(createTables()),
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  sandboxPublishReport,
  sandboxMonitorReport: { ...sandboxMonitorReport, status: 'PENDING', externalStatus: 'submitted' },
  evidence,
})
assert.equal(missingActivation.status, 'BLOCKED')
assert.ok(missingActivation.blockers.includes('missing_sandbox_activation_evidence'))

const missingSync = await runPrivatePropertyGoLiveCloseout({
  client: createFakeClient(createTables({ syncActive: false })),
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  sandboxPublishReport,
  sandboxMonitorReport,
  evidence,
})
assert.equal(missingSync.status, 'BLOCKED')
assert.ok(missingSync.blockers.includes('missing_active_sandbox_sync_record'))

const unapprovedProduction = await runPrivatePropertyGoLiveCloseout({
  client: createFakeClient(createTables({ productionStatus: 'sandbox_ready', goLiveApprovedAt: '' })),
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  sandboxPublishReport,
  sandboxMonitorReport,
  evidence,
})
assert.equal(unapprovedProduction.status, 'BLOCKED')
assert.ok(unapprovedProduction.blockers.includes('private_property_production_go_live_not_approved'))
assert.ok(unapprovedProduction.blockers.includes('private_property_production_config_not_approved'))

const serviceSource = read('server/services/privatePropertyGoLiveCloseoutService.js')
assert.match(serviceSource, /buildPrivatePropertyGoLiveReadinessReport/)
assert.match(serviceSource, /buildPrivatePropertyPublishConfirmation/)
assert.match(serviceSource, /private_property_listing_syncs/)
assert.match(serviceSource, /missing_successful_sandbox_publish_evidence/)
assert.match(serviceSource, /missing_sandbox_activation_evidence/)
assert.match(serviceSource, /missing_active_sandbox_sync_record/)
assert.match(serviceSource, /rawCredentialsStored: false/)
assert.doesNotMatch(serviceSource, /createPrivatePropertyClient|updateListing|requestBody/)

const cliSource = read('scripts/private-property-go-live-closeout.mjs')
assert.match(cliSource, /runPrivatePropertyGoLiveCloseout/)
assert.match(cliSource, /--sandbox-publish-report/)
assert.match(cliSource, /--sandbox-monitor-report/)
assert.match(cliSource, /--approved-by/)
assert.match(cliSource, /private-property-go-live-closeout\.json/)
assert.doesNotMatch(cliSource, /PRIVATE_PROPERTY_PASSWORD|createPrivatePropertyClient|updateListing/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:go-live-closeout'], 'node scripts/private-property-go-live-closeout.mjs')
assert.equal(packageJson.scripts['test:private-property-go-live-phase6-closeout'], 'node scripts/private-property-phase12-go-live-closeout.test.mjs')

console.log('Private Property go-live phase 6 closeout contract passed')
