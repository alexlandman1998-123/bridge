import {
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  MATTER_EXCEPTION_CAPABILITIES,
  MATTER_EXCEPTION_SOURCE_TYPES,
  MATTER_EXCEPTION_STATUSES,
  canMatterExceptionActor,
  validateConveyancerMatterException,
} from '../../core/transactions/conveyancerMatterExceptionContract.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS,
  MATTER_EXCEPTION_TRIGGER_OPERATORS,
  buildConveyancerMatterExceptionFromLibrary,
  isConveyancerMatterExceptionDefinitionApplicable,
} from '../../core/transactions/conveyancerMatterExceptionLibrary.js'

export const CONVEYANCER_MATTER_EXCEPTION_ACTIVATION_VERSION = 'conveyancer_matter_exception_activation_v1'

export const MATTER_EXCEPTION_OBSERVATION_STATES = Object.freeze({
  present: 'present',
  missing: 'missing',
  true: 'true',
  false: 'false',
  overdue: 'overdue',
  rejected: 'rejected',
  conflict: 'conflict',
  changed: 'changed',
  clear: 'clear',
})

const OBSERVATION_STATE_VALUES = Object.values(MATTER_EXCEPTION_OBSERVATION_STATES)
const SOURCE_TYPE_VALUES = Object.values(MATTER_EXCEPTION_SOURCE_TYPES)
const ACTIVE_STATUSES = new Set([
  MATTER_EXCEPTION_STATUSES.open,
  MATTER_EXCEPTION_STATUSES.acknowledged,
  MATTER_EXCEPTION_STATUSES.investigating,
  MATTER_EXCEPTION_STATUSES.waitingExternal,
  MATTER_EXCEPTION_STATUSES.remediation,
  MATTER_EXCEPTION_STATUSES.pendingReview,
])
const TERMINAL_STATUSES = new Set([
  MATTER_EXCEPTION_STATUSES.resolved,
  MATTER_EXCEPTION_STATUSES.waived,
  MATTER_EXCEPTION_STATUSES.cancelled,
  MATTER_EXCEPTION_STATUSES.superseded,
])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function observationScope(observation, definitionItem) {
  return key(observation.scopeKey || observation.scope_key) || definitionItem.actionKey || 'matter'
}

function normalizeObservation(input = {}) {
  return {
    signalKey: key(input.signalKey || input.signal_key),
    state: key(input.state),
    value: input.value,
    dueAt: input.dueAt || input.due_at || null,
    satisfied: input.satisfied === true,
    scopeKey: key(input.scopeKey || input.scope_key),
    observedAt: input.observedAt || input.observed_at || null,
    sourceType: key(input.sourceType || input.source_type) || MATTER_EXCEPTION_SOURCE_TYPES.systemRule,
    sourceId: text(input.sourceId || input.source_id) || null,
    detectedBy: input.detectedBy || input.detected_by || null,
  }
}

function validateObservations(observations, asOf) {
  const errors = []
  const normalized = (Array.isArray(observations) ? observations : []).map(normalizeObservation)
  const signatures = normalized.map((item) => `${item.signalKey}:${item.scopeKey || 'default'}`)
  normalized.forEach((item, index) => {
    const prefix = `observation_${index}`
    if (!item.signalKey) errors.push(`${prefix}:signal_key_required`)
    if (!OBSERVATION_STATE_VALUES.includes(item.state)) errors.push(`${prefix}:invalid_observation_state`)
    if (!validDate(item.observedAt)) errors.push(`${prefix}:observed_at_required`)
    if (validDate(item.observedAt) && new Date(item.observedAt) > new Date(asOf)) errors.push(`${prefix}:observation_from_future`)
    if (!SOURCE_TYPE_VALUES.includes(item.sourceType)) errors.push(`${prefix}:invalid_source_type`)
    if (!item.detectedBy?.role) errors.push(`${prefix}:detected_by_role_required`)
    else if (!canMatterExceptionActor(item.detectedBy.role, MATTER_EXCEPTION_CAPABILITIES.raise)) errors.push(`${prefix}:detector_cannot_raise_exception`)
    if (item.state === MATTER_EXCEPTION_OBSERVATION_STATES.overdue && item.dueAt && !validDate(item.dueAt)) errors.push(`${prefix}:invalid_due_at`)
  })
  if (new Set(signatures).size !== signatures.length) errors.push('duplicate_observation_scope')
  return { valid: errors.length === 0, errors: unique(errors), observations: normalized }
}

