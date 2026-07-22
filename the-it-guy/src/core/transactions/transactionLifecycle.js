export const TRANSACTION_LIFECYCLE_STAGE_ORDER = [
  'instruction',
  'documents',
  'finance',
  'transfer_duty',
  'lodgement',
  'registration',
  'post_registration',
]

export const TRANSACTION_LIFECYCLE_STAGE_LABELS = {
  instruction: 'Instruction',
  documents: 'Documents',
  finance: 'Finance',
  transfer_duty: 'Transfer Duty',
  lodgement: 'Lodgement',
  registration: 'Registration',
  post_registration: 'Post Registration',
}

export const TRANSACTION_LIFECYCLE_STAGE_HELPER_TEXT = {
  instruction: 'Buyer onboarding must be completed before this workflow can continue.',
  documents: 'Gather and verify the required buyer, seller, property, and attorney documents.',
  finance: 'Finance approvals, proof of funds, bond grants, and guarantees are tracked here.',
  transfer_duty: 'Rates clearance, levy clearance, and transfer duty must be cleared before lodgement.',
  lodgement: 'The matter is being prepared for or lodged at the Deeds Office.',
  registration: 'Registration is being captured and confirmed.',
  post_registration: 'Final reports, handover, and close-out actions are being completed.',
}

const TERMINAL_LIFECYCLE_STATES = new Set(['registered', 'completed', 'archived'])

export const USE_TRANSACTION_ROLLUP_OVERVIEW =
  (() => {
    const rawValue =
      import.meta.env?.VITE_USE_WORKFLOW_ROLLUP_OVERVIEW ??
      import.meta.env?.USE_WORKFLOW_ROLLUP_OVERVIEW ??
      import.meta.env?.VITE_USE_TRANSACTION_ROLLUP_OVERVIEW ??
      import.meta.env?.USE_TRANSACTION_ROLLUP_OVERVIEW ??
      ''

    const normalized = String(rawValue).trim().toLowerCase()
    if (!normalized) return true
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)
  })()

export const USE_WORKFLOW_ROLLUP_OVERVIEW = USE_TRANSACTION_ROLLUP_OVERVIEW

const LEGACY_MAIN_STAGE_MAP = {
  AVAIL: 'instruction',
  NEW: 'instruction',
  DEP: 'instruction',
  DEPOSIT: 'instruction',
  RESERVED: 'instruction',
  RESERVATION: 'instruction',
  CONFIRMED: 'instruction',
  OTP: 'instruction',
  FIN: 'finance',
  FINANCE: 'finance',
  TRANSFER: 'transfer_duty',
  ATTY: 'documents',
  ATTORNEY: 'documents',
  XFER: 'transfer_duty',
  LODGEMENT: 'lodgement',
  LODGED: 'lodgement',
  REGISTRATION: 'registration',
  REG: 'registration',
  COMPLETE: 'post_registration',
  COMPLETED: 'post_registration',
  CANCELLED: 'post_registration',
  CANCELED: 'post_registration',
  REGISTERED: 'registration',
}

const ROLLUP_PARENT_STAGE_MAP = {
  SETUP: 'instruction',
  SALES_OTP: 'instruction',
  FINANCE: 'finance',
  TRANSFER: 'transfer_duty',
  REGISTRATION: 'registration',
  COMPLETE: 'post_registration',
  CANCELLED: 'post_registration',
}

