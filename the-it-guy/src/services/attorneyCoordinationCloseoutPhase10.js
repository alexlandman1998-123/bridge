import { calculateAttorneyCoordinationPercentile } from './attorneyCoordinationPilotObservationPhase8.js'

export const ATTORNEY_COORDINATION_PHASE10_VERSION = 'attorney-coordination-closeout-v1'
export const ATTORNEY_COORDINATION_PHASE10_WAVE_CONFIRMATION = 'EXECUTE_ATTORNEY_COORDINATION_WAVE'
export const ATTORNEY_COORDINATION_PHASE10_GA_CONFIRMATION = 'ACCEPT_ATTORNEY_COORDINATION_STEADY_STATE'

const text = (value) => String(value || '').trim()
const number = (value) => Number(value)
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const issue = (code, message, details = {}) => ({ code, message, ...details })

export function buildAttorneyCoordinationPhase10Decision({ phase9Report = null, phase9Plan = null, phase9PlanFingerprint = '', phase9Approval = null, ledger = null, ledgerFingerprint = '', authorizationFingerprints = {}, approval = null } = {}) {
  const blockers = []
  if (phase9Report?.status !== 'APPROVED' || phase9Report?.expansionAuthorized !== true) blockers.push(issue('PHASE9_NOT_APPROVED', 'An approved Phase 9 expansion plan is required.'))
  if (!text(phase9PlanFingerprint) || phase9Report?.planFingerprint !== phase9PlanFingerprint || phase9Approval?.planFingerprint !== phase9PlanFingerprint) blockers.push(issue('PHASE9_PLAN_MISMATCH', 'Use the exact approved Phase 9 plan and approval.'))
  if (!Array.isArray(phase9Plan?.waves) || !phase9Plan.waves.length) blockers.push(issue('APPROVED_WAVES_MISSING', 'The approved plan must contain at least one wave.'))
  if (blockers.length) return { status: 'BLOCKED', steadyStateApproved: false, blockers, rollbackTriggers: [], waveMetrics: [] }
  if (!ledger) return { status: 'READY_TO_EXECUTE', steadyStateApproved: false, blockers: [], rollbackTriggers: [], waveMetrics: [] }

  const holds = []
  const rollbackTriggers = []
  if (ledger.version !== ATTORNEY_COORDINATION_PHASE10_VERSION || ledger.planFingerprint !== phase9PlanFingerprint) holds.push(issue('LEDGER_SOURCE_STALE', 'Bind the ledger to the exact Phase 9 plan.'))
  if (!text(ledger.executedBy) || !text(ledger.startedAt) || !text(ledger.completedAt)) holds.push(issue('LEDGER_METADATA_INCOMPLETE', 'Record the expansion owner and execution window.'))
  if (new Set((ledger.waves || []).map((item) => item.waveId)).size !== (ledger.waves || []).length) holds.push(issue('DUPLICATE_WAVE_EXECUTION', 'Keep one execution record per approved wave.'))

  let expectedCohort = [...phase9Plan.currentOrganisationIds]
  let previousCompletedAt = ledger.startedAt
  const waveMetrics = []
  for (const planned of phase9Plan.waves) {
    const execution = ledger.waves?.find((item) => item.waveId === planned.id)
    if (!execution) { holds.push(issue('WAVE_EXECUTION_MISSING', 'Execute and observe every approved wave.', { waveId: planned.id })); continue }
    const authorization = execution.authorization || {}
    const expectedAuthorizationFingerprint = authorizationFingerprints[planned.id]
    if (authorization.planFingerprint !== phase9PlanFingerprint || authorization.waveId !== planned.id || authorization.confirmation !== ATTORNEY_COORDINATION_PHASE10_WAVE_CONFIRMATION || !text(authorization.authorizedBy) || !text(authorization.authorizedAt) || !text(authorization.approvalReference)) holds.push(issue('WAVE_AUTHORIZATION_INVALID', 'Separately authorize this exact wave.', { waveId: planned.id }))
    if (Date.parse(authorization.authorizedAt || '') < Date.parse(previousCompletedAt || '')) holds.push(issue('WAVE_AUTHORIZED_TOO_EARLY', 'Authorize only after the previous observation completed.', { waveId: planned.id }))

    const receipt = execution.receipt || {}
    const additions = planned.organisations.map((item) => item.organisationId)
    const expectedAfter = [...expectedCohort, ...additions]
    if (!text(expectedAuthorizationFingerprint) || execution.authorizationFingerprint !== expectedAuthorizationFingerprint || receipt.authorizationFingerprint !== expectedAuthorizationFingerprint || receipt.planFingerprint !== phase9PlanFingerprint || receipt.waveId !== planned.id) holds.push(issue('WAVE_RECEIPT_CHAIN_INVALID', 'Bind targeting to the exact authorization.', { waveId: planned.id }))
    if (!same(receipt.beforeOrganisationIds, expectedCohort) || !same(receipt.addedOrganisationIds, additions) || !same(receipt.afterOrganisationIds, expectedAfter)) rollbackTriggers.push(issue('COHORT_MISMATCH', 'Restore the previous allowlist immediately.', { waveId: planned.id }))
    if (receipt.featureFlag !== phase9Plan.featureFlag || receipt.defaultOff !== true || receipt.evaluationLogged !== true || receipt.killSwitchAvailable !== true || !text(receipt.providerReceiptId) || !text(receipt.changedBy) || !text(receipt.changedAt)) rollbackTriggers.push(issue('TARGETING_CONTROL_FAILURE', 'Restore the last known-good flag state.', { waveId: planned.id }))

    const observation = execution.observation || {}
    const start = Date.parse(observation.startedAt || '')
    const end = Date.parse(observation.completedAt || '')
    const durationHours = Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 3_600_000 : 0
    if (observation.waveId !== planned.id || observation.planFingerprint !== phase9PlanFingerprint || start < Date.parse(receipt.changedAt || '')) holds.push(issue('WAVE_OBSERVATION_CHAIN_INVALID', 'Observe the exact wave after targeting changed.', { waveId: planned.id }))
    const actions = Array.isArray(observation.actions) ? observation.actions : []
    const ids = actions.map((item) => text(item.receiptId))
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) holds.push(issue('WAVE_ACTION_RECEIPTS_INVALID', 'Use unique durable action receipts.', { waveId: planned.id }))
    const roles = ['transfer_attorney', 'bond_attorney', 'cancellation_attorney']
    const actionsByRole = Object.fromEntries(roles.map((role) => [role, actions.filter((item) => item.role === role && item.status === 'success').length]))
    for (const action of actions) if (action.status !== 'success' || action.authenticated !== true || action.televentVisible !== true || action.attributionVerified !== true || !Number.isFinite(number(action.propagationLatencySeconds))) holds.push(issue('WAVE_ACTION_INVALID', 'Every sample must succeed with authentication, Televent parity and attribution.', { waveId: planned.id, receiptId: action.receiptId }))
    const propagationP95Seconds = calculateAttorneyCoordinationPercentile(actions.map((item) => item.propagationLatencySeconds))
    if (durationHours < number(planned.minimumObservationHours)) holds.push(issue('WAVE_WINDOW_INCOMPLETE', 'Complete the approved observation window.', { waveId: planned.id, durationHours }))
    for (const [role, count] of Object.entries(actionsByRole)) if (count < number(planned.minimumActionsPerRole)) holds.push(issue('WAVE_ROLE_SAMPLE_TOO_SMALL', 'Complete the approved sample for every role.', { waveId: planned.id, role, count }))
    if (propagationP95Seconds === null || propagationP95Seconds > number(planned.maximumPropagationP95Seconds)) holds.push(issue('WAVE_PROPAGATION_SLOW', 'Resolve propagation latency before continuing.', { waveId: planned.id, propagationP95Seconds }))
    for (const field of ['securityIncidents', 'visibilityIncidents', 'unexpectedPermissionAllows', 'propagationGaps', 'attributionGaps', 'dataIntegrityIncidents', 'runtimeErrors']) {
      const value = number(observation[field])
      if (!Number.isFinite(value) || value < 0) holds.push(issue('WAVE_COUNTER_INVALID', `Record ${field}.`, { waveId: planned.id }))
      else if (value > 0) rollbackTriggers.push(issue('WAVE_SAFETY_FAILURE', `Rollback because ${field} is non-zero.`, { waveId: planned.id, count: value }))
    }
    if (!text(observation.monitoringEvidence) || observation.televentHealthy !== true || observation.delegationControlsHealthy !== true) holds.push(issue('WAVE_OPERATIONAL_EVIDENCE_MISSING', 'Retain monitoring, Televent and delegation-control evidence.', { waveId: planned.id }))
    waveMetrics.push({ waveId: planned.id, durationHours, actionCount: actions.length, actionsByRole, propagationP95Seconds })
    expectedCohort = expectedAfter
    previousCompletedAt = observation.completedAt
  }

  const unknownWaves = (ledger.waves || []).filter((item) => !phase9Plan.waves.some((wave) => wave.id === item.waveId))
  if (unknownWaves.length) rollbackTriggers.push(issue('UNAPPROVED_WAVE_EXECUTED', 'Restore the approved cohort.', { waveIds: unknownWaves.map((item) => item.waveId) }))
  if (!same(ledger.finalOrganisationIds, expectedCohort) || ledger.targetPopulationCovered !== true || !text(ledger.targetPopulationEvidence)) holds.push(issue('TARGET_POPULATION_UNPROVEN', 'Prove final allowlist and target coverage.'))
  if (ledger.orphanActiveDelegations !== 0 || ledger.delegationRegisterReviewed !== true) rollbackTriggers.push(issue('DELEGATION_HYGIENE_FAILURE', 'Revoke orphan delegation grants before closeout.'))
  if (ledger.monitoringActive !== true || ledger.supportHandoffComplete !== true || ledger.securityOwnershipComplete !== true || ledger.dataOwnershipComplete !== true || ledger.rollbackStillAvailable !== true || ledger.flagStillDefaultOff !== true) holds.push(issue('STEADY_STATE_CONTROLS_INCOMPLETE', 'Keep monitoring, support, security, data, rollback and safe flag defaults active.'))
  if (rollbackTriggers.length) return { status: 'ROLLBACK', steadyStateApproved: false, blockers: holds, rollbackTriggers, waveMetrics }
  if (holds.length) return { status: 'HOLD', steadyStateApproved: false, blockers: holds, rollbackTriggers: [], waveMetrics }

  const approvalFailures = []
  if (!text(ledgerFingerprint) || approval?.ledgerFingerprint !== ledgerFingerprint) approvalFailures.push(issue('GA_FINGERPRINT_MISMATCH', 'Approve the exact completed ledger.'))
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt) || !text(approval?.approvalReference)) approvalFailures.push(issue('GA_APPROVAL_INCOMPLETE', 'Record accountable steady-state approval.'))
  if (Date.parse(approval?.approvedAt || '') < Date.parse(ledger.completedAt || '')) approvalFailures.push(issue('GA_APPROVAL_TIME_INVALID', 'Approve only after all waves complete.'))
  if (approval?.confirmation !== ATTORNEY_COORDINATION_PHASE10_GA_CONFIRMATION) approvalFailures.push(issue('GA_CONFIRMATION_REQUIRED', `Use ${ATTORNEY_COORDINATION_PHASE10_GA_CONFIRMATION}.`))
  return { status: approvalFailures.length ? 'READY_FOR_STEADY_STATE_APPROVAL' : 'STEADY_STATE_APPROVED', steadyStateApproved: approvalFailures.length === 0, blockers: approvalFailures, rollbackTriggers: [], waveMetrics }
}
