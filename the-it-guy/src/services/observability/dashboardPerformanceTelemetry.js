import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { recordPerformanceMetric } from './performanceMetrics.js'
import { trackTelemetryEvent } from './telemetry.js'

export const DASHBOARD_PERFORMANCE_TELEMETRY_CONTRACT = 'agent-principal-dashboard-performance-v1'

export const DASHBOARD_PERFORMANCE_METRICS = Object.freeze({
  authSessionRestore: 'dashboard.auth.session_restore',
  authBridgeBoot: 'dashboard.auth.bridge_boot',
  organisationBootstrap: 'dashboard.organisation.bootstrap',
  agentSummary: 'dashboard.agent.summary',
  agentPrivateListings: 'dashboard.agent.private_listings',
  principalSummary: 'dashboard.principal.summary',
})

const DASHBOARD_PERFORMANCE_METRIC_NAMES = new Set(Object.values(DASHBOARD_PERFORMANCE_METRICS))
const DASHBOARD_APP_ROLES = new Set([
  'agent',
  'principal',
  'attorney',
  'bond_originator',
  'developer',
  'client',
  'platform_admin',
  'unknown',
])
const DASHBOARD_KINDS = new Set(['agent', 'principal', 'auth', 'organisation', 'unknown'])
const DASHBOARD_LIFECYCLES = new Set([
  'initial',
  'refresh',
  'retry',
  'filter_change',
  'workspace_change',
  'background',
  'unknown',
])
const DASHBOARD_OUTCOMES = new Set(['success', 'failed', 'cancelled', 'skipped', 'deduplicated', 'unknown'])
const DASHBOARD_PRESETS = new Set([
  'this_week',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_90_days',
  'ytd',
  'all',
  'custom',
  'unknown',
])
const SAFE_BOOLEAN_KEYS = Object.freeze([
  'cacheHit',
  'deduplicated',
  'isInitialLoad',
  'isStale',
  'hasData',
  'hasSession',
  'selectedWorkspaceProvided',
  'agencyResolutionFallback',
  'scopeNormalized',
])
const SAFE_COUNT_KEYS = Object.freeze([
  'resultCount',
  'failureCount',
  'retryCount',
  'schemaFallbackCount',
  'sourceUnavailableCount',
  'activeMembershipCount',
])
const EXCLUDED_RESOURCE_PATH_PREFIXES = Object.freeze([
  '/rest/v1/performance_metrics',
  '/rest/v1/telemetry_events',
  '/rest/v1/error_events',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function toSafeCount(value) {
  const numeric = toFiniteNumber(value)
  if (numeric === null || numeric < 0) return null
  return Math.round(numeric)
}

function getNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function isEpochTimestamp(value) {
  return Number(value) > 1_000_000_000_000
}

function normalizeCatalogValue(value, catalog, fallback = 'unknown') {
  const normalized = normalizeKey(value)
  return catalog.has(normalized) ? normalized : fallback
}

function normalizeMetricName(value) {
  const normalized = normalizeText(value).toLowerCase()
  return DASHBOARD_PERFORMANCE_METRIC_NAMES.has(normalized) ? normalized : ''
}

function normalizeRoute(value) {
  const raw = normalizeText(value)
  if (!raw) return ''

  let pathname = raw
  try {
    pathname = new URL(raw, 'https://arch9.invalid').pathname || ''
  } catch {
    pathname = raw.split('?')[0].split('#')[0]
  }

  const normalizedPath = pathname.split('?')[0].split('#')[0]
  if (!normalizedPath.startsWith('/')) return ''
  return normalizedPath
    .split('/')
    .map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) || /^\d{5,}$/.test(segment)) return ':id'
      return segment
    })
    .join('/')
    .slice(0, 180)
}

function normalizeOrigin(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  try {
    return new URL(raw).origin
  } catch {
    return ''
  }
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value[Symbol.iterator] === 'function') return Array.from(value)
  return null
}

