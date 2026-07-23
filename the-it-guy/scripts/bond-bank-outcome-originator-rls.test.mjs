import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202607230011_bond_bank_outcome_originator_rls_repair.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /forward-only[\s\S]*repair/i)
assert.match(migration, /create or replace function public\.bridge_can_access_bond_bank_outcome/i)
assert.match(migration, /application\.transaction_id = p_transaction_id/i)
assert.match(migration, /application\.workflow_id = p_workflow_id/i)
assert.match(migration, /workflow\.transaction_id = p_transaction_id/i)
assert.match(migration, /participant\.can_edit_finance_workflow = true/i)
assert.match(migration, /participant\.assigned_user_id = auth\.uid\(\)/i)
assert.match(migration, /participant\.removed_at is null/i)
assert.match(migration, /coalesce\(participant\.status, 'active'\) = 'active'/i)
assert.match(migration, /bridge_can_access_bond_application_scope\(application\.id\)/i)
assert.match(migration, /bank_name = \([\s\S]*application\.bank_name/i)
assert.match(migration, /recorded_by = auth\.uid\(\)/i)
assert.match(migration, /bridge_can_access_bond_bank_outcome\([\s\S]*bond_application_id[\s\S]*\)/i)
assert.doesNotMatch(
  migration,
  /create policy transaction_bond_bank_outcomes_insert[\s\S]*?with check \(public\.bridge_transaction_scope_is_internal_user\(\)\);/i,
)
assert.match(migration, /revoke all on function public\.bridge_can_access_bond_bank_outcome[\s\S]*from public/i)
assert.match(migration, /notify pgrst, 'reload schema';/i)

console.log('Bond bank-outcome originator RLS contract tests passed')
