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
const attorneyAssignments = read('src/services/transactionAttorneyAssignments.js')
const api = read('src/lib/api.js')
const assignmentSection = read('src/components/attorney/assignments/AttorneyAssignmentSection.jsx')
const assignmentCard = read('src/components/attorney/assignments/AttorneyAssignmentSummaryCard.jsx')
const policyDoc = read('docs/transaction-reference-policy.md')

for (const marker of [
  'normalizeTransactionReferenceSource',
  'isAttorneyMatterReferenceType',
  'isBondApplicationReferenceType',
  'getAttorneyMatterReferenceTypeForRole',
]) {
  includes(policy, marker, `Policy should expose ${marker}`)
  includes(policyTest, marker, `Policy tests should cover ${marker}`)
}

for (const marker of [
  'updateTransactionAttorneyMatterReference',
  'getAttorneyMatterReferenceTypeForRole(existing.attorneyRole)',
  'policy.scope !== TRANSACTION_REFERENCE_SCOPES.attorneyAssignment',
  'policy.assignmentRole && policy.assignmentRole !== existing.attorneyRole',
  'assertActorCanEditMatterReference',
  'matter_reference: nextValue',
  'matter_reference_source: nextSource',
  'matter_reference_updated_by: actor.id',
  'matter_reference_updated_at: now',
  "event_type: 'TransactionUpdated'",
  "changeType: 'transaction_reference_updated'",
  'previousValue',
  'newValue: nextValue',
  'reason',
]) {
  includes(attorneyAssignments, marker, `Attorney assignments service should preserve ${marker}`)
}

for (const marker of [
  'logTransactionReferenceChangeIfNeeded',
  'TRANSACTION_REFERENCE_TYPES.bondOriginatorApplicationReference',
  'TRANSACTION_REFERENCE_TYPES.bankApplicationReference',
  "changeType: 'transaction_reference_updated'",
  'storageTarget: policy?.storageTarget',
  'previousValue: existing.data.application_reference || null',
  'nextValue: update.data.application_reference || null',
  'previousValue: existing.data.reference_number || null',
  'nextValue: update.data.reference_number || null',
  "eventType: 'BondHybridFinanceApplicationUpdated'",
]) {
  includes(api, marker, `Bond application API should preserve ${marker}`)
}

for (const marker of [
  'updateTransactionAttorneyMatterReference',
  'handleMatterReferenceUpdate',
  'updated_attorney_matter_reference',
  'canEditMatterReference={canUpdateAssignments && Boolean(item?.id)}',
  'onUpdateMatterReference={canUpdateAssignments ? handleMatterReferenceUpdate : null}',
]) {
  includes(assignmentSection, marker, `Attorney assignment section should preserve ${marker}`)
}

for (const marker of [
  'Edit Matter No',
  'Save Matter No',
  'Audit Reason',
  'matterReferenceValue',
  "source: 'partner_portal'",
  'onUpdateMatterReference(assignment',
]) {
  includes(assignmentCard, marker, `Attorney assignment summary card should preserve ${marker}`)
}

for (const marker of [
  'Status: Phase 7 reference audit visibility',
  'Phase 3 wires partner-owned reference edits through policy-aware mutation paths',
  'updateTransactionAttorneyMatterReference',
  'Bond originator and bank application references are audited',
  '`transaction_events` row',
  'Bridge-owned transaction references remain read-only',
]) {
  includes(policyDoc, marker, `Policy doc should preserve ${marker}`)
}

console.log('transaction reference phase 3 tests passed')
