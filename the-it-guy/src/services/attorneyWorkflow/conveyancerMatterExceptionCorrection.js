import {
  MATTER_PLAN_EVIDENCE_STATUSES as ES,
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  MATTER_EXCEPTION_CAPABILITIES as C,
  MATTER_EXCEPTION_RESOLUTION_OUTCOMES as O,
  MATTER_EXCEPTION_SEVERITIES,
  MATTER_EXCEPTION_STATUSES as S,
  canMatterExceptionActor,
  evaluateMatterExceptionTransition,
  validateConveyancerMatterException,
} from '../../core/transactions/conveyancerMatterExceptionContract.js'

export const CONVEYANCER_MATTER_EXCEPTION_CORRECTION_VERSION = 'conveyancer_matter_exception_correction_v1'

export const MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES = Object.freeze({
  acknowledge: 'acknowledge',
  startInvestigation: 'start_investigation',
  beginCorrection: 'begin_correction',
  recordCorrectionEvidence: 'record_correction_evidence',
  submitCorrectionReview: 'submit_correction_review',
  submitNotApplicableReview: 'submit_not_applicable_review',
  approveCorrection: 'approve_correction',
  decideNotApplicable: 'decide_not_applicable',
  rejectCorrection: 'reject_correction',
})

const COMMAND_TYPES = new Set(Object.values(MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES))
const TRANSFER_ROLES = new Set([R.conveyancer, R.transferAttorney])
const TERMINAL_STATUSES = new Set([S.resolved, S.waived, S.cancelled, S.superseded])

function text(value = '') {
  return String(value || '').trim()
}

