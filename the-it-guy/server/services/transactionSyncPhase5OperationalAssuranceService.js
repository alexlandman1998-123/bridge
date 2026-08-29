const REQUIRED_OUTPUT_KEYS = Object.freeze([
  'transaction_event',
  'lane_state',
  'transaction_rollup',
  'activity_projection',
  'refresh_signal',
  'audit_record',
])

const EXPECTED_ACTION_COUNT = 29
const DEFAULT_LATENCY_SLO_MS = 2_000
const DEFAULT_STUCK_AFTER_MS = 120_000

function asTime(value) {
  const parsed = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function addIssue(issues, code, severity, detail = {}) {
  issues.push({ code, severity, ...detail })
}

function hasOutput(outputs, key) {
  const value = outputs?.[key]
  return value !== null && value !== undefined && value !== ''
}

export function buildTransactionSyncOperationalAssessment({
  transaction,
  actionCatalogCount = 0,
  rollup = null,
  lanes = [],
  receipts = [],
  activities = [],
  eventIds = [],
  refreshSignal = null,
  projectionQueue = [],
  truncated = false,
  now = new Date().toISOString(),
  latencySloMs = DEFAULT_LATENCY_SLO_MS,
  stuckAfterMs = DEFAULT_STUCK_AFTER_MS,
} = {}) {
  const issues = []
  const nowMs = asTime(now) || Date.now()
  const activityByReceipt = new Map(activities.map((row) => [row.command_receipt_id, row]))
  const queueByReceipt = new Map(projectionQueue.map((row) => [row.command_receipt_id, row]))
  const knownEventIds = new Set(eventIds.filter(Boolean))
  const receiptIds = new Set(receipts.map((row) => row.id))

  if (!transaction?.id) addIssue(issues, 'transaction_missing', 'critical')
  if (!rollup?.transaction_id) addIssue(issues, 'rollup_missing', 'critical')
  if (!lanes.length) addIssue(issues, 'lane_state_missing', 'critical')
  if (Number(actionCatalogCount) !== EXPECTED_ACTION_COUNT) {
    addIssue(issues, 'action_catalog_incomplete', 'critical', {
      expected: EXPECTED_ACTION_COUNT,
      actual: Number(actionCatalogCount || 0),
    })
  }
  if (truncated) addIssue(issues, 'receipt_window_truncated', 'critical')
  if (!receipts.length) addIssue(issues, 'canonical_path_not_exercised', 'warning')

  let maxVersion = 0
  let latestVersionReceipt = null
  for (const receipt of receipts) {
    const version = Number(receipt.transaction_version || 0)
    if (version > maxVersion) {
      maxVersion = version
      latestVersionReceipt = receipt
    }
    const receiptDetail = { receiptId: receipt.id, actionKey: receipt.action_key }
    if (receipt.status !== 'projected') {
      const ageMs = Math.max(0, nowMs - (asTime(receipt.created_at) || nowMs))
      addIssue(issues, ageMs >= stuckAfterMs ? 'receipt_stuck' : 'receipt_not_projected', 'critical', {
        ...receiptDetail,
        status: receipt.status,
        ageMs,
      })
    }
    const missingOutputs = REQUIRED_OUTPUT_KEYS.filter((key) => !hasOutput(receipt.outputs_json, key))
    if (missingOutputs.length) {
      addIssue(issues, 'receipt_outputs_incomplete', 'critical', { ...receiptDetail, missingOutputs })
    }
    if (!receipt.canonical_event_id || !knownEventIds.has(receipt.canonical_event_id)) {
      addIssue(issues, 'canonical_event_missing', 'critical', receiptDetail)
    }
    if (!activityByReceipt.has(receipt.id)) {
      addIssue(issues, 'activity_projection_missing', 'critical', receiptDetail)
    }
    const queue = queueByReceipt.get(receipt.id)
    if (!queue) {
      addIssue(issues, 'projection_queue_receipt_missing', 'critical', receiptDetail)
    } else if (queue.status !== 'completed') {
      addIssue(issues, queue.status === 'failed' ? 'projection_failed' : 'projection_pending', 'critical', {
        ...receiptDetail,
        queueStatus: queue.status,
        attemptCount: Number(queue.attempt_count || 0),
      })
    }
    const startedAt = asTime(receipt.created_at)
    const completedAt = asTime(receipt.completed_at)
    if (startedAt && completedAt && completedAt - startedAt > latencySloMs) {
      addIssue(issues, 'propagation_latency_slo_missed', 'warning', {
        ...receiptDetail,
        latencyMs: completedAt - startedAt,
        targetMs: latencySloMs,
      })
    }
  }

  if (receipts.length && !refreshSignal) {
    addIssue(issues, 'refresh_signal_missing', 'critical')
  } else if (refreshSignal) {
    const signalVersion = Number(refreshSignal.version || 0)
    if (signalVersion < maxVersion) {
      addIssue(issues, 'refresh_version_behind', 'critical', { signalVersion, maxVersion })
    }
    if (latestVersionReceipt?.id && refreshSignal.command_receipt_id !== latestVersionReceipt.id) {
      addIssue(issues, 'refresh_receipt_mismatch', 'critical', {
        expectedReceiptId: latestVersionReceipt.id,
        actualReceiptId: refreshSignal.command_receipt_id || null,
      })
    }
  }

  for (const queue of projectionQueue) {
    if (!receiptIds.has(queue.command_receipt_id)) {
      addIssue(issues, 'projection_queue_orphan_in_window', 'warning', { queueId: queue.id })
    }
  }

  const criticalCount = issues.filter((issue) => issue.severity === 'critical').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const status = criticalCount ? 'critical' : warningCount ? 'warning' : 'healthy'
  return {
    transactionId: transaction?.id || null,
    status,
    releaseReady: status === 'healthy',
    version: Number(refreshSignal?.version || 0),
    changedAt: refreshSignal?.changed_at || null,
    latestCommandAt: receipts[0]?.created_at || null,
    counts: {
      receipts: receipts.length,
      activities: activities.length,
      events: eventIds.length,
      projectionQueue: projectionQueue.length,
      lanes: lanes.length,
      critical: criticalCount,
      warnings: warningCount,
    },
    issues,
  }
}

async function requiredQuery(promise, label) {
  const result = await promise
  if (result.error) throw new Error(`${label}: ${result.error.message || 'query failed'}`)
  return result
}

async function fetchTransactions(client, options) {
  let query = client
    .from('transactions')
    .select('id,transaction_reference,lifecycle_state,is_active,is_demo_data,updated_at')
    .order('created_at', { ascending: true })
  if (options.transactionId) query = query.eq('id', options.transactionId)
  else query = query.range(options.offset, options.offset + options.limit - 1)
  const result = await requiredQuery(query, 'transactions')
  return (result.data || []).filter((row) =>
    row.is_active !== false && !['archived', 'cancelled'].includes(String(row.lifecycle_state || '').toLowerCase()) &&
    (options.includeDemo || row.is_demo_data !== true),
  )
}

export async function inspectTransactionSyncOperationalHealth(client, transaction, options = {}) {
  const receiptLimit = Math.min(Math.max(Number(options.receiptLimit) || 1000, 1), 5000)
  const transactionId = transaction.id
  const [rollup, lanes, receiptResult, activities, refreshSignal, projectionQueue] = await Promise.all([
    requiredQuery(client.from('transaction_rollups').select('transaction_id,derived_at').eq('transaction_id', transactionId).maybeSingle(), 'transaction rollup').then((result) => result.data),
    requiredQuery(client.from('transaction_subprocesses').select('id,process_type,status,lane_status,current_stage,updated_at').eq('transaction_id', transactionId), 'transaction lanes').then((result) => result.data || []),
    requiredQuery(client.from('transaction_sync_command_receipts').select('id,action_key,canonical_event_id,transaction_version,status,outputs_json,error_code,created_at,completed_at').eq('transaction_id', transactionId).order('created_at', { ascending: false }).limit(receiptLimit + 1), 'command receipts'),
    requiredQuery(client.from('transaction_activity_projections').select('id,command_receipt_id,canonical_event_id,occurred_at').eq('transaction_id', transactionId).order('occurred_at', { ascending: false }).limit(receiptLimit + 1), 'activity projections').then((result) => result.data || []),
    requiredQuery(client.from('transaction_refresh_signals').select('transaction_id,version,command_receipt_id,canonical_event_id,changed_at').eq('transaction_id', transactionId).maybeSingle(), 'refresh signal').then((result) => result.data),
    requiredQuery(client.from('transaction_sync_projection_queue').select('id,command_receipt_id,status,attempt_count,last_error,available_at,completed_at,updated_at').eq('transaction_id', transactionId).order('updated_at', { ascending: false }).limit(receiptLimit + 1), 'projection queue').then((result) => result.data || []),
  ])
  const allReceipts = receiptResult.data || []
  const truncated = allReceipts.length > receiptLimit
  const receipts = allReceipts.slice(0, receiptLimit)
  const canonicalEventIds = receipts.map((row) => row.canonical_event_id).filter(Boolean)
  let eventIds = []
  if (canonicalEventIds.length) {
    const events = await requiredQuery(
      client.from('transaction_events').select('id').eq('transaction_id', transactionId).in('id', canonicalEventIds),
      'canonical transaction events',
    )
    eventIds = (events.data || []).map((row) => row.id)
  }
  return buildTransactionSyncOperationalAssessment({
    transaction,
    actionCatalogCount: options.actionCatalogCount,
    rollup,
    lanes,
    receipts,
    activities,
    eventIds,
    refreshSignal,
    projectionQueue,
    truncated,
    now: options.now,
  })
}

export async function runTransactionSyncPhase5OperationalAssurance(client, options = {}) {
  const normalized = {
    transactionId: String(options.transactionId || '').trim(),
    limit: Math.min(Math.max(Number(options.limit) || 25, 1), 1000),
    offset: Math.max(Number(options.offset) || 0, 0),
    includeDemo: options.includeDemo === true,
    receiptLimit: options.receiptLimit,
  }
  const [transactions, catalog] = await Promise.all([
    fetchTransactions(client, normalized),
    requiredQuery(client.from('transaction_sync_action_catalog').select('action_key', { count: 'exact', head: true }), 'action catalog'),
  ])
  const actionCatalogCount = Number(catalog.count || 0)
  const rows = []
  const failures = []
  for (const transaction of transactions) {
    try {
      rows.push(await inspectTransactionSyncOperationalHealth(client, transaction, {
        ...normalized,
        actionCatalogCount,
        now: options.now,
      }))
    } catch (error) {
      failures.push({ transactionId: transaction.id, message: String(error?.message || error) })
    }
  }
  const counts = {
    healthy: rows.filter((row) => row.status === 'healthy').length,
    warning: rows.filter((row) => row.status === 'warning').length,
    critical: rows.filter((row) => row.status === 'critical').length,
    failed: failures.length,
  }
  return {
    phase: 5,
    mode: 'audit',
    generatedAt: options.now || new Date().toISOString(),
    actionCatalogCount,
    transactionsProcessed: transactions.length,
    releaseReady: transactions.length > 0 && counts.warning === 0 && counts.critical === 0 && counts.failed === 0,
    counts,
    failures,
    rows,
  }
}
