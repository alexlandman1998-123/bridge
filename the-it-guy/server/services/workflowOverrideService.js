import { normalizeRoleType } from '../../src/core/transactions/permissions.js'
import { WORKFLOW_COMPLETION_MODES } from '../../src/core/workflows/overrideContract.js'
import { requireClient } from '../../src/services/attorneyFirmServiceShared.js'
import { writeWorkflowEvidence } from './workflowEvidenceService.js'
import { publishWorkflowChanged } from './workflowRecomputeService.js'
import { ensureWorkflowStep } from './workflowStepService.js'
import { logTransactionWorkflowEvent } from './workflowEventService.js'
import { applyWorkflowStepStatus } from './workflowStepService.js'

const OVERRIDE_TYPE_TO_STATUS = Object.freeze({
  force_complete: 'complete',
  force_skip: 'skipped',
  force_waive: 'not_applicable',
  force_reopen: 'pending',
  force_block: 'blocked',
  force_not_applicable: 'not_applicable',
})

const ADMIN_OVERRIDE_ROLES = new Set([
  'developer',
  'internal_admin',
  'system_admin',
  'organisation_admin',
  'organization_admin',
  'agency_admin',
  'admin',
  'principal',
  'developer_admin',
  'attorney_admin',
  'transaction_coordinator',
  'arch9_admin',
  'senior_attorney',
])

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

function normalizeOverrideType(value = '') {
  const normalized = normalizeKey(value)
  return Object.prototype.hasOwnProperty.call(OVERRIDE_TYPE_TO_STATUS, normalized) ? normalized : ''
}

function resolveOverrideStatus(overrideType = '', payload = {}) {
  const normalizedType = normalizeOverrideType(overrideType)
  if (!normalizedType) return ''
  if (normalizedType !== 'force_reopen') {
    return OVERRIDE_TYPE_TO_STATUS[normalizedType]
  }

  const requested = normalizeKey(payload.reopenTo || payload.reopen_to)
  if (['pending', 'blocked'].includes(requested)) {
    return requested
  }

  return OVERRIDE_TYPE_TO_STATUS[normalizedType]
}

function normalizeActorRole(value = '') {
  return normalizeText(value).toLowerCase()
}

function isWorkflowOwnerRole(rawRole = '', normalizedRole = '', ownerRole = '') {
  const normalizedOwner = normalizeKey(ownerRole)
  if (!normalizedOwner) return false
  return normalizedRole === normalizedOwner || normalizeActorRole(rawRole) === normalizedOwner || normalizeActorRole(rawRole) === 'workflow_owner'
}

function canOverrideWorkflowStep({ rawRole = '', normalizedRole = '', ownerRole = '' } = {}) {
  if (ADMIN_OVERRIDE_ROLES.has(normalizeActorRole(rawRole))) return true
  if (ADMIN_OVERRIDE_ROLES.has(normalizedRole)) return true
  return isWorkflowOwnerRole(rawRole, normalizedRole, ownerRole)
}

function buildOverrideEvidenceStatus(nextStatus = '') {
  if (['complete', 'skipped', 'not_applicable'].includes(normalizeKey(nextStatus))) return 'accepted'
  if (normalizeKey(nextStatus) === 'blocked') return 'rejected'
  return 'superseded'
}

function buildOverrideReasonCode(overrideType = '') {
  const normalized = normalizeOverrideType(overrideType)
  if (normalized === 'force_reopen') return 'step_reopened'
  if (normalized === 'force_waive' || normalized === 'force_not_applicable') return 'step_waived'
  return 'manual_override_applied'
}

function buildOverrideIntent(overrideType = '') {
  const normalized = normalizeOverrideType(overrideType)
  if (normalized === 'force_complete') return 'completion_override'
  if (normalized === 'force_skip') return 'skip_override'
  if (normalized === 'force_waive' || normalized === 'force_not_applicable') return 'waiver_override'
  if (normalized === 'force_reopen') return 'reopen_override'
  if (normalized === 'force_block') return 'block_override'
  return 'manual_override'
}

function buildOverrideCompletionMode(overrideType = '') {
  const normalized = normalizeOverrideType(overrideType)
  if (normalized === 'force_waive' || normalized === 'force_not_applicable') return WORKFLOW_COMPLETION_MODES.waived
  if (normalized === 'force_skip') return WORKFLOW_COMPLETION_MODES.skipped
  if (normalized === 'force_reopen') return WORKFLOW_COMPLETION_MODES.reopened
  if (normalized === 'force_block') return WORKFLOW_COMPLETION_MODES.blocked
  return ''
}

