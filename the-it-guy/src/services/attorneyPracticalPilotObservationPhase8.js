import { calculatePercentile } from './attorneyPracticalSoakPhase5.js'
import { ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF } from './attorneyPracticalReleaseCandidatePhase6.js'

export const ATTORNEY_PRACTICAL_PHASE8_VERSION = 'attorney-practical-pilot-observation-phase8-v1'

const text = (value) => String(value || '').trim()
const number = (value) => Number(value)
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

function phase7Blockers({ phase7Report, phase7Receipt, phase7ReceiptFingerprint }) {
  const blockers = []
  if (phase7Report?.status !== 'PILOT_ACTIVE' || phase7Report?.pilotActive !== true) blockers.push(issue('PHASE7_PILOT_NOT_ACTIVE', 'Complete the controlled rollout and immediate production smoke.'))
  if (!text(phase7ReceiptFingerprint) || phase7Report?.receiptFingerprint !== phase7ReceiptFingerprint) blockers.push(issue('PHASE7_RECEIPT_MISMATCH', 'Use the exact active-pilot deployment receipt.'))
  if (phase7Receipt?.productionProjectRef !== ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF) blockers.push(issue('PRODUCTION_TARGET_MISMATCH', 'Observe only the approved production project.'))
  return blockers
}

export function buildAttorneyPracticalPhase8Decision({ contract = {}, phase7Report = null, phase7Receipt = null, phase7ReceiptFingerprint = '', evidence = null, evidenceFingerprint = null } = {}) {
  const blockers = phase7Blockers({ phase7Report, phase7Receipt, phase7ReceiptFingerprint })
  if (blockers.length) return { version: ATTORNEY_PRACTICAL_PHASE8_VERSION, status: 'BLOCKED', expansionReady: false, blockerCount: blockers.length, blockers, metrics: null, evidenceFingerprint: null }
  if (!evidence) return { version: ATTORNEY_PRACTICAL_PHASE8_VERSION, status: 'OBSERVATION_REQUIRED', expansionReady: false, blockerCount: 0, blockers: [], metrics: null, evidenceFingerprint: null }

  const holds = []
  const rollbackTriggers = []
  if (evidence.version !== ATTORNEY_PRACTICAL_PHASE8_VERSION || evidence.environment !== 'production' || evidence.productionProjectRef !== ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF) rollbackTriggers.push(issue('OBSERVATION_TARGET_INVALID', 'Stop and bind evidence to the approved production pilot.'))
  if (evidence.phase7ReceiptFingerprint !== phase7ReceiptFingerprint) holds.push(issue('OBSERVATION_SOURCE_STALE', 'Bind observation to the exact active-pilot receipt.'))
  if (!text(evidence.observedBy) || !text(evidence.startedAt) || !text(evidence.completedAt) || !text(evidence.monitoringDashboardPath)) holds.push(issue('OBSERVATION_METADATA_INCOMPLETE', 'Record observer, timestamps, and monitoring dashboard evidence.'))
  const startMs = Date.parse(evidence.startedAt || ''); const endMs = Date.parse(evidence.completedAt || '')
  const durationHours = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? (endMs - startMs) / 3600000 : 0

  const actions = Array.isArray(evidence.actions) ? evidence.actions : []
  const receipts = actions.map(({ receiptId }) => receiptId)
  const duplicateReceipts = receipts.filter((id, index) => id && receipts.indexOf(id) !== index)
  if (duplicateReceipts.length) holds.push(issue('DUPLICATE_ACTION_RECEIPT', 'Count each production action receipt once.', { receiptIds: [...new Set(duplicateReceipts)] }))
  for (const action of actions) {
    const completedMs = Date.parse(action.completedAt || '')
    if (!text(action.receiptId) || !text(action.matterId) || action.authenticated !== true || !Number.isFinite(completedMs) || completedMs < startMs || completedMs > endMs) holds.push(issue('ACTION_EVIDENCE_INVALID', 'Retain authenticated production action receipts inside the observation window.', { receiptId: action.receiptId || null }))
    if (!contract.roles?.[action.role]?.includes(action.action) || !['success', 'failed'].includes(action.status)) holds.push(issue('ACTION_SAMPLE_INVALID', 'Use a contracted role action with an explicit outcome.', { receiptId: action.receiptId || null }))
    if (action.action !== 'open_assigned_matter' && (!Number.isFinite(number(action.propagationLatencySeconds)) || number(action.propagationLatencySeconds) < 0)) holds.push(issue('PROPAGATION_SAMPLE_INVALID', 'Record propagation latency for every mutating action.', { receiptId: action.receiptId || null }))
  }
  const successCount = actions.filter(({ status }) => status === 'success').length
  const successfulActionRate = actions.length ? successCount / actions.length : 0
  const actionsByRole = Object.fromEntries(Object.keys(contract.roles || {}).map((role) => [role, actions.filter((action) => action.role === role).length]))
  const propagationP95Seconds = calculatePercentile(actions.filter(({ action }) => action !== 'open_assigned_matter').map(({ propagationLatencySeconds }) => propagationLatencySeconds), 0.95)

  const checks = (Array.isArray(evidence.healthChecks) ? evidence.healthChecks : []).map((check) => ({ ...check, timeMs: Date.parse(check.observedAt || '') })).sort((a, b) => a.timeMs - b.timeMs)
  if (!checks.length || checks.some(({ timeMs, healthy }) => !Number.isFinite(timeMs) || timeMs < startMs || timeMs > endMs || healthy !== true)) holds.push(issue('HEALTH_CHECKS_INVALID', 'Retain healthy timestamped pilot checks.'))
  const checkpoints = [startMs, ...checks.map(({ timeMs }) => timeMs), endMs].filter(Number.isFinite)
  const maximumHealthCheckGapMinutes = checkpoints.length > 1 ? Math.max(...checkpoints.slice(1).map((value, index) => (value - checkpoints[index]) / 60000)) : null
  if (!Number.isFinite(maximumHealthCheckGapMinutes) || maximumHealthCheckGapMinutes > 65) holds.push(issue('HEALTH_CHECK_COVERAGE_GAP', 'Capture production pilot health at least hourly.', { maximumHealthCheckGapMinutes }))

  if (durationHours < number(contract.soak?.minimumHours)) holds.push(issue('PILOT_WINDOW_INCOMPLETE', 'Observe the pilot for the full 24-hour window.', { durationHours }))
  if (actions.length < number(contract.soak?.minimumTotalActions)) holds.push(issue('PRODUCTION_SAMPLE_TOO_SMALL', 'Collect the contracted action sample before expansion.', { actionCount: actions.length }))
  for (const [role, roleCount] of Object.entries(actionsByRole)) if (roleCount < number(contract.soak?.minimumActionsPerRole)) holds.push(issue('ROLE_SAMPLE_TOO_SMALL', 'Collect the minimum sample for every attorney role.', { role, count: roleCount }))
  if (successfulActionRate < number(contract.soak?.minimumSuccessfulActionRate)) holds.push(issue('SUCCESS_RATE_BELOW_TARGET', 'Resolve pilot action failures before expansion.', { successfulActionRate }))
  if (propagationP95Seconds === null || propagationP95Seconds > number(contract.soak?.maximumPropagationP95Seconds)) holds.push(issue('PROPAGATION_P95_ABOVE_TARGET', 'Resolve production propagation latency before expansion.', { propagationP95Seconds }))

  const logScan = evidence.runtimeLogScan || {}
  if (logScan.boundedQuery !== true || !text(logScan.evidencePath) || !text(logScan.queriedAt) || !text(logScan.deploymentId) || logScan.deploymentId !== phase7Receipt?.deploymentId) holds.push(issue('RUNTIME_LOG_SCAN_INVALID', 'Retain a bounded runtime-log scan for the active deployment.'))
  if (number(logScan.errorCount) > 0 || number(logScan.http5xxCount) > 0 || number(logScan.timeoutCount) > 0) holds.push(issue('RUNTIME_ERRORS_DETECTED', 'Investigate production errors, 5xx responses, and timeouts before expansion.', { errorCount: number(logScan.errorCount), http5xxCount: number(logScan.http5xxCount), timeoutCount: number(logScan.timeoutCount) }))
  for (const field of ['errorCount', 'http5xxCount', 'timeoutCount']) if (!Number.isFinite(number(logScan[field])) || number(logScan[field]) < 0) holds.push(issue('LOG_COUNTER_INVALID', 'Record every runtime-log counter explicitly.', { field }))

  const vitals = evidence.webVitals || {}
  if (!Number.isFinite(number(vitals.lcpP75Ms)) || number(vitals.lcpP75Ms) > 2500 || !Number.isFinite(number(vitals.inpP75Ms)) || number(vitals.inpP75Ms) > 200 || !Number.isFinite(number(vitals.clsP75)) || number(vitals.clsP75) > 0.1 || !text(vitals.evidencePath)) holds.push(issue('USER_PERFORMANCE_BELOW_STANDARD', 'Meet p75 LCP, INP, and CLS targets with retained evidence.'))
  for (const destination of contract.destinations || []) if (!(evidence.destinationHealth || []).some((item) => item.destination === destination && item.healthy === true && text(item.evidencePath))) holds.push(issue('DESTINATION_HEALTH_MISSING', 'Prove every update destination remained healthy.', { destination }))
  for (const role of Object.keys(contract.roles || {})) for (const viewport of contract.viewports || []) if (!(evidence.browserCheckpoints || []).some((item) => item.role === role && item.viewport === viewport && item.passed === true && text(item.evidencePath))) holds.push(issue('BROWSER_CHECKPOINT_MISSING', 'Repeat every role/device checkpoint during the pilot.', { role, viewport }))

  for (const [field, code, remedy] of [
    ['securityIncidents', 'SECURITY_INCIDENT', 'Disable the pilot and execute rollback.'],
    ['visibilityIncidents', 'VISIBILITY_INCIDENT', 'Disable update delivery and execute rollback.'],
    ['dataIntegrityIncidents', 'DATA_INTEGRITY_INCIDENT', 'Stop writes and execute rollback.'],
    ['propagationGaps', 'PROPAGATION_GAP', 'Disable the pilot and reconcile propagation.'],
    ['unexpectedPermissionAllows', 'PERMISSION_BOUNDARY_FAILURE', 'Disable the pilot and investigate authorization.'],
  ]) {
    const value = number(evidence[field])
    if (!Number.isFinite(value) || value < 0) holds.push(issue('SAFETY_COUNTER_INVALID', 'Record every safety counter explicitly.', { field }))
    else if (value > 0) rollbackTriggers.push(issue(code, remedy, { count: value }))
  }
  const criticalTickets = (evidence.supportTickets || []).filter(({ status, severity }) => status === 'open' && ['P0', 'P1'].includes(severity))
  if (criticalTickets.length) holds.push(issue('CRITICAL_SUPPORT_TICKETS_OPEN', 'Close all pilot P0/P1 support tickets.', { ticketIds: criticalTickets.map(({ id }) => id) }))
  const metrics = { durationHours, actionCount: actions.length, successfulActionRate, actionsByRole, propagationP95Seconds, healthCheckCount: checks.length, maximumHealthCheckGapMinutes }
  const status = rollbackTriggers.length ? 'ROLLBACK' : holds.length ? 'HOLD' : 'READY_FOR_EXPANSION'
  return { version: ATTORNEY_PRACTICAL_PHASE8_VERSION, status, expansionReady: status === 'READY_FOR_EXPANSION', blockerCount: holds.length + rollbackTriggers.length, blockers: holds, rollbackTriggers, metrics, evidenceFingerprint }
}