function readResourceEntries(getEntries) {
  if (typeof getEntries !== 'function') return { available: false, entries: [] }
  try {
    const entries = toArray(getEntries())
    return entries ? { available: true, entries } : { available: false, entries: [] }
  } catch {
    return { available: false, entries: [] }
  }
}

function getDefaultResourceEntries() {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return []
  return performance.getEntriesByType('resource')
}

function getResourceEntrySignature(entry = {}) {
  return [
    normalizeText(entry?.name),
    toFiniteNumber(entry?.startTime, ''),
    toFiniteNumber(entry?.responseEnd, ''),
    toFiniteNumber(entry?.duration, ''),
    normalizeText(entry?.initiatorType),
  ].join('|')
}

function countEntrySignatures(entries = []) {
  return entries.reduce((counts, entry) => {
    const signature = getResourceEntrySignature(entry)
    counts.set(signature, (counts.get(signature) || 0) + 1)
    return counts
  }, new Map())
}

function selectNewEntries(entries = [], baselineEntries = []) {
  const baselineCounts = countEntrySignatures(baselineEntries)
  return entries.filter((entry) => {
    const signature = getResourceEntrySignature(entry)
    const remaining = baselineCounts.get(signature) || 0
    if (remaining <= 0) return true
    baselineCounts.set(signature, remaining - 1)
    return false
  })
}

function getResourceDescriptor(entry = {}) {
  const name = normalizeText(entry?.name)
  if (!name) return null
  try {
    const parsed = new URL(name, 'https://arch9.invalid')
    return {
      origin: parsed.origin === 'https://arch9.invalid' ? '' : parsed.origin,
      path: parsed.pathname.toLowerCase(),
    }
  } catch {
    const path = name.split('?')[0].split('#')[0].toLowerCase()
    return { origin: '', path }
  }
}

function classifyResourcePath(path = '') {
  if (path.includes('/rest/v1/')) return 'rest'
  if (path.includes('/auth/v1/')) return 'auth'
  if (path.includes('/storage/v1/')) return 'storage'
  if (path.includes('/functions/v1/')) return 'functions'
  if (path.includes('/realtime/v1/')) return 'realtime'
  return ''
}

function isInTraceWindow(entry = {}, startedAt, endedAt) {
  const entryStart = toFiniteNumber(entry?.startTime)
  if (entryStart === null || isEpochTimestamp(startedAt) || isEpochTimestamp(endedAt)) return true
  return entryStart >= startedAt && entryStart <= endedAt
}

export function sampleDashboardNetworkRequests(entries = [], {
  baselineEntries = [],
  startedAt = 0,
  endedAt = Number.POSITIVE_INFINITY,
  resourceOrigin = '',
} = {}) {
  const currentEntries = toArray(entries)
  if (!currentEntries) {
    return {
      available: false,
      requestCount: null,
      restRequestCount: null,
      authRequestCount: null,
      storageRequestCount: null,
      functionRequestCount: null,
      realtimeRequestCount: null,
    }
  }

  const expectedOrigin = normalizeOrigin(resourceOrigin)
  const counts = {
    rest: 0,
    auth: 0,
    storage: 0,
    functions: 0,
    realtime: 0,
  }

  for (const entry of selectNewEntries(currentEntries, toArray(baselineEntries) || [])) {
    if (!isInTraceWindow(entry, startedAt, endedAt)) continue
    const descriptor = getResourceDescriptor(entry)
    if (!descriptor) continue
    if (expectedOrigin && descriptor.origin && descriptor.origin !== expectedOrigin) continue
    if (EXCLUDED_RESOURCE_PATH_PREFIXES.some((prefix) => descriptor.path.startsWith(prefix))) continue
    const kind = classifyResourcePath(descriptor.path)
    if (!kind) continue
    counts[kind] += 1
  }

  return {
    available: true,
    requestCount: Object.values(counts).reduce((total, count) => total + count, 0),
    restRequestCount: counts.rest,
    authRequestCount: counts.auth,
    storageRequestCount: counts.storage,
    functionRequestCount: counts.functions,
    realtimeRequestCount: counts.realtime,
  }
}

