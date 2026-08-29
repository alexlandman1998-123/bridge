import { ensureTransactionSubprocesses } from '../../src/lib/api.js'
import { reconcileTransactionProgressPropagation } from '../../src/services/transactionSharedProgressService.js'
import {
  getWorkflowStateForTransaction,
  inferWorkflowKeysForTransaction,
} from './transactionWorkflowModelService.js'
import { runTransactionWorkflowMigration } from './transactionWorkflowMigrationService.js'

const PROGRESSED_STATUSES = new Set(['active', 'pending', 'in_progress', 'waiting', 'blocked', 'completed', 'complete'])

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function isActiveTransaction(transaction = {}) {
  return transaction.is_active !== false && !['archived', 'cancelled'].includes(normalize(transaction.lifecycle_state))
}

function isVirtual(row = {}) {
  return String(row.id || '').startsWith('virtual-')
}

function processKeyForLane(lane = {}) {
  return normalize(lane.process_type) === 'attorney' ? 'transfer' : normalize(lane.process_type)
}

async function fetchTransactions(client, options = {}) {
  const select = 'id,finance_type,current_main_stage,stage,onboarding_status,seller_onboarding_status,lifecycle_state,seller_has_existing_bond,existing_bond,cancellation_required,is_active,is_demo_data,updated_at,created_at,completed_at,cancelled_at'
  let query = client.from('transactions').select(select).order('created_at', { ascending: true })
  if (options.transactionId) query = query.eq('id', options.transactionId)
  else query = query.range(options.offset || 0, (options.offset || 0) + (options.limit || 25) - 1)
  const result = await query
  if (result.error) throw result.error
  return (result.data || []).filter((transaction) =>
    isActiveTransaction(transaction) && (options.includeDemo === true || transaction.is_demo_data !== true),
  )
}

async function fetchSharedProgress(client, transactionId) {
  const result = await client
    .from('transaction_shared_progress')
    .select('id,transaction_id,process_key,step_key,status,visibility,updated_at')
    .eq('transaction_id', transactionId)
  if (result.error) throw result.error
  return result.data || []
}

async function fetchLanePointers(client, transactionId) {
  const result = await client
    .from('transaction_subprocesses')
    .select('id,transaction_id,process_type,status,lane_status,current_stage,updated_at')
    .eq('transaction_id', transactionId)
  if (result.error) throw result.error
  return result.data || []
}

export async function inspectTransactionSyncSpine(client, transaction) {
  const [lanes, lanePointers, workflowState, sharedProgress] = await Promise.all([
    ensureTransactionSubprocesses(client, transaction.id, { createIfMissing: false }),
    fetchLanePointers(client, transaction.id),
    getWorkflowStateForTransaction(transaction.id, { client, transaction }),
    fetchSharedProgress(client, transaction.id),
  ])
  const expectedWorkflowKeys = inferWorkflowKeysForTransaction(transaction)
  const workflowKeys = new Set((workflowState.instances || []).map((row) => row.workflow_key))
  const progressKeys = new Set(sharedProgress.map((row) => normalize(row.process_key)))
  const missingLaneTypes = unique(lanes.filter(isVirtual).map((lane) => normalize(lane.process_type)))
  const missingLaneStepCount = lanes.reduce(
    (total, lane) => total + (lane.steps || []).filter(isVirtual).length,
    0,
  )
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]))
  const invalidLaneStageIds = lanePointers
    .filter((pointer) =>
      pointer.current_stage && !(laneById.get(pointer.id)?.steps || []).some((step) => step.step_key === pointer.current_stage),
    )
    .map((pointer) => pointer.id)
  const progressedLaneKeys = unique(
    lanePointers
      .filter((lane) => PROGRESSED_STATUSES.has(normalize(lane.lane_status || lane.status)))
      .map(processKeyForLane),
  )
  const missingSharedProgressKeys = unique([
    ...(progressKeys.has('transaction') ? [] : ['transaction']),
    ...progressedLaneKeys.filter((key) => !progressKeys.has(key)),
  ])
  const missingWorkflowKeys = expectedWorkflowKeys.filter((key) => !workflowKeys.has(key))
  const missingWorkflowStepKeys = expectedWorkflowKeys.filter(
    (key) => workflowKeys.has(key) && !(workflowState.stepsByWorkflowKey?.[key] || []).length,
  )

  const gaps = {
    missingLaneTypes,
    missingLaneStepCount,
    invalidLaneStageIds,
    missingWorkflowKeys,
    missingWorkflowStepKeys,
    missingRollup: !workflowState.rollup,
    missingSharedProgressKeys,
  }
  const gapCount =
    missingLaneTypes.length +
    missingLaneStepCount +
    invalidLaneStageIds.length +
    missingWorkflowKeys.length +
    missingWorkflowStepKeys.length +
    Number(gaps.missingRollup) +
    missingSharedProgressKeys.length

  return {
    transactionId: transaction.id,
    gapCount,
    healthy: gapCount === 0,
    gaps,
    counts: {
      lanes: lanes.length,
      workflowInstances: workflowState.instances?.length || 0,
      workflowSteps: workflowState.steps?.length || 0,
      workflowEvidence: workflowState.evidence?.length || 0,
      sharedProgress: sharedProgress.length,
    },
  }
}

