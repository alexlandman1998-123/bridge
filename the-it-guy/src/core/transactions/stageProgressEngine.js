import { normalizeFinanceType } from './financeType'
import { MAIN_PROCESS_STAGES, MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from '../../lib/stages'

const STAGE_KEYS = [...MAIN_PROCESS_STAGES]
const STEP_STATUSES_STARTED = new Set(['in_progress', 'completed', 'blocked'])

function normalizeMainStage(mainStage, transactionStage, unitStatus = 'Available') {
  const explicit = String(mainStage || '')
    .trim()
    .toUpperCase()

  if (STAGE_KEYS.includes(explicit)) {
    return explicit
  }

  return getMainStageFromDetailedStage(transactionStage || unitStatus || 'Available')
}

function normalizeWorkflowStatus(status) {
  return String(status || '')
    .trim()
    .toLowerCase()
}

function toText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function parseDate(value) {
  const parsed = new Date(value || 0)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatRelativeUpdate(value) {
  const parsed = parseDate(value)
  if (!parsed) {
    return 'No recent updates'
  }

  const delta = Date.now() - parsed.getTime()
  if (!Number.isFinite(delta) || delta < 0) {
    return 'Updated just now'
  }

  const days = Math.floor(delta / (1000 * 60 * 60 * 24))
  if (days <= 0) {
    return 'Updated today'
  }
  if (days === 1) {
    return 'Updated 1 day ago'
  }
  return `Updated ${days} days ago`
}

function getLatestTimestamp(candidates = []) {
  let latest = null
  for (const value of candidates) {
    const parsed = parseDate(value)
    if (!parsed) {
      continue
    }

    if (!latest || parsed > latest) {
      latest = parsed
    }
  }

  return latest ? latest.toISOString() : null
}

function buildTask(stage, id, label, completed, blocker = label) {
  return {
    id,
    stage,
    label,
    completed: Boolean(completed),
    blocker,
  }
}

function findWorkflowSteps(subprocesses = [], processType) {
  const process = (subprocesses || []).find((item) => item?.process_type === processType)
  return process?.steps || []
}

function hasWorkflowStep(steps = [], keywords = [], { statuses = ['completed'] } = {}) {
  const normalizedKeywords = (keywords || []).map((item) => toText(item)).filter(Boolean)
  const allowedStatuses = new Set((statuses || []).map((item) => toText(item)))

  return steps.some((step) => {
    const haystack = `${step?.step_key || ''} ${step?.step_label || ''}`
    const matchesKeyword =
      !normalizedKeywords.length || normalizedKeywords.some((keyword) => toText(haystack).includes(keyword))
    if (!matchesKeyword) {
      return false
    }

    return allowedStatuses.has(normalizeWorkflowStatus(step?.status))
  })
}

function hasDocument(documents = [], keywords = []) {
  const normalizedKeywords = (keywords || []).map((item) => toText(item)).filter(Boolean)
  if (!normalizedKeywords.length) {
    return false
  }

  return (documents || []).some((document) => {
    const haystack = `${document?.name || ''} ${document?.category || ''} ${document?.document_type || ''} ${document?.stage_key || ''}`
    const normalizedHaystack = toText(haystack)
    return normalizedKeywords.some((keyword) => normalizedHaystack.includes(keyword))
  })
}

function getStageTasks({
  currentMainStage,
  transaction,
  unit,
  buyer,
  subprocesses = [],
  documents = [],
  requiredDocumentChecklist = [],
  onboardingStatus = '',
}) {
  const currentIndex = STAGE_KEYS.indexOf(currentMainStage)
  const financeType = normalizeFinanceType(transaction?.finance_type || 'cash', { allowUnknown: true })
  const isCashDeal = financeType === 'cash'
  const financeSteps = findWorkflowSteps(subprocesses, 'finance')
  const attorneySteps = findWorkflowSteps(subprocesses, 'attorney')
  const financeStepsCompleted = financeSteps.filter((step) => normalizeWorkflowStatus(step?.status) === 'completed').length
  const financeStepsStarted = financeSteps.filter((step) => STEP_STATUSES_STARTED.has(normalizeWorkflowStatus(step?.status))).length
  const attorneyStepsCompleted = attorneySteps.filter((step) => normalizeWorkflowStatus(step?.status) === 'completed').length
  const attorneyStepsStarted = attorneySteps.filter((step) => STEP_STATUSES_STARTED.has(normalizeWorkflowStatus(step?.status))).length
  const requiredCount = Number(requiredDocumentChecklist?.length || 0)
  const completedRequiredCount = (requiredDocumentChecklist || []).filter((item) => item?.complete).length
  const allRequiredDocumentsComplete = requiredCount > 0 ? completedRequiredCount === requiredCount : false
  const submittedStatuses = new Set(['submitted', 'reviewed', 'approved'])
  const onboardingSubmitted =
    submittedStatuses.has(toText(onboardingStatus)) ||
    Boolean(transaction?.onboarding_completed_at || transaction?.external_onboarding_submitted_at)

  const stageDoneFallback = (stageKey) => currentIndex > STAGE_KEYS.indexOf(stageKey)

  return [
    buildTask('AVAIL', 'unit-created', 'Unit created', Boolean(unit?.id)),
    buildTask('AVAIL', 'buyer-assigned', 'Buyer assigned', Boolean(transaction?.buyer_id || buyer?.name || buyer?.email)),

    buildTask('DEP', 'transaction-opened', 'Transaction created', Boolean(transaction?.id)),
    buildTask(
      'DEP',
      'deposit-recorded',
      'Deposit received',
      Number(transaction?.deposit_amount || 0) > 0 ||
        hasWorkflowStep(financeSteps, ['deposit', 'reservation'], { statuses: ['completed', 'in_progress'] }) ||
        stageDoneFallback('DEP'),
    ),

    buildTask(
      'OTP',
      'otp-signed',
      'OTP signed',
      hasDocument(documents, ['signed otp', 'otp signed', 'offer to purchase']) ||
        hasWorkflowStep(financeSteps, ['otp'], { statuses: ['completed'] }) ||
        stageDoneFallback('OTP'),
    ),
    buildTask(
      'OTP',
      'supporting-docs',
      'Core documents uploaded',
      onboardingSubmitted || completedRequiredCount > 0 || stageDoneFallback('OTP'),
    ),

    buildTask(
      'FIN',
      'bond-applied',
      'Bond applied',
      isCashDeal ||
        hasWorkflowStep(financeSteps, ['application', 'apply', 'submitted'], { statuses: ['completed', 'in_progress'] }) ||
        financeStepsStarted > 0 ||
        stageDoneFallback('FIN'),
    ),
    buildTask(
      'FIN',
      'bond-approved',
      'Bond approved',
      isCashDeal ||
        hasWorkflowStep(financeSteps, ['approved', 'approval', 'granted'], { statuses: ['completed'] }) ||
        stageDoneFallback('FIN'),
    ),

    buildTask(
      'ATTY',
      'fica-complete',
      'FICA complete',
      hasWorkflowStep(attorneySteps, ['fica'], { statuses: ['completed'] }) ||
        allRequiredDocumentsComplete ||
        stageDoneFallback('ATTY'),
    ),
    buildTask(
      'ATTY',
      'transfer-docs-ready',
      'Transfer documents signed/prepared',
      hasWorkflowStep(attorneySteps, ['document', 'prepared', 'signed', 'prep'], { statuses: ['completed'] }) ||
        stageDoneFallback('ATTY'),
    ),

    buildTask(
      'XFER',
      'lodged',
      'Lodgement completed',
      hasWorkflowStep(attorneySteps, ['lodged', 'lodgement'], { statuses: ['completed'] }) ||
        toText(transaction?.stage).includes('lodged') ||
        stageDoneFallback('XFER'),
    ),
    buildTask(
      'XFER',
      'transfer-running',
      'Transfer in progress',
      currentIndex >= STAGE_KEYS.indexOf('XFER') ||
        hasWorkflowStep(attorneySteps, ['transfer'], { statuses: ['completed', 'in_progress'] }) ||
        attorneyStepsStarted > 0,
    ),

    buildTask(
      'REG',
      'registered',
      'Registered at deeds office',
      currentMainStage === 'REG' || toText(transaction?.stage).includes('registered'),
    ),
    buildTask(
      'REG',
      'workflow-closed',
      'Closeout completed',
      currentMainStage === 'REG' && (attorneySteps.length === 0 || attorneyStepsCompleted >= attorneySteps.length),
    ),
  ]
}

function summarizeStage(tasks) {
  const total = tasks.length || 1
  const completed = tasks.filter((task) => task.completed).length
  return {
    completed,
    total,
    progress: completed / total,
    progressPercent: Math.round((completed / total) * 100),
    blockers: tasks.filter((task) => !task.completed).map((task) => task.blocker),
    tasks,
  }
}

function uniqueList(values = []) {
  return [...new Set((values || []).filter(Boolean))]
}

export function buildTransactionStageProgressModel({
  mainStage = 'AVAIL',
  transaction = null,
  unit = null,
  buyer = null,
  subprocesses = [],
  documents = [],
  requiredDocumentChecklist = [],
  onboardingStatus = '',
  comments = [],
  updatedAt = null,
} = {}) {
  const resolvedMainStage = normalizeMainStage(mainStage, transaction?.stage, unit?.status)
  const stageTasks = getStageTasks({
    currentMainStage: resolvedMainStage,
    transaction,
    unit,
    buyer,
    subprocesses,
    documents,
    requiredDocumentChecklist,
    onboardingStatus,
  })

  const stageSummaryByKey = STAGE_KEYS.reduce((accumulator, stageKey) => {
    const tasks = stageTasks.filter((task) => task.stage === stageKey)
    accumulator[stageKey] = summarizeStage(tasks)
    return accumulator
  }, {})

  const overallProgress =
    Math.round(
      (STAGE_KEYS.reduce((sum, stageKey) => sum + Number(stageSummaryByKey[stageKey]?.progress || 0), 0) / STAGE_KEYS.length) * 100,
    ) || 0

  const currentIndex = Math.max(0, STAGE_KEYS.indexOf(resolvedMainStage))

  const transitionBlockersByStage = STAGE_KEYS.reduce((accumulator, stageKey) => {
    const stageIndex = STAGE_KEYS.indexOf(stageKey)
    if (stageIndex <= currentIndex) {
      accumulator[stageKey] = []
      return accumulator
    }

    const prerequisiteStages = STAGE_KEYS.slice(0, stageIndex)
    const blockers = prerequisiteStages.flatMap((key) => stageSummaryByKey[key]?.blockers || [])
    accumulator[stageKey] = uniqueList(blockers)
    return accumulator
  }, {})

  const stepBlockersByStage = STAGE_KEYS.reduce((accumulator, stageKey) => {
    const stageIndex = STAGE_KEYS.indexOf(stageKey)
    if (stageIndex > currentIndex) {
      accumulator[stageKey] = transitionBlockersByStage[stageKey] || []
      return accumulator
    }

    accumulator[stageKey] = stageSummaryByKey[stageKey]?.blockers || []
    return accumulator
  }, {})

  const latestUpdatedAt = getLatestTimestamp([
    updatedAt,
    transaction?.updated_at,
    transaction?.created_at,
    ...(subprocesses || [])
      .flatMap((process) => process?.steps || [])
      .flatMap((step) => [step?.updated_at, step?.completed_at]),
    ...(comments || []).flatMap((item) => [item?.createdAt, item?.created_at]),
  ])

  const requiredStageBlockers = stageSummaryByKey[resolvedMainStage]?.blockers || []
  const isAtRisk = overallProgress < Math.max(20, Math.round(((currentIndex + 1) / STAGE_KEYS.length) * 100) - 25)

  return {
    mainStage: resolvedMainStage,
    mainStageLabel: MAIN_STAGE_LABELS[resolvedMainStage] || resolvedMainStage,
    stageTasks,
    stageSummaryByKey,
    totalProgressPercent: Math.max(0, Math.min(100, overallProgress)),
    transitionBlockersByStage,
    stepBlockersByStage,
    latestUpdatedAt,
    latestUpdatedLabel: formatRelativeUpdate(latestUpdatedAt),
    currentStageBlockers: requiredStageBlockers,
    isAtRisk,
    canMoveTo(targetStage) {
      const normalizedTarget = normalizeMainStage(targetStage, targetStage, 'Available')
      const targetIndex = STAGE_KEYS.indexOf(normalizedTarget)
      if (targetIndex === -1) {
        return false
      }
      if (targetIndex <= currentIndex) {
        return true
      }
      return (transitionBlockersByStage[normalizedTarget] || []).length === 0
    },
    getTransitionBlockers(targetStage) {
      const normalizedTarget = normalizeMainStage(targetStage, targetStage, 'Available')
      const targetIndex = STAGE_KEYS.indexOf(normalizedTarget)
      if (targetIndex === -1 || targetIndex <= currentIndex) {
        return []
      }
      return transitionBlockersByStage[normalizedTarget] || []
    },
  }
}

