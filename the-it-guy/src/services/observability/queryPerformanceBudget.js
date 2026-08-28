const CONTRACT_VERSION = 'arch9-query-performance-budget-v1'

export const QUERY_WINDOW_BUDGET = Object.freeze({
  requestsPerMinute: { limit: 120, severity: 'warn' },
  routeLoadRequests: { limit: 40, severity: 'warn' },
  idleRequests: { limit: 10, severity: 'fail' },
  requestP95Ms: { limit: 2000, severity: 'warn' },
  errorCount: { limit: 2, severity: 'warn' },
  schemaErrorCount: { limit: 0, severity: 'fail' },
  peakRealtimeChannels: { limit: 8, severity: 'fail' },
})

export const QUERY_RELEASE_BUDGET = Object.freeze({
  minimumSampledWindows: 12,
  maximumTelemetryAgeHours: 48,
  requestsPerMinuteP95: { limit: 60, severity: 'warn' },
  routeLoadRequestsP95: { limit: 30, severity: 'fail' },
  idleRequestsP95: { limit: 5, severity: 'fail' },
  requestLatencyP95Ms: { limit: 1500, severity: 'fail' },
  errorRate: { limit: 0.05, severity: 'warn' },
  schemaErrorCount: { limit: 0, severity: 'fail' },
  peakRealtimeChannels: { limit: 8, severity: 'fail' },
  database: Object.freeze({
    minimumElapsedHours: 0.25,
    statementCallsPerHour: { limit: 5000, severity: 'fail' },
    statementExecutionMsPerHour: { limit: 300000, severity: 'fail' },
    totalExecutionMsPerHour: { limit: 900000, severity: 'fail' },
  }),
})

function finiteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = values.map(finiteNumber).sort((left, right) => left - right)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] * 10) / 10
}

export function buildQueryDatabaseDelta(previous, current) {
  if (!previous || !current) {
    return { comparable: false, elapsedHours: 0, reason: 'two_snapshots_required', statements: [] }
  }
  if (previous.stats_reset !== current.stats_reset) {
    return { comparable: false, elapsedHours: 0, reason: 'pg_stat_statements_reset_changed', statements: [] }
  }

  const previousCapturedAt = Date.parse(previous.captured_at || '')
  const currentCapturedAt = Date.parse(current.captured_at || '')
  const elapsedHours = (currentCapturedAt - previousCapturedAt) / 3_600_000
  if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) {
    return { comparable: false, elapsedHours: 0, reason: 'snapshot_order_invalid', statements: [] }
  }

  const prior = new Map((previous.statements || []).map((row) => [String(row.queryId), row]))
  const statements = (current.statements || []).map((row) => {
    const queryId = String(row.queryId)
    const before = prior.get(queryId) || {}
    return {
      queryId,
      calls: Math.max(0, finiteNumber(row.calls) - finiteNumber(before.calls)),
      totalExecTimeMs: Math.max(
        0,
        finiteNumber(row.totalExecTimeMs) - finiteNumber(before.totalExecTimeMs),
      ),
    }
  })

  return {
    comparable: true,
    elapsedHours,
    statements,
    topByCalls: [...statements].sort((left, right) => right.calls - left.calls).slice(0, 50),
    topByExecutionTime: [...statements]
      .sort((left, right) => right.totalExecTimeMs - left.totalExecTimeMs)
      .slice(0, 50),
  }
}

function violation(metric, actual, rule, scope = 'window') {
  if (!rule || finiteNumber(actual) <= finiteNumber(rule.limit)) return null
  return {
    scope,
    metric,
    actual: Math.round(finiteNumber(actual) * 1000) / 1000,
    limit: finiteNumber(rule.limit),
    severity: rule.severity === 'fail' ? 'fail' : 'warn',
  }
}

function statusFromViolations(violations) {
  if (violations.some((item) => item.severity === 'fail')) return 'FAIL'
  if (violations.length) return 'WARN'
  return 'PASS'
}

export function evaluateQueryWindowBudget(summary = {}, budget = QUERY_WINDOW_BUDGET) {
  const violations = Object.entries(budget)
    .map(([metric, rule]) => violation(metric, summary[metric], rule))
    .filter(Boolean)

  return {
    contract: CONTRACT_VERSION,
    status: statusFromViolations(violations),
    violations,
  }
}

function normalizeDatabaseDelta(databaseDelta, databaseBudget) {
  const elapsedHours = finiteNumber(databaseDelta?.elapsedHours)
  const comparable = databaseDelta?.comparable === true && elapsedHours >= databaseBudget.minimumElapsedHours
  const statements = new Map()

  for (const item of databaseDelta?.statements || []) {
    statements.set(String(item.queryId), {
      queryId: String(item.queryId),
      calls: finiteNumber(item.calls),
      totalExecTimeMs: finiteNumber(item.totalExecTimeMs),
    })
  }
  for (const item of databaseDelta?.topByCalls || []) {
    const key = String(item.queryId)
    const current = statements.get(key) || { queryId: key, calls: 0, totalExecTimeMs: 0 }
    current.calls = Math.max(current.calls, finiteNumber(item.calls))
    current.totalExecTimeMs = Math.max(current.totalExecTimeMs, finiteNumber(item.totalExecTimeMs))
    statements.set(key, current)
  }
  for (const item of databaseDelta?.topByExecutionTime || []) {
    const key = String(item.queryId)
    const current = statements.get(key) || { queryId: key, calls: 0, totalExecTimeMs: 0 }
    current.calls = Math.max(current.calls, finiteNumber(item.calls))
    current.totalExecTimeMs = Math.max(current.totalExecTimeMs, finiteNumber(item.totalExecTimeMs))
    statements.set(key, current)
  }

  const normalized = [...statements.values()].map((item) => ({
    ...item,
    callsPerHour: elapsedHours > 0 ? item.calls / elapsedHours : 0,
    executionMsPerHour: elapsedHours > 0 ? item.totalExecTimeMs / elapsedHours : 0,
  }))

  return {
    comparable,
    elapsedHours,
    statements: normalized,
    maxStatementCallsPerHour: Math.max(0, ...normalized.map((item) => item.callsPerHour)),
    maxStatementExecutionMsPerHour: Math.max(0, ...normalized.map((item) => item.executionMsPerHour)),
    totalExecutionMsPerHour: elapsedHours > 0
      ? normalized.reduce((sum, item) => sum + item.totalExecTimeMs, 0) / elapsedHours
      : 0,
  }
}