export function createDashboardPerformanceTrace({
  metricName = '',
  startedAt = null,
  getEntries = getDefaultResourceEntries,
  resourceOrigin = '',
} = {}) {
  const initialEntryRead = readResourceEntries(getEntries)
  const trace = {
    contract: DASHBOARD_PERFORMANCE_TELEMETRY_CONTRACT,
    metricName: normalizeMetricName(metricName),
    startedAt: toFiniteNumber(startedAt, getNow()),
    resourceOrigin: normalizeOrigin(resourceOrigin),
    resourceTimingAvailable: initialEntryRead.available,
    baselineEntries: initialEntryRead.entries,
    endedAt: null,
    network: null,
  }

  trace.finish = (endedAt = null) => {
    if (trace.network) return trace
    trace.endedAt = toFiniteNumber(endedAt, getNow())
    const latestEntryRead = readResourceEntries(getEntries)
    trace.resourceTimingAvailable = trace.resourceTimingAvailable && latestEntryRead.available
    trace.network = latestEntryRead.available
      ? sampleDashboardNetworkRequests(latestEntryRead.entries, {
          baselineEntries: trace.baselineEntries,
          startedAt: trace.startedAt,
          endedAt: trace.endedAt,
          resourceOrigin: trace.resourceOrigin,
        })
      : sampleDashboardNetworkRequests(null)
    return trace
  }

  return trace
}

function buildSafeMetadata(trace, context = {}, network = {}) {
  const metadata = {
    contract: DASHBOARD_PERFORMANCE_TELEMETRY_CONTRACT,
    appRole: normalizeCatalogValue(context.appRole, DASHBOARD_APP_ROLES),
    dashboardKind: normalizeCatalogValue(context.dashboardKind, DASHBOARD_KINDS),
    lifecycle: normalizeCatalogValue(context.lifecycle, DASHBOARD_LIFECYCLES),
    outcome: normalizeCatalogValue(context.outcome, DASHBOARD_OUTCOMES),
    preset: normalizeCatalogValue(context.preset, DASHBOARD_PRESETS),
    resourceTimingAvailable: network.available === true,
  }

  for (const key of SAFE_BOOLEAN_KEYS) {
    if (typeof context[key] === 'boolean') metadata[key] = context[key]
  }

  for (const key of SAFE_COUNT_KEYS) {
    const count = toSafeCount(context[key])
    if (count !== null) metadata[key] = count
  }

  const requestCount = toSafeCount(network.requestCount)
  if (requestCount !== null) metadata.requestCount = requestCount
  for (const [metadataKey, networkKey] of [
    ['restRequestCount', 'restRequestCount'],
    ['authRequestCount', 'authRequestCount'],
    ['storageRequestCount', 'storageRequestCount'],
    ['functionRequestCount', 'functionRequestCount'],
    ['realtimeRequestCount', 'realtimeRequestCount'],
  ]) {
    const count = toSafeCount(network[networkKey])
    if (count !== null) metadata[metadataKey] = count
  }

  return metadata
}

export function buildDashboardPerformancePayload(trace, context = {}) {
  if (!trace || !normalizeMetricName(trace.metricName)) return null
  const completedTrace = typeof trace.finish === 'function' ? trace.finish(context.endedAt) : trace
  const startedAt = toFiniteNumber(completedTrace.startedAt, getNow())
  const endedAt = toFiniteNumber(completedTrace.endedAt, getNow())
  const durationMs = toFiniteNumber(
    context.durationMs,
    Math.max(0, endedAt - startedAt),
  )
  const network = completedTrace.network || sampleDashboardNetworkRequests(null)
  const requestCount = toSafeCount(network.requestCount)

  return {
    metricName: normalizeMetricName(completedTrace.metricName),
    durationMs: Math.round(Math.max(durationMs || 0, 0)),
    value: requestCount,
    unit: 'requests',
    userId: normalizeText(context.userId),
    workspaceId: normalizeText(context.workspaceId),
    route: normalizeRoute(context.route),
    metadata: buildSafeMetadata(completedTrace, context, network),
  }
}

