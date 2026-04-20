import { TRANSFER_STAGE_DEFINITIONS, WORKFLOW_LANE_DEFINITIONS } from '../workflows/definitions'
import { buildWorkflowLaneSnapshot } from '../workflows/engine'

export const TRANSFER_WORKFLOW_TEMPLATE = [...TRANSFER_STAGE_DEFINITIONS]

function mapDisplayStatus({ sourceStatus, isCurrent, isLocked }) {
  const normalizedSourceStatus = String(sourceStatus || '').trim().toLowerCase()
  if (normalizedSourceStatus === 'completed') {
    return 'completed'
  }
  if (isLocked) {
    return 'locked'
  }
  if (normalizedSourceStatus === 'blocked') {
    return 'blocked'
  }
  if (isCurrent || normalizedSourceStatus === 'in_progress') {
    return 'current'
  }
  return 'upcoming'
}

export function resolveTransferWorkflowSnapshot({
  subprocesses = [],
  transferReady = false,
  transferBlockers = [],
  permissions = null,
} = {}) {
  const transferProcess = (subprocesses || []).find((item) => item?.process_type === 'attorney') || null
  const stepByKey = new Map((transferProcess?.steps || []).map((step) => [step.step_key, step]))
  const firstPendingIndex = TRANSFER_WORKFLOW_TEMPLATE.findIndex(
    (step) => (stepByKey.get(step.key)?.status || 'not_started') !== 'completed',
  )
  const complete = firstPendingIndex === -1
  const currentStep = complete ? null : TRANSFER_WORKFLOW_TEMPLATE[firstPendingIndex]

  const sourceStatusByStageKey = {}
  const sourceStageMetaByKey = {}
  const stageBlockersByKey = {}

  TRANSFER_WORKFLOW_TEMPLATE.forEach((definition, index) => {
    const source = stepByKey.get(definition.key) || null
    const rawStatus = String(source?.status || 'not_started').trim().toLowerCase()
    const isCompleted = rawStatus === 'completed'
    const isCurrent = !complete && index === firstPendingIndex
    const isLocked = !transferReady && !isCompleted

    sourceStatusByStageKey[definition.key] =
      isLocked
        ? 'not_started'
        : mapDisplayStatus({
            sourceStatus: rawStatus,
            isCurrent,
            isLocked,
          }) === 'blocked'
          ? 'blocked'
          : rawStatus

    sourceStageMetaByKey[definition.key] = {
      stepId: source?.id || null,
      rawStatus,
      completedAt: source?.completed_at || null,
    }

    stageBlockersByKey[definition.key] =
      isLocked
        ? 'Transfer workflow unlocks once Finance is completed and the matter is ready for attorney processing.'
        : rawStatus === 'blocked'
          ? String(source?.comment || '').trim() || 'This stage is blocked and needs follow-up before continuing.'
          : ''
  })

  const laneState = buildWorkflowLaneSnapshot({
    laneKey: WORKFLOW_LANE_DEFINITIONS.transfer.key,
    laneLabel: WORKFLOW_LANE_DEFINITIONS.transfer.label,
    stageDefinitions: TRANSFER_WORKFLOW_TEMPLATE,
    sourceStatusByStageKey,
    sourceStageMetaByKey,
    lockState: {
      isLocked: !transferReady,
      message: 'Transfer workflow unlocks once Finance is completed and the matter is ready for attorney processing.',
      blockers: transferReady ? [] : transferBlockers || [],
    },
    stageBlockersByKey,
    permissions,
    nextAction:
      !transferReady || complete || !currentStep
        ? null
        : {
            key: currentStep.key,
            label: currentStep.actionLabel || 'Continue',
            variant: 'primary',
          },
    isCompleteOverride: complete,
  })

  const steps = laneState.stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    description: stage.description,
    actionLabel: TRANSFER_WORKFLOW_TEMPLATE.find((item) => item.key === stage.key)?.actionLabel || null,
    status: stage.status,
    blocker: stage.blocker,
    stepId: stage.stepId || null,
    rawStatus: stage.rawStatus || 'not_started',
    completedAt: stage.completedAt || null,
  }))

  return {
    isLocked: laneState.isLocked,
    complete,
    registrationConfirmed: complete,
    currentStepKey: currentStep?.key || null,
    currentStepId: stepByKey.get(currentStep?.key || '')?.id || null,
    nextActionLabel: laneState.availableActions[0]?.label || null,
    summaryText: laneState.summaryText,
    steps,
    blockers: laneState.blockers,
    laneState,
    availableActions: laneState.availableActions,
    responsibleRoleLabel: 'Attorney + transaction owner',
  }
}
