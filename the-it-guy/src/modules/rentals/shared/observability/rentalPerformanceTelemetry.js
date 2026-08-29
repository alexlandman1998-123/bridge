import { recordPerformanceMetric } from '../../../../services/observability/performanceMetrics.js'
import { trackTelemetryEvent } from '../../../../services/observability/telemetry.js'

export const RENTAL_PERFORMANCE_CONTRACT_VERSION = 'arch9_rentals_performance_v1'

export const RENTAL_PERFORMANCE_METRICS = Object.freeze({
  routeShellReady: 'rentals.route.shell_ready',
  routeFirstData: 'rentals.route.first_data',
  interaction: 'rentals.interaction.complete',
  query: 'rentals.query.complete',
  job: 'rentals.job.complete',
})

export const RENTAL_PERFORMANCE_BUDGETS = Object.freeze({
  [RENTAL_PERFORMANCE_METRICS.routeShellReady]: { durationMs: 1500, requestCount: 8, payloadBytes: 500_000 },
  [RENTAL_PERFORMANCE_METRICS.routeFirstData]: { durationMs: 3000, requestCount: 12, payloadBytes: 800_000 },
  [RENTAL_PERFORMANCE_METRICS.interaction]: { durationMs: 150 },
  [RENTAL_PERFORMANCE_METRICS.query]: { durationMs: 1000, payloadBytes: 250_000 },
  [RENTAL_PERFORMANCE_METRICS.job]: { durationMs: 30_000 },
})

const METRIC_NAMES = new Set(Object.values(RENTAL_PERFORMANCE_METRICS))
const OUTCOME_NAMES = new Set(['success', 'failed', 'cancelled', 'skipped'])
const TELEMETRY_PATHS = ['/rest/v1/performance_metrics', '/rest/v1/telemetry_events', '/rest/v1/error_events']

function text(value) {
  return String(value ?? '').trim()
}

function number(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function now(performanceApi) {
  return typeof performanceApi?.now === 'function' ? performanceApi.now() : Date.now()
}

function normalizeRoute(route = '') {
  const pathname = text(route).split('?')[0].split('#')[0]
  if (!pathname.startsWith('/agent/rentals')) return '/agent/rentals'
  return pathname.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/ig, '/:id').slice(0, 160)
}

function resourcePath(name = '') {
  try {
    return new URL(text(name), 'https://arch9.invalid').pathname.toLowerCase()
  } catch {
    return text(name).split('?')[0].split('#')[0].toLowerCase()
  }
}

function isTelemetryResource(entry = {}) {
  const path = resourcePath(entry.name)
  return TELEMETRY_PATHS.some((prefix) => path.startsWith(prefix))
}

