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
  ATTY: 'transfer',
  ATTORNEY: 'transfer',
  XFER: 'transfer',
  TRANSFER: 'transfer',
  REG: 'registration',
  REGISTERED: 'registration',
  REGISTRATION: 'registration',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s/-]+/g, '_')
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
