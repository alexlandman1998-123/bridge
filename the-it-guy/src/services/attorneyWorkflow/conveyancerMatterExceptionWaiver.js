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

export const CONVEYANCER_MATTER_EXCEPTION_WAIVER_VERSION = 'conveyancer_matter_exception_waiver_v1'

export const MATTER_EXCEPTION_WAIVER_COMMAND_TYPES = Object.freeze({
  propose: 'propose_waiver',
  revise: 'revise_waiver',
  approve: 'approve_waiver',
  reject: 'reject_waiver',
  withdraw: 'withdraw_waiver',
})

const COMMAND_TYPES = new Set(Object.values(MATTER_EXCEPTION_WAIVER_COMMAND_TYPES))
const TERMINAL_STATUSES = new Set([S.resolved, S.waived, S.cancelled, S.superseded])
const PROPOSABLE_STATUSES = new Set([S.acknowledged, S.investigating, S.waitingExternal, S.remediation])
const TRANSFER_ROLES = new Set([R.conveyancer, R.transferAttorney])

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

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
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
  return [MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.approve, MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.reject].includes(commandType)
    ? C.waive
    : C.remediate
}

function runtimeSnapshot(exception) {
  return {
    status: exception.status,
    evidence: clone(exception.evidence || []),
    reviewKind: exception.reviewKind || null,
    waiverProposal: clone(exception.waiverProposal || null),
    waiverDecision: clone(exception.waiverDecision || null),
    lastWaiverDecision: clone(exception.lastWaiverDecision || null),
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
  exception.stateReason = ''
  exception.waitingOn = ''
  exception.followUpAt = null
  return ''
}

function proposalPayload(exception, command, actor, occurredAt, existingProposal = null) {
  const payload = command.waiver || command.payload || {}
  const reason = text(payload.reason || command.reason)
  const risk = text(payload.risk || payload.riskDescription || payload.risk_description)
  const mitigation = text(payload.mitigation)
  const requirementKeys = unique((payload.requirementKeys || payload.requirement_keys || []).map(text))
  const conditions = unique((payload.conditions || []).map(text))
  const reviewBy = payload.reviewBy || payload.review_by || null
  if (!text(actor.userId)) return { error: 'waiver_proposer_user_required' }
  if (!reason) return { error: 'waiver_reason_required' }
  if (!risk) return { error: 'waiver_risk_required' }
  if (!mitigation) return { error: 'waiver_mitigation_required' }
  if (!requirementKeys.length) return { error: 'waiver_scope_required' }
  if (requirementKeys.some((item) => !(exception.evidenceRequirements || []).some((requirement) => requirement.key === item))) return { error: 'unknown_waiver_evidence_requirement' }
  if (exception.severity === MATTER_EXCEPTION_SEVERITIES.critical && !validDate(reviewBy)) return { error: 'critical_waiver_review_date_required' }
  if (reviewBy && !validDate(reviewBy)) return { error: 'invalid_waiver_review_date' }
  if (validDate(reviewBy) && new Date(reviewBy) <= new Date(occurredAt)) return { error: 'waiver_review_date_must_be_future' }
  return {
    proposal: {
      version: Number(existingProposal?.version || 0) + 1,
      reason,
      risk,
      mitigation,
      requirementKeys,
      conditions,
      reviewBy: validDate(reviewBy) ? new Date(reviewBy).toISOString() : null,
      proposedAt: existingProposal?.proposedAt || occurredAt,
      proposedBy: existingProposal?.proposedBy || { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) },
      revisedAt: existingProposal ? occurredAt : null,
      revisedBy: existingProposal ? { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) } : null,
    },
  }
}

function actorIsProposer(actor, proposal) {
  return Boolean(text(actor.userId) && text(actor.userId) === text(proposal?.proposedBy?.userId))
}

function applyPropose(exception, command, actor, occurredAt) {
  if (!PROPOSABLE_STATUSES.has(exception.status)) return 'waiver_proposal_not_allowed_in_current_status'
  const built = proposalPayload(exception, command, actor, occurredAt)
  if (built.error) return built.error
  const error = transition(exception, S.pendingReview, actor.role)
  if (!error) {
    exception.reviewKind = 'waiver'
    exception.waiverProposal = built.proposal
    exception.waiverDecision = null
  }
  return error
}

function applyRevise(exception, command, actor, occurredAt) {
  if (exception.status !== S.pendingReview || exception.reviewKind !== 'waiver' || !exception.waiverProposal) return 'waiver_revision_requires_pending_review'
  if (normalizeMatterPlanOwnerRole(actor.role) !== R.firmManager && !actorIsProposer(actor, exception.waiverProposal)) return 'waiver_revision_requires_proposer_or_manager'
  const built = proposalPayload(exception, command, actor, occurredAt, exception.waiverProposal)
  if (built.error) return built.error
  exception.waiverProposal = built.proposal
  return ''
}

