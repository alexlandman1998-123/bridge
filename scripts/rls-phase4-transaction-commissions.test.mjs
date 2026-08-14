import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260814164526_rls_phase4_transaction_commissions.sql', import.meta.url),
  'utf8',
)
const api = await readFile(new URL('../the-it-guy/src/lib/api.js', import.meta.url), 'utf8')
const lowered = migration.toLowerCase()

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message)
}

function assertNot(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message)
}

assertHas(
  migration,
  /alter table if exists public\.transaction_commissions enable row level security;/i,
  'transaction_commissions must enable RLS',
)
assertHas(
  migration,
  /revoke all on table public\.transaction_commissions from public, anon, authenticated;/i,
  'transaction_commissions must revoke broad direct table grants',
)
assertHas(
  migration,
  /grant select on table public\.transaction_commissions to authenticated;/i,
  'transaction_commissions should expose only reviewed authenticated direct reads',
)
assertHas(
  migration,
  /grant all on table public\.transaction_commissions to service_role;/i,
  'transaction_commissions must preserve service role access',
)
assertNot(
  migration,
  /grant\s+(?:select,\s*)?insert[\s\S]*on table public\.transaction_commissions to authenticated/i,
  'transaction_commissions must not grant authenticated direct inserts',
)
assertNot(
  migration,
  /grant\s+(?:select,\s*)?(?:insert,\s*)?update[\s\S]*on table public\.transaction_commissions to authenticated/i,
  'transaction_commissions must not grant authenticated direct updates',
)
assertNot(
  migration,
  /create policy\s+\w+[\s\S]*on public\.transaction_commissions[\s\S]*for delete/i,
  'transaction_commissions must not add a delete policy',
)
assertNot(
  migration,
  /create policy\s+\w+[\s\S]*on public\.transaction_commissions[\s\S]*(?:for insert|for update|for all)/i,
  'transaction_commissions must not add direct authenticated write policies',
)

assertHas(
  migration,
  /create or replace function public\.bridge_can_read_transaction_commission\(\s*target_organisation_id uuid,\s*target_transaction_id uuid,\s*target_assigned_agent_id uuid,\s*target_assigned_agent_email text\s*\)[\s\S]*security definer[\s\S]*public\.bridge_is_org_admin\(resolved\.organisation_id\)[\s\S]*public\.bridge_is_active_member\(resolved\.organisation_id\)[\s\S]*resolved\.assigned_agent_id = auth\.uid\(\)[\s\S]*resolved\.assigned_agent_email = lower\(coalesce\(public\.bridge_current_email\(\), ''\)\)[\s\S]*public\.bridge_has_transaction_permission\(target_transaction_id, 'view_transaction'\)/i,
  'commission read helper must allow org admins, assigned agents, and transaction viewers',
)
assertHas(
  migration,
  /revoke all on function public\.bridge_can_read_transaction_commission\(uuid, uuid, uuid, text\)[\s\S]*from public, anon;/i,
  'commission read helper must not be public/anon callable',
)
assertHas(
  migration,
  /create policy transaction_commissions_financial_select[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \([\s\S]*public\.bridge_can_read_transaction_commission\([\s\S]*organisation_id,[\s\S]*transaction_id,[\s\S]*assigned_agent_id,[\s\S]*assigned_agent_email[\s\S]*\)[\s\S]*\)/i,
  'commission select policy must use the reviewed read helper',
)

assertHas(
  migration,
  /create or replace function public\.bridge_upsert_transaction_commission_snapshot\([\s\S]*p_transaction_id uuid[\s\S]*p_status text default 'projected'[\s\S]*\)[\s\S]*returns jsonb[\s\S]*security definer/i,
  'commission writes must go through a reviewed security definer RPC',
)
assertHas(
  migration,
  /if not \([\s\S]*public\.bridge_is_org_admin\(v_organisation_id\)[\s\S]*public\.bridge_has_transaction_permission\(p_transaction_id, 'edit_core_transaction'\)[\s\S]*v_status in \('draft', 'projected'\)[\s\S]*public\.bridge_is_active_member\(v_organisation_id\)[\s\S]*v_assigned_agent_id = v_actor[\s\S]*v_assigned_agent_email = v_actor_email[\s\S]*\) then[\s\S]*errcode = '42501'/i,
  'commission write RPC must enforce admin/coordinator/self-assigned draft authorization',
)
assertHas(
  migration,
  /revoke all on function public\.bridge_upsert_transaction_commission_snapshot\([\s\S]*\) from public, anon;/i,
  'commission write RPC must not be public/anon callable',
)
assertHas(
  migration,
  /grant execute on function public\.bridge_upsert_transaction_commission_snapshot\([\s\S]*\) to authenticated, service_role;/i,
  'commission write RPC must be callable by authenticated/service_role',
)

assertHas(
  api,
  /\.rpc\('bridge_upsert_transaction_commission_snapshot', \{[\s\S]*p_transaction_id: transactionId[\s\S]*p_gross_commission_amount: payload\.gross_commission_amount[\s\S]*p_status: payload\.status[\s\S]*\}\)/,
  'API commission snapshot persistence must call the controlled RPC',
)
assertHas(
  api,
  /isMissingFunctionError\(rpcResult\.error, 'bridge_upsert_transaction_commission_snapshot'\)/,
  'API should only fall back to direct writes when the RPC is absent',
)

assert.ok(!lowered.includes('auth.role()'), 'migration must not use deprecated auth.role() predicates')
assertNot(migration, /to authenticated\s+using\s*\(\s*true\s*\)/i, 'migration must not use broad authenticated policies')
assertNot(migration, /to anon/i, 'migration must not add anon policies')

console.log('RLS Phase 4 transaction commissions migration contract passed.')
