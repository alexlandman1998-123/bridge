export const LEAD_WORKSPACE_OPERATIONAL_HEALTH_CONTRACT = 'arch9-lead-workspace-operational-health-v1'
export const LEAD_WORKSPACE_LOADING_COMPLETED_EVENT = 'lead_workspace_loading_sequence_completed'

export const LEAD_WORKSPACE_OPERATIONAL_THRESHOLDS = Object.freeze({
  degradedReadyMs: 10_000,
  criticalReadyMs: 30_000,
  maxLoadingPresentationCount: 4,
  minimumRollbackSampleSize: 20,
  minimumReadyRate: 0.98,
  maximumCriticalRate: 0.02,
  maximumTerminalRate: 0.01,
  maximumReadyP95Ms: 10_000,
})

function finiteNumber(value, fallback = 0) {
  const resolved = Number(value)
  return Number.isFinite(resolved) ? resolved : fallback
}

function elapsedMsForTrace(trace = {}) {
  const explicit = Number(trace.elapsedMs)
  if (Number.isFinite(explicit) && explicit >= 0) return Math.round(explicit)
  return Math.max(0, Math.round(finiteNumber(trace.completedAt) - finiteNumber(trace.startedAt)))
}

function percentile(values = [], percentileValue = 0.95) {
  const sorted = values.map((value) => finiteNumber(value, NaN)).filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)
  return Math.round(sorted[index])
}

function metadataForEvent(event = {}) {
  return event?.metadata && typeof event.metadata === 'object' ? event.metadata : event
}

export function assessLeadWorkspaceOperationalHealth(trace = {}, {
  leadCategory = '',
  warmSnapshot = false,
  workspaceTab = '',
  thresholds = LEAD_WORKSPACE_OPERATIONAL_THRESHOLDS,
} = {}) {
  const outcome = String(trace?.outcome || '').trim() || 'unknown'
  const stages = Array.isArray(trace?.stages)
    ? trace.stages.map((entry) => String(entry?.stage || entry || '').trim()).filter(Boolean)
    : []
  const elapsedMs = elapsedMsForTrace(trace)
  const loadingPresentationCount = Math.max(0, finiteNumber(trace?.loadingPresentationCount))
  const terminalPresentationCount = Math.max(0, finiteNumber(trace?.terminalPresentationCount))
  const reasonCodes = []

  if (outcome !== 'ready') reasonCodes.push('TERMINAL_OUTCOME')
  if (terminalPresentationCount > 0) reasonCodes.push('TERMINAL_PRESENTATION')
  if (outcome === 'ready' && !stages.includes('core_lead_ready')) reasonCodes.push('CORE_LEAD_STAGE_MISSING')
  if (elapsedMs >= finiteNumber(thresholds.criticalReadyMs)) reasonCodes.push('READY_TIME_CRITICAL')
  else if (elapsedMs >= finiteNumber(thresholds.degradedReadyMs)) reasonCodes.push('READY_TIME_DEGRADED')
  if (loadingPresentationCount > finiteNumber(thresholds.maxLoadingPresentationCount)) {
    reasonCodes.push('EXCESSIVE_LOADING_PRESENTATIONS')
  }

  const critical = reasonCodes.some((code) => [
    'TERMINAL_OUTCOME',
    'TERMINAL_PRESENTATION',
    'READY_TIME_CRITICAL',
  ].includes(code))
  const status = critical ? 'critical' : reasonCodes.length ? 'degraded' : 'healthy'

  return {
    contract: LEAD_WORKSPACE_OPERATIONAL_HEALTH_CONTRACT,
    status,
    severity: status === 'critical' ? 'error' : status === 'degraded' ? 'warning' : 'info',
    reasonCodes,
    metadata: {
      operationalHealthContract: LEAD_WORKSPACE_OPERATIONAL_HEALTH_CONTRACT,
      operationalHealthStatus: status,
      operationalHealthReasonCodes: reasonCodes,
      outcome,
      elapsedMs,
      loadingPresentationCount,
      terminalPresentationCount,
      stageSequence: stages,
      leadCategory: String(leadCategory || '').trim(),
      warmSnapshot: Boolean(warmSnapshot),
      workspaceTab: String(workspaceTab || '').trim(),
    },
  }
}

export function buildLeadWorkspaceOperationalRollup(events = [], {
  thresholds = LEAD_WORKSPACE_OPERATIONAL_THRESHOLDS,
} = {}) {
  const samples = (Array.isArray(events) ? events : [])
    .filter((event) => !event?.event_name || event.event_name === LEAD_WORKSPACE_LOADING_COMPLETED_EVENT)
    .map(metadataForEvent)
    .filter((metadata) => metadata?.operationalHealthContract === LEAD_WORKSPACE_OPERATIONAL_HEALTH_CONTRACT)
  const readySamples = samples.filter((sample) => sample.outcome === 'ready')
  const criticalCount = samples.filter((sample) => sample.operationalHealthStatus === 'critical').length
  const terminalCount = samples.filter((sample) => sample.outcome !== 'ready').length
  const readyElapsed = readySamples.map((sample) => sample.elapsedMs)
  const warmReadyElapsed = readySamples.filter((sample) => sample.warmSnapshot).map((sample) => sample.elapsedMs)
  const coldReadyElapsed = readySamples.filter((sample) => !sample.warmSnapshot).map((sample) => sample.elapsedMs)
  const sampleCount = samples.length
  const readyRate = sampleCount ? readySamples.length / sampleCount : 0
  const criticalRate = sampleCount ? criticalCount / sampleCount : 0
  const terminalRate = sampleCount ? terminalCount / sampleCount : 0
  const readyP95Ms = percentile(readyElapsed)
  const rollbackReasonCodes = []

  if (sampleCount >= finiteNumber(thresholds.minimumRollbackSampleSize)) {
    if (readyRate < finiteNumber(thresholds.minimumReadyRate)) rollbackReasonCodes.push('READY_RATE_BELOW_TARGET')
    if (criticalRate > finiteNumber(thresholds.maximumCriticalRate)) rollbackReasonCodes.push('CRITICAL_RATE_ABOVE_TARGET')
    if (terminalRate > finiteNumber(thresholds.maximumTerminalRate)) rollbackReasonCodes.push('TERMINAL_RATE_ABOVE_TARGET')
    if (readyP95Ms !== null && readyP95Ms > finiteNumber(thresholds.maximumReadyP95Ms)) {
      rollbackReasonCodes.push('READY_P95_ABOVE_TARGET')
    }
  }

  return {
    contract: LEAD_WORKSPACE_OPERATIONAL_HEALTH_CONTRACT,
    decision: sampleCount < finiteNumber(thresholds.minimumRollbackSampleSize)
      ? 'observe'
      : rollbackReasonCodes.length
        ? 'rollback_recommended'
        : 'healthy',
    rollbackReasonCodes,
    sampleCount,
    readyCount: readySamples.length,
    readyRate,
    criticalCount,
    criticalRate,
    terminalCount,
    terminalRate,
    readyP95Ms,
    warmReadyP95Ms: percentile(warmReadyElapsed),
    coldReadyP95Ms: percentile(coldReadyElapsed),
  }
}
