import { recordPerformanceMetric } from './performanceMetrics.js'

export const SELLER_LEADS_PERFORMANCE_METRICS = Object.freeze({
  firstData: 'seller_leads.route.first_data',
  backgroundSettled: 'seller_leads.route.background_settled',
  workspaceReady: 'seller_leads.workspace.ready',
})

export const SELLER_LEADS_PERFORMANCE_BUDGETS_MS = Object.freeze({
  [SELLER_LEADS_PERFORMANCE_METRICS.firstData]: 1500,
  [SELLER_LEADS_PERFORMANCE_METRICS.backgroundSettled]: 3500,
  [SELLER_LEADS_PERFORMANCE_METRICS.workspaceReady]: 2500,
})

const CHECKPOINT_METRICS = Object.freeze({
  first_data: SELLER_LEADS_PERFORMANCE_METRICS.firstData,
  background_settled: SELLER_LEADS_PERFORMANCE_METRICS.backgroundSettled,
  workspace_ready: SELLER_LEADS_PERFORMANCE_METRICS.workspaceReady,
})

function getNow(performanceApi) {
  return typeof performanceApi?.now === 'function' ? performanceApi.now() : Date.now()
}

function normalizeRoute(route = '') {
  const pathname = String(route || '').split('?')[0]
  return /^\/pipeline\/leads\/[^/]+$/.test(pathname)
    ? '/pipeline/leads/:leadId'
    : '/pipeline/leads'
}

function isSupabaseRequest(name = '') {
  const value = String(name || '')
  return value.includes('.supabase.co/') || /\/(?:rest|auth|functions|storage)\/v1\//.test(value)
}

function isPipelineRouteAsset(name = '') {
  return /\/assets\/(?:Pipeline|AgencyPipeline|AgentLeadsPage|AgencyLeadListRoutePage|AgencyLeadWorkspaceRoutePage|LeadListPage)-[^/]+\.js(?:\?|$)/.test(String(name || ''))
}

function sumFinite(rows = [], field = '') {
  return Math.round(rows.reduce((total, row) => {
    const value = Number(row?.[field])
    return total + (Number.isFinite(value) && value > 0 ? value : 0)
  }, 0))
}

export function summarizeSellerLeadsPerformanceResources({ performanceApi, startedAt = 0 } = {}) {
  const resourceEntries = typeof performanceApi?.getEntriesByType === 'function'
    ? performanceApi.getEntriesByType('resource') || []
    : []
  const checkpointResources = resourceEntries.filter((entry) => Number(entry?.startTime) >= Number(startedAt || 0))
  const routeAsset = [...resourceEntries].reverse().find((entry) => isPipelineRouteAsset(entry?.name)) || null
  // `longtask` is observer-only in Chromium. Asking getEntriesByType for it
  // produces a browser deprecation warning, so this baseline records the
  // supported resource timings only.
  const longTasks = []

  return {
    requestCount: checkpointResources.length,
    supabaseRequestCount: checkpointResources.filter((entry) => isSupabaseRequest(entry?.name)).length,
    transferredBytes: sumFinite(checkpointResources, 'transferSize'),
    longTaskCount: longTasks.length,
    longTaskDurationMs: sumFinite(longTasks, 'duration'),
    routeChunkDurationMs: routeAsset && Number.isFinite(Number(routeAsset.duration))
      ? Math.round(Number(routeAsset.duration))
      : null,
    routeChunkTransferBytes: routeAsset && Number.isFinite(Number(routeAsset.transferSize))
      ? Math.round(Number(routeAsset.transferSize))
      : null,
  }
}

function resolveSessionStart({ performanceApi, windowApi, route }) {
  const now = getNow(performanceApi)
  const trace = windowApi?.__itgRoutePerfTrace
  const traceStartedAt = Number(trace?.startedAt)
  const traceTarget = normalizeRoute(trace?.to || '')
  if (
    Number.isFinite(traceStartedAt) &&
    traceStartedAt > 0 &&
    traceStartedAt <= now &&
    traceTarget === normalizeRoute(route)
  ) {
    return { startedAt: traceStartedAt, timingOrigin: 'route_transition' }
  }
  return { startedAt: now, timingOrigin: 'component_mount' }
}

export function createSellerLeadsPerformanceBaseline({
  route = '/pipeline/leads',
  performanceApi = typeof performance !== 'undefined' ? performance : null,
  windowApi = typeof window !== 'undefined' ? window : null,
  recorder = recordPerformanceMetric,
} = {}) {
  const normalizedRoute = normalizeRoute(route)
  const sessionStart = resolveSessionStart({ performanceApi, windowApi, route: normalizedRoute })
  const completedCheckpoints = new Set()

  return {
    route: normalizedRoute,
    startedAt: sessionStart.startedAt,
    timingOrigin: sessionStart.timingOrigin,
    recordCheckpoint({ checkpoint = '', userId = '', workspaceId = '', metadata = {} } = {}) {
      const metricName = CHECKPOINT_METRICS[checkpoint]
      if (!metricName) return Promise.resolve({ persisted: false, reason: 'unknown_checkpoint' })
      if (completedCheckpoints.has(checkpoint)) {
        return Promise.resolve({ persisted: false, reason: 'checkpoint_already_recorded' })
      }
      completedCheckpoints.add(checkpoint)

      const durationMs = Math.max(0, Math.round(getNow(performanceApi) - sessionStart.startedAt))
      const resourceSummary = summarizeSellerLeadsPerformanceResources({
        performanceApi,
        startedAt: sessionStart.startedAt,
      })

      return recorder({
        metricName,
        durationMs,
        performanceBudgetMs: SELLER_LEADS_PERFORMANCE_BUDGETS_MS[metricName],
        userId,
        workspaceId,
        route: normalizedRoute,
        metadata: {
          contract: 'arch9-seller-leads-performance-baseline-v1',
          checkpoint,
          timingOrigin: sessionStart.timingOrigin,
          ...resourceSummary,
          ...(metadata && typeof metadata === 'object' ? metadata : {}),
        },
      })
    },
  }
}
