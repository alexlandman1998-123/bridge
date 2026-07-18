function text(value) { return typeof value === 'string' ? value.trim() : '' }
function number(value, fallback = -1) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }

export const documentGeneratorOperationalMetrics = [
  'unresolvedGenerationFailures',
  'staleSigningPackets',
  'missingFinalArtifacts',
  'missingFinalArtifactEvidence',
  'incompleteFinalDeliveries',
  'missingPortalPublications',
  'missingTransactionPublications',
  'missingCompletionReceipts',
  'stuckCompletionRetries',
]

const solutions = {
  G3_G1_NOT_READY: 'Repair the first failing G1 launch-chain stage for both the mandate and OTP, then rerun G1.',
  G3_G2_NOT_READY: 'Complete all four desktop/mobile mandate and OTP journeys without runtime, download or accessibility failures.',
  G3_OPERATIONS_OWNER_MISSING: 'Assign the person who owns document-service incidents and stuck completion retries.',
  G3_SUPPORT_OWNER_MISSING: 'Assign the first-line support owner for principal, attorney, agent and signer issues.',
  G3_INCIDENT_CHANNEL_MISSING: 'Record the incident channel or escalation reference used during rollout.',
  G3_MONITORING_REFERENCE_MISSING: 'Record the deployed watchdog schedule or monitoring-dashboard reference.',
  G3_RUNBOOK_REFERENCE_MISSING: 'Record valid support and rollback runbook references.',
  G3_OPERATIONAL_EVIDENCE_PENDING: 'Set operational evidence to ready only after owners, monitoring and runbooks are real.',
  G3_WATCHDOG_UNAVAILABLE: 'Deploy and schedule legal-document-watchdog, then produce a stored health snapshot.',
  G3_WATCHDOG_STALE_OR_UNHEALTHY: 'Run the watchdog and resolve its active failures until a fresh healthy snapshot exists.',
  G3_WATCHDOG_COVERAGE_INVALID: 'Deploy the G3 watchdog with transaction-publication, cross-surface receipt and stuck-retry coverage.',
  G3_WATCHDOG_ACTIVE_BLOCKERS: 'Resolve every blocker in the latest watchdog snapshot and rerun the operational gate.',
}

function blocker(code, detail) {
  return { code, ...(detail ? { detail } : {}), solution: solutions[code] }
}

export function assessDocumentGeneratorOperationalReadiness({ g1 = {}, g2 = {}, watchdog = {}, config = {}, now = Date.now() } = {}) {
  const blockers = []
  if (g1.status !== 'READY_FOR_G2' || g1.ready !== true) blockers.push(blocker('G3_G1_NOT_READY'))
  if (g2.status !== 'READY_FOR_G3' || g2.ready !== true) blockers.push(blocker('G3_G2_NOT_READY'))
  if (config.status !== 'ready') blockers.push(blocker('G3_OPERATIONAL_EVIDENCE_PENDING'))
  if (!text(config.operationsOwner)) blockers.push(blocker('G3_OPERATIONS_OWNER_MISSING'))
  if (!text(config.supportOwner)) blockers.push(blocker('G3_SUPPORT_OWNER_MISSING'))
  if (!text(config.incidentChannelReference)) blockers.push(blocker('G3_INCIDENT_CHANNEL_MISSING'))
  if (!text(config.monitoringReference)) blockers.push(blocker('G3_MONITORING_REFERENCE_MISSING'))
  if (!text(config.supportRunbookReference) || !text(config.rollbackRunbookReference)) blockers.push(blocker('G3_RUNBOOK_REFERENCE_MISSING'))

  const summary = watchdog.summary && typeof watchdog.summary === 'object' ? watchdog.summary : null
  const metrics = summary?.metrics && typeof summary.metrics === 'object' ? summary.metrics : {}
  const createdAt = Date.parse(watchdog.created_at || '')
  const maximumAgeMs = Math.max(number(config.maximumWatchdogAgeMinutes, 90), 1) * 60 * 1000
  if (!watchdog.id || !summary) blockers.push(blocker('G3_WATCHDOG_UNAVAILABLE'))
  else {
    if (watchdog.status !== 'healthy' || summary.kind !== 'legal_document_watchdog_v1' || !Number.isFinite(createdAt) || now < createdAt || now - createdAt > maximumAgeMs) blockers.push(blocker('G3_WATCHDOG_STALE_OR_UNHEALTHY'))
    const missingMetrics = documentGeneratorOperationalMetrics.filter((key) => !Object.hasOwn(metrics, key) || number(metrics[key]) !== 0)
    if (missingMetrics.length) blockers.push(blocker('G3_WATCHDOG_COVERAGE_INVALID', missingMetrics.join(', ')))
    if (Array.isArray(summary.blockers) && summary.blockers.length) blockers.push(blocker('G3_WATCHDOG_ACTIVE_BLOCKERS', summary.blockers.map((item) => item.code).filter(Boolean).join(', ')))
  }
  const unique = [...new Map(blockers.map((item) => [item.code, item])).values()]
  return {
    ready: unique.length === 0,
    blockers: unique,
    requiredZeroMetrics: documentGeneratorOperationalMetrics,
    watchdogAgeMinutes: Number.isFinite(createdAt) ? Math.round((now - createdAt) / 6000) / 10 : null,
  }
}
