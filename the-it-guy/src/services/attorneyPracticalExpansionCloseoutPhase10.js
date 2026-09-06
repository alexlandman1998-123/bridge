import { calculatePercentile } from './attorneyPracticalSoakPhase5.js'

export const ATTORNEY_PRACTICAL_PHASE10_VERSION = 'attorney-practical-expansion-closeout-phase10-v1'
export const ATTORNEY_PRACTICAL_PHASE10_WAVE_CONFIRMATION = 'EXECUTE_ATTORNEY_EXPANSION_WAVE'
export const ATTORNEY_PRACTICAL_PHASE10_GA_CONFIRMATION = 'ACCEPT_ATTORNEY_GENERAL_AVAILABILITY'

const text = (value) => String(value || '').trim()
const number = (value) => Number(value)
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

function predecessorBlockers({ phase9Report, phase9Plan, phase9PlanFingerprint, phase9Approval }) {
  const blockers = []
  if (phase9Report?.status !== 'APPROVED' || phase9Report?.expansionAuthorized !== true) blockers.push(issue('PHASE9_NOT_APPROVED', 'Approve the graduated expansion plan.'))
  if (!text(phase9PlanFingerprint) || phase9Report?.planFingerprint !== phase9PlanFingerprint || phase9Approval?.planFingerprint !== phase9PlanFingerprint) blockers.push(issue('PHASE9_PLAN_MISMATCH', 'Use the exact approved Phase 9 plan and approval.'))
  if (!Array.isArray(phase9Plan?.waves) || !phase9Plan.waves.length) blockers.push(issue('APPROVED_WAVES_MISSING', 'Use an approved plan with at least one wave.'))
  return blockers
}