async function repairInvalidLaneStages(client, transactionId) {
  const [lanes, lanePointers] = await Promise.all([
    ensureTransactionSubprocesses(client, transactionId, { createIfMissing: true }),
    fetchLanePointers(client, transactionId),
  ])
  const pointerById = new Map(lanePointers.map((row) => [row.id, row]))
  let repaired = 0
  for (const lane of lanes) {
    const currentStage = pointerById.get(lane.id)?.current_stage
    if (!currentStage || (lane.steps || []).some((step) => step.step_key === currentStage)) continue
    const replacement =
      (lane.steps || []).find((step) => ['in_progress', 'blocked', 'waiting'].includes(normalize(step.status))) ||
      (lane.steps || []).find((step) => normalize(step.status) === 'not_started') ||
      [...(lane.steps || [])].reverse().find((step) => normalize(step.status) === 'completed')
    if (!replacement?.step_key) continue
    const update = await client
      .from('transaction_subprocesses')
      .update({ current_stage: replacement.step_key })
      .eq('id', lane.id)
      .eq('transaction_id', transactionId)
    if (update.error) throw update.error
    repaired += 1
  }
  return repaired
}

export async function repairTransactionSyncSpine(client, transaction, options = {}) {
  const before = await inspectTransactionSyncSpine(client, transaction)
  await ensureTransactionSubprocesses(client, transaction.id, { createIfMissing: true })
  const invalidStagesRepaired = await repairInvalidLaneStages(client, transaction.id)
  const migration = await runTransactionWorkflowMigration({
    client,
    transactionId: transaction.id,
    limit: 1,
    source: options.source || 'transaction_sync_phase1',
    persistValidation: true,
    syncCompatibilityFields: false,
    createdBy: options.createdBy || null,
  })
  if (migration.failedCount) {
    throw new Error(migration.failures[0]?.message || 'Canonical workflow migration failed.')
  }
  const propagation = await reconcileTransactionProgressPropagation({
    client,
    transactionId: transaction.id,
    limit: 1000,
    source: options.source || 'transaction_sync_phase1',
  })
  const after = await inspectTransactionSyncSpine(client, transaction)
  return {
    transactionId: transaction.id,
    before,
    after,
    repairedCount: Math.max(0, before.gapCount - after.gapCount),
    invalidStagesRepaired,
    propagationRepairs: propagation?.repairs || {},
    verified: after.healthy,
  }
}

export async function runTransactionSyncPhase1(client, options = {}) {
  const mode = options.mode === 'apply' ? 'apply' : 'plan'
  const transactions = await fetchTransactions(client, {
    transactionId: options.transactionId || '',
    limit: Math.max(1, Math.min(Number(options.limit) || 25, 1000)),
    offset: Math.max(0, Number(options.offset) || 0),
    includeDemo: options.includeDemo === true,
  })
  const rows = []
  const failures = []
  for (const transaction of transactions) {
    try {
      rows.push(
        mode === 'apply'
          ? await repairTransactionSyncSpine(client, transaction, options)
          : await inspectTransactionSyncSpine(client, transaction),
      )
    } catch (error) {
      failures.push({ transactionId: transaction.id, message: String(error?.message || error) })
    }
  }
  const beforeGapCount = rows.reduce((total, row) => total + (row.before?.gapCount ?? row.gapCount ?? 0), 0)
  const remainingGapCount = rows.reduce((total, row) => total + (row.after?.gapCount ?? row.gapCount ?? 0), 0)
  return {
    phase: 1,
    mode,
    transactionsProcessed: transactions.length,
    healthyTransactions: rows.filter((row) => (row.after || row).healthy).length,
    beforeGapCount,
    remainingGapCount,
    failedCount: failures.length,
    failures,
    rows,
  }
}
