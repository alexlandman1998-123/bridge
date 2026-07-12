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
const api = read('src/lib/api.js')
const policyDoc = read('docs/transaction-reference-policy.md')

for (const marker of [
  'correctTransactionReference',
  'getCorrectableTransactionReferenceTypesForRole',
  'getTransactionReferencePolicy',
  'DEFAULT_REFERENCE_CORRECTION_FORM',
  'referenceCorrectionModalOpen',
  'referenceCorrectionSaving',
  'referenceCorrectionError',
  'referenceCorrectionRole',
  'getTransactionReferenceCorrectionValue',
  'openReferenceCorrectionModal',
  'handleSubmitReferenceCorrection',
  'referenceCorrectionOptions',
  'canCorrectTransactionReferences',
  'Correct Reference',
  'Correct Transaction Reference',
  'Audit Reason',
  'Save Correction',
  'form="transaction-reference-correction-form"',
]) {
  includes(unitDetail, marker, `UnitDetail admin correction UX should preserve ${marker}`)
}

for (const marker of [
  'const actorRole = normalizeTextValue(actorProfile.rawRole || actorProfile.role || \'\')',
  'canCorrectTransactionReference(referenceType, actorRole)',
  'Corrected reference value cannot be blank.',
  'A correction reason is required.',
]) {
  includes(api, marker, `API correction guard should preserve ${marker}`)
}

for (const marker of [
  'Status: Phase 7 reference audit visibility',
  'Phase 6 exposes the correction contract in the transaction workspace',
  '`Correct Reference` action',
  '`getCorrectableTransactionReferenceTypesForRole`',
  '`correctTransactionReference`',
  'Phase 6 is an admin UX layer only',
]) {
  includes(policyDoc, marker, `Policy doc should preserve ${marker}`)
}

console.log('transaction reference phase 6 tests passed')