function inspectWave({ contract, plan, plannedWave, execution, planFingerprint, expectedAuthorizationFingerprint, expectedBefore, priorCompletedAt }) {
  const holds = []
  const rollbacks = []
  if (!execution) return { holds: [issue('WAVE_EXECUTION_MISSING', 'Execute and observe the approved wave.', { waveId: plannedWave.id })], rollbacks, after: expectedBefore, completedAt: priorCompletedAt }
  const authorization = execution.authorization || {}
  if (authorization.planFingerprint !== planFingerprint || authorization.waveId !== plannedWave.id || authorization.confirmation !== ATTORNEY_PRACTICAL_PHASE10_WAVE_CONFIRMATION || !text(authorization.authorizedBy) || !text(authorization.authorizedAt) || !text(authorization.approvalReference)) holds.push(issue('WAVE_AUTHORIZATION_INVALID', 'Use a separate accountable authorization for this exact wave.', { waveId: plannedWave.id }))
  const authorizedMs = Date.parse(authorization.authorizedAt || '')
  if (priorCompletedAt && (!Number.isFinite(authorizedMs) || authorizedMs < Date.parse(priorCompletedAt))) holds.push(issue('WAVE_STARTED_BEFORE_PRIOR_OBSERVATION', 'Authorize each wave only after the prior wave observation passes.', { waveId: plannedWave.id }))

  const receipt = execution.receipt || {}
  const expectedAfter = [...expectedBefore, ...plannedWave.addOrganisationIds]
  if (!text(expectedAuthorizationFingerprint) || execution.authorizationFingerprint !== expectedAuthorizationFingerprint || receipt.authorizationFingerprint !== expectedAuthorizationFingerprint || receipt.waveId !== plannedWave.id || receipt.planFingerprint !== planFingerprint) holds.push(issue('WAVE_RECEIPT_CHAIN_INVALID', 'Bind the targeting receipt to the recomputed wave authorization fingerprint and plan.', { waveId: plannedWave.id }))
  if (receipt.featureFlag !== plan.featureFlag || receipt.targetingMode !== 'organisation_id_allowlist' || receipt.defaultOff !== true || receipt.assignmentStable !== true || receipt.evaluationLogged !== true) rollbacks.push(issue('FLAG_TARGETING_CONTROL_FAILED', 'Restore the last known-good allowlist and flag controls.', { waveId: plannedWave.id }))
  if (!same(receipt.beforeOrganisationIds, expectedBefore) || !same(receipt.addedOrganisationIds, plannedWave.addOrganisationIds) || !same(receipt.afterOrganisationIds, expectedAfter)) rollbacks.push(issue('WAVE_COHORT_MISMATCH', 'Restore the exact prior allowlist and investigate the targeting change.', { waveId: plannedWave.id }))
  if (!text(receipt.changedBy) || !text(receipt.changedAt) || !text(receipt.providerReceiptId) || !text(receipt.flagEvaluationEvidencePath) || receipt.killSwitchAvailable !== true) holds.push(issue('TARGETING_RECEIPT_INCOMPLETE', 'Retain provider, actor, timestamp, evaluation, and kill-switch evidence.', { waveId: plannedWave.id }))
  if (!Number.isFinite(Date.parse(receipt.changedAt || '')) || Date.parse(receipt.changedAt) < authorizedMs) holds.push(issue('TARGETING_CHANGE_TIME_INVALID', 'Change targeting only after wave authorization.', { waveId: plannedWave.id }))

  const observation = execution.observation || {}
  const startMs = Date.parse(observation.startedAt || ''); const endMs = Date.parse(observation.completedAt || '')
  const durationHours = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? (endMs - startMs) / 3600000 : 0
  if (observation.waveId !== plannedWave.id || observation.planFingerprint !== planFingerprint || startMs < Date.parse(receipt.changedAt || '')) holds.push(issue('WAVE_OBSERVATION_CHAIN_INVALID', 'Observe the exact wave only after targeting changes.', { waveId: plannedWave.id }))
  if (!text(observation.observedBy) || !text(observation.monitoringEvidencePath)) holds.push(issue('WAVE_OBSERVATION_METADATA_INCOMPLETE', 'Record observer and monitoring evidence.', { waveId: plannedWave.id }))
  const actions = Array.isArray(observation.actions) ? observation.actions : []
  const receipts = actions.map(({ receiptId }) => receiptId)
  if (new Set(receipts).size !== receipts.length || receipts.some((id) => !text(id))) holds.push(issue('WAVE_ACTION_RECEIPTS_INVALID', 'Use unique durable action receipts.', { waveId: plannedWave.id }))
  for (const action of actions) {
    const completedMs = Date.parse(action.completedAt || '')
    if (!text(action.matterId) || !contract.roles?.[action.role]?.includes(action.action) || action.authenticated !== true || !['success', 'failed'].includes(action.status) || !Number.isFinite(completedMs) || completedMs < startMs || completedMs > endMs) holds.push(issue('WAVE_ACTION_INVALID', 'Retain valid authenticated contracted matter actions inside the wave window.', { waveId: plannedWave.id, receiptId: action.receiptId }))
    if (action.action !== 'open_assigned_matter' && (!Number.isFinite(number(action.propagationLatencySeconds)) || number(action.propagationLatencySeconds) < 0)) holds.push(issue('WAVE_PROPAGATION_SAMPLE_INVALID', 'Record mutation propagation latency.', { waveId: plannedWave.id, receiptId: action.receiptId }))
  }
  const successRate = actions.length ? actions.filter(({ status }) => status === 'success').length / actions.length : 0
  const actionsByRole = Object.fromEntries(Object.keys(contract.roles || {}).map((role) => [role, actions.filter((action) => action.role === role).length]))
  const propagationP95Seconds = calculatePercentile(actions.filter(({ action }) => action !== 'open_assigned_matter').map(({ propagationLatencySeconds }) => propagationLatencySeconds), 0.95)
  if (durationHours < number(plannedWave.minimumObservationHours)) holds.push(issue('WAVE_WINDOW_INCOMPLETE', 'Complete the approved observation duration.', { waveId: plannedWave.id, durationHours }))
  if (actions.length < number(plannedWave.minimumActions)) holds.push(issue('WAVE_SAMPLE_TOO_SMALL', 'Complete the approved action sample.', { waveId: plannedWave.id, actionCount: actions.length }))
  for (const [role, count] of Object.entries(actionsByRole)) if (count < number(plannedWave.minimumActionsPerRole)) holds.push(issue('WAVE_ROLE_SAMPLE_TOO_SMALL', 'Complete each role sample.', { waveId: plannedWave.id, role, count }))
  if (successRate < number(plannedWave.minimumSuccessRate)) holds.push(issue('WAVE_SUCCESS_RATE_LOW', 'Resolve action failures before continuing.', { waveId: plannedWave.id, successRate }))
  if (propagationP95Seconds === null || propagationP95Seconds > number(plannedWave.maximumPropagationP95Seconds)) holds.push(issue('WAVE_PROPAGATION_SLOW', 'Resolve propagation latency before continuing.', { waveId: plannedWave.id, propagationP95Seconds }))
  for (const destination of contract.destinations || []) if (!(observation.destinationHealth || []).some((item) => item.destination === destination && item.healthy === true && text(item.evidencePath))) holds.push(issue('WAVE_DESTINATION_UNHEALTHY', 'Prove every destination healthy for this wave.', { waveId: plannedWave.id, destination }))
  for (const field of ['securityIncidents', 'visibilityIncidents', 'dataIntegrityIncidents', 'propagationGaps', 'unexpectedPermissionAllows', 'runtimeErrors']) {
    const value = number(observation[field])
    if (!Number.isFinite(value) || value < 0) holds.push(issue('WAVE_SAFETY_COUNTER_INVALID', 'Record all wave safety counters explicitly.', { waveId: plannedWave.id, field }))
    else if (value > 0) rollbacks.push(issue('WAVE_SAFETY_FAILURE', 'Stop expansion and execute rollback.', { waveId: plannedWave.id, field, count: value }))
  }
  return { holds, rollbacks, after: expectedAfter, completedAt: observation.completedAt, metrics: { waveId: plannedWave.id, durationHours, actionCount: actions.length, successRate, actionsByRole, propagationP95Seconds } }
}

