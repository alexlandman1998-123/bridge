import {
  MATTER_PLAN_ACTION_PRIORITIES,
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_CAPABILITIES,
  MATTER_PLAN_DEPENDENCY_TYPES,
  MATTER_PLAN_DUE_DATE_RULE_TYPES,
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
  canMatterPlanActor,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'

export const CONVEYANCER_MATTER_ACTION_QUEUE_VERSION = 'conveyancer_matter_action_queue_v1'

export const MATTER_ACTION_QUEUE_BUCKETS = Object.freeze({
  review: 'review',
  doNow: 'do_now',
  blocked: 'blocked',
  waiting: 'waiting',
  upcoming: 'upcoming',
  completed: 'completed',
  cancelled: 'cancelled',
})

const BUCKET_ORDER = Object.freeze({ review: 0, do_now: 1, blocked: 2, waiting: 3, upcoming: 4, completed: 5, cancelled: 6 })
const PRIORITY_ORDER = Object.freeze({ critical: 0, urgent: 1, high: 2, normal: 3, low: 4 })
const SATISFIED_EXTERNAL_STATES = new Set(['approved', 'complete', 'completed', 'provided', 'ready', 'satisfied'])
const TRANSFER_TEAM_ROLES = new Set([MATTER_PLAN_OWNER_ROLES.conveyancer, MATTER_PLAN_OWNER_ROLES.transferAttorney])
const DAY_MS = 24 * 60 * 60 * 1000

function text(value = '') {
  return String(value || '').trim()
}

function lower(value = '') {
  return text(value).toLowerCase()
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function isoDate(value) {
  return validDate(value) ? new Date(value).toISOString() : null
}

function addDays(value, days) {
  if (!validDate(value) || !Number.isInteger(Number(days))) return null
  return new Date(new Date(value).getTime() + Number(days) * DAY_MS).toISOString()
}

function dateKey(value, timeZone) {
  if (!validDate(value)) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function normalizeTimeZone(value) {
  const candidate = text(value) || 'Africa/Johannesburg'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return 'Africa/Johannesburg'
  }
}

function readExternalStatus(externalDependencies, dependency) {
  const compoundKey = `${dependency.type}:${dependency.key}`
  const value = externalDependencies?.[compoundKey] ?? externalDependencies?.[dependency.key]
  return lower(value?.status || value)
}

function resolveDependency(dependency, actionByKey, externalDependencies) {
  if (dependency.type !== MATTER_PLAN_DEPENDENCY_TYPES.action) {
    const sourceStatus = readExternalStatus(externalDependencies, dependency)
    const satisfied = !dependency.required || SATISFIED_EXTERNAL_STATES.has(sourceStatus)
    return {
      ...dependency,
      status: satisfied ? 'satisfied' : sourceStatus || 'waiting',
      satisfied,
      blocking: dependency.required && !satisfied && ['blocked', 'cancelled', 'rejected'].includes(sourceStatus),
      sourceActionState: null,
    }
  }

  const source = actionByKey.get(dependency.key)
  if (!source) {
    return { ...dependency, status: 'missing', satisfied: false, blocking: dependency.required, sourceActionState: null }
  }
  const satisfied = !dependency.required || source.state === MATTER_PLAN_ACTION_STATES.completed
  const blocking = dependency.required && [MATTER_PLAN_ACTION_STATES.blocked, MATTER_PLAN_ACTION_STATES.cancelled].includes(source.state)
  return {
    ...dependency,
    status: satisfied ? 'satisfied' : blocking ? 'blocked' : 'waiting',
    satisfied,
    blocking,
    sourceActionState: source.state,
    sourceActionLabel: source.label,
  }
}

function dueDateResolver(plan, actionByKey, events) {
  const cache = new Map()

  function resolve(actionKey, visiting = new Set()) {
    if (cache.has(actionKey)) return cache.get(actionKey)
    if (visiting.has(actionKey)) return null
    const action = actionByKey.get(actionKey)
    if (!action) return null
    const rule = action.dueDateRule || {}
    const nextVisiting = new Set(visiting).add(actionKey)
    let dueAt = null

    if (rule.type === MATTER_PLAN_DUE_DATE_RULE_TYPES.fixedDate) dueAt = isoDate(rule.dueAt)
    if (rule.type === MATTER_PLAN_DUE_DATE_RULE_TYPES.planActivationOffset) dueAt = addDays(plan.activatedAt, rule.offsetDays)
    if (rule.type === MATTER_PLAN_DUE_DATE_RULE_TYPES.actionCompletionOffset) {
      dueAt = addDays(actionByKey.get(rule.referenceKey)?.completedAt, rule.offsetDays)
    }
    if (rule.type === MATTER_PLAN_DUE_DATE_RULE_TYPES.eventOffset) {
      const event = events?.[rule.referenceKey]
      dueAt = addDays(event?.occurredAt || event?.occurred_at || event?.date || event, rule.offsetDays)
    }
    if (rule.type === MATTER_PLAN_DUE_DATE_RULE_TYPES.inherited) dueAt = resolve(rule.referenceKey, nextVisiting)
    cache.set(actionKey, dueAt)
    return dueAt
  }

  return resolve
}

function dueMeta(dueAt, asOf, timeZone, terminal = false) {
  if (terminal) return { dueAt, dueStatus: 'complete', daysUntilDue: null, overdue: false }
  if (!dueAt) return { dueAt: null, dueStatus: 'unscheduled', daysUntilDue: null, overdue: false }
  const dueDay = dateKey(dueAt, timeZone)
  const asOfDay = dateKey(asOf, timeZone)
  const daysUntilDue = Math.round((Date.parse(`${dueDay}T00:00:00.000Z`) - Date.parse(`${asOfDay}T00:00:00.000Z`)) / DAY_MS)
  if (daysUntilDue < 0) return { dueAt, dueStatus: 'overdue', daysUntilDue, overdue: true }
  if (daysUntilDue === 0) return { dueAt, dueStatus: 'due_today', daysUntilDue, overdue: false }
  if (daysUntilDue <= 3) return { dueAt, dueStatus: 'due_soon', daysUntilDue, overdue: false }
  return { dueAt, dueStatus: 'scheduled', daysUntilDue, overdue: false }
}

function missingEvidence(action) {
  return (action.evidenceRequirements || []).filter((requirement) => requirement.required !== false).filter((requirement) => {
    return !(action.evidence || []).some((evidence) => {
      if (evidence.requirementKey !== requirement.key) return false
      if (evidence.status === MATTER_PLAN_EVIDENCE_STATUSES.waived) return Boolean(evidence.reason)
      if (requirement.requiresApproval) return evidence.status === MATTER_PLAN_EVIDENCE_STATUSES.approved
      return [MATTER_PLAN_EVIDENCE_STATUSES.provided, MATTER_PLAN_EVIDENCE_STATUSES.approved].includes(evidence.status)
    })
  }).map((requirement) => ({
    key: requirement.key,
    label: requirement.label,
    type: requirement.type,
    requiresApproval: requirement.requiresApproval === true,
  }))
}

function deriveBucket(action, dependencies) {
  if (action.state === MATTER_PLAN_ACTION_STATES.completed) return MATTER_ACTION_QUEUE_BUCKETS.completed
  if (action.state === MATTER_PLAN_ACTION_STATES.cancelled) return MATTER_ACTION_QUEUE_BUCKETS.cancelled
  if (action.state === MATTER_PLAN_ACTION_STATES.blocked || dependencies.some((item) => item.blocking)) return MATTER_ACTION_QUEUE_BUCKETS.blocked
  if (action.state === MATTER_PLAN_ACTION_STATES.review) return MATTER_ACTION_QUEUE_BUCKETS.review
  if (action.state === MATTER_PLAN_ACTION_STATES.waiting) return MATTER_ACTION_QUEUE_BUCKETS.waiting
  if (dependencies.some((item) => item.required && !item.satisfied)) {
    return action.state === MATTER_PLAN_ACTION_STATES.doNow ? MATTER_ACTION_QUEUE_BUCKETS.waiting : MATTER_ACTION_QUEUE_BUCKETS.upcoming
  }
  return MATTER_ACTION_QUEUE_BUCKETS.doNow
}

function rolesMatch(actorRole, ownerRole) {
  if (actorRole === ownerRole) return true
  return TRANSFER_TEAM_ROLES.has(actorRole) && TRANSFER_TEAM_ROLES.has(ownerRole)
}

function assignmentMatches(actor, owner) {
  if (owner.userId && text(actor.userId) !== text(owner.userId)) return false
  if (owner.teamId && !(Array.isArray(actor.teamIds) ? actor.teamIds : []).map(text).includes(text(owner.teamId))) return false
  return true
}

function executionPermission(action, bucket, actor) {
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  const override = canMatterPlanActor(actorRole, MATTER_PLAN_CAPABILITIES.override)
  const owned = rolesMatch(actorRole, action.owner?.role)
  const capability = bucket === MATTER_ACTION_QUEUE_BUCKETS.review
    ? MATTER_PLAN_CAPABILITIES.review
    : action.requiredCapability
  if (!actorRole) return { canExecute: false, reason: 'actor_role_required' }
  if (![MATTER_ACTION_QUEUE_BUCKETS.doNow, MATTER_ACTION_QUEUE_BUCKETS.review].includes(bucket)) {
    return { canExecute: false, reason: `action_is_${bucket}` }
  }
  if (!override && !owned) return { canExecute: false, reason: 'owned_by_another_role' }
  if (!override && !assignmentMatches(actor, action.owner || {})) return { canExecute: false, reason: 'assigned_to_another_user_or_team' }
  if (!override && !canMatterPlanActor(actorRole, capability)) return { canExecute: false, reason: 'actor_lacks_required_capability' }
  return { canExecute: true, reason: override ? 'manager_override' : 'owned_and_authorised' }
}

function compareQueueItems(left, right) {
  const bucket = (BUCKET_ORDER[left.bucket] ?? 99) - (BUCKET_ORDER[right.bucket] ?? 99)
  if (bucket) return bucket
  if (left.overdue !== right.overdue) return left.overdue ? -1 : 1
  const priority = (PRIORITY_ORDER[left.priority] ?? 99) - (PRIORITY_ORDER[right.priority] ?? 99)
  if (priority) return priority
  if (left.dueAt && right.dueAt && left.dueAt !== right.dueAt) return left.dueAt.localeCompare(right.dueAt)
  if (left.dueAt !== right.dueAt) return left.dueAt ? -1 : 1
  return left.planOrder - right.planOrder
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

export function buildConveyancerMatterActionQueue({
  plan = {},
  actor = {},
  asOf = '',
  timeZone = 'Africa/Johannesburg',
  events = {},
  externalDependencies = {},
  includeCompleted = false,
} = {}) {
  const validation = validateConveyancerMatterPlan(plan)
  const active = plan.status === MATTER_PLAN_STATUSES.active
  const resolvedAsOf = validDate(asOf) ? new Date(asOf).toISOString() : new Date().toISOString()
  const resolvedTimeZone = normalizeTimeZone(timeZone)
  const actorCanView = canMatterPlanActor(actor.role, MATTER_PLAN_CAPABILITIES.view)
  const actionByKey = new Map((plan.actions || []).map((action) => [action.key, action]))
  const resolveDueDate = dueDateResolver(plan, actionByKey, events)

  const allItems = (plan.actions || []).map((action, planOrder) => {
    const dependencies = (action.dependencies || []).map((dependency) => resolveDependency(dependency, actionByKey, externalDependencies))
    const bucket = deriveBucket(action, dependencies)
    const gaps = missingEvidence(action)
    const terminal = [MATTER_ACTION_QUEUE_BUCKETS.completed, MATTER_ACTION_QUEUE_BUCKETS.cancelled].includes(bucket)
    const permission = executionPermission(action, bucket, actor)
    return {
      actionKey: action.key,
      label: action.label,
      description: action.description,
      bucket,
      sourceState: action.state,
      derivedReady: action.state === MATTER_PLAN_ACTION_STATES.upcoming && bucket === MATTER_ACTION_QUEUE_BUCKETS.doNow,
      priority: action.priority || MATTER_PLAN_ACTION_PRIORITIES.normal,
      owner: { ...(action.owner || {}) },
      requiredCapability: action.requiredCapability,
      planOrder,
      ...dueMeta(resolveDueDate(action.key), resolvedAsOf, resolvedTimeZone, terminal),
      dependencies,
      dependencySummary: {
        total: dependencies.length,
        satisfied: dependencies.filter((item) => item.satisfied).length,
        waiting: dependencies.filter((item) => !item.satisfied && !item.blocking).length,
        blocked: dependencies.filter((item) => item.blocking).length,
      },
      evidence: {
        required: (action.evidenceRequirements || []).filter((item) => item.required !== false).length,
        satisfied: (action.evidenceRequirements || []).filter((item) => item.required !== false).length - gaps.length,
        missing: gaps,
      },
      waitingOn: action.waitingOn || dependencies.filter((item) => !item.satisfied).map((item) => item.sourceActionLabel || item.key).join(', '),
      blockerReason: action.stateReason || dependencies.filter((item) => item.blocking).map((item) => item.sourceActionLabel || item.key).join(', '),
      canExecute: permission.canExecute,
      permissionReason: permission.reason,
      readOnly: !permission.canExecute,
    }
  }).sort(compareQueueItems)

  const items = includeCompleted
    ? allItems
    : allItems.filter((item) => ![MATTER_ACTION_QUEUE_BUCKETS.completed, MATTER_ACTION_QUEUE_BUCKETS.cancelled].includes(item.bucket))
  const visibleItems = actorCanView ? items : []
  const primaryAction = visibleItems.find((item) => item.canExecute) || null
  const attentionAction = visibleItems.find((item) => [MATTER_ACTION_QUEUE_BUCKETS.blocked, MATTER_ACTION_QUEUE_BUCKETS.review, MATTER_ACTION_QUEUE_BUCKETS.doNow].includes(item.bucket)) || visibleItems[0] || null
  const countsByBucket = Object.fromEntries(Object.values(MATTER_ACTION_QUEUE_BUCKETS).map((bucket) => [bucket, allItems.filter((item) => item.bucket === bucket).length]))
  const blockers = []
  if (!validation.valid) blockers.push('matter_plan_invalid')
  if (!active) blockers.push('matter_plan_must_be_active')
  if (!actorCanView) blockers.push('actor_cannot_view_matter_plan')

  return deepFreeze({
    version: CONVEYANCER_MATTER_ACTION_QUEUE_VERSION,
    valid: validation.valid && active && !blockers.includes('actor_cannot_view_matter_plan'),
    planId: plan.planId || plan.plan_id || null,
    planVersion: Number(plan.version || 0),
    asOf: resolvedAsOf,
    timeZone: resolvedTimeZone,
    actor: {
      role: normalizeMatterPlanOwnerRole(actor.role),
      userId: text(actor.userId) || null,
      teamIds: (Array.isArray(actor.teamIds) ? actor.teamIds : []).map(text).filter(Boolean),
    },
    items: visibleItems,
    primaryAction,
    attentionAction,
    metrics: {
      total: actorCanView ? allItems.length : 0,
      visible: visibleItems.length,
      actionable: visibleItems.filter((item) => item.canExecute).length,
      overdue: visibleItems.filter((item) => item.overdue).length,
      blocked: actorCanView ? countsByBucket.blocked : 0,
      waiting: actorCanView ? countsByBucket.waiting : 0,
      evidenceGaps: visibleItems.reduce((sum, item) => sum + item.evidence.missing.length, 0),
      countsByBucket: actorCanView ? countsByBucket : Object.fromEntries(Object.values(MATTER_ACTION_QUEUE_BUCKETS).map((bucket) => [bucket, 0])),
    },
    blockers,
    errors: validation.errors,
    warnings: validation.warnings,
  })
}