function observationMatches(observation, operator, asOf) {
  if (observation.state === MATTER_EXCEPTION_OBSERVATION_STATES.clear) return false
  if (operator === MATTER_EXCEPTION_TRIGGER_OPERATORS.missing) return observation.state === MATTER_EXCEPTION_OBSERVATION_STATES.missing
  if (operator === MATTER_EXCEPTION_TRIGGER_OPERATORS.true) return observation.state === MATTER_EXCEPTION_OBSERVATION_STATES.true || observation.value === true
  if (operator === MATTER_EXCEPTION_TRIGGER_OPERATORS.false) return observation.state === MATTER_EXCEPTION_OBSERVATION_STATES.false || observation.value === false
  if (operator === MATTER_EXCEPTION_TRIGGER_OPERATORS.rejected) return observation.state === MATTER_EXCEPTION_OBSERVATION_STATES.rejected
  if (operator === MATTER_EXCEPTION_TRIGGER_OPERATORS.conflict) return observation.state === MATTER_EXCEPTION_OBSERVATION_STATES.conflict
  if (operator === MATTER_EXCEPTION_TRIGGER_OPERATORS.changed) return observation.state === MATTER_EXCEPTION_OBSERVATION_STATES.changed
  if (operator === MATTER_EXCEPTION_TRIGGER_OPERATORS.overdue) {
    if (observation.state === MATTER_EXCEPTION_OBSERVATION_STATES.overdue) return true
    return validDate(observation.dueAt) && new Date(observation.dueAt) < new Date(asOf) && !observation.satisfied
  }
  return false
}

function activationEvent(exception, definitionItem, actor, activatedAt) {
  return deepFreeze({
    version: CONVEYANCER_MATTER_EXCEPTION_ACTIVATION_VERSION,
    eventId: `matter_exception_activation:${exception.exceptionId}`,
    eventType: 'exception_activated',
    exceptionId: exception.exceptionId,
    deduplicationKey: exception.deduplicationKey,
    planId: exception.planId,
    planVersion: exception.planVersion,
    transactionId: exception.transactionId,
    definitionKey: definitionItem.key,
    severity: exception.severity,
    occurredAt: activatedAt,
    actor: {
      role: normalizeMatterPlanOwnerRole(actor.role),
      userId: text(actor.userId || actor.user_id) || null,
    },
    source: clone(exception.source),
  })
}

function emptyResult(errors, existingExceptions = []) {
  return {
    version: CONVEYANCER_MATTER_EXCEPTION_ACTIVATION_VERSION,
    valid: false,
    errors: unique(errors),
    evaluations: [],
    activatedExceptions: [],
    retainedExceptions: [],
    resolutionCandidates: [],
    reopenCandidates: [],
    events: [],
    nextExceptions: clone(Array.isArray(existingExceptions) ? existingExceptions : []),
    metrics: { evaluated: 0, activated: 0, retained: 0, resolutionCandidates: 0, reopenCandidates: 0, notObserved: 0, notApplicable: 0 },
  }
}

