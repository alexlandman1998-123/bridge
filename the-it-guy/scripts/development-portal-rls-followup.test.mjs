import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202608140007_development_portal_rls_followup.sql', import.meta.url),
  'utf8',
)

assert.match(
  migration,
  /create or replace function public\.bridge_can_manage_development_record\(target_development_id uuid\)[\s\S]*bridge_has_development_org_access\(target_development_id\)[\s\S]*bridge_has_development_access\(target_development_id\)/,
  'development portal RLS should use the existing scoped development access helpers.',
)
assert.match(
  migration,
  /grant execute on function public\.bridge_can_manage_development_record\(uuid\) to authenticated;/,
  'PostgREST policies need the helper executable by authenticated users.',
)

for (const tableName of [
  'development_financials',
  'development_participants',
  'development_profiles',
  'development_documents',
  'development_settings',
  'development_attorney_configs',
  'development_bond_configs',
]) {
  assert.match(migration, new RegExp(`'${tableName}'`), `${tableName} should be included in the direct development table loop.`)
}
assert.match(migration, /table_name \|\| '_select_scoped'/, 'direct development tables need generated select policies.')
assert.match(migration, /table_name \|\| '_insert_scoped'/, 'direct development tables need generated insert policies.')
assert.match(migration, /table_name \|\| '_update_scoped'/, 'direct development tables need generated update policies.')
assert.match(migration, /table_name \|\| '_delete_scoped'/, 'delete-capable development tables need generated delete policies.')
assert.match(
  migration,
  /grant select, insert, update, delete on table public\.%I to authenticated/i,
  'delete-capable development tables need table privileges in addition to policies.',
)
assert.match(
  migration,
  /grant select, insert, update on table public\.%I to authenticated/i,
  'development participants should receive the non-delete grant path.',
)

assert.match(
  migration,
  /create policy developments_delete_scoped[\s\S]*for delete[\s\S]*using \(public\.bridge_can_manage_development_record\(id\)\)/,
  'development deletion should be scoped, not open-ended.',
)
assert.match(
  migration,
  /grant select, insert, update, delete on table public\.developments to authenticated;/,
  'development CRUD needs table privileges in addition to policies.',
)

for (const tableName of [
  'development_attorney_required_closeout_docs',
  'development_bond_required_closeout_docs',
]) {
  assert.match(migration, new RegExp(`alter table public\\.${tableName} enable row level security`, 'i'))
  assert.match(migration, new RegExp(`create policy ${tableName}_insert_scoped[\\s\\S]*with check`, 'i'))
  assert.match(migration, new RegExp(`create policy ${tableName}_update_scoped[\\s\\S]*with check`, 'i'))
  assert.match(migration, new RegExp(`create policy ${tableName}_delete_scoped[\\s\\S]*for delete`, 'i'))
  assert.match(migration, new RegExp(`grant select, insert, update, delete\\s+on table public\\.${tableName}\\s+to authenticated`, 'i'))
}

assert.doesNotMatch(migration, /using \(true\)|with check \(true\)|for\s+(insert|update|delete)\s+to\s+anon/i)

console.log('development portal RLS follow-up checks passed')
