import { requireClient } from '../../src/services/attorneyFirmServiceShared.js'
import {
  ensureTransactionWorkflowInstances,
  getWorkflowStateForTransaction,
  updateWorkflowStepStatus,
} from './transactionWorkflowModelService.js'

function normalizeText(value) {
  return String(value || '').trim()
}

export async function ensureWorkflowStep(transactionId, workflowKey, stepKey, options = {}) {
  const client = options.client || requireClient()
  const normalizedWorkflowKey = normalizeText(workflowKey)
  const normalizedStepKey = normalizeText(stepKey)
  const baseState =
    options.state ||
    (await ensureTransactionWorkflowInstances(transactionId, {
      client,
      transaction: options.transaction,
    }))

  const step =
    (baseState.stepsByWorkflowKey?.[normalizedWorkflowKey] || []).find((row) => row.step_key === normalizedStepKey) || null

  if (!step) {
    throw new Error(`Workflow step not found for ${normalizedWorkflowKey}.${normalizedStepKey}.`)
  }

  return {
    state: baseState,
    step,
  }
}

export async function applyWorkflowStepStatus(transactionId, workflowKey, stepKey, status, options = {}) {
  const client = options.client || requireClient()
  const { state, step } = await ensureWorkflowStep(transactionId, workflowKey, stepKey, options)
  const previousStatus = step.status
  const normalizedStatus = normalizeText(status).toLowerCase()

  if (!normalizedStatus || normalizedStatus === previousStatus) {
    return {
      previousStatus,
      nextStatus: previousStatus,
      step,
      state,
      changed: false,
    }
  }

  const result = await updateWorkflowStepStatus(transactionId, workflowKey, stepKey, normalizedStatus, {
    client,
    completedBy: options.completedBy || null,
    now: options.now,
    transaction: state.transaction,
  })

  return {
    previousStatus,
    nextStatus: result.step?.status || normalizedStatus,
    step: result.step || step,
    state: result.state || (await getWorkflowStateForTransaction(transactionId, { client, transaction: state.transaction })),
    changed: true,
  }
}

