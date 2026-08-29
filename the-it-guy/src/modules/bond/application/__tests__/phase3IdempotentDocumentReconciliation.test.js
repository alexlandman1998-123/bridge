import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION,
  buildBondApplicationDocumentReconciliationPlan,
  buildBondApplicationRequirementIdentity,
} from '../index.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(testDirectory, '../../../../../..')

function requirement(overrides = {}) {
  return {
    key: 'bond_application_primary_applicant_bank_statements',
    baseRequirementKey: 'bond_application_primary_applicant_bank_statements',
    scope: 'participant',
    participantRole: 'primary_applicant',
    participantKey: 'primary_applicant:1',
    title: 'Latest bank statements',
    description: 'Bank statements supporting affordability.',
    category: 'Financial documents',
    required: true,
    minimumFileCount: 1,
    order: 30,
    requirementBaselineVersion: 'za-baseline-2026-08-v1',
    originatorProfileKey: 'example_originator',
    originatorProfileVersion: 'example-v1',
    requirementProfileFingerprint: 'phase-2-v1:profile1',
    decisionFingerprint: 'phase-1-v1:decision1',
    ...overrides,
  }
}

const primary = requirement()
const coApplicant = requirement({
  key: 'co_applicant:1:bond_application_co_applicant_bank_statements',
  participantRole: 'co_applicant',
  participantKey: 'co_applicant:1',
})
const primaryIdentity = buildBondApplicationRequirementIdentity(primary)
const coApplicantIdentity = buildBondApplicationRequirementIdentity(coApplicant)

assert.equal(BOND_APPLICATION_DOCUMENT_RECONCILIATION_VERSION, 'phase-3-v1')
assert.notEqual(primaryIdentity, coApplicantIdentity)
assert.equal(
  buildBondApplicationRequirementIdentity({ ...primary, originatorProfileVersion: 'example-v2' }),
  primaryIdentity,
  'Profile version changes must update the same requirement row.',
)

const existingPrimary = {
  id: 'required-row-1',
  transaction_id: 'transaction-1',
  document_key: primary.key,
  requirement_identity: primaryIdentity,
  is_required: true,
  is_uploaded: true,
  status: 'accepted',
  uploaded_document_id: 'document-1',
  uploaded_at: '2026-08-27T10:00:00.000Z',
  verified_at: '2026-08-27T11:00:00.000Z',
  notes: 'Keep this operational note.',
  group_key: 'bond_application_documents',
}
const firstPlan = buildBondApplicationDocumentReconciliationPlan({
  transactionId: 'transaction-1',
  activeRequirements: [primary, coApplicant],
  existingRequiredDocuments: [existingPrimary],
})

assert.equal(firstPlan.reconciliationVersion, 'phase-3-v1')
assert.equal(firstPlan.rowsToUpsert.length, 2)
assert.equal(firstPlan.reusedRows.length, 1)
assert.equal(firstPlan.inactiveRows.length, 0)
const reusedPrimary = firstPlan.rowsToUpsert.find((row) => row.requirement_identity === primaryIdentity)
assert.equal(reusedPrimary.uploaded_document_id, 'document-1')
assert.equal(reusedPrimary.status, 'accepted')
assert.equal(reusedPrimary.verified_at, '2026-08-27T11:00:00.000Z')
assert.equal(reusedPrimary.notes, 'Keep this operational note.')

const repeatedPlan = buildBondApplicationDocumentReconciliationPlan({
  transactionId: 'transaction-1',
  activeRequirements: [primary, coApplicant],
  existingRequiredDocuments: firstPlan.rowsToUpsert,
})
assert.deepEqual(repeatedPlan.rowsToUpsert, firstPlan.rowsToUpsert)
assert.equal(repeatedPlan.rowsToUpsert.length, 2)
assert.equal(repeatedPlan.reusedRows.length, 2)

const duplicatePlan = buildBondApplicationDocumentReconciliationPlan({
  transactionId: 'transaction-1',
  activeRequirements: [primary, { ...primary, title: 'Duplicate title' }],
})
assert.equal(duplicatePlan.rowsToUpsert.length, 1)
assert.equal(duplicatePlan.diagnostics[0].code, 'duplicate_active_requirement_identity')

const staleUploadedCoApplicant = {
  ...firstPlan.rowsToUpsert.find((row) => row.requirement_identity === coApplicantIdentity),
  id: 'required-row-2',
  is_uploaded: true,
  status: 'uploaded',
  uploaded_document_id: 'document-2',
}
const changedPlan = buildBondApplicationDocumentReconciliationPlan({
  transactionId: 'transaction-1',
  activeRequirements: [primary],
  existingRequiredDocuments: [existingPrimary, staleUploadedCoApplicant],
})
assert.equal(changedPlan.inactiveRows.length, 1)
assert.equal(changedPlan.inactiveRows[0].enabled, false)
assert.equal(changedPlan.inactiveRows[0].is_required, false)
assert.equal(changedPlan.inactiveRows[0].status, 'uploaded')
assert.equal(changedPlan.inactiveRows[0].uploaded_document_id, 'document-2')

const migrationPath = path.join(
  workspaceRoot,
  'supabase/migrations/20260828203724_bond_application_idempotent_document_reconciliation.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')
const apiSource = fs.readFileSync(path.join(workspaceRoot, 'the-it-guy/src/lib/api.js'), 'utf8')
for (const column of [
  'requirement_identity',
  'requirement_identity_version',
  'requirement_base_key',
  'participant_role',
  'participant_key',
  'requirement_baseline_version',
  'originator_profile_key',
  'originator_profile_version',
  'requirement_profile_fingerprint',
  'decision_fingerprint',
  'reconciliation_fingerprint',
  'reconciliation_source',
  'reconciled_at',
]) {
  assert.ok(migration.includes(`add column if not exists ${column}`), `${column} migration column should exist`)
}
assert.ok(migration.includes('transaction_required_documents_requirement_identity_uidx'))
assert.ok(migration.includes('(transaction_id, requirement_identity)'))
assert.equal(/delete\s+from\s+public\.transaction_required_documents/i.test(migration), false)
assert.ok(apiSource.includes('buildBondApplicationDocumentReconciliationPlan({'))
assert.ok(apiSource.includes("stalePatch.reconciliation_source = 'bond_application_document_reconciliation'"))
assert.ok(apiSource.includes(".upsert(phase3ColumnsAvailable ? upsertRows : compatibleUpsertRows, { onConflict: 'transaction_id,document_key' })"))
assert.equal(/delete\(\).*transaction_required_documents/.test(apiSource), false)

console.log('Phase 3 idempotent bond document reconciliation passed')
