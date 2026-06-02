import {
  requireClient,
  isMissingColumnError,
  isMissingTableError,
} from '../../src/services/attorneyFirmServiceShared.js'

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toIsoString(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

async function safeSelect(client, table, columns, fallbackColumns = '') {
  let query = await client.from(table).select(columns)
  if (!query.error) return query.data || []

  if (fallbackColumns && isMissingColumnError(query.error, columns.split(',')[0]?.trim())) {
    query = await client.from(table).select(fallbackColumns)
    if (!query.error) return query.data || []
  }

  if (isMissingTableError(query.error, table)) return []
  throw query.error
}

export async function getWorkflowEngineHealthSnapshot(options = {}) {
  const client = options.client || requireClient()
  const staleThresholdMinutes = normalizeNumber(options.staleThresholdMinutes, 30)
  const staleThresholdMs = staleThresholdMinutes * 60 * 1000

  const [transactions, rollups, instances, steps, evidence, events, audits] = await Promise.all([
    safeSelect(client, 'transactions', 'id, updated_at'),
    safeSelect(
      client,
      'transaction_rollups',
      'transaction_id, parent_status, blockers_json, is_stale, last_error, last_recompute_attempt_at, derived_at',
      'transaction_id, parent_status, blockers_json, derived_at',
    ),
    safeSelect(client, 'transaction_workflow_instances', 'transaction_id, workflow_key'),
    safeSelect(client, 'transaction_workflow_steps', 'transaction_id, workflow_key, step_key'),
    safeSelect(client, 'transaction_workflow_evidence', 'transaction_id, evidence_type'),
    safeSelect(client, 'transaction_workflow_events', 'transaction_id, event_type, payload_json, created_at'),
    safeSelect(client, 'transaction_rollup_audit', 'id, created_at'),
  ])

  const now = Date.now()
  const transactionIds = new Set((transactions || []).map((row) => row.id).filter(Boolean))
  const rollupIds = new Set((rollups || []).map((row) => row.transaction_id).filter(Boolean))
  const instanceIds = new Set((instances || []).map((row) => row.transaction_id).filter(Boolean))
  const stepIds = new Set((steps || []).map((row) => row.transaction_id).filter(Boolean))

  let staleRollups = 0
  let blockedWorkflows = 0
  const staleTransactions = []
  for (const row of rollups || []) {
    const derivedAt = toIsoString(row.derived_at)
    const isExplicitlyStale = row.is_stale === true
    const isTimeStale =
      derivedAt && now - new Date(derivedAt).getTime() > staleThresholdMs
    if (isExplicitlyStale || isTimeStale) {
      staleRollups += 1
      staleTransactions.push(row.transaction_id)
    }
    if (String(row.parent_status || '').trim().toLowerCase() === 'blocked' || (Array.isArray(row.blockers_json) && row.blockers_json.length)) {
      blockedWorkflows += 1
    }
  }

  const recomputeEvents = (events || []).filter((row) =>
    String(row.event_type || '').startsWith('workflow_recompute_'),
  )
  const recomputeFailures = recomputeEvents.filter((row) => row.event_type === 'workflow_recompute_failed').length
  const recomputeDurations = recomputeEvents
    .map((row) => normalizeNumber(row.payload_json?.durationMs, NaN))
    .filter((value) => Number.isFinite(value))
  const averageRecomputeTimeMs = recomputeDurations.length
    ? Math.round(recomputeDurations.reduce((sum, value) => sum + value, 0) / recomputeDurations.length)
    : null

  const overrideCount = (evidence || []).filter((row) => row.evidence_type === 'manual_override').length
  const missingWorkflowInstances = [...transactionIds].filter((id) => !instanceIds.has(id))
  const missingWorkflowSteps = [...transactionIds].filter((id) => !stepIds.has(id))

  return {
    generatedAt: new Date().toISOString(),
    staleThresholdMinutes,
    totals: {
      transactions: transactionIds.size,
      rollups: rollupIds.size,
      coveragePercent: transactionIds.size ? Math.round((rollupIds.size / transactionIds.size) * 100) : 0,
      staleRollups,
      blockedWorkflows,
      recomputeFailures,
      overrideCount,
      auditVolume: (audits || []).length,
      averageRecomputeTimeMs,
      missingWorkflowInstances: missingWorkflowInstances.length,
      missingWorkflowSteps: missingWorkflowSteps.length,
    },
    staleTransactions,
    missingWorkflowInstanceTransactionIds: missingWorkflowInstances,
    missingWorkflowStepTransactionIds: missingWorkflowSteps,
  }
}
