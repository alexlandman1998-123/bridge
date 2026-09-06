import { ATTORNEY_RELEASE_ROLES } from '../constants/attorneyReleaseReadinessPhase0.js'

export const ATTORNEY_RELEASE_PHASE6_VERSION = 'attorney-release-stabilisation-phase6-v2'
export const ATTORNEY_RELEASE_PHASE6_THRESHOLDS = Object.freeze({
  minimumObservationHours: 72, maximumPilotOrganisations: 3, minimumActionsPerRole: 5,
  minimumTotalActions: 30, minimumSuccessfulActionRate: 0.99, maximumPropagationP95Seconds: 120,
  maximumEvidenceAgeMinutes: 15,
})
const number = (value) => Number(value || 0)
const text = (value) => String(value || '').trim()
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

function validPhase5Ledger(ledger) {
  const applied = Array.isArray(ledger?.batches) ? ledger.batches.filter((item) => item?.mode === 'apply') : []
  if (ledger?.environment !== 'staging' || !text(ledger?.projectRef) || !text(ledger?.ledgerFingerprint) || !applied.length) return false
  const first = applied[0]; const last = applied[applied.length - 1]
  const repaired = applied.reduce((sum, item) => sum + number(item?.repairedCount), 0)
  return number(first?.beforeGapCount) > 0 && number(last?.afterGapCount) === 0 && repaired === number(first?.beforeGapCount)
}

export function buildAttorneyReleaseStabilisationDecision({ phase5Ledger = null, observation = null, currentPropagation = null, rollbackReadiness = null, evaluatedAt = new Date().toISOString() } = {}) {
  const blockers = []; const rollbackTriggers = []; const holds = []
  const fingerprint = text(phase5Ledger?.ledgerFingerprint)
  if (!validPhase5Ledger(phase5Ledger)) blockers.push(issue('PHASE5_REMEDIATION_LEDGER_REQUIRED', 'Complete the controlled Phase 5 staging remediation and preserve its ledger.'))
  if (!fingerprint || observation?.sourceFingerprint !== fingerprint) blockers.push(issue('OBSERVATION_FINGERPRINT_MISMATCH', 'Collect observation evidence against the exact Phase 5 ledger.'))
  if (!fingerprint || rollbackReadiness?.sourceFingerprint !== fingerprint || !text(rollbackReadiness?.owner) || !text(rollbackReadiness?.verifiedAt) || !text(rollbackReadiness?.approvalReference)) blockers.push(issue('ROLLBACK_NOT_READY', 'Record an accountable rollback owner, approval reference, and verified procedure for this ledger.'))
  const cohortSize = number(observation?.cohortSize)
  if (cohortSize < 1 || cohortSize > ATTORNEY_RELEASE_PHASE6_THRESHOLDS.maximumPilotOrganisations) blockers.push(issue('PILOT_COHORT_OUT_OF_BOUNDS', 'Use a controlled cohort of one to three attorney organisations.', { cohortSize }))
  const observedAtMs = Date.parse(observation?.observedAt || ''); const evaluatedAtMs = Date.parse(evaluatedAt)
  const evidenceAgeMinutes = Number.isFinite(observedAtMs) && Number.isFinite(evaluatedAtMs) ? Math.max(0, (evaluatedAtMs - observedAtMs) / 60000) : Infinity
  if (!Number.isFinite(evidenceAgeMinutes) || evidenceAgeMinutes > ATTORNEY_RELEASE_PHASE6_THRESHOLDS.maximumEvidenceAgeMinutes) blockers.push(issue('OBSERVATION_EVIDENCE_STALE', 'Refresh the live Phase 6 observation snapshot.', { evidenceAgeMinutes: Number.isFinite(evidenceAgeMinutes) ? Math.round(evidenceAgeMinutes) : null }))
  for (const [field, code, remedy] of [
    ['securityIncidents', 'SECURITY_INCIDENT', 'Stop the pilot, preserve evidence, and execute the rollback runbook.'],
    ['visibilityBreaches', 'VISIBILITY_BREACH', 'Stop update delivery and execute rollback.'],
    ['dataIntegrityFailures', 'DATA_INTEGRITY_FAILURE', 'Stop workflow writes and execute rollback.'],
    ['unexpectedPermissionAllows', 'UNEXPECTED_PERMISSION_ALLOW', 'Disable the pilot cohort and execute rollback.'],
  ]) if (number(observation?.[field]) > 0) rollbackTriggers.push(issue(code, remedy, { count: number(observation[field]) }))
  if (!currentPropagation || number(currentPropagation?.gapCount) > 0 || text(currentPropagation?.status).toLowerCase() !== 'healthy') rollbackTriggers.push(issue('LIVE_PROPAGATION_REGRESSION', 'Pause the pilot and reconcile propagation before resuming.', { gapCount: number(currentPropagation?.gapCount) }))
  const observationHours = number(observation?.observationHours); const totalActions = number(observation?.totalActions)
  const successfulActionRate = number(observation?.successfulActionRate); const propagationP95Seconds = number(observation?.propagationP95Seconds)
  if (observationHours < ATTORNEY_RELEASE_PHASE6_THRESHOLDS.minimumObservationHours) holds.push(issue('OBSERVATION_WINDOW_INCOMPLETE', 'Continue monitoring until at least 72 hours have elapsed.', { observationHours }))
  if (totalActions < ATTORNEY_RELEASE_PHASE6_THRESHOLDS.minimumTotalActions) holds.push(issue('ACTION_SAMPLE_TOO_SMALL', 'Continue the pilot until at least 30 attorney actions are observed.', { totalActions }))
  for (const { transactionRole: role } of ATTORNEY_RELEASE_ROLES) { const count = number(observation?.actionsByRole?.[role]); if (count < ATTORNEY_RELEASE_PHASE6_THRESHOLDS.minimumActionsPerRole) holds.push(issue('ROLE_SAMPLE_TOO_SMALL', `Observe at least five actions for ${role}.`, { role, count })) }
  if (totalActions > 0 && successfulActionRate < ATTORNEY_RELEASE_PHASE6_THRESHOLDS.minimumSuccessfulActionRate) holds.push(issue('ACTION_SUCCESS_RATE_BELOW_TARGET', 'Resolve action failures and restart the clean observation window.', { successfulActionRate }))
  if (propagationP95Seconds > ATTORNEY_RELEASE_PHASE6_THRESHOLDS.maximumPropagationP95Seconds) holds.push(issue('PROPAGATION_LATENCY_ABOVE_TARGET', 'Investigate propagation latency before expanding the cohort.', { propagationP95Seconds }))
  if (number(observation?.unresolvedCriticalIncidents) > 0) holds.push(issue('CRITICAL_INCIDENTS_OPEN', 'Close all critical incidents before stabilisation sign-off.'))
  const status = rollbackTriggers.length ? 'ROLLBACK' : blockers.length ? 'BLOCKED' : holds.length ? 'HOLD' : 'STABILIZED'
  return { version: ATTORNEY_RELEASE_PHASE6_VERSION, sourceFingerprint: fingerprint, status, evaluatedAt, summary: { blockerCount: blockers.length, rollbackTriggerCount: rollbackTriggers.length, holdCount: holds.length }, blockers, rollbackTriggers, holds }
}
