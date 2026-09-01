import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  isCurrentDevelopmentTransactionRow,
  selectCurrentDevelopmentTransactionRows,
} from '../developmentTransactionVisibility.js'

const rows = [
  {
    unit: { id: 'unit-001', unit_number: '001' },
    transaction: { id: 'tx-current', is_active: true, lifecycle_state: 'active' },
  },
  {
    unit: { id: 'unit-001', unit_number: '001' },
    transaction: { id: 'tx-history-1', is_active: false, lifecycle_state: 'active' },
  },
  {
    unit: { id: 'unit-001', unit_number: '001' },
    transaction: { id: 'tx-history-2', is_active: false, lifecycle_state: 'active' },
  },
  {
    unit: { id: 'unit-002', unit_number: '002' },
    transaction: { id: 'tx-archived', is_active: true, lifecycle_state: 'archived' },
  },
  {
    unit: { id: 'unit-003', unit_number: '003' },
    transaction: { id: 'tx-cancelled', is_active: true, cancelled_at: '2026-08-31T10:00:00.000Z' },
  },
  {
    unit: { id: 'unit-004', unit_number: '004' },
    transaction: null,
  },
]

const currentRows = selectCurrentDevelopmentTransactionRows(rows)
const unitInventory = Array.from({ length: 31 }, (_, index) => ({
  id: `unit-${String(index + 1).padStart(3, '0')}`,
}))

assert.deepEqual(
  currentRows.map((row) => row.transaction.id),
  ['tx-current'],
  'inactive repeats for one unit and terminal lifecycle records must stay out of the current transaction table',
)
assert.equal(
  rows.filter((row) => row.unit?.id === 'unit-001').length,
  3,
  'filtering the current view must not mutate or delete historical transaction records',
)
assert.equal(isCurrentDevelopmentTransactionRow({ transaction: { id: 'tx-compatible' } }), true)
assert.equal(selectCurrentDevelopmentTransactionRows(null).length, 0)
assert.equal(unitInventory.length, 31, 'current transaction filtering must remain independent of unit inventory')

const [apiSource, pageSource] = await Promise.all([
  readFile(new URL('../../../lib/api.js', import.meta.url), 'utf8'),
  readFile(new URL('../../../pages/DevelopmentDetail.jsx', import.meta.url), 'utf8'),
])

assert.match(
  apiSource,
  /const currentTransactionRows = selectCurrentDevelopmentTransactionRows\(await fetchTransactionsListSummary\(\{[\s\S]*?developmentId,[\s\S]*?activeTransactionsOnly: true,/,
  'development detail must request only active transaction rows',
)
assert.match(
  pageSource,
  /selectCurrentDevelopmentTransactionRows\(data\?\.transactionRows \|\| rows\)/,
  'the transaction table must defensively filter stale or legacy payloads',
)

console.log('Development current transaction visibility tests passed')
