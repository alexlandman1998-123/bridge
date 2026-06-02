import {
  requireClient,
  isMissingColumnError,
  isMissingTableError,
} from '../../src/services/attorneyFirmServiceShared.js'
import { resolveTransactionRollup } from './transactionWorkflowRollup.js'
import {
  getWorkflowStateForTransaction,
  persistTransactionRollup,
} from './transactionWorkflowModelService.js'
import {
  assertNoLegacyLifecycleFieldWrites,
  syncTransactionCompatibilityFields,
} from './transactionStageCompatibilityService.js'
import { hasMeaningfulRollupAuditChange } from './transactionRollupAuditService.js'
import {
  logWorkflowChangedEvent,
  logWorkflowRecomputeEvent,
} from './workflowEventService.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeRecomputeArgs(transactionIdOrOptions, maybeOptions = {}) {
  if (
    transactionIdOrOptions &&
    typeof transactionIdOrOptions === 'object' &&
    !Array.isArray(transactionIdOrOptions)
  ) {
    const { transactionId, ...rest } = transactionIdOrOptions
    return {
      transactionId: normalizeText(transactionId),
      options: { ...rest },
    }
  }

  return {
    transactionId: normalizeText(transactionIdOrOptions),
    options: { ...maybeOptions },
  }
}

async function updateRollupHealth(client, transactionId, patch = {}) {
  if (!transactionId || !patch || !Object.keys(patch).length) return null

  let query = await client.from('transaction_rollups').upsert(
    {
      transaction_id: transactionId,
      ...patch,
    },
    { onConflict: 'transaction_id' },
  )

  if (
    query.error &&
    (
      isMissingColumnError(query.error, 'is_stale') ||
      isMissingColumnError(query.error, 'last_error') ||
      isMissingColumnError(query.error, 'last_recompute_attempt_at')
    )
  ) {
    const fallbackPatch = { transaction_id: transactionId, ...patch }
    if (isMissingColumnError(query.error, 'is_stale')) delete fallbackPatch.is_stale
    if (isMissingColumnError(query.error, 'last_error')) delete fallbackPatch.last_error
    if (isMissingColumnError(query.error, 'last_recompute_attempt_at')) delete fallbackPatch.last_recompute_attempt_at

    if (Object.keys(fallbackPatch).length === 1) {
      return null
    }

    query = await client.from('transaction_rollups').upsert(fallbackPatch, { onConflict: 'transaction_id' })
  }

  if (query.error && !isMissingTableError(query.error, 'transaction_rollups')) {
    throw query.error
  }

  return query.data || null
}

export async function recomputeTransactionWorkflow(transactionIdOrOptions, maybeOptions = {}) {
  const { transactionId, options } = normalizeRecomputeArgs(transactionIdOrOptions, maybeOptions)
  const client = options.client || requireClient()
  if (!transactionId) {
    throw new Error('Transaction id is required.')
  }
  assertNoLegacyLifecycleFieldWrites(options.extraFields || {}, {
    source: options.triggerType || options.reasonCode || 'workflow_recompute',
  })
  const triggerType = normalizeText(options.triggerType) || 'workflow_evidence'
  const reasonCode = normalizeText(options.reasonCode) || 'WORKFLOW_REEVALUATED'
  const createdBy = options.createdBy || options.userId || null
  const attemptAt = options.now || new Date().toISOString()
  let previousState = options.state || null
  let previousRollup = options.previousRollup || null

  try {
    previousState =
      previousState ||
      (await getWorkflowStateForTransaction(transactionId, {
        client,
        transaction: options.transaction,
      }))
    previousRollup = previousRollup || previousState.rollup || null

    const rollup = await resolveTransactionRollup(transactionId, {
      client,
      normalizedState: previousState,
      transaction: previousState.transaction,
      actorRole: options.actorRole,
    })

    const persistedRollup = await persistTransactionRollup(transactionId, rollup, {
      client,
      previousRollup,
      reasonCode,
      triggerType,
      triggerId: options.triggerId || null,
      triggerSource: options.source || triggerType,
      forceAudit: options.forceAudit === true,
      auditMetadata: options.auditMetadata || null,
      createdBy,
    })

    await updateRollupHealth(client, transactionId, {
      is_stale: false,
      last_error: null,
      last_recompute_attempt_at: attemptAt,
    })

    const compatibility = await syncTransactionCompatibilityFields(transactionId, rollup, {
      client,
      transaction: previousState.transaction,
      now: options.now,
      createdBy,
      source: triggerType || 'workflow_recompute',
      extraFields: options.extraFields || {},
    })

    const changed = hasMeaningfulRollupAuditChange(previousRollup, persistedRollup)
    await logWorkflowRecomputeEvent(
      {
        transactionId,
        workflowKey: '',
        stepKey: '',
        actionKey: 'ROLLUP_RECOMPUTE',
        eventType: changed ? 'workflow_recompute_completed' : 'workflow_recompute_noop',
        previousStatus: previousRollup?.parent_status || null,
        newStatus: persistedRollup?.parent_status || null,
        payload: {
          triggerType,
          triggerId: options.triggerId || null,
          reasonCode,
          previousParentStage: previousRollup?.parent_stage || null,
          newParentStage: persistedRollup?.parent_stage || null,
          changed,
          noOp: !changed,
          derivedAt: persistedRollup?.derived_at || rollup?.derivedAt || attemptAt,
        },
        source: 'workflow_recompute',
        createdBy,
      },
      { client },
    )

    return {
      state: await getWorkflowStateForTransaction(transactionId, { client, transaction: previousState.transaction }),
      previousRollup,
      rollup,
      persistedRollup,
      compatibility,
      changed,
      noOp: !changed,
      stale: false,
    }
  } catch (error) {
    await updateRollupHealth(client, transactionId, {
      is_stale: true,
      last_error: normalizeText(error?.message || error),
      last_recompute_attempt_at: attemptAt,
    })
    await logWorkflowRecomputeEvent(
      {
        transactionId,
        workflowKey: '',
        stepKey: '',
        actionKey: 'ROLLUP_RECOMPUTE',
        eventType: 'workflow_recompute_failed',
        previousStatus: previousRollup?.parent_status || null,
        newStatus: previousRollup?.parent_status || null,
        payload: {
          triggerType,
          triggerId: options.triggerId || null,
          reasonCode,
          error: normalizeText(error?.message || error),
        },
        source: 'workflow_recompute',
        createdBy,
      },
      { client },
    )
    throw error
  }
}

export async function publishWorkflowChanged(event = {}) {
  const client = event.client || requireClient()
  const transactionId = normalizeText(event.transactionId)
  if (!transactionId) {
    throw new Error('Transaction id is required.')
  }

  const triggerType = normalizeText(event.triggerType) || 'workflow_evidence'
  const reasonCode = normalizeText(event.reasonCode) || 'WORKFLOW_CHANGED'
  const createdBy = event.createdBy || event.userId || null

  await logWorkflowChangedEvent(
    {
      transactionId,
      workflowKey: '',
      stepKey: '',
      actionKey: 'ROLLUP_RECOMPUTE',
      eventType: 'transaction.workflow.changed',
      previousStatus: null,
      newStatus: null,
      payload: {
        triggerType,
        triggerId: event.triggerId || null,
        reasonCode,
        payload: event.payload || {},
      },
      source: event.source || triggerType || 'workflow_recompute',
      createdBy,
    },
    { client },
  )

  return recomputeTransactionWorkflow(transactionId, {
    ...event,
    client,
    triggerType,
    reasonCode,
    createdBy,
  })
}
