import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260814163310_rls_phase1_internal_controls.sql', import.meta.url),
  'utf8',
)
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.match(migration, pattern, message)
}

function assertNot(pattern, message) {
  assert.doesNotMatch(migration, pattern, message)
}

assertHas(
  /alter table if exists public\.matter_number_sequences enable row level security;/i,
  'matter_number_sequences must enable RLS',
)
assertHas(
  /revoke all on table public\.matter_number_sequences from public, anon, authenticated;/i,
  'matter_number_sequences must remove browser/API table access',
)
assertHas(
  /grant all on table public\.matter_number_sequences to service_role;/i,
  'matter_number_sequences must preserve service role access',
)
assertHas(
  /revoke all on function public\.next_matter_number\(integer, text\) from public, anon, authenticated;/i,
  'next_matter_number must not remain browser-callable',
)
assertHas(
  /revoke all on function public\.assign_transaction_matter_number\(\) from public, anon, authenticated;/i,
  'assign_transaction_matter_number must not remain browser-callable',
)
assertNot(
  /create policy\s+\w+[\s\S]*on public\.matter_number_sequences/i,
  'matter_number_sequences should have no browser-facing RLS policy',
)

assertHas(
  /alter table if exists public\.bond_rls_cutover_exclusions enable row level security;/i,
  'bond_rls_cutover_exclusions must enable RLS',
)
assertHas(
  /revoke all on table public\.bond_rls_cutover_exclusions from public, anon;/i,
  'bond_rls_cutover_exclusions must remove public/anon access',
)
assertHas(
  /grant select, insert, update on table public\.bond_rls_cutover_exclusions to authenticated;/i,
  'bond_rls_cutover_exclusions should grant only reviewed authenticated verbs',
)
assertHas(
  /create or replace function public\.bridge_can_manage_bond_rls_cutover_exclusion\(\s*target_transaction_id uuid\s*\)[\s\S]*security definer[\s\S]*public\.bridge_is_org_admin\(coalesce\(t\.bond_workspace_id, t\.organisation_id\)\)/i,
  'bond exclusions must use a transaction-aware admin helper',
)
assertHas(
  /revoke all on function public\.bridge_can_manage_bond_rls_cutover_exclusion\(uuid\)[\s\S]*from public, anon;/i,
  'bond exclusions helper must not be public/anon callable',
)
assertHas(
  /revoke delete on table public\.bond_rls_cutover_exclusions from authenticated;/i,
  'bond_rls_cutover_exclusions should not allow authenticated hard deletes',
)
assertHas(
  /create policy bond_rls_cutover_exclusions_admin_select[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(public\.bridge_can_manage_bond_rls_cutover_exclusion\(transaction_id\)\)/i,
  'bond exclusions select must be scoped to transaction workspace admin',
)
assertHas(
  /create policy bond_rls_cutover_exclusions_admin_insert[\s\S]*for insert[\s\S]*to authenticated[\s\S]*with check \(public\.bridge_can_manage_bond_rls_cutover_exclusion\(transaction_id\)\)/i,
  'bond exclusions insert must be scoped to transaction workspace admin',
)
assertHas(
  /create policy bond_rls_cutover_exclusions_admin_update[\s\S]*for update[\s\S]*to authenticated[\s\S]*using \(public\.bridge_can_manage_bond_rls_cutover_exclusion\(transaction_id\)\)[\s\S]*with check \(public\.bridge_can_manage_bond_rls_cutover_exclusion\(transaction_id\)\)/i,
  'bond exclusions update must use both USING and WITH CHECK',
)
assertNot(
  /create policy\s+\w+[\s\S]*on public\.bond_rls_cutover_exclusions[\s\S]*for delete/i,
  'bond exclusions must not add a delete policy',
)
assert.ok(!lowered.includes('auth.role()'), 'migration must not use deprecated auth.role() predicates')
assertNot(/to authenticated\s+using\s*\(\s*true\s*\)/i, 'migration must not use broad authenticated policies')

console.log('RLS Phase 1 internal controls migration contract passed.')