function lower(value = '') {
  return text(value).toLowerCase()
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function clone(value) {
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

function fail(code, details = {}) {
  return { ok: false, duplicate: false, code, exception: null, event: null, ...details }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function rolesMatch(actorRole, ownerRole) {
  if (actorRole === ownerRole) return true
  return TRANSFER_ROLES.has(actorRole) && TRANSFER_ROLES.has(ownerRole)
}

function assignmentMatches(actor, owner = {}) {
  if (owner.userId && text(owner.userId) !== text(actor.userId)) return false
  const teamIds = Array.isArray(actor.teamIds) ? actor.teamIds.map(text) : []
  if (owner.teamId && !teamIds.includes(text(owner.teamId))) return false
  return true
}

function authorisedForException(exception, actor, capability) {
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  const managerOverride = actorRole === R.firmManager
  if (!actorRole) return { allowed: false, reason: 'actor_role_required' }
  if (!canMatterExceptionActor(actorRole, C.view)) return { allowed: false, reason: 'actor_cannot_view_exception' }
  if (!managerOverride && !rolesMatch(actorRole, exception.owner?.role)) return { allowed: false, reason: 'exception_owned_by_another_role' }
  if (!managerOverride && !assignmentMatches(actor, exception.owner)) return { allowed: false, reason: 'exception_assigned_to_another_user_or_team' }
  if (!canMatterExceptionActor(actorRole, capability)) return { allowed: false, reason: 'actor_lacks_exception_capability' }
  return { allowed: true, reason: managerOverride ? 'manager_override' : 'owned_and_authorised' }
}

function capabilityForCommand(commandType) {
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.acknowledge) return C.acknowledge
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.startInvestigation) return C.investigate
  if ([
    MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.beginCorrection,
    MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.recordCorrectionEvidence,
    MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.submitCorrectionReview,
    MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.submitNotApplicableReview,
  ].includes(commandType)) return C.remediate
  return C.resolve
}

function runtimeSnapshot(exception) {
  return {
    status: exception.status,
    evidence: clone(exception.evidence || []),
    waitingOn: exception.waitingOn || '',
    followUpAt: exception.followUpAt || null,
    stateReason: exception.stateReason || '',
    reviewKind: exception.reviewKind || null,
    decisionProposal: clone(exception.decisionProposal || null),
    resolution: clone(exception.resolution || {}),
    runtimeRevision: Number(exception.runtimeRevision || 0),
  }
}

function replaceEvidence(exception, entry) {
  exception.evidence = [
    ...(exception.evidence || []).filter((item) => item.requirementKey !== entry.requirementKey),
    entry,
  ]
}

function correctionEvidenceReady(exception) {
  return (exception.evidenceRequirements || []).filter((item) => item.required !== false).every((requirement) =>
    (exception.evidence || []).some((item) =>
      item.requirementKey === requirement.key && [ES.provided, ES.approved].includes(item.status)))
}

function resolutionEvidenceSatisfied(exception) {
  return (exception.evidenceRequirements || []).filter((item) => item.required !== false).every((requirement) =>
    (exception.evidence || []).some((item) => {
      if (item.requirementKey !== requirement.key) return false
      if (item.status === ES.waived) return Boolean(item.reason)
      if (requirement.requiresApproval) return item.status === ES.approved
      return [ES.provided, ES.approved].includes(item.status)
    }))
}

function transition(exception, toStatus, actorRole, { reason = '', evidenceSatisfied = false } = {}) {
  const result = evaluateMatterExceptionTransition({
    fromStatus: exception.status,
    toStatus,
    actorRole,
    reason,
    requiredEvidenceSatisfied: evidenceSatisfied,
    severity: exception.severity,
  })
  if (!result.allowed) return result.reason
  exception.status = toStatus
  exception.stateReason = [S.cancelled, S.superseded].includes(toStatus) ? reason : ''
  if (toStatus !== S.waitingExternal) {
    exception.waitingOn = ''
    exception.followUpAt = null
  }
  return ''
}

function applyAcknowledge(exception, actor) {
  return transition(exception, S.acknowledged, actor.role)
}

function applyStartInvestigation(exception, actor) {
  return transition(exception, S.investigating, actor.role)
}

function applyBeginCorrection(exception, actor) {
  if (![S.acknowledged, S.investigating, S.waitingExternal].includes(exception.status)) return 'correction_cannot_begin_from_current_status'
  const error = transition(exception, S.remediation, actor.role)
  if (!error) {
    exception.reviewKind = null
    exception.decisionProposal = null
  }
  return error
}

function applyRecordEvidence(exception, command, actor, occurredAt) {
  if (![S.investigating, S.remediation].includes(exception.status)) return 'correction_evidence_not_allowed_in_current_status'
  const payload = command.evidence || command.payload || {}
  const requirementKey = text(payload.requirementKey || payload.requirement_key)
  const requirement = (exception.evidenceRequirements || []).find((item) => item.key === requirementKey)
  if (!requirement) return 'unknown_evidence_requirement'
  const referenceId = text(payload.referenceId || payload.reference_id)
  if (!referenceId) return 'evidence_reference_required'
  replaceEvidence(exception, {
    requirementKey,
    status: ES.provided,
    referenceId,
    reason: text(payload.reason) || null,
    capturedAt: occurredAt,
    capturedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) || null },
  })
  return ''
}

function applySubmitCorrectionReview(exception, actor) {
  if (exception.status !== S.remediation) return 'correction_review_requires_remediation_status'
  if (!correctionEvidenceReady(exception)) return 'correction_evidence_incomplete'
  const error = transition(exception, S.pendingReview, actor.role)
  if (!error) {
    exception.reviewKind = 'correction'
    exception.decisionProposal = null
  }
  return error
}

function applySubmitNotApplicableReview(exception, command, actor) {
  if (![S.acknowledged, S.investigating, S.remediation].includes(exception.status)) return 'not_applicable_review_not_allowed_in_current_status'
  const reason = text(command.reason || command.payload?.reason)
  const summary = text(command.summary || command.payload?.summary)
  if (!reason) return 'not_applicable_reason_required'
  if (!summary) return 'not_applicable_summary_required'
  const error = transition(exception, S.pendingReview, actor.role)
  if (!error) {
    exception.reviewKind = 'not_applicable'
    exception.decisionProposal = { reason, summary, proposedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) || null } }
  }
  return error
}

