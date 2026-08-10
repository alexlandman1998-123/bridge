import { trackTelemetryEvent } from './observability/telemetry.js'

export const PIPELINE_OPERATIONAL_TELEMETRY_CATEGORY = 'agency_pipeline_operations'

export function getPipelineTelemetryNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function getPipelineTelemetryElapsedMs(startedAt) {
  const start = Number(startedAt || 0)
  if (!Number.isFinite(start) || start <= 0) return null
  return Math.max(0, Math.round(getPipelineTelemetryNow() - start))
}

export async function recordPipelineOperationalEvent({
  eventName = '',
  userId = '',
  workspaceId = '',
  route = '',
  severity = 'info',
  metadata = {},
  transport = trackTelemetryEvent,
} = {}) {
  const normalizedEventName = String(eventName || '').trim()
  if (!normalizedEventName) return { persisted: false, reason: 'missing_event_name' }
  return transport({
    category: PIPELINE_OPERATIONAL_TELEMETRY_CATEGORY,
    eventName: normalizedEventName,
    userId,
    workspaceId,
    route,
    severity,
    metadata: {
      contract: 'arch9-agency-pipeline-operational-telemetry-v1',
      ...metadata,
    },
  })
}
