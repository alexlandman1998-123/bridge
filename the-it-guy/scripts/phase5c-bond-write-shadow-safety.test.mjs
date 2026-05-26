import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  '../supabase/migrations/202605250021_bond_rls_write_shadow_helpers_phase5c.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.ok(pattern.test(migration), message)
}

assertHas(
  /create or replace function public\.bridge_normalize_bond_write_action\(action text\)/i,
  'should add write action normalization helper',
)
assertHas(
  /create or replace function public\.bridge_has_bond_transaction_role_player_access\(transaction_id uuid\)/i,
  'should add role-player compatibility helper',
)
assertHas(
  /create or replace function public\.bridge_can_mutate_bond_transaction_assigned\(transaction_id uuid, action text\)/i,
  'should add assigned write shadow helper',
)
assertHas(
  /create or replace function public\.bridge_can_mutate_bond_transaction_scoped\(transaction_id uuid, action text\)/i,
  'should add scoped write shadow helper',
)
assertHas(
  /create or replace function public\.bridge_can_mutate_bond_transaction_canonical\(transaction_id uuid, action text\)/i,
  'should add canonical write shadow helper',
)
assertHas(
  /create or replace function public\.bridge_can_mutate_bond_transaction_phase5c\(transaction_id uuid, action text\)/i,
  'should add phase5c write compatibility helper',
)

assertHas(
  /grant execute on function public\.bridge_normalize_bond_write_action\(text\) to authenticated/i,
  'write action normalization helper should be executable by authenticated users',
)
assertHas(
  /grant execute on function public\.bridge_has_bond_transaction_role_player_access\(uuid\) to authenticated/i,
  'role-player compatibility helper should be executable by authenticated users',
)
assertHas(
  /grant execute on function public\.bridge_can_mutate_bond_transaction_assigned\(uuid, text\) to authenticated/i,
  'assigned write helper should be executable by authenticated users',
)
assertHas(
  /grant execute on function public\.bridge_can_mutate_bond_transaction_scoped\(uuid, text\) to authenticated/i,
  'scoped write helper should be executable by authenticated users',
)
assertHas(
  /grant execute on function public\.bridge_can_mutate_bond_transaction_canonical\(uuid, text\) to authenticated/i,
  'canonical write helper should be executable by authenticated users',
)
assertHas(
  /grant execute on function public\.bridge_can_mutate_bond_transaction_phase5c\(uuid, text\) to authenticated/i,
  'phase5c write helper should be executable by authenticated users',
)

assert.ok(!/create policy/i.test(lowered), 'phase 5c helper migration should not create policies')
assert.ok(!/alter policy/i.test(lowered), 'phase 5c helper migration should not alter policies')
assert.ok(!/drop policy/i.test(lowered), 'phase 5c helper migration should not drop policies')
assert.ok(!/for update/i.test(lowered), 'phase 5c helper migration should not add update policies')
assert.ok(!/for insert/i.test(lowered), 'phase 5c helper migration should not add insert policies')
assert.ok(!/for delete/i.test(lowered), 'phase 5c helper migration should not add delete policies')
assert.ok(!/drop table/i.test(lowered), 'phase 5c helper migration should not drop tables')
assert.ok(!/drop column/i.test(lowered), 'phase 5c helper migration should not drop columns')
assert.ok(!/set not null/i.test(lowered), 'phase 5c helper migration should not add not-null constraints')

console.log('Phase 5C bond write shadow helper safety test passed')
