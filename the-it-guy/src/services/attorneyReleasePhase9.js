import { ATTORNEY_RELEASE_ROLES } from '../constants/attorneyReleaseReadinessPhase0.js'
export const ATTORNEY_RELEASE_PHASE9_VERSION = 'attorney-release-canary-assurance-phase9-v1'
export const ATTORNEY_RELEASE_PHASE9_THRESHOLDS = Object.freeze({ minimumObservationHours: 24, minimumTotalActions: 15, minimumActionsPerRole: 3, minimumSuccessRate: 0.99, maximumP95Seconds: 120, maximumRuntimeErrors: 0, maximumEvidenceAgeMinutes: 15 })
const text = (value) => String(value || '').trim(); const number = (value) => Number(value || 0)
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

export function buildAttorneyReleasePhase9Decision({ executionReceipt = null, receiptIntegrityPassed = false, observation = null, evidenceIntegrityPassed = false, evaluatedAt = new Date().toISOString() } = {}) {
  const blockers = []; const rollbackTriggers = []; const holds = []
  const deploymentId = text(executionReceipt?.deploymentId); const planFingerprint = text(executionReceipt?.planFingerprint)
  if (executionReceipt?.status !== 'CANARY_ACTIVE' || executionReceipt?.immutable !== true || !deploymentId || !planFingerprint) blockers.push(issue('PHASE8_EXECUTION_RECEIPT_REQUIRED', 'Supply the immutable receipt from an authorized Phase 8 canary cutover.'))
  if (!receiptIntegrityPassed) blockers.push(issue('PHASE8_RECEIPT_INTEGRITY_FAILED', 'Use an unmodified, read-only Phase 8 execution receipt.'))
  if (!evidenceIntegrityPassed || observation?.deploymentId !== deploymentId || observation?.planFingerprint !== planFingerprint) blockers.push(issue('PRODUCTION_EVIDENCE_INTEGRITY_FAILED', 'Refresh fingerprinted evidence for the exact canary deployment and plan.'))
  const observedAt = Date.parse(observation?.observedAt || ''); const now = Date.parse(evaluatedAt)
  const ageMinutes = Number.isFinite(observedAt) && Number.isFinite(now) ? Math.max(0, (now - observedAt) / 60000) : Infinity
  if (!Number.isFinite(ageMinutes) || ageMinutes > ATTORNEY_RELEASE_PHASE9_THRESHOLDS.maximumEvidenceAgeMinutes) blockers.push(issue('PRODUCTION_EVIDENCE_STALE', 'Refresh Phase 9 production evidence.', { ageMinutes: Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null }))
  for (const [field, code] of [['securityIncidents','SECURITY_INCIDENT'],['visibilityBreaches','VISIBILITY_BREACH'],['dataIntegrityFailures','DATA_INTEGRITY_FAILURE'],['unexpectedPermissionAllows','UNEXPECTED_PERMISSION_ALLOW'],['unresolvedCriticalIncidents','CRITICAL_INCIDENT_OPEN']]) if (number(observation?.[field]) > 0) rollbackTriggers.push(issue(code, 'Stop the canary and execute the recorded rollback procedure.', { count: number(observation[field]) }))
  if (observation && (number(observation.propagationGapCount) > 0 || text(observation.propagationStatus).toLowerCase() !== 'healthy')) rollbackTriggers.push(issue('PRODUCTION_PROPAGATION_REGRESSION', 'Stop the canary and restore the known-good deployment.', { gapCount: number(observation.propagationGapCount) }))
  if (number(observation?.runtimeErrorCount) > ATTORNEY_RELEASE_PHASE9_THRESHOLDS.maximumRuntimeErrors) rollbackTriggers.push(issue('RUNTIME_ERRORS_DETECTED', 'Stop the canary and inspect deployment logs.', { count: number(observation?.runtimeErrorCount) }))
  if (number(observation?.clientUnsafeProjectionCount) > 0) rollbackTriggers.push(issue('CLIENT_UNSAFE_PROJECTION', 'Stop client delivery and execute rollback.', { count: number(observation?.clientUnsafeProjectionCount) }))
  const hours = number(observation?.observationHours); const total = number(observation?.totalActions); const success = number(observation?.successfulActionRate); const p95 = number(observation?.propagationP95Seconds)
  if (hours < ATTORNEY_RELEASE_PHASE9_THRESHOLDS.minimumObservationHours) holds.push(issue('CANARY_WINDOW_INCOMPLETE', 'Observe the production canary for at least 24 hours.', { observationHours: hours }))
  if (total < ATTORNEY_RELEASE_PHASE9_THRESHOLDS.minimumTotalActions) holds.push(issue('CANARY_SAMPLE_TOO_SMALL', 'Observe at least 15 canary attorney actions.', { totalActions: total }))
  for (const { transactionRole: role } of ATTORNEY_RELEASE_ROLES) { const count = number(observation?.actionsByRole?.[role]); if (count < ATTORNEY_RELEASE_PHASE9_THRESHOLDS.minimumActionsPerRole) holds.push(issue('CANARY_ROLE_SAMPLE_TOO_SMALL', `Observe at least three ${role} actions.`, { role, count })) }
  if (total > 0 && success < ATTORNEY_RELEASE_PHASE9_THRESHOLDS.minimumSuccessRate) holds.push(issue('CANARY_SUCCESS_RATE_LOW', 'Resolve failed actions before closeout.', { successfulActionRate: success }))
  if (p95 > ATTORNEY_RELEASE_PHASE9_THRESHOLDS.maximumP95Seconds) holds.push(issue('CANARY_LATENCY_HIGH', 'Resolve propagation latency before closeout.', { propagationP95Seconds: p95 }))
  const status = rollbackTriggers.length ? 'ROLLBACK' : blockers.length ? 'BLOCKED' : holds.length ? 'OBSERVE' : 'VERIFIED'
  return { version: ATTORNEY_RELEASE_PHASE9_VERSION, status, deploymentId, planFingerprint, evaluatedAt, summary: { blockerCount: blockers.length, rollbackTriggerCount: rollbackTriggers.length, holdCount: holds.length }, blockers, rollbackTriggers, holds }
}
