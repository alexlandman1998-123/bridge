import {
  evaluateTargetFlowPerformanceBudget,
  TARGET_FLOW_HISTORY_STORAGE_KEY,
} from '../services/observability/targetFlowPerformanceBudget'

const PERF_DEBUG_STORAGE_KEY = 'itg:perf-debug'
const ROUTE_MILESTONE_PREFIX = 'arch9:route'

function getNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function normalizeRoute(pathname = '') {
  return String(pathname || '/').split('?')[0]
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ':id')
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:token')
}

function readRouteResourceSummary(startedAt = 0) {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return { requestCount: 0, duplicateRequestCount: 0, slowRequestCount: 0, routeChunkBytes: 0, routeChunkCount: 0 }
  }
  const resources = performance.getEntriesByType('resource').filter((entry) => Number(entry.startTime || 0) >= startedAt)
  const requests = resources.filter((entry) => /supabase\.co\/(?:rest|auth|storage|functions)\//i.test(String(entry.name || '')))
  const fingerprints = new Map()
  requests.forEach((entry) => {
    const key = String(entry.name || '').replace(/[?&](?:select|order|limit|offset)=[^&]*/g, '')
    fingerprints.set(key, (fingerprints.get(key) || 0) + 1)
  })
  const chunks = resources.filter((entry) => entry.initiatorType === 'script' || /\.js(?:\?|$)/i.test(String(entry.name || '')))
  return {
    requestCount: requests.length,
    duplicateRequestCount: [...fingerprints.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    slowRequestCount: requests.filter((entry) => Number(entry.duration || 0) >= 1000).length,
    routeChunkBytes: chunks.reduce((total, entry) => total + Math.max(0, Number(entry.transferSize || entry.encodedBodySize || 0)), 0),
    routeChunkCount: chunks.length,
  }
}

function persistTargetFlowSample(sample) {
  if (!sample.targetBudget?.targeted || typeof window === 'undefined') return
  try {
    const existing = JSON.parse(window.sessionStorage.getItem(TARGET_FLOW_HISTORY_STORAGE_KEY) || '[]')
    const history = [...(Array.isArray(existing) ? existing : []), sample].slice(-30)
    window.sessionStorage.setItem('arch9:route-performance-latest', JSON.stringify(sample))
    window.sessionStorage.setItem(TARGET_FLOW_HISTORY_STORAGE_KEY, JSON.stringify(history))
    window.dispatchEvent(new CustomEvent('arch9:route-performance', { detail: sample }))
  } catch {
    // Diagnostics must never interfere with route rendering.
  }
}

export function isPerformanceTracingEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  if (import.meta.env.DEV) {
    return true
  }

  try {
    return window.localStorage.getItem(PERF_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function createPerfTimer(scope, context = {}) {
  const enabled = isPerformanceTracingEnabled()
  const startedAt = getNow()

  if (enabled) {

    console.debug(`[perf] ${scope} start`, context)
  }

  function mark(label, payload = {}) {
    if (!enabled) return
    const elapsedMs = Math.round(getNow() - startedAt)

    console.debug(`[perf] ${scope} :: ${label} (+${elapsedMs}ms)`, payload)
  }

  function end(payload = {}) {
    if (!enabled) return
    const totalMs = Math.round(getNow() - startedAt)

    console.debug(`[perf] ${scope} end (${totalMs}ms)`, payload)
  }

  return {
    enabled,
    mark,
    end,
  }
}

export function markRouteMilestone(milestone = '', pathname = '') {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return
  const normalizedMilestone = String(milestone || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
  if (!normalizedMilestone) return
  const normalizedPath = String(pathname || (typeof window !== 'undefined' ? window.location.pathname : '') || '/')
  performance.mark(`${ROUTE_MILESTONE_PREFIX}:${normalizedMilestone}`, {
    detail: { pathname: normalizedPath },
  })
}

export function bondPerfLog(label = '', startedAt = 0, payload = {}) {
  if (!isPerformanceTracingEnabled()) return
  const now = startedAt > 1_000_000_000_000 ? Date.now() : getNow()
  const elapsedMs = Math.round(now - startedAt)

  console.debug(`[bond-perf] ${label} ${elapsedMs}ms`, payload)
}

export function startRouteTransitionTrace({ from = '', to = '', label = 'route-transition' } = {}) {
  if (typeof window === 'undefined') {
    return
  }

  window.__itgRoutePerfTrace = {
    label: String(label || 'route-transition'),
    from: String(from || ''),
    to: String(to || ''),
    startedAt: getNow(),
    routeRenderedAt: null,
  }

  if (isPerformanceTracingEnabled()) console.debug(`[perf] route transition start`, window.__itgRoutePerfTrace)
}

export function markRouteRendered(pathname = '') {
  markRouteMilestone('route_rendered', pathname)
  if (typeof window === 'undefined') {
    return
  }

  const normalizedPath = String(pathname || '')
  const trace = window.__itgRoutePerfTrace || {
    label: 'cold-route-bootstrap', from: '', to: normalizedPath, startedAt: 0, routeRenderedAt: null,
  }
  window.__itgRoutePerfTrace = trace
  if (trace.routeRenderedAt) {
    return
  }

  const expectedPath = String(trace.to || '')
  if (expectedPath && expectedPath !== normalizedPath) {
    return
  }

  trace.routeRenderedAt = getNow()
  const elapsedMs = Math.round(trace.routeRenderedAt - trace.startedAt)

  if (isPerformanceTracingEnabled()) console.debug(`[perf] route rendered (+${elapsedMs}ms)`, {
    label: trace.label,
    from: trace.from,
    to: trace.to,
  })
}

export function markRouteFirstVisibleContent(pathname = '') {
  markRouteMilestone('shell_ready', pathname)
  if (typeof window === 'undefined') {
    return
  }

  const trace = window.__itgRoutePerfTrace
  if (!trace) {
    return
  }

  const expectedPath = String(trace.to || '')
  const normalizedPath = String(pathname || '')
  if (expectedPath && expectedPath !== normalizedPath) {
    return
  }

  const firstVisibleAt = getNow()
  const elapsedMs = Math.round(firstVisibleAt - trace.startedAt)

  const route = normalizeRoute(normalizedPath)
  const sample = {
    route,
    routeStartedAt: trace.startedAt,
    firstUsefulContentMs: elapsedMs,
    schemaErrorCount: 0,
    metadata: { source: trace.label === 'cold-route-bootstrap' ? 'cold_boot' : 'route_transition' },
    ...readRouteResourceSummary(trace.startedAt),
  }
  sample.targetBudget = evaluateTargetFlowPerformanceBudget(sample)
  persistTargetFlowSample(sample)

  if (isPerformanceTracingEnabled()) console.debug(`[perf] route first visible content (+${elapsedMs}ms)`, {
    label: trace.label,
    from: trace.from,
    to: trace.to,
    targetBudget: sample.targetBudget,
  })

  window.__itgRoutePerfTrace = null
}
