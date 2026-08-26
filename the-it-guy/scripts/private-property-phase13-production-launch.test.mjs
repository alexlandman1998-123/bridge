import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_PRODUCTION_LAUNCH_SERVICE_VERSION,
  runPrivatePropertyProductionLaunch,
} from '../server/services/privatePropertyProductionLaunchService.js'

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
const branchGuid = '22222222-2222-4222-8222-222222222222'
const propertyId = 'PP-LAUNCH-001'
const expectedConfirmation = `PRIVATE_PROPERTY_PUBLISH:${listingId}:production`

const listing = {
  id: listingId,
  organisation_id: organisationId,
  branch_id: branchId,
  assigned_agent_id: arch9UserId,
  assigned_agent_email: 'agent@arch9.test',
  listing_reference: propertyId,
  title: 'Private Property production launch listing',
  street_name: 'Launch Road',
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
  title: 'Private Property production launch listing',
  description: 'A controlled listing payload ready for Private Property production launch.',
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

const productionConfig = {
  id: '00000000-0000-4000-8000-000000000011',
  organisation_id: organisationId,
  branch_id: branchId,
  environment: 'production',
  vendor_name: 'Arch9',
  branch_guid: branchGuid,
  username_secret_name: 'PRIVATE_PROPERTY_PRODUCTION_USERNAME',
  password_secret_name: 'PRIVATE_PROPERTY_PRODUCTION_PASSWORD',
  base_url: 'https://services.privateproperty.co.za/AgentImport/AgentImport.asmx',
  enabled: true,
  status: 'approved',
  go_live_approved_at: '2026-08-26T10:00:00.000Z',
}

const productionMapping = {
  id: '00000000-0000-4000-8000-000000000021',
  agency_config_id: productionConfig.id,
  organisation_id: organisationId,
  branch_id: branchId,
  arch9_user_id: arch9UserId,
  environment: 'production',
  private_property_agent_id: 'ARCH9-PROD-USER-1',
  source_reference: 'ARCH9-PROD-USER-1',
  email_snapshot: 'agent@arch9.test',
  status: 'active',
}

function createTables() {
  return {
    private_listings: [listing],
    listing_publication_data: [publication],
    listing_media: media,
    private_property_agency_configs: [productionConfig],
    private_property_agent_mappings: [productionMapping],
    private_property_listing_syncs: [],
  }
}

const closeoutReport = {
  phase: 'private-property-go-live-phase6-closeout',
  status: 'GO_LIVE_READY',
  ready: true,
  listingId,
  blockers: [],
  warnings: [],
  production: {
    expectedConfirmation,
  },
  sandbox: {
    publishEvidence: { status: 'SUBMITTED' },
    activationEvidence: { status: 'ACTIVATED' },
    latestSync: { externalStatus: 'active', isOnPortal: true },
  },
  approval: {
    approvedBy: 'alex@arch9.co.za',
    approvalReference: 'Private Property go-live approval 2026-08-26',
    supportContact: 'support@arch9.co.za',
    rollbackOwner: 'alex@arch9.co.za',
  },
}

const secrets = {
  PRIVATE_PROPERTY_PRODUCTION_USERNAME: 'Arch9User',
  PRIVATE_PROPERTY_PRODUCTION_PASSWORD: 'private-property-password',
}

const dryRunClient = createFakeClient(createTables())
const dryRun = await runPrivatePropertyProductionLaunch({
  client: dryRunClient,
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  closeoutReport,
})

assert.equal(dryRun.version, PRIVATE_PROPERTY_PRODUCTION_LAUNCH_SERVICE_VERSION)
assert.equal(dryRun.phase, 'private-property-go-live-phase7-production-launch')
assert.equal(dryRun.status, 'PLAN_READY')
assert.equal(dryRun.ready, false)
assert.equal(dryRun.safety.privatePropertyApiCalled, false)
assert.equal(dryRun.safety.databaseWritten, false)
assert.equal(dryRun.expectedConfirmation, expectedConfirmation)
assert.deepEqual(dryRunClient.operations, [])

const invalidConfirmClient = createFakeClient(createTables())
const invalidConfirm = await runPrivatePropertyProductionLaunch({
  client: invalidConfirmClient,
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  closeoutReport,
  apply: true,
  confirmation: 'wrong',
  privateProperty: {
    updateListing: async () => {
      throw new Error('should not submit without exact confirmation')
    },
  },
})
assert.equal(invalidConfirm.status, 'BLOCKED')
assert.ok(invalidConfirm.blockers.includes('missing_or_invalid_production_launch_confirmation'))
assert.equal(invalidConfirm.safety.privatePropertyApiCalled, false)
assert.deepEqual(invalidConfirmClient.operations, [])

let updateListingCalls = 0
const applyClient = createFakeClient(createTables())
const applied = await runPrivatePropertyProductionLaunch({
  client: applyClient,
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  closeoutReport,
  apply: true,
  confirmation: expectedConfirmation,
  privateProperty: {
    updateListing: async (xml) => {
      updateListingCalls += 1
      assert.match(xml, /<ListingImport>/)
      assert.match(xml, /<AgentId>ARCH9-PROD-USER-1<\/AgentId>/)
      return {
        status: 200,
        durationMs: 123,
        summary: {
          method: 'UpdateListing',
          resultText: 'Queued listing reference PP-LAUNCH-001',
        },
      }
    },
  },
})
assert.equal(applied.status, 'PRODUCTION_SUBMITTED')
assert.equal(applied.ready, true)
assert.equal(updateListingCalls, 1)
assert.equal(applied.safety.privatePropertyApiCalled, true)
assert.equal(applied.safety.databaseWritten, true)
assert.equal(applied.safety.listingPublished, true)
assert.equal(applied.productionSubmit.privatePropertyReference, propertyId)
assert.ok(applyClient.operations.some((operation) => operation.table === 'private_property_listing_syncs' && operation.type === 'upsert'))
assert.ok(applyClient.operations.some((operation) => operation.table === 'private_listings' && operation.type === 'update'))

const blockedCloseout = await runPrivatePropertyProductionLaunch({
  client: createFakeClient(createTables()),
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  closeoutReport: { ...closeoutReport, ready: false, status: 'BLOCKED', blockers: ['missing_sandbox_activation_evidence'] },
  apply: true,
  confirmation: expectedConfirmation,
})
assert.equal(blockedCloseout.status, 'BLOCKED')
assert.ok(blockedCloseout.blockers.includes('go_live_closeout_not_ready'))
assert.equal(blockedCloseout.safety.privatePropertyApiCalled, false)

const mismatch = await runPrivatePropertyProductionLaunch({
  client: createFakeClient(createTables()),
  listingId,
  secrets,
  overrides: { suburbId: '12345' },
  closeoutReport: { ...closeoutReport, listingId: '00000000-0000-4000-8000-000000000099' },
})
assert.equal(mismatch.status, 'BLOCKED')
assert.ok(mismatch.blockers.includes('closeout_listing_id_mismatch'))

const serviceSource = read('server/services/privatePropertyProductionLaunchService.js')
assert.match(serviceSource, /runPrivatePropertyGoLiveCloseout/)
assert.match(serviceSource, /runPrivatePropertyControlledPublishRehearsal/)
assert.match(serviceSource, /missing_or_invalid_production_launch_confirmation/)
assert.match(serviceSource, /environment: 'production'/)
assert.match(serviceSource, /rawCredentialsStored: false/)
assert.doesNotMatch(serviceSource, /requestBody/)

const cliSource = read('scripts/private-property-production-launch.mjs')
assert.match(cliSource, /runPrivatePropertyProductionLaunch/)
assert.match(cliSource, /--closeout-report/)
assert.match(cliSource, /--apply/)
assert.match(cliSource, /--confirm/)
assert.match(cliSource, /private-property-production-launch\.json/)
assert.doesNotMatch(cliSource, /PRIVATE_PROPERTY_PASSWORD|updateListing/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:production-launch'], 'node scripts/private-property-production-launch.mjs')
assert.equal(packageJson.scripts['test:private-property-go-live-phase7-production-launch'], 'node scripts/private-property-phase13-production-launch.test.mjs')

console.log('Private Property go-live phase 7 production launch contract passed')
