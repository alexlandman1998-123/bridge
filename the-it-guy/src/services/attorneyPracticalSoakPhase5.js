export const ATTORNEY_PRACTICAL_PHASE5_VERSION = 'attorney-practical-staging-soak-phase5-v1'

const text = (value) => String(value || '').trim()
const number = (value) => Number(value)
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

export function calculatePercentile(values, percentile) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return null
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)]
}

function phase4Blockers({ contractFingerprint, phase4Report, phase4Evidence, phase4EvidenceFingerprint }) {
  const blockers = []
  if (phase4Report?.status !== 'PASSED') blockers.push(issue('PHASE4_NOT_PASSED', 'Pass remediation and regression before starting the soak.'))
  if (phase4Evidence?.contractFingerprint !== contractFingerprint || !text(phase4EvidenceFingerprint) || phase4Report?.evidenceFingerprint !== phase4EvidenceFingerprint) blockers.push(issue('PHASE4_EVIDENCE_MISMATCH', 'Use the exact passed Phase 4 evidence.'))
  return blockers
}

export function buildAttorneyPracticalPhase5Decision({ contract = {}, contractFingerprint = '', phase4Report = null, phase4Evidence = null, phase4EvidenceFingerprint = '', evidence = null, evidenceFingerprint = null } = {}) {
  const blockers = phase4Blockers({ contractFingerprint, phase4Report, phase4Evidence, phase4EvidenceFingerprint })
  if (blockers.length) return { version: ATTORNEY_PRACTICAL_PHASE5_VERSION, status: 'BLOCKED', executionAuthorized: false, blockerCount: blockers.length, blockers, metrics: null, evidenceFingerprint: null }
  if (!evidence) return { version: ATTORNEY_PRACTICAL_PHASE5_VERSION, status: 'READY_TO_RUN', executionAuthorized: true, blockerCount: 0, blockers: [], metrics: null, evidenceFingerprint: null }

  const failures = []
  const rollbackTriggers = []
  if (evidence.version !== ATTORNEY_PRACTICAL_PHASE5_VERSION) failures.push(issue('EVIDENCE_VERSION_INVALID', 'Use the current Phase 5 evidence format.'))
  if (evidence.environment !== 'staging') rollbackTriggers.push(issue('NON_STAGING_SOAK', 'Stop immediately; the soak is staging-only.'))
  if (evidence.contractFingerprint !== contractFingerprint || evidence.phase4EvidenceFingerprint !== phase4EvidenceFingerprint) failures.push(issue('EVIDENCE_CHAIN_STALE', 'Bind the soak to the current contract and exact Phase 4 evidence.'))
  if (!text(evidence.executedBy) || !text(evidence.startedAt) || !text(evidence.completedAt) || !text(evidence.deploymentReference)) failures.push(issue('RUN_METADATA_INCOMPLETE', 'Record owner, timestamps, and staging deployment.'))

  const startMs = Date.parse(evidence.startedAt || '')
  const endMs = Date.parse(evidence.completedAt || '')
  const durationHours = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? (endMs - startMs) / 3600000 : 0
  const actions = Array.isArray(evidence.actions) ? evidence.actions : []
  const receiptIds = actions.map(({ receiptId }) => receiptId)
  const duplicateReceipts = receiptIds.filter((id, index) => id && receiptIds.indexOf(id) !== index)
  if (duplicateReceipts.length) failures.push(issue('DUPLICATE_ACTION_RECEIPT', 'Count each durable action receipt once.', { receiptIds: [...new Set(duplicateReceipts)] }))
  for (const action of actions) {
    if (!text(action.receiptId) || !text(action.matterId) || !text(action.completedAt) || action.authenticated !== true) failures.push(issue('ACTION_EVIDENCE_INCOMPLETE', 'Each sample needs authenticated actor, matter, timestamp, and receipt.', { receiptId: action.receiptId || null }))
    if (!contract.roles?.[action.role]?.includes(action.action)) failures.push(issue('ACTION_OUTSIDE_CONTRACT', 'Use only contracted actions for the stated attorney role.', { receiptId: action.receiptId, role: action.role, action: action.action }))
    const completedMs = Date.parse(action.completedAt || '')
    if (!Number.isFinite(completedMs) || completedMs < startMs || completedMs > endMs) failures.push(issue('ACTION_OUTSIDE_SOAK_WINDOW', 'Keep action samples inside the measured soak window.', { receiptId: action.receiptId }))
    if (!['success', 'failed'].includes(action.status)) failures.push(issue('ACTION_STATUS_INVALID', 'Record action status as success or failed.', { receiptId: action.receiptId }))
    if (action.action !== 'open_assigned_matter' && (!Number.isFinite(number(action.propagationLatencySeconds)) || number(action.propagationLatencySeconds) < 0)) failures.push(issue('PROPAGATION_LATENCY_MISSING', 'Record propagation latency for every mutating action.', { receiptId: action.receiptId }))
  }
  const successfulActions = actions.filter(({ status }) => status === 'success')
  const successfulActionRate = actions.length ? successfulActions.length / actions.length : 0
  const propagationP95Seconds = calculatePercentile(actions.filter(({ action }) => action !== 'open_assigned_matter').map(({ propagationLatencySeconds }) => propagationLatencySeconds), 0.95)
  const actionsByRole = Object.fromEntries(Object.keys(contract.roles || {}).map((role) => [role, actions.filter((action) => action.role === role).length]))

  const checks = (Array.isArray(evidence.healthChecks) ? evidence.healthChecks : []).map((check) => ({ ...check, timeMs: Date.parse(check.observedAt || '') })).sort((a, b) => a.timeMs - b.timeMs)
  if (!checks.length || checks.some(({ timeMs, healthy }) => !Number.isFinite(timeMs) || timeMs < startMs || timeMs > endMs || healthy !== true)) failures.push(issue('HEALTH_CHECKS_INVALID', 'Retain healthy timestamped checks throughout the soak.'))
  const checkpoints = [startMs, ...checks.map(({ timeMs }) => timeMs), endMs].filter(Number.isFinite)
  const maximumHealthCheckGapMinutes = checkpoints.length > 1 ? Math.max(...checkpoints.slice(1).map((value, index) => (value - checkpoints[index]) / 60000)) : null
  if (!Number.isFinite(maximumHealthCheckGapMinutes) || maximumHealthCheckGapMinutes > 65) failures.push(issue('HEALTH_CHECK_COVERAGE_GAP', 'Capture health at least hourly, allowing five minutes scheduling tolerance.', { maximumHealthCheckGapMinutes }))

  const destinationChecks = Array.isArray(evidence.destinationChecks) ? evidence.destinationChecks : []
  for (const destination of contract.destinations || []) if (!destinationChecks.some((check) => check.destination === destination && check.healthy === true && text(check.evidencePath))) failures.push(issue('DESTINATION_HEALTH_MISSING', 'Prove every contracted module remained healthy.', { destination }))
  for (const [field, code, remedy] of [
    ['securityIncidents', 'SECURITY_INCIDENT', 'Stop the soak and invoke incident response.'],
    ['visibilityIncidents', 'VISIBILITY_INCIDENT', 'Stop delivery and investigate the visibility boundary.'],
    ['dataIntegrityIncidents', 'DATA_INTEGRITY_INCIDENT', 'Stop workflow writes and investigate data integrity.'],
    ['propagationGaps', 'PROPAGATION_GAP', 'Stop the soak and reconcile every missing destination update.'],
  ]) {
    const count = number(evidence[field])
    if (!Number.isFinite(count) || count < 0) failures.push(issue('INCIDENT_COUNTER_INVALID', 'Record every incident counter explicitly as a non-negative number.', { field }))
    else if (count > Number(contract.soak?.[field === 'propagationGaps' ? 'maximumPropagationGaps' : 'maximumSafetyIncidents'] || 0)) rollbackTriggers.push(issue(code, remedy, { count }))
  }

  if (durationHours < number(contract.soak?.minimumHours)) failures.push(issue('SOAK_DURATION_INCOMPLETE', 'Continue until the full soak window elapses.', { durationHours }))
  if (actions.length < number(contract.soak?.minimumTotalActions)) failures.push(issue('ACTION_SAMPLE_TOO_SMALL', 'Collect the minimum action sample.', { actionCount: actions.length }))
  for (const [role, count] of Object.entries(actionsByRole)) if (count < number(contract.soak?.minimumActionsPerRole)) failures.push(issue('ROLE_SAMPLE_TOO_SMALL', 'Collect the minimum samples for every attorney role.', { role, count }))
  if (successfulActionRate < number(contract.soak?.minimumSuccessfulActionRate)) failures.push(issue('ACTION_SUCCESS_RATE_BELOW_TARGET', 'Resolve action failures and repeat a clean soak.', { successfulActionRate }))
  if (propagationP95Seconds === null || propagationP95Seconds > number(contract.soak?.maximumPropagationP95Seconds)) failures.push(issue('PROPAGATION_P95_ABOVE_TARGET', 'Bring p95 propagation latency within the release bar.', { propagationP95Seconds }))
  const openCritical = (evidence.incidents || []).filter(({ status, severity }) => status === 'open' && ['P0', 'P1'].includes(severity))
  if (openCritical.length) failures.push(issue('CRITICAL_INCIDENTS_OPEN', 'Close all P0/P1 soak incidents.', { incidentIds: openCritical.map(({ id }) => id) }))

  const metrics = { durationHours, actionCount: actions.length, successfulActionRate, actionsByRole, propagationP95Seconds, healthCheckCount: checks.length, maximumHealthCheckGapMinutes }
  const status = rollbackTriggers.length ? 'ROLLBACK' : failures.length ? 'HOLD' : 'STABILIZED'
  return { version: ATTORNEY_PRACTICAL_PHASE5_VERSION, status, executionAuthorized: true, blockerCount: failures.length + rollbackTriggers.length, blockers: failures, rollbackTriggers, metrics, evidenceFingerprint }
}
