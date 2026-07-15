import {
  MATTER_PLAN_ACTION_STATES as S,
  MATTER_PLAN_CAPABILITIES as C,
  MATTER_PLAN_EVIDENCE_STATUSES as ES,
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  canMatterPlanActor,
  evaluateMatterPlanActionTransition,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
  validateMatterPlanAction,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerMatterActionQueue } from './conveyancerMatterActionQueue.js'

export const CONVEYANCER_MATTER_ACTION_EXECUTION_VERSION = 'conveyancer_matter_action_execution_v1'

export const MATTER_ACTION_COMMAND_TYPES = Object.freeze({
  start: 'start',
  markWaiting: 'mark_waiting',
  resume: 'resume',
  markBlocked: 'mark_blocked',
  submitReview: 'submit_review',
  complete: 'complete',
  reopen: 'reopen',
  cancel: 'cancel',
  recordEvidence: 'record_evidence',
  assign: 'assign',
})

const COMMAND_TYPES = new Set(Object.values(MATTER_ACTION_COMMAND_TYPES))
const TRANSFER_TEAM_ROLES = new Set([R.conveyancer, R.transferAttorney])
const DEPENDENCY_GATED_COMMANDS = new Set([
  MATTER_ACTION_COMMAND_TYPES.start,
  MATTER_ACTION_COMMAND_TYPES.resume,
  MATTER_ACTION_COMMAND_TYPES.submitReview,
  MATTER_ACTION_COMMAND_TYPES.complete,
])

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
  return { ok: false, duplicate: false, code, plan: null, event: null, ...details }
}

function rolesMatch(actorRole, ownerRole) {
  if (actorRole === ownerRole) return true
  return TRANSFER_TEAM_ROLES.has(actorRole) && TRANSFER_TEAM_ROLES.has(ownerRole)
}

function assignmentMatches(actor, owner = {}) {
  if (owner.userId && text(owner.userId) !== text(actor.userId)) return false
  const teamIds = Array.isArray(actor.teamIds) ? actor.teamIds.map(text) : []
  if (owner.teamId && !teamIds.includes(text(owner.teamId))) return false
  return true
}

function authorisedForAction(action, actor, capability = action.requiredCapability) {
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  const override = canMatterPlanActor(actorRole, C.override)
  if (!actorRole) return { allowed: false, reason: 'actor_role_required' }
  if (!override && !rolesMatch(actorRole, action.owner?.role)) return { allowed: false, reason: 'action_owned_by_another_role' }
  if (!override && !assignmentMatches(actor, action.owner)) return { allowed: false, reason: 'action_assigned_to_another_user_or_team' }
  if (!override && !canMatterPlanActor(actorRole, capability)) return { allowed: false, reason: 'actor_lacks_required_capability' }
  return { allowed: true, reason: override ? 'manager_override' : 'owned_and_authorised' }
}

function evidenceSatisfied(action) {
  return (action.evidenceRequirements || []).filter((requirement) => requirement.required !== false).every((requirement) => {
    return (action.evidence || []).some((evidence) => {
      if (evidence.requirementKey !== requirement.key) return false
      if (evidence.status === ES.waived) return Boolean(evidence.reason)
      if (requirement.requiresApproval) return evidence.status === ES.approved
      return [ES.provided, ES.approved].includes(evidence.status)
    })
  })
}

function runtimeSnapshot(action = {}) {
  return {
    state: action.state,
    owner: clone(action.owner || {}),
    evidence: clone(action.evidence || []),
    waitingOn: action.waitingOn || '',
    stateReason: action.stateReason || '',
    completedAt: action.completedAt || null,
    runtimeRevision: Number(action.runtimeRevision || 0),
  }
}

function replaceEvidence(action, entry) {
  action.evidence = [
    ...(action.evidence || []).filter((item) => item.requirementKey !== entry.requirementKey),
    entry,
  ]
}

function transitionTarget(commandType) {
  return {
    [MATTER_ACTION_COMMAND_TYPES.start]: S.doNow,
    [MATTER_ACTION_COMMAND_TYPES.markWaiting]: S.waiting,
    [MATTER_ACTION_COMMAND_TYPES.resume]: S.doNow,
    [MATTER_ACTION_COMMAND_TYPES.markBlocked]: S.blocked,
    [MATTER_ACTION_COMMAND_TYPES.submitReview]: S.review,
    [MATTER_ACTION_COMMAND_TYPES.complete]: S.completed,
    [MATTER_ACTION_COMMAND_TYPES.reopen]: S.doNow,
    [MATTER_ACTION_COMMAND_TYPES.cancel]: S.cancelled,
  }[commandType] || null
}

