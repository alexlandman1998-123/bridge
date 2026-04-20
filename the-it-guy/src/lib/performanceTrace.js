const PERF_DEBUG_STORAGE_KEY = 'itg:perf-debug'

function getNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
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
    // eslint-disable-next-line no-console
    console.debug(`[perf] ${scope} start`, context)
  }

  function mark(label, payload = {}) {
    if (!enabled) return
    const elapsedMs = Math.round(getNow() - startedAt)
    // eslint-disable-next-line no-console
    console.debug(`[perf] ${scope} :: ${label} (+${elapsedMs}ms)`, payload)
  }

  function end(payload = {}) {
    if (!enabled) return
    const totalMs = Math.round(getNow() - startedAt)
    // eslint-disable-next-line no-console
    console.debug(`[perf] ${scope} end (${totalMs}ms)`, payload)
  }

  return {
    enabled,
    mark,
    end,
  }
}

export function startRouteTransitionTrace({ from = '', to = '', label = 'route-transition' } = {}) {
  if (!isPerformanceTracingEnabled() || typeof window === 'undefined') {
    return
  }

  window.__itgRoutePerfTrace = {
    label: String(label || 'route-transition'),
    from: String(from || ''),
    to: String(to || ''),
    startedAt: getNow(),
    routeRenderedAt: null,
  }

  // eslint-disable-next-line no-console
  console.debug(`[perf] route transition start`, window.__itgRoutePerfTrace)
}

export function markRouteRendered(pathname = '') {
  if (!isPerformanceTracingEnabled() || typeof window === 'undefined') {
    return
  }

  const trace = window.__itgRoutePerfTrace
  if (!trace || trace.routeRenderedAt) {
    return
  }

  const expectedPath = String(trace.to || '')
  const normalizedPath = String(pathname || '')
  if (expectedPath && expectedPath !== normalizedPath) {
    return
  }

  trace.routeRenderedAt = getNow()
  const elapsedMs = Math.round(trace.routeRenderedAt - trace.startedAt)
  // eslint-disable-next-line no-console
  console.debug(`[perf] route rendered (+${elapsedMs}ms)`, {
    label: trace.label,
    from: trace.from,
    to: trace.to,
  })
}

export function markRouteFirstVisibleContent(pathname = '') {
  if (!isPerformanceTracingEnabled() || typeof window === 'undefined') {
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
  // eslint-disable-next-line no-console
  console.debug(`[perf] route first visible content (+${elapsedMs}ms)`, {
    label: trace.label,
    from: trace.from,
    to: trace.to,
  })

  window.__itgRoutePerfTrace = null
}
