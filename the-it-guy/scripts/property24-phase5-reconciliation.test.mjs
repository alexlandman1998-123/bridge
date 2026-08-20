import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  clampProperty24LeadsAfter,
  clampProperty24UpdatesFromDate,
  createProperty24ApiResponse,
  createProperty24ReconciliationComparison,
  normalizeProperty24LeadForImport,
  runProperty24ReconciliationJob,
} from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function createQuery(table, rows, operations = []) {
  const state = {
    filters: [],
    inFilters: [],
    limitValue: null,
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
    limit(value) {
      state.limitValue = value
      operations.push({ table, op: 'limit', value })
      return this
    },
    then(resolve) {
      let data = rows[table] || []
      for (const filter of state.filters) {
        data = data.filter((row) => String(row[filter.column]) === String(filter.value))
      }
      for (const filter of state.inFilters) {
        const accepted = new Set(filter.values.map(String))
        data = data.filter((row) => accepted.has(String(row[filter.column])))
      }
      if (state.limitValue) data = data.slice(0, state.limitValue)
      return Promise.resolve({ data, error: null }).then(resolve)
    },
  }
  return query
}

function createFakeSupabase(rows) {
  const operations = []
  return {
    operations,
    from(table) {
      return createQuery(table, rows, operations)
    },
  }
}

const now = new Date('2026-08-20T10:00:00.000Z')
assert.equal(clampProperty24UpdatesFromDate('2026-08-01T00:00:00.000Z', now), '2026-08-13T10:00:00.000Z')
assert.equal(clampProperty24UpdatesFromDate('2026-09-01T00:00:00.000Z', now), '2026-08-20T10:00:00.000Z')
assert.equal(clampProperty24LeadsAfter('2026-07-01T00:00:00.000Z', now), '2026-07-21T10:00:00.000Z')

const comparison = createProperty24ReconciliationComparison({
  localRows: [
    {
      sync: {
        private_listing_id: 'listing-1',
        agency_id: 31382,
        listing_number: 100,
        external_status: 'on_portal',
        is_on_portal: true,
      },
      listing: { id: 'listing-1', organisation_id: 'org-1', property24_status: 'published' },
    },
    {
      sync: {
        private_listing_id: 'listing-2',
        agency_id: 31382,
        listing_number: 200,
        external_status: 'submitted',
        is_on_portal: false,
      },
      listing: { id: 'listing-2', organisation_id: 'org-1', property24_status: 'draft' },
    },
  ],
  remoteRows: [
    { ListingNumber: 100, ListingStatus: 'Expired', IsOnPortal: false },
    { ListingNumber: 300, ListingStatus: 'Active', IsOnPortal: true },
  ],
})
assert.equal(comparison.summary.matchedCount, 1)
assert.equal(comparison.summary.statusDriftCount, 1)
assert.equal(comparison.summary.missingOnProperty24Count, 1)
assert.equal(comparison.summary.unexpectedOnProperty24Count, 1)
assert.equal(comparison.statusDrift[0].listingId, 'listing-1')

const listingMap = new Map([
  [
    100,
    {
      listingId: 'listing-1',
      listing: { organisationId: 'org-1' },
    },
  ],
])
const normalizedLead = normalizeProperty24LeadForImport({
  ListingNumber: 100,
  ContactName: 'Alex Buyer',
  EmailAddress: 'alex@example.test',
  PhoneNumber: '067 000 0000',
  Message: 'Please call me',
  ReceivedAt: '2026-08-20T09:30:00.000Z',
}, listingMap)
assert.equal(normalizedLead.source, 'Property24')
assert.equal(normalizedLead.listingId, 'listing-1')
assert.equal(normalizedLead.organisationId, 'org-1')
assert.equal(normalizedLead.readyForCrmIngestion, true)
assert.equal(normalizedLead.dedupeKey.length, 64)

