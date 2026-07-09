/* global process */
import { requireClient, isMissingColumnError } from '../../src/services/attorneyFirmServiceShared.js'
import { logTransactionWorkflowEvent } from './workflowEventService.js'

export const LEGACY_TRANSACTION_LIFECYCLE_FIELDS = Object.freeze([
  'current_main_stage',
  'stage',
  'current_sub_stage_summary',
])

const LEGACY_MAIN_STAGE_VALUES = new Set(['AVAIL', 'DEP', 'OTP', 'FIN', 'ATTY', 'XFER', 'REG'])

const DETAILED_STAGE_ALIASES = {
  'Transfer In Progress': 'Transfer in Progress',
}

const DETAILED_STAGE_FAMILIES = {
  SETUP: ['Available'],
  SALES_OTP: ['Reserved', 'OTP Signed', 'Deposit Paid'],
  FINANCE: ['Finance Pending', 'Bond Approved / Proof of Funds'],
  TRANSFER: ['Proceed to Attorneys', 'Transfer in Progress', 'Transfer Lodged'],
  REGISTRATION: ['Transfer Lodged', 'Registered'],
  COMPLETE: ['Registered'],
}

const DEFAULT_DETAILED_STAGE_BY_PARENT = {
  SETUP: 'Available',
  SALES_OTP: 'Reserved',
  FINANCE: 'Finance Pending',
  TRANSFER: 'Transfer in Progress',
  REGISTRATION: 'Transfer Lodged',
  COMPLETE: 'Registered',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLegacyMainStage(value = '', fallback = 'AVAIL') {
  const normalized = normalizeText(value).toUpperCase()
  return LEGACY_MAIN_STAGE_VALUES.has(normalized) ? normalized : fallback
}

function normalizeDetailedStage(value = '') {
  const normalized = normalizeText(value)
  return DETAILED_STAGE_ALIASES[normalized] || normalized
}

export function mapParentStageToLegacyStage(parentStage = '', currentMainStage = 'AVAIL') {
  switch (String(parentStage || '').trim().toUpperCase()) {
    case 'SETUP':
      return 'AVAIL'
    case 'SALES_OTP':
      return 'OTP'
    case 'FINANCE':
      return 'FIN'
    case 'TRANSFER':
      return 'XFER'
    case 'REGISTRATION':
      return 'REG'
    case 'COMPLETE':
      return 'REG'
    case 'CANCELLED':
      return normalizeLegacyMainStage(currentMainStage)
    default:
      return normalizeLegacyMainStage(currentMainStage)
  }
}

export function mapParentStageToDetailedStage(parentStage = '', currentDetailedStage = '') {
  const normalizedParentStage = String(parentStage || '').trim().toUpperCase()
  const current = normalizeDetailedStage(currentDetailedStage)
  if (normalizedParentStage === 'CANCELLED') {
    return current || 'Available'
  }

  const family = DETAILED_STAGE_FAMILIES[normalizedParentStage] || null
  if (family?.includes(current)) {
    return current
  }
  return DEFAULT_DETAILED_STAGE_BY_PARENT[normalizedParentStage] || current || 'Available'
}

export function assertNoLegacyLifecycleFieldWrites(payload = {}, options = {}) {
  const allow = options.allowCompatibilityService === true
  const environment = String(process.env.NODE_ENV || 'development').trim().toLowerCase()
  if (allow || !['development', 'test'].includes(environment)) {
    return payload
  }

  const forbiddenFields = LEGACY_TRANSACTION_LIFECYCLE_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(payload || {}, field),
  )
  if (!forbiddenFields.length) {
    return payload
  }

  const source = normalizeText(options.source || 'unknown')
  throw new Error(
    `Legacy lifecycle fields must be derived via transactionStageCompatibilityService only. ` +
      `Blocked fields: ${forbiddenFields.join(', ')}. Source: ${source}.`,
  )
}

function buildSubStageSummary(rollup = {}) {
  if (rollup.nextAction?.label) {
    return normalizeText(rollup.nextAction.label) || null
  }
  if (Array.isArray(rollup.blockers) && rollup.blockers.length) {
    return normalizeText(rollup.blockers[0]?.message) || null
  }
  if (rollup.activeWorkflowKey) {
    return `Workflow active: ${rollup.activeWorkflowKey}`
  }
  if (rollup.parentStage === 'COMPLETE') return 'Registration confirmed'
  if (rollup.parentStage === 'CANCELLED') return 'Transaction cancelled'
  return null
}

