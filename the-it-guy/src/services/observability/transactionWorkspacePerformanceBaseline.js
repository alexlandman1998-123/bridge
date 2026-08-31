import { recordPerformanceMetric } from './performanceMetrics.js'

export const TRANSACTION_WORKSPACE_PERFORMANCE_METRICS = Object.freeze({
  coreReady: 'transaction_workspace.core_ready',
  fullReady: 'transaction_workspace.full_ready',
  datasetReady: 'transaction_workspace.dataset_ready',
  backgroundRefresh: 'transaction_workspace.background_refresh',
})

export const TRANSACTION_WORKSPACE_PERFORMANCE_BUDGETS_MS = Object.freeze({
  [TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.coreReady]: 1000,
  [TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.fullReady]: 4000,
  [TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.datasetReady]: 2000,
  [TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.backgroundRefresh]: 3000,
})

function now(performanceApi) {
  return typeof performanceApi?.now === 'function' ? performanceApi.now() : Date.now()
}

function normalizeRoute(route = '') {
  const pathname = String(route || '').split('?')[0]
  return /^\/transactions\/[^/]+(?:\/.*)?$/.test(pathname) ? '/transactions/:transactionId' : '/transactions'
}

function endpointKey(name = '') {
  try {
    const url = new URL(String(name || ''), 'https://app.arch9.co.za')
    const match = url.pathname.match(/^\/(?:rest|auth|functions|storage)\/v1\/([^/]+)/)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

function isSupabaseRequest(name = '') {
  const value = String(name || '')
  return value.includes('.supabase.co/') || /\/(?:rest|auth|functions|storage)\/v1\//.test(value)
}

function isTelemetryRequest(name = '') {
  return /\/(?:performance_metrics|telemetry_events)(?:\?|$)/.test(String(name || ''))
}

function sumFinite(rows = [], field = '') {
  return Math.round(rows.reduce((total, row) => {
    const value = Number(row?.[field])
    return total + (Number.isFinite(value) && value > 0 ? value : 0)
  }, 0))
}

export function summarizeTransactionWorkspaceResources({ performanceApi, startedAt = 0 } = {}) {
  const entries = typeof performanceApi?.getEntriesByType === 'function'
    ? performanceApi.getEntriesByType('resource') || []
    : []
  const resources = entries.filter((entry) => Number(entry?.startTime) >= Number(startedAt || 0) && !isTelemetryRequest(entry?.name))
  const supabaseResources = resources.filter((entry) => isSupabaseRequest(entry?.name))
  const endpointCounts = {}
  for (const entry of supabaseResources) {
    const key = endpointKey(entry?.name) || 'unknown'
    endpointCounts[key] = (endpointCounts[key] || 0) + 1
  }
  const duplicateRequestCount = Object.values(endpointCounts).reduce((total, count) => total + Math.max(0, count - 1), 0)

  return {
    requestCount: resources.length,
    supabaseRequestCount: supabaseResources.length,
    duplicateRequestCount,
    transferredBytes: sumFinite(resources, 'transferSize'),
    endpointCounts: Object.fromEntries(
      Object.entries(endpointCounts).sort((left, right) => right[1] - left[1]).slice(0, 20),
    ),
  }
}

export function createTransactionWorkspacePerformanceBaseline({
  route = '/transactions',
  performanceApi = typeof performance !== 'undefined' ? performance : null,
  windowApi = typeof window !== 'undefined' ? window : null,
  recorder = recordPerformanceMetric,
} = {}) {
  const normalizedRoute = normalizeRoute(route)
  const current = now(performanceApi)
  const routeTrace = windowApi?.__itgRoutePerfTrace
  const traceStartedAt = Number(routeTrace?.startedAt)
  const usesRouteTrace = Number.isFinite(traceStartedAt)
    && traceStartedAt >= 0
    && traceStartedAt <= current
    && normalizeRoute(routeTrace?.to) === normalizedRoute
  const startedAt = usesRouteTrace ? traceStartedAt : current
  const timingOrigin = usesRouteTrace ? 'route_transition' : 'component_mount'
  const temperature = usesRouteTrace ? 'warm' : 'cold'
  const checkpoints = new Set()
  const readyDatasets = new Set()

  const record = ({ metricName, spanStartedAt = startedAt, userId = '', workspaceId = '', metadata = {} }) => {
    const durationMs = Math.max(0, Math.round(now(performanceApi) - spanStartedAt))
    const resources = summarizeTransactionWorkspaceResources({ performanceApi, startedAt: spanStartedAt })
    return recorder({
      metricName,
      durationMs,
      value: resources.supabaseRequestCount,
      unit: 'ms',
      performanceBudgetMs: TRANSACTION_WORKSPACE_PERFORMANCE_BUDGETS_MS[metricName],
      userId,
      workspaceId,
      route: normalizedRoute,
      metadata: {
        contract: 'arch9-transaction-workspace-performance-baseline-v2',
        timingOrigin,
        temperature,
        ...resources,
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
      },
    })
  }

  return {
    route: normalizedRoute,
    startedAt,
    timingOrigin,
    temperature,
    recordCheckpoint({ checkpoint = '', userId = '', workspaceId = '', metadata = {} } = {}) {
      const metricName = checkpoint === 'core_ready'
        ? TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.coreReady
        : checkpoint === 'full_ready'
          ? TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.fullReady
          : ''
      if (!metricName) return Promise.resolve({ persisted: false, reason: 'unknown_checkpoint' })
      if (checkpoints.has(checkpoint)) return Promise.resolve({ persisted: false, reason: 'checkpoint_already_recorded' })
      checkpoints.add(checkpoint)
      return record({ metricName, userId, workspaceId, metadata: { checkpoint, ...metadata } })
    },
    recordDatasetReady({ dataset = '', userId = '', workspaceId = '', metadata = {} } = {}) {
      const normalizedDataset = String(dataset || '').trim().toLowerCase()
      if (!normalizedDataset) return Promise.resolve({ persisted: false, reason: 'missing_dataset' })
      if (readyDatasets.has(normalizedDataset)) return Promise.resolve({ persisted: false, reason: 'dataset_already_recorded' })
      readyDatasets.add(normalizedDataset)
      return record({
        metricName: TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.datasetReady,
        userId,
        workspaceId,
        metadata: { dataset: normalizedDataset, ...metadata },
      })
    },
    startBackgroundRefresh({ reason = 'unknown' } = {}) {
      const spanStartedAt = now(performanceApi)
      let finished = false
      return {
        finish({ userId = '', workspaceId = '', status = 'success', metadata = {} } = {}) {
          if (finished) return Promise.resolve({ persisted: false, reason: 'span_already_finished' })
          finished = true
          return record({
            metricName: TRANSACTION_WORKSPACE_PERFORMANCE_METRICS.backgroundRefresh,
            spanStartedAt,
            userId,
            workspaceId,
            metadata: { reason: String(reason || 'unknown'), status, ...metadata },
          })
        },
      }
    },
  }
}
