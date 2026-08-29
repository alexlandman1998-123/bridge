import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

class QueryBuilder {
  constructor(client, table) {
    this.client = client
    this.table = table
    this.selection = ''
    this.filters = []
  }

  select(selection) {
    this.selection = selection
    return this
  }

  eq(column, value) {
    this.filters.push({ operation: 'eq', column, value })
    return this
  }

  ilike(column, value) {
    this.filters.push({ operation: 'ilike', column, value })
    return this
  }

  in(column, values) {
    this.filters.push({ operation: 'in', column, values })
    return this
  }

  order() {
    return this
  }

  async maybeSingle() {
    const result = await this.client.execute(this)
    return { ...result, data: result.data?.[0] || null }
  }

  then(resolve, reject) {
    return Promise.resolve(this.client.execute(this)).then(resolve, reject)
  }
}

const transactions = [
  {
    id: 'tx-a',
    organisation_id: 'org-a',
    owner_user_id: 'user-a',
    assigned_agent_email: 'agent@example.test',
    assigned_agent: 'Agent One',
    unit_id: 'unit-a',
    buyer_id: 'buyer-a',
    development_id: 'dev-a',
    stage: 'OTP Signed',
    current_main_stage: 'OTP',
    updated_at: '2026-08-29T12:00:00.000Z',
    is_active: true,
    buyer: { id: 'buyer-a', name: 'Buyer A', phone: '1', email: 'buyer@example.test' },
    unit: {
      id: 'unit-a',
      development_id: 'dev-a',
      unit_number: 'A1',
      status: 'Under Offer',
      development: { id: 'dev-a', name: 'Development A', location: 'Cape Town' },
    },
    development: { id: 'dev-a', name: 'Development A', location: 'Cape Town' },
  },
  {
    id: 'tx-b',
    organisation_id: 'org-b',
    owner_user_id: 'user-a',
    unit_id: 'unit-b',
    buyer_id: 'buyer-b',
    development_id: 'dev-b',
    stage: 'OTP Signed',
    updated_at: '2026-08-29T11:00:00.000Z',
    is_active: true,
  },
]

const datasets = {
  transactions,
  transaction_participants: [
    { transaction_id: 'tx-a', user_id: 'user-a', participant_email: 'agent@example.test', role_type: 'agent', status: 'active', removed_at: null },
    { transaction_id: 'tx-b', user_id: 'user-a', participant_email: 'agent@example.test', role_type: 'agent', status: 'active', removed_at: null },
  ],
  profiles: [{ id: 'user-a', email: 'agent@example.test', full_name: 'Agent One' }],
}

function matches(client, table, row, filters) {
  return filters.every((filter) => {
    const transaction = table === 'transaction_participants'
      ? client.transactionsById.get(row.transaction_id)
      : null
    const actual = filter.column.startsWith('transaction.')
      ? transaction?.[filter.column.slice('transaction.'.length)]
      : row?.[filter.column]
    if (filter.operation === 'eq') return actual === filter.value
    if (filter.operation === 'ilike') return String(actual || '').toLowerCase() === String(filter.value || '').toLowerCase()
    if (filter.operation === 'in') return filter.values.includes(actual)
    return true
  })
}

const calls = []
const client = {
  transactionsById: new Map(transactions.map((row) => [row.id, row])),
  from(table) {
    return new QueryBuilder(this, table)
  },
  execute(query) {
    calls.push({ table: query.table, selection: query.selection, filters: query.filters })
    return {
      data: (datasets[query.table] || []).filter((row) => matches(this, query.table, row, query.filters)),
      error: null,
    }
  },
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { fetchTransactionsByParticipantSummary } = await server.ssrLoadModule('/src/lib/transactionsListApi.js')
  const options = {
    client,
    userId: 'user-a',
    roleType: 'agent',
    organisationId: 'org-a',
    identityContext: { email: 'agent@example.test', fullName: 'Agent One' },
  }
  const rows = await fetchTransactionsByParticipantSummary(options)

  assert.deepEqual(rows.map((row) => row.transaction.id), ['tx-a'])
  assert.equal(rows[0].buyer.name, 'Buyer A')
  assert.equal(rows[0].unit.id, 'unit-a')
  assert.equal(rows[0].development.id, 'dev-a')
  assert.equal(calls.some((call) => call.table === 'profiles'), false, 'existing auth identity should be reused')
  assert.equal(calls.some((call) => ['buyers', 'units', 'developments'].includes(call.table)), false, 'related summary data must not use follow-up queries')

  const summaryCall = calls.find((call) => call.table === 'transactions' && call.selection.includes('buyer:buyers'))
  assert.ok(summaryCall, 'one nested transaction summary query should hydrate all related rows')
  assert.deepEqual(summaryCall.filters.find((filter) => filter.operation === 'in' && filter.column === 'id')?.values, ['tx-a'])
  assert.equal(summaryCall.filters.some((filter) => filter.column === 'organisation_id' && filter.value === 'org-a'), true)

  const callCount = calls.length
  await fetchTransactionsByParticipantSummary(options)
  assert.equal(calls.length, callCount, 'the second request should reuse the 60-second cache')

  console.log('Transactions scoped summary tests passed')
} finally {
  await server.close()
}