function validateCommandShape(command, plan, action) {
  if (!text(command.commandId)) return 'command_id_required'
  if (!COMMAND_TYPES.has(lower(command.type))) return 'invalid_command_type'
  if (!text(command.actionKey)) return 'action_key_required'
  if (!text(command.expectedPlanId)) return 'expected_plan_id_required'
  if (text(command.expectedPlanId) !== text(plan.planId || plan.plan_id)) return 'stale_plan_id'
  if (!Number.isInteger(Number(command.expectedPlanVersion))) return 'expected_plan_version_required'
  if (Number(command.expectedPlanVersion) !== Number(plan.version || 0)) return 'stale_plan_version'
  if (!Number.isInteger(Number(command.expectedActionRevision))) return 'expected_action_revision_required'
  if (action && Number(command.expectedActionRevision) !== Number(action.runtimeRevision || 0)) return 'stale_action_revision'
  return null
}

function applyEvidenceCommand(action, command, actor, occurredAt) {
  const payload = command.evidence || command.payload || {}
  const requirementKey = text(payload.requirementKey || payload.requirement_key)
  const requirement = (action.evidenceRequirements || []).find((item) => item.key === requirementKey)
  if (!requirement) return { error: 'unknown_evidence_requirement' }
  const status = lower(payload.status)
  if (!Object.values(ES).includes(status)) return { error: 'invalid_evidence_status' }
  const capability = status === ES.waived
    ? C.waive
    : [ES.approved, ES.rejected].includes(status) ? C.review : action.requiredCapability
  const authority = authorisedForAction(action, actor, capability)
  if (!authority.allowed) return { error: authority.reason }
  const reason = text(payload.reason)
  const referenceId = text(payload.referenceId || payload.reference_id)
  if (status === ES.waived && !reason) return { error: 'waived_evidence_reason_required' }
  if ([ES.provided, ES.approved, ES.rejected].includes(status) && !referenceId) return { error: 'evidence_reference_required' }
  const entry = {
    requirementKey,
    status,
    referenceId: referenceId || null,
    reason: reason || null,
    capturedAt: occurredAt,
  }
  replaceEvidence(action, entry)
  return { evidenceChange: entry, authority: authority.reason }
}

function applyAssignmentCommand(action, command, actor) {
  const authority = authorisedForAction(action, actor, C.assign)
  if (!authority.allowed) return { error: authority.reason }
  const assignment = command.assignment || command.payload || {}
  const userId = text(assignment.userId || assignment.user_id) || null
  const teamId = text(assignment.teamId || assignment.team_id) || null
  if (!userId && !teamId) return { error: 'assignment_target_required' }
  action.owner = { ...action.owner, userId, teamId }
  return { assignmentChange: { userId, teamId }, authority: authority.reason }
}

function applyTransitionCommand(action, command, actor, queueItem, occurredAt) {
  const commandType = lower(command.type)
  const capability = commandType === MATTER_ACTION_COMMAND_TYPES.reopen ||
    (commandType === MATTER_ACTION_COMMAND_TYPES.complete && action.state === S.review)
    ? C.review
    : action.requiredCapability
  const authority = authorisedForAction(action, actor, capability)
  if (!authority.allowed) return { error: authority.reason }
  if (DEPENDENCY_GATED_COMMANDS.has(commandType) && queueItem?.dependencySummary?.waiting + queueItem?.dependencySummary?.blocked > 0) {
    return { error: 'required_dependencies_not_satisfied' }
  }
  const reason = text(command.reason || command.payload?.reason)
  const waitingOn = text(command.waitingOn || command.waiting_on || command.payload?.waitingOn || command.payload?.waiting_on)
  if (commandType === MATTER_ACTION_COMMAND_TYPES.markWaiting && !waitingOn) return { error: 'waiting_on_required' }
  if ([MATTER_ACTION_COMMAND_TYPES.markBlocked, MATTER_ACTION_COMMAND_TYPES.cancel, MATTER_ACTION_COMMAND_TYPES.reopen, MATTER_ACTION_COMMAND_TYPES.resume].includes(commandType) && !reason) {
    return { error: 'command_reason_required' }
  }

  const target = transitionTarget(commandType)
  const transition = evaluateMatterPlanActionTransition({
    fromState: action.state,
    toState: target,
    actorRole: actor.role,
    reason,
    requiredEvidenceSatisfied: evidenceSatisfied(action),
  })
  if (!transition.allowed) return { error: transition.reason }

  action.state = target
  if (target === S.waiting) {
    action.waitingOn = waitingOn
    action.stateReason = reason
  } else if ([S.blocked, S.cancelled].includes(target)) {
    action.waitingOn = ''
    action.stateReason = reason
  } else {
    action.waitingOn = ''
    action.stateReason = commandType === MATTER_ACTION_COMMAND_TYPES.reopen ? reason : ''
  }
  if (target === S.completed) action.completedAt = occurredAt
  if (target !== S.completed) action.completedAt = null
  return { transition, authority: authority.reason }
}