function applyApproveCorrection(exception, command, actor, occurredAt) {
  if (exception.status !== S.pendingReview || exception.reviewKind !== 'correction') return 'correction_decision_requires_correction_review'
  const summary = text(command.summary || command.payload?.summary)
  if (!summary) return 'correction_resolution_summary_required'
  if (!correctionEvidenceReady(exception)) return 'correction_evidence_incomplete'
  exception.evidence = (exception.evidence || []).map((item) => {
    const requirement = (exception.evidenceRequirements || []).find((entry) => entry.key === item.requirementKey)
    if (!requirement || !requirement.requiresApproval || item.status === ES.approved) return item
    return { ...item, status: ES.approved }
  })
  if (!resolutionEvidenceSatisfied(exception)) return 'required_resolution_evidence_not_satisfied'
  const error = transition(exception, S.resolved, actor.role, { evidenceSatisfied: true })
  if (!error) {
    exception.resolution = {
      outcome: O.corrected,
      summary,
      reason: text(command.reason || command.payload?.reason),
      resolvedAt: occurredAt,
      resolvedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) || null },
    }
    exception.reviewKind = null
    exception.decisionProposal = null
  }
  return error
}

function applyNotApplicableDecision(exception, command, actor, occurredAt) {
  if (exception.status !== S.pendingReview || exception.reviewKind !== 'not_applicable') return 'not_applicable_decision_requires_review'
  if (!canMatterExceptionActor(actor.role, C.waive)) return 'not_applicable_decision_requires_waive_capability'
  if (exception.severity === MATTER_EXCEPTION_SEVERITIES.critical && normalizeMatterPlanOwnerRole(actor.role) !== R.firmManager) return 'critical_not_applicable_requires_firm_manager'
  const reason = text(command.reason || command.payload?.reason)
  const summary = text(command.summary || command.payload?.summary)
  if (!reason) return 'not_applicable_reason_required'
  if (!summary) return 'not_applicable_summary_required'
  for (const requirement of exception.evidenceRequirements || []) {
    if (requirement.required === false) continue
    replaceEvidence(exception, {
      requirementKey: requirement.key,
      status: ES.waived,
      referenceId: text(command.referenceId || command.reference_id || command.payload?.referenceId || command.payload?.reference_id) || null,
      reason,
      capturedAt: occurredAt,
      capturedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) || null },
    })
  }
  if (!resolutionEvidenceSatisfied(exception)) return 'required_resolution_evidence_not_satisfied'
  const error = transition(exception, S.resolved, actor.role, { evidenceSatisfied: true })
  if (!error) {
    exception.resolution = {
      outcome: O.notApplicable,
      summary,
      reason,
      resolvedAt: occurredAt,
      resolvedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) || null },
    }
    exception.reviewKind = null
    exception.decisionProposal = null
  }
  return error
}

function applyRejectCorrection(exception, command, actor) {
  if (exception.status !== S.pendingReview || exception.reviewKind !== 'correction') return 'correction_rejection_requires_correction_review'
  const reason = text(command.reason || command.payload?.reason)
  const requirementKey = text(command.requirementKey || command.requirement_key || command.payload?.requirementKey || command.payload?.requirement_key)
  if (!reason) return 'correction_rejection_reason_required'
  const current = (exception.evidence || []).find((item) => item.requirementKey === requirementKey)
  if (!current) return 'correction_rejection_evidence_required'
  replaceEvidence(exception, { ...current, status: ES.rejected, reason })
  const error = transition(exception, S.remediation, actor.role)
  if (!error) {
    exception.reviewKind = null
    exception.decisionProposal = null
  }
  return error
}

function applyCommand(exception, command, actor, occurredAt) {
  const commandType = lower(command.type)
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.acknowledge) return applyAcknowledge(exception, actor)
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.startInvestigation) return applyStartInvestigation(exception, actor)
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.beginCorrection) return applyBeginCorrection(exception, actor)
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.recordCorrectionEvidence) return applyRecordEvidence(exception, command, actor, occurredAt)
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.submitCorrectionReview) return applySubmitCorrectionReview(exception, actor)
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.submitNotApplicableReview) return applySubmitNotApplicableReview(exception, command, actor)
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.approveCorrection) return applyApproveCorrection(exception, command, actor, occurredAt)
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.decideNotApplicable) return applyNotApplicableDecision(exception, command, actor, occurredAt)
  return applyRejectCorrection(exception, command, actor)
}