export function evaluateQueryReleaseBudget({
  windows = [],
  databaseDelta = null,
  now = Date.now(),
  budget = QUERY_RELEASE_BUDGET,
} = {}) {
  const normalizedWindows = windows.map((row) => row?.metadata || row || {})
  const latestTimestamp = windows
    .map((row) => Date.parse(row?.created_at || row?.createdAt || row?.metadata?.windowEndedAt || ''))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0]
  const telemetryAgeHours = latestTimestamp == null ? null : Math.max(0, (now - latestTimestamp) / 3_600_000)
  const telemetryReady = normalizedWindows.length >= budget.minimumSampledWindows
    && telemetryAgeHours != null
    && telemetryAgeHours <= budget.maximumTelemetryAgeHours
  const database = normalizeDatabaseDelta(databaseDelta, budget.database)

  const totalRequests = normalizedWindows.reduce((sum, row) => sum + finiteNumber(row.requestCount), 0)
  const metrics = {
    requestsPerMinuteP95: percentile(normalizedWindows.map((row) => row.requestsPerMinute), 0.95),
    routeLoadRequestsP95: percentile(normalizedWindows.map((row) => row.routeLoadRequests), 0.95),
    idleRequestsP95: percentile(normalizedWindows.map((row) => row.idleRequests), 0.95),
    requestLatencyP95Ms: percentile(normalizedWindows.map((row) => row.requestP95Ms), 0.95),
    errorRate: totalRequests > 0
      ? normalizedWindows.reduce((sum, row) => sum + finiteNumber(row.errorCount), 0) / totalRequests
      : 0,
    schemaErrorCount: normalizedWindows.reduce((sum, row) => sum + finiteNumber(row.schemaErrorCount), 0),
    peakRealtimeChannels: Math.max(0, ...normalizedWindows.map((row) => finiteNumber(row.peakRealtimeChannels))),
  }

  const violations = [
    violation('requestsPerMinuteP95', metrics.requestsPerMinuteP95, budget.requestsPerMinuteP95, 'telemetry'),
    violation('routeLoadRequestsP95', metrics.routeLoadRequestsP95, budget.routeLoadRequestsP95, 'telemetry'),
    violation('idleRequestsP95', metrics.idleRequestsP95, budget.idleRequestsP95, 'telemetry'),
    violation('requestLatencyP95Ms', metrics.requestLatencyP95Ms, budget.requestLatencyP95Ms, 'telemetry'),
    violation('errorRate', metrics.errorRate, budget.errorRate, 'telemetry'),
    violation('schemaErrorCount', metrics.schemaErrorCount, budget.schemaErrorCount, 'telemetry'),
    violation('peakRealtimeChannels', metrics.peakRealtimeChannels, budget.peakRealtimeChannels, 'telemetry'),
  ].filter(Boolean)

  if (database.comparable) {
    violations.push(...[
      violation(
        'statementCallsPerHour',
        database.maxStatementCallsPerHour,
        budget.database.statementCallsPerHour,
        'database',
      ),
      violation(
        'statementExecutionMsPerHour',
        database.maxStatementExecutionMsPerHour,
        budget.database.statementExecutionMsPerHour,
        'database',
      ),
      violation(
        'totalExecutionMsPerHour',
        database.totalExecutionMsPerHour,
        budget.database.totalExecutionMsPerHour,
        'database',
      ),
    ].filter(Boolean))
  }

  const coverage = {
    telemetry: telemetryReady,
    database: database.comparable,
    sampledWindows: normalizedWindows.length,
    minimumSampledWindows: budget.minimumSampledWindows,
    telemetryAgeHours: telemetryAgeHours == null ? null : Math.round(telemetryAgeHours * 10) / 10,
    maximumTelemetryAgeHours: budget.maximumTelemetryAgeHours,
    databaseElapsedHours: database.elapsedHours,
    minimumDatabaseElapsedHours: budget.database.minimumElapsedHours,
  }
  const ready = coverage.telemetry && coverage.database

  return {
    contract: CONTRACT_VERSION,
    status: ready ? statusFromViolations(violations) : 'INSUFFICIENT_DATA',
    ready,
    coverage,
    metrics,
    database: {
      comparable: database.comparable,
      elapsedHours: database.elapsedHours,
      maxStatementCallsPerHour: Math.round(database.maxStatementCallsPerHour * 10) / 10,
      maxStatementExecutionMsPerHour: Math.round(database.maxStatementExecutionMsPerHour * 10) / 10,
      totalExecutionMsPerHour: Math.round(database.totalExecutionMsPerHour * 10) / 10,
    },
    violations,
  }
}

export { CONTRACT_VERSION }
