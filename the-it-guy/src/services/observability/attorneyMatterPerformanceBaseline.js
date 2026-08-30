import { recordPerformanceMetric } from './performanceMetrics.js'
import { summarizeTransactionWorkspaceResources } from './transactionWorkspacePerformanceBaseline.js'

export const ATTORNEY_MATTER_PERFORMANCE_METRICS = Object.freeze({
  listReady: 'attorney_matters.list_ready',
  accessCheck: 'attorney_matters.access_check',
  detailCoreReady: 'attorney_matters.detail_core_ready',
  datasetReady: 'attorney_matters.dataset_ready',
})

export const ATTORNEY_MATTER_PERFORMANCE_BUDGETS_MS = Object.freeze({
  [ATTORNEY_MATTER_PERFORMANCE_METRICS.listReady]: 4000,
  [ATTORNEY_MATTER_PERFORMANCE_METRICS.accessCheck]: 1500,
  [ATTORNEY_MATTER_PERFORMANCE_METRICS.detailCoreReady]: 3000,
  [ATTORNEY_MATTER_PERFORMANCE_METRICS.datasetReady]: 2000,
})

function now(performanceApi) {
  return typeof performanceApi?.now === 'function' ? performanceApi.now() : Date.now()
}

function normalizeRoute(route = '') {
  const pathname = String(route || '').split('?')[0]
  if (/^\/attorney\/matters(?:\/[^/]+)?$/.test(pathname)) return '/attorney/matters/:view'
  if (/^\/transactions\/[^/]+(?:\/.*)?$/.test(pathname)) return '/transactions/:transactionId'
  return '/attorney/matters'
}

/**
 * Records only aggregate timing and request-count data. Matter, transaction and
 * person identifiers intentionally never enter metric metadata.
 */
export function createAttorneyMatterPerformanceBaseline({
  route = '/attorney/matters',
  performanceApi = typeof performance !== 'undefined' ? performance : null,
  recorder = recordPerformanceMetric,
} = {}) {
  const startedAt = now(performanceApi)
  const recordedMetrics = new Set()

  return {
    route: normalizeRoute(route),
    startedAt,
    record(metricName, {
      spanStartedAt = startedAt,
      userId = '',
      workspaceId = '',
      metadata = {},
      dedupeKey = metricName,
    } = {}) {
      if (!Object.values(ATTORNEY_MATTER_PERFORMANCE_METRICS).includes(metricName)) {
        return Promise.resolve({ persisted: false, reason: 'unknown_metric' })
      }
      if (recordedMetrics.has(dedupeKey)) {
        return Promise.resolve({ persisted: false, reason: 'metric_already_recorded' })
      }
      recordedMetrics.add(dedupeKey)

      const durationMs = Math.max(0, Math.round(now(performanceApi) - spanStartedAt))
      const resources = summarizeTransactionWorkspaceResources({ performanceApi, startedAt: spanStartedAt })
      return recorder({
        metricName,
        durationMs,
        value: resources.supabaseRequestCount,
        unit: 'ms',
        performanceBudgetMs: ATTORNEY_MATTER_PERFORMANCE_BUDGETS_MS[metricName],
        userId,
        workspaceId,
        route: normalizeRoute(route),
        metadata: {
          contract: 'arch9-attorney-matter-performance-baseline-v1',
          ...resources,
          ...(metadata && typeof metadata === 'object' ? metadata : {}),
        },
      })
    },
  }
}
