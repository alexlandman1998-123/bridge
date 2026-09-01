import { trackTelemetryEvent } from './telemetry.js'

export const COMPATIBILITY_FALLBACK_TELEMETRY_VERSION = 'compatibility-fallback-telemetry-v1'
export const COMPATIBILITY_FALLBACK_EVIDENCE_VERSION = 'compatibility-fallback-evidence-v1'

export const COMPATIBILITY_FALLBACK_IDS = Object.freeze({
  attorneyDashboardSnapshot: 'attorney_dashboard_snapshot_rpc',
  attorneyIncomingQueueProjection: 'attorney_incoming_queue_projection',
  attorneyOperationsProjection: 'attorney_operations_projection',
  transactionMutationMissingColumns: 'transaction_mutation_missing_columns',
})

const registeredFallbackIds = new Set(Object.values(COMPATIBILITY_FALLBACK_IDS))
const reportedStates = new Map()
const MAX_REPORTED_STATES = 250

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

function trimReportedStates() {
  if (reportedStates.size <= MAX_REPORTED_STATES) return
  const oldest = reportedStates.keys().next().value
  if (oldest) reportedStates.delete(oldest)
}

export function buildCompatibilityFallbackTelemetryEvent({
  fallbackId = '',
  usedFallback = false,
  failed = false,
  sourceComponent = '',
  reasonCode = '',
} = {}) {
  const normalizedFallbackId = normalizeText(fallbackId)
  if (!registeredFallbackIds.has(normalizedFallbackId)) {
    throw new Error(`Unknown compatibility fallback: ${normalizedFallbackId || 'missing'}`)
  }
  const eventName = failed
    ? 'compatibility_fallback_failed'
    : usedFallback
      ? 'compatibility_fallback_used'
      : 'compatibility_canonical_path_succeeded'
  return Object.freeze({
    category: 'compatibility_fallback',
    eventName,
    severity: failed ? 'error' : usedFallback ? 'warning' : 'info',
    metadata: {
      contract: COMPATIBILITY_FALLBACK_TELEMETRY_VERSION,
      fallbackId: normalizedFallbackId,
      sourceComponent: normalizeText(sourceComponent) || 'unknown',
      reasonCode: normalizeText(reasonCode) || (usedFallback ? 'compatibility_required' : 'canonical_available'),
    },
  })
}

export async function trackCompatibilityFallbackState({
  fallbackId = '',
  usedFallback = false,
  failed = false,
  sourceComponent = '',
  reasonCode = '',
  userId = '',
  workspaceId = '',
  route = '',
} = {}) {
  const event = buildCompatibilityFallbackTelemetryEvent({
    fallbackId,
    usedFallback,
    failed,
    sourceComponent,
    reasonCode,
  })
  const scope = `${normalizeText(workspaceId) || 'workspace'}:${normalizeText(userId) || 'user'}:${normalizeText(route) || 'route'}:${fallbackId}`
  const fingerprint = `${event.eventName}:${event.metadata.reasonCode}`
  if (reportedStates.get(scope) === fingerprint) return { persisted: false, reason: 'duplicate_state' }
  reportedStates.set(scope, fingerprint)
  trimReportedStates()
  return trackTelemetryEvent({ ...event, userId, workspaceId, route })
}

export function buildCompatibilityFallbackRetirementDecision(evidence = {}, thresholds = {}) {
  const minimumActiveDays = normalizeCount(thresholds.minimumActiveDays || 30)
  const minimumCanonicalEvents = normalizeCount(thresholds.minimumCanonicalEvents || 500)
  const activeDays = normalizeCount(evidence.activeDays)
  const canonicalSuccessCount = normalizeCount(evidence.canonicalSuccessCount)
  const fallbackCount = normalizeCount(evidence.fallbackCount)
  const failureCount = normalizeCount(evidence.failureCount)
  const failedChecks = [
    activeDays < minimumActiveDays
      ? { id: 'observation_window', reason: `At least ${minimumActiveDays} active telemetry days are required.` }
      : null,
    canonicalSuccessCount < minimumCanonicalEvents
      ? { id: 'canonical_volume', reason: `At least ${minimumCanonicalEvents} canonical successes are required.` }
      : null,
    fallbackCount > 0
      ? { id: 'fallback_unused', reason: `${fallbackCount} compatibility fallback use event${fallbackCount === 1 ? '' : 's'} occurred in the observation window.` }
      : null,
    failureCount > 0
      ? { id: 'fallback_failures', reason: `${failureCount} compatibility fallback failure${failureCount === 1 ? '' : 's'} occurred in the observation window.` }
      : null,
  ].filter(Boolean)
  const retirementApproved = failedChecks.length === 0

  return Object.freeze({
    version: COMPATIBILITY_FALLBACK_EVIDENCE_VERSION,
    fallbackId: normalizeText(evidence.fallbackId),
    decision: retirementApproved ? 'READY_FOR_MANUAL_RETIREMENT' : 'HOLD',
    retirementApproved,
    automaticRetirementAllowed: false,
    compatibilityFallbackEnabled: true,
    activeDays,
    canonicalSuccessCount,
    fallbackCount,
    failureCount,
    failedChecks,
  })
}
