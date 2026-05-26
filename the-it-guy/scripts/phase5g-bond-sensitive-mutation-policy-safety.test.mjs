import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const migrationPath = new URL('../../supabase/migrations/202605250024_bond_sensitive_mutation_policy_rollout_phase5g.sql', import.meta.url)

test('Phase 5G adds scoped sensitive mutation helpers and policies without destructive rollout changes', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /bridge_can_submit_bond_to_banks_phase5g/)
  assert.match(sql, /bridge_can_assign_bond_workspace_phase5g/)
  assert.match(sql, /bridge_can_mutate_bond_assignment_phase5g/)
  assert.match(sql, /bridge_can_mutate_bond_sensitive_transaction_phase5g/)
  assert.match(sql, /create policy transactions_update_phase5g_bond_sensitive_mutation on public\.transactions/)
  assert.match(sql, /create policy transaction_role_players_insert_phase5g_bond_sensitive_mutation on public\.transaction_role_players/)
  assert.match(sql, /create policy transaction_role_players_update_phase5g_bond_sensitive_mutation on public\.transaction_role_players/)

  assert.doesNotMatch(sql, /drop policy/i)
  assert.doesNotMatch(sql, /drop column/i)
  assert.doesNotMatch(sql, /set not null/i)
  assert.doesNotMatch(sql, /for delete/i)
  assert.doesNotMatch(sql, /on public\.transaction_participants/i)
  assert.doesNotMatch(sql, /assigned_bond_originator_email.*drop/i)
  assert.doesNotMatch(sql, /bond_originator.*drop/i)
})