function buildFailureTelemetryEvent(payload = {}) {
  return {
    category: 'performance',
    eventName: 'dashboard_performance_failed',
    severity: 'warning',
    userId: payload.userId,
    workspaceId: payload.workspaceId,
    route: payload.route,
    metadata: {
      ...payload.metadata,
      metric: payload.metricName,
      durationMs: payload.durationMs,
      requestCount: payload.value,
    },
  }
}

function dispatchNonBlocking(transport, payload) {
  if (typeof transport !== 'function') return false
  try {
    const result = transport(payload)
    if (result && typeof result.then === 'function') {
      void result.catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

export function persistDashboardPerformanceTrace(trace, context = {}) {
  try {
    const payload = buildDashboardPerformancePayload(trace, context)
    if (!payload) return { accepted: false, dispatched: false, reason: 'invalid_trace' }

    const dispatched = dispatchNonBlocking(
      context.transport || context.performanceTransport || recordPerformanceMetric,
      payload,
    )
    const failed = payload.metadata.outcome === 'failed'
    const errorDispatched = failed
      ? dispatchNonBlocking(context.telemetryTransport || context.eventTransport || trackTelemetryEvent, buildFailureTelemetryEvent(payload))
      : false

    return {
      accepted: true,
      dispatched,
      errorDispatched,
      payload,
    }
  } catch {
    return { accepted: false, dispatched: false, reason: 'persistence_failed' }
  }
}

function percentile(values = [], percentileValue = 95) {
  const sorted = values
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  if (!sorted.length) return null
  const index = Math.ceil((Number(percentileValue) / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)]
}

function average(values = []) {
  const numbers = values.map((value) => Number(value)).filter(Number.isFinite)
  if (!numbers.length) return null
  return Math.round(numbers.reduce((total, value) => total + value, 0) / numbers.length)
}

export function normalizeDashboardPerformanceRow(row = {}) {
  const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
  const metricName = normalizeMetricName(row?.metric_name || row?.metricName)
  const durationMs = toFiniteNumber(row?.duration_ms ?? row?.durationMs)
  const value = toFiniteNumber(row?.value)
  const requestCount = toSafeCount(row?.requestCount) ?? (normalizeText(row?.unit).toLowerCase() === 'requests'
    ? toSafeCount(value)
    : toSafeCount(metadata.requestCount))

  return {
    id: normalizeText(row?.id),
    metricName,
    appRole: normalizeCatalogValue(metadata.appRole || row?.appRole, DASHBOARD_APP_ROLES),
    dashboardKind: normalizeCatalogValue(metadata.dashboardKind || row?.dashboardKind, DASHBOARD_KINDS),
    lifecycle: normalizeCatalogValue(metadata.lifecycle || row?.lifecycle, DASHBOARD_LIFECYCLES),
    outcome: normalizeCatalogValue(metadata.outcome || row?.outcome, DASHBOARD_OUTCOMES),
    preset: normalizeCatalogValue(metadata.preset || row?.preset, DASHBOARD_PRESETS),
    durationMs,
    requestCount,
    createdAt: normalizeText(row?.created_at || row?.createdAt),
  }
}

export function summarizeDashboardPerformanceSamples(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizeDashboardPerformanceRow).filter((row) => row.metricName)
  const successfulRows = normalizedRows.filter((row) => row.outcome === 'success')
  const durationRows = successfulRows.filter((row) => Number.isFinite(row.durationMs))
  const requestRows = successfulRows.filter((row) => Number.isFinite(row.requestCount))

  return {
    sampleCount: normalizedRows.length,
    successfulCount: successfulRows.length,
    failedCount: normalizedRows.filter((row) => row.outcome === 'failed').length,
    p50DurationMs: percentile(durationRows.map((row) => row.durationMs), 50),
    p95DurationMs: percentile(durationRows.map((row) => row.durationMs), 95),
    averageDurationMs: average(durationRows.map((row) => row.durationMs)),
    p50RequestCount: percentile(requestRows.map((row) => row.requestCount), 50),
    p95RequestCount: percentile(requestRows.map((row) => row.requestCount), 95),
    averageRequestCount: average(requestRows.map((row) => row.requestCount)),
  }
}

export function summarizeDashboardPerformanceByRole(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizeDashboardPerformanceRow).filter((row) => row.metricName)
  const grouped = normalizedRows.reduce((groups, row) => {
    const role = row.dashboardKind === 'agent' || row.dashboardKind === 'principal' ? row.dashboardKind : row.appRole
    if (!groups[role]) groups[role] = []
    groups[role].push(row)
    return groups
  }, {})

  return Object.fromEntries(
    Object.entries(grouped).map(([role, roleRows]) => [role, summarizeDashboardPerformanceSamples(roleRows)]),
  )
}

export function summarizeDashboardPerformanceRows(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizeDashboardPerformanceRow).filter((row) => row.metricName)
  const byMetric = normalizedRows.reduce((groups, row) => {
    if (!groups[row.metricName]) groups[row.metricName] = []
    groups[row.metricName].push(row)
    return groups
  }, {})

  return {
    contract: DASHBOARD_PERFORMANCE_TELEMETRY_CONTRACT,
    summary: summarizeDashboardPerformanceSamples(normalizedRows),
    byRole: summarizeDashboardPerformanceByRole(normalizedRows),
    byMetric: Object.fromEntries(
      Object.entries(byMetric).map(([metricName, metricRows]) => [metricName, summarizeDashboardPerformanceSamples(metricRows)]),
    ),
  }
}

