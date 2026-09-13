import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24StatisticsSyncResponse,
  isProperty24StatisticsApiVersionSupported,
  resolveProperty24StatisticsDateWindow,
  syncProperty24ListingStatistics,
} from '../server/property24/index.js'

function createQuery(table, rowsByTable) {
  const state = { action: 'select', filters: [], inFilters: [], payload: null, limit: null }
  const query = {
    select() { return this },
    insert(payload) { state.action = 'insert'; state.payload = payload; return this },
    update(payload) { state.action = 'update'; state.payload = payload; return this },
    upsert(payload, options = {}) { state.action = 'upsert'; state.payload = payload; state.conflict = options.onConflict || ''; return this },
    eq(column, value) { state.filters.push([column, value]); return this },
    in(column, values) { state.inFilters.push([column, values]); return this },
    limit(value) { state.limit = value; return this },
    single() { return execute(true) },
    then(resolve, reject) { return execute(false).then(resolve, reject) },
  }
  async function execute(single) {
    rowsByTable[table] ||= []
    if (state.action === 'insert') {
      const rows = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((row) => ({ id: row.id || `run-${rowsByTable[table].length + 1}`, ...row }))
      rowsByTable[table].push(...rows)
      return { data: single ? rows[0] : rows, error: null }
    }
    if (state.action === 'upsert') {
      const conflictColumns = state.conflict.split(',').filter(Boolean)
      const rows = Array.isArray(state.payload) ? state.payload : [state.payload]
      for (const row of rows) {
        const index = rowsByTable[table].findIndex((existing) => conflictColumns.every((column) => existing[column] === row[column]))
        if (index >= 0) rowsByTable[table][index] = { ...rowsByTable[table][index], ...row }
        else rowsByTable[table].push({ ...row })
      }
      return { data: rows, error: null }
    }
    if (state.action === 'update') {
      for (const row of rowsByTable[table]) {
        if (state.filters.every(([column, value]) => row[column] === value)) Object.assign(row, state.payload)
      }
      return { data: null, error: null }
    }
    let rows = rowsByTable[table]
    for (const [column, value] of state.filters) rows = rows.filter((row) => row[column] === value)
    for (const [column, values] of state.inFilters) rows = rows.filter((row) => values.includes(row[column]))
    if (state.limit) rows = rows.slice(0, state.limit)
    return { data: single ? rows[0] || null : rows, error: null }
  }
  return query
}

function createSupabase(rowsByTable) {
  return { from(table) { return createQuery(table, rowsByTable) } }
}

const rowsByTable = {
  private_listings: [{ id: '11111111-1111-4111-8111-111111111111', organisation_id: '22222222-2222-4222-8222-222222222222' }],
  property24_listing_syncs: [{ private_listing_id: '11111111-1111-4111-8111-111111111111', environment: 'production', agency_id: 31382, listing_number: 100 }],
}
const calls = []
const property24 = {
  apiVersion: 'v55',
  fetchStatisticsLastUpdateDate: async () => ({ status: 200, durationMs: 2, data: '2026-09-12' }),
  fetchAgencyListingStatistics: async (params) => {
    calls.push(params)
    return {
      status: 200,
      durationMs: 4,
      data: [{
        listingNumber: params.listingType === 'Sale' ? 100 : 200,
        agencyId: 31382,
        date: '2026-09-12',
        viewCount: 80,
        requestDetailsLeads: 12,
        whatsAppLeads: 7,
        totalLeads: 19,
        totalContactLeads: 19,
      }],
    }
  },
}

const report = await syncProperty24ListingStatistics({
  supabase: createSupabase(rowsByTable),
  property24,
  now: new Date('2026-09-13T06:15:00.000Z'),
  config: {
    organisationId: '22222222-2222-4222-8222-222222222222',
    agencyId: 31382,
    environment: 'production',
    requestedBy: '33333333-3333-4333-8333-333333333333',
  },
})

assert.equal(report.status, 'completed')
assert.equal(report.receivedCount, 2)
assert.equal(report.storedCount, 2)
assert.deepEqual(calls.map((call) => call.listingType), ['Sale', 'Rental'])
assert.ok(calls.every((call) => call.startDate === '2026-09-06' && call.endDate === '2026-09-13'))
assert.equal(rowsByTable.property24_listing_statistics_daily.length, 2)
assert.equal(rowsByTable.property24_listing_statistics_daily[0].listing_contact_form_leads, 12)
assert.equal(rowsByTable.property24_listing_statistics_daily[0].whatsapp_contact_form_leads, 7)
assert.equal(rowsByTable.property24_listing_statistics_daily.find((row) => row.listing_number === 100).private_listing_id, '11111111-1111-4111-8111-111111111111')
assert.equal(rowsByTable.property24_statistics_sync_runs[0].status, 'completed')

const window = resolveProperty24StatisticsDateWindow({ startDate: '2026-07-01', endDate: '2026-09-01', lastUpdateDate: '2026-09-01' })
assert.deepEqual(window, { startDate: '2026-07-01', endDate: '2026-09-01', lastUpdateDate: '2026-09-01' })
assert.throws(() => resolveProperty24StatisticsDateWindow({ startDate: '2026-07-01', endDate: '2026-09-03' }), /62 days/)
assert.equal(isProperty24StatisticsApiVersionSupported('v55'), true)
assert.equal(isProperty24StatisticsApiVersionSupported('v53'), false)

assert.ok(fs.existsSync(new URL('../api/property24/settings/statistics-sync.js', import.meta.url)))

const scheduled = await createProperty24StatisticsSyncResponse({
  method: 'POST',
  headers: { authorization: 'Bearer statistics-secret' },
  env: {
    SUPABASE_URL: 'https://supabase.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    PROPERTY24_STATISTICS_SYNC_CRON_SECRET: 'statistics-secret',
    PROPERTY24_PRODUCTION_BASE_URL: 'https://api.property24.com',
    PROPERTY24_PRODUCTION_BASIC_AUTH_USERNAME: 'user@example.test',
    PROPERTY24_PRODUCTION_BASIC_AUTH_PASSWORD: 'password',
  },
  dependencies: {
    createSupabase: () => ({
      from: () => ({
        select() { return this },
        eq() { return this },
        limit() { return Promise.resolve({ data: [{ organisation_id: '22222222-2222-4222-8222-222222222222', agency_id: 31382, environment: 'production' }], error: null }) },
      }),
    }),
    createProperty24: () => ({ apiVersion: 'v55' }),
    syncStatistics: async ({ config }) => ({ status: 'completed', storedCount: config.agencyId === 31382 ? 2 : 0 }),
  },
})
assert.equal(scheduled.status, 200)
assert.equal(scheduled.body.status, 'completed')
assert.equal(scheduled.body.reports[0].storedCount, 2)

const rejectedSchedule = await createProperty24StatisticsSyncResponse({ method: 'POST', env: {} })
assert.equal(rejectedSchedule.status, 401)
assert.ok(fs.existsSync(new URL('../api/property24/statistics/sync.js', import.meta.url)))
console.log('Property24 statistics sync passed')