export function buildTransactionCompatibilityPayload(transaction = {}, rollup = {}, options = {}) {
  const nowIso = rollup?.derivedAt || options.now || new Date().toISOString()
  const currentMainStage = transaction.current_main_stage || transaction.currentMainStage || 'AVAIL'
  const legacyMainStage = mapParentStageToLegacyStage(rollup.parentStage, currentMainStage)
  const legacyDetailedStage = mapParentStageToDetailedStage(
    rollup.parentStage,
    transaction.stage || transaction.stageLabel || '',
  )
  return {
    stage: legacyDetailedStage,
    current_main_stage: legacyMainStage,
    current_sub_stage_summary: buildSubStageSummary(rollup),
    next_action: normalizeText(rollup.nextAction?.label) || null,
    comment: normalizeText(buildSubStageSummary(rollup)) || null,
    is_active: rollup.parentStage !== 'SETUP',
    updated_at: nowIso,
    ...options.extraFields,
  }
}

export async function syncTransactionCompatibilityFields(transactionId, rollup = {}, options = {}) {
  const client = options.client || requireClient()
  const nowIso = options.now || new Date().toISOString()

  // Do not mutate lifecycle display fields directly outside this service.
  // Workflow actions must update workflow state first, then sync these cached compatibility fields from the roll-up.
  let transaction = options.transaction || null
  if (!transaction?.id) {
    const query = await client
      .from('transactions')
      .select('id, unit_id, current_main_stage')
      .eq('id', transactionId)
      .maybeSingle()
    if (query.error) throw query.error
    transaction = query.data || { id: transactionId, unit_id: null, current_main_stage: 'AVAIL' }
  }
  const previousCurrentMainStage = normalizeText(transaction?.current_main_stage) || null

  const payload = buildTransactionCompatibilityPayload(transaction, rollup, {
    now: nowIso,
    extraFields: options.extraFields || {},
  })
  assertNoLegacyLifecycleFieldWrites(options.extraFields || {}, {
    source: options.source || 'compatibility_sync_extra_fields',
  })

  let updateResult = await client.from('transactions').update(payload).eq('id', transactionId)
  if (
    updateResult.error &&
    (
      isMissingColumnError(updateResult.error, 'current_sub_stage_summary') ||
      isMissingColumnError(updateResult.error, 'current_main_stage') ||
      isMissingColumnError(updateResult.error, 'next_action') ||
      isMissingColumnError(updateResult.error, 'comment') ||
      isMissingColumnError(updateResult.error, 'is_active')
    )
  ) {
    const fallbackPayload = { ...payload }
    if (isMissingColumnError(updateResult.error, 'current_sub_stage_summary')) delete fallbackPayload.current_sub_stage_summary
    if (isMissingColumnError(updateResult.error, 'current_main_stage')) delete fallbackPayload.current_main_stage
    if (isMissingColumnError(updateResult.error, 'next_action')) delete fallbackPayload.next_action
    if (isMissingColumnError(updateResult.error, 'comment')) delete fallbackPayload.comment
    if (isMissingColumnError(updateResult.error, 'is_active')) delete fallbackPayload.is_active
    updateResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId)
  }

  if (updateResult.error) throw updateResult.error

  if (transaction?.unit_id) {
    const unitUpdate = await client.from('units').update({ status: payload.stage }).eq('id', transaction.unit_id)
    if (unitUpdate.error && !isMissingColumnError(unitUpdate.error, 'status')) {
      throw unitUpdate.error
    }
  }

  await logTransactionWorkflowEvent(
    {
      transactionId,
      workflowKey: '',
      stepKey: '',
      actionKey: 'ROLLUP_SYNC',
      eventType: 'legacy_compatibility_synced',
      previousStatus: previousCurrentMainStage,
      newStatus: payload.current_main_stage,
      payload: {
        transaction_id: transactionId,
        previous_current_main_stage: previousCurrentMainStage,
        new_current_main_stage: payload.current_main_stage,
        source: 'rollup_sync',
        rollup_derived_at: rollup?.derivedAt || nowIso,
      },
      source: 'rollup_sync',
      createdBy: options.createdBy || null,
    },
    { client },
  )

  return payload
}
