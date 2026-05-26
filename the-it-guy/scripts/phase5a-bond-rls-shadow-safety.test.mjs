import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  '../supabase/migrations/202605250019_bond_rls_shadow_helpers_phase5a.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.ok(pattern.test(migration), message)
}

assertHas(
  /create table if not exists public\.bond_rls_cutover_exclusions/i,
  'should add additive cutover exclusions table',
)
assertHas(
  /create or replace function public\.bridge_bond_transaction_workspace_id\(transaction_id uuid\)/i,
  'should add shadow workspace helper',
)
assertHas(
  /create or replace function public\.bridge_bond_transaction_region_id\(transaction_id uuid\)/i,
  'should add shadow region helper',
)
assertHas(
  /create or replace function public\.bridge_bond_transaction_workspace_unit_id\(transaction_id uuid\)/i,
  'should add shadow unit helper',
)
assertHas(
  /create or replace function public\.bridge_can_access_bond_transaction_shadow\(transaction_id uuid\)/i,
  'should add shadow transaction access helper',
)
assertHas(
  /create or replace function public\.bridge_has_bond_transaction_participant_access\(transaction_id uuid\)/i,
  'should retain participant compatibility helper',
)

assert.ok(!/drop policy/i.test(lowered), 'should not drop existing policies in phase 5a')
assert.ok(!/alter policy/i.test(lowered), 'should not alter existing policies in phase 5a')
assert.ok(!/create policy/i.test(lowered), 'should not create enforcing policies in phase 5a')
assert.ok(!/drop column/i.test(lowered), 'should not drop columns in phase 5a')
assert.ok(!/assigned_bond_originator_email.*drop/i.test(lowered), 'should not remove legacy email fallback')
assert.ok(!/bond_originator.*drop/i.test(lowered), 'should not remove legacy text fallback')
assert.ok(!/set not null/i.test(lowered), 'should not force new not-null constraints')

console.log('Phase 5A bond RLS shadow safety test passed')