function uniqueNewResources(entries = [], baseline = []) {
  const counts = new Map()
  for (const entry of baseline) {
    const key = `${text(entry?.name)}|${number(entry?.startTime, 0)}|${number(entry?.responseEnd, 0)}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return entries.filter((entry) => {
    const key = `${text(entry?.name)}|${number(entry?.startTime, 0)}|${number(entry?.responseEnd, 0)}`
    const count = counts.get(key) || 0
    if (!count) return true
    counts.set(key, count - 1)
    return false
  })
}

export function summarizeRentalResources({ entries = [], baselineEntries = [], startedAt = 0, endedAt = Number.POSITIVE_INFINITY } = {}) {
  if (!Array.isArray(entries)) return { available: false, requestCount: null, payloadBytes: null, slowestRequestMs: null }
  const relevant = uniqueNewResources(entries, baselineEntries).filter((entry) => {
    const started = number(entry?.startTime, 0)
    return started >= Number(startedAt || 0) && started <= Number(endedAt) && !isTelemetryResource(entry)
  })
  const durations = relevant.map((entry) => number(entry?.duration, 0)).filter((value) => value >= 0)
  const payloadBytes = relevant.reduce((total, entry) => total + Math.max(0, number(entry?.transferSize, 0)), 0)
  return {
    available: true,
    requestCount: relevant.length,
    payloadBytes: Math.round(payloadBytes),
    slowestRequestMs: durations.length ? Math.round(Math.max(...durations)) : 0,
  }
}

export function createRentalPerformanceTrace({ metricName = '', route = '', performanceApi = typeof performance !== 'undefined' ? performance : null } = {}) {
  const metric = METRIC_NAMES.has(metricName) ? metricName : ''
  const baselineEntries = typeof performanceApi?.getEntriesByType === 'function' ? performanceApi.getEntriesByType('resource') || [] : null
  const startedAt = now(performanceApi)
  return {
    contract: RENTAL_PERFORMANCE_CONTRACT_VERSION,
    metricName: metric,
    route: normalizeRoute(route),
    startedAt,
    finish({ endedAt = now(performanceApi), outcome = 'success', metadata = {} } = {}) {
      const currentEntries = typeof performanceApi?.getEntriesByType === 'function' ? performanceApi.getEntriesByType('resource') || [] : null
      const resources = summarizeRentalResources({ entries: currentEntries, baselineEntries: baselineEntries || [], startedAt, endedAt })
      return {
        contract: RENTAL_PERFORMANCE_CONTRACT_VERSION,
        metricName: metric,
        route: normalizeRoute(route),
        durationMs: Math.max(0, Math.round(number(endedAt, startedAt) - startedAt)),
        outcome: OUTCOME_NAMES.has(text(outcome)) ? text(outcome) : 'failed',
        resources,
        metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
      }
    },
  }
}

export function evaluateRentalPerformanceSample(sample = {}) {
  const budget = RENTAL_PERFORMANCE_BUDGETS[sample.metricName]
  if (!budget) return { accepted: false, pass: false, violations: ['unknown_metric'] }
  const violations = []
  const duration = number(sample.durationMs)
  const requests = number(sample?.resources?.requestCount)
  const payload = number(sample?.resources?.payloadBytes)
  if (duration !== null && duration > budget.durationMs) violations.push('duration_ms')
  if (budget.requestCount && requests !== null && requests > budget.requestCount) violations.push('request_count')
  if (budget.payloadBytes && payload !== null && payload > budget.payloadBytes) violations.push('payload_bytes')
  if (sample.outcome && sample.outcome !== 'success') violations.push('outcome')
  return { accepted: true, pass: violations.length === 0, budget, violations }
}

function percentile(values = [], p = 95) {
  const sorted = values.map((value) => number(value)).filter((value) => value !== null).sort((a, b) => a - b)
  if (!sorted.length) return null
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}

export function buildRentalPerformanceReport(samples = []) {
  const rows = Array.isArray(samples) ? samples : []
  const byMetric = {}
  for (const metricName of Object.values(RENTAL_PERFORMANCE_METRICS)) {
    const metricRows = rows.filter((row) => row?.metricName === metricName)
    const evaluations = metricRows.map(evaluateRentalPerformanceSample)
    byMetric[metricName] = {
      sampleCount: metricRows.length,
      passingCount: evaluations.filter((row) => row.pass).length,
      failedCount: evaluations.filter((row) => !row.pass).length,
      p50DurationMs: percentile(metricRows.map((row) => row.durationMs), 50),
      p95DurationMs: percentile(metricRows.map((row) => row.durationMs), 95),
      maxRequestCount: Math.max(0, ...metricRows.map((row) => number(row?.resources?.requestCount, 0))),
      maxPayloadBytes: Math.max(0, ...metricRows.map((row) => number(row?.resources?.payloadBytes, 0))),
    }
  }
  return { contract: RENTAL_PERFORMANCE_CONTRACT_VERSION, generatedAt: new Date().toISOString(), sampleCount: rows.length, byMetric }
}

function dispatch(transport, payload) {
  if (typeof transport !== 'function') return false
  try {
    const result = transport(payload)
    if (result?.catch) void result.catch(() => {})
    return true
  } catch {
    return false
  }
}

export function persistRentalPerformanceSample(sample = {}, { userId = '', workspaceId = '', transport = recordPerformanceMetric, telemetryTransport = trackTelemetryEvent } = {}) {
  const evaluation = evaluateRentalPerformanceSample(sample)
  if (!evaluation.accepted) return { accepted: false, persisted: false, evaluation }
  const payload = {
    metricName: sample.metricName, durationMs: sample.durationMs, value: sample?.resources?.requestCount ?? null, unit: 'requests',
    performanceBudgetMs: evaluation.budget.durationMs, userId: text(userId), workspaceId: text(workspaceId), route: normalizeRoute(sample.route),
    metadata: { contract: RENTAL_PERFORMANCE_CONTRACT_VERSION, outcome: sample.outcome, requestCount: sample?.resources?.requestCount ?? null, payloadBytes: sample?.resources?.payloadBytes ?? null, slowestRequestMs: sample?.resources?.slowestRequestMs ?? null },
  }
  const persisted = dispatch(transport, payload)
  const alerted = !evaluation.pass && dispatch(telemetryTransport, {
    category: 'performance', eventName: 'rental_performance_budget_breached', severity: 'warning', userId: text(userId), workspaceId: text(workspaceId), route: normalizeRoute(sample.route),
    metadata: { metricName: sample.metricName, violations: evaluation.violations, durationMs: sample.durationMs, requestCount: sample?.resources?.requestCount ?? null, payloadBytes: sample?.resources?.payloadBytes ?? null },
  })
  return { accepted: true, persisted, alerted, evaluation, payload }
}
