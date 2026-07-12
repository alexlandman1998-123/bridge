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

const policy = read('src/core/transactions/transactionReferencePolicy.js')
const policyTest = read('src/core/transactions/__tests__/transactionReferencePolicy.test.js')
const headerConfig = read('src/core/transactions/workspaceHeaderConfig.js')
const headerConfigTest = read('src/core/transactions/__tests__/workspaceHeaderConfig.test.js')
const workspaceHeader = read('src/components/TransactionWorkspaceHeader.jsx')
const unitDetail = read('src/pages/UnitDetail.jsx')
const policyDoc = read('docs/transaction-reference-policy.md')

for (const marker of [
  'buildTransactionReferenceDisplayModel',
  'canViewTransactionReference',
  'TRANSACTION_REFERENCE_SOURCE_LABELS',
  'fallbackStorageTarget',
  'transactionFinanceWorkflow?.applications',
  'partnerItems',
]) {
  includes(policy, marker, `Policy display model should preserve ${marker}`)
}

for (const marker of [
  'display model makes the Bridge matter number the primary audience reference',
  'display model falls back safely when the Bridge matter number is missing',
  'display model aggregates visible partner reference numbers',
  'display visibility follows audience policy',
]) {
  includes(policyTest, marker, `Policy tests should cover ${marker}`)
}

for (const marker of [
  'buildReferenceStats',
  'referenceSummary',
  'Shared transaction reference',
  'includePartnerReferences: false',
]) {
  includes(headerConfig, marker, `Header config should preserve ${marker}`)
}

for (const marker of [
  'developer header includes the shared Bridge matter number before operational stats',
  'partner-facing header can surface visible partner reference numbers',
  'buildWorkspaceHeaderConfigForRole',
]) {
  includes(headerConfigTest, marker, `Header config tests should cover ${marker}`)
}

for (const marker of [
  'Hash',
  'reference: Hash',
]) {
  includes(workspaceHeader, marker, `Workspace header should expose ${marker}`)
}

for (const marker of [
  'buildTransactionReferenceDisplayModel',
  'transactionReferenceSummary',
  'transactionReferenceSummary.primary?.displayValue',
  'referenceSummary: transactionReferenceSummary',
  'transactionFinanceWorkflow?.applications',
]) {
  includes(unitDetail, marker, `UnitDetail should preserve ${marker}`)
}

for (const marker of [
  'Status: Phase 7 reference audit visibility',
  'Phase 4 adds the shared read/display model',
  '`buildTransactionReferenceDisplayModel`',
  'The Bridge Matter No is the primary display reference',
  'Phase 4 does not introduce new edit permissions',
]) {
  includes(policyDoc, marker, `Policy doc should preserve ${marker}`)
}

console.log('transaction reference phase 4 tests passed')
