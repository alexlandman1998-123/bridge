import {
  requireClient,
  isMissingColumnError,
  isMissingTableError,
} from '../../src/services/attorneyFirmServiceShared.js'

const ROLLUP_AUDIT_SELECT = [
  'id',
  'transaction_id',
  'previous_parent_stage',
  'new_parent_stage',
  'previous_parent_status',
  'new_parent_status',
  'previous_progress_percent',
  'new_progress_percent',
  'reason_code',
  'trigger_type',
  'trigger_id',
  'trigger_source',
  'derived_from_json',
  'blockers_json',
  'created_by',
  'created_at',
].join(', ')

function normalizeText(value) {
  return String(value || '').trim()
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

function normalizeNextAction(value = null) {
  if (!value || typeof value !== 'object') return null
  return {
    actionKey: normalizeText(value.actionKey || value.action_key || null) || null,
    label: normalizeText(value.label || null) || null,
    reason: normalizeText(value.reason || null) || null,
    workflowKey: normalizeText(value.workflowKey || value.workflow_key || null) || null,
    stepKey: normalizeText(value.stepKey || value.step_key || null) || null,
  }
}

function normalizeBlocker(value = {}) {
  return {
    code: normalizeText(value.code || null) || null,
    message: normalizeText(value.message || null) || null,
    severity: normalizeText(value.severity || null) || null,
    ownerRole: normalizeText(value.ownerRole || value.owner_role || null) || null,
    workflowKey: normalizeText(value.workflowKey || value.workflow_key || null) || null,
    stepKey: normalizeText(value.stepKey || value.step_key || null) || null,
  }
}

export function normalizeRollupAuditShape(rollup = null) {
  if (!rollup) {
    return {
      parentStage: null,
      parentStatus: null,
      progressPercent: 0,
      activeWorkflowKey: null,
      activeStepKey: null,
      blockers: [],
      nextAction: null,
      derivedFrom: {},
      derivedAt: null,
    }
  }

  return {
    parentStage: normalizeText(rollup.parentStage || rollup.parent_stage || null) || null,
    parentStatus: normalizeText(rollup.parentStatus || rollup.parent_status || null) || null,
    progressPercent: normalizeNumber(rollup.progressPercent ?? rollup.progress_percent, 0),
    activeWorkflowKey:
      normalizeText(rollup.activeWorkflowKey || rollup.active_workflow_key || null) || null,
    activeStepKey: normalizeText(rollup.activeStepKey || rollup.active_step_key || null) || null,
    blockers: Array.isArray(rollup.blockers || rollup.blockers_json)
      ? (rollup.blockers || rollup.blockers_json).map((item) => normalizeBlocker(item))
      : [],
    nextAction: normalizeNextAction(rollup.nextAction || rollup.next_action_json || null),
    derivedFrom: rollup.derivedFrom || rollup.derived_from_json || {},
    derivedAt: rollup.derivedAt || rollup.derived_at || null,
  }
}

export function getRollupAuditChangeSet(previousRollup = null, newRollup = null) {
  const previous = normalizeRollupAuditShape(previousRollup)
  const next = normalizeRollupAuditShape(newRollup)
  const changes = []

  if (previous.parentStage !== next.parentStage) changes.push('parentStage')
  if (previous.parentStatus !== next.parentStatus) changes.push('parentStatus')
  if (previous.progressPercent !== next.progressPercent) changes.push('progressPercent')
  if (previous.activeWorkflowKey !== next.activeWorkflowKey) changes.push('activeWorkflowKey')
  if (previous.activeStepKey !== next.activeStepKey) changes.push('activeStepKey')
  if (stableSerialize(previous.blockers) !== stableSerialize(next.blockers)) changes.push('blockers')
  if (stableSerialize(previous.nextAction) !== stableSerialize(next.nextAction)) changes.push('nextAction')

  return changes
}

export function hasMeaningfulRollupAuditChange(previousRollup = null, newRollup = null) {
  return getRollupAuditChangeSet(previousRollup, newRollup).length > 0
}

function buildAuditPayload({
  transactionId,
  previousRollup,
  newRollup,
  triggerType,
  triggerId,
  triggerSource,
  reasonCode,
  userId,
  auditMetadata,
  force,
} = {}) {
  const previous = normalizeRollupAuditShape(previousRollup)
  const next = normalizeRollupAuditShape(newRollup)
  const changedFields = getRollupAuditChangeSet(previous, next)

  return {
    transaction_id: transactionId,
    previous_parent_stage: previous.parentStage,
    new_parent_stage: next.parentStage,
    previous_parent_status: previous.parentStatus,
    new_parent_status: next.parentStatus,
    previous_progress_percent: previous.progressPercent,
    new_progress_percent: next.progressPercent,
    reason_code: normalizeText(reasonCode) || 'rollup_recalculated',
    trigger_type: normalizeText(triggerType) || 'workflow_sync',
    trigger_id: normalizeText(triggerId) || null,
    trigger_source: normalizeText(triggerSource) || null,
    derived_from_json: {
      ...(next.derivedFrom || {}),
      changedFields,
      activeWorkflowKey: next.activeWorkflowKey,
      activeStepKey: next.activeStepKey,
      nextAction: next.nextAction,
      previous: {
        parentStage: previous.parentStage,
        parentStatus: previous.parentStatus,
        progressPercent: previous.progressPercent,
        activeWorkflowKey: previous.activeWorkflowKey,
        activeStepKey: previous.activeStepKey,
        nextAction: previous.nextAction,
      },
      current: {
        parentStage: next.parentStage,
        parentStatus: next.parentStatus,
        progressPercent: next.progressPercent,
        activeWorkflowKey: next.activeWorkflowKey,
        activeStepKey: next.activeStepKey,
        nextAction: next.nextAction,
      },
      auditMetadata: auditMetadata && typeof auditMetadata === 'object' ? auditMetadata : {},
      forcedAudit: force === true,
    },
    blockers_json: next.blockers,
    created_by: userId || null,
  }
}

export async function writeRollupAudit({
  transactionId,
  previousRollup = null,
  newRollup = null,
  triggerType = 'workflow_sync',
  triggerId = null,
  triggerSource = null,
  reasonCode = 'rollup_recalculated',
  userId = null,
  force = false,
  auditMetadata = null,
  client: explicitClient = null,
} = {}) {
  const client = explicitClient || requireClient()
  if (!normalizeText(transactionId)) {
    throw new Error('Transaction id is required.')
  }

  if (!force && !hasMeaningfulRollupAuditChange(previousRollup, newRollup)) {
    return null
  }

  const payload = buildAuditPayload({
    transactionId,
    previousRollup,
    newRollup,
    triggerType,
    triggerId,
    triggerSource,
    reasonCode,
    userId,
    auditMetadata,
    force,
  })

  let query = await client
    .from('transaction_rollup_audit')
    .insert(payload)
    .select(ROLLUP_AUDIT_SELECT)

  if (
    query.error &&
    (
      isMissingColumnError(query.error, 'previous_progress_percent') ||
      isMissingColumnError(query.error, 'new_progress_percent') ||
      isMissingColumnError(query.error, 'trigger_source') ||
      isMissingColumnError(query.error, 'blockers_json')
    )
  ) {
    const fallbackPayload = { ...payload }
    if (isMissingColumnError(query.error, 'previous_progress_percent')) delete fallbackPayload.previous_progress_percent
    if (isMissingColumnError(query.error, 'new_progress_percent')) delete fallbackPayload.new_progress_percent
    if (isMissingColumnError(query.error, 'trigger_source')) delete fallbackPayload.trigger_source
    if (isMissingColumnError(query.error, 'blockers_json')) delete fallbackPayload.blockers_json

    query = await client
      .from('transaction_rollup_audit')
      .insert(fallbackPayload)
      .select(ROLLUP_AUDIT_SELECT)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_rollup_audit')) {
      return null
    }
    throw query.error
  }

  return Array.isArray(query.data) ? query.data[0] || null : query.data || null
}

export async function fetchTransactionRollupAudit(transactionId, options = {}) {
  const client = options.client || requireClient()
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 50

  const query = await client
    .from('transaction_rollup_audit')
    .select(ROLLUP_AUDIT_SELECT)
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_rollup_audit')) {
      return []
    }
    throw query.error
  }

  return Array.isArray(query.data) ? query.data : []
}
