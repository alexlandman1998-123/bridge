import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_PRODUCTION_PROOF_SERVICE_VERSION,
  runPrivatePropertyProductionProof,
} from '../server/services/privatePropertyProductionProofService.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

class FakeQuery {
  constructor(rows = [], error = null) {
    this.rows = rows
    this.error = error
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

  order() {
    return this
  }

  limit(count) {
    this.limitCount = count
    return this
  }

  applyFilters() {
    let rows = this.rows.filter((row) => this.filters.every((filter) => (
      String(row[filter.column] ?? '') === String(filter.value ?? '')
    )))
    if (this.limitCount) rows = rows.slice(0, this.limitCount)
    return rows
  }

  maybeSingle() {
    if (this.error) return Promise.resolve({ data: null, error: this.error })
    return Promise.resolve({ data: this.applyFilters()[0] || null, error: null })
  }

  then(resolve, reject) {
    if (this.error) return Promise.resolve({ data: null, error: this.error }).then(resolve, reject)
    return Promise.resolve({ data: this.applyFilters(), error: null }).then(resolve, reject)
  }
}

function createFakeClient(tables = {}, errors = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(table)
      return new FakeQuery(tables[table] || [], errors[table] || null)
    },
  }
}

const listingId = '00000000-0000-4000-8000-000000000003'
const branchGuid = '22222222-2222-4222-8222-222222222222'
const propertyId = 'PP-PROOF-001'

const launchReport = {
  phase: 'private-property-go-live-phase7-production-launch',
  status: 'PRODUCTION_SUBMITTED',
  ready: true,
  listingId,
  environment: 'production',
  apply: true,
  recordSync: true,
  safety: {
    closeoutChecked: true,
    privatePropertyApiCalled: true,
    databaseWritten: true,
    rawCredentialsStored: false,
    listingPublished: true,
  },
  productionSubmit: {
    status: 'SUBMITTED',
    privatePropertyReference: 'T2870287',
    propertyId,
    branchGuid,
  },
}

const productionMonitorReport = {
  phase: 'private-property-go-live-phase5-post-submit-monitor',
  status: 'ACTIVATED',
  externalStatus: 'active',
  listingId,
  environment: 'production',
  propertyId,
  branchGuid,
  safety: {
    privatePropertyApiCalled: true,
    databaseWritten: true,
    rawCredentialsStored: false,
  },
  statusProbe: {
    privatePropertyRef: 'T2870287',
  },
  eventFeed: {
    continuationKey: 'prod-cursor-2',
    matchCount: 1,
    latestEvent: {
      listingFeedEventType: 'Activated',
      eventStatus: 'Active',
    },
  },
}

const productionSync = {
  id: '00000000-0000-4000-8000-000000000030',
  private_listing_id: listingId,
  environment: 'production',
  branch_guid: branchGuid,
  property_id: propertyId,
  listing_type: 'Sale',
  private_property_ref: 'T2870287',
  external_status: 'active',
  is_on_portal: true,
  last_event_type: 'Activated',
  last_event_status: 'Active',
  continuation_key: 'prod-cursor-2',
  last_checked_at: '2026-08-26T11:10:00.000Z',
  activated_at: '2026-08-26T11:00:00.000Z',
}

const listing = {
  id: listingId,
  private_property_status: 'published',
  private_property_reference: 'T2870287',
  private_property_listing_url: '',
  updated_at: '2026-08-26T11:12:00.000Z',
}

function createTables({ sync = productionSync, listingRow = listing } = {}) {
  return {
    private_property_listing_syncs: sync ? [sync] : [],
    private_listings: listingRow ? [listingRow] : [],
  }
}

const evidence = {
  acceptedBy: 'alex@arch9.co.za',
  supportContact: 'support@arch9.co.za',
  rollbackOwner: 'alex@arch9.co.za',
  escalationContact: 'operations@arch9.co.za',
}

const live = await runPrivatePropertyProductionProof({
  client: createFakeClient(createTables()),
  listingId,
  launchReport,
  productionMonitorReport,
  evidence,
})

assert.equal(live.version, PRIVATE_PROPERTY_PRODUCTION_PROOF_SERVICE_VERSION)
assert.equal(live.phase, 'private-property-go-live-phase8-production-proof')
assert.equal(live.status, 'LIVE_CONFIRMED')
assert.equal(live.live, true)
assert.deepEqual(live.blockers, [])
assert.equal(live.safety.privatePropertyApiCalled, false)
assert.equal(live.safety.databaseWritten, false)
assert.equal(live.safety.rawCredentialsStored, false)
assert.equal(live.safety.listingPublished, false)
assert.equal(live.checks.every((check) => check.status === 'PASS'), true)
assert.equal(live.production.latestSync.externalStatus, 'active')
assert.equal(live.production.listing.privatePropertyStatus, 'published')

