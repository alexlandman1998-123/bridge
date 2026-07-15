import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  MATTER_EXCEPTION_CAPABILITIES as C,
  MATTER_EXCEPTION_SEVERITIES,
  MATTER_EXCEPTION_STATUSES as S,
  canMatterExceptionActor,
  validateConveyancerMatterException,
} from '../../core/transactions/conveyancerMatterExceptionContract.js'

export const CONVEYANCER_MATTER_EXCEPTION_OVERRIDE_VERSION = 'conveyancer_matter_exception_override_v1'

export const MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES = Object.freeze({
  propose: 'propose_override',
  revise: 'revise_override',
  approve: 'approve_override',
  reject: 'reject_override',
  withdraw: 'withdraw_override',
  revoke: 'revoke_override',
})

export const MATTER_EXCEPTION_OVERRIDE_OPERATIONS = Object.freeze({
  continueUnaffectedWork: 'continue_unaffected_work',
  requestDocuments: 'request_documents',
  coordinateExternalParty: 'coordinate_external_party',
  prepareDraftDocuments: 'prepare_draft_documents',
  scheduleSigning: 'schedule_signing',
  recordFinancialReceipt: 'record_financial_receipt',
  performInternalReview: 'perform_internal_review',
})

export const MATTER_EXCEPTION_OVERRIDE_MAX_HOURS = Object.freeze({
  [MATTER_EXCEPTION_SEVERITIES.low]: 336,
  [MATTER_EXCEPTION_SEVERITIES.medium]: 168,
  [MATTER_EXCEPTION_SEVERITIES.high]: 72,
  [MATTER_EXCEPTION_SEVERITIES.critical]: 12,
})

const COMMAND_TYPES = new Set(Object.values(MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES))
const OPERATION_TYPES = new Set(Object.values(MATTER_EXCEPTION_OVERRIDE_OPERATIONS))
const TERMINAL_STATUSES = new Set([S.resolved, S.waived, S.cancelled, S.superseded])
const PROPOSABLE_STATUSES = new Set([S.acknowledged, S.investigating, S.waitingExternal, S.remediation])
const MANAGER_COMMANDS = new Set([
  MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.approve,
  MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.reject,
  MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.revoke,
])
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
  return MANAGER_COMMANDS.has(commandType) ? C.override : C.remediate
}

function runtimeSnapshot(exception) {
  return {
    status: exception.status,
    evidence: clone(exception.evidence || []),
    resolution: clone(exception.resolution || {}),
    reviewKind: exception.reviewKind || null,
    overrideProposal: clone(exception.overrideProposal || null),
    activeOverride: clone(exception.activeOverride || null),
    lastOverrideDecision: clone(exception.lastOverrideDecision || null),
    runtimeRevision: Number(exception.runtimeRevision || 0),
  }
}

function actorIsProposer(actor, proposal) {
  return Boolean(text(actor.userId) && text(actor.userId) === text(proposal?.proposedBy?.userId))
}

function proposalPayload(exception, command, actor, occurredAt, existingProposal = null) {
  const payload = command.override || command.payload || {}
  const reason = text(payload.reason || command.reason)
  const businessJustification = text(payload.businessJustification || payload.business_justification)
  const operations = unique((Array.isArray(payload.operations) ? payload.operations : []).map(lower))
  const safeguards = unique((Array.isArray(payload.safeguards) ? payload.safeguards : []).map(text))
  const expiresAt = payload.expiresAt || payload.expires_at || null
  if (!text(actor.userId)) return { error: 'override_proposer_user_required' }
  if (!reason) return { error: 'override_reason_required' }
  if (!businessJustification) return { error: 'override_business_justification_required' }
  if (!operations.length) return { error: 'override_operations_required' }
  if (operations.some((operation) => !OPERATION_TYPES.has(operation))) return { error: 'unsafe_or_unknown_override_operation' }
  if (!safeguards.length) return { error: 'override_safeguards_required' }
  if (!validDate(expiresAt)) return { error: 'override_expiry_required' }
  const expiry = new Date(expiresAt)
  const commandTime = new Date(occurredAt)
  const durationStart = new Date(existingProposal?.proposedAt || occurredAt)
  if (expiry <= commandTime) return { error: 'override_expiry_must_be_future' }
  const maxHours = MATTER_EXCEPTION_OVERRIDE_MAX_HOURS[exception.severity]
  if (expiry.getTime() - durationStart.getTime() > maxHours * 60 * 60 * 1000) return { error: 'override_duration_exceeds_severity_limit' }
  return {
    proposal: {
      version: Number(existingProposal?.version || 0) + 1,
      reason,
      businessJustification,
      operations,
      safeguards,
      expiresAt: expiry.toISOString(),
      proposedAt: existingProposal?.proposedAt || occurredAt,
      proposedBy: existingProposal?.proposedBy || { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) },
      revisedAt: existingProposal ? occurredAt : null,
      revisedBy: existingProposal ? { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) } : null,
    },
  }
}