const supabase = createFakeSupabase({
  property24_listing_syncs: [
    {
      id: 'sync-1',
      private_listing_id: 'listing-1',
      environment: 'exdev',
      agency_id: 31382,
      listing_number: 100,
      external_status: 'on_portal',
      is_on_portal: true,
    },
  ],
  private_listings: [
    {
      id: 'listing-1',
      organisation_id: 'org-1',
      title: '7A Stegman Street',
      listing_status: 'active',
      property24_status: 'published',
      property24_reference: '100',
    },
  ],
})
const calls = []
const property24 = {
  fetchListingReconciliation: async (params) => {
    calls.push(['reconciliation', params])
    return { status: 200, durationMs: 4, data: [{ ListingNumber: 100, ListingStatus: 'on_portal', IsOnPortal: true }] }
  },
  fetchListingUpdates: async (fromDate) => {
    calls.push(['updates', fromDate])
    return { status: 200, durationMs: 5, data: [{ ListingNumber: 999, ListingStatus: 'Expired' }] }
  },
  checkListingOnPortal: async () => ({ status: 200, durationMs: 3, data: true }),
  fetchListingLeads: async ({ after }) => {
    calls.push(['leads', after])
    return {
      status: 200,
      durationMs: 6,
      data: {
        nextAfter: '2026-08-20T09:31:00.000Z',
        leads: [
          {
            ListingNumber: 100,
            ContactName: 'Alex Buyer',
            EmailAddress: 'alex@example.test',
            Message: 'Please call me',
            ReceivedAt: '2026-08-20T09:30:00.000Z',
          },
          {
            ListingNumber: 100,
            ContactName: 'Alex Buyer',
            EmailAddress: 'alex@example.test',
            Message: 'Please call me',
            ReceivedAt: '2026-08-20T09:30:00.000Z',
          },
        ],
      },
    }
  },
  fetchStatisticsLastUpdateDate: async () => ({ status: 200, durationMs: 1, data: '2026-08-20T00:00:00.000Z' }),
  fetchAgencyListingStatistics: async () => ({ status: 200, durationMs: 1, data: [] }),
  fetchLeadStatisticsPeriods: async () => ({ status: 200, durationMs: 1, data: [] }),
}
const report = await runProperty24ReconciliationJob({
  supabase,
  property24,
  now,
  config: {
    environment: 'exdev',
    agencyId: 31382,
    fromDate: '2026-08-01T00:00:00.000Z',
    after: '2026-07-01T00:00:00.000Z',
    includeLeads: true,
    includePortalChecks: true,
    includeStatistics: true,
  },
})
assert.equal(report.mode, 'REPORT_ONLY')
assert.equal(report.safety.databaseWritten, false)
assert.equal(report.status, 'NEEDS_REVIEW')
assert.equal(report.updates.fromDate, '2026-08-13T10:00:00.000Z')
assert.equal(report.leadImportPlan.after, '2026-07-21T10:00:00.000Z')
assert.equal(report.leadImportPlan.summary.receivedCount, 2)
assert.equal(report.leadImportPlan.summary.readyForCrmIngestionCount, 1)
assert.equal(report.leadImportPlan.summary.needsReviewCount, 1)
assert.ok(calls.some(([name]) => name === 'reconciliation'))
assert.ok(calls.some(([name]) => name === 'leads'))

const apiResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/reconciliation/run',
  headers: { 'x-property24-api-token': 'token' },
  body: JSON.stringify({ includeLeads: true }),
  env: {
    PROPERTY24_API_INTERNAL_TOKEN: 'token',
    PROPERTY24_SYNDICATION_ENABLED: 'true',
    SUPABASE_URL: 'https://supabase.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    PROPERTY24_BASIC_AUTH_USERNAME: 'user@example.test',
    PROPERTY24_BASIC_AUTH_PASSWORD: 'secret',
    PROPERTY24_DEFAULT_AGENCY_ID: '31382',
  },
  dependencies: {
    createSupabase: () => supabase,
    createProperty24: () => property24,
    runReconciliation: async ({ config }) => ({
      status: config.includeLeads ? 'OK' : 'NEEDS_REVIEW',
      reconciliation: { summary: {} },
      updates: { summary: {} },
    }),
  },
})
assert.equal(apiResponse.status, 200)
assert.equal(apiResponse.body.route, 'runReconciliation')
assert.equal(apiResponse.body.status, 'OK')

for (const path of [
  'server/property24/reconciliationService.js',
  'api/property24/reconciliation/run.js',
  'scripts/property24-reconcile.mjs',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}
assert.match(read('server/property24/apiContract.js'), /runReconciliation/)
assert.match(read('server/property24/api.js'), /runProperty24ReconciliationJob/)
assert.match(read('scripts/property24-reconcile.mjs'), /--include-leads/)
const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:reconcile'], 'node scripts/property24-reconcile.mjs')
assert.equal(packageJson.scripts['test:property24-phase5-reconciliation'], 'node scripts/property24-phase5-reconciliation.test.mjs')
const rootPackageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
assert.equal(rootPackageJson.scripts['property24:reconcile'], 'npm --prefix the-it-guy run property24:reconcile --')

console.log('Property24 phase 5 reconciliation contract passed')
