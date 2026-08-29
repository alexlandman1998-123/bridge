import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { assertPhase1ApplyGate, parsePhase1Args } from './transaction-sync-phase1-spine-repair.mjs'

const migrationService = await readFile('server/services/transactionWorkflowMigrationService.js', 'utf8')
const repairService = await readFile('server/services/transactionSyncPhase1SpineRepairService.js', 'utf8')

test('Phase 1 defaults to a read-only plan', () => {
  assert.deepEqual(parsePhase1Args([]), {
    mode: 'plan', limit: 25, offset: 0, includeDemo: false, transactionId: '', environment: '',
  })
})

test('the selected environment controls credential loading', async () => {
  const runner = await readFile('scripts/transaction-sync-phase1-spine-repair.mjs', 'utf8')
  assert.match(runner, /options\.environment \|\| process\.env\.NODE_ENV/)
  assert.match(runner, /loadEnv\(modeName/)
})

test('production apply requires environment, exact project ref, and confirmation', () => {
  const projectRef = 'test-project'
  assert.throws(() => assertPhase1ApplyGate({ mode: 'apply' }, { projectRef }), /environment/)
  assert.throws(
    () => assertPhase1ApplyGate({ mode: 'apply', environment: 'production' }, { projectRef }),
    /confirm-project-ref/,
  )
  assert.throws(
    () => assertPhase1ApplyGate({ mode: 'apply', environment: 'production', confirmProjectRef: projectRef }, { projectRef }),
    /confirm-production/,
  )
  assert.doesNotThrow(() => assertPhase1ApplyGate({
    mode: 'apply', environment: 'production', confirmProjectRef: projectRef, confirmProduction: true,
  }, { projectRef }))
})

test('repair keeps legacy transaction lifecycle fields outside Phase 1', () => {
  assert.match(migrationService, /syncCompatibilityFields === false/)
  assert.match(repairService, /syncCompatibilityFields:\s*false/)
})

test('repair covers lanes, canonical model, shared progress, and post-write verification', () => {
  assert.match(repairService, /ensureTransactionSubprocesses/)
  assert.match(repairService, /select\('id,transaction_id,process_type,status,lane_status,current_stage,updated_at'\)/)
  assert.match(repairService, /runTransactionWorkflowMigration/)
  assert.match(repairService, /reconcileTransactionProgressPropagation/)
  assert.match(repairService, /const after = await inspectTransactionSyncSpine/)
  assert.match(repairService, /verified: after\.healthy/)
})

test('plan mode cannot invoke the repair branch', () => {
  assert.match(repairService, /mode === 'apply'\s*\? await repairTransactionSyncSpine/)
})
