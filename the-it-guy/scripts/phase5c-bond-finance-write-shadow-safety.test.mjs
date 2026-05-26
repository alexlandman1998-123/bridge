import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  '..',
  'supabase',
  'migrations',
  '202605250021_bond_finance_write_shadow_helpers_phase5c.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.ok(pattern.test(migration), message)
}

assertHas(
  /create or replace function public\.bridge_bond_finance_step_owner_bucket_shadow\(step_key text\)/i,
  'should add finance step owner bucket helper',
)
assertHas(
  /create or replace function public\.bridge_can_access_bond_transaction_write_shadow\(transaction_id uuid\)/i,
  'should add transaction write access helper',
)
assertHas(
  /create or replace function public\.bridge_can_update_bond_finance_step_shadow\(transaction_id uuid, step_key text\)/i,
  'should add finance step update helper',
)
assertHas(
  /create or replace function public\.bridge_can_request_bond_finance_documents_shadow\(transaction_id uuid\)/i,
  'should add finance document request helper',
)
assertHas(
  /create or replace function public\.bridge_can_upload_bond_finance_documents_shadow\(transaction_id uuid\)/i,
  'should add finance document upload helper',
)
assertHas(
  /create or replace function public\.bridge_can_review_bond_finance_documents_shadow\(transaction_id uuid\)/i,
  'should add finance document review helper',
)
assertHas(
  /create or replace function public\.bridge_can_manage_bond_bank_feedback_shadow\(transaction_id uuid\)/i,
  'should add bank feedback helper',
)
assertHas(
  /create or replace function public\.bridge_can_submit_bond_to_banks_shadow\(transaction_id uuid\)/i,
  'should add submit-to-banks helper',
)
assertHas(
  /create or replace function public\.bridge_can_mark_bond_submission_ready_shadow\(transaction_id uuid\)/i,
  'should add submission readiness helper',
)
assertHas(
  /create or replace function public\.bridge_can_record_bond_approval_shadow\(transaction_id uuid\)/i,
  'should add approval recording helper',
)
assertHas(
  /create or replace function public\.bridge_can_record_bond_decline_shadow\(transaction_id uuid\)/i,
  'should add decline recording helper',
)
assertHas(
  /create or replace function public\.bridge_can_record_bond_grant_shadow\(transaction_id uuid\)/i,
  'should add grant recording helper',
)
assertHas(
  /create or replace function public\.bridge_can_escalate_bond_application_shadow\(transaction_id uuid\)/i,
  'should add escalation helper',
)
assertHas(
  /create or replace function public\.bridge_can_reassign_bond_consultant_shadow\(transaction_id uuid\)/i,
  'should add consultant reassignment helper',
)
assertHas(
  /create or replace function public\.bridge_can_reassign_bond_processor_shadow\(transaction_id uuid\)/i,
  'should add processor reassignment helper',
)
assertHas(
  /create or replace function public\.bridge_can_review_bond_compliance_shadow\(transaction_id uuid\)/i,
  'should add compliance review helper',
)
assertHas(
  /create or replace function public\.bridge_can_add_bond_internal_note_shadow\(transaction_id uuid\)/i,
  'should add internal note helper',
)
assertHas(
  /create or replace function public\.bridge_can_add_bond_client_visible_note_shadow\(transaction_id uuid\)/i,
  'should add client-visible note helper',
)
assertHas(
  /create or replace function public\.bridge_can_assign_bond_compliance_shadow\(transaction_id uuid\)/i,
  'should add compliance assignment helper',
)

assertHas(
  /create or replace function public\.bridge_can_access_bond_transaction_write_shadow\(transaction_id uuid\)/i,
  'should include write access helper for simulation',
)

assert.ok(!/create policy/i.test(lowered), 'phase 5c migration should not add policies')
assert.ok(!/alter policy/i.test(lowered), 'phase 5c migration should not alter policies')
assert.ok(!/drop policy/i.test(lowered), 'phase 5c migration should not drop policies')
assert.ok(!/create table/i.test(lowered), 'phase 5c migration should be additive in scope for write helpers')
assert.ok(!/alter table/i.test(lowered), 'phase 5c migration should avoid schema changes')

assert.ok(/grant execute on function public\.bridge_can_access_bond_transaction_write_shadow\(uuid\) to authenticated/i.test(lowered), 'write helper should be granted to authenticated users')

console.log('Phase 5C bond finance write shadow safety test passed')
