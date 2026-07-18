function text(value) { return typeof value === 'string' ? value.trim() : '' }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }

export function assessLegalDocumentOperationalReadiness({ config = {}, g2 = {}, monitor = {}, reconciliation = {}, watchdog = {}, now = Date.now() } = {}) {
  const reasons = []
  if (g2.status !== 'READY_FOR_G3') reasons.push('G3_G2_NOT_READY')
  if (monitor.status !== 'HEALTHY') reasons.push('G3_MONITORING_UNHEALTHY')
  if (reconciliation.status !== 'CLEAN' || reconciliation.mutatedData !== false) reasons.push('G3_RECONCILIATION_NOT_CLEAN')
  if (config.status !== 'ready') reasons.push('G3_OPERATIONAL_EVIDENCE_PENDING')
  if (!text(config.operationsOwner)) reasons.push('G3_OPERATIONS_OWNER_MISSING')
  if (!text(config.supportOwner)) reasons.push('G3_SUPPORT_OWNER_MISSING')
  if (!text(config.incidentChannelReference)) reasons.push('G3_INCIDENT_CHANNEL_MISSING')
  if (!text(config.monitoringReference)) reasons.push('G3_MONITORING_REFERENCE_MISSING')
  if (!text(config.supportRunbookReference) || !text(config.rollbackRunbookReference)) reasons.push('G3_RUNBOOK_REFERENCE_MISSING')

  const summary = watchdog.summary && typeof watchdog.summary === 'object' ? watchdog.summary : {}
  const metrics = summary.metrics && typeof summary.metrics === 'object' ? summary.metrics : {}
  const createdAt = Date.parse(watchdog.created_at || '')
  const maximumAgeMs = number(config.maximumWatchdogAgeMinutes, 90) * 60 * 1000
  if (watchdog.status !== 'healthy' || summary.kind !== 'legal_document_watchdog_v1' || !Number.isFinite(createdAt) || now - createdAt > maximumAgeMs || now < createdAt) reasons.push('G3_WATCHDOG_NOT_FRESH_HEALTHY')
  const requiredZeroMetrics = ['unresolvedGenerationFailures', 'staleSigningPackets', 'missingFinalArtifacts', 'missingFinalArtifactEvidence', 'incompleteFinalDeliveries', 'missingPortalPublications']
  if (requiredZeroMetrics.some((key) => !Object.hasOwn(metrics, key) || number(metrics[key], -1) !== 0)) reasons.push('G3_WATCHDOG_COVERAGE_INVALID')
  if (Array.isArray(summary.blockers) && summary.blockers.length) reasons.push('G3_WATCHDOG_ACTIVE_BLOCKERS')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], watchdogAgeMinutes: Number.isFinite(createdAt) ? Math.round((now - createdAt) / 6000) / 10 : null, requiredZeroMetrics }
}