function immutableEvent(value) {
  const freeze = (item) => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item
    Object.values(item).forEach(freeze)
    return Object.freeze(item)
  }
  return freeze(value)
}

export function executeConveyancerMatterAction({
  plan = {},
  command = {},
  actor = {},
  occurredAt = '',
  existingEvents = [],
  events = {},
  externalDependencies = {},
} = {}) {
  const commandId = text(command.commandId)
  if (!commandId) return fail('command_id_required')
  const planValidation = validateConveyancerMatterPlan(plan)
  if (!planValidation.valid) return fail('matter_plan_invalid', { errors: planValidation.errors })
  if (plan.status !== MATTER_PLAN_STATUSES.active) return fail('matter_plan_must_be_active')
  if (!canMatterPlanActor(actor.role, C.view)) return fail('actor_cannot_view_matter_plan')
  if (!validDate(occurredAt)) return fail('occurred_at_required')
  const duplicateEvent = (Array.isArray(existingEvents) ? existingEvents : []).find((item) =>
    text(item.commandId || item.command_id) === commandId &&
    text(item.planId || item.plan_id) === text(plan.planId || plan.plan_id) &&
    text(item.actionKey || item.action_key) === text(command.actionKey))
  if (duplicateEvent) {
    return { ok: true, duplicate: true, code: 'idempotent_replay', plan: clone(plan), event: duplicateEvent }
  }

  const resolvedOccurredAt = new Date(occurredAt).toISOString()
  const action = (plan.actions || []).find((item) => item.key === text(command.actionKey))
  const shapeError = validateCommandShape(command, plan, action)
  if (shapeError) return fail(shapeError)
  if (!action) return fail('action_not_found')

  const nextPlan = clone(plan)
  const nextAction = nextPlan.actions.find((item) => item.key === action.key)
  const before = runtimeSnapshot(nextAction)
  const queue = buildConveyancerMatterActionQueue({
    plan,
    actor,
    asOf: resolvedOccurredAt,
    events,
    externalDependencies,
    includeCompleted: true,
  })
  if (!queue.valid) return fail(queue.blockers.includes('actor_cannot_view_matter_plan') ? 'actor_cannot_view_matter_plan' : 'action_queue_invalid')
  const queueItem = queue.items.find((item) => item.actionKey === action.key)
  const commandType = lower(command.type)
  let applied
  if (commandType === MATTER_ACTION_COMMAND_TYPES.recordEvidence) {
    applied = applyEvidenceCommand(nextAction, command, actor, resolvedOccurredAt)
  } else if (commandType === MATTER_ACTION_COMMAND_TYPES.assign) {
    applied = applyAssignmentCommand(nextAction, command, actor)
  } else {
    applied = applyTransitionCommand(nextAction, command, actor, queueItem, resolvedOccurredAt)
  }
  if (applied.error) return fail(applied.error)

  nextAction.runtimeRevision = Number(nextAction.runtimeRevision || 0) + 1
  nextAction.updatedAt = resolvedOccurredAt
  const eventId = `matter_action_event:${text(plan.planId || plan.plan_id)}:${action.key}:${commandId}`
  nextAction.lastEventId = eventId
  const actionValidation = validateMatterPlanAction(nextAction, { actionKeys: nextPlan.actions.map((item) => item.key) })
  if (!actionValidation.valid) return fail('resulting_action_invalid', { errors: actionValidation.errors })
  const nextValidation = validateConveyancerMatterPlan(nextPlan)
  if (!nextValidation.valid) return fail('resulting_plan_invalid', { errors: nextValidation.errors })

  const event = immutableEvent({
    version: CONVEYANCER_MATTER_ACTION_EXECUTION_VERSION,
    eventId,
    commandId,
    commandType,
    planId: text(plan.planId || plan.plan_id),
    planVersion: Number(plan.version || 0),
    actionKey: action.key,
    actionRevision: nextAction.runtimeRevision,
    occurredAt: resolvedOccurredAt,
    actor: {
      role: normalizeMatterPlanOwnerRole(actor.role),
      userId: text(actor.userId) || null,
      teamIds: (Array.isArray(actor.teamIds) ? actor.teamIds : []).map(text).filter(Boolean),
    },
    reason: text(command.reason || command.payload?.reason) || null,
    authority: applied.authority || null,
    before,
    after: runtimeSnapshot(nextAction),
    evidenceChange: applied.evidenceChange || null,
    assignmentChange: applied.assignmentChange || null,
  })
  return { ok: true, duplicate: false, code: 'action_command_applied', plan: nextPlan, event }
}