const missingLaunch = await runPrivatePropertyProductionProof({
  client: createFakeClient(createTables()),
  listingId,
  productionMonitorReport,
  evidence,
})
assert.equal(missingLaunch.status, 'BLOCKED')
assert.ok(missingLaunch.blockers.includes('missing_successful_production_launch_evidence'))

const pendingMonitor = await runPrivatePropertyProductionProof({
  client: createFakeClient(createTables()),
  listingId,
  launchReport,
  productionMonitorReport: { ...productionMonitorReport, status: 'PENDING', externalStatus: 'submitted' },
  evidence,
})
assert.equal(pendingMonitor.status, 'BLOCKED')
assert.ok(pendingMonitor.blockers.includes('missing_production_activation_evidence'))

const attentionMonitor = await runPrivatePropertyProductionProof({
  client: createFakeClient(createTables()),
  listingId,
  launchReport,
  productionMonitorReport: { ...productionMonitorReport, status: 'ATTENTION_REQUIRED', externalStatus: 'failed' },
  evidence,
})
assert.equal(attentionMonitor.status, 'ATTENTION_REQUIRED')
assert.ok(attentionMonitor.blockers.includes('missing_production_activation_evidence'))

const missingSync = await runPrivatePropertyProductionProof({
  client: createFakeClient(createTables({ sync: null })),
  listingId,
  launchReport,
  productionMonitorReport,
  evidence,
})
assert.equal(missingSync.status, 'BLOCKED')
assert.ok(missingSync.blockers.includes('missing_active_production_sync_record'))

const listingNotPublished = await runPrivatePropertyProductionProof({
  client: createFakeClient(createTables({ listingRow: { ...listing, private_property_status: 'draft' } })),
  listingId,
  launchReport,
  productionMonitorReport,
  evidence,
})
assert.equal(listingNotPublished.status, 'BLOCKED')
assert.ok(listingNotPublished.blockers.includes('private_listing_not_marked_published_on_private_property'))

const missingHandoff = await runPrivatePropertyProductionProof({
  client: createFakeClient(createTables()),
  listingId,
  launchReport,
  productionMonitorReport,
  evidence: {},
})
assert.equal(missingHandoff.status, 'BLOCKED')
assert.ok(missingHandoff.blockers.includes('missing_production_acceptance_by'))
assert.ok(missingHandoff.blockers.includes('missing_escalation_contact'))

const syncLookupFailed = await runPrivatePropertyProductionProof({
  client: createFakeClient(createTables(), {
    private_property_listing_syncs: { message: 'sync lookup failed', code: 'PGRST205' },
  }),
  listingId,
  launchReport,
  productionMonitorReport,
  evidence,
})
assert.equal(syncLookupFailed.status, 'BLOCKED')
assert.ok(syncLookupFailed.blockers.includes('private_property_production_sync_lookup_failed'))

const serviceSource = read('server/services/privatePropertyProductionProofService.js')
assert.match(serviceSource, /private_property_listing_syncs/)
assert.match(serviceSource, /private_listings/)
assert.match(serviceSource, /missing_successful_production_launch_evidence/)
assert.match(serviceSource, /missing_production_activation_evidence/)
assert.match(serviceSource, /missing_active_production_sync_record/)
assert.match(serviceSource, /private_listing_not_marked_published_on_private_property/)
assert.match(serviceSource, /rawCredentialsStored: false/)
assert.doesNotMatch(serviceSource, /createPrivatePropertyClient|updateListing|requestBody|PRIVATE_PROPERTY_PASSWORD/)

const cliSource = read('scripts/private-property-production-proof.mjs')
assert.match(cliSource, /runPrivatePropertyProductionProof/)
assert.match(cliSource, /--launch-report/)
assert.match(cliSource, /--production-monitor-report/)
assert.match(cliSource, /--accepted-by/)
assert.match(cliSource, /private-property-production-proof\.json/)
assert.doesNotMatch(cliSource, /PRIVATE_PROPERTY_PASSWORD|updateListing/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:production-proof'], 'node scripts/private-property-production-proof.mjs')
assert.equal(packageJson.scripts['test:private-property-go-live-phase8-production-proof'], 'node scripts/private-property-phase14-production-proof.test.mjs')

console.log('Private Property go-live phase 8 production proof contract passed')
