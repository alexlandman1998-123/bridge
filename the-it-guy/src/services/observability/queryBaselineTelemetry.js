import { evaluateQueryWindowBudget } from './queryPerformanceBudget.js'
import { evaluateTargetFlowPerformanceBudget } from './targetFlowPerformanceBudget.js'

const CONTRACT_VERSION = 'arch9-query-baseline-v1'
const DEFAULT_WINDOW_MS = 5 * 60 * 1000
const ROUTE_LOAD_MS = 15 * 1000
const SLOW_REQUEST_MS = 1000
const OBSERVABILITY_RESOURCES = new Set(['performance_metrics', 'telemetry_events', 'error_events'])
const SCHEMA_ERROR_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205'])

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] * 10) / 10
}

function requestUrl(input) {
  return typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '')
}

function hashRequestSignature(value = '') {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function createRequestFingerprint(input, init = {}) {
  const method = String(init?.method || input?.method || 'GET').toUpperCase()
  return hashRequestSignature(`${method}:${requestUrl(input)}`)
}

function summarizeRequestRecords(records = []) {
  const resources = new Map()
  const fingerprints = new Map()
  const kinds = {}
  for (const record of records) {
    kinds[record.kind] = (kinds[record.kind] || 0) + 1
    const resourceKey = `${record.kind}:${record.resource}`
    resources.set(resourceKey, (resources.get(resourceKey) || 0) + 1)
    if (record.fingerprint) {
      const current = fingerprints.get(record.fingerprint) || {
        fingerprint: record.fingerprint,
        kind: record.kind,
        resource: record.resource,
        method: record.method,
        count: 0,
      }
      current.count += 1
      fingerprints.set(record.fingerprint, current)
    }
  }

  const duplicateGroups = [...fingerprints.values()]
    .filter((item) => item.count > 1)
    .sort((left, right) => right.count - left.count)
    .slice(0, 10)
  const durations = records.map((record) => record.durationMs)

  return {
    requestCount: records.length,
    errorCount: records.filter((record) => record.error).length,
    schemaErrorCount: records.filter((record) => record.schemaError).length,
    requestP50Ms: percentile(durations, 0.5),
    requestP95Ms: percentile(durations, 0.95),
    slowRequestCount: records.filter((record) => record.durationMs >= SLOW_REQUEST_MS).length,
    duplicateRequestCount: duplicateGroups.reduce((sum, item) => sum + item.count - 1, 0),
    duplicateGroups,
    kinds,
    topResources: [...resources.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([resource, count]) => ({ resource, count })),
    slowestRequests: [...records]
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 10)
      .map(({ kind, resource, method, durationMs, status, error }) => ({
        kind,
        resource,
        method,
        durationMs: Math.round(durationMs * 10) / 10,
        status,
        error,
      })),
  }
}

function getRouteChunkSummary(routeStartedAt = 0) {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return { routeChunkBytes: 0, routeChunkCount: 0, largestChunks: [] }
  }

  const chunks = performance.getEntriesByType('resource')
    .filter((entry) => entry.startTime >= routeStartedAt)
    .filter((entry) => entry.initiatorType === 'script' || /\.js(?:\?|$)/i.test(entry.name || ''))
    .map((entry) => {
      let name = 'unknown.js'
      try {
        name = new URL(entry.name, window.location.origin).pathname.split('/').pop() || name
      } catch {
        // Resource names are best-effort and never include their query string.
      }
      return {
        name,
        bytes: Math.max(0, Number(entry.transferSize || entry.encodedBodySize || 0)),
        durationMs: Math.max(0, Math.round(Number(entry.duration || 0) * 10) / 10),
      }
    })

  return {
    routeChunkBytes: chunks.reduce((sum, item) => sum + item.bytes, 0),
    routeChunkCount: chunks.length,
    largestChunks: chunks.sort((left, right) => right.bytes - left.bytes).slice(0, 5),
  }
}

function normalizeRoute(pathname = '/') {
  return String(pathname || '/')
    .split('?')[0]
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ':id')
    .replace(/\/(\d+)(?=\/|$)/g, '/:id')
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:token')
}

