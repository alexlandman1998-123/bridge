import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'
import { getPerformanceBudgetMs, isPerformanceBudgetBreached } from './observability/performanceMetrics.js'

export const DOCUMENT_WORKSPACE_PERFORMANCE_CONTRACT = 'document-workspace-performance-phase7-v1'
export const DOCUMENT_WORKSPACE_PERFORMANCE_METRIC_PREFIX = 'legal_document.'
export const DOCUMENT_WORKSPACE_PERFORMANCE_PACKET_TYPES = Object.freeze(['otp', 'mandate'])
export const DOCUMENT_WORKSPACE_PERFORMANCE_PHASES = Object.freeze(['generation', 'signing'])
export const DOCUMENT_WORKSPACE_PERFORMANCE_DEFAULT_HOURS = 24
export const DOCUMENT_WORKSPACE_PERFORMANCE_DEFAULT_LIMIT = 1000

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function roundNumber(value, precision = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const factor = 10 ** Math.max(Number(precision) || 0, 0)
  return Math.round(numeric * factor) / factor
}

function isMissingPerformanceSchema(error = {}) {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return ['42p01', '42703', 'pgrst204', 'pgrst205'].includes(code) || message.includes('performance_metrics')
}

function buildEmptyMetricSummary() {
  return {
    sampleCount: 0,
    budgetedCount: 0,
    breachCount: 0,
    breachRate: 0,
    averageDurationMs: null,
    p95DurationMs: null,
    slowestDurationMs: null,
    slowestMetricName: '',
    latestBreachAt: '',
  }
}

function percentile(values = [], percentileValue = 95) {
  const sorted = values.map((value) => Number(value)).filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return null
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)]
}

export function resolveDocumentWorkspacePerformancePhase(metricName = '') {
  const name = normalizeKey(metricName)
  if (name.startsWith('legal_document_generation_')) return 'generation'
  if (name.startsWith('legal_document_signing_')) return 'signing'
  return 'other'
}

export function normalizeDocumentWorkspacePerformancePacketType(metadata = {}) {
  const packetType = normalizeKey(metadata?.packetType || metadata?.packet_type || metadata?.documentType || metadata?.document_type)
  if (packetType === 'offer_to_purchase') return 'otp'
  if (DOCUMENT_WORKSPACE_PERFORMANCE_PACKET_TYPES.includes(packetType)) return packetType
  return 'unknown'
}

export function normalizeDocumentWorkspacePerformanceRow(row = {}) {
  const metricName = normalizeText(row?.metric_name || row?.metricName)
  const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
  const durationMs = toFiniteNumber(row?.duration_ms ?? row?.durationMs)
  const explicitBudgetMs = toFiniteNumber(metadata.performanceBudgetMs ?? metadata.performance_budget_ms)
  const budgetMs = getPerformanceBudgetMs(metricName, explicitBudgetMs)
  const packetType = normalizeDocumentWorkspacePerformancePacketType(metadata)
  const phase = resolveDocumentWorkspacePerformancePhase(metricName)
  const breached = isPerformanceBudgetBreached({ metricName, durationMs, budgetMs })
  return {
    id: normalizeText(row?.id),
    metricName,
    packetType,
    phase,
    durationMs,
    budgetMs,
    breached,
    overBudgetMs: breached ? Math.max(Math.round(durationMs - budgetMs), 0) : 0,
    failed: metadata.failed === true,
    targetSignerRole: normalizeText(metadata.targetSignerRole || metadata.target_signer_role) || '',
    packetId: normalizeText(metadata.packetId || metadata.packet_id) || '',
    route: normalizeText(row?.route),
    createdAt: normalizeText(row?.created_at || row?.createdAt),
    metadata,
  }
}

export function summarizeDocumentWorkspacePerformanceRows(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map(normalizeDocumentWorkspacePerformanceRow)
    .filter((row) => row.metricName.startsWith(DOCUMENT_WORKSPACE_PERFORMANCE_METRIC_PREFIX))
  const durations = normalizedRows.map((row) => row.durationMs).filter(Number.isFinite)
  const budgetedRows = normalizedRows.filter((row) => Number.isFinite(row.budgetMs))
  const breachedRows = normalizedRows.filter((row) => row.breached)
  const slowestRow = normalizedRows
    .filter((row) => Number.isFinite(row.durationMs))
    .sort((left, right) => right.durationMs - left.durationMs)[0] || null
  const latestBreach = [...breachedRows]
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] || null
  return {
    sampleCount: normalizedRows.length,
    budgetedCount: budgetedRows.length,
    breachCount: breachedRows.length,
    breachRate: normalizedRows.length ? roundNumber(breachedRows.length / normalizedRows.length, 3) : 0,
    averageDurationMs: durations.length ? roundNumber(durations.reduce((total, value) => total + value, 0) / durations.length) : null,
    p95DurationMs: roundNumber(percentile(durations, 95)),
    slowestDurationMs: slowestRow ? roundNumber(slowestRow.durationMs) : null,
    slowestMetricName: slowestRow?.metricName || '',
    latestBreachAt: latestBreach?.createdAt || '',
  }
}

