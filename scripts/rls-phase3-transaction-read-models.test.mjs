import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260814164152_rls_phase3_transaction_read_models.sql', import.meta.url),
  'utf8',
)
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.match(migration, pattern, message)
}

function assertNot(pattern, message) {
  assert.doesNotMatch(migration, pattern, message)
}

for (const table of ['transaction_document_requirements', 'transaction_lifecycle_workflows']) {
  assertHas(
    new RegExp(`alter table if exists public\\.${table} enable row level security;`, 'i'),
    `${table} must enable RLS`,
  )
  assertHas(
    new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated;`, 'i'),
    `${table} must revoke broad browser/API grants first`,
  )
  assertHas(
    new RegExp(`grant select, insert, update on table public\\.${table} to authenticated;`, 'i'),
    `${table} must expose only reviewed authenticated verbs`,
  )
  assertHas(
    new RegExp(`grant all on table public\\.${table} to service_role;`, 'i'),
    `${table} must preserve service role access`,
  )
  assertNot(
    new RegExp(`create policy\\s+\\w+[\\s\\S]*on public\\.${table}[\\s\\S]*for delete`, 'i'),
    `${table} must not add a delete policy`,
  )
}

assertHas(
  /create policy transaction_document_requirements_participant_select[\s\S]*for select[\s\S]*to authenticated[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'view_documents'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'view_transaction'\)/i,
  'document requirements select must be scoped to transaction document/transaction viewers',
)
assertHas(
  /create policy transaction_document_requirements_resolver_insert[\s\S]*for insert[\s\S]*to authenticated[\s\S]*with check \([\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'edit_core_transaction'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_transfer_workflow'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_bond_workflow'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'upload_transfer_docs'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'upload_bond_docs'\)[\s\S]*\)/i,
  'document requirements insert must be restricted to transaction coordinators/document workflow roles',
)
assertHas(
  /create policy transaction_document_requirements_resolver_update[\s\S]*for update[\s\S]*to authenticated[\s\S]*using \([\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'edit_core_transaction'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_transfer_workflow'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_bond_workflow'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'upload_transfer_docs'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'upload_bond_docs'\)[\s\S]*\)[\s\S]*with check \([\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'edit_core_transaction'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_transfer_workflow'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_bond_workflow'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'upload_transfer_docs'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'upload_bond_docs'\)[\s\S]*\)/i,
  'document requirements update must use both USING and WITH CHECK with the same transaction-scoped write permissions',
)

assertHas(
  /create policy transaction_lifecycle_workflows_participant_select[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \([\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'view_transaction'\)[\s\S]*\)/i,
  'lifecycle workflow select must be scoped to transaction viewers',
)
assertHas(
  /create policy transaction_lifecycle_workflows_coordinator_insert[\s\S]*for insert[\s\S]*to authenticated[\s\S]*with check \([\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'edit_core_transaction'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_transfer_workflow'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_bond_workflow'\)[\s\S]*\)/i,
  'lifecycle workflow insert must be restricted to transaction coordinators/workflow managers',
)
assertHas(
  /create policy transaction_lifecycle_workflows_coordinator_update[\s\S]*for update[\s\S]*to authenticated[\s\S]*using \([\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'edit_core_transaction'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_transfer_workflow'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_bond_workflow'\)[\s\S]*\)[\s\S]*with check \([\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'edit_core_transaction'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_transfer_workflow'\)[\s\S]*public\.bridge_has_transaction_permission\(transaction_id, 'manage_bond_workflow'\)[\s\S]*\)/i,
  'lifecycle workflow update must use both USING and WITH CHECK with the same transaction-scoped write permissions',
)

assert.ok(!lowered.includes('auth.role()'), 'migration must not use deprecated auth.role() predicates')
assertNot(/to authenticated\s+using\s*\(\s*true\s*\)/i, 'migration must not use broad authenticated policies')
assertNot(/to anon/i, 'migration must not add anon policies')

console.log('RLS Phase 3 transaction read models migration contract passed.')
