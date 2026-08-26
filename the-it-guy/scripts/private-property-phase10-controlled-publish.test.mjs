import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_CONTROLLED_PUBLISH_SERVICE_VERSION,
  buildPrivatePropertyPublishConfirmation,
  createPrivatePropertyPayloadDigest,
  runPrivatePropertyControlledPublishRehearsal,
} from '../server/services/privatePropertyControlledPublishService.js'

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

const listing = {
  id: listingId,
  organisation_id: organisationId,
  branch_id: branchId,
  assigned_agent_id: arch9UserId,
  assigned_agent_email: 'agent@arch9.test',
  listing_reference: 'PP-CTRL-001',
  title: 'Private Property controlled publish listing',
  street_name: 'Controlled Road',
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
  title: 'Private Property controlled publish listing',
  description: 'A controlled listing payload ready for the Private Property rehearsal.',
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

function createTables(environment = 'sandbox', status = 'sandbox_ready', goLiveApprovedAt = '') {
  const agencyConfig = {
    id: agencyConfigId,
    organisation_id: organisationId,
    branch_id: branchId,
    environment,
    vendor_name: 'Arch9',
    branch_guid: '22222222-2222-4222-8222-222222222222',
    username_secret_name: 'PRIVATE_PROPERTY_SANDBOX_USERNAME',
    password_secret_name: 'PRIVATE_PROPERTY_SANDBOX_PASSWORD',
    base_url: 'https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx',
    enabled: true,
    status,
    go_live_approved_at: goLiveApprovedAt,
  }
  const agentMapping = {
    id: '00000000-0000-4000-8000-000000000020',
    agency_config_id: agencyConfigId,
    organisation_id: organisationId,
    branch_id: branchId,
    arch9_user_id: arch9UserId,
    environment,
    private_property_agent_id: environment === 'production' ? 'ARCH9-PROD-USER-1' : 'ARCH9-SANDBOX-USER-1',
    source_reference: environment === 'production' ? 'ARCH9-PROD-USER-1' : 'ARCH9-SANDBOX-USER-1',
    email_snapshot: 'agent@arch9.test',
    status: 'active',
  }
  return {
    private_listings: [listing],
    listing_publication_data: [publication],
    listing_media: media,
    private_property_listing_syncs: [],
    private_property_agency_configs: [agencyConfig],
    private_property_agent_mappings: [agentMapping],
  }
}

const secrets = {
  PRIVATE_PROPERTY_SANDBOX_USERNAME: 'Arch9User',
  PRIVATE_PROPERTY_SANDBOX_PASSWORD: 'private-property-password',
}

assert.equal(createPrivatePropertyPayloadDigest({ a: 1 }), createPrivatePropertyPayloadDigest({ a: 1 }))
assert.equal(
  buildPrivatePropertyPublishConfirmation({ listingId, environment: 'production' }),
  `PRIVATE_PROPERTY_PUBLISH:${listingId}:production`,
)

const dryRunClient = createFakeClient(createTables())
const dryRun = await runPrivatePropertyControlledPublishRehearsal({
  client: dryRunClient,
  listingId,
  environment: 'sandbox',
  secrets,
  overrides: { suburbId: '12345' },
})
assert.equal(dryRun.version, PRIVATE_PROPERTY_CONTROLLED_PUBLISH_SERVICE_VERSION)
assert.equal(dryRun.status, 'DRY_RUN_READY')
assert.equal(dryRun.safety.readinessChecked, true)
assert.equal(dryRun.safety.privatePropertyApiCalled, false)
assert.equal(dryRun.safety.databaseWritten, false)
assert.equal(dryRun.submitCandidate.propertyId, 'PP-CTRL-001')
assert.equal(dryRun.submitCandidate.agentIds[0], 'ARCH9-SANDBOX-USER-1')
assert.match(dryRun.submitCandidate.payloadDigest, /^[a-f0-9]{64}$/)
assert.match(dryRun.submitCandidate.listingXmlDigest, /^[a-f0-9]{64}$/)
assert.deepEqual(dryRunClient.operations, [])

let updateListingCalls = 0
const applyClient = createFakeClient(createTables())
const applied = await runPrivatePropertyControlledPublishRehearsal({
  client: applyClient,
  listingId,
  environment: 'sandbox',
  secrets,
  overrides: { suburbId: '12345' },
  apply: true,
  privateProperty: {
    updateListing: async (xml) => {
      updateListingCalls += 1
      assert.match(xml, /<ListingImport>/)
      assert.match(xml, /<AgentId>ARCH9-SANDBOX-USER-1<\/AgentId>/)
      return {
        status: 200,
        durationMs: 123,
        data: '<UpdateListingResult>Queued listing reference PP-CTRL-001</UpdateListingResult>',
        summary: {
          method: 'UpdateListing',
          resultText: 'Queued listing reference PP-CTRL-001',
        },
      }
    },
  },
})
assert.equal(applied.status, 'SUBMITTED')
assert.equal(updateListingCalls, 1)
assert.equal(applied.safety.privatePropertyApiCalled, true)
assert.equal(applied.safety.listingPublished, true)
assert.equal(applied.safety.databaseWritten, false)
assert.equal(applied.apiResponse.privatePropertyReference, 'PP-CTRL-001')
assert.deepEqual(applyClient.operations, [])

const recordClient = createFakeClient(createTables())
const appliedWithSync = await runPrivatePropertyControlledPublishRehearsal({
  client: recordClient,
  listingId,
  environment: 'sandbox',
  secrets,
  overrides: { suburbId: '12345' },
  apply: true,
  recordSync: true,
  privateProperty: {
    updateListing: async () => ({
      status: 200,
      durationMs: 123,
      summary: {
        method: 'UpdateListing',
        resultText: 'Queued listing reference PP-CTRL-002',
      },
    }),
  },
})
assert.equal(appliedWithSync.status, 'SUBMITTED')
assert.equal(appliedWithSync.safety.databaseWritten, true)
assert.ok(recordClient.operations.some((operation) => operation.table === 'private_property_listing_syncs' && operation.type === 'upsert'))
assert.ok(recordClient.operations.some((operation) => operation.table === 'private_listings' && operation.type === 'update'))

const blockedClient = createFakeClient(createTables())
const blocked = await runPrivatePropertyControlledPublishRehearsal({
  client: blockedClient,
  listingId,
  environment: 'sandbox',
  secrets: {},
  overrides: { suburbId: '12345' },
  apply: true,
  privateProperty: {
    updateListing: async () => {
      throw new Error('should not call API when readiness is blocked')
    },
  },
})
assert.equal(blocked.status, 'BLOCKED')
assert.equal(blocked.safety.privatePropertyApiCalled, false)
assert.ok(blocked.blockers.includes('missing_runtime_secret:PRIVATE_PROPERTY_SANDBOX_USERNAME'))

const productionNoConfirm = await runPrivatePropertyControlledPublishRehearsal({
  client: createFakeClient(createTables('production', 'approved', '2026-08-26T08:00:00.000Z')),
  listingId,
  environment: 'production',
  secrets,
  overrides: { suburbId: '12345' },
  apply: true,
  privateProperty: {
    updateListing: async () => {
      throw new Error('should not call production API without confirmation')
    },
  },
})
assert.equal(productionNoConfirm.status, 'BLOCKED')
assert.equal(productionNoConfirm.safety.privatePropertyApiCalled, false)
assert.ok(productionNoConfirm.blockers.includes('missing_production_publish_confirmation'))
assert.equal(productionNoConfirm.expectedConfirmation, `PRIVATE_PROPERTY_PUBLISH:${listingId}:production`)

const serviceSource = read('server/services/privatePropertyControlledPublishService.js')
assert.match(serviceSource, /buildPrivatePropertyGoLiveReadinessReport/)
assert.match(serviceSource, /updateListing\(preview\.listingXml\)/)
assert.match(serviceSource, /recordPrivatePropertyListingSync/)
assert.match(serviceSource, /missing_production_publish_confirmation/)
assert.match(serviceSource, /rawCredentialsStored: false/)
assert.doesNotMatch(serviceSource, /requestBody/)

const cliSource = read('scripts/private-property-controlled-publish-rehearsal.mjs')
assert.match(cliSource, /runPrivatePropertyControlledPublishRehearsal/)
assert.match(cliSource, /--record-sync/)
assert.match(cliSource, /private-property-controlled-publish-rehearsal\.json/)
assert.match(cliSource, /privatePropertyApiCalled: false/)
assert.doesNotMatch(cliSource, /PRIVATE_PROPERTY_PASSWORD/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:controlled-publish-rehearsal'], 'node scripts/private-property-controlled-publish-rehearsal.mjs')
assert.equal(packageJson.scripts['test:private-property-go-live-phase4-controlled-publish'], 'node scripts/private-property-phase10-controlled-publish.test.mjs')

console.log('Private Property go-live phase 4 controlled publish rehearsal contract passed')
