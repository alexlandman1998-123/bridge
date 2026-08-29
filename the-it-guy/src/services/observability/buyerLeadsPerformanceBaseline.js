import { recordPerformanceMetric } from './performanceMetrics.js'
import { summarizeSellerLeadsPerformanceResources } from './sellerLeadsPerformanceBaseline.js'
import { evaluateBuyerLeadsReleaseGate } from './buyerLeadsReleaseGate.js'

export const BUYER_LEADS_PERFORMANCE_METRICS = Object.freeze({
  workspaceReady: 'buyer_leads.workspace.ready',
})

export const BUYER_LEADS_PERFORMANCE_BUDGETS_MS = Object.freeze({
  [BUYER_LEADS_PERFORMANCE_METRICS.workspaceReady]: 2500,
})

function now(performanceApi) {
  return typeof performanceApi?.now === 'function' ? performanceApi.now() : Date.now()
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeRoute(route = '') {
  return /^\/pipeline\/leads\/[^/?]+/.test(String(route || ''))
    ? '/pipeline/leads/:leadId'
    : '/pipeline/leads'
}

function isSupabaseRequest(name = '') {
  const value = String(name || '')
  return value.includes('.supabase.co/') || /\/(?:rest|auth|functions|storage)\/v1\//.test(value)
}

function requestSignature(name = '') {
  try {
    const url = new URL(name)
    return `${url.origin}${url.pathname}${url.search}`
  } catch {
    return String(name || '')
  }
}

function specialistFamily(name = '') {
  const value = String(name || '').toLowerCase()
  if (/appointment|viewing/.test(value)) return 'appointments'
  if (/offer|otp/.test(value)) return 'offers'
  if (/finance|bond_application|affordability|prequal/.test(value)) return 'finance'
  if (/document|packet|storage\/v1/.test(value)) return 'documents'
  if (/lead_activit/.test(value)) return 'activity'
  return ''
}

export function summarizeBuyerWorkspaceResources({ performanceApi, startedAt = 0, activeTab = 'overview' } = {}) {
  const resources = typeof performanceApi?.getEntriesByType === 'function'
    ? (performanceApi.getEntriesByType('resource') || []).filter((entry) => Number(entry?.startTime) >= Number(startedAt || 0))
    : []
  const supabaseResources = resources.filter((entry) => isSupabaseRequest(entry?.name))
  const signatureCounts = new Map()
  const specialistRequestCounts = {}

  supabaseResources.forEach((entry) => {
    const signature = requestSignature(entry?.name)
    signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1)
    const family = specialistFamily(entry?.name)
    if (family) specialistRequestCounts[family] = (specialistRequestCounts[family] || 0) + 1
  })

  const normalizedTab = normalizeText(activeTab).toLowerCase() || 'overview'
  return {
    ...summarizeSellerLeadsPerformanceResources({ performanceApi, startedAt }),
    duplicateSupabaseRequestCount: [...signatureCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
    specialistRequestCounts,
    inactiveSpecialistRequestCount: Object.entries(specialistRequestCounts)
      .reduce((total, [family, count]) => total + (family === normalizedTab ? 0 : count), 0),
  }
}

function resolveStartedAt({ performanceApi, windowApi, route }) {
  const current = now(performanceApi)
  const trace = windowApi?.__itgRoutePerfTrace
  const traceStartedAt = Number(trace?.startedAt)
  if (
    Number.isFinite(traceStartedAt) &&
    traceStartedAt > 0 &&
    traceStartedAt <= current &&
    normalizeRoute(trace?.to) === normalizeRoute(route)
  ) {
    return { startedAt: traceStartedAt, timingOrigin: 'route_transition' }
  }
  return { startedAt: current, timingOrigin: 'component_mount' }
}

export function createBuyerLeadsPerformanceBaseline({
  route = '/pipeline/leads/:leadId',
  performanceApi = typeof performance !== 'undefined' ? performance : null,
  windowApi = typeof window !== 'undefined' ? window : null,
  recorder = recordPerformanceMetric,
} = {}) {
  const normalizedRoute = normalizeRoute(route)
  const session = resolveStartedAt({ performanceApi, windowApi, route: normalizedRoute })
  const completed = new Set()

  return {
    route: normalizedRoute,
    startedAt: session.startedAt,
    timingOrigin: session.timingOrigin,
    recordCheckpoint({ checkpoint = '', userId = '', workspaceId = '', metadata = {} } = {}) {
      if (checkpoint !== 'workspace_ready') return Promise.resolve({ persisted: false, reason: 'unknown_checkpoint' })
      if (completed.has(checkpoint)) return Promise.resolve({ persisted: false, reason: 'checkpoint_already_recorded' })
      completed.add(checkpoint)

      const activeTab = normalizeText(metadata?.workspaceTab || 'overview').toLowerCase()
      const durationMs = Math.max(0, Math.round(now(performanceApi) - session.startedAt))
      const resourceSummary = summarizeBuyerWorkspaceResources({
        performanceApi,
        startedAt: session.startedAt,
        activeTab,
      })
      const releaseGate = evaluateBuyerLeadsReleaseGate({ durationMs, ...resourceSummary })
      return recorder({
        metricName: BUYER_LEADS_PERFORMANCE_METRICS.workspaceReady,
        durationMs,
        performanceBudgetMs: BUYER_LEADS_PERFORMANCE_BUDGETS_MS[BUYER_LEADS_PERFORMANCE_METRICS.workspaceReady],
        userId,
        workspaceId,
        route: normalizedRoute,
        metadata: {
          contract: 'arch9-buyer-leads-performance-baseline-v2',
          checkpoint,
          timingOrigin: session.timingOrigin,
          ...resourceSummary,
          releaseGateContract: releaseGate.contract,
          releaseGateStatus: releaseGate.status,
          releaseGateBreaches: releaseGate.breaches.map((breach) => breach.key),
          ...(metadata && typeof metadata === 'object' ? metadata : {}),
          workspaceTab: activeTab,
          leadCategory: 'buyer',
        },
      })
    },
  }
}