export function buildAttorneyPracticalPhase10Decision({ contract = {}, phase9Report = null, phase9Plan = null, phase9PlanFingerprint = '', phase9Approval = null, ledger = null, ledgerFingerprint = '', authorizationFingerprints = {}, approval = null } = {}) {
  const blockers = predecessorBlockers({ phase9Report, phase9Plan, phase9PlanFingerprint, phase9Approval })
  if (blockers.length) return { version: ATTORNEY_PRACTICAL_PHASE10_VERSION, status: 'BLOCKED', generalAvailabilityApproved: false, blockerCount: blockers.length, blockers, waveMetrics: [], ledgerFingerprint: ledgerFingerprint || null }
  if (!ledger) return { version: ATTORNEY_PRACTICAL_PHASE10_VERSION, status: 'READY_TO_EXECUTE', generalAvailabilityApproved: false, blockerCount: 0, blockers: [], waveMetrics: [], ledgerFingerprint: null }
  const holds = []; const rollbackTriggers = []
  if (ledger.version !== ATTORNEY_PRACTICAL_PHASE10_VERSION || ledger.planFingerprint !== phase9PlanFingerprint) holds.push(issue('LEDGER_SOURCE_STALE', 'Bind the ledger to the exact approved Phase 9 plan.'))
  if (!text(ledger.executedBy) || !text(ledger.startedAt) || !text(ledger.completedAt)) holds.push(issue('LEDGER_METADATA_INCOMPLETE', 'Record expansion owner and timestamps.'))
  const ledgerWaveIds = (ledger.waves || []).map(({ waveId }) => waveId)
  if (new Set(ledgerWaveIds).size !== ledgerWaveIds.length) holds.push(issue('DUPLICATE_WAVE_EXECUTION', 'Keep one execution record per approved wave.'))
  let expectedCohort = [...phase9Plan.currentOrganisationIds]; let priorCompletedAt = ''
  const waveMetrics = []
  for (const plannedWave of phase9Plan.waves) {
    const execution = (ledger.waves || []).find(({ waveId }) => waveId === plannedWave.id)
    const result = inspectWave({ contract, plan: phase9Plan, plannedWave, execution, planFingerprint: phase9PlanFingerprint, expectedAuthorizationFingerprint: authorizationFingerprints[plannedWave.id], expectedBefore: expectedCohort, priorCompletedAt })
    holds.push(...result.holds); rollbackTriggers.push(...result.rollbacks); expectedCohort = result.after; priorCompletedAt = result.completedAt; if (result.metrics) waveMetrics.push(result.metrics)
  }
  const unknownWaves = (ledger.waves || []).filter(({ waveId }) => !phase9Plan.waves.some(({ id }) => id === waveId)).map(({ waveId }) => waveId)
  if (unknownWaves.length) rollbackTriggers.push(issue('UNAPPROVED_WAVE_EXECUTED', 'Restore the approved targeting state.', { waveIds: unknownWaves }))
  if (!same(ledger.finalOrganisationIds, expectedCohort) || ledger.targetPopulationCovered !== true || !text(ledger.targetPopulationReference)) holds.push(issue('TARGET_POPULATION_NOT_PROVEN', 'Prove the approved target population and final allowlist.'))
  if (ledger.flagStillDefaultOff !== true || ledger.flagRetirementDeferred !== true || ledger.monitoringActive !== true || ledger.supportHandoffComplete !== true || ledger.rollbackStillAvailable !== true) holds.push(issue('STEADY_STATE_CONTROLS_INCOMPLETE', 'Keep safe flag defaults, monitoring, support, and rollback active through closeout.'))
  if (rollbackTriggers.length) return { version: ATTORNEY_PRACTICAL_PHASE10_VERSION, status: 'ROLLBACK', generalAvailabilityApproved: false, blockerCount: holds.length + rollbackTriggers.length, blockers: holds, rollbackTriggers, waveMetrics, ledgerFingerprint }
  if (holds.length) return { version: ATTORNEY_PRACTICAL_PHASE10_VERSION, status: 'HOLD', generalAvailabilityApproved: false, blockerCount: holds.length, blockers: holds, rollbackTriggers: [], waveMetrics, ledgerFingerprint }
  const approvalBlockers = []
  if (!text(ledgerFingerprint) || approval?.ledgerFingerprint !== ledgerFingerprint) approvalBlockers.push(issue('GA_APPROVAL_FINGERPRINT_MISMATCH', 'Approve the exact completed expansion ledger.'))
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt) || !text(approval?.approvalReference)) approvalBlockers.push(issue('GA_ACCOUNTABLE_APPROVAL_REQUIRED', 'Record accountable GA approval.'))
  if (!Number.isFinite(Date.parse(approval?.approvedAt || '')) || Date.parse(approval.approvedAt) < Date.parse(ledger.completedAt || '')) approvalBlockers.push(issue('GA_APPROVAL_TIME_INVALID', 'Approve GA only after every wave completes.'))
  if (approval?.confirmation !== ATTORNEY_PRACTICAL_PHASE10_GA_CONFIRMATION) approvalBlockers.push(issue('GA_EXACT_CONFIRMATION_REQUIRED', `Use the exact confirmation ${ATTORNEY_PRACTICAL_PHASE10_GA_CONFIRMATION}.`))
  return { version: ATTORNEY_PRACTICAL_PHASE10_VERSION, status: approvalBlockers.length ? 'READY_FOR_GA_APPROVAL' : 'GENERAL_AVAILABILITY_APPROVED', generalAvailabilityApproved: approvalBlockers.length === 0, blockerCount: approvalBlockers.length, blockers: approvalBlockers, rollbackTriggers: [], waveMetrics, ledgerFingerprint }
}