const LIFECYCLE_STAGE_TO_ROLLUP_PARENT_STAGE = {
  instruction: 'SETUP',
  documents: 'TRANSFER',
  finance: 'FINANCE',
  transfer_duty: 'TRANSFER',
  lodgement: 'REGISTRATION',
  registration: 'REGISTRATION',
  post_registration: 'COMPLETE',
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

export function normalizeTransactionLifecycleStage(value, fallback = 'instruction') {
  const raw = normalizeText(value)
  if (!raw) return fallback

  const lower = normalizeKey(raw)
  if (TRANSACTION_LIFECYCLE_STAGE_ORDER.includes(lower)) return lower

  const upper = raw.toUpperCase()
  if (LEGACY_MAIN_STAGE_MAP[upper]) return LEGACY_MAIN_STAGE_MAP[upper]

  if (/rates|levy|clearance|transfer.?duty|sars/.test(lower)) return 'transfer_duty'
  if (/lodg|deeds/.test(lower)) return 'lodgement'
  if (/registered|registration_confirmed|registration_completed/.test(lower)) return 'registration'
  if (/final|close.?out|handover|archive.?ready|completed|complete/.test(lower)) return 'post_registration'
  if (/missing.?docs|missing.?documents|fica|mandate|document|documents|signed.?mandate/.test(lower)) return 'documents'
  if (/finance|bond|cash|fund|application|quote|approval|grant|guarantee|instruction_sent/.test(lower)) return 'finance'
  if (/attorney|transfer|instruction|buyer.?onboarding|reservation|reserved|otp|offer|purchase_agreement|sale_agreement/.test(lower)) return 'instruction'
  return fallback
}

export function normalizeMatterLifecycleStage(value, fallback = 'instruction') {
  return normalizeTransactionLifecycleStage(value, fallback)
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

export function mapRollupParentStageToLifecycleStage(value = '', fallback = 'instruction') {
  const normalized = normalizeText(value).toUpperCase()
  return ROLLUP_PARENT_STAGE_MAP[normalized] || fallback
}

function mapLifecycleStageToRollupParentStage(value = '', fallback = 'SETUP') {
  return LIFECYCLE_STAGE_TO_ROLLUP_PARENT_STAGE[normalizeTransactionLifecycleStage(value, 'instruction')] || fallback
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

function normalizeFinanceKind(transaction = {}) {
  const signal = normalizeKey([
    transaction?.finance_type,
    transaction?.financeType,
    transaction?.payment_method,
    transaction?.paymentMethod,
    transaction?.finance_status,
    transaction?.financeStatus,
  ].filter(Boolean).join(' '))
  if (/(combination|hybrid|cash_and_bond|cash_bond)/.test(signal)) return 'bond'
  if (/(bond|mortgage|loan|originator)/.test(signal)) return 'bond'
  if (/(cash|proof_of_funds|funds)/.test(signal)) return 'cash'
  if (Number(transaction?.bond_amount || transaction?.bondAmount || 0) > 0) return 'bond'
  return 'unknown'
}

function hasRequiredBondFinance(transaction = {}, subprocesses = []) {
  if (normalizeFinanceKind(transaction) === 'bond') return true
  return subprocesses.some((process) => {
    const type = normalizeKey(process?.process_type || process?.type || process?.laneKey || process?.lane_key)
    const status = normalizeKey(process?.status || process?.lane_status)
    return ['bond', 'bond_originator', 'finance'].includes(type) && status !== 'not_required'
  })
}

function getStageIndex(stages = [], stageKey = '') {
  return stages.findIndex((stage) => stage.key === stageKey)
}

function coerceCurrentStageForVisibleLifecycle(currentStage = 'instruction', transaction = {}, subprocesses = []) {
  const normalized = normalizeTransactionLifecycleStage(currentStage, 'instruction')
  const financeKind = normalizeFinanceKind(transaction)
  if (financeKind === 'cash' && normalized === 'finance') {
    return 'documents'
  }
  if (normalized === 'finance' && !hasRequiredBondFinance(transaction, subprocesses)) {
    return 'documents'
  }
  return normalized
}

function getStageState({ stageKey, currentStage, status, blockersByStage, completedStages, transaction, subprocesses }) {
  const lifecycleStatus = normalizeKey(status)
  const explicitCompleted = new Set((completedStages || []).map((stage) => normalizeTransactionLifecycleStage(stage, '')))
  const financeKind = normalizeFinanceKind(transaction)
  if (stageKey === 'finance' && financeKind === 'cash') return 'not_required'
  if (stageKey === 'finance' && !hasRequiredBondFinance(transaction, subprocesses) && currentStage !== 'finance') return 'not_required'

  const currentIndex = TRANSACTION_LIFECYCLE_STAGE_ORDER.indexOf(currentStage)
  const stageIndex = TRANSACTION_LIFECYCLE_STAGE_ORDER.indexOf(stageKey)
  const blocked = Array.isArray(blockersByStage?.[stageKey]) && blockersByStage[stageKey].length > 0
  if (lifecycleStatus === 'blocked' && currentStage === stageKey) return 'blocked'
  if (blocked && currentStage === stageKey) return 'blocked'
  if (lifecycleStatus === 'completed' || explicitCompleted.has(stageKey) || stageIndex < currentIndex) return 'completed'
  if (stageIndex === currentIndex) return 'current'
  return 'upcoming'
}

function getStageStatusLabel(state) {
  if (state === 'completed') return 'Completed'
  if (state === 'current') return 'In Progress'
  if (state === 'blocked') return 'Blocked'
  if (state === 'not_required') return 'Not Required'
  return 'Pending'
}

export function getVisibleMatterLifecycleStages({
  transaction = {},
  currentStage = '',
  status = '',
  blockersByStage = {},
  completedStages = [],
  subprocesses = [],
  cashFinanceMode = 'not_required',
} = {}) {
  const financeKind = normalizeFinanceKind(transaction)
  const resolvedCurrentStage = coerceCurrentStageForVisibleLifecycle(currentStage || resolveMainStage(transaction), transaction, subprocesses)
  return TRANSACTION_LIFECYCLE_STAGE_ORDER
    .filter((stageKey) => cashFinanceMode !== 'omit' || stageKey !== 'finance' || financeKind !== 'cash')
    .map((stageKey) => {
      const state = getStageState({
        stageKey,
        currentStage: resolvedCurrentStage,
        status,
        blockersByStage,
        completedStages,
        transaction,
        subprocesses,
      })
      return {
        key: stageKey,
        label: TRANSACTION_LIFECYCLE_STAGE_LABELS[stageKey],
        state,
        statusLabel: getStageStatusLabel(state),
        helperText: TRANSACTION_LIFECYCLE_STAGE_HELPER_TEXT[stageKey],
        notRequired: state === 'not_required',
      }
    })
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

function mapWorkflowKeyToLifecycleStage(value = '', fallback = 'instruction') {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (normalized === 'sales_otp') return 'instruction'
  if (normalized.startsWith('finance_') || normalized === 'finance') return 'finance'
  if (
    ['transfer', 'attorney_transfer', 'attorney_bond', 'seller_bond_cancellation'].includes(normalized)
  ) {
    return 'transfer_duty'
  }
  if (normalized === 'registration') return 'registration'
  return fallback
}

function buildRollupBlockersByStage(rollup = {}, currentStage = 'instruction') {
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
  const transaction = options.transaction || {}
  const subprocesses = options.subprocesses || []
  const visibleStages = getVisibleMatterLifecycleStages({
    transaction,
    currentStage,
    status: lifecycleStatus,
    blockersByStage,
    completedStages: rollup.completedStages || rollup.completed_stages_json || [],
    subprocesses,
    cashFinanceMode: options.cashFinanceMode || 'not_required',
  })
  const resolvedCurrentStage = coerceCurrentStageForVisibleLifecycle(currentStage, transaction, subprocesses)
  const currentStageIndex = Math.max(getStageIndex(visibleStages, resolvedCurrentStage), 0)
  const isComplete = parentStage === 'COMPLETE'

  return {
    transactionId: normalizeText(rollup.transactionId || options.transactionId),
    currentStage: resolvedCurrentStage,
    status: lifecycleStatus,
    progressPercent: Number.isFinite(Number(rollup.progressPercent)) ? Number(rollup.progressPercent) : 0,
    stages: visibleStages.map((stage, index) => ({
      ...stage,
      state: isComplete && stage.state !== 'not_required'
        ? 'completed'
        : index < currentStageIndex && stage.state !== 'not_required'
          ? 'completed'
          : stage.state,
      statusLabel: getStageStatusLabel(
        isComplete && stage.state !== 'not_required'
          ? 'completed'
          : index < currentStageIndex && stage.state !== 'not_required'
            ? 'completed'
            : stage.state,
      ),
    })),
    stageLabels: visibleStages.reduce((labels, stage) => {
      labels[stage.key] = stage.label
      return labels
    }, {}),
    stageOrder: visibleStages.map((stage) => stage.key),
    helperText: visibleStages.find((stage) => stage.key === resolvedCurrentStage)?.helperText || '',
    subStatus: rollup?.nextAction?.label
      ? {
          module: resolvedCurrentStage,
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
    rollupParentStage: parentStage || mapLifecycleStageToRollupParentStage(resolvedCurrentStage),
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
    if (currentStage === 'documents') return ['documents', 'document', 'attorney'].includes(type)
    if (currentStage === 'transfer_duty') return ['transfer', 'attorney'].includes(type)
    if (currentStage === 'lodgement') return ['lodgement', 'transfer', 'attorney'].includes(type)
    if (currentStage === 'registration') return ['registration'].includes(type)
    if (currentStage === 'instruction') return ['otp', 'sales', 'instruction'].includes(type)
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
  const normalizedStage = normalizeTransactionLifecycleStage(currentStage || resolveMainStage(transaction, mainStage), 'instruction')
  const normalizedStatus = normalizeKey(status || transaction?.transaction_lifecycle_status || transaction?.lifecycleWorkflow?.status || transaction?.lifecycle_state)
  const closedState = normalizeKey(transaction?.lifecycle_state || transaction?.lifecycleState)
  const resolvedStage = TERMINAL_LIFECYCLE_STATES.has(closedState) && normalizedStage === 'registration'
    ? 'registration'
    : coerceCurrentStageForVisibleLifecycle(normalizedStage, transaction, subprocesses)
  const lifecycleStatus =
    ['blocked', 'completed'].includes(normalizedStatus)
      ? normalizedStatus
      : normalizedStatus === 'registered' && resolvedStage === 'registration'
        ? 'completed'
        : 'active'
  const visibleStages = getVisibleMatterLifecycleStages({
    transaction,
    currentStage: resolvedStage,
    status: lifecycleStatus,
    subprocesses,
  })
  const currentIndex = Math.max(getStageIndex(visibleStages, resolvedStage), 0)

  return {
    transactionId: normalizeText(transaction?.id || transaction?.transaction_id || transaction?.transactionId),
    currentStage: resolvedStage,
    status: lifecycleStatus,
    progressPercent:
      visibleStages.length > 1
        ? Math.round((currentIndex / (visibleStages.length - 1)) * 100)
        : 0,
    stages: visibleStages,
    stageLabels: visibleStages.reduce((labels, stage) => {
      labels[stage.key] = stage.label
      return labels
    }, {}),
    stageOrder: visibleStages.map((stage) => stage.key),
    helperText: visibleStages.find((stage) => stage.key === resolvedStage)?.helperText || '',
    subStatus: getSubStatusForStage({ currentStage: resolvedStage, transaction, subprocesses }),
    lastUpdatedAt: transaction?.updated_at || transaction?.updatedAt || null,
  }
}