export function classifySupabaseRequest(input) {
  try {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '')
    const pathname = new URL(rawUrl, 'http://localhost').pathname
    const segments = pathname.split('/').filter(Boolean)
    const apiIndex = segments.findIndex((segment) => ['rest', 'auth', 'storage', 'functions', 'realtime'].includes(segment))
    if (apiIndex < 0) return { kind: 'other', resource: 'unknown', excluded: false }

    const kind = segments[apiIndex]
    const versionIndex = apiIndex + 1
    if (kind === 'rest' && segments[versionIndex + 1] === 'rpc') {
      return { kind: 'rpc', resource: segments[versionIndex + 2] || 'unknown', excluded: false }
    }
    const resource = kind === 'rest' ? segments[versionIndex + 1] || 'unknown' : kind
    return { kind, resource, excluded: OBSERVABILITY_RESOURCES.has(resource) }
  } catch {
    return { kind: 'other', resource: 'unknown', excluded: false }
  }
}

function createEmptyWindow(now, route, activeChannels) {
  return {
    startedAt: now,
    route,
    requests: [],
    activeChannels,
    peakChannels: activeChannels,
  }
}

async function responseHasSchemaError(response) {
  if (!response || response.ok || typeof response.clone !== 'function') return false
  try {
    const payload = await response.clone().json()
    return SCHEMA_ERROR_CODES.has(String(payload?.code || '').toUpperCase())
  } catch {
    return false
  }
}

export function createQueryBaselineController({
  now = () => Date.now(),
  getRoute = () => (typeof window !== 'undefined' ? window.location.pathname : '/'),
  getVisibility = () => (typeof document !== 'undefined' ? document.visibilityState : 'unknown'),
  windowMs = DEFAULT_WINDOW_MS,
  onWindow = () => {},
  onRouteLoad = () => {},
} = {}) {
  let route = normalizeRoute(getRoute())
  let routeStartedAt = now()
  let routeStartedPerformanceAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0
  let activeChannels = 0
  let windowState = createEmptyWindow(now(), route, activeChannels)
  let routeState = {
    route,
    startedAt: routeStartedAt,
    requests: [],
    shellVisibleAt: null,
    completed: false,
    routeStartedPerformanceAt,
  }

  function markRoute(nextRoute) {
    const normalized = normalizeRoute(nextRoute)
    if (normalized === route) return
    if (windowState.requests.length) flush()
    route = normalized
    routeStartedAt = now()
    routeStartedPerformanceAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0
    windowState.route = route
    routeState = {
      route,
      startedAt: routeStartedAt,
      requests: [],
      shellVisibleAt: null,
      completed: false,
      routeStartedPerformanceAt,
    }
  }

  function summarize(endedAt = now()) {
    const records = windowState.requests
    const requestSummary = summarizeRequestRecords(records)
    const elapsedMinutes = Math.max((endedAt - windowState.startedAt) / 60_000, 1 / 60)
    const summary = {
      contract: CONTRACT_VERSION,
      windowStartedAt: new Date(windowState.startedAt).toISOString(),
      windowEndedAt: new Date(endedAt).toISOString(),
      route: windowState.route,
      visibility: getVisibility(),
      ...requestSummary,
      requestsPerMinute: Math.round((records.length / elapsedMinutes) * 10) / 10,
      routeLoadRequests: records.filter((record) => record.phase === 'route_load').length,
      idleRequests: records.filter((record) => record.phase === 'idle').length,
      activeRealtimeChannels: activeChannels,
      peakRealtimeChannels: windowState.peakChannels,
    }
    return { ...summary, budget: evaluateQueryWindowBudget(summary) }
  }

  function flush() {
    const endedAt = now()
    const summary = summarize(endedAt)
    windowState = createEmptyWindow(endedAt, route, activeChannels)
    if (summary.requestCount || summary.peakRealtimeChannels) onWindow(summary)
    return summary
  }

  function rolloverIfNeeded() {
    if (now() - windowState.startedAt >= windowMs) flush()
  }

  async function observeFetch(input, init, fetchImpl = globalThis.fetch) {
    rolloverIfNeeded()
    const classification = classifySupabaseRequest(input)
    if (classification.excluded) return fetchImpl(input, init)
    const startedAt = now()
    let response
    let thrown = false
    try {
      response = await fetchImpl(input, init)
      return response
    } catch (error) {
      thrown = true
      throw error
    } finally {
      const endedAt = now()
      const record = {
        ...classification,
        method: String(init?.method || input?.method || 'GET').toUpperCase(),
        fingerprint: createRequestFingerprint(input, init),
        phase: startedAt - routeStartedAt <= ROUTE_LOAD_MS ? 'route_load' : 'idle',
        durationMs: Math.max(0, endedAt - startedAt),
        status: Number(response?.status || 0),
        error: thrown || Boolean(response && !response.ok),
        schemaError: response ? await responseHasSchemaError(response) : false,
      }
      windowState.requests.push(record)
      if (!routeState.completed && routeState.route === route) routeState.requests.push(record)
    }
  }

  function markRouteShellVisible(pathname = route) {
    if (normalizeRoute(pathname) !== routeState.route || routeState.completed) return null
    if (routeState.shellVisibleAt == null) routeState.shellVisibleAt = now()
    return Math.max(0, routeState.shellVisibleAt - routeState.startedAt)
  }

  function markRouteFirstUsefulContent(pathname = route, metadata = {}) {
    if (normalizeRoute(pathname) !== routeState.route || routeState.completed) return null
    const completedAt = now()
    routeState.completed = true
    const routeSummary = {
      contract: 'arch9-route-load-performance-v1',
      route: routeState.route,
      routeStartedAt: new Date(routeState.startedAt).toISOString(),
      routeCompletedAt: new Date(completedAt).toISOString(),
      shellVisibleMs: routeState.shellVisibleAt == null
        ? null
        : Math.max(0, Math.round((routeState.shellVisibleAt - routeState.startedAt) * 10) / 10),
      firstUsefulContentMs: Math.max(0, Math.round((completedAt - routeState.startedAt) * 10) / 10),
      ...summarizeRequestRecords(routeState.requests),
      ...getRouteChunkSummary(routeState.routeStartedPerformanceAt),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    }
    const summary = {
      ...routeSummary,
      targetBudget: evaluateTargetFlowPerformanceBudget(routeSummary),
    }
    onRouteLoad(summary)
    return summary
  }

  function setActiveChannels(count) {
    activeChannels = Math.max(0, Number(count) || 0)
    windowState.peakChannels = Math.max(windowState.peakChannels, activeChannels)
  }

  return {
    flush,
    markRoute,
    markRouteFirstUsefulContent,
    markRouteShellVisible,
    observeFetch,
    setActiveChannels,
    snapshot: summarize,
  }
}