function applyPropose(exception, command, actor, occurredAt) {
  if (!PROPOSABLE_STATUSES.has(exception.status)) return 'override_proposal_not_allowed_in_current_status'
  if (exception.reviewKind) return 'override_blocked_by_active_exception_review'
  if (exception.overrideProposal) return 'active_override_proposal_exists'
  if (exception.activeOverride) return 'active_override_exists'
  const built = proposalPayload(exception, command, actor, occurredAt)
  if (built.error) return built.error
  exception.overrideProposal = built.proposal
  return ''
}

function applyRevise(exception, command, actor, occurredAt) {
  if (!exception.overrideProposal) return 'override_revision_requires_proposal'
  if (exception.activeOverride) return 'active_override_exists'
  if (normalizeMatterPlanOwnerRole(actor.role) !== R.firmManager && !actorIsProposer(actor, exception.overrideProposal)) return 'override_revision_requires_proposer_or_manager'
  const built = proposalPayload(exception, command, actor, occurredAt, exception.overrideProposal)
  if (built.error) return built.error
  exception.overrideProposal = built.proposal
  return ''
}

function applyApprove(exception, command, actor, occurredAt) {
  const proposal = exception.overrideProposal
  if (!proposal) return 'override_approval_requires_proposal'
  if (!text(actor.userId)) return 'override_approver_user_required'
  if (actorIsProposer(actor, proposal)) return 'independent_override_approval_required'
  if (new Date(proposal.expiresAt) <= new Date(occurredAt)) return 'override_proposal_expired'
  const summary = text(command.summary || command.payload?.summary)
  const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id || command.payload?.decisionReferenceId || command.payload?.decision_reference_id)
  if (!summary) return 'override_decision_summary_required'
  if (!decisionReferenceId) return 'override_decision_reference_required'
  const approvedBy = { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) }
  const overrideId = `matter_override:${exception.exceptionId}:r${proposal.version}:${text(command.commandId || command.command_id)}`
  exception.activeOverride = {
    overrideId,
    status: 'active',
    operations: clone(proposal.operations),
    reason: proposal.reason,
    businessJustification: proposal.businessJustification,
    safeguards: clone(proposal.safeguards),
    expiresAt: proposal.expiresAt,
    approvedAt: occurredAt,
    approvedBy,
    decisionReferenceId,
    decisionSummary: summary,
    proposalVersion: proposal.version,
  }
  exception.lastOverrideDecision = {
    outcome: 'approved',
    overrideId,
    decisionReferenceId,
    summary,
    decidedAt: occurredAt,
    decidedBy: approvedBy,
    proposalVersion: proposal.version,
  }
  exception.overrideProposal = null
  return ''
}

function applyReject(exception, command, actor, occurredAt) {
  const proposal = exception.overrideProposal
  if (!proposal) return 'override_rejection_requires_proposal'
  if (!text(actor.userId)) return 'override_reviewer_user_required'
  if (actorIsProposer(actor, proposal)) return 'independent_override_review_required'
  const reason = text(command.reason || command.payload?.reason)
  if (!reason) return 'override_rejection_reason_required'
  exception.lastOverrideDecision = {
    outcome: 'rejected',
    reason,
    decidedAt: occurredAt,
    decidedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) },
    proposalVersion: proposal.version,
  }
  exception.overrideProposal = null
  return ''
}

function applyWithdraw(exception, command, actor, occurredAt) {
  const proposal = exception.overrideProposal
  if (!proposal) return 'override_withdrawal_requires_proposal'
  if (normalizeMatterPlanOwnerRole(actor.role) !== R.firmManager && !actorIsProposer(actor, proposal)) return 'override_withdrawal_requires_proposer_or_manager'
  const reason = text(command.reason || command.payload?.reason)
  if (!reason) return 'override_withdrawal_reason_required'
  exception.lastOverrideDecision = {
    outcome: 'withdrawn',
    reason,
    decidedAt: occurredAt,
    decidedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) || null },
    proposalVersion: proposal.version,
  }
  exception.overrideProposal = null
  return ''
}