function buildPacketTypeSummary(rows = [], packetType = 'unknown') {
  const packetRows = rows.filter((row) => row.packetType === packetType)
  const phases = DOCUMENT_WORKSPACE_PERFORMANCE_PHASES.reduce((accumulator, phase) => {
    accumulator[phase] = summarizeDocumentWorkspacePerformanceRows(packetRows.filter((row) => row.phase === phase))
    return accumulator
  }, {})
  const metricBreakdown = Object.values(packetRows.reduce((accumulator, row) => {
    const key = row.metricName
    if (!accumulator[key]) accumulator[key] = { metricName: key, rows: [] }
    accumulator[key].rows.push(row)
    return accumulator
  }, {}))
    .map((entry) => ({ metricName: entry.metricName, ...summarizeDocumentWorkspacePerformanceRows(entry.rows) }))
    .sort((left, right) => right.breachCount - left.breachCount || (right.p95DurationMs || 0) - (left.p95DurationMs || 0))

  return {
    packetType,
    ...summarizeDocumentWorkspacePerformanceRows(packetRows),
    phases,
    metricBreakdown,
  }
}

export function buildDocumentWorkspacePerformanceSnapshot(rows = [], { generatedAt = new Date().toISOString() } = {}) {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizeDocumentWorkspacePerformanceRow)
  const packetTypes = [...DOCUMENT_WORKSPACE_PERFORMANCE_PACKET_TYPES]
  if (normalizedRows.some((row) => row.packetType === 'unknown')) packetTypes.push('unknown')
  const byPacketType = packetTypes.reduce((accumulator, packetType) => {
    accumulator[packetType] = buildPacketTypeSummary(normalizedRows, packetType)
    return accumulator
  }, {})
  const breachedRows = normalizedRows.filter((row) => row.breached)
  return {
    contract: DOCUMENT_WORKSPACE_PERFORMANCE_CONTRACT,
    generatedAt,
    summary: summarizeDocumentWorkspacePerformanceRows(normalizedRows),
    byPacketType,
    breaches: breachedRows
      .sort((left, right) => (right.overBudgetMs || 0) - (left.overBudgetMs || 0))
      .slice(0, 25),
  }
}

export async function fetchDocumentWorkspacePerformanceSnapshot({
  hours = DOCUMENT_WORKSPACE_PERFORMANCE_DEFAULT_HOURS,
  limit = DOCUMENT_WORKSPACE_PERFORMANCE_DEFAULT_LIMIT,
  workspaceId = '',
  client = supabase,
  now = new Date(),
} = {}) {
  if (!isSupabaseConfigured || !client) {
    return {
      available: false,
      reason: 'performance_metrics_not_configured',
      ...buildDocumentWorkspacePerformanceSnapshot([], { generatedAt: now.toISOString() }),
    }
  }
  const safeLimit = Math.min(Math.max(Number(limit) || DOCUMENT_WORKSPACE_PERFORMANCE_DEFAULT_LIMIT, 1), 5000)
  const safeHours = Math.max(Number(hours) || DOCUMENT_WORKSPACE_PERFORMANCE_DEFAULT_HOURS, 1)
  const since = new Date(now.getTime() - safeHours * 60 * 60 * 1000).toISOString()

  let query = client
    .from('performance_metrics')
    .select('id, metric_name, duration_ms, route, metadata, created_at')
    .ilike('metric_name', `${DOCUMENT_WORKSPACE_PERFORMANCE_METRIC_PREFIX}%`)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(safeLimit)
  if (normalizeText(workspaceId)) query = query.eq('workspace_id', normalizeText(workspaceId))

  const result = await query
  if (result.error) {
    if (isMissingPerformanceSchema(result.error)) {
      return {
        available: false,
        reason: 'performance_metrics_schema_missing',
        ...buildDocumentWorkspacePerformanceSnapshot([], { generatedAt: now.toISOString() }),
      }
    }
    return {
      available: false,
      reason: result.error.message || 'performance_metrics_read_failed',
      ...buildDocumentWorkspacePerformanceSnapshot([], { generatedAt: now.toISOString() }),
    }
  }

  return {
    available: true,
    reason: null,
    windowHours: safeHours,
    rowCount: Array.isArray(result.data) ? result.data.length : 0,
    ...buildDocumentWorkspacePerformanceSnapshot(result.data, { generatedAt: now.toISOString() }),
  }
}
