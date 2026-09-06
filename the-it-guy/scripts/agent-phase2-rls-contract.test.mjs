import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('../supabase/migrations/20260906065759_agent_phase2_rls_acceptance.sql', 'utf8')
const pgTap = readFileSync('../supabase/tests/agent_phase2_rls_acceptance_test.sql', 'utf8')
const actors = JSON.parse(readFileSync('config/agent-phase2-rls-actors.example.json', 'utf8'))

assert.match(migration, /alter table if exists public\.transaction_commissions enable row level security/)
assert.match(migration, /revoke all on table public\.transaction_commissions from anon/)
assert.match(migration, /to authenticated\s+using \(\s*public\.bridge_is_org_admin/)
assert.match(migration, /assigned_agent_id = \(select auth\.uid\(\)\)/)
assert.match(migration, /bridge_current_email\(\)/)
assert.doesNotMatch(migration, /auth\.role\(\)/)
assert.doesNotMatch(migration, /security definer/i)
assert.match(pgTap, /hasnt_table_privilege\('anon'.*'SELECT'/)
assert.deepEqual(actors.actors.map((actor) => actor.name), [
  'agent',
  'principal',
  'branch_manager',
  'restricted_agent',
  'inactive_agent',
  'multi_membership_agent',
])

console.log('Agent Phase 2 RLS contract checks passed.')
