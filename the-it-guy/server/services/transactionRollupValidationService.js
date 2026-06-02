import {
  requireClient,
  isMissingColumnError,
  isMissingTableError,
} from '../../src/services/attorneyFirmServiceShared.js'
import { mapLegacyStageToCanonical } from './workflowRollupRules.js'
import { resolveFinanceWorkflowKey } from './financeWorkflowResolver.js'

const VALIDATION_SELECT = [
  'id',
  'transaction_id',
  'legacy_stage',
  'legacy_parent_stage',
  'rollup_stage',
  'legacy_status',
  'rollup_status',
  'legacy_progress_percent',
  'rollup_progress_percent',
  'comparison_status',
  'mismatch_category',
  'mismatch_reason',
  'exception_codes_json',
  'legacy_snapshot_json',
  'rollup_snapshot_json',
  'validation_details_json',
  'compared_at',
  'created_at',
  'updated_at',
].join(', ')

const PARENT_STAGE_ORDER = Object.freeze([
  'SETUP',
  'SALES_OTP',
  'FINANCE',
  'TRANSFER',
  'REGISTRATION',
  'COMPLETE',
  'CANCELLED',
])

const LEGACY_PROGRESS_BY_STAGE = Object.freeze({
  SETUP: 0,
  SALES_OTP: 20,
  FINANCE: 45,
  TRANSFER: 70,
  REGISTRATION: 90,
  COMPLETE: 100,
  CANCELLED: 0,
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toUpperCase()
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value ?? null)
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))]
}

function stageRank(value = '') {
  const normalized = normalizeKey(value)
  const index = PARENT_STAGE_ORDER.indexOf(normalized)
  return index >= 0 ? index : -1
}

function buildLegacyStatus(transaction = {}, legacyParentStage = 'SETUP') {
  const lifecycle = normalizeText(transaction.lifecycle_state || transaction.lifecycleState).toLowerCase()
  if (lifecycle === 'cancelled' || legacyParentStage === 'CANCELLED') return 'cancelled'
  if (legacyParentStage === 'SETUP') return 'not_started'
  return 'active'
}

function normalizeStepStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'completed') return 'complete'
  if (normalized === 'in_progress' || normalized === 'active') return 'pending'
  return normalized || 'not_started'
}

function findStep(stepsByWorkflowKey = {}, workflowKey = '', stepKey = '') {
  return (stepsByWorkflowKey[workflowKey] || []).find((step) => normalizeText(step.step_key) === normalizeText(stepKey)) || null
}

function buildExceptionCodes(transaction = {}, rollup = {}, state = {}) {
  const codes = []
  const stepsByWorkflowKey = state.stepsByWorkflowKey || {}
  const instances = Array.isArray(state.instances) ? state.instances : []
  const steps = Array.isArray(state.steps) ? state.steps : []

  if (resolveFinanceWorkflowKey(transaction) === 'finance_unknown') {
    codes.push('FINANCE_TYPE_REQUIRED')
  }

  if (!instances.length) {
    codes.push('MISSING_WORKFLOW_INSTANCES')
  }

  if (!steps.length) {
    codes.push('MISSING_WORKFLOW_STEPS')
  }

  const signedOtpStep = findStep(stepsByWorkflowKey, 'sales_otp', 'signed_otp_received')
  if (signedOtpStep && !['complete', 'skipped', 'not_applicable'].includes(normalizeStepStatus(signedOtpStep.status))) {
    codes.push('SIGNED_OTP_MISSING')
  }

  const buyerOnboardingStep = findStep(stepsByWorkflowKey, 'sales_otp', 'buyer_onboarding_complete')
  if (buyerOnboardingStep && !['complete', 'skipped', 'not_applicable'].includes(normalizeStepStatus(buyerOnboardingStep.status))) {
    codes.push('BUYER_ONBOARDING_MISSING')
  }

  for (const blocker of rollup.blockers || []) {
    const code = normalizeText(blocker?.code)
    if (code) codes.push(code)
  }

  return unique(codes)
}

