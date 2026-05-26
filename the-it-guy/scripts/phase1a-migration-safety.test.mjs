import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(process.cwd(), '../supabase/migrations/202605250017_bond_hierarchy_scope_foundation_phase1.sql')
const migration = fs.readFileSync(migrationPath, 'utf8')
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.ok(pattern.test(migration), message)
}

assertHas(/create table if not exists public\.workspace_regions/i, 'workspace_regions should be created additively')
assertHas(/create table if not exists public\.workspace_units/i, 'workspace_units should be created additively')
assertHas(/add column if not exists workspace_kind text/i, 'organisation workspace_kind column should be added')
assertHas(/add column if not exists scope_level text/i, 'organisation_users.scope_level should be additively added')
assertHas(/add column if not exists region_id uuid/i, 'organisation_users.region_id should be additively added')
assertHas(/add column if not exists workspace_unit_id uuid/i, 'organisation_users.workspace_unit_id should be additively added')
assertHas(/create index if not exists workspace_regions_workspace_id_idx/i, 'migration should use additive index creation')
assertHas(/create index if not exists workspace_units_workspace_id_idx/i, 'migration should use additive index creation')
assertHas(/create or replace function public\.bridge_current_workspace_role\(/i, 'workspace role helper should exist')
assertHas(/create or replace function public\.bridge_current_scope_level\(/i, 'scope level helper should exist')
assertHas(/create or replace function public\.bridge_can_access_bond_application\(/i, 'bond application helper should exist')
assertHas(/update public\.organisations\s*set workspace_kind/i, 'migration should backfill workspace_kind')
assertHas(/update public\.organisation_users\s*set scope_level/i, 'migration should backfill scope_level')

assert.ok(!/alter table public\.[^\s]*\n\\s*drop column/i.test(lowered), 'migration must not drop columns')
assert.ok(!/alter table .*drop column/i.test(lowered), 'migration must not drop columns')
assert.ok(!/delete from\s+public\.workspace_regions|delete from\s+public\.workspace_units/i.test(lowered), 'migration should remain additive and not remove rows')

assertHas(/create table if not exists public\.workspace_regions[\s\S]{0,200}workspace_id uuid not null references public\.organisations\(id\) on delete cascade/i, 'workspace_regions.workspace_id must still enforce a workspace reference')
assertHas(/create table if not exists public\.workspace_units[\s\S]{0,220}region_id uuid references public\.workspace_regions\(id\) on delete set null/i, 'workspace_units.region_id should be nullable')
assertHas(/create table if not exists public\.workspace_units[\s\S]{0,220}parent_unit_id uuid references public\.workspace_units\(id\) on delete set null/i, 'workspace_units.parent_unit_id should be nullable')
assertHas(/scope_metadata jsonb not null default/i, 'scope_metadata should have safe default')

assertHas(/workspace_units_unit_type_check/i, 'workspace_units unit type check should be refreshed')
assertHas(/organisations_workspace_kind_check/i, 'workspace kind check constraint should be refreshed')
assertHas(/organisation_users_scope_level_check/i, 'organisation user scope constraint should be refreshed')

assertHas(/grant execute on function public\.bridge_current_workspace_role\(uuid\) to authenticated/i, 'RLS helpers should expose execute grants safely')

console.log('Phase 1A migration safety test passed')