export function activateConveyancerMatterExceptions({
  plan = {},
  observations = [],
  existingExceptions = [],
  actor = { role: R.system },
  escalationActor = null,
  asOf = '',
} = {}) {
  const resolvedAsOf = validDate(asOf) ? new Date(asOf).toISOString() : null
  if (!resolvedAsOf) return emptyResult(['valid_as_of_required'], existingExceptions)
  const planValidation = validateConveyancerMatterPlan(plan)
  if (!planValidation.valid) return emptyResult(planValidation.errors.map((item) => `plan:${item}`), existingExceptions)
  if (plan.status !== MATTER_PLAN_STATUSES.active) return emptyResult(['active_plan_required'], existingExceptions)
  if (!canMatterExceptionActor(actor.role, MATTER_EXCEPTION_CAPABILITIES.raise)) return emptyResult(['actor_cannot_activate_exceptions'], existingExceptions)

  const observationValidation = validateObservations(observations, resolvedAsOf)
  if (!observationValidation.valid) return emptyResult(observationValidation.errors, existingExceptions)
  const actionKeys = (plan.actions || []).map((action) => action.key)
  const scopedExisting = []
  const existingErrors = []
  for (const item of Array.isArray(existingExceptions) ? existingExceptions : []) {
    if (item.planId !== plan.planId || Number(item.planVersion) !== Number(plan.version)) continue
    const validation = validateConveyancerMatterException(item, { actionKeys })
    if (!validation.valid) existingErrors.push(...validation.errors.map((error) => `existing:${item.exceptionId || 'unknown'}:${error}`))
    else scopedExisting.push(validation.exception)
  }
  if (existingErrors.length) return emptyResult(existingErrors, existingExceptions)

  const activeByDedupe = new Map()
  const terminalByDedupe = new Map()
  for (const item of scopedExisting) {
    const target = ACTIVE_STATUSES.has(item.status) ? activeByDedupe : TERMINAL_STATUSES.has(item.status) ? terminalByDedupe : null
    if (!target) continue
    if (target.has(item.deduplicationKey)) return emptyResult([`duplicate_existing_exception:${item.deduplicationKey}`], existingExceptions)
    target.set(item.deduplicationKey, item)
  }

  const observationsBySignal = new Map()
  for (const observation of observationValidation.observations) {
    const items = observationsBySignal.get(observation.signalKey) || []
    items.push(observation)
    observationsBySignal.set(observation.signalKey, items)
  }

  const evaluations = []
  const activatedExceptions = []
  const retainedExceptions = []
  const resolutionCandidates = []
  const reopenCandidates = []
  const events = []
  const activationErrors = []

  for (const definitionItem of CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS) {
    const applicable = isConveyancerMatterExceptionDefinitionApplicable(definitionItem, plan)
    const matchingObservations = observationsBySignal.get(definitionItem.trigger.signalKey) || []
    if (!applicable) {
      evaluations.push({ definitionKey: definitionItem.key, outcome: 'not_applicable', observationCount: matchingObservations.length })
      for (const existing of scopedExisting.filter((item) => ACTIVE_STATUSES.has(item.status) && item.provenance?.definitionKey === definitionItem.key)) {
        resolutionCandidates.push({ exception: existing, reason: 'definition_no_longer_applicable', requiresReview: true })
      }
      continue
    }
    if (!matchingObservations.length) {
      evaluations.push({ definitionKey: definitionItem.key, outcome: 'not_observed', observationCount: 0 })
      continue
    }

    for (const observation of matchingObservations) {
      const scopeKey = observationScope(observation, definitionItem)
      const triggered = observationMatches(observation, definitionItem.trigger.operator, resolvedAsOf)
      if (!triggered) {
        evaluations.push({ definitionKey: definitionItem.key, scopeKey, outcome: 'not_triggered', observationState: observation.state })
        for (const existing of scopedExisting.filter((item) =>
          ACTIVE_STATUSES.has(item.status) &&
          item.provenance?.definitionKey === definitionItem.key &&
          (item.provenance?.scopeKey || definitionItem.actionKey || 'matter') === scopeKey)) {
          resolutionCandidates.push({ exception: existing, reason: 'trigger_cleared', requiresReview: true })
        }
        continue
      }

      const built = buildConveyancerMatterExceptionFromLibrary({
        definitionKey: definitionItem.key,
        plan,
        detectedAt: observation.observedAt,
        detectedBy: observation.detectedBy,
        escalationActor,
        sourceType: observation.sourceType,
        sourceId: observation.sourceId,
        scopeKey,
      })
      if (!built.valid) {
        activationErrors.push(...built.errors.map((error) => `${definitionItem.key}:${scopeKey}:${error}`))
        evaluations.push({ definitionKey: definitionItem.key, scopeKey, outcome: 'activation_blocked', errors: built.errors })
        continue
      }
      const active = activeByDedupe.get(built.exception.deduplicationKey)
      if (active) {
        retainedExceptions.push(active)
        evaluations.push({ definitionKey: definitionItem.key, scopeKey, outcome: 'retained', exceptionId: active.exceptionId })
        continue
      }
      const terminal = terminalByDedupe.get(built.exception.deduplicationKey)
      if (terminal) {
        reopenCandidates.push({ exception: terminal, reason: 'trigger_recurred', requiresAuthorisedReopen: true, observation })
        evaluations.push({ definitionKey: definitionItem.key, scopeKey, outcome: 'reopen_required', exceptionId: terminal.exceptionId })
        continue
      }
      activeByDedupe.set(built.exception.deduplicationKey, built.exception)
      activatedExceptions.push(built.exception)
      events.push(activationEvent(built.exception, definitionItem, actor, resolvedAsOf))
      evaluations.push({ definitionKey: definitionItem.key, scopeKey, outcome: 'activated', exceptionId: built.exception.exceptionId })
    }
  }

  const uniqueRetained = [...new Map(retainedExceptions.map((item) => [item.exceptionId, item])).values()]
  const uniqueResolution = [...new Map(resolutionCandidates.map((item) => [item.exception.exceptionId, item])).values()]
  const uniqueReopen = [...new Map(reopenCandidates.map((item) => [item.exception.exceptionId, item])).values()]
  if (activationErrors.length) {
    return {
      version: CONVEYANCER_MATTER_EXCEPTION_ACTIVATION_VERSION,
      valid: false,
      errors: unique(activationErrors),
      evaluations,
      activatedExceptions: [],
      retainedExceptions: uniqueRetained,
      resolutionCandidates: uniqueResolution,
      reopenCandidates: uniqueReopen,
      events: [],
      nextExceptions: clone(Array.isArray(existingExceptions) ? existingExceptions : []),
      metrics: {
        evaluated: evaluations.length,
        activated: 0,
        retained: uniqueRetained.length,
        resolutionCandidates: uniqueResolution.length,
        reopenCandidates: uniqueReopen.length,
        notObserved: evaluations.filter((item) => item.outcome === 'not_observed').length,
        notApplicable: evaluations.filter((item) => item.outcome === 'not_applicable').length,
      },
    }
  }
  const nextExceptions = [...clone(Array.isArray(existingExceptions) ? existingExceptions : []), ...clone(activatedExceptions)]
  return {
    version: CONVEYANCER_MATTER_EXCEPTION_ACTIVATION_VERSION,
    valid: true,
    errors: [],
    evaluations,
    activatedExceptions,
    retainedExceptions: uniqueRetained,
    resolutionCandidates: uniqueResolution,
    reopenCandidates: uniqueReopen,
    events,
    nextExceptions,
    metrics: {
      evaluated: evaluations.length,
      activated: activatedExceptions.length,
      retained: uniqueRetained.length,
      resolutionCandidates: uniqueResolution.length,
      reopenCandidates: uniqueReopen.length,
      notObserved: evaluations.filter((item) => item.outcome === 'not_observed').length,
      notApplicable: evaluations.filter((item) => item.outcome === 'not_applicable').length,
    },
  }
}