export function executeConveyancerMatterExceptionCorrection({
  exception = {},
  command = {},
  actor = {},
  occurredAt = '',
  existingEvents = [],
  planActionKeys = [],
} = {}) {
  const commandId = text(command.commandId || command.command_id)
  if (!commandId) return fail('command_id_required')
  const validation = validateConveyancerMatterException(exception, { actionKeys: planActionKeys })
  if (!validation.valid) return fail('matter_exception_invalid', { errors: validation.errors })
  const current = validation.exception
  const commandType = lower(command.type)
  if (!COMMAND_TYPES.has(commandType)) return fail('invalid_correction_command')
  const authority = authorisedForException(current, actor, capabilityForCommand(commandType))
  if (!authority.allowed) return fail(authority.reason)
  if (commandType === MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.decideNotApplicable && !canMatterExceptionActor(actor.role, C.waive)) return fail('not_applicable_decision_requires_waive_capability')

  const duplicateEvent = (Array.isArray(existingEvents) ? existingEvents : []).find((item) =>
    text(item.commandId || item.command_id) === commandId && text(item.exceptionId || item.exception_id) === current.exceptionId)
  if (duplicateEvent) return { ok: true, duplicate: true, code: 'idempotent_replay', exception: clone(current), event: duplicateEvent }
  if (TERMINAL_STATUSES.has(current.status)) return fail('terminal_exception_not_correctable')
  if (!validDate(occurredAt)) return fail('occurred_at_required')
  if (!text(command.expectedExceptionId || command.expected_exception_id)) return fail('expected_exception_id_required')
  if (text(command.expectedExceptionId || command.expected_exception_id) !== current.exceptionId) return fail('stale_exception_id')
  if (!Number.isInteger(Number(command.expectedRuntimeRevision ?? command.expected_runtime_revision))) return fail('expected_runtime_revision_required')
  if (Number(command.expectedRuntimeRevision ?? command.expected_runtime_revision) !== Number(current.runtimeRevision || 0)) return fail('stale_exception_revision')

  const resolvedOccurredAt = new Date(occurredAt).toISOString()
  const next = clone(current)
  const before = runtimeSnapshot(next)
  const applyError = applyCommand(next, command, actor, resolvedOccurredAt)
  if (applyError) return fail(applyError)
  next.runtimeRevision = Number(next.runtimeRevision || 0) + 1
  next.updatedAt = resolvedOccurredAt
  const eventId = `matter_exception_correction:${next.exceptionId}:${commandId}`
  next.lastEventId = eventId
  const resultingValidation = validateConveyancerMatterException(next, { actionKeys: planActionKeys })
  if (!resultingValidation.valid) return fail('resulting_exception_invalid', { errors: resultingValidation.errors })
  const resultingException = resultingValidation.exception
  const event = deepFreeze({
    version: CONVEYANCER_MATTER_EXCEPTION_CORRECTION_VERSION,
    eventId,
    commandId,
    commandType,
    exceptionId: resultingException.exceptionId,
    planId: resultingException.planId,
    planVersion: resultingException.planVersion,
    occurredAt: resolvedOccurredAt,
    actor: {
      role: normalizeMatterPlanOwnerRole(actor.role),
      userId: text(actor.userId) || null,
      teamIds: (Array.isArray(actor.teamIds) ? actor.teamIds : []).map(text).filter(Boolean),
    },
    authority: authority.reason,
    before,
    after: runtimeSnapshot(resultingException),
    decision: [MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.approveCorrection, MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.decideNotApplicable].includes(commandType)
      ? clone(resultingException.resolution)
      : null,
  })
  return { ok: true, duplicate: false, code: 'exception_correction_command_applied', exception: resultingException, event }
}
