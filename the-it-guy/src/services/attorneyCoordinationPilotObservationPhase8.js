export const ATTORNEY_COORDINATION_PHASE8_VERSION = 'attorney-coordination-pilot-observation-v1'
export const ATTORNEY_COORDINATION_PHASE8_MINIMUM_HOURS = 24
export const ATTORNEY_COORDINATION_PHASE8_MINIMUM_ACTIONS_PER_ROLE = 4
export const ATTORNEY_COORDINATION_PHASE8_MAXIMUM_PROPAGATION_P95_SECONDS = 120

const text = (value) => String(value || '').trim()
const issue = (code, message, details = {}) => ({ code, message, ...details })
const number = (value) => Number(value)

export function calculateAttorneyCoordinationPercentile(values = [], percentile = 0.95) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1))]
}

export function buildAttorneyCoordinationPhase8Decision({ phase7Report = null, phase7Receipt = null, phase7ReceiptFingerprint = '', evidence = null, evidenceFingerprint = '' } = {}) {
  const blockers = []
  if (phase7Report?.status !== 'PILOT_ACTIVE' || phase7Report?.pilotActive !== true) blockers.push(issue('PHASE7_PILOT_NOT_ACTIVE', 'An active Phase 7 pilot is required.'))
  if (!text(phase7ReceiptFingerprint) || phase7Report?.receiptFingerprint !== phase7ReceiptFingerprint) blockers.push(issue('PHASE7_RECEIPT_MISMATCH', 'Observe the exact Phase 7 activation receipt.'))
  if (!text(phase7Receipt?.productionProjectRef) || phase7Receipt?.featureFlagEnabled !== true || phase7Receipt?.killSwitchAvailable !== true) blockers.push(issue('PILOT_CONTROL_INVALID', 'The active pilot target, flag and kill switch must be intact.'))
  if (blockers.length) return { status: 'BLOCKED', expansionReady: false, blockers, rollbackTriggers: [], metrics: null, evidenceFingerprint: null }
  if (!evidence) return { status: 'OBSERVATION_REQUIRED', expansionReady: false, blockers: [], rollbackTriggers: [], metrics: null, evidenceFingerprint: null }

  const holds = []
  const rollbackTriggers = []
  if (evidence.version !== ATTORNEY_COORDINATION_PHASE8_VERSION || evidence.environment !== 'production') rollbackTriggers.push(issue('OBSERVATION_TARGET_INVALID', 'Stop observation and disable the pilot.'))
  if (evidence.phase7ReceiptFingerprint !== phase7ReceiptFingerprint || evidence.productionProjectRef !== phase7Receipt.productionProjectRef) rollbackTriggers.push(issue('OBSERVATION_IDENTITY_DRIFT', 'Disable the pilot; evidence is from a different release or target.'))
  if (!text(evidence.observedBy) || !text(evidence.monitoringEvidence)) holds.push(issue('OBSERVATION_OWNER_MISSING', 'Record the observer and monitoring evidence.'))
  const start = Date.parse(evidence.startedAt || '')
  const end = Date.parse(evidence.completedAt || '')
  const durationHours = Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 3_600_000 : 0
  if (durationHours < ATTORNEY_COORDINATION_PHASE8_MINIMUM_HOURS) holds.push(issue('OBSERVATION_WINDOW_INCOMPLETE', 'Observe the pilot continuously for at least 24 hours.', { durationHours }))

  const actions = Array.isArray(evidence.actions) ? evidence.actions : []
  const receiptIds = actions.map((item) => text(item.receiptId)).filter(Boolean)
  if (new Set(receiptIds).size !== receiptIds.length) holds.push(issue('DUPLICATE_ACTION_RECEIPT', 'Each action receipt may be counted once.'))
  const roles = ['transfer_attorney', 'bond_attorney', 'cancellation_attorney']
  const actionsByRole = Object.fromEntries(roles.map((role) => [role, actions.filter((item) => item.role === role && item.status === 'success').length]))
  for (const action of actions) {
    const occurred = Date.parse(action.occurredAt || '')
    if (!text(action.receiptId) || !text(action.transactionId) || !roles.includes(action.role) || action.status !== 'success' || !Number.isFinite(occurred) || occurred < start || occurred > end) holds.push(issue('ACTION_SAMPLE_INVALID', 'Retain successful authenticated action evidence inside the observation window.', { receiptId: action.receiptId || null }))
    if (!Number.isFinite(number(action.propagationLatencySeconds)) || number(action.propagationLatencySeconds) < 0) holds.push(issue('PROPAGATION_SAMPLE_INVALID', 'Every action needs non-negative propagation latency.', { receiptId: action.receiptId || null }))
    if (action.televentVisible !== true || action.attributionVerified !== true) holds.push(issue('ACTION_PARITY_UNVERIFIED', 'Verify Televent parity and actor attribution for every sampled action.', { receiptId: action.receiptId || null }))
  }
  for (const [role, count] of Object.entries(actionsByRole)) if (count < ATTORNEY_COORDINATION_PHASE8_MINIMUM_ACTIONS_PER_ROLE) holds.push(issue('ROLE_SAMPLE_TOO_SMALL', `Collect at least four successful actions for ${role}.`, { count }))
  const propagationP95Seconds = calculateAttorneyCoordinationPercentile(actions.map((item) => item.propagationLatencySeconds))
  if (propagationP95Seconds === null || propagationP95Seconds > ATTORNEY_COORDINATION_PHASE8_MAXIMUM_PROPAGATION_P95_SECONDS) holds.push(issue('PROPAGATION_LATENCY_HIGH', 'Keep propagation p95 at or below 120 seconds.', { propagationP95Seconds }))

  const checks = (Array.isArray(evidence.healthChecks) ? evidence.healthChecks : []).map((item) => ({ ...item, time: Date.parse(item.observedAt || '') })).sort((a, b) => a.time - b.time)
  if (!checks.length || checks.some((item) => item.healthy !== true || !Number.isFinite(item.time) || item.time < start || item.time > end)) holds.push(issue('HEALTH_CHECK_INVALID', 'All health checks must be healthy and inside the observation window.'))
  const checkpoints = [start, ...checks.map((item) => item.time), end].filter(Number.isFinite)
  const maximumHealthGapMinutes = checkpoints.length > 1 ? Math.max(...checkpoints.slice(1).map((time, index) => (time - checkpoints[index]) / 60_000)) : null
  if (!Number.isFinite(maximumHealthGapMinutes) || maximumHealthGapMinutes > 65) holds.push(issue('HEALTH_CHECK_CADENCE_GAP', 'Record pilot health at least hourly.', { maximumHealthGapMinutes }))

  for (const scenario of ['delegation_grant', 'delegated_action', 'revocation_denial', 'expiry_denial', 'internal_visibility_isolation']) {
    const item = evidence.controlChecks?.find((check) => check.id === scenario)
    if (!item || item.passed !== true || !text(item.evidence)) holds.push(issue('CONTROL_CHECK_MISSING', `Repeat and retain ${scenario}.`))
  }
  for (const field of ['securityIncidents', 'visibilityIncidents', 'unexpectedPermissionAllows', 'propagationGaps', 'attributionGaps', 'dataIntegrityIncidents', 'runtimeErrors']) {
    const value = number(evidence[field])
    if (!Number.isFinite(value) || value < 0) holds.push(issue('SAFETY_COUNTER_INVALID', `Record a valid ${field} counter.`))
    else if (value > 0) rollbackTriggers.push(issue(field.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase(), `Disable the pilot because ${field} is non-zero.`, { count: value }))
  }
  if ((evidence.defects || []).some((item) => ['P0', 'P1'].includes(item.severity) && item.status !== 'closed')) rollbackTriggers.push(issue('CRITICAL_DEFECT_OPEN', 'Disable the pilot until all P0/P1 defects are closed.'))

  const metrics = { durationHours, actionCount: actions.length, actionsByRole, propagationP95Seconds, healthCheckCount: checks.length, maximumHealthGapMinutes }
  const status = rollbackTriggers.length ? 'ROLLBACK' : holds.length ? 'HOLD' : 'READY_FOR_EXPANSION'
  return { status, expansionReady: status === 'READY_FOR_EXPANSION', blockers: holds, rollbackTriggers, metrics, evidenceFingerprint: text(evidenceFingerprint) || null }
}
