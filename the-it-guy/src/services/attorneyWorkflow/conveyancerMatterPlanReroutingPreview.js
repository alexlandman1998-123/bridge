import {
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
  evaluateMatterPlanSupersession,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import { generateConveyancerMatterPlan } from './conveyancerMatterPlanGenerator.js'

export const CONVEYANCER_MATTER_PLAN_REROUTING_PREVIEW_VERSION = 'conveyancer_matter_plan_rerouting_preview_v1'

export const MATTER_PLAN_REROUTING_IMPACT_LEVELS = Object.freeze({
  none: 'none',
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
})

const LEVEL_RANK = Object.freeze({ none: 0, low: 1, medium: 2, high: 3, critical: 4 })
const UNSTARTED_ACTION_STATES = new Set([MATTER_PLAN_ACTION_STATES.upcoming])

function text(value = '') {
  return String(value || '').trim()
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((field) => [field, stableValue(value[field])]))
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function equal(left, right) {
  return stableStringify(left) === stableStringify(right)
}

function maxLevel(...levels) {
  return levels.reduce((current, level) => LEVEL_RANK[level] > LEVEL_RANK[current] ? level : current, 'none')
}

function actionDefinition(action = {}) {
  return {
    label: action.label,
    description: action.description,
    priority: action.priority,
    ownerRole: action.owner?.role,
    requiredCapability: action.requiredCapability,
    dependencies: action.dependencies || [],
    dueDateRule: action.dueDateRule || {},
    evidenceRequirements: action.evidenceRequirements || [],
    ruleId: action.provenance?.ruleId,
    ruleVersion: action.provenance?.ruleVersion,
  }
}

function indexByKey(items = []) {
  return new Map(items.map((item) => [item.key, item]))
}

function keyedChanges(current = [], candidate = []) {
  const currentByKey = indexByKey(current)
  const candidateByKey = indexByKey(candidate)
  return {
    added: candidate.filter((item) => !currentByKey.has(item.key)).map((item) => item.key),
    removed: current.filter((item) => !candidateByKey.has(item.key)).map((item) => item.key),
    retained: candidate.filter((item) => currentByKey.has(item.key)).map((item) => item.key),
  }
}

function actionFieldChanges(current, candidate) {
  const changes = []
  const compare = (field, left, right) => {
    if (!equal(left, right)) changes.push({ field, before: left, after: right })
  }
  compare('label', current.label, candidate.label)
  compare('description', current.description, candidate.description)
  compare('priority', current.priority, candidate.priority)
  compare('owner_role', current.owner?.role, candidate.owner?.role)
  compare('required_capability', current.requiredCapability, candidate.requiredCapability)
  compare('dependencies', current.dependencies || [], candidate.dependencies || [])
  compare('due_date_rule', current.dueDateRule || {}, candidate.dueDateRule || {})
  compare('evidence_requirements', current.evidenceRequirements || [], candidate.evidenceRequirements || [])
  return changes
}

function actionHasProgress(action = {}) {
  return !UNSTARTED_ACTION_STATES.has(action.state) || Boolean(action.evidence?.length || action.completedAt || action.waitingOn || action.stateReason)
}

function diffFacts(currentFacts = {}, candidateFacts = {}) {
  const fields = [...new Set([...Object.keys(currentFacts || {}), ...Object.keys(candidateFacts || {})])].sort()
  return fields.filter((field) => !equal(currentFacts?.[field], candidateFacts?.[field])).map((field) => ({
    field,
    before: currentFacts?.[field] ?? null,
    after: candidateFacts?.[field] ?? null,
  }))
}

function legalLaneChanges(currentFacts = {}, candidateFacts = {}) {
  const laneDefinitions = [
    { lane: 'bond', fact: 'requiresBondAttorney', role: MATTER_PLAN_OWNER_ROLES.bondAttorney },
    { lane: 'cancellation', fact: 'requiresCancellationAttorney', role: MATTER_PLAN_OWNER_ROLES.cancellationAttorney },
  ]
  return laneDefinitions.flatMap(({ lane, fact, role }) => {
    const before = currentFacts?.[fact] === true
    const after = candidateFacts?.[fact] === true
    if (before === after) return []
    const direction = after ? 'activated' : 'deactivated'
    return [{
      lane,
      role,
      direction,
      impactLevel: after ? MATTER_PLAN_REROUTING_IMPACT_LEVELS.high : MATTER_PLAN_REROUTING_IMPACT_LEVELS.critical,
      message: after
        ? `${lane === 'bond' ? 'The financing bank' : 'The existing lender'} must appoint the ${lane} attorney before the confirmed firm is invited.`
        : `Removing the ${lane} lane does not cancel an existing appointment, instruction or platform access; coordinated close-out is required.`,
    }]
  })
}

function diffActions(currentActions = [], candidateActions = [], generationDecisions = []) {
  const currentByKey = indexByKey(currentActions)
  const candidateByKey = indexByKey(candidateActions)
  const resetKeys = new Set(generationDecisions.filter((item) => item.outcome === 'progress_reset').map((item) => item.actionKey))
  const carriedKeys = new Set(generationDecisions.filter((item) => item.outcome === 'progress_carried_forward').map((item) => item.actionKey))
  const changes = []

  for (const action of candidateActions) {
    const current = currentByKey.get(action.key)
    if (!current) {
      changes.push({
        actionKey: action.key,
        label: action.label,
        changeType: 'added',
        impactLevel: action.priority === 'critical' ? 'high' : 'medium',
        previousState: null,
        candidateState: action.state,
        progressDisposition: 'new_action',
        affectedOwnerRoles: [action.owner?.role].filter(Boolean),
        fieldChanges: [],
      })
      continue
    }

    const fieldChanges = actionFieldChanges(current, action)
    const definitionChanged = !equal(actionDefinition(current), actionDefinition(action))
    if (!definitionChanged && !resetKeys.has(action.key)) continue
    const completedProgressReset = current.state === MATTER_PLAN_ACTION_STATES.completed && action.state !== current.state
    changes.push({
      actionKey: action.key,
      label: action.label,
      changeType: 'changed',
      impactLevel: completedProgressReset ? 'critical' : action.priority === 'critical' ? 'high' : 'medium',
      previousState: current.state,
      candidateState: action.state,
      progressDisposition: resetKeys.has(action.key) ? 'reset' : carriedKeys.has(action.key) ? 'carried_forward' : 'unchanged',
      previousEvidenceCount: current.evidence?.length || 0,
      affectedOwnerRoles: [...new Set([current.owner?.role, action.owner?.role].filter(Boolean))],
      fieldChanges,
    })
  }

  for (const action of currentActions) {
    if (candidateByKey.has(action.key)) continue
    const hasProgress = actionHasProgress(action)
    changes.push({
      actionKey: action.key,
      label: action.label,
      changeType: 'removed',
      impactLevel: action.state === MATTER_PLAN_ACTION_STATES.completed ? 'critical' : hasProgress ? 'high' : 'medium',
      previousState: action.state,
      candidateState: null,
      progressDisposition: hasProgress ? 'removed_with_progress' : 'removed_unstarted',
      previousEvidenceCount: action.evidence?.length || 0,
      affectedOwnerRoles: [action.owner?.role].filter(Boolean),
      fieldChanges: [],
    })
  }

  return changes.sort((left, right) => left.actionKey.localeCompare(right.actionKey))
}

function requiredAcknowledgements(actionChanges, laneChanges) {
  const acknowledgements = []
  for (const change of actionChanges) {
    if (change.changeType === 'removed' && ['removed_with_progress'].includes(change.progressDisposition)) {
      acknowledgements.push({
        key: `remove_action:${change.actionKey}`,
        type: 'remove_progressed_action',
        impactLevel: change.impactLevel,
        message: `Acknowledge removal of “${change.label}” with existing progress.`,
      })
    }
    if (change.changeType === 'changed' && change.previousState === MATTER_PLAN_ACTION_STATES.completed && change.progressDisposition === 'reset') {
      acknowledgements.push({
        key: `reset_completed_action:${change.actionKey}`,
        type: 'reset_completed_action',
        impactLevel: 'critical',
        message: `Acknowledge reopening of completed action “${change.label}”.`,
      })
    }
  }
  for (const change of laneChanges.filter((item) => item.direction === 'deactivated')) {
    acknowledgements.push({
      key: `deactivate_legal_lane:${change.lane}`,
      type: 'deactivate_legal_lane',
      impactLevel: 'critical',
      message: `Acknowledge that the ${change.lane} legal lane needs coordinated close-out outside this plan change.`,
    })
  }
  return acknowledgements
}

function notificationPreview(actionChanges, laneChanges) {
  const roles = new Set()
  for (const lane of laneChanges) roles.add(lane.role)
  for (const change of actionChanges) {
    for (const role of change.affectedOwnerRoles || []) roles.add(role)
    if (['added', 'changed', 'removed'].includes(change.changeType)) roles.add(MATTER_PLAN_OWNER_ROLES.transferAttorney)
  }
  if (actionChanges.some((change) => change.fieldChanges.some((item) => item.field === 'owner_role'))) roles.add(MATTER_PLAN_OWNER_ROLES.firmManager)
  return [...roles].sort().map((role) => ({
    role,
    reason: laneChanges.some((lane) => lane.role === role)
      ? 'Legal-lane requirement changed.'
      : 'The transfer matter plan changed.',
  }))
}

function previewStatus({ currentValid, currentActive, candidateValid, hasChanges, authorised, pendingAcknowledgements }) {
  if (!currentValid || !currentActive || !candidateValid) return 'invalid'
  if (!hasChanges) return 'no_changes'
  if (!authorised) return 'unauthorised'
  if (pendingAcknowledgements.length) return 'needs_acknowledgement'
  return 'ready'
}

export function previewConveyancerMatterPlanRerouting({
  currentPlan = {},
  proposedTransaction = {},
  actorRole = '',
  changeReason = '',
  generatedAt = '',
  organisationId = '',
  acknowledgedImpactKeys = [],
} = {}) {
  const currentValidation = validateConveyancerMatterPlan(currentPlan)
  const currentActive = currentPlan.status === MATTER_PLAN_STATUSES.active
  const generated = generateConveyancerMatterPlan({
    transaction: proposedTransaction,
    organisationId: organisationId || currentPlan.organisationId || currentPlan.organisation_id,
    generatedAt,
    previousPlan: currentPlan,
    changeReason,
    carryForwardProgress: true,
  })
  const candidatePlan = generated.plan
  const factChanges = diffFacts(currentPlan.factsSnapshot || {}, candidatePlan.factsSnapshot || {})
  const laneChanges = legalLaneChanges(currentPlan.factsSnapshot || {}, candidatePlan.factsSnapshot || {})
  const actionChanges = diffActions(currentPlan.actions || [], candidatePlan.actions || [], generated.trace?.decisions || [])
  const actionSetChanges = keyedChanges(currentPlan.actions || [], candidatePlan.actions || [])
  const materialChanges = factChanges.length > 0 || actionChanges.length > 0
  const supersession = evaluateMatterPlanSupersession({
    currentPlan,
    nextPlan: candidatePlan,
    actorRole,
    reason: changeReason,
  })
  const required = requiredAcknowledgements(actionChanges, laneChanges)
  const acknowledged = new Set((acknowledgedImpactKeys || []).map(text).filter(Boolean))
  const pending = required.filter((item) => !acknowledged.has(item.key))
  const impactLevel = maxLevel(
    factChanges.length ? 'low' : 'none',
    ...actionChanges.map((item) => item.impactLevel),
    ...laneChanges.map((item) => item.impactLevel),
  )
  const status = previewStatus({
    currentValid: currentValidation.valid,
    currentActive,
    candidateValid: generated.valid,
    hasChanges: materialChanges,
    authorised: supersession.allowed,
    pendingAcknowledgements: pending,
  })
  const blockers = []
  if (!currentValidation.valid) blockers.push('current_plan_invalid')
  if (!currentActive) blockers.push('current_plan_must_be_active')
  if (!generated.valid) blockers.push('candidate_plan_invalid')
  if (!materialChanges) blockers.push('no_material_rerouting_changes')
  if (!supersession.allowed) blockers.push(supersession.reason)
  if (pending.length) blockers.push('impact_acknowledgements_required')

  return {
    version: CONVEYANCER_MATTER_PLAN_REROUTING_PREVIEW_VERSION,
    status,
    canApply: status === 'ready',
    impactLevel,
    currentPlanId: currentPlan.planId || currentPlan.plan_id || null,
    currentPlanVersion: Number(currentPlan.version || 0),
    candidatePlan,
    candidatePlanValid: generated.valid,
    errors: [...new Set([...currentValidation.errors.map((item) => `current:${item}`), ...generated.errors.map((item) => `candidate:${item}`)])],
    warnings: [...new Set(generated.warnings || [])],
    blockers: [...new Set(blockers)],
    supersession,
    summary: {
      factChanges: factChanges.length,
      actionsAdded: actionSetChanges.added.length,
      actionsRemoved: actionSetChanges.removed.length,
      actionsChanged: actionChanges.filter((item) => item.changeType === 'changed').length,
      actionsReset: actionChanges.filter((item) => item.progressDisposition === 'reset').length,
      legalLanesActivated: laneChanges.filter((item) => item.direction === 'activated').length,
      legalLanesDeactivated: laneChanges.filter((item) => item.direction === 'deactivated').length,
      requiredAcknowledgements: required.length,
      pendingAcknowledgements: pending.length,
    },
    impacts: {
      facts: factChanges,
      actions: actionChanges,
      actionKeys: actionSetChanges,
      legalLanes: laneChanges,
      notifications: notificationPreview(actionChanges, laneChanges),
    },
    acknowledgements: {
      required,
      acknowledged: required.filter((item) => acknowledged.has(item.key)),
      pending,
    },
    provenance: {
      generatorVersion: candidatePlan.generatorVersion,
      currentFactsVersion: currentPlan.sourceFactsVersion || null,
      candidateFactsVersion: candidatePlan.sourceFactsVersion || null,
      candidateTrace: generated.trace,
    },
  }
}
