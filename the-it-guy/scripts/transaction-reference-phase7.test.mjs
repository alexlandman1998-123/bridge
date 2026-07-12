import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

const unitDetail = read('src/pages/UnitDetail.jsx')
const policyDoc = read('docs/transaction-reference-policy.md')

for (const marker of [
  'getTransactionEventData',
  'normalizeTransactionReferenceHistoryEvent',
  'transaction_reference_updated',
  'transactionReferenceHistory',
  'canViewTransactionReferenceHistory',
  'referenceHistoryModalOpen',
  'Reference History',
  'setReferenceHistoryModalOpen(true)',
  'previousValue',
  'newValue',
  'Storage Target',
  'No reference changes have been audited for this transaction.',
]) {
  includes(unitDetail, marker, `UnitDetail reference history should preserve ${marker}`)
}

for (const marker of [
  'Status: Phase 7 reference audit visibility',
  'Phase 7 exposes reference-change audit history',
  '`transaction_events` rows with `changeType: transaction_reference_updated`',
  '`Reference History`',
  'The audit view is read-only',
  'Phase 7 does not add new write paths',
]) {
  includes(policyDoc, marker, `Policy doc should preserve ${marker}`)
}

console.log('transaction reference phase 7 tests passed')
