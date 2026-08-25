import {
  JOURNEY_STAGE_ACTIONS,
  getJourneyStageOrder,
  getJourneyStagePolicy,
  isJourneyStageCatchUpAllowed,
  normalizeJourneyEntityType,
  normalizeJourneyStageKey,
} from './journeyStagePolicy.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeTimestamp(value) {
  const text = normalizeText(value)
  const time = text ? new Date(text).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

export function normalizeJourneyStageOverrideRow(row = {}) {
  const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    entityType: normalizeJourneyEntityType(row.entity_type || row.entityType),
    entityId: normalizeText(row.entity_id || row.entityId),
    stageKey: normalizeJourneyStageKey(row.stage_key || row.stageKey),
    actionType: normalizeText(row.action_type || row.actionType),
    reason: normalizeText(row.reason),
    effectiveAt: normalizeText(row.effective_at || row.effectiveAt),
    actorUserId: normalizeText(row.actor_user_id || row.actorUserId),
    notificationMode: normalizeText(row.notification_mode || row.notificationMode),
    metadata,
    supersedesOverrideId: normalizeText(row.supersedes_override_id || row.supersedesOverrideId),
    linkedActivityTable: normalizeText(row.linked_activity_table || row.linkedActivityTable),
    linkedActivityId: normalizeText(row.linked_activity_id || row.linkedActivityId),
    createdAt: normalizeText(row.created_at || row.createdAt),
  }
}

export function getActiveJourneyStageOverrides(overrides = []) {
  const latestByStage = new Map()
  const ordered = (Array.isArray(overrides) ? overrides : [])
    .map(normalizeJourneyStageOverrideRow)
    .filter((row) => row.stageKey && row.actionType)
    .sort((left, right) => {
      const leftTime = normalizeTimestamp(left.effectiveAt || left.createdAt)
      const rightTime = normalizeTimestamp(right.effectiveAt || right.createdAt)
      if (leftTime !== rightTime) return leftTime - rightTime
      return left.id.localeCompare(right.id)
    })

  for (const row of ordered) {
    if (row.actionType === JOURNEY_STAGE_ACTIONS.clearOverride) {
      latestByStage.delete(row.stageKey)
    } else {
      latestByStage.set(row.stageKey, row)
    }
  }

  return latestByStage
}

function buildOverrideDetail(override = null) {
  if (!override) return ''
  if (override.actionType === JOURNEY_STAGE_ACTIONS.markPaid) return 'Marked paid - review required'
  return 'Completed by override'
}

export function applyJourneyStageOverrides({
  entityType,
  stages = [],
  overrides = [],
  stageOrder = null,
} = {}) {
  const normalizedEntityType = normalizeJourneyEntityType(entityType)
  const activeOverrides = getActiveJourneyStageOverrides(overrides)
  const order = getJourneyStageOrder(normalizedEntityType, stageOrder)
  const jumpTargets = [...activeOverrides.values()].filter((override) => override.actionType === JOURNEY_STAGE_ACTIONS.jumpToStage)
  const furthestJumpIndex = jumpTargets.reduce((max, override) => {
    const index = order.indexOf(override.stageKey)
    return index >= 0 ? Math.max(max, index) : max
  }, -1)

  const nextStages = (Array.isArray(stages) ? stages : []).map((stage) => {
    const stageKey = normalizeJourneyStageKey(stage?.key || stage?.stageKey)
    const override = activeOverrides.get(stageKey) || null
    const policy = getJourneyStagePolicy(normalizedEntityType, stageKey)
    const orderIndex = order.indexOf(stageKey)
    const directComplete =
      override?.actionType === JOURNEY_STAGE_ACTIONS.markComplete && isJourneyStageCatchUpAllowed(normalizedEntityType, stageKey)
    const paidReview =
      override?.actionType === JOURNEY_STAGE_ACTIONS.markPaid &&
      Array.isArray(policy?.actions) &&
      policy.actions.includes(JOURNEY_STAGE_ACTIONS.markPaid)
    const jumpComplete = furthestJumpIndex >= 0 && orderIndex >= 0 && orderIndex < furthestJumpIndex && isJourneyStageCatchUpAllowed(normalizedEntityType, stageKey)
    const overridden = directComplete || jumpComplete
    if (paidReview) {
      return {
        ...stage,
        done: false,
        completed: false,
        state: 'current',
        detail: buildOverrideDetail(override),
        status: buildOverrideDetail(override),
        override,
        policy,
        paymentReviewPending: true,
      }
    }
    if (!overridden) {
      return {
        ...stage,
        override: override || null,
        policy,
      }
    }

    return {
      ...stage,
      done: true,
      completed: true,
      state: 'completed',
      detail: buildOverrideDetail(override) || stage.detail,
      status: buildOverrideDetail(override) || stage.status,
      override,
      policy,
      overridden: true,
    }
  })

  const explicitCurrentIndex = nextStages.findIndex((stage) => stage.current === true || stage.state === 'current')
  const latestCompletedIndex = nextStages.reduce((latestIndex, stage, index) => {
    return (stage.done || stage.completed || stage.state === 'completed') ? index : latestIndex
  }, -1)
  const shouldPreserveExplicitCurrent = explicitCurrentIndex >= 0 && latestCompletedIndex <= explicitCurrentIndex
  const firstIncompleteIndex = nextStages.findIndex((stage) => !(stage.done || stage.completed || stage.state === 'completed'))
  const currentIndex = shouldPreserveExplicitCurrent
    ? explicitCurrentIndex
    : firstIncompleteIndex >= 0
      ? firstIncompleteIndex
      : nextStages.length - 1

  return nextStages.map((stage, index) => {
    if (index === currentIndex) {
      return { ...stage, current: true, state: 'current' }
    }
    if (stage.state === 'completed' || stage.done || stage.completed) {
      return { ...stage, state: 'completed' }
    }
    return {
      ...stage,
      state: index === currentIndex ? 'current' : stage.state === 'future' ? 'future' : 'upcoming',
    }
  })
}

export function buildJourneyStageOverrideActionModel({ entityType, stage = {} } = {}) {
  const stageKey = normalizeJourneyStageKey(stage?.key || stage?.stageKey)
  const policy = getJourneyStagePolicy(entityType, stageKey)
  if (!policy) return { policy: null, actions: [], catchUpAllowed: false, hardGate: false }

  const alreadyComplete = Boolean(stage?.done || stage?.completed || stage?.state === 'completed')
  const actions = []
  if (!alreadyComplete && policy.allowCatchUp && policy.actions.includes(JOURNEY_STAGE_ACTIONS.markComplete)) {
    actions.push({
      key: JOURNEY_STAGE_ACTIONS.markComplete,
      label: 'Mark complete',
      requiresReason: true,
      notificationMode: policy.notificationMode,
    })
  }
  if (!alreadyComplete && policy.actions.includes(JOURNEY_STAGE_ACTIONS.markPaid)) {
    actions.push({
      key: JOURNEY_STAGE_ACTIONS.markPaid,
      label: 'Mark as paid',
      requiresReason: true,
      notificationMode: policy.notificationMode,
    })
  }

  return {
    policy,
    actions,
    catchUpAllowed: policy.allowCatchUp === true,
    hardGate: policy.hardGate === true,
  }
}
