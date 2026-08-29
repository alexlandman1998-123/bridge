import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildTransactionSyncIdempotencyKey,
  commitTransactionSyncCommand,
} from '../src/services/transactionSyncCommandService.js'

const migration = await readFile('../supabase/migrations/20260829103738_transaction_sync_phase2_canonical_propagation.sql', 'utf8')
const hook = await readFile('src/hooks/useTransactionLiveRefresh.js', 'utf8')
const attorney = await readFile('src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', 'utf8')

test('Phase 2 migration owns the six durable outputs and all 29 frozen actions', () => {
  for (const table of [
    'transaction_sync_command_receipts', 'transaction_activity_projections',
    'transaction_refresh_signals', 'transaction_sync_projection_queue',
  ]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  const catalogRows = migration.match(/\('[A-Z_]+','[a-z_]+','[A-Za-z]+','[a-z_]+','(?:internal|professional_shared|client_visible)',(?:true|false)\)/g) || []
  assert.equal(catalogRows.length, 29)
  for (const output of ['transaction_event','lane_state','transaction_rollup','activity_projection','refresh_signal','audit_record']) {
    assert.match(migration, new RegExp(`'${output}'`))
  }
})

test('Phase 2 RPC is idempotent, role-scoped, RLS-protected, and not public', () => {
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /unique \(transaction_id, idempotency_key\)/)
  assert.match(migration, /bridge_can_access_transaction_spine/)
  assert.match(migration, /requested visibility exceeds the action contract/i)
  assert.match(migration, /source table does not match the action contract/i)
  assert.match(migration, /case when v_visibility = 'client_visible' then 'professional_shared'/)
  assert.match(migration, /case when v_visibility = 'client_visible' then '\{\}'::jsonb/)
  assert.match(migration, /enable row level security/g)
  assert.match(migration, /revoke all on function public\.bridge_commit_transaction_sync_command_phase2[\s\S]*from public, anon, authenticated, service_role/)
  assert.match(migration, /grant execute on function public\.bridge_commit_transaction_sync_command_phase2[\s\S]*to authenticated, service_role/)
  assert.doesNotMatch(migration, /create\s+(?:table|function|policy).*realtime\./i)
})

test('command client sends the stable envelope and rejects unsafe client activity', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { status: 'projected' }, error: null } } }
  const idempotencyKey = buildTransactionSyncIdempotencyKey({
    transactionId: 'tx-1', actionKey: 'TRANSFER_ATTORNEY_STAGE_UPDATED', sourceRecordId: 'lane-1', revision: '7',
  })
  assert.equal(idempotencyKey, 'txsync:tx-1:TRANSFER_ATTORNEY_STAGE_UPDATED:lane-1:7')
  await assert.rejects(() => commitTransactionSyncCommand({
    client, transactionId: 'tx-1', actionKey: 'AGENT_CLIENT_UPDATE_PUBLISHED', idempotencyKey,
    sourceTable: 'transaction_events', sourceRecordId: 'event-1', visibility: 'client_visible',
    audience: [], professionalTitle: 'Update', professionalDescription: 'Update saved.',
  }), /safe copy/)
  await commitTransactionSyncCommand({
    client, transactionId: 'tx-1', actionKey: 'TRANSFER_ATTORNEY_STAGE_UPDATED', idempotencyKey,
    sourceTable: 'transaction_subprocesses', sourceRecordId: 'lane-1', visibility: 'professional_shared',
    audience: ['agent', 'transfer_attorney'], professionalTitle: 'Transfer progressed', professionalDescription: 'Transfer moved forward.',
  })
  assert.equal(calls[0].name, 'bridge_commit_transaction_sync_command_phase2')
  assert.equal(calls[0].args.p_idempotency_key, idempotencyKey)
})

test('all live consumers subscribe to one transaction version signal with reconnect and polling fallback', () => {
  assert.match(hook, /table: 'transaction_refresh_signals'/)
  assert.match(hook, /transaction_version_changed/)
  assert.match(hook, /transaction_version_reconciled/)
  assert.match(hook, /pollingIntervalMs = 30_000/)
  assert.doesNotMatch(hook, /table: 'transaction_shared_progress'/)
})

test('attorney stage mutations commit a canonical command after lane progress is durable', () => {
  const publicationIndex = attorney.indexOf('await publishAttorneySharedProgress')
  const commandIndex = attorney.indexOf('await commitTransactionModuleAction', publicationIndex)
  assert.ok(publicationIndex >= 0 && commandIndex > publicationIndex)
  assert.match(attorney, /TRANSFER_REGISTRATION_CONFIRMED/)
  assert.match(attorney, /BOND_ATTORNEY_STAGE_UPDATED/)
  assert.match(attorney, /CANCELLATION_ATTORNEY_STAGE_UPDATED/)
})
