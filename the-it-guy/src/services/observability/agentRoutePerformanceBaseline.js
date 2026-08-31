import { recordPerformanceMetric } from './performanceMetrics.js'

export const AGENT_ROUTE_BASELINE_CONTRACT = 'arch9-agent-route-performance-baseline-v2'

export const AGENT_ROUTE_BASELINE_SURFACES = Object.freeze({
  clients: Object.freeze({ route: '/clients', coreBudgetMs: 2500, settledBudgetMs: 5000 }),
  listings: Object.freeze({ route: '/listings', coreBudgetMs: 2500, settledBudgetMs: 5000 }),
  canvassing: Object.freeze({ route: '/pipeline/canvassing', coreBudgetMs: 2500, settledBudgetMs: 5000 }),
})

function now(performanceApi) {
  return typeof performanceApi?.now === 'function' ? performanceApi.now() : Date.now()
}

function normalizeRoute(route = '') {
  return String(route || '/').split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:id')
}

function requestPath(name = '') {
  try {
    const url = new URL(String(name || ''))
    return `${url.hostname}${url.pathname}`
  } catch {
    return String(name || '').split('?')[0]
  }
}

function isTelemetryRequest(name = '') {
  return /\/(?:performance_metrics|telemetry_events)(?:\?|$)/.test(String(name || ''))
}

function isApplicationRequest(name = '') {
  return /\.supabase\.co\/|\/api\//i.test(String(name || ''))
}

export function summarizeAgentRouteResources({ performanceApi, startedAt = 0 } = {}) {
  const resources = typeof performanceApi?.getEntriesByType === 'function'
    ? (performanceApi.getEntriesByType('resource') || [])
      .filter((entry) => Number(entry?.startTime || 0) >= Number(startedAt || 0) && !isTelemetryRequest(entry?.name))
    : []
  const requests = resources.filter((entry) => isApplicationRequest(entry?.name))
  const fingerprints = new Map()
  for (const entry of requests) {
    const path = requestPath(entry?.name)
    fingerprints.set(path, (fingerprints.get(path) || 0) + 1)
  }
  return {
    requestCount: requests.length,
    duplicateRequestCount: [...fingerprints.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    slowRequestCount: requests.filter((entry) => Number(entry?.duration || 0) >= 1000).length,
    transferredBytes: Math.round(resources.reduce((total, entry) => total + Math.max(0, Number(entry?.transferSize || 0)), 0)),
    slowestRequests: [...requests]
      .sort((left, right) => Number(right?.duration || 0) - Number(left?.duration || 0))
      .slice(0, 5)
      .map((entry) => ({ path: requestPath(entry?.name), durationMs: Math.round(Number(entry?.duration || 0)) })),
  }
}

function resolveStart({ route, windowApi }) {
  const trace = windowApi?.__itgRoutePerfTrace
  const traceStartedAt = Number(trace?.startedAt)
  if (
    Number.isFinite(traceStartedAt) &&
    traceStartedAt >= 0 &&
    normalizeRoute(trace?.to) === normalizeRoute(route)
  ) {
    return { startedAt: traceStartedAt, temperature: 'warm', timingOrigin: 'route_transition' }
  }
  return { startedAt: 0, temperature: 'cold', timingOrigin: 'navigation_start' }
}

export function createAgentRoutePerformanceBaseline({
  surface = '',
  route = '',
  performanceApi = typeof performance !== 'undefined' ? performance : null,
  windowApi = typeof window !== 'undefined' ? window : null,
  recorder = recordPerformanceMetric,
} = {}) {
  const config = AGENT_ROUTE_BASELINE_SURFACES[surface]
  const normalizedRoute = normalizeRoute(route || config?.route || '/')
  const session = resolveStart({ route: normalizedRoute, windowApi })
  const completed = new Set()

  return {
    contract: AGENT_ROUTE_BASELINE_CONTRACT,
    surface,
    route: normalizedRoute,
    startedAt: session.startedAt,
    temperature: session.temperature,
    recordCheckpoint({ checkpoint = '', userId = '', workspaceId = '', metadata = {} } = {}) {
      if (!config || !['shell_ready', 'core_ready', 'settled'].includes(checkpoint)) {
        return Promise.resolve({ persisted: false, reason: 'unknown_checkpoint' })
      }
      if (completed.has(checkpoint)) {
        return Promise.resolve({ persisted: false, reason: 'checkpoint_already_recorded' })
      }
      completed.add(checkpoint)
      const durationMs = Math.max(0, Math.round(now(performanceApi) - session.startedAt))
      const resources = checkpoint === 'settled'
        ? summarizeAgentRouteResources({ performanceApi, startedAt: session.startedAt })
        : {}
      const performanceBudgetMs = checkpoint === 'core_ready'
        ? config.coreBudgetMs
        : checkpoint === 'settled'
          ? config.settledBudgetMs
          : 1500
      const sample = {
        contract: AGENT_ROUTE_BASELINE_CONTRACT,
        surface,
        checkpoint,
        temperature: session.temperature,
        timingOrigin: session.timingOrigin,
        ...resources,
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
      }
      if (windowApi?.dispatchEvent && typeof windowApi.CustomEvent === 'function') {
        windowApi.dispatchEvent(new windowApi.CustomEvent('arch9:agent-route-performance', {
          detail: { route: normalizedRoute, durationMs, metadata: sample },
        }))
      }
      return recorder({
        metricName: `agent_${surface}.route.${checkpoint}`,
        durationMs,
        performanceBudgetMs,
        userId,
        workspaceId,
        route: normalizedRoute,
        metadata: sample,
      })
    },
  }
}

function percentile(values = [], fraction = 0.95) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]
}

export function summarizeAgentRouteBaseline(samples = []) {
  const groups = {}
  for (const sample of Array.isArray(samples) ? samples : []) {
    const surface = String(sample?.surface || sample?.metadata?.surface || '').trim()
    const checkpoint = String(sample?.checkpoint || sample?.metadata?.checkpoint || '').trim()
    const temperature = String(sample?.temperature || sample?.metadata?.temperature || '').trim() || 'unknown'
    if (!surface || !checkpoint) continue
    const key = `${surface}:${temperature}:${checkpoint}`
    groups[key] ||= { surface, temperature, checkpoint, durations: [], requestCounts: [], slowRequestCounts: [] }
    groups[key].durations.push(Number(sample.durationMs ?? sample.duration_ms))
    const requestCount = Number(sample.requestCount ?? sample?.metadata?.requestCount)
    const slowRequestCount = Number(sample.slowRequestCount ?? sample?.metadata?.slowRequestCount)
    if (Number.isFinite(requestCount)) groups[key].requestCounts.push(requestCount)
    if (Number.isFinite(slowRequestCount)) groups[key].slowRequestCounts.push(slowRequestCount)
  }
  return Object.values(groups).map((group) => ({
    surface: group.surface,
    temperature: group.temperature,
    checkpoint: group.checkpoint,
    sampleCount: group.durations.filter(Number.isFinite).length,
    p50Ms: percentile(group.durations, 0.5),
    p95Ms: percentile(group.durations, 0.95),
    requestCountP95: percentile(group.requestCounts, 0.95),
    slowRequestCountP95: percentile(group.slowRequestCounts, 0.95),
  }))
}
