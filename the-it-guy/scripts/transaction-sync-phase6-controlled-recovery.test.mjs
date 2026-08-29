import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  assertPhase6Target,
  parsePhase6Args,
} from './transaction-sync-phase6-controlled-recovery.mjs'

const migrationUrl = new URL('../../supabase/migrations/20260829111644_transaction_sync_phase6_controlled_recovery.sql', import.meta.url)

test('Phase 6 migration adds an RLS-protected immutable recovery receipt', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /create table if not exists public\.transaction_sync_recovery_runs/i)
  assert.match(sql, /alter table public\.transaction_sync_recovery_runs enable row level security/i)
  assert.match(sql, /grant select on table public\.transaction_sync_recovery_runs to authenticated/i)
  assert.match(sql, /grant select, insert on table public\.transaction_sync_recovery_runs to service_role/i)
  assert.doesNotMatch(sql, /update public\.transaction_sync_recovery_runs|delete from public\.transaction_sync_recovery_runs/i)
})

test('controlled recovery RPC is invoker-scoped and service-role-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /bridge_reconcile_transaction_sync_metadata_phase6/i)
  assert.match(sql, /security invoker/i)
  assert.match(sql, /v_role <> 'service_role'/i)
  assert.match(sql, /revoke all on function public\.bridge_reconcile_transaction_sync_metadata_phase6[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(sql, /grant execute on function public\.bridge_reconcile_transaction_sync_metadata_phase6[\s\S]*to service_role/i)
})

test('recovery repairs only proven queue and refresh metadata', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /insert into public\.transaction_sync_projection_queue/i)
  assert.match(sql, /insert into public\.transaction_refresh_signals/i)
  assert.doesNotMatch(sql, /insert into public\.transaction_events/i)
  assert.doesNotMatch(sql, /insert into public\.transaction_activity_projections/i)
  assert.doesNotMatch(sql, /update public\.transaction_sync_command_receipts/i)
  for (const blocker of [
    'receipt_not_projected',
    'receipt_outputs_incomplete',
    'canonical_event_missing',
    'activity_projection_missing',
    'receipt_evidence_mismatch',
    'refresh_version_ahead',
  ]) assert.match(sql, new RegExp(blocker))
})

test('dry-run returns before any recovery or audit write', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const dryRunIndex = sql.indexOf('if not p_apply then')
  const queueWriteIndex = sql.indexOf('insert into public.transaction_sync_projection_queue')
  const receiptWriteIndex = sql.indexOf('insert into public.transaction_sync_recovery_runs')
  assert.ok(dryRunIndex > 0)
  assert.ok(queueWriteIndex > dryRunIndex)
  assert.ok(receiptWriteIndex > queueWriteIndex)
})

test('apply requires explicit recovery, exact project, and production confirmations', () => {
  const plan = parsePhase6Args(['--environment=staging'])
  assert.doesNotThrow(() => assertPhase6Target(plan, 'project-a'))

  const apply = parsePhase6Args([
    '--apply',
    '--environment=staging',
    '--confirm-controlled-recovery',
    '--confirm-project-ref=project-a',
    '--reason=Repair verified projection metadata only.',
  ])
  assert.doesNotThrow(() => assertPhase6Target(apply, 'project-a'))
  assert.throws(() => assertPhase6Target({ ...apply, confirmControlledRecovery: false }, 'project-a'), /confirm-controlled-recovery/)
  assert.throws(() => assertPhase6Target(apply, 'project-b'), /confirm-project-ref=project-b/)
  assert.throws(() => assertPhase6Target({ ...apply, environment: 'production' }, 'project-a'), /confirm-production/)
})

test('orchestrator plans first and re-runs Phase 5 after apply', async () => {
  const source = await readFile(new URL('../server/services/transactionSyncPhase6ControlledRecoveryService.js', import.meta.url), 'utf8')
  assert.match(source, /runTransactionSyncPhase5OperationalAssurance/)
  assert.match(source, /apply: false/)
  assert.match(source, /mode === 'apply'/)
  assert.match(source, /const after = mode === 'apply'[\s\S]*runTransactionSyncPhase5OperationalAssurance/)
  assert.match(source, /bridge_reconcile_transaction_sync_metadata_phase6/)
})

