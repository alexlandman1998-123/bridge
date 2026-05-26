import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  '../supabase/migrations/202605250020_bond_rls_scoped_policy_rollout_phase5b.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.ok(pattern.test(migration), message)
}

assertHas(
  /create or replace function public\.bridge_is_bond_transaction_canonical_ready\(transaction_id uuid\)/i,
  'should add canonical-ready detection helper',
)
assertHas(
  /create or replace function public\.bridge_can_access_bond_transaction_canonical\(transaction_id uuid\)/i,
  'should add canonical access helper',
)
assertHas(
  /create or replace function public\.bridge_can_access_bond_transaction_legacy_compat\(transaction_id uuid\)/i,
  'should add legacy-compatible access helper',
)
assertHas(
  /create or replace function public\.bridge_can_access_bond_transaction_phase5b\(transaction_id uuid\)/i,
  'should add phase5b compatibility switch helper',
)
assertHas(
  /create policy transactions_select_phase5b_scoped on public\.transactions/i,
  'should add scoped policy for transactions read',
)
assertHas(
  /create policy transaction_subprocesses_select_phase5b_scoped on public\.transaction_subprocesses/i,
  'should add scoped policy for transaction_subprocesses read',
)
assertHas(
  /create policy transaction_subprocess_steps_select_phase5b_scoped on public\.transaction_subprocess_steps/i,
  'should add scoped policy for transaction_subprocess_steps read',
)
assertHas(
  /create policy transaction_finance_details_select_phase5b_scoped on public\.transaction_finance_details/i,
  'should add scoped policy for transaction_finance_details read',
)
assertHas(
  /create policy document_requests_select_phase5b_scoped on public\.document_requests/i,
  'should add scoped policy for document_requests read',
)
assertHas(
  /create policy documents_select_phase5b_scoped on public\.documents/i,
  'should add scoped policy for documents read',
)
assertHas(
  /create policy transaction_events_select_phase5b_scoped on public\.transaction_events/i,
  'should add scoped policy for transaction_events read',
)
assertHas(
  /create policy transaction_notifications_select_phase5b_scoped on public\.transaction_notifications/i,
  'should add scoped policy for transaction_notifications read',
)

assertHas(
  /grant execute on function public\.bridge_is_bond_transaction_canonical_ready\(uuid\) to authenticated/i,
  'canonical-ready helper should be executable by authenticated users',
)
assertHas(
  /grant execute on function public\.bridge_can_access_bond_transaction_canonical\(uuid\) to authenticated/i,
  'canonical access helper should be executable by authenticated users',
)
assertHas(
  /grant execute on function public\.bridge_can_access_bond_transaction_legacy_compat\(uuid\) to authenticated/i,
  'legacy-compatible access helper should be executable by authenticated users',
)
assertHas(
  /grant execute on function public\.bridge_can_access_bond_transaction_phase5b\(uuid\) to authenticated/i,
  'phase 5b access helper should be executable by authenticated users',
)

assert.ok(!/drop policy/i.test(lowered), 'phase 5b migration should not drop existing policies')
assert.ok(!/alter policy/i.test(lowered), 'phase 5b migration should not alter existing policies')
assert.ok(!/drop table/i.test(lowered), 'phase 5b migration should not drop tables')
assert.ok(!/drop column/i.test(lowered), 'phase 5b migration should not drop columns')
assert.ok(!/alter table .*drop column/i.test(lowered), 'phase 5b migration should avoid dropping columns')
assert.ok(!/set not null/i.test(lowered), 'phase 5b migration should avoid new not-null constraints')
assert.ok(!/create policy .* on public\.transactions[\s\S]{0,160}for update/i.test(lowered), 'phase 5b should not add transaction write policy')
assert.ok(!/create policy .* on public\.transactions[\s\S]{0,160}for insert/i.test(lowered), 'phase 5b should not add transaction insert policy')
assert.ok(!/create policy .* on public\.transactions[\s\S]{0,160}for delete/i.test(lowered), 'phase 5b should not add transaction delete policy')
assert.ok(!/create policy .* on public\.documents[\s\S]{0,160}for insert/i.test(lowered), 'phase 5b should not add document write policy')
assert.ok(!/create policy .* on public\.transaction_notifications[\s\S]{0,160}for insert/i.test(lowered), 'phase 5b should not add notification insert policy')
assert.ok(!/create policy .* on public\.transaction_notifications[\s\S]{0,160}for update/i.test(lowered), 'phase 5b should not add notification update policy')
assert.ok(!/create policy .* on public\.transaction_notifications[\s\S]{0,160}for delete/i.test(lowered), 'phase 5b should not add notification delete policy')

console.log('Phase 5B bond RLS scoped policy safety test passed')