function applyApprove(exception, command, actor, occurredAt) {
  if (exception.status !== S.pendingReview || exception.reviewKind !== 'waiver' || !exception.waiverProposal) return 'waiver_approval_requires_pending_review'
  const proposal = exception.waiverProposal
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  if (!text(actor.userId)) return 'waiver_approver_user_required'
  if (actorIsProposer(actor, proposal)) return 'independent_waiver_approval_required'
  if (exception.severity === MATTER_EXCEPTION_SEVERITIES.critical && actorRole !== R.firmManager) return 'critical_waiver_requires_firm_manager'
  if (validDate(proposal.reviewBy) && new Date(proposal.reviewBy) <= new Date(occurredAt)) return 'waiver_review_date_elapsed'
  const summary = text(command.summary || command.payload?.summary)
  const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id || command.payload?.decisionReferenceId || command.payload?.decision_reference_id)
  if (!summary) return 'waiver_decision_summary_required'
  if (!decisionReferenceId) return 'waiver_decision_reference_required'
  for (const requirementKey of proposal.requirementKeys) {
    replaceEvidence(exception, {
      requirementKey,
      status: ES.waived,
      referenceId: decisionReferenceId,
      reason: proposal.reason,
      capturedAt: occurredAt,
      capturedBy: { role: actorRole, userId: text(actor.userId) },
    })
  }
  if (!resolutionEvidenceSatisfied(exception)) return 'unscoped_resolution_evidence_incomplete'
  const error = transition(exception, S.waived, actor.role, { reason: proposal.reason, evidenceSatisfied: true })
  if (!error) {
    const approvedBy = { role: actorRole, userId: text(actor.userId) }
    exception.resolution = {
      outcome: O.acceptedRisk,
      summary,
      reason: proposal.reason,
      resolvedAt: occurredAt,
      resolvedBy: approvedBy,
    }
    exception.waiverDecision = {
      outcome: 'approved',
      decisionReferenceId,
      approvedAt: occurredAt,
      approvedBy,
      risk: proposal.risk,
      mitigation: proposal.mitigation,
      conditions: proposal.conditions,
      reviewBy: proposal.reviewBy,
      proposalVersion: proposal.version,
    }
    exception.lastWaiverDecision = clone(exception.waiverDecision)
    exception.reviewKind = null
  }
  return error
}

function applyReject(exception, command, actor, occurredAt) {
  if (exception.status !== S.pendingReview || exception.reviewKind !== 'waiver' || !exception.waiverProposal) return 'waiver_rejection_requires_pending_review'
  const reason = text(command.reason || command.payload?.reason)
  if (!reason) return 'waiver_rejection_reason_required'
  if (!text(actor.userId)) return 'waiver_reviewer_user_required'
  if (actorIsProposer(actor, exception.waiverProposal)) return 'independent_waiver_review_required'
  const error = transition(exception, S.remediation, actor.role)
  if (!error) {
    exception.lastWaiverDecision = {
      outcome: 'rejected',
      reason,
      decidedAt: occurredAt,
      decidedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) },
      proposalVersion: exception.waiverProposal.version,
    }
    exception.reviewKind = null
    exception.waiverProposal = null
    exception.waiverDecision = null
  }
  return error
}

function applyWithdraw(exception, command, actor, occurredAt) {
  if (exception.status !== S.pendingReview || exception.reviewKind !== 'waiver' || !exception.waiverProposal) return 'waiver_withdrawal_requires_pending_review'
  const reason = text(command.reason || command.payload?.reason)
  if (!reason) return 'waiver_withdrawal_reason_required'
  if (normalizeMatterPlanOwnerRole(actor.role) !== R.firmManager && !actorIsProposer(actor, exception.waiverProposal)) return 'waiver_withdrawal_requires_proposer_or_manager'
  const error = transition(exception, S.remediation, actor.role)
  if (!error) {
    exception.lastWaiverDecision = {
      outcome: 'withdrawn',
      reason,
      decidedAt: occurredAt,
      decidedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) || null },
      proposalVersion: exception.waiverProposal.version,
    }
    exception.reviewKind = null
    exception.waiverProposal = null
    exception.waiverDecision = null
  }
  return error
}

function applyCommand(exception, command, actor, occurredAt) {
  const commandType = lower(command.type)
  if (commandType === MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.propose) return applyPropose(exception, command, actor, occurredAt)
  if (commandType === MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.revise) return applyRevise(exception, command, actor, occurredAt)
  if (commandType === MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.approve) return applyApprove(exception, command, actor, occurredAt)
  if (commandType === MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.reject) return applyReject(exception, command, actor, occurredAt)
  return applyWithdraw(exception, command, actor, occurredAt)
}

export function executeConveyancerMatterExceptionWaiver({
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
  if (!COMMAND_TYPES.has(commandType)) return fail('invalid_waiver_command')
  const authority = authorisedForException(current, actor, capabilityForCommand(commandType))
  if (!authority.allowed) return fail(authority.reason)
  const duplicateEvent = (Array.isArray(existingEvents) ? existingEvents : []).find((item) =>
    text(item.commandId || item.command_id) === commandId && text(item.exceptionId || item.exception_id) === current.exceptionId)
  if (duplicateEvent) return { ok: true, duplicate: true, code: 'idempotent_replay', exception: clone(current), event: duplicateEvent }
  if (TERMINAL_STATUSES.has(current.status)) return fail('terminal_exception_not_waivable')
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
  const eventId = `matter_exception_waiver:${next.exceptionId}:${commandId}`
  next.lastEventId = eventId
  const resultingValidation = validateConveyancerMatterException(next, { actionKeys: planActionKeys })
  if (!resultingValidation.valid) return fail('resulting_exception_invalid', { errors: resultingValidation.errors })
  const resultingException = resultingValidation.exception
  const event = deepFreeze({
    version: CONVEYANCER_MATTER_EXCEPTION_WAIVER_VERSION,
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
    proposal: [MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.propose, MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.revise].includes(commandType)
      ? clone(resultingException.waiverProposal)
      : null,
    decision: [MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.approve, MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.reject, MATTER_EXCEPTION_WAIVER_COMMAND_TYPES.withdraw].includes(commandType)
      ? clone(resultingException.waiverDecision || resultingException.lastWaiverDecision)
      : null,
  })
  return { ok: true, duplicate: false, code: 'exception_waiver_command_applied', exception: resultingException, event }
}
