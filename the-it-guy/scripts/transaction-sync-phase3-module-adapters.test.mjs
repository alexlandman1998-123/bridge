import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import matrix from '../docs/transaction-sync-phase0-action-matrix.json' with { type: 'json' }
import {
  TRANSACTION_SYNC_PHASE3_ACTION_ADAPTERS,
  commitTransactionModuleAction,
  getTransactionSyncPhase3Coverage,
} from '../src/services/transactionSyncActionAdapters.js'

const migration = await readFile('../supabase/migrations/20260829105514_transaction_sync_phase3_module_adapters.sql', 'utf8')
const phase2Migration = await readFile('../supabase/migrations/20260829103738_transaction_sync_phase2_canonical_propagation.sql', 'utf8')
const attorney = await readFile('src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', 'utf8')
const evidence = await readFile('server/services/workflowEvidenceMapper.js', 'utf8')
const originator = await readFile('src/services/bondOriginatorTransactionSyncService.js', 'utf8')

test('every frozen action has an exact Phase 3 adapter', () => {
  const expected = matrix.actions.map((action) => action.actionKey).sort()
  assert.deepEqual(getTransactionSyncPhase3Coverage(), expected)
  for (const action of matrix.actions) {
    const adapter = TRANSACTION_SYNC_PHASE3_ACTION_ADAPTERS[action.actionKey]
    assert.ok(adapter, `${action.actionKey} adapter missing`)
    assert.equal(adapter[0], action.ownerRole)
    assert.equal(adapter[1], action.sourceTable)
    assert.equal(adapter[2], action.defaultVisibility)
    assert.deepEqual([...adapter[3]].sort(), [...action.audiences].sort())
  }
})

test('module adapter derives the source table and stable command envelope', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { status: 'projected' }, error: null } } }
  await commitTransactionModuleAction({
    client,
    transactionId: 'tx-1',
    actionKey: 'ORIGINATOR_PROGRESS_UPDATED',
    sourceRecordId: 'progress-1',
    revision: 'revision-1',
    professionalTitle: 'Originator update',
    professionalDescription: 'The application is being processed.',
  })
  assert.equal(calls[0].name, 'bridge_commit_transaction_sync_command_phase2')
  assert.equal(calls[0].args.p_source_table, 'transaction_bond_originator_progress_events')
  assert.match(calls[0].args.p_idempotency_key, /^txsync:tx-1:ORIGINATOR_PROGRESS_UPDATED:progress-1:revision-1$/)
})

test('originator progress source write and propagation commit are atomic', () => {
  assert.match(migration, /bridge_record_bond_originator_progress_and_sync_phase3/)
  assert.match(migration, /bridge_record_bond_originator_workspace_progress_update[\s\S]*bridge_commit_transaction_sync_command_phase2/)
  assert.match(migration, /bankWorkflowUnchanged/)
  assert.match(migration, /offerWorkflowUnchanged/)
  assert.match(migration, /grantWorkflowUnchanged/)
  assert.equal((migration.match(/pg_advisory_xact_lock/g) || []).length, 2)
  assert.match(originator, /bridge_record_bond_originator_progress_and_sync_phase3/)
  assert.match(originator, /bridge_originator_progress_workspace_view/)
  assert.match(originator, /bridge_client_portal_bond_originator_progress_view/)
})

test('attorney internal comments use the atomic adapter with a legacy fallback only when RPC is unavailable', () => {
  assert.match(migration, /bridge_add_attorney_comment_and_sync_phase3/)
  assert.match(migration, /insert into public\.transaction_attorney_lane_updates[\s\S]*bridge_commit_transaction_sync_command_phase2/)
  assert.match(migration, /select \* into v_existing from public\.transaction_sync_command_receipts[\s\S]*if v_existing\.id is not null/)
  assert.match(attorney, /bridge_add_attorney_comment_and_sync_phase3/)
  assert.match(attorney, /if \(!atomicComment\.error\)/)
  assert.match(attorney, /if \(!phase3Unavailable\) throw atomicComment\.error/)
})

test('system evidence commits only after canonical workflow recompute and omits raw payload', () => {
  const recompute = evidence.indexOf('const recomputed = await publishWorkflowChanged')
  const commit = evidence.indexOf('await commitTransactionModuleAction', recompute)
  assert.ok(recompute >= 0 && commit > recompute)
  assert.match(evidence, /SYSTEM_EVIDENCE_RECONCILED/)
  assert.match(phase2Migration, /SYSTEM_EVIDENCE_RECONCILED[\s\S]*transaction_workflow_evidence/)
  const commandSlice = evidence.slice(commit, evidence.indexOf('\n  return {', commit))
  assert.doesNotMatch(commandSlice, /payload,/)
})

test('Phase 3 privileged functions are invoker-scoped and explicitly granted', () => {
  assert.equal((migration.match(/security invoker/g) || []).length, 2)
  assert.doesNotMatch(migration, /security definer/i)
  assert.match(migration, /revoke all on function public\.bridge_record_bond_originator_progress_and_sync_phase3[\s\S]*from public, anon, authenticated, service_role/)
  assert.match(migration, /revoke all on function public\.bridge_add_attorney_comment_and_sync_phase3[\s\S]*from public, anon, authenticated, service_role/)
})
