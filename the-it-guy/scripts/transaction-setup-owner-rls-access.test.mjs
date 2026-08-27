import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/20260827091439_transaction_setup_owner_rls_access.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /create or replace function public\.bridge_has_transaction_access/)
assert.match(migration, /create or replace function public\.bridge_can_edit_finance_lane/)
assert.match(migration, /auth\.uid\(\) in \(\s*t\.created_by,\s*t\.owner_user_id,\s*t\.assigned_user_id,\s*t\.assigned_agent_id\s*\)/)
assert.match(migration, /public\.bridge_current_profile_role\(\) in \('developer', 'agent'\)/)
assert.match(migration, /public\.bridge_has_development_access\(t\.development_id\)/)
assert.match(migration, /tp\.can_edit_finance_workflow = true/)
assert.match(migration, /public\.bridge_current_profile_role\(\) = 'bond_originator'/)

console.log('transaction setup owner RLS access contract passed')
