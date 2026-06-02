import { requireClient } from '../../src/services/attorneyFirmServiceShared.js'
import { ensureTransactionWorkflowInstances } from './transactionWorkflowModelService.js'
import { logTransactionWorkflowEvent } from './workflowEventService.js'
import { resolveWorkflowEvidenceMappings } from '../workflows/workflowEvidenceMappings.js'
import { writeWorkflowEvidence } from './workflowEvidenceService.js'
import { applyWorkflowStepStatus, ensureWorkflowStep } from './workflowStepService.js'
import { publishWorkflowChanged } from './workflowRecomputeService.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function toIsoString(value) {
  const parsed = new Date(value || Date.now())
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

function resolveStepStatus(rule = {}, status = '') {
  const normalizedStatus = normalizeKey(status)
  if (!normalizedStatus) return null
  if ((rule.completeOn || []).includes(normalizedStatus)) return 'complete'
  if ((rule.blockedOn || []).includes(normalizedStatus)) return 'blocked'
  if ((rule.reopenOn || []).includes(normalizedStatus)) return rule.reopenTo || 'pending'
  if ((rule.pendingOn || []).includes(normalizedStatus)) return 'pending'
  return null
}

function buildReasonCode(evidenceType = '', evidenceKey = '', status = '') {
  return [
    'WORKFLOW_EVIDENCE',
    normalizeText(evidenceType).toUpperCase() || 'UNKNOWN',
    normalizeText(evidenceKey).toUpperCase() || 'UNKNOWN',
    normalizeText(status).toUpperCase() || 'OBSERVED',
  ].join('_')
}

export async function processWorkflowEvidence({
  transactionId,
  evidenceType,
  evidenceId,
  evidenceKey,
  status,
  source = 'system',
  createdBy = null,
  payload = {},
  occurredAt = null,
  client: explicitClient = null,
} = {}) {
  const client = explicitClient || requireClient()
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction id is required.')
  }

  const baseState = await ensureTransactionWorkflowInstances(normalizedTransactionId, { client })
  const mappings = resolveWorkflowEvidenceMappings({
    evidenceType,
    evidenceKey,
    status,
    payload,
    transaction: baseState.transaction,
  })

  if (!mappings.length) {
    return {
      mapped: false,
      results: [],
      rollup: null,
      compatibility: null,
    }
  }

  const nowIso = toIsoString(occurredAt || payload.occurredAt || Date.now())
  let state = baseState
  const results = []

  for (const mapping of mappings) {
    const ensured = await ensureWorkflowStep(normalizedTransactionId, mapping.workflowKey, mapping.stepKey, {
      client,
      state,
      transaction: state.transaction,
    })
    const evidenceRow = await writeWorkflowEvidence(
      normalizedTransactionId,
      ensured.step,
      {
        workflowKey: mapping.workflowKey,
        stepKey: mapping.stepKey,
        evidenceType,
        evidenceId,
        evidenceStatus: null,
        status,
      },
      { client },
    )

    const stepUpdate = await applyWorkflowStepStatus(
      normalizedTransactionId,
      mapping.workflowKey,
      mapping.stepKey,
      resolveStepStatus(mapping, status),
      {
        client,
        state,
        transaction: state.transaction,
        completedBy: createdBy || null,
        now: nowIso,
      },
    )
    state = stepUpdate.state || state

    await logTransactionWorkflowEvent(
      {
        transactionId: normalizedTransactionId,
        workflowKey: mapping.workflowKey,
        stepKey: mapping.stepKey,
        actionKey: normalizeText(evidenceKey).toUpperCase(),
        eventType: 'workflow_evidence_processed',
        previousStatus: stepUpdate.previousStatus,
        newStatus: stepUpdate.nextStatus,
        payload: {
          evidenceType: normalizeText(evidenceType),
          evidenceId: normalizeText(evidenceId),
          evidenceKey: normalizeText(evidenceKey),
          status: normalizeText(status),
          source: normalizeText(source) || 'system',
          mapping,
          payload,
        },
        source: normalizeText(source) || 'system',
        createdBy,
      },
      { client },
    )

    results.push({
      mapping,
      evidence: evidenceRow,
      previousStatus: stepUpdate.previousStatus,
      nextStatus: stepUpdate.nextStatus,
      changed: stepUpdate.changed,
    })
  }

  const recomputed = await publishWorkflowChanged({
    transactionId: normalizedTransactionId,
    client,
    now: nowIso,
    reasonCode: buildReasonCode(evidenceType, evidenceKey, status),
    triggerType: 'workflow_evidence',
    triggerId: normalizeText(evidenceId) || normalizeText(evidenceKey) || null,
    createdBy,
    source: normalizeText(source) || 'system',
    payload: {
      evidenceType: normalizeText(evidenceType),
      evidenceId: normalizeText(evidenceId),
      evidenceKey: normalizeText(evidenceKey),
      status: normalizeText(status),
      mappings: results.map((item) => item.mapping),
    },
  })

  return {
    mapped: true,
    results,
    rollup: recomputed.rollup,
    persistedRollup: recomputed.persistedRollup,
    compatibility: recomputed.compatibility,
  }
}
