import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  '../supabase/migrations/202605250022_bond_finance_write_policy_rollout_phase5d.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.ok(pattern.test(migration), message)
}

assertHas(
  /create or replace function public\.bridge_can_mutate_bond_finance_step_phase5d\([\s\S]*transaction_id uuid[\s\S]*step_key text[\s\S]*\)/i,
  'should add finance step mutation helper',
)
assertHas(
  /create or replace function public\.bridge_can_mutate_bond_finance_details_phase5d\(transaction_id uuid\)/i,
  'should add finance details mutation helper',
)
assertHas(
  /create or replace function public\.bridge_can_mutate_bond_document_request_phase5d\(transaction_id uuid\)/i,
  'should add document request mutation helper',
)
assertHas(
  /create or replace function public\.bridge_can_upload_bond_document_phase5d\(transaction_id uuid\)/i,
  'should add document upload mutation helper',
)
assertHas(
  /create or replace function public\.bridge_can_manage_bond_bank_feedback_phase5d\(transaction_id uuid\)/i,
  'should add bank feedback helper',
)
assertHas(
  /create or replace function public\.bridge_can_submit_bond_to_banks_phase5d\(transaction_id uuid\)/i,
  'should add submit-to-banks helper without enforcing it yet',
)
assertHas(
  /create or replace function public\.bridge_can_manage_bond_assignment_phase5d\(transaction_id uuid\)/i,
  'should add assignment helper without enforcing it yet',
)
assertHas(
  /create or replace function public\.bridge_can_review_bond_compliance_phase5d\(transaction_id uuid\)/i,
  'should add compliance review helper',
)

assertHas(
  /create policy transaction_subprocess_steps_update_phase5d_bond_finance on public\.transaction_subprocess_steps[\s\S]*for update/i,
  'should add step update policy',
)
assertHas(
  /create policy transaction_finance_details_update_phase5d_bond_finance on public\.transaction_finance_details[\s\S]*for update/i,
  'should add finance details update policy',
)
assertHas(
  /create policy document_requests_insert_phase5d_bond_finance on public\.document_requests[\s\S]*for insert/i,
  'should add document request insert policy',
)
assertHas(
  /create policy document_requests_update_phase5d_bond_finance on public\.document_requests[\s\S]*for update/i,
  'should add document request update policy',
)
assertHas(
  /create policy documents_insert_phase5d_bond_finance on public\.documents[\s\S]*for insert/i,
  'should add document insert policy',
)
assertHas(
  /create policy documents_update_phase5d_bond_finance on public\.documents[\s\S]*for update/i,
  'should add document update policy',
)
assertHas(
  /create policy transaction_events_insert_phase5d_bond_finance on public\.transaction_events[\s\S]*for insert/i,
  'should add finance event insert policy',
)
assertHas(
  /create policy transaction_notifications_insert_phase5d_bond_finance on public\.transaction_notifications[\s\S]*for insert/i,
  'should add notification insert policy',
)
assertHas(
  /create policy transaction_notifications_update_phase5d_bond_finance on public\.transaction_notifications[\s\S]*for update/i,
  'should add notification update policy',
)

assertHas(
  /bridge_is_bond_transaction_canonical_ready\(transaction_id\)/i,
  'phase 5d helpers should gate writes behind canonical-ready rows',
)

assert.ok(!/drop policy/i.test(lowered), 'phase 5d should not drop policies')
assert.ok(!/alter policy/i.test(lowered), 'phase 5d should not alter policies')
assert.ok(!/drop table/i.test(lowered), 'phase 5d should not drop tables')
assert.ok(!/drop column/i.test(lowered), 'phase 5d should not drop columns')
assert.ok(!/set not null/i.test(lowered), 'phase 5d should not add not-null constraints')
assert.ok(!/for delete/i.test(lowered), 'phase 5d should not add delete policies')
assert.ok(!/create policy .* on public\.transactions[\s\S]{0,200}for update/i.test(lowered), 'phase 5d should not add transaction update policy')
assert.ok(!/create policy .* on public\.transactions[\s\S]{0,200}for insert/i.test(lowered), 'phase 5d should not add transaction insert policy')
assert.ok(!/create policy .* on public\.transaction_subprocesses[\s\S]{0,200}for update/i.test(lowered), 'phase 5d should not add subprocess update policy')
assert.ok(!/create policy .*assignment/i.test(lowered), 'phase 5d should not add assignment mutation policy yet')
assert.ok(!/region_id[^\\n]+not null/i.test(lowered), 'phase 5d should not force region_id not null')
assert.ok(!/workspace_unit_id[^\\n]+not null/i.test(lowered), 'phase 5d should not force workspace_unit_id not null')

console.log('Phase 5D bond finance write policy safety test passed')
