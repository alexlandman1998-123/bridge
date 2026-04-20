import { normalizeFinanceType } from './financeType'
import { getFinanceStageDefinitions, WORKFLOW_LANE_DEFINITIONS } from '../workflows/definitions'
import { buildWorkflowLaneSnapshot } from '../workflows/engine'

export const FINANCE_STEP_STATUS_META = {
  completed: {
    label: 'Completed',
    tone: 'success',
  },
  current: {
    label: 'In Progress',
    tone: 'active',
  },
  upcoming: {
    label: 'Upcoming',
    tone: 'muted',
  },
  locked: {
    label: 'Locked',
    tone: 'muted',
  },
  blocked: {
    label: 'Blocked',
    tone: 'warning',
  },
}

export function getFinanceWorkflowTemplate(financeType) {
  return getFinanceStageDefinitions(financeType)
}

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

export function resolveFinanceWorkflowSnapshot({
  financeType = 'cash',
  subprocesses = [],
  salesReadyForFinance = false,
  salesBlockers = [],
  permissions = null,
} = {}) {
  const normalizedFinanceType = normalizeFinanceType(financeType || 'cash')
  const template = getFinanceWorkflowTemplate(normalizedFinanceType)
  const financeProcess = (subprocesses || []).find((item) => item?.process_type === 'finance') || null
  const stepByKey = new Map((financeProcess?.steps || []).map((step) => [step.step_key, step]))
  const firstPendingIndex = template.findIndex((step) => (stepByKey.get(step.key)?.status || 'not_started') !== 'completed')
  const complete = firstPendingIndex === -1
  const currentStep = complete ? null : template[firstPendingIndex]

  const sourceStatusByStageKey = {}
  const sourceStageMetaByKey = {}
  const stageBlockersByKey = {}

  template.forEach((definition, index) => {
    const source = stepByKey.get(definition.key) || null
    const rawStatus = String(source?.status || 'not_started').trim().toLowerCase()
    const isCompleted = rawStatus === 'completed'
    const isCurrent = !complete && index === firstPendingIndex
    const isLocked = !salesReadyForFinance && !isCompleted

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
        ? 'Finance workflow will unlock once Sales Workflow is completed.'
        : rawStatus === 'blocked'
          ? String(source?.comment || '').trim() || 'This step is blocked and needs follow-up before continuing.'
          : ''
  })

  const laneState = buildWorkflowLaneSnapshot({
    laneKey: WORKFLOW_LANE_DEFINITIONS.finance.key,
    laneLabel: WORKFLOW_LANE_DEFINITIONS.finance.label,
    stageDefinitions: template,
    sourceStatusByStageKey,
    sourceStageMetaByKey,
    lockState: {
      isLocked: !salesReadyForFinance,
      message: 'Finance workflow will unlock once Sales Workflow is completed.',
      blockers: salesReadyForFinance ? [] : salesBlockers || [],
    },
    stageBlockersByKey,
    permissions,
    nextAction:
      !salesReadyForFinance || complete || !currentStep
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
    actionLabel: template.find((item) => item.key === stage.key)?.actionLabel || null,
    status: stage.status,
    blocker: stage.blocker,
    stepId: stage.stepId || null,
    rawStatus: stage.rawStatus || 'not_started',
    completedAt: stage.completedAt || null,
  }))

  return {
    financeType: normalizedFinanceType,
    isLocked: laneState.isLocked,
    complete,
    readyForTransfer: complete,
    currentStepKey: currentStep?.key || null,
    currentStepId: stepByKey.get(currentStep?.key || '')?.id || null,
    nextActionLabel: laneState.availableActions[0]?.label || null,
    summaryText: laneState.summaryText,
    steps,
    blockers: laneState.blockers,
    laneState,
    availableActions: laneState.availableActions,
    responsibleRoleLabel:
      normalizedFinanceType === 'cash'
        ? 'Transaction owner'
        : normalizedFinanceType === 'bond'
          ? 'Bond originator / transaction owner'
          : 'Bond originator + transaction owner',
  }
}