function isMissingPerformanceSchema(error = {}) {
  const code = normalizeText(error?.code).toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return ['42p01', '42703', 'pgrst204', 'pgrst205'].includes(code) || message.includes('performance_metrics')
}

export async function fetchDashboardPerformanceSnapshot({
  hours = 24,
  limit = 1000,
  workspaceId = '',
  client = supabase,
  now = new Date(),
} = {}) {
  const generatedAt = now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : new Date().toISOString()
  const empty = {
    contract: DASHBOARD_PERFORMANCE_TELEMETRY_CONTRACT,
    generatedAt,
    ...summarizeDashboardPerformanceRows([]),
  }
  if (!isSupabaseConfigured || !client) {
    return { available: false, reason: 'performance_metrics_not_configured', ...empty }
  }

  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 24 * 31)
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000)
  const since = new Date(new Date(generatedAt).getTime() - safeHours * 60 * 60 * 1000).toISOString()
  let query = client
    .from('performance_metrics')
    .select('id, metric_name, duration_ms, value, unit, metadata, created_at')
    .in('metric_name', [...DASHBOARD_PERFORMANCE_METRIC_NAMES])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(safeLimit)
  if (normalizeText(workspaceId)) query = query.eq('workspace_id', normalizeText(workspaceId))

  try {
    const result = await query
    if (result.error) {
      return {
        available: false,
        reason: isMissingPerformanceSchema(result.error) ? 'performance_metrics_schema_missing' : result.error.message || 'performance_metrics_read_failed',
        ...empty,
      }
    }
    const rows = Array.isArray(result.data) ? result.data : []
    return {
      available: true,
      reason: null,
      windowHours: safeHours,
      rowCount: rows.length,
      ...empty,
      ...summarizeDashboardPerformanceRows(rows),
    }
  } catch {
    return { available: false, reason: 'performance_metrics_read_failed', ...empty }
  }
}
