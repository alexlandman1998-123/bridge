export const LEAD_WORKSPACE_LOADING_TRACE_CONTRACT = 'arch9-lead-workspace-loading-trace-v1'
export const LEAD_WORKSPACE_LOADING_TRACE_EVENT = 'arch9:lead-workspace-load-stage'

export const LEAD_WORKSPACE_LOAD_STAGES = Object.freeze({
  routeChunkLoading: 'route_chunk_loading',
  workspaceChunkLoading: 'workspace_chunk_loading',
  pipelineContextLoading: 'pipeline_context_loading',
  workspaceHydrating: 'workspace_hydrating',
  coreLeadReady: 'core_lead_ready',
  workspaceReady: 'workspace_ready',
  notFound: 'not_found',
  unavailable: 'unavailable',
  error: 'error',
})

const TRACE_KEY = '__arch9LeadWorkspaceLoadingTrace'
const LOADING_PRESENTATION_STAGES = new Set([
  LEAD_WORKSPACE_LOAD_STAGES.routeChunkLoading,
  LEAD_WORKSPACE_LOAD_STAGES.workspaceChunkLoading,
  LEAD_WORKSPACE_LOAD_STAGES.pipelineContextLoading,
  LEAD_WORKSPACE_LOAD_STAGES.workspaceHydrating,
])
const TERMINAL_PRESENTATION_STAGES = new Set([
  LEAD_WORKSPACE_LOAD_STAGES.notFound,
  LEAD_WORKSPACE_LOAD_STAGES.unavailable,
  LEAD_WORKSPACE_LOAD_STAGES.error,
])
const VALID_STAGES = new Set(Object.values(LEAD_WORKSPACE_LOAD_STAGES))

function now(performanceApi) {
  return typeof performanceApi?.now === 'function' ? performanceApi.now() : Date.now()
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function resolveLeadId(value = '', route = '') {
  const explicit = normalizeText(value)
  if (explicit) return explicit
  const match = normalizeText(route).match(/^\/pipeline\/leads\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function snapshot(trace) {
  if (!trace) return null
  return {
    ...trace,
    stages: trace.stages.map((entry) => ({ ...entry, metadata: { ...(entry.metadata || {}) } })),
  }
}

function createTrace({ leadId, route, startedAt }) {
  return {
    contract: LEAD_WORKSPACE_LOADING_TRACE_CONTRACT,
    leadId,
    route,
    startedAt,
    completedAt: null,
    outcome: '',
    loadingPresentationCount: 0,
    terminalPresentationCount: 0,
    stages: [],
    telemetryReported: false,
  }
}

export function recordLeadWorkspaceLoadStage(stage, {
  leadId = '',
  route = '',
  metadata = {},
  windowApi = typeof window !== 'undefined' ? window : null,
  performanceApi = typeof performance !== 'undefined' ? performance : null,
} = {}) {
  const normalizedStage = normalizeText(stage)
  if (!windowApi || !VALID_STAGES.has(normalizedStage)) return null

  const resolvedRoute = normalizeText(route || windowApi.location?.pathname)
  const resolvedLeadId = resolveLeadId(leadId, resolvedRoute)
  const timestamp = now(performanceApi)
  let trace = windowApi[TRACE_KEY]
  const startsNewNavigation = !trace ||
    (resolvedLeadId && trace.leadId && resolvedLeadId !== trace.leadId) ||
    (trace.completedAt && LOADING_PRESENTATION_STAGES.has(normalizedStage))
  if (startsNewNavigation) {
    trace = createTrace({ leadId: resolvedLeadId, route: resolvedRoute, startedAt: timestamp })
    windowApi[TRACE_KEY] = trace
  }
  if (!trace.leadId && resolvedLeadId) trace.leadId = resolvedLeadId
  if (!trace.route && resolvedRoute) trace.route = resolvedRoute

  const previousStage = trace.stages.at(-1)?.stage || ''
  if (previousStage !== normalizedStage) {
    trace.stages.push({
      stage: normalizedStage,
      at: timestamp,
      elapsedMs: Math.max(0, Math.round(timestamp - trace.startedAt)),
      metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {},
    })
    if (LOADING_PRESENTATION_STAGES.has(normalizedStage)) trace.loadingPresentationCount += 1
    if (TERMINAL_PRESENTATION_STAGES.has(normalizedStage)) trace.terminalPresentationCount += 1
  }

  if (normalizedStage === LEAD_WORKSPACE_LOAD_STAGES.workspaceReady) {
    trace.completedAt = timestamp
    trace.outcome = 'ready'
  } else if (TERMINAL_PRESENTATION_STAGES.has(normalizedStage)) {
    trace.completedAt = timestamp
    trace.outcome = normalizedStage
  }

  try {
    performanceApi?.mark?.(`arch9:lead-workspace:${normalizedStage}`, {
      detail: { leadId: trace.leadId, route: trace.route, loadingPresentationCount: trace.loadingPresentationCount },
    })
  } catch {
    // Observability must never interfere with workspace rendering.
  }
  try {
    windowApi.dispatchEvent?.(new CustomEvent(LEAD_WORKSPACE_LOADING_TRACE_EVENT, {
      detail: { stage: normalizedStage, trace: snapshot(trace) },
    }))
  } catch {
    // CustomEvent is not present in every non-browser test runtime.
  }
  return snapshot(trace)
}

export function completeLeadWorkspaceLoadingTrace(outcome = 'ready', options = {}) {
  const stage = outcome === 'ready'
    ? LEAD_WORKSPACE_LOAD_STAGES.workspaceReady
    : TERMINAL_PRESENTATION_STAGES.has(outcome)
      ? outcome
      : LEAD_WORKSPACE_LOAD_STAGES.error
  const trace = recordLeadWorkspaceLoadStage(stage, options)
  const windowApi = options.windowApi || (typeof window !== 'undefined' ? window : null)
  const liveTrace = windowApi?.[TRACE_KEY]
  if (!liveTrace) return { trace, shouldReport: false }
  const shouldReport = liveTrace.telemetryReported !== true
  liveTrace.telemetryReported = true
  return { trace: snapshot(liveTrace), shouldReport }
}

export function readLeadWorkspaceLoadingTrace(windowApi = typeof window !== 'undefined' ? window : null) {
  return snapshot(windowApi?.[TRACE_KEY] || null)
}

