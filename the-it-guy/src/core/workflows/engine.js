function normalizeStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['completed', 'in_progress', 'blocked', 'not_started'].includes(normalized)) {
    return normalized
  }

  return 'not_started'
}

function resolveCurrentStageIndex(stageDefinitions, sourceStatusByStageKey = {}) {
  const index = stageDefinitions.findIndex((stage) => normalizeStatus(sourceStatusByStageKey[stage.key]) !== 'completed')
  return index === -1 ? stageDefinitions.length - 1 : index
}

export function buildWorkflowLaneSnapshot({
  laneKey,
  laneLabel,
  stageDefinitions = [],
  sourceStatusByStageKey = {},
  sourceStageMetaByKey = {},
  lockState = { isLocked: false, message: '', blockers: [] },
  stageBlockersByKey = {},
  permissions = null,
  nextAction = null,
  isCompleteOverride = null,
} = {}) {
  const definitions = (stageDefinitions || []).map((stage, index) => ({
    ...stage,
    order: index + 1,
  }))

  if (!definitions.length) {
    return {
      key: laneKey,
      label: laneLabel,
      stages: [],
      currentStageKey: null,
      isLocked: Boolean(lockState?.isLocked),
      isComplete: true,
      blockers: [...new Set([...(lockState?.blockers || []), lockState?.message].filter(Boolean))],
      availableActions: [],
      permissions,
      summaryText: '0/0 stages completed',
    }
  }

  const allCompleted = definitions.every((stage) => normalizeStatus(sourceStatusByStageKey[stage.key]) === 'completed')
  const isComplete = typeof isCompleteOverride === 'boolean' ? isCompleteOverride : allCompleted
  const currentStageIndex = isComplete ? definitions.length - 1 : resolveCurrentStageIndex(definitions, sourceStatusByStageKey)
  const currentStageKey = isComplete ? null : definitions[currentStageIndex]?.key || null
  const laneLocked = Boolean(lockState?.isLocked)
  const lockMessage = String(lockState?.message || '').trim()

  const stages = definitions.map((stage, index) => {
    const sourceStatus = normalizeStatus(sourceStatusByStageKey[stage.key])
    const isCompleteStage = sourceStatus === 'completed'
    const isCurrentStage = !isComplete && index === currentStageIndex
    const priorComplete = definitions.slice(0, index).every((item) => normalizeStatus(sourceStatusByStageKey[item.key]) === 'completed')
    const stageLocked = !isCompleteStage && (laneLocked || !priorComplete)

    let status = 'upcoming'
    if (isCompleteStage) {
      status = 'completed'
    } else if (stageLocked) {
      status = 'locked'
    } else if (sourceStatus === 'blocked') {
      status = 'blocked'
    } else if (isCurrentStage || sourceStatus === 'in_progress') {
      status = 'current'
    }

    const stageBlockers = [
      ...(Array.isArray(stageBlockersByKey[stage.key]) ? stageBlockersByKey[stage.key] : [stageBlockersByKey[stage.key]]),
      stageLocked ? lockMessage : null,
    ]
      .filter(Boolean)
      .map((item) => String(item).trim())
      .filter(Boolean)

    const sourceMeta = sourceStageMetaByKey[stage.key] || {}

    return {
      key: stage.key,
      label: stage.label,
      description: stage.description || '',
      order: stage.order,
      status,
      isComplete: isCompleteStage,
      isCurrent: status === 'current',
      isLocked: status === 'locked',
      blockers: stageBlockers,
      blocker: stageBlockers[0] || '',
      allowedRoles: stage.allowedRoles || [],
      completionRequirements: stage.completionRequirements || [],
      ...sourceMeta,
    }
  })

  const completedCount = stages.filter((stage) => stage.isComplete).length
  const totalCount = stages.length
  const blockers = [
    ...new Set([
      ...(lockState?.blockers || []),
      lockMessage,
      ...Object.values(stageBlockersByKey || {})
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter(Boolean),
    ]),
  ]

  const canAdvance = Boolean(permissions?.canAdvanceStage)
  const availableActions = nextAction
    ? [
        {
          ...nextAction,
          disabled:
            Boolean(nextAction?.disabled) ||
            laneLocked ||
            !canAdvance,
          disabledReason:
            nextAction?.disabledReason ||
            (laneLocked
              ? lockMessage
              : !canAdvance
                ? 'Your role cannot advance this workflow lane.'
                : ''),
        },
      ]
    : []

  return {
    key: laneKey,
    label: laneLabel,
    stages,
    currentStageKey,
    isLocked: laneLocked,
    isComplete,
    blockers,
    availableActions,
    permissions,
    summaryText: `${completedCount}/${totalCount} stages completed`,
  }
}
