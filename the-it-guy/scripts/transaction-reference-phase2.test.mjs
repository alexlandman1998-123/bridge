import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  TRANSACTION_REFERENCE_SOURCE_VALUES,
  TRANSACTION_REFERENCE_TYPES,
  getTransactionReferencePolicy,
} from '../src/core/transactions/transactionReferencePolicy.js'

const root = path.resolve(import.meta.dirname, '..')
const migration = fs.readFileSync(
  path.join(root, '../supabase/migrations/202607120002_transaction_attorney_matter_references.sql'),
  'utf8',
)
const localSql = fs.readFileSync(path.join(root, 'sql/20260712_transaction_attorney_matter_references.sql'), 'utf8')
const schema = fs.readFileSync(path.join(root, 'sql/schema.sql'), 'utf8')
const policyDoc = fs.readFileSync(path.join(root, 'docs/transaction-reference-policy.md'), 'utf8')

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

for (const source of [migration, localSql, schema]) {
  for (const marker of [
    'add column if not exists matter_reference text',
    "add column if not exists matter_reference_source text not null default 'manual'",
    'add column if not exists matter_reference_updated_by uuid references auth.users(id) on delete set null',
    'add column if not exists matter_reference_updated_at timestamptz',
    'transaction_attorney_assignments_matter_reference_source_check',
    'transaction_attorney_assignments_matter_reference_not_blank_check',
    'create or replace function public.bridge_set_attorney_assignment_matter_reference_fields()',
    'trg_transaction_attorney_assignments_matter_reference_fields',
    'transaction_attorney_assignments_matter_reference_search_idx',
    'transaction_attorney_assignments_role_matter_reference_idx',
  ]) {
    includes(source, marker)
  }

  for (const sourceValue of TRANSACTION_REFERENCE_SOURCE_VALUES) {
    includes(source, `'${sourceValue}'`, `SQL should allow matter reference source ${sourceValue}`)
  }
}

includes(
  schema,
  'add column if not exists attorney_role text',
  'Schema mirror should expose attorney_role for the role-scoped matter reference index.',
)

assert.match(
  migration,
  /new\.matter_reference := nullif\(trim\(new\.matter_reference\), ''\)/,
  'Migration should normalize blank attorney matter references to null.',
)
assert.match(
  migration,
  /new\.matter_reference_updated_at := now\(\)/,
  'Migration should stamp attorney matter reference changes.',
)
assert.doesNotMatch(
  migration,
  /unique index[\s\S]{0,160}matter_reference/i,
  'Attorney matter references must be searchable but not globally unique.',
)

for (const [referenceType, assignmentRole] of [
  [TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber, 'transfer_attorney'],
  [TRANSACTION_REFERENCE_TYPES.bondAttorneyMatterNumber, 'bond_attorney'],
  [TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber, 'cancellation_attorney'],
]) {
  const policy = getTransactionReferencePolicy(referenceType)
  assert.equal(policy.storageTarget, 'transaction_attorney_assignments.matter_reference')
  assert.equal(policy.assignmentRole, assignmentRole)
  assert.equal(policy.sourceTarget, 'transaction_attorney_assignments.matter_reference_source')
  assert.equal(policy.updatedByTarget, 'transaction_attorney_assignments.matter_reference_updated_by')
  assert.equal(policy.updatedAtTarget, 'transaction_attorney_assignments.matter_reference_updated_at')
}

for (const marker of [
  'Status: Phase 7 reference audit visibility',
  '`matter_reference`',
  '`matter_reference_source`',
  '`matter_reference_updated_by`',
  '`matter_reference_updated_at`',
  'Existing assignments are not backfilled',
  'Phase 3 wires partner-owned reference edits through policy-aware mutation paths',
]) {
  includes(policyDoc, marker)
}

console.log('transaction reference phase 2 tests passed')