function applyRevoke(exception, command, actor, occurredAt) {
  const activeOverride = exception.activeOverride
  if (!activeOverride) return 'override_revocation_requires_active_override'
  const reason = text(command.reason || command.payload?.reason)
  if (!reason) return 'override_revocation_reason_required'
  exception.lastOverrideDecision = {
    outcome: 'revoked',
    reason,
    overrideId: activeOverride.overrideId,
    decidedAt: occurredAt,
    decidedBy: { role: normalizeMatterPlanOwnerRole(actor.role), userId: text(actor.userId) || null },
    proposalVersion: activeOverride.proposalVersion,
  }
  exception.activeOverride = null
  return ''
}

function applyCommand(exception, command, actor, occurredAt) {
  const commandType = lower(command.type)
  if (commandType === MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.propose) return applyPropose(exception, command, actor, occurredAt)
  if (commandType === MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.revise) return applyRevise(exception, command, actor, occurredAt)
  if (commandType === MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.approve) return applyApprove(exception, command, actor, occurredAt)
  if (commandType === MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.reject) return applyReject(exception, command, actor, occurredAt)
  if (commandType === MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.withdraw) return applyWithdraw(exception, command, actor, occurredAt)
  return applyRevoke(exception, command, actor, occurredAt)
}

export function evaluateConveyancerMatterExceptionOverride({ exception = {}, operation = '', asOf = '' } = {}) {
  if (!validDate(asOf)) return { allowed: false, reason: 'as_of_required', override: null }
  const normalizedOperation = lower(operation)
  if (!OPERATION_TYPES.has(normalizedOperation)) return { allowed: false, reason: 'unsafe_or_unknown_override_operation', override: null }
  if (TERMINAL_STATUSES.has(exception.status)) return { allowed: false, reason: 'exception_terminal', override: null }
  const activeOverride = exception.activeOverride
  if (!activeOverride || activeOverride.status !== 'active') return { allowed: false, reason: 'no_active_override', override: null }
  if (!validDate(activeOverride.expiresAt) || new Date(activeOverride.expiresAt) <= new Date(asOf)) return { allowed: false, reason: 'override_expired', override: clone(activeOverride) }
  if (!activeOverride.operations?.includes(normalizedOperation)) return { allowed: false, reason: 'operation_not_overridden', override: clone(activeOverride) }
  return { allowed: true, reason: 'override_active', override: clone(activeOverride) }
}

export function executeConveyancerMatterExceptionOverride({
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
  if (!COMMAND_TYPES.has(commandType)) return fail('invalid_override_command')
  const authority = authorisedForException(current, actor, capabilityForCommand(commandType))
  if (!authority.allowed) return fail(authority.reason)
  const duplicateEvent = (Array.isArray(existingEvents) ? existingEvents : []).find((item) =>
    text(item.commandId || item.command_id) === commandId && text(item.exceptionId || item.exception_id) === current.exceptionId)
  if (duplicateEvent) return { ok: true, duplicate: true, code: 'idempotent_replay', exception: clone(current), event: duplicateEvent }
  if (TERMINAL_STATUSES.has(current.status)) return fail('terminal_exception_not_overridable')
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
  const eventId = `matter_exception_override:${next.exceptionId}:${commandId}`
  next.lastEventId = eventId
  const resultingValidation = validateConveyancerMatterException(next, { actionKeys: planActionKeys })
  if (!resultingValidation.valid) return fail('resulting_exception_invalid', { errors: resultingValidation.errors })
  const resultingException = resultingValidation.exception
  const event = deepFreeze({
    version: CONVEYANCER_MATTER_EXCEPTION_OVERRIDE_VERSION,
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
    proposal: [MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.propose, MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.revise].includes(commandType)
      ? clone(resultingException.overrideProposal)
      : null,
    decision: [MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.approve, MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.reject, MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.withdraw, MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES.revoke].includes(commandType)
      ? clone(resultingException.lastOverrideDecision)
      : null,
  })
  return { ok: true, duplicate: false, code: 'exception_override_command_applied', exception: resultingException, event }
}
