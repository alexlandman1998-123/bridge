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
const api = read('src/lib/api.js')
const policyDoc = read('docs/transaction-reference-policy.md')

for (const marker of [
  'canCorrectTransactionReference',
  'getCorrectableTransactionReferenceTypesForRole',
  'policy.editable',
  'policy.correctionRoles',
]) {
  includes(policy, marker, `Policy should preserve ${marker}`)
}

for (const marker of [
  'canCorrectTransactionReference',
  'getCorrectableTransactionReferenceTypesForRole',
  'transferAttorneyMatterNumber, \'internal_admin\'',
]) {
  includes(policyTest, marker, `Policy tests should cover ${marker}`)
}

for (const marker of [
  'correctTransactionReference',
  'TRANSACTION_REFERENCE_CORRECTION_COLUMNS',
  'TRANSACTION_REFERENCE_CORRECTION_SELECT',
  'getTransactionReferenceCorrectionValue',
  'Reference type must be a Bridge-owned transaction reference.',
  'canCorrectTransactionReference(referenceType, actorRole)',
  'Corrected reference value cannot be blank.',
  'A correction reason is required.',
  "nextSource: 'correction'",
  'correctedColumn: correctionColumn',
  "correction: true",
]) {
  includes(api, marker, `API correction mutation should preserve ${marker}`)
}

for (const marker of [
  'Status: Phase 7 reference audit visibility',
  'Phase 5 adds the trusted correction path',
  '`correctTransactionReference`',
  '`canCorrectTransactionReference`',
  'Corrected values must be explicit and non-blank',
  'Every correction must include a reason',
  'Phase 5 does not make Bridge-owned references generally editable',
]) {
  includes(policyDoc, marker, `Policy doc should preserve ${marker}`)
}

console.log('transaction reference phase 5 tests passed')