function classifyValidation({
  transaction = {},
  rollup = {},
  exceptionCodes = [],
}) {
  const legacyStageRaw = normalizeText(transaction.current_main_stage || transaction.stage || null) || null
  const legacyParentStage = mapLegacyStageToCanonical(transaction)
  const legacyStatus = buildLegacyStatus(transaction, legacyParentStage)
  const legacyProgressPercent = LEGACY_PROGRESS_BY_STAGE[legacyParentStage] ?? 0
  const rollupStage = normalizeKey(rollup.parentStage)
  const rollupStatus = normalizeText(rollup.parentStatus || null) || null
  const rollupProgressPercent = normalizeNumber(rollup.progressPercent, 0)
  const stageMatches = legacyParentStage === rollupStage
  const representationDiffers = stageMatches && legacyStageRaw && normalizeKey(legacyStageRaw) !== rollupStage

  let comparisonStatus = stageMatches ? 'match' : 'mismatch'
  let mismatchCategory = representationDiffers ? 'A' : null
  let mismatchReason = ''

  if (stageMatches) {
    mismatchReason = representationDiffers
      ? 'Legacy lifecycle naming differs from the canonical workflow stage, but both resolve to the same parent stage.'
      : 'Legacy lifecycle stage matches the canonical workflow roll-up.'
  } else if (exceptionCodes.includes('MISSING_WORKFLOW_INSTANCES') || exceptionCodes.includes('MISSING_WORKFLOW_STEPS')) {
    mismatchCategory = 'B'
    mismatchReason = 'Canonical workflow state is incomplete because workflow instances or steps still need backfilling.'
  } else if (exceptionCodes.includes('FINANCE_TYPE_REQUIRED')) {
    mismatchCategory = 'B'
    mismatchReason = 'Transaction is missing finance type data, so the finance branch cannot be resolved safely.'
  } else if (stageRank(legacyParentStage) > stageRank(rollupStage)) {
    if ((rollup.blockers || []).length || exceptionCodes.length) {
      mismatchCategory = 'D'
      mismatchReason = 'Legacy lifecycle is ahead of the evidence-backed workflow state for this transaction.'
    } else {
      mismatchCategory = 'C'
      mismatchReason = 'Canonical roll-up is behind legacy stage data without an obvious blocking evidence gap.'
    }
  } else if (stageRank(rollupStage) > stageRank(legacyParentStage)) {
    mismatchCategory = 'C'
    mismatchReason = 'Canonical roll-up has advanced beyond the legacy lifecycle fields.'
  } else {
    mismatchCategory = 'C'
    mismatchReason = 'Legacy lifecycle and canonical workflow disagree in a way that needs rule verification.'
  }

  return {
    comparisonStatus,
    mismatchCategory,
    mismatchReason,
    legacyStage: legacyStageRaw,
    legacyParentStage,
    rollupStage,
    legacyStatus,
    rollupStatus,
    legacyProgressPercent,
    rollupProgressPercent,
  }
}

export function buildTransactionRollupValidation({
  transaction = {},
  rollup = {},
  state = {},
  source = 'phase16_validation',
  error = null,
} = {}) {
  const exceptionCodes = buildExceptionCodes(transaction, rollup, state)
  const classification = classifyValidation({ transaction, rollup, exceptionCodes })
  const workflowKeys = Array.isArray(state.instances) ? state.instances.map((instance) => instance.workflow_key).filter(Boolean) : []
  const stepCount = Array.isArray(state.steps) ? state.steps.length : 0
  const evidenceCount = Array.isArray(state.evidence) ? state.evidence.length : 0
  const blockerCodes = (rollup.blockers || []).map((blocker) => normalizeText(blocker?.code)).filter(Boolean)

  return {
    transactionId: normalizeText(transaction.id || rollup.transactionId || null) || null,
    legacyStage: classification.legacyStage,
    legacyParentStage: classification.legacyParentStage,
    rollupStage: classification.rollupStage,
    legacyStatus: classification.legacyStatus,
    rollupStatus: classification.rollupStatus,
    legacyProgressPercent: classification.legacyProgressPercent,
    rollupProgressPercent: classification.rollupProgressPercent,
    comparisonStatus: error ? 'error' : classification.comparisonStatus,
    mismatchCategory: error ? 'B' : classification.mismatchCategory,
    mismatchReason: error
      ? `Roll-up validation failed: ${normalizeText(error?.message || error)}`
      : classification.mismatchReason,
    exceptionCodes,
    legacySnapshot: {
      currentMainStage: normalizeText(transaction.current_main_stage || null) || null,
      stage: normalizeText(transaction.stage || null) || null,
      lifecycleState: normalizeText(transaction.lifecycle_state || null) || null,
      mappedParentStage: classification.legacyParentStage,
      status: classification.legacyStatus,
      progressPercent: classification.legacyProgressPercent,
    },
    rollupSnapshot: {
      parentStage: classification.rollupStage,
      parentStatus: classification.rollupStatus,
      progressPercent: classification.rollupProgressPercent,
      activeWorkflowKey: normalizeText(rollup.activeWorkflowKey || null) || null,
      activeStepKey: normalizeText(rollup.activeStepKey || null) || null,
      blockers: rollup.blockers || [],
      nextAction: rollup.nextAction || null,
      usedLegacyFallback: rollup.usedLegacyFallback === true,
    },
    validationDetails: {
      source,
      workflowKeys,
      workflowCount: workflowKeys.length,
      stepCount,
      evidenceCount,
      blockerCodes,
      comparedAt: normalizeText(rollup.derivedAt || null) || new Date().toISOString(),
      error: error ? normalizeText(error?.message || error) : null,
    },
    comparedAt: normalizeText(rollup.derivedAt || null) || new Date().toISOString(),
  }
}

