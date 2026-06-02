export const TRANSACTION_LIFECYCLE_STAGE_ORDER = [
  'confirmed',
  'otp',
  'finance',
  'transfer',
  'registration',
]

export const TRANSACTION_LIFECYCLE_STAGE_LABELS = {
  confirmed: 'Confirmed',
  otp: 'OTP',
  finance: 'Finance',
  transfer: 'Transfer',
  registration: 'Registration',
}

export const USE_TRANSACTION_ROLLUP_OVERVIEW =
  ['1', 'true', 'yes', 'on'].includes(
    String(
      import.meta.env?.VITE_USE_WORKFLOW_ROLLUP_OVERVIEW ??
        import.meta.env?.USE_WORKFLOW_ROLLUP_OVERVIEW ??
        import.meta.env?.VITE_USE_TRANSACTION_ROLLUP_OVERVIEW ??
        import.meta.env?.USE_TRANSACTION_ROLLUP_OVERVIEW ??
        '',
    )
      .trim()
      .toLowerCase(),
  )

export const USE_WORKFLOW_ROLLUP_OVERVIEW = USE_TRANSACTION_ROLLUP_OVERVIEW

const LEGACY_MAIN_STAGE_MAP = {
  AVAIL: 'confirmed',
  NEW: 'confirmed',
  DEP: 'confirmed',
  DEPOSIT: 'confirmed',
  RESERVED: 'confirmed',
  CONFIRMED: 'confirmed',
  OTP: 'otp',
  FIN: 'finance',
  FINANCE: 'finance',
  TRANSFER: 'transfer',
  ATTY: 'transfer',
  ATTORNEY: 'transfer',
  XFER: 'transfer',
  REGISTRATION: 'registration',
  REG: 'registration',
  COMPLETE: 'registration',
  CANCELLED: 'registration',
  REGISTERED: 'registration',
}

const ROLLUP_PARENT_STAGE_MAP = {
  SETUP: 'confirmed',
  SALES_OTP: 'otp',
  FINANCE: 'finance',
  TRANSFER: 'transfer',
  REGISTRATION: 'registration',
  COMPLETE: 'registration',
  CANCELLED: 'registration',
}

const LIFECYCLE_STAGE_TO_ROLLUP_PARENT_STAGE = {
  confirmed: 'SETUP',
  otp: 'SALES_OTP',
  finance: 'FINANCE',
  transfer: 'TRANSFER',
  registration: 'REGISTRATION',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s/-]+/g, '_')
}

