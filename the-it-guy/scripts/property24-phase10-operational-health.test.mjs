import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createProperty24OperationalHealth } from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function createTableQuery(table, rowsByTable, operations) {
  const state = {
    filters: [],
    inFilters: [],
    limitValue: null,
    orderBy: null,
  }
  const query = {
    select(columns) {
      operations.push({ table, op: 'select', columns })
      return this
    },
    eq(column, value) {
      state.filters.push({ column, value })
      operations.push({ table, op: 'eq', column, value })
      return this
    },
    in(column, values) {
      state.inFilters.push({ column, values })
      operations.push({ table, op: 'in', column, values })
      return this
    },
    order(column, options = {}) {
      state.orderBy = { column, ascending: Boolean(options.ascending) }
      operations.push({ table, op: 'order', column, options })
      return this
    },
    limit(value) {
      state.limitValue = value
      operations.push({ table, op: 'limit', value })
      return this
    },
    maybeSingle() {
      return execute(true)
    },
    single() {
      return execute(true)
    },
    then(resolve, reject) {
      return execute(false).then(resolve, reject)
    },
  }

  async function execute(single) {
    let data = rowsByTable[table] || []
    for (const filter of state.filters) {
      data = data.filter((row) => String(row[filter.column]) === String(filter.value))
    }
    for (const filter of state.inFilters) {
      const allowed = new Set(filter.values.map(String))
      data = data.filter((row) => allowed.has(String(row[filter.column])))
    }
    if (state.orderBy) {
      const { column, ascending } = state.orderBy
      data = [...data].sort((left, right) => {
        const leftValue = String(left[column] || '')
        const rightValue = String(right[column] || '')
        return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
      })
    }
    if (state.limitValue) data = data.slice(0, state.limitValue)
    return { data: single ? data[0] || null : data, error: null }
  }

  return query
}

function createFakeSupabase(rowsByTable = {}) {
  const operations = []
  return {
    operations,
    from(table) {
      return createTableQuery(table, rowsByTable, operations)
    },
  }
}

const settingsPage = read('src/pages/settings/SettingsProperty24Page.jsx')
const routeSource = read('api/property24/settings/health.js')
const serviceSource = read('server/property24/healthService.js')
const packageJson = JSON.parse(read('package.json'))
const rootPackageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

assert.match(settingsPage, /Diagnostics/)
assert.match(settingsPage, /\/api\/property24\/settings\/health/)
assert.match(settingsPage, /Sync Status/)
assert.match(settingsPage, /Listings published/)
assert.match(settingsPage, /Leads imported/)
assert.match(settingsPage, /loadProperty24Health/)

assert.match(routeSource, /createProperty24OperationalHealth/)
assert.match(routeSource, /authenticateRequest/)
assert.match(routeSource, /organisation_settings/)
assert.match(routeSource, /SUPABASE_SERVICE_ROLE_KEY/)

assert.match(serviceSource, /private_listings/)
assert.match(serviceSource, /property24_listing_syncs/)
assert.match(serviceSource, /lead_ingestion_logs/)
assert.match(serviceSource, /allowedIds/)

assert.equal(packageJson.scripts['test:property24-phase10-operational-health'], 'node scripts/property24-phase10-operational-health.test.mjs')
assert.equal(rootPackageJson.scripts['test:property24-phase10-operational-health'], 'npm --prefix the-it-guy run test:property24-phase10-operational-health --')

const supabase = createFakeSupabase({
  private_listings: [
    { id: 'listing-1', organisation_id: 'org-1' },
    { id: 'listing-2', organisation_id: 'org-1' },
    { id: 'listing-other', organisation_id: 'org-2' },
  ],
  property24_listing_syncs: [
    {
      private_listing_id: 'listing-1',
      environment: 'exdev',
      agency_id: 31382,
      listing_number: 1001,
      is_on_portal: true,
      external_status: 'on_portal',
      last_successful_sync_at: '2026-08-20T08:00:00.000Z',
    },
    {
      private_listing_id: 'listing-other',
      environment: 'exdev',
      agency_id: 31382,
      listing_number: 9999,
      is_on_portal: true,
      external_status: 'on_portal',
    },
  ],
  lead_ingestion_logs: [
    {
      organisation_id: 'org-1',
      source: 'Property24',
      status: 'processed',
      created_at: '2026-08-20T07:30:00.000Z',
    },
    {
      organisation_id: 'org-1',
      source: 'Property24',
      status: 'failed',
      created_at: '2026-08-20T07:45:00.000Z',
    },
    {
      organisation_id: 'org-2',
      source: 'Property24',
      status: 'processed',
      created_at: '2026-08-20T07:50:00.000Z',
    },
  ],
})

const health = await createProperty24OperationalHealth({
  supabase,
  organisationId: 'org-1',
  settings: {
    enabled: true,
    environment: 'exdev',
    agencyId: '31382',
    agentMappings: [
      { arch9UserId: 'user-1', property24AgentId: '77959' },
      { arch9UserId: 'user-2', property24AgentId: '88001' },
    ],
  },
  config: {
    serverCredentialsReady: true,
    apiInternalTokenReady: true,
    leadSyncSecretReady: true,
  },
  now: new Date('2026-08-20T09:00:00.000Z'),
})

assert.equal(health.phase, 'property24-phase10-operational-health')
assert.equal(health.status, 'WARNING')
assert.equal(health.summary.trackedListingCount, 1)
assert.equal(health.summary.onPortalListingCount, 1)
assert.equal(health.summary.processedLeadImportCount, 1)
assert.equal(health.summary.failedLeadImportCount, 1)
assert.equal(health.summary.recentLeadImportCount, 2)
assert.equal(health.summary.mappedAgentCount, 2)
assert.equal(health.summary.unmappedAgentCount, 0)
assert.equal(health.checks.find((check) => check.key === 'lead_imports')?.status, 'warning')
assert.ok(supabase.operations.some((operation) => operation.table === 'property24_listing_syncs' && operation.op === 'in'))

console.log('Property24 phase 10 operational health contract passed')
