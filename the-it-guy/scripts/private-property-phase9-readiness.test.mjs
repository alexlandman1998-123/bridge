import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_GO_LIVE_READINESS_SERVICE_VERSION,
  buildPrivatePropertyGoLiveReadinessReport,
  createPrivatePropertyGoLiveReadinessReport,
} from '../server/services/privatePropertyGoLiveReadinessService.js'

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
      return String(row[filter.column] ?? '') === String(valueForFilter(filter.value))
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

function valueForFilter(value) {
  return value ?? ''
}

function createFakeClient(tables = {}) {
  return {
    from(table) {
      return new FakeQuery(tables[table] || [])
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
  listing_reference: 'PP-READY-001',
  title: 'Private Property ready listing',
  street_name: 'Readiness Road',
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
  title: 'Private Property ready listing',
  description: 'A controlled listing payload ready for Private Property validation.',
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
  branch_guid: '22222222-2222-4222-8222-222222222222',
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

const tables = {
  private_listings: [listing],
  listing_publication_data: [publication],
  listing_media: media,
  private_property_listing_syncs: [],
  private_property_agency_configs: [agencyConfig],
  private_property_agent_mappings: [agentMapping],
}

const readyReport = await buildPrivatePropertyGoLiveReadinessReport({
  client: createFakeClient(tables),
  listingId,
  environment: 'sandbox',
  secrets: {
    PRIVATE_PROPERTY_SANDBOX_USERNAME: 'Arch9User',
    PRIVATE_PROPERTY_SANDBOX_PASSWORD: 'private-property-password',
  },
  overrides: {
    suburbId: '12345',
  },
})

assert.equal(readyReport.version, PRIVATE_PROPERTY_GO_LIVE_READINESS_SERVICE_VERSION)
assert.equal(readyReport.phase, 'private-property-go-live-phase3-readiness')
assert.equal(readyReport.status, 'READY')
assert.equal(readyReport.ready, true)
assert.deepEqual(readyReport.blockers, [])
assert.equal(readyReport.safety.privatePropertyApiCalled, false)
assert.equal(readyReport.safety.databaseWritten, false)
assert.equal(readyReport.safety.rawCredentialsStored, false)
assert.equal(readyReport.preview.canPreview, true)
assert.equal(readyReport.agencyConfig.branchGuid, '22222222-2222-4222-8222-222222222222')
assert.equal(readyReport.agentMapping.agentIds, 'ARCH9-SANDBOX-USER-1')
assert.ok(readyReport.checks.every((check) => check.status === 'PASS'))

const missingSecretReport = await buildPrivatePropertyGoLiveReadinessReport({
  client: createFakeClient(tables),
  listingId,
  environment: 'sandbox',
  secrets: {},
  overrides: {
    suburbId: '12345',
  },
})

assert.equal(missingSecretReport.ready, false)
assert.ok(missingSecretReport.blockers.includes('missing_runtime_secret:PRIVATE_PROPERTY_SANDBOX_USERNAME'))
assert.ok(missingSecretReport.blockers.includes('missing_runtime_secret:PRIVATE_PROPERTY_SANDBOX_PASSWORD'))
assert.equal(missingSecretReport.checks.find((check) => check.name === 'runtime_credentials').status, 'BLOCKED')

const productionReport = createPrivatePropertyGoLiveReadinessReport({
  listingId,
  environment: 'production',
  bundle: {
    listing,
    publication,
    media,
    existingSync: {},
  },
  agencyConfigResolution: {
    ready: false,
    blockers: ['private_property_production_go_live_not_approved'],
    warnings: [],
    source: 'private_property_agency_configs.branch',
    config: {
      ...agencyConfig,
      environment: 'production',
      status: 'sandbox_ready',
      goLiveApprovedAt: '',
    },
  },
  agentMappingResolution: {
    ready: true,
    blockers: [],
    warnings: [],
    source: 'arch9_user',
    agencyConfig: {
      ...agencyConfig,
      environment: 'production',
      status: 'sandbox_ready',
      goLiveApprovedAt: '',
    },
    mapping: {
      privatePropertyAgentId: 'ARCH9-PROD-USER-1',
    },
    agentMapping: {
      agentIds: 'ARCH9-PROD-USER-1',
      privatePropertyAgentId: 'ARCH9-PROD-USER-1',
    },
  },
  credentialResolution: {
    username: 'Arch9User',
    password: 'private-property-password',
    missingSecrets: [],
    redacted: {
      usernamePresent: true,
      passwordPresent: true,
    },
  },
  overrides: {
    suburbId: '12345',
  },
})
assert.equal(productionReport.ready, false)
assert.ok(productionReport.blockers.includes('private_property_production_go_live_not_approved'))
assert.ok(productionReport.blockers.includes('private_property_production_config_not_approved'))

const missingMappingReport = await buildPrivatePropertyGoLiveReadinessReport({
  client: createFakeClient({
    ...tables,
    private_property_agent_mappings: [],
  }),
  listingId,
  environment: 'sandbox',
  secrets: {
    PRIVATE_PROPERTY_SANDBOX_USERNAME: 'Arch9User',
    PRIVATE_PROPERTY_SANDBOX_PASSWORD: 'private-property-password',
  },
  overrides: {
    suburbId: '12345',
  },
})
assert.equal(missingMappingReport.ready, false)
assert.ok(missingMappingReport.blockers.includes('missing_private_property_agent_mapping'))

const serviceSource = read('server/services/privatePropertyGoLiveReadinessService.js')
assert.match(serviceSource, /resolvePrivatePropertyAgencyConfig/)
assert.match(serviceSource, /resolvePrivatePropertyAgentMapping/)
assert.match(serviceSource, /resolvePrivatePropertyRuntimeCredentials/)
assert.match(serviceSource, /createPrivatePropertyArch9ListingPreview/)
assert.match(serviceSource, /privatePropertyApiCalled: false/)
assert.match(serviceSource, /databaseWritten: false/)
assert.match(serviceSource, /rawCredentialsStored: false/)
assert.match(serviceSource, /production_approval/)

const readinessScript = read('scripts/private-property-go-live-readiness.mjs')
assert.match(readinessScript, /buildPrivatePropertyGoLiveReadinessReport/)
assert.match(readinessScript, /private-property-go-live-readiness\.json/)
assert.match(readinessScript, /SUPABASE_SERVICE_ROLE_KEY/)
assert.match(readinessScript, /privatePropertyApiCalled: false/)
assert.doesNotMatch(readinessScript, /createPrivatePropertyClient|updateListing|PRIVATE_PROPERTY_PASSWORD/)

const publishScript = read('scripts/private-property-publish-listing.mjs')
assert.match(publishScript, /resolvePrivatePropertyRuntimeCredentials/)
assert.match(publishScript, /missing_runtime_secret/)
assert.match(publishScript, /goLiveReadiness/)
assert.match(publishScript, /usernameConfigured/)
assert.doesNotMatch(publishScript, /username: config\.username \|\| null/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:go-live-readiness'], 'node scripts/private-property-go-live-readiness.mjs')
assert.equal(packageJson.scripts['test:private-property-go-live-phase3-readiness'], 'node scripts/private-property-phase9-readiness.test.mjs')

console.log('Private Property go-live phase 3 readiness gate contract passed')