function toPersistencePayload(validation = {}) {
  return {
    transaction_id: validation.transactionId,
    legacy_stage: validation.legacyStage || null,
    legacy_parent_stage: validation.legacyParentStage || null,
    rollup_stage: validation.rollupStage || null,
    legacy_status: validation.legacyStatus || null,
    rollup_status: validation.rollupStatus || null,
    legacy_progress_percent: normalizeNumber(validation.legacyProgressPercent, 0),
    rollup_progress_percent: normalizeNumber(validation.rollupProgressPercent, 0),
    comparison_status: validation.comparisonStatus || 'match',
    mismatch_category: validation.mismatchCategory || null,
    mismatch_reason: validation.mismatchReason || null,
    exception_codes_json: validation.exceptionCodes || [],
    legacy_snapshot_json: validation.legacySnapshot || {},
    rollup_snapshot_json: validation.rollupSnapshot || {},
    validation_details_json: validation.validationDetails || {},
    compared_at: validation.comparedAt || new Date().toISOString(),
  }
}

function fromPersistenceRow(row = {}) {
  return {
    id: row.id || null,
    transactionId: normalizeText(row.transaction_id || null) || null,
    legacyStage: normalizeText(row.legacy_stage || null) || null,
    legacyParentStage: normalizeText(row.legacy_parent_stage || null) || null,
    rollupStage: normalizeText(row.rollup_stage || null) || null,
    legacyStatus: normalizeText(row.legacy_status || null) || null,
    rollupStatus: normalizeText(row.rollup_status || null) || null,
    legacyProgressPercent: normalizeNumber(row.legacy_progress_percent, 0),
    rollupProgressPercent: normalizeNumber(row.rollup_progress_percent, 0),
    comparisonStatus: normalizeText(row.comparison_status || 'match') || 'match',
    mismatchCategory: normalizeText(row.mismatch_category || null) || null,
    mismatchReason: normalizeText(row.mismatch_reason || null) || null,
    exceptionCodes: Array.isArray(row.exception_codes_json) ? row.exception_codes_json.filter(Boolean) : [],
    legacySnapshot: row.legacy_snapshot_json || {},
    rollupSnapshot: row.rollup_snapshot_json || {},
    validationDetails: row.validation_details_json || {},
    comparedAt: row.compared_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function buildTransactionRollupValidationSummary(rows = []) {
  const normalizedRows = Array.isArray(rows) ? rows : []
  const summary = {
    totalTransactions: normalizedRows.length,
    matchingTransactions: 0,
    mismatchedTransactions: 0,
    errorTransactions: 0,
    expectedMappingDifferences: 0,
    missingEvidence: 0,
    missingWorkflowInstances: 0,
    missingWorkflowSteps: 0,
    rollupErrors: 0,
    mismatchCategories: {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    },
  }

  for (const row of normalizedRows) {
    if (row.comparisonStatus === 'error') {
      summary.errorTransactions += 1
      summary.rollupErrors += 1
    } else if (row.comparisonStatus === 'match') {
      summary.matchingTransactions += 1
    } else {
      summary.mismatchedTransactions += 1
    }

    if (row.mismatchCategory && summary.mismatchCategories[row.mismatchCategory] !== undefined) {
      summary.mismatchCategories[row.mismatchCategory] += 1
    }

    if (row.mismatchCategory === 'A') {
      summary.expectedMappingDifferences += 1
    }

    if (row.exceptionCodes.includes('MISSING_WORKFLOW_INSTANCES')) {
      summary.missingWorkflowInstances += 1
    }
    if (row.exceptionCodes.includes('MISSING_WORKFLOW_STEPS')) {
      summary.missingWorkflowSteps += 1
    }
    if (row.exceptionCodes.some((code) => /MISSING|REQUIRED|BLOCKED|NOT_/.test(String(code)))) {
      summary.missingEvidence += 1
    }
  }

  return summary
}

export async function persistTransactionRollupValidation(validation = {}, options = {}) {
  const client = options.client || requireClient()
  if (!normalizeText(validation.transactionId)) {
    throw new Error('Transaction id is required to persist roll-up validation.')
  }

  const payload = toPersistencePayload(validation)
  let query = await client
    .from('transaction_rollup_validation')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(VALIDATION_SELECT)

  if (
    query.error &&
    (
      isMissingColumnError(query.error, 'legacy_parent_stage') ||
      isMissingColumnError(query.error, 'legacy_snapshot_json') ||
      isMissingColumnError(query.error, 'rollup_snapshot_json') ||
      isMissingColumnError(query.error, 'validation_details_json')
    )
  ) {
    const fallbackPayload = { ...payload }
    if (isMissingColumnError(query.error, 'legacy_parent_stage')) delete fallbackPayload.legacy_parent_stage
    if (isMissingColumnError(query.error, 'legacy_snapshot_json')) delete fallbackPayload.legacy_snapshot_json
    if (isMissingColumnError(query.error, 'rollup_snapshot_json')) delete fallbackPayload.rollup_snapshot_json
    if (isMissingColumnError(query.error, 'validation_details_json')) delete fallbackPayload.validation_details_json

    query = await client
      .from('transaction_rollup_validation')
      .upsert(fallbackPayload, { onConflict: 'transaction_id' })
      .select(VALIDATION_SELECT)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_rollup_validation')) {
      return { ...validation, id: null }
    }
    throw query.error
  }

  return fromPersistenceRow((query.data || [])[0] || payload)
}

export async function fetchTransactionRollupValidationReport(options = {}) {
  const client = options.client || requireClient()
  let query = client.from('transaction_rollup_validation').select(VALIDATION_SELECT).order('compared_at', { ascending: false })

  if (options.transactionId) {
    query = query.eq('transaction_id', options.transactionId)
  }
  if (options.comparisonStatus) {
    query = query.eq('comparison_status', options.comparisonStatus)
  }
  if (options.mismatchCategory) {
    query = query.eq('mismatch_category', options.mismatchCategory)
  }
  if (Number.isFinite(options.limit)) {
    query = query.limit(options.limit)
  }

  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_rollup_validation')) {
      return {
        summary: buildTransactionRollupValidationSummary([]),
        rows: [],
      }
    }
    throw result.error
  }

  const rows = (result.data || []).map((row) => fromPersistenceRow(row))
  return {
    summary: buildTransactionRollupValidationSummary(rows),
    rows,
  }
}

export function buildTransactionRollupValidationReport(rows = [], meta = {}) {
  return {
    summary: buildTransactionRollupValidationSummary(rows),
    rows,
    meta: {
      generatedAt: new Date().toISOString(),
      source: meta.source || 'phase16_validation',
      ...(meta || {}),
    },
  }
}

export function buildTransactionRollupValidationFallback({
  transaction = {},
  error = null,
  source = 'phase16_validation',
} = {}) {
  return buildTransactionRollupValidation({
    transaction,
    rollup: {
      transactionId: transaction.id,
      parentStage: mapLegacyStageToCanonical(transaction),
      parentStatus: buildLegacyStatus(transaction, mapLegacyStageToCanonical(transaction)),
      progressPercent: LEGACY_PROGRESS_BY_STAGE[mapLegacyStageToCanonical(transaction)] ?? 0,
      blockers: [],
      nextAction: null,
      derivedAt: transaction.updated_at || new Date().toISOString(),
    },
    state: {},
    source,
    error,
  })
}

export function hasValidationChanged(previous = null, next = null) {
  return stableSerialize(previous) !== stableSerialize(next)
}
