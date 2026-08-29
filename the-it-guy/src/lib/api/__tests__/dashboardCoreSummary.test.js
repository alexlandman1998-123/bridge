import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

class QueryBuilder {
  constructor(client, table) {
    this.client = client
    this.table = table
    this.filters = []
    this.selection = ''
  }

  select(selection) {
    this.selection = selection
    return this
  }

  eq(column, value) {
    this.filters.push({ operation: 'eq', column, value })
    return this
  }

  in(column, values) {
    this.filters.push({ operation: 'in', column, values })
    return this
  }

  not(column, operation, value) {
    this.filters.push({ operation: 'not', column, comparator: operation, value })
    return this
  }

  order() {
    return this
  }

  then(resolve, reject) {
    return Promise.resolve(this.client.execute(this)).then(resolve, reject)
  }
}

function matchesFilters(row, filters) {
  return filters.every((filter) => {
    if (filter.operation === 'eq') return row?.[filter.column] === filter.value
    if (filter.operation === 'in') return filter.values.includes(row?.[filter.column])
    if (filter.operation === 'not' && filter.comparator === 'is') return row?.[filter.column] !== filter.value
    return true
  })
}

const calls = []
const datasets = {
  developments: [
    { id: 'dev-1', name: 'Fast Development', location: 'Cape Town', organisation_id: 'org-1' },
    { id: 'dev-2', name: 'Other Development', location: 'Johannesburg', organisation_id: 'org-2' },
  ],
  units: [
    {
      id: 'unit-1',
      development_id: 'dev-1',
      unit_number: '101',
      price: 2_000_000,
      status: 'Under Offer',
      development: { id: 'dev-1', name: 'Fast Development' },
    },
    {
      id: 'unit-2',
      development_id: 'dev-2',
      unit_number: '202',
      price: 3_000_000,
      status: 'Available',
      development: { id: 'dev-2', name: 'Other Development' },
    },
  ],
  transactions: [
    {
      id: 'tx-1',
      organisation_id: 'org-1',
      development_id: 'dev-1',
      unit_id: 'unit-1',
      buyer_id: 'buyer-1',
      transaction_reference: 'TX-001',
      stage: 'OTP Signed',
      current_main_stage: 'OTP',
      sales_price: 2_000_000,
      updated_at: '2026-08-29T12:00:00.000Z',
      created_at: '2026-08-20T12:00:00.000Z',
      is_active: true,
    },
  ],
  buyers: [{ id: 'buyer-1', name: 'Buyer One', email: 'buyer@example.test' }],
}

const client = {
  from(table) {
    return new QueryBuilder(this, table)
  },
  execute(builder) {
    calls.push({ table: builder.table, selection: builder.selection, filters: builder.filters })
    const rows = (datasets[builder.table] || []).filter((row) => matchesFilters(row, builder.filters))
    return { data: rows, error: null }
  },
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { fetchDashboardOverview } = await server.ssrLoadModule('/src/lib/api/dashboardOverviewApi.js')
  const overview = await fetchDashboardOverview({
    client,
    organisationId: 'org-1',
    includeSecondaryData: false,
  })

  assert.equal(overview.rows.length, 1, 'core summary should return only the scoped organisation row')
  assert.equal(overview.rows[0].transaction.id, 'tx-1')
  assert.equal(overview.rows[0].buyer.name, 'Buyer One')
  assert.equal(overview.rows[0].unit.id, 'unit-1')
  assert.equal(overview.rows[0].development.id, 'dev-1')

  const unitsCall = calls.find((call) => call.table === 'units')
  assert.deepEqual(
    unitsCall.filters.find((filter) => filter.operation === 'in' && filter.column === 'development_id')?.values,
    ['dev-1'],
    'unit query should be scoped in the database instead of filtered after fetching every unit',
  )

  const queriedTables = new Set(calls.map((call) => call.table))
  for (const secondaryTable of [
    'documents',
    'document_requests',
    'transaction_role_players',
    'transaction_finance_workflows',
    'transaction_handover',
    'transaction_commissions',
  ]) {
    assert.equal(queriedTables.has(secondaryTable), false, `${secondaryTable} must not block the core Dashboard summary`)
  }

  console.log('Dashboard core summary tests passed')
} finally {
  await server.close()
}
