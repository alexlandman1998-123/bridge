import { requireClient } from '../../src/services/attorneyFirmServiceShared.js'
import { normalizeRoleType } from '../../src/core/transactions/permissions.js'
import { getTransactionWorkflowDefinition } from '../workflows/transactionWorkflowDefinitions.js'
import {
  attachWorkflowEvidence,
  ensureTransactionWorkflowInstances,
  getWorkflowStateForTransaction,
  updateWorkflowStepStatus,
} from './transactionWorkflowModelService.js'
import { buildBlockerFromStep, dedupeBlockers } from './workflowBlockerFactory.js'
import { resolveTransactionRollup } from './transactionWorkflowRollup.js'
import {
  getWorkflowActionDescriptor,
  isWorkflowActionAllowedForRole,
} from './workflowActionAvailabilityService.js'
import {
  assertNoLegacyLifecycleFieldWrites,
} from './transactionStageCompatibilityService.js'
import { logTransactionWorkflowEvent } from './workflowEventService.js'
import { publishWorkflowChanged } from './workflowRecomputeService.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function isCompleteStatus(value = '') {
  return ['complete', 'skipped', 'not_applicable'].includes(String(value || '').trim().toLowerCase())
}

function toIsoString(value) {
  const parsed = new Date(value || Date.now())
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

function buildActionBlockedResponse(blockers = [], rollup = null, descriptor = null) {
  return {
    success: false,
    allowed: false,
    blocked: true,
    actionKey: descriptor?.actionKey || null,
    blockers: dedupeBlockers(blockers),
    rollup,
  }
}

function buildActionErrorMessage(blockers = []) {
  return dedupeBlockers(blockers)
    .map((blocker) => normalizeText(blocker?.message))
    .filter(Boolean)
    .join(' ')
}

function validateRegistrationPayload(transaction = {}, payload = {}) {
  const blockers = []
  if (!normalizeText(payload.registrationDate || transaction.registration_date || '')) {
    blockers.push({
      code: 'REGISTRATION_DATE_REQUIRED',
      message: 'Registration date is required before the transaction can be marked as Registered.',
      severity: 'hard',
      ownerRole: 'attorney',
      workflowKey: 'registration',
      stepKey: 'registration_confirmed',
      requiredEvidence: [],
    })
  }
  if (!normalizeText(payload.titleDeedNumber || transaction.title_deed_number || '')) {
    blockers.push({
      code: 'TITLE_DEED_NUMBER_REQUIRED',
      message: 'Title deed number is required before the transaction can be marked as Registered.',
      severity: 'hard',
      ownerRole: 'attorney',
      workflowKey: 'registration',
      stepKey: 'registration_confirmed',
      requiredEvidence: [],
    })
  }
  if (!normalizeText(payload.registrationConfirmationDocumentId || transaction.registration_confirmation_document_id || '')) {
    blockers.push({
      code: 'REGISTRATION_CONFIRMATION_REQUIRED',
      message: 'Registration confirmation evidence is required before the transaction can be marked as Registered.',
      severity: 'hard',
      ownerRole: 'attorney',
      workflowKey: 'registration',
      stepKey: 'registration_confirmed',
      requiredEvidence: ['REGISTRATION_LETTER'],
    })
  }
  return blockers
}

function validateWorkflowAction(descriptor, state = {}, rollup = {}, payload = {}, actorRole = 'system') {
  if (!descriptor) {
    return [
      {
        code: 'WORKFLOW_ACTION_UNSUPPORTED',
        message: 'This workflow action is not supported.',
        severity: 'hard',
        ownerRole: 'system',
        workflowKey: '',
        stepKey: undefined,
        requiredEvidence: [],
      },
    ]
  }

  if (descriptor.executionMode === 'external') {
    return [
      {
        code: 'WORKFLOW_ACTION_EXTERNAL_ONLY',
        message: 'This action must be completed from the workspace surface that owns the request flow.',
        severity: 'hard',
        ownerRole: descriptor.ownerRole || 'system',
        workflowKey: descriptor.workflowKey,
        stepKey: descriptor.stepKey || undefined,
        requiredEvidence: descriptor.requiredEvidence || [],
      },
    ]
  }

  if (descriptor.transactionOnly) {
    if (descriptor.actionKey === 'CANCEL_TRANSACTION' && !normalizeText(payload.reason)) {
      return [
        {
          code: 'CANCELLATION_REASON_REQUIRED',
          message: 'A cancellation reason is required before the transaction can be cancelled.',
          severity: 'hard',
          ownerRole: 'agent',
          workflowKey: '',
          stepKey: undefined,
          requiredEvidence: [],
        },
      ]
    }
    return []
  }

  if (!isWorkflowActionAllowedForRole(descriptor, actorRole)) {
    return [
      {
        code: 'WORKFLOW_ACTION_FORBIDDEN',
        message: 'You do not have permission to perform this action.',
        severity: 'hard',
        ownerRole: descriptor.ownerRole || 'system',
        workflowKey: descriptor.workflowKey,
        stepKey: descriptor.stepKey || undefined,
        requiredEvidence: descriptor.requiredEvidence || [],
      },
    ]
  }

  const workflowSteps = state.stepsByWorkflowKey?.[descriptor.workflowKey] || []
  const targetStep = workflowSteps.find((step) => step.step_key === descriptor.stepKey) || null
  if (!targetStep) {
    return [
      {
        code: 'WORKFLOW_ACTION_TARGET_NOT_FOUND',
        message: `Workflow step ${descriptor.workflowKey}.${descriptor.stepKey} was not found.`,
        severity: 'hard',
        ownerRole: 'system',
        workflowKey: descriptor.workflowKey,
        stepKey: descriptor.stepKey,
        requiredEvidence: [],
      },
    ]
  }

  if (descriptor.actionKey === 'MARK_REGISTERED') {
    const registrationBlockers = validateRegistrationPayload(state.transaction || {}, payload)
    if (registrationBlockers.length) {
      return registrationBlockers
    }
  }

  if (
    descriptor.prerequisiteParentStage &&
    rollup?.parentStage === descriptor.prerequisiteParentStage &&
    Array.isArray(rollup.blockers) &&
    rollup.blockers.length
  ) {
    const blockersExcludingTarget = dedupeBlockers(rollup.blockers).filter(
      (blocker) =>
        !(
          normalizeText(blocker.workflowKey) === normalizeText(descriptor.workflowKey) &&
          normalizeText(blocker.stepKey) === normalizeText(descriptor.stepKey)
        ),
    )
    if (blockersExcludingTarget.length) {
      return blockersExcludingTarget
    }
  }

  if (descriptor.targetStatus === 'complete') {
    const blockers = workflowSteps
      .filter((step) =>
        Number(step.sort_order || 0) < Number(targetStep.sort_order || 0) &&
        step.required !== false &&
        step.blocking === true &&
        !isCompleteStatus(step.status),
      )
      .map((step) =>
        buildBlockerFromStep(
          {
            workflowKey: descriptor.workflowKey,
            label: getTransactionWorkflowDefinition(descriptor.workflowKey)?.label || descriptor.workflowKey,
          },
          {
            stepKey: step.step_key,
            stepLabel: step.step_label,
            ownerRole: step.owner_role,
            requiredEvidence: [],
          },
        ),
      )
    return dedupeBlockers(blockers)
  }

  return []
}

function buildActionTransactionFields(actionKey, state = {}, payload = {}, userId = null, nowIso = new Date().toISOString()) {
  const transaction = state.transaction || {}
  const key = normalizeText(actionKey).toUpperCase()

  if (key === 'MARK_REGISTERED') {
    return {
      lifecycle_state: 'registered',
      attorney_stage: 'registered',
      registration_date: payload.registrationDate || transaction.registration_date || nowIso.slice(0, 10),
      title_deed_number: payload.titleDeedNumber || transaction.title_deed_number || null,
      registration_confirmation_document_id:
        payload.registrationConfirmationDocumentId || transaction.registration_confirmation_document_id || null,
      registered_by_user_id: userId || null,
      registered_at: transaction.registered_at || nowIso,
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancelled_reason: null,
      archived_at: null,
      archived_by_user_id: null,
      archive_reason: null,
      last_meaningful_activity_at: nowIso,
    }
  }

  if (key === 'CANCEL_TRANSACTION') {
    return {
      lifecycle_state: 'cancelled',
      cancelled_at: nowIso,
      cancelled_by_user_id: userId || null,
      cancelled_reason: normalizeText(payload.reason) || null,
      archived_at: null,
      archived_by_user_id: null,
      archive_reason: null,
      last_meaningful_activity_at: nowIso,
    }
  }

  if (key === 'REOPEN_FINANCE' || key === 'REOPEN_TRANSFER') {
    return {
      lifecycle_state: 'active',
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancelled_reason: null,
      archived_at: null,
      archived_by_user_id: null,
      archive_reason: null,
      updated_at: nowIso,
    }
  }

  return {
    last_meaningful_activity_at: nowIso,
  }
}

function getFollowUpStepUpdates() {
  return []
}

export async function runWorkflowAction({
  transactionId,
  actionKey,
  userId = null,
  actorRole = 'system',
  payload = {},
  client: explicitClient = null,
} = {}) {
  const client = explicitClient || requireClient()
  const nowIso = toIsoString(payload.occurredAt || Date.now())

  if (!transactionId) {
    throw new Error('Transaction id is required.')
  }

  if (!normalizeText(actionKey)) {
    throw new Error('Action key is required.')
  }

  const ensuredState = await ensureTransactionWorkflowInstances(transactionId, { client })
  const workflowMap = {}
  for (const [workflowKey, steps] of Object.entries(ensuredState.stepsByWorkflowKey || {})) {
    workflowMap[workflowKey] = {
      workflowKey,
      requiredSteps: steps,
      blockers: [],
      status: (ensuredState.instances || []).find((row) => row.workflow_key === workflowKey)?.status || 'not_started',
    }
  }

  const currentRollup = await resolveTransactionRollup(transactionId, {
    client,
    normalizedState: ensuredState,
    transaction: ensuredState.transaction,
    actorRole,
  })

  const state = {
    ...ensuredState,
    workflowMap,
  }

  const descriptor = getWorkflowActionDescriptor(actionKey, {
    transaction: state.transaction,
    rollup: currentRollup,
    activeWorkflow: currentRollup?.workflows?.[currentRollup?.activeWorkflowKey] || null,
    workflows: currentRollup?.workflows || state.workflowMap,
  })
  const blockers = validateWorkflowAction(
    descriptor,
    state,
    currentRollup,
    payload,
    normalizeRoleType(actorRole || 'developer'),
  )
  if (blockers.length) {
    await logTransactionWorkflowEvent(
      {
        transactionId,
        workflowKey: descriptor?.workflowKey || '',
        stepKey: descriptor?.stepKey || '',
        actionKey,
        eventType: 'workflow_action_blocked',
        previousStatus: currentRollup.parentStatus,
        newStatus: currentRollup.parentStatus,
        payload: {
          blockers,
          source: payload.source || 'user_action',
        },
        source: payload.source || 'user_action',
        createdBy: userId || null,
      },
      { client },
    )

    return buildActionBlockedResponse(blockers, currentRollup, descriptor)
  }

  let previousStepStatus = null
  if (descriptor?.workflowKey && descriptor?.stepKey) {
    const existingStep = (state.stepsByWorkflowKey?.[descriptor.workflowKey] || []).find((step) => step.step_key === descriptor.stepKey) || null
    previousStepStatus = existingStep?.status || null
    if (!isCompleteStatus(existingStep?.status) || descriptor.targetStatus !== 'complete') {
      await updateWorkflowStepStatus(transactionId, descriptor.workflowKey, descriptor.stepKey, descriptor.targetStatus, {
        client,
        completedBy: userId || null,
        now: nowIso,
        transaction: state.transaction,
      })
    }
  }

  for (const followUpStep of getFollowUpStepUpdates(descriptor)) {
    await updateWorkflowStepStatus(transactionId, followUpStep.workflowKey, followUpStep.stepKey, followUpStep.targetStatus, {
      client,
      completedBy: userId || null,
      now: nowIso,
      transaction: state.transaction,
    })
  }

  if (descriptor?.workflowKey && descriptor?.stepKey) {
    const refreshedState = await getWorkflowStateForTransaction(transactionId, { client, transaction: state.transaction })
    const targetStep = (refreshedState.stepsByWorkflowKey?.[descriptor.workflowKey] || []).find((step) => step.step_key === descriptor.stepKey) || null
    if (targetStep?.id) {
      await attachWorkflowEvidence(
        transactionId,
        targetStep.id,
        {
          workflowKey: descriptor.workflowKey,
          stepKey: descriptor.stepKey,
          evidenceType: 'manual_override',
          evidenceId: normalizeText(actionKey).toUpperCase(),
          evidenceStatus: descriptor.targetStatus === 'complete' ? 'accepted' : 'superseded',
        },
        { client },
      )
    }
  }

  if (descriptor?.actionKey === 'MARK_REGISTERED' && normalizeText(payload.registrationConfirmationDocumentId)) {
    const nextState = await getWorkflowStateForTransaction(transactionId, { client, transaction: state.transaction })
    const registrationStep = (nextState.stepsByWorkflowKey?.registration || []).find((step) => step.step_key === 'registration_confirmed') || null
    if (registrationStep?.id) {
      await attachWorkflowEvidence(
        transactionId,
        registrationStep.id,
        {
          workflowKey: 'registration',
          stepKey: 'registration_confirmed',
          evidenceType: 'document',
          evidenceId: payload.registrationConfirmationDocumentId,
          evidenceStatus: 'accepted',
        },
        { client },
      )
    }
  }

  const actionTransactionFields = buildActionTransactionFields(actionKey, state, payload, userId, nowIso)
  assertNoLegacyLifecycleFieldWrites(actionTransactionFields, {
    source: `workflow_action:${normalizeText(actionKey).toUpperCase()}`,
  })
  if (Object.keys(actionTransactionFields).length) {
    const transactionUpdate = await client.from('transactions').update(actionTransactionFields).eq('id', transactionId)
    if (transactionUpdate.error) throw transactionUpdate.error
  }

  await logTransactionWorkflowEvent(
    {
      transactionId,
      workflowKey: descriptor?.workflowKey || '',
      stepKey: descriptor?.stepKey || '',
      actionKey,
      eventType: 'workflow_action_completed',
      previousStatus: previousStepStatus,
      newStatus: descriptor?.targetStatus || currentRollup.parentStatus,
      payload: {
        payload,
        source: payload.source || 'user_action',
      },
      source: payload.source || 'user_action',
      createdBy: userId || null,
    },
    { client },
  )

  const recomputed = await publishWorkflowChanged({
    transactionId,
    client,
    actorRole,
    now: nowIso,
    reasonCode: `WORKFLOW_ACTION_${normalizeText(actionKey).toUpperCase()}`,
    triggerType: 'workflow_action',
    triggerId: normalizeText(actionKey).toUpperCase(),
    createdBy: userId || null,
    source: payload.source || 'user_action',
    extraFields: {
      stage_date: nowIso,
    },
    payload: {
      actionKey: normalizeText(actionKey).toUpperCase(),
      workflowKey: descriptor?.workflowKey || null,
      stepKey: descriptor?.stepKey || null,
    },
  })

  return {
    success: true,
    allowed: true,
    blocked: false,
    actionKey: normalizeText(actionKey).toUpperCase(),
    rollup: recomputed.rollup,
    compatibility: recomputed.compatibility,
  }
}

export function workflowActionErrorMessage(result = {}) {
  return buildActionErrorMessage(result.blockers || [])
}
