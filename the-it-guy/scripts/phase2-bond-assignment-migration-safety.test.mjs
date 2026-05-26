import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(process.cwd(), '../supabase/migrations/202605250018_bond_application_assignment_phase2.sql')
const migration = fs.readFileSync(migrationPath, 'utf8')
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.ok(pattern.test(migration), message)
}

assertHas(/alter table if exists public\.transactions\s*\n\s*add column if not exists bond_workspace_id uuid/i, 'transactions should keep additive bond workspace column')
assertHas(/add column if not exists bond_region_id uuid/i, 'transactions should keep additive bond region column')
assertHas(/add column if not exists bond_workspace_unit_id uuid/i, 'transactions should keep additive bond unit column')
assertHas(/add column if not exists primary_bond_consultant_user_id uuid/i, 'transactions should keep additive primary consultant field')
assertHas(/add column if not exists assigned_bond_processor_user_id uuid/i, 'transactions should keep additive processor field')
assertHas(/add column if not exists assigned_bond_manager_user_id uuid/i, 'transactions should keep additive manager field')
assertHas(/add column if not exists assigned_bond_compliance_user_id uuid/i, 'transactions should keep additive compliance field')
assertHas(/add column if not exists bond_assignment_status text/i, 'transactions should keep assignment status field')
assertHas(/add column if not exists bond_assignment_source text/i, 'transactions should keep assignment source field')
assertHas(/add column if not exists bond_assignment_updated_at timestamptz/i, 'transactions should keep assignment timestamp field')
assertHas(/add column if not exists bond_assignment_updated_by uuid/i, 'transactions should keep assignment updated-by field')
assertHas(/create or replace function public\.bridge_bond_workspace_id\(transaction_id uuid\)/i, 'migration should add bond workspace helper')
assertHas(/create or replace function public\.bridge_bond_region_id\(transaction_id uuid\)/i, 'migration should add bond region helper')
assertHas(/create or replace function public\.bridge_bond_workspace_unit_id\(transaction_id uuid\)/i, 'migration should add bond unit helper')
assertHas(/create or replace function public\.bridge_primary_bond_consultant_user_id\(transaction_id uuid\)/i, 'migration should add consultant helper')
assertHas(/create or replace function public\.bridge_assigned_bond_processor_user_id\(transaction_id uuid\)/i, 'migration should add processor helper')
assertHas(/create or replace function public\.bridge_assigned_bond_manager_user_id\(transaction_id uuid\)/i, 'migration should add manager helper')
assertHas(/create or replace function public\.bridge_can_access_bond_assignment\(transaction_id uuid\)/i, 'migration should add bond access helper')
assertHas(/create index if not exists transactions_bond_workspace_id_idx/i, 'migration should add workspace assignment index')
assertHas(/create index if not exists transactions_bond_workspace_lookup_idx/i, 'migration should add composite lookup index')
assertHas(/create index if not exists transactions_bond_assignment_consultant_idx/i, 'migration should add consultant lookup index')
assertHas(/create index if not exists transactions_bond_assignment_processor_idx/i, 'migration should add processor lookup index')

assertHas(/create or replace function public\.bridge_assigned_bond_compliance_user_id\(transaction_id uuid\)/i, 'migration should add compliance helper')
assertHas(/grant execute on function public\.bridge_assigned_bond_compliance_user_id\(uuid\) to authenticated/i, 'compliance helper should be granted')
assertHas(/public\.bridge_primary_bond_consultant_user_id\(transaction_id\) = auth\.uid\(\)/i, 'primary consultant helper should be used in access function')
assertHas(/public\.bridge_assigned_bond_compliance_user_id\(transaction_id\) = auth\.uid\(\)/i, 'compliance helper should be used in access function')
assertHas(/public\.bridge_can_access_bond_assignment\(uuid\)/i, 'access helper should exist')

assertHas(/public\.bridge_bond_region_id\(transaction_id uuid\)/i, 'region helper should exist')
assertHas(/public\.bridge_bond_workspace_unit_id\(transaction_id uuid\)/i, 'unit helper should exist')

assert.ok(!/alter table .*drop column/i.test(lowered), 'migration should not drop columns')
assert.ok(!/delete from\s+public\.transactions/i.test(lowered), 'migration should not delete transaction rows')

assertHas(/create or replace function public\.bridge_assigned_bond_manager_user_id\(transaction_id uuid\)/i, 'manager helper should be present for phase 2 assignment visibility')
assertHas(/public\.bridge_assigned_bond_manager_user_id\(transaction_id\) = auth\.uid\(\)/i, 'manager helper should be used in access function')

console.log('Phase 2 bond assignment migration safety test passed')
