import { getMainStageFromDetailedStage, getStageIndex, MAIN_PROCESS_STAGES, STAGES, normalizeStageLabel } from './stageConfig'
import { normalizeFinanceType } from './financeType'

const OVERVIEW_MILESTONE_INDEX_BY_MAIN_STAGE = {
  AVAIL: 0,
  DEP: 1,
  OTP: 2,
  FIN: 3,
  ATTY: 5,
  XFER: 6,
  REG: 7,
}

function normalizeMainStageForSelector(currentMainStage, detailedStage) {
  const normalized = String(currentMainStage || '')
    .trim()
    .toUpperCase()

  if (MAIN_PROCESS_STAGES.includes(normalized)) {
    return normalized
  }

  return getMainStageFromDetailedStage(detailedStage)
}

function getNextDetailedStageLabel(detailedStage) {
  const index = getStageIndex(detailedStage)
  if (index >= STAGES.length - 1) {
    return 'Handover Complete'
  }

  return STAGES[index + 1]
}

function getWaitingStepLabel(summary) {
  return String(summary?.waitingStep?.step_label || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatLaneNextStep(label, lanePrefix) {
  const cleanedLabel = String(label || '').trim()
  if (!cleanedLabel) {
    return ''
  }

  return `${lanePrefix}: ${cleanedLabel}`
}

function deriveOverallWorkflowNextStep({
  resolvedMainStage,
  normalizedDetailedStage,
  financeType,
  financeSummary,
  attorneySummary,
  transactionDetail,
} = {}) {
  const financeWaitingLabel = getWaitingStepLabel(financeSummary)
  const attorneyWaitingLabel = getWaitingStepLabel(attorneySummary)
  const hasBondComponent = financeType === 'bond' || financeType === 'combination'
  const hasCashComponent = financeType === 'cash' || financeType === 'combination'
  const hasBuyer = Boolean(transactionDetail?.buyer_id)

  if (resolvedMainStage === 'AVAIL') {
    return hasBuyer ? 'Receive reservation deposit and open OTP' : 'Assign buyer and issue onboarding'
  }

  if (resolvedMainStage === 'DEP') {
    if (normalizedDetailedStage === 'Deposit Paid') {
      if (hasBondComponent && hasCashComponent) {
        return 'Confirm cash contribution and open the bond application workflow'
      }
      if (hasBondComponent) {
        return 'Open the finance workflow and collect bond application documents'
      }
      if (hasCashComponent) {
        return 'Finalise OTP and verify proof of funds'
      }
    }

    return 'Receive deposit and prepare OTP for signature'
  }

  if (resolvedMainStage === 'OTP') {
    if (hasBondComponent && financeWaitingLabel) {
      return formatLaneNextStep(financeWaitingLabel, 'Finance next')
    }

    if (hasBondComponent && hasCashComponent) {
      return 'Collect proof of funds and submit the bond application'
    }

    if (hasBondComponent) {
      return 'Collect finance documents and submit the bond application'
    }

    if (hasCashComponent) {
      return 'Collect proof of funds and clear the deal for attorney instruction'
    }

    return 'Complete onboarding and confirm funding readiness'
  }

  if (resolvedMainStage === 'FIN') {
    if (hasBondComponent && financeWaitingLabel) {
      return formatLaneNextStep(financeWaitingLabel, 'Finance next')
    }

    if (hasBondComponent && attorneyWaitingLabel) {
      return formatLaneNextStep(attorneyWaitingLabel, 'Attorney next')
    }

    if (hasBondComponent && hasCashComponent) {
      return 'Confirm the cash contribution and issue attorney instruction'
    }

    if (hasBondComponent) {
      return 'Issue attorney instruction and prepare the transfer file'
    }

    if (normalizedDetailedStage === 'Bond Approved / Proof of Funds' && attorneyWaitingLabel) {
      return formatLaneNextStep(attorneyWaitingLabel, 'Attorney next')
    }

    if (normalizedDetailedStage === 'Bond Approved / Proof of Funds') {
      return 'Issue attorney instruction and prepare the transfer file'
    }

    return 'Verify proof of funds and clear the deal for conveyancing'
  }

  if (resolvedMainStage === 'ATTY' || resolvedMainStage === 'XFER') {
    if (attorneyWaitingLabel) {
      return formatLaneNextStep(attorneyWaitingLabel, 'Attorney next')
    }

    if (normalizedDetailedStage === 'Proceed to Attorneys') {
      return 'Prepare transfer documents and collect signatures'
    }

    if (normalizedDetailedStage === 'Transfer in Progress') {
      return 'Submit lodgement and track registration readiness'
    }

    if (normalizedDetailedStage === 'Transfer Lodged') {
      return 'Confirm registration and complete close-out'
    }

    return 'Progress the transfer workflow to registration'
  }

  if (resolvedMainStage === 'REG') {
    return 'Complete registration close-out and handover'
  }

  return getNextDetailedStageLabel(normalizedDetailedStage)
}

function hasCompletedFinanceBondCheckpoint(financeSummary) {
  const steps = financeSummary?.steps || []
  if (!steps.length) {
    return false
  }

  return steps.some(
    (step) =>
      step?.status === 'completed' &&
      ['bond_approved', 'grant_signed', 'bond_instruction_sent_to_attorneys'].includes(step?.step_key),
  )
}

export function getOverviewMilestoneIndex({
  currentMainStage,
  detailedStage,
  financeSummary = null,
} = {}) {
  const resolvedMainStage = normalizeMainStageForSelector(currentMainStage, detailedStage)

  if (resolvedMainStage === 'FIN') {
    const normalizedDetailedStage = normalizeStageLabel(detailedStage)
    const bondCheckpointReached =
      hasCompletedFinanceBondCheckpoint(financeSummary) ||
      normalizedDetailedStage === 'Bond Approved / Proof of Funds'

    return bondCheckpointReached ? 4 : 3
  }

  if (Object.prototype.hasOwnProperty.call(OVERVIEW_MILESTONE_INDEX_BY_MAIN_STAGE, resolvedMainStage)) {
    return OVERVIEW_MILESTONE_INDEX_BY_MAIN_STAGE[resolvedMainStage]
  }

  return OVERVIEW_MILESTONE_INDEX_BY_MAIN_STAGE.AVAIL
}

export function selectReportStageSummary({
  detailedStage,
  currentMainStage,
  transactionDetail = {},
  subprocessByType = {},
  latestOperationalNote = null,
} = {}) {
  const normalizedDetailedStage = normalizeStageLabel(detailedStage)
  const resolvedMainStage = normalizeMainStageForSelector(currentMainStage, normalizedDetailedStage)
  const financeSummary = subprocessByType?.finance?.summary || null
  const attorneySummary = subprocessByType?.attorney?.summary || null
  const financeType = normalizeFinanceType(transactionDetail?.finance_type, { allowUnknown: true })

  const activeSummary =
    resolvedMainStage === 'FIN'
      ? financeSummary
      : ['ATTY', 'XFER', 'REG'].includes(resolvedMainStage)
        ? attorneySummary
        : null

  const waitingStepLabel = activeSummary?.waitingStep?.step_label || null
  const waitingComment = activeSummary?.waitingStep?.comment?.trim() || null
  const overallNextStep = deriveOverallWorkflowNextStep({
    resolvedMainStage,
    normalizedDetailedStage,
    financeType,
    financeSummary,
    attorneySummary,
    transactionDetail,
  })
  const workflowComment =
    waitingComment ||
    (waitingStepLabel ? `Waiting for ${String(waitingStepLabel).toLowerCase()}` : activeSummary ? 'Workflow complete' : null) ||
    transactionDetail?.comment ||
    transactionDetail?.current_sub_stage_summary ||
    latestOperationalNote ||
    null

  return {
    currentMainStage: resolvedMainStage,
    financeSummary,
    attorneySummary,
    activeSummary,
    workflowComment,
    stageDate: activeSummary?.lastCompletedStep?.completed_at || transactionDetail?.stage_date || null,
    lastCompletedStep: activeSummary?.lastCompletedStep?.step_label || normalizedDetailedStage,
    nextStep: overallNextStep || waitingStepLabel || getNextDetailedStageLabel(normalizedDetailedStage),
    milestoneIndex: getOverviewMilestoneIndex({
      currentMainStage: resolvedMainStage,
      detailedStage: normalizedDetailedStage,
      financeSummary,
    }),
  }
}
