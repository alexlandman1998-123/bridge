import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260814164904_rls_phase5_rollup_validation_diagnostics.sql', import.meta.url),
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
  /alter table if exists public\.transaction_rollup_validation enable row level security;/i,
  'transaction_rollup_validation must enable RLS',
)
assertHas(
  /revoke all on table public\.transaction_rollup_validation from public, anon, authenticated;/i,
  'transaction_rollup_validation must revoke broad direct table grants',
)
assertHas(
  /grant select on table public\.transaction_rollup_validation to authenticated;/i,
  'transaction_rollup_validation should expose only reviewed authenticated direct reads',
)
assertHas(
  /grant all on table public\.transaction_rollup_validation to service_role;/i,
  'transaction_rollup_validation must preserve service role access',
)
assertNot(
  /grant\s+(?:select,\s*)?insert[\s\S]*on table public\.transaction_rollup_validation to authenticated/i,
  'transaction_rollup_validation must not grant authenticated direct inserts',
)
assertNot(
  /grant\s+(?:select,\s*)?(?:insert,\s*)?update[\s\S]*on table public\.transaction_rollup_validation to authenticated/i,
  'transaction_rollup_validation must not grant authenticated direct updates',
)
assertNot(
  /create policy\s+\w+[\s\S]*on public\.transaction_rollup_validation[\s\S]*(?:for insert|for update|for delete|for all)/i,
  'transaction_rollup_validation must not add direct authenticated write policies',
)

assertHas(
  /create or replace function public\.bridge_can_read_transaction_rollup_validation\(\)[\s\S]*security definer[\s\S]*from public\.profiles p[\s\S]*p\.id = auth\.uid\(\)[\s\S]*lower\(coalesce\(p\.system_role, p\.role, ''\)\)[\s\S]*auth\.jwt\(\) -> 'app_metadata' ->> 'role'/i,
  'rollup validation helper must use profile/app_metadata based platform diagnostics access',
)
assertHas(
  /revoke all on function public\.bridge_can_read_transaction_rollup_validation\(\)[\s\S]*from public, anon;/i,
  'rollup validation helper must not be public/anon callable',
)
assertHas(
  /grant execute on function public\.bridge_can_read_transaction_rollup_validation\(\)[\s\S]*to authenticated, service_role;/i,
  'rollup validation helper must be callable by authenticated/service_role',
)
assertHas(
  /create policy transaction_rollup_validation_platform_diagnostics_select[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(public\.bridge_can_read_transaction_rollup_validation\(\)\)/i,
  'rollup validation select policy must use the reviewed diagnostics helper',
)

assert.ok(!lowered.includes('auth.role()'), 'migration must not use deprecated auth.role() predicates')
assert.ok(!lowered.includes('user_metadata'), 'migration must not authorize from user_metadata')
assertNot(/to authenticated\s+using\s*\(\s*true\s*\)/i, 'migration must not use broad authenticated policies')
assertNot(/to anon/i, 'migration must not add anon policies')

console.log('RLS Phase 5 rollup validation diagnostics migration contract passed.')
