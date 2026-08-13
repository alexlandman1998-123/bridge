import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202608130001_development_units_rls_repair.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /alter table if exists public\.units enable row level security/i)
assert.match(migration, /create or replace function public\.bridge_can_manage_development_units\(target_development_id uuid\)/i)
assert.match(migration, /public\.bridge_has_development_org_access\(target_development_id\)/i)
assert.match(migration, /public\.bridge_has_development_access\(target_development_id\)/i)
assert.match(migration, /grant execute on function public\.bridge_can_manage_development_units\(uuid\) to authenticated/i)

for (const policyName of ['units_select_scoped', 'units_insert_scoped', 'units_update_scoped', 'units_delete_scoped']) {
  assert.match(migration, new RegExp(`drop policy if exists ${policyName} on public\\.units`, 'i'))
  assert.match(migration, new RegExp(`create policy ${policyName} on public\\.units`, 'i'))
}

assert.match(
  migration,
  /create policy units_insert_scoped[\s\S]*with check \(\s*public\.bridge_can_manage_development_units\(development_id\)\s*\)/i,
  'unit inserts must be allowed for scoped development managers',
)
assert.match(
  migration,
  /create policy units_update_scoped[\s\S]*using \(\s*public\.bridge_can_manage_development_units\(development_id\)\s*\)[\s\S]*with check \(\s*public\.bridge_can_manage_development_units\(development_id\)\s*\)/i,
  'unit upserts must pass both update using and update check policies',
)
assert.match(
  migration,
  /grant select, insert, update, delete on table public\.units to authenticated/i,
  'PostgREST authenticated writes need table privileges in addition to RLS',
)

assert.doesNotMatch(migration, /Allow all (read|write) units/i, 'must not restore legacy open unit policies')
assert.doesNotMatch(migration, /units_demo_all/i, 'must not introduce demo-wide unit access')

console.log('development units RLS repair checks passed')
