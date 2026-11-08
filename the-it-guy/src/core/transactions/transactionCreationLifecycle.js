export const TRANSACTION_CREATION_LIFECYCLE_VERSION = 'arch9_transaction_creation_v3'

export const TRANSACTION_CREATION_CRITICAL_STEPS = Object.freeze([
  'attorney_assignment',
  'bond_originator_assignment',
  'onboarding_snapshot',
  'requirement_generation',
  'seller_handoff',
  'portal_setup',
])

const TERMINAL_STEP_STATUSES = new Set(['complete', 'failed', 'not_required'])

export function requiresTransactionBuyerPortal({ transactionType, buyerId, allowIncomplete = false, skipClientPortalSetup = false } = {}) {
  return !skipClientPortalSetup && ['developer_sale', 'private_property'].includes(transactionType)
    && !(allowIncomplete && !buyerId)
}

function text(value) {
  return String(value ?? '').trim()
}

function errorMetadata(error, at) {
  return {
    code: text(error?.code) || 'TRANSACTION_SETUP_STEP_FAILED',
    message: text(error?.message) || 'Transaction setup step failed.',
    at,
  }
}

function createStep(required, at) {
  return {
    required: Boolean(required),
    status: required ? 'pending' : 'not_required',
    startedAt: required ? at : null,
    completedAt: required ? null : at,
    failedAt: null,
    error: null,
    detail: {},
  }
}

export function createTransactionCreationLifecycle({
  attorneyAssignmentRequired = false,
  bondOriginatorAssignmentRequired = false,
  sellerHandoffRequired = false,
  portalSetupRequired = false,
  startedAt = new Date().toISOString(),
} = {}) {
  return {
    version: TRANSACTION_CREATION_LIFECYCLE_VERSION,
    startedAt,
    steps: {
      attorney_assignment: createStep(attorneyAssignmentRequired, startedAt),
      bond_originator_assignment: createStep(bondOriginatorAssignmentRequired, startedAt),
      onboarding_snapshot: createStep(true, startedAt),
      requirement_generation: createStep(true, startedAt),
      seller_handoff: createStep(sellerHandoffRequired, startedAt),
      portal_setup: createStep(portalSetupRequired, startedAt),
    },
  }
}

export function setTransactionCreationStepOutcome(
  lifecycle,
  stepKey,
  { status, error = null, detail = {}, at = new Date().toISOString() } = {},
) {
  if (!TRANSACTION_CREATION_CRITICAL_STEPS.includes(stepKey)) {
    throw new Error(`Unknown transaction creation step: ${stepKey}`)
  }
  if (!TERMINAL_STEP_STATUSES.has(status)) {
    throw new Error(`Invalid transaction creation step status: ${status}`)
  }

  const previous = lifecycle?.steps?.[stepKey] || createStep(true, lifecycle?.startedAt || at)
  const nextError = status === 'failed' ? errorMetadata(error, at) : null

  return {
    ...(lifecycle || {}),
    steps: {
      ...(lifecycle?.steps || {}),
      [stepKey]: {
        ...previous,
        required: status === 'not_required' ? false : previous.required !== false,
        status,
        completedAt: status === 'complete' || status === 'not_required' ? at : null,
        failedAt: status === 'failed' ? at : null,
        error: nextError,
        detail: detail && typeof detail === 'object' ? detail : {},
      },
    },
  }
}

export function getTransactionCreationIncompleteSteps(lifecycle) {
  return TRANSACTION_CREATION_CRITICAL_STEPS.filter((stepKey) => {
    const step = lifecycle?.steps?.[stepKey]
    return step?.required !== false && step?.status !== 'complete'
  })
}

const SETUP_STEP_LABELS = {
  attorney_assignment: 'Transfer attorney allocation',
  bond_originator_assignment: 'Bond originator allocation',
  onboarding_snapshot: 'Buyer onboarding details',
  requirement_generation: 'Required document checklist',
  seller_handoff: 'Seller details and documents',
  portal_setup: 'Buyer and seller portal access',
}

export function getTransactionCreationIssues(transaction = {}) {
  if (!['incomplete', 'initializing'].includes(transaction.creation_status)) return []
  const steps = transaction.creation_steps || {}
  const recorded = transaction.creation_error?.incompleteSteps || []
  const keys = TRANSACTION_CREATION_CRITICAL_STEPS.filter(key => {
    const step = steps[key]
    return step ? step.required !== false && !['complete', 'not_required'].includes(step.status) : recorded.includes(key)
  })
  return keys.map(key => {
    const error = steps[key]?.error
    const code = text(error?.code)
    const message = code === '42501' ? 'Your permissions blocked this setup step. Ask the transaction owner to check access.'
      : ['PGRST205', '42P01', '42703'].includes(code) ? 'The required setup service is unavailable. Ask support to review this transaction.'
        : text(error?.message).slice(0, 400) || 'This step has not finished. Ask the transaction owner to review it.'
    return { key, label: SETUP_STEP_LABELS[key], message }
  })
}

export function buildTransactionCreationPersistencePatch({
  lifecycle,
  status,
  error = null,
  warnings = [],
  at = new Date().toISOString(),
} = {}) {
  if (!['initializing', 'complete', 'incomplete'].includes(status)) {
    throw new Error(`Invalid transaction creation status: ${status}`)
  }

  const incompleteSteps = getTransactionCreationIncompleteSteps(lifecycle)
  if (status === 'complete' && incompleteSteps.length) {
    throw new Error(`Transaction creation cannot be completed while these steps are incomplete: ${incompleteSteps.join(', ')}`)
  }

  const warningRows = Array.isArray(warnings)
    ? warnings.map((warning) => ({
        area: text(warning?.area) || 'transaction_setup',
        code: text(warning?.code) || null,
        message: text(warning?.message) || 'Transaction setup warning.',
      }))
    : []
  const failure = status === 'incomplete' ? errorMetadata(error, at) : null

  return {
    is_active: status === 'complete',
    creation_status: status,
    creation_started_at: lifecycle?.startedAt || at,
    creation_completed_at: status === 'complete' ? at : null,
    creation_incomplete_at: status === 'incomplete' ? at : null,
    creation_steps: {
      version: lifecycle?.version || TRANSACTION_CREATION_LIFECYCLE_VERSION,
      ...(lifecycle?.steps || {}),
    },
    creation_error:
      status === 'incomplete'
        ? {
            ...failure,
            incompleteSteps,
            warnings: warningRows,
          }
        : {},
    updated_at: at,
  }
}

export class TransactionCreationIncompleteError extends Error {
  constructor({ transactionId, incompleteSteps = [], cause = null } = {}) {
    const suffix = incompleteSteps.length ? ` Failed steps: ${incompleteSteps.join(', ')}.` : ''
    super(`Transaction ${transactionId || 'record'} was saved but setup is incomplete.${suffix}`)
    this.name = 'TransactionCreationIncompleteError'
    this.code = 'TRANSACTION_CREATION_INCOMPLETE'
    this.transactionId = transactionId || null
    this.incompleteSteps = incompleteSteps
    this.cause = cause || null
  }
}
