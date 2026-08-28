import { evaluateQueryWindowBudget } from './queryPerformanceBudget.js'

const CONTRACT_VERSION = 'arch9-query-baseline-v1'
const DEFAULT_WINDOW_MS = 5 * 60 * 1000
const ROUTE_LOAD_MS = 15 * 1000
const OBSERVABILITY_RESOURCES = new Set(['performance_metrics', 'telemetry_events', 'error_events'])
const SCHEMA_ERROR_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205'])

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] * 10) / 10
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
} = {}) {
  let route = normalizeRoute(getRoute())
  let routeStartedAt = now()
  let activeChannels = 0
  let windowState = createEmptyWindow(now(), route, activeChannels)

  function markRoute(nextRoute) {
    const normalized = normalizeRoute(nextRoute)
    if (normalized === route) return
    if (windowState.requests.length) flush()
    route = normalized
    routeStartedAt = now()
    windowState.route = route
  }

  function summarize(endedAt = now()) {
    const records = windowState.requests
    const durations = records.map((record) => record.durationMs)
    const resources = new Map()
    const kinds = {}
    for (const record of records) {
      kinds[record.kind] = (kinds[record.kind] || 0) + 1
      const key = `${record.kind}:${record.resource}`
      resources.set(key, (resources.get(key) || 0) + 1)
    }
    const elapsedMinutes = Math.max((endedAt - windowState.startedAt) / 60_000, 1 / 60)
    const summary = {
      contract: CONTRACT_VERSION,
      windowStartedAt: new Date(windowState.startedAt).toISOString(),
      windowEndedAt: new Date(endedAt).toISOString(),
      route: windowState.route,
      visibility: getVisibility(),
      requestCount: records.length,
      requestsPerMinute: Math.round((records.length / elapsedMinutes) * 10) / 10,
      routeLoadRequests: records.filter((record) => record.phase === 'route_load').length,
      idleRequests: records.filter((record) => record.phase === 'idle').length,
      errorCount: records.filter((record) => record.error).length,
      schemaErrorCount: records.filter((record) => record.schemaError).length,
      requestP50Ms: percentile(durations, 0.5),
      requestP95Ms: percentile(durations, 0.95),
      activeRealtimeChannels: activeChannels,
      peakRealtimeChannels: windowState.peakChannels,
      kinds,
      topResources: [...resources.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10)
        .map(([resource, count]) => ({ resource, count })),
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
      windowState.requests.push({
        ...classification,
        method: String(init?.method || input?.method || 'GET').toUpperCase(),
        phase: startedAt - routeStartedAt <= ROUTE_LOAD_MS ? 'route_load' : 'idle',
        durationMs: Math.max(0, endedAt - startedAt),
        error: thrown || Boolean(response && !response.ok),
        schemaError: response ? await responseHasSchemaError(response) : false,
      })
    }
  }

  function setActiveChannels(count) {
    activeChannels = Math.max(0, Number(count) || 0)
    windowState.peakChannels = Math.max(windowState.peakChannels, activeChannels)
  }

  return { flush, markRoute, observeFetch, setActiveChannels, snapshot: summarize }
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