export function installRealtimeChannelBaseline(client, controller) {
  if (!client?.channel || !controller || client.__arch9QueryBaselineRealtimeInstalled) return client
  const tracked = new Set()
  const originalChannel = client.channel.bind(client)
  const originalRemoveChannel = client.removeChannel?.bind(client)

  function syncCount() {
    controller.setActiveChannels(tracked.size)
  }

  client.channel = (...args) => {
    const channel = originalChannel(...args)
    if (!channel || channel.__arch9QueryBaselineTracked) return channel
    tracked.add(channel)
    syncCount()
    const originalUnsubscribe = channel.unsubscribe?.bind(channel)
    if (originalUnsubscribe) {
      channel.unsubscribe = async (...unsubscribeArgs) => {
        try {
          return await originalUnsubscribe(...unsubscribeArgs)
        } finally {
          tracked.delete(channel)
          syncCount()
        }
      }
    }
    Object.defineProperty(channel, '__arch9QueryBaselineTracked', { value: true, enumerable: false })
    return channel
  }

  if (originalRemoveChannel) {
    client.removeChannel = async (channel) => {
      try {
        return await originalRemoveChannel(channel)
      } finally {
        tracked.delete(channel)
        syncCount()
      }
    }
  }
  Object.defineProperty(client, '__arch9QueryBaselineRealtimeInstalled', { value: true, enumerable: false })
  return client
}

export { CONTRACT_VERSION, normalizeRoute }