export async function applyWorkflowOverride({
  transactionId,
  workflowKey,
  stepKey,
  overrideType,
  reason,
  userId = null,
  actorRole = 'developer',
  payload = {},
  client: explicitClient = null,
} = {}) {
  const client = explicitClient || requireClient()
  const normalizedTransactionId = normalizeText(transactionId)
  const normalizedWorkflowKey = normalizeText(workflowKey)
  const normalizedStepKey = normalizeText(stepKey)
  const normalizedOverrideType = normalizeOverrideType(overrideType)
  const normalizedReason = normalizeText(reason)
  const rawActorRole = normalizeActorRole(actorRole || '')
  const normalizedActorRole = normalizeRoleType(actorRole || 'developer')
  const nowIso = toIsoString(payload.occurredAt || payload.occurred_at || Date.now())

  if (!normalizedTransactionId) {
    throw new Error('Transaction id is required.')
  }
  if (!normalizedWorkflowKey || !normalizedStepKey) {
    throw new Error('Workflow key and step key are required.')
  }
  if (!normalizedOverrideType) {
    throw new Error('A valid override type is required.')
  }
  if (!normalizedReason) {
    throw new Error('A reason is required for manual overrides.')
  }

  const ensured = await ensureWorkflowStep(normalizedTransactionId, normalizedWorkflowKey, normalizedStepKey, {
    client,
  })
  const step = ensured.step
  const ownerRole = step?.owner_role || 'system'
  if (
    !canOverrideWorkflowStep({
      rawRole: rawActorRole,
      normalizedRole: normalizedActorRole,
      ownerRole,
    })
  ) {
    throw new Error('You do not have permission to override this workflow step.')
  }

  const nextStatus = resolveOverrideStatus(normalizedOverrideType, payload)
  if (!nextStatus) {
    throw new Error('Unable to resolve the override target status.')
  }
  const overrideIntent = buildOverrideIntent(normalizedOverrideType)
  const overrideCompletionMode = buildOverrideCompletionMode(normalizedOverrideType)

  const stepUpdate = await applyWorkflowStepStatus(
    normalizedTransactionId,
    normalizedWorkflowKey,
    normalizedStepKey,
    nextStatus,
    {
      client,
      state: ensured.state,
      transaction: ensured.state?.transaction,
      completedBy: userId || null,
      now: nowIso,
    },
  )

  const overrideEvidenceId = [
    'manual_override',
    normalizedWorkflowKey,
    normalizedStepKey,
    normalizedOverrideType,
    nowIso,
  ].join(':')

  const evidenceRow = await writeWorkflowEvidence(
    normalizedTransactionId,
    stepUpdate.step || step,
    {
      workflowKey: normalizedWorkflowKey,
      stepKey: normalizedStepKey,
      evidenceType: 'manual_override',
      evidenceId: overrideEvidenceId,
      evidenceStatus: buildOverrideEvidenceStatus(stepUpdate.nextStatus),
      status: stepUpdate.nextStatus,
    },
    { client },
  )

  await logTransactionWorkflowEvent(
    {
      transactionId: normalizedTransactionId,
      workflowKey: normalizedWorkflowKey,
      stepKey: normalizedStepKey,
      actionKey: normalizedOverrideType.toUpperCase(),
      eventType: 'workflow_override_applied',
      previousStatus: stepUpdate.previousStatus,
      newStatus: stepUpdate.nextStatus,
      payload: {
        overrideType: normalizedOverrideType,
        overrideIntent,
        completionMode: overrideCompletionMode || null,
        waiver: overrideIntent === 'waiver_override',
        reason: normalizedReason,
        actorRole: normalizedActorRole,
        rawActorRole,
        organisationId: ensured.state?.transaction?.organisation_id || ensured.state?.transaction?.organisationId || null,
        supportingNote: normalizeText(payload.supportingNote || payload.supporting_note) || null,
        attachmentId: normalizeText(payload.attachmentId || payload.attachment_id) || null,
        attachmentType: normalizeText(payload.attachmentType || payload.attachment_type) || null,
        expiresAt: normalizeText(payload.expiresAt || payload.expires_at) || null,
        reopenTo: normalizeKey(payload.reopenTo || payload.reopen_to) || null,
      },
      source: 'workflow_override',
      createdBy: userId || null,
    },
    { client },
  )

  const recomputed = await publishWorkflowChanged({
    transactionId: normalizedTransactionId,
    client,
    now: nowIso,
    triggerType: 'manual_override',
    triggerId: overrideEvidenceId,
    reasonCode: buildOverrideReasonCode(normalizedOverrideType),
    createdBy: userId || null,
    source: 'workflow_override',
    forceAudit: true,
    auditMetadata: {
      overrideType: normalizedOverrideType,
      overrideIntent,
      completionMode: overrideCompletionMode || null,
      waiver: overrideIntent === 'waiver_override',
      workflowKey: normalizedWorkflowKey,
      stepKey: normalizedStepKey,
      previousStatus: stepUpdate.previousStatus,
      newStatus: stepUpdate.nextStatus,
      reason: normalizedReason,
      actorRole: normalizedActorRole,
      rawActorRole,
      organisationId: ensured.state?.transaction?.organisation_id || ensured.state?.transaction?.organisationId || null,
      supportingNote: normalizeText(payload.supportingNote || payload.supporting_note) || null,
      attachmentId: normalizeText(payload.attachmentId || payload.attachment_id) || null,
      attachmentType: normalizeText(payload.attachmentType || payload.attachment_type) || null,
      expiresAt: normalizeText(payload.expiresAt || payload.expires_at) || null,
    },
    payload: {
      overrideType: normalizedOverrideType,
      overrideIntent,
      completionMode: overrideCompletionMode || null,
      waiver: overrideIntent === 'waiver_override',
      workflowKey: normalizedWorkflowKey,
      stepKey: normalizedStepKey,
      reason: normalizedReason,
    },
  })

  return {
    success: true,
    overrideType: normalizedOverrideType,
    previousStatus: stepUpdate.previousStatus,
    nextStatus: stepUpdate.nextStatus,
    evidence: evidenceRow,
    rollup: recomputed.rollup,
    compatibility: recomputed.compatibility,
  }
}
