const CONTRACT_VERSION = 'arch9-navigation-query-budget-v1'
const STORAGE_KEY = 'arch9:navigation-performance'
const MAX_SESSION_MEASUREMENTS = 50

export const NAVIGATION_QUERY_BUDGET = Object.freeze({
  reportQueriesWhileDisabled: Object.freeze({ limit: 0 }),
  organisationContextResolutionsPerSession: Object.freeze({ limit: 1 }),
  duplicateIdenticalRequestsInFlight: Object.freeze({ limit: 0 }),
  menuFeedbackMs: Object.freeze({ limit: 100 }),
  cachedRouteVisibleMs: Object.freeze({ limit: 500 }),
  firstRouteVisibleMs: Object.freeze({ limit: 1500 }),
})

function finiteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function evaluateMetric(metric, actual, rule) {
  const normalized = Math.round(finiteNumber(actual) * 10) / 10
  return normalized > rule.limit
    ? { metric, actual: normalized, limit: rule.limit }
    : null
}

export function evaluateNavigationQueryBudget({
  reportQueriesWhileDisabled = 0,
  organisationContextResolutionsPerSession = 0,
  duplicateIdenticalRequestsInFlight = 0,
  menuFeedbackMs = 0,
  routeVisibleMs = 0,
  cached = false,
} = {}) {
  const routeMetric = cached ? 'cachedRouteVisibleMs' : 'firstRouteVisibleMs'
  const violations = [
    evaluateMetric('reportQueriesWhileDisabled', reportQueriesWhileDisabled, NAVIGATION_QUERY_BUDGET.reportQueriesWhileDisabled),
    evaluateMetric('organisationContextResolutionsPerSession', organisationContextResolutionsPerSession, NAVIGATION_QUERY_BUDGET.organisationContextResolutionsPerSession),
    evaluateMetric('duplicateIdenticalRequestsInFlight', duplicateIdenticalRequestsInFlight, NAVIGATION_QUERY_BUDGET.duplicateIdenticalRequestsInFlight),
    evaluateMetric('menuFeedbackMs', menuFeedbackMs, NAVIGATION_QUERY_BUDGET.menuFeedbackMs),
    evaluateMetric(routeMetric, routeVisibleMs, NAVIGATION_QUERY_BUDGET[routeMetric]),
  ].filter(Boolean)

  return {
    contract: CONTRACT_VERSION,
    status: violations.length ? 'FAIL' : 'PASS',
    violations,
  }
}

function persistSessionMeasurement(measurement) {
  if (typeof window === 'undefined') return
  try {
    const existing = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '[]')
    const measurements = [...(Array.isArray(existing) ? existing : []), measurement]
      .slice(-MAX_SESSION_MEASUREMENTS)
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(measurements))
    window.dispatchEvent(new CustomEvent('arch9:navigation-performance', { detail: measurement }))
  } catch {
    // Session storage and CustomEvent are best-effort and must never block navigation.
  }
}

export function createNavigationPerformanceTracker({
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  onMeasurement = persistSessionMeasurement,
} = {}) {
  const active = new Map()
  let sequence = 0

  function start({ target = '', label = '', cached = false } = {}) {
    sequence += 1
    const id = `navigation-${sequence}`
    active.set(id, {
      id,
      target: String(target || ''),
      label: String(label || ''),
      cached: Boolean(cached),
      startedAt: now(),
      feedbackAt: null,
    })
    return id
  }

  function feedback(id) {
    const measurement = active.get(id)
    if (!measurement || measurement.feedbackAt !== null) return false
    measurement.feedbackAt = now()
    return true
  }

  function complete(id) {
    const measurement = active.get(id)
    if (!measurement) return null
    const completedAt = now()
    const menuFeedbackMs = finiteNumber((measurement.feedbackAt ?? completedAt) - measurement.startedAt)
    const routeVisibleMs = finiteNumber(completedAt - measurement.startedAt)
    const result = {
      contract: CONTRACT_VERSION,
      target: measurement.target,
      label: measurement.label,
      cached: measurement.cached,
      menuFeedbackMs: Math.round(menuFeedbackMs * 10) / 10,
      routeVisibleMs: Math.round(routeVisibleMs * 10) / 10,
      budget: evaluateNavigationQueryBudget({
        menuFeedbackMs,
        routeVisibleMs,
        cached: measurement.cached,
      }),
    }
    active.delete(id)
    onMeasurement(result)
    return result
  }

  function cancel(id) {
    return active.delete(id)
  }

  return { start, feedback, complete, cancel }
}

const tracker = createNavigationPerformanceTracker()

export const startNavigationMeasurement = (details) => tracker.start(details)
export const markNavigationFeedback = (id) => tracker.feedback(id)
export const completeNavigationMeasurement = (id) => tracker.complete(id)
export const cancelNavigationMeasurement = (id) => tracker.cancel(id)

export { CONTRACT_VERSION, MAX_SESSION_MEASUREMENTS, STORAGE_KEY }