function toTitleLabel(value = '') {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

export function normalizeTransactionLifecycleStage(value, fallback = 'confirmed') {
  const raw = normalizeText(value)
  if (!raw) return fallback

  const lower = normalizeKey(raw)
  if (TRANSACTION_LIFECYCLE_STAGE_ORDER.includes(lower)) return lower

  const upper = raw.toUpperCase()
  if (LEGACY_MAIN_STAGE_MAP[upper]) return LEGACY_MAIN_STAGE_MAP[upper]

  if (/registered|registration|deeds|lodged|lodgement/.test(lower)) return 'registration'
  if (/attorney|transfer|instruction|fica|draft|sign|guarantee/.test(lower)) return 'transfer'
  if (/finance|bond|cash|fund|application|quote|approval|instruction_sent/.test(lower)) return 'finance'
  if (/otp|offer|purchase_agreement|sale_agreement/.test(lower)) return 'otp'
  return fallback
}

export function formatTransactionRollupStageLabel(value = '') {
  const normalized = normalizeText(value).toUpperCase()
  return normalized ? toTitleLabel(normalized.toLowerCase()) : 'Workflow'
}

export function formatTransactionRollupStatusLabel(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return 'Not started'
  if (normalized === 'ready_for_handoff') return 'Ready for handoff'
  return toTitleLabel(normalized)
}

export function mapRollupParentStageToLifecycleStage(value = '', fallback = 'confirmed') {
  const normalized = normalizeText(value).toUpperCase()
  return ROLLUP_PARENT_STAGE_MAP[normalized] || fallback
}

function mapLifecycleStageToRollupParentStage(value = '', fallback = 'SETUP') {
  return LIFECYCLE_STAGE_TO_ROLLUP_PARENT_STAGE[normalizeTransactionLifecycleStage(value, 'confirmed')] || fallback
}

function resolveMainStage(transaction = {}, explicitStage = '') {
  const currentMainStage =
    explicitStage ||
    transaction?.transactionLifecycleStage ||
    transaction?.transaction_lifecycle_stage ||
    transaction?.lifecycleWorkflow?.currentStage ||
    transaction?.lifecycle_workflow?.current_stage ||
    transaction?.current_lifecycle_stage ||
    transaction?.current_main_stage ||
    transaction?.mainStage ||
    transaction?.main_stage

  const combinedSignal = [
    transaction?.stage,
    transaction?.current_sub_stage_summary,
    transaction?.attorney_stage,
    transaction?.operational_state,
    transaction?.lifecycle_state,
  ].filter(Boolean).join(' ')

  return normalizeTransactionLifecycleStage(currentMainStage || combinedSignal)
}

function formatSubStatusLabel(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  return text
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .replace(/\bOtp\b/g, 'OTP')
    .replace(/\bFica\b/g, 'FICA')
}

function mapRollupStatusToLifecycleStatus(value = '', parentStage = '') {
  const normalized = normalizeKey(value)
  const normalizedParentStage = normalizeText(parentStage).toUpperCase()
  if (normalizedParentStage === 'COMPLETE') return 'completed'
  if (normalized === 'blocked') return 'blocked'
  return 'active'
}

function mapWorkflowKeyToLifecycleStage(value = '', fallback = 'confirmed') {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (normalized === 'sales_otp') return 'otp'
  if (normalized.startsWith('finance_') || normalized === 'finance') return 'finance'
  if (
    ['transfer', 'attorney_transfer', 'attorney_bond', 'seller_bond_cancellation'].includes(normalized)
  ) {
    return 'transfer'
  }
  if (normalized === 'registration') return 'registration'
  return fallback
}

function buildRollupBlockersByStage(rollup = {}, currentStage = 'confirmed') {
  const blockersByStage = {}
  const blockedStages = Array.isArray(rollup?.blockedStages) ? rollup.blockedStages : []

  for (const blocker of rollup?.blockers || []) {
    const lifecycleStage =
      mapWorkflowKeyToLifecycleStage(
        blocker?.workflowKey,
        blockedStages.length
          ? mapRollupParentStageToLifecycleStage(blockedStages[0], currentStage)
          : currentStage,
      )
    if (!blockersByStage[lifecycleStage]) blockersByStage[lifecycleStage] = []
    if (blocker?.message) blockersByStage[lifecycleStage].push(blocker.message)
  }

  for (const blockedStage of blockedStages) {
    const lifecycleStage = mapRollupParentStageToLifecycleStage(blockedStage, currentStage)
    if (!blockersByStage[lifecycleStage] || !blockersByStage[lifecycleStage].length) {
      blockersByStage[lifecycleStage] = ['Blocked']
    }
  }

  return blockersByStage
}

export function buildTransactionLifecycleSummaryFromRollup(rollup = {}, options = {}) {
  if (!rollup || typeof rollup !== 'object') return null

  const parentStage = normalizeText(rollup.parentStage).toUpperCase()
  const currentStage = mapRollupParentStageToLifecycleStage(parentStage || 'SETUP')
  const lifecycleStatus = mapRollupStatusToLifecycleStatus(rollup.parentStatus, parentStage)
  const blockersByStage = buildRollupBlockersByStage(rollup, currentStage)
  const currentStageIndex = TRANSACTION_LIFECYCLE_STAGE_ORDER.indexOf(currentStage)
  const isComplete = parentStage === 'COMPLETE'

  return {
    transactionId: normalizeText(rollup.transactionId || options.transactionId),
    currentStage,
    status: lifecycleStatus,
    progressPercent: Number.isFinite(Number(rollup.progressPercent)) ? Number(rollup.progressPercent) : 0,
    stages: TRANSACTION_LIFECYCLE_STAGE_ORDER.map((stage, index) => {
      const blocked = Array.isArray(blockersByStage[stage]) && blockersByStage[stage].length > 0
      let state = 'upcoming'
      if (isComplete) {
        state = 'completed'
      } else if (index < currentStageIndex || (currentStage === 'confirmed' && stage === 'confirmed' && parentStage !== 'SETUP')) {
        state = 'completed'
      } else if (index === currentStageIndex) {
        state = blocked ? 'blocked' : 'current'
      }

      return {
        key: stage,
        label: TRANSACTION_LIFECYCLE_STAGE_LABELS[stage],
        state,
      }
    }),
    subStatus: rollup?.nextAction?.label
      ? {
          module: currentStage,
          label: rollup.nextAction.label,
          workflowType: formatTransactionRollupStageLabel(parentStage),
          currentSubStage: rollup.nextAction.label,
        }
      : null,
    blockersByStage,
    lastUpdatedAt:
      rollup?.lastWorkflowUpdatedAt ||
      rollup?.derivedAt ||
      options.fallbackUpdatedAt ||
      null,
    rollupParentStage: parentStage || mapLifecycleStageToRollupParentStage(currentStage),
    rollupParentStatus: normalizeKey(rollup.parentStatus),
  }
}

function getCurrentStepFromProcess(process = {}) {
  const steps = Array.isArray(process?.steps) ? process.steps : []
  const current =
    steps.find((step) => ['active', 'in_progress', 'current'].includes(normalizeKey(step?.status || step?.step_status))) ||
    steps.find((step) => !['completed', 'complete'].includes(normalizeKey(step?.status || step?.step_status))) ||
    steps[steps.length - 1]
  return current?.step_label || current?.label || current?.step_key || current?.key || ''
}

function getSubStatusForStage({ currentStage, transaction = {}, subprocesses = [] } = {}) {
  const processForStage = subprocesses.find((process) => {
    const type = normalizeKey(process?.process_type || process?.type)
    if (currentStage === 'finance') return ['finance', 'bond', 'bond_originator', 'cash'].includes(type)
    if (currentStage === 'transfer') return ['transfer', 'attorney'].includes(type)
    if (currentStage === 'registration') return ['registration'].includes(type)
    if (currentStage === 'otp') return ['otp', 'sales'].includes(type)
    return false
  })

  if (processForStage) {
    const workflowType = formatSubStatusLabel(processForStage.workflow_type || processForStage.process_type || processForStage.type)
    const currentSubStage = formatSubStatusLabel(
      getCurrentStepFromProcess(processForStage) ||
        processForStage.currentStageLabel ||
        processForStage.current_stage_label ||
        processForStage.currentStage ||
        processForStage.current_stage ||
        processForStage.summary?.currentStageLabel ||
        processForStage.summary?.currentStage,
    )
    if (currentSubStage) {
      return {
        module: currentStage,
        label: workflowType && workflowType !== currentSubStage ? `${workflowType} - ${currentSubStage}` : currentSubStage,
        workflowType,
        currentSubStage,
      }
    }
  }

  const explicitSubStatus = formatSubStatusLabel(
    transaction?.current_sub_stage_summary ||
      transaction?.subStatus ||
      transaction?.sub_status ||
      transaction?.attorney_stage ||
      transaction?.stage,
  )
  if (!explicitSubStatus) return null

  return {
    module: currentStage,
    label: explicitSubStatus,
    currentSubStage: explicitSubStatus,
  }
}

export function buildTransactionLifecycleSummary({
  transaction = {},
  currentStage = '',
  mainStage = '',
  subprocesses = [],
  status = '',
} = {}) {
  const resolvedStage = normalizeTransactionLifecycleStage(currentStage || resolveMainStage(transaction, mainStage))
  const currentIndex = TRANSACTION_LIFECYCLE_STAGE_ORDER.indexOf(resolvedStage)
  const normalizedStatus = normalizeKey(status || transaction?.transaction_lifecycle_status || transaction?.lifecycleWorkflow?.status || transaction?.lifecycle_state)
  const lifecycleStatus =
    ['blocked', 'completed'].includes(normalizedStatus)
      ? normalizedStatus
      : normalizedStatus === 'registered' && resolvedStage === 'registration'
        ? 'completed'
        : 'active'

  return {
    transactionId: normalizeText(transaction?.id || transaction?.transaction_id || transaction?.transactionId),
    currentStage: resolvedStage,
    status: lifecycleStatus,
    progressPercent:
      TRANSACTION_LIFECYCLE_STAGE_ORDER.length > 1
        ? Math.round((currentIndex / (TRANSACTION_LIFECYCLE_STAGE_ORDER.length - 1)) * 100)
        : 0,
    stages: TRANSACTION_LIFECYCLE_STAGE_ORDER.map((stage, index) => ({
      key: stage,
      label: TRANSACTION_LIFECYCLE_STAGE_LABELS[stage],
      state:
        lifecycleStatus === 'blocked' && index === currentIndex
          ? 'blocked'
          : lifecycleStatus === 'completed' || index < currentIndex
            ? 'completed'
            : index === currentIndex
              ? 'current'
              : 'upcoming',
    })),
    subStatus: getSubStatusForStage({ currentStage: resolvedStage, transaction, subprocesses }),
    lastUpdatedAt: transaction?.updated_at || transaction?.updatedAt || null,
  }
}
