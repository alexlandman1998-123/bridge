export const ATTORNEY_RELEASE_PHASE10_VERSION = 'attorney-release-steady-state-phase10-v1'
export const ATTORNEY_RELEASE_PHASE10_CONFIRMATION = 'AUTHORIZE_ATTORNEY_GA_EXPANSION'
const text = (value) => String(value || '').trim(); const number = (value) => Number(value || 0)
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

export function buildAttorneyReleasePhase10Decision({ phase9Receipt = null, receiptIntegrityPassed = false, readiness = null, readinessIntegrityPassed = false, approval = null } = {}) {
  const blockers = []; const rollbackTriggers = []
  const deploymentId = text(phase9Receipt?.deploymentId); const reportFingerprint = text(phase9Receipt?.reportFingerprint)
  if (phase9Receipt?.status !== 'VERIFIED' || phase9Receipt?.immutable !== true || !deploymentId || !reportFingerprint) blockers.push(issue('PHASE9_VERIFIED_RECEIPT_REQUIRED', 'Complete the canary and provide its immutable Phase 9 VERIFIED receipt.'))
  if (!receiptIntegrityPassed) blockers.push(issue('PHASE9_RECEIPT_INTEGRITY_FAILED', 'Use an unmodified, read-only Phase 9 receipt.'))
  if (!readinessIntegrityPassed || readiness?.deploymentId !== deploymentId || readiness?.phase9ReportFingerprint !== reportFingerprint) blockers.push(issue('STEADY_STATE_EVIDENCE_MISMATCH', 'Provide fingerprinted readiness evidence for the verified canary.'))
  for (const field of ['supportOwner','monitoringOwner','securityOwner','rollbackOwner','incidentChannel','supportRunbook','monitoringDashboard','rollbackDeploymentId','rollbackDrillAt']) if (!text(readiness?.[field])) blockers.push(issue('STEADY_STATE_OWNER_OR_CONTROL_MISSING', `Complete readiness field ${field}.`, { field }))
  if (readiness?.onCallAcknowledged !== true || readiness?.supportBriefed !== true || readiness?.monitoringActive !== true || readiness?.rollbackTested !== true) blockers.push(issue('OPERATIONAL_HANDOFF_INCOMPLETE', 'Complete on-call, support, monitoring, and rollback handoff.'))
  const expansionPercent = number(readiness?.maximumExpansionPercent)
  if (readiness?.expansionMode !== 'gradual' || expansionPercent < 1 || expansionPercent > 25) blockers.push(issue('EXPANSION_LIMIT_INVALID', 'Use gradual expansion capped between 1% and 25% per approved step.', { maximumExpansionPercent: expansionPercent }))
  if (number(readiness?.maximumOrganisationsPerStep) < 1 || number(readiness?.maximumOrganisationsPerStep) > 10) blockers.push(issue('EXPANSION_BATCH_INVALID', 'Limit each expansion step to one through ten attorney organisations.'))
  for (const [field, code] of [['securityIncidents','SECURITY_INCIDENT'],['visibilityBreaches','VISIBILITY_BREACH'],['dataIntegrityFailures','DATA_INTEGRITY_FAILURE'],['unexpectedPermissionAllows','UNEXPECTED_PERMISSION_ALLOW'],['propagationGaps','PROPAGATION_REGRESSION'],['runtimeErrors','RUNTIME_ERRORS_DETECTED']]) if (number(readiness?.[field]) > 0) rollbackTriggers.push(issue(code, 'Stop expansion and execute the recorded rollback procedure.', { count: number(readiness[field]) }))
  if (approval?.deploymentId !== deploymentId || approval?.phase9ReportFingerprint !== reportFingerprint) blockers.push(issue('EXPANSION_APPROVAL_MISMATCH', 'Approve the exact verified deployment and Phase 9 receipt.'))
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt) || !text(approval?.approvalReference)) blockers.push(issue('ACCOUNTABLE_EXPANSION_APPROVAL_REQUIRED', 'Record accountable expansion approval.'))
  if (approval?.confirmation !== ATTORNEY_RELEASE_PHASE10_CONFIRMATION) blockers.push(issue('EXACT_EXPANSION_CONFIRMATION_REQUIRED', `Use the exact confirmation ${ATTORNEY_RELEASE_PHASE10_CONFIRMATION}.`))
  const status = rollbackTriggers.length ? 'ROLLBACK' : blockers.length ? 'BLOCKED' : 'READY_FOR_GRADUAL_EXPANSION'
  return { version: ATTORNEY_RELEASE_PHASE10_VERSION, status, deploymentId, phase9ReportFingerprint: reportFingerprint, evaluatedAt: new Date().toISOString(), blockerCount: blockers.length, rollbackTriggerCount: rollbackTriggers.length, blockers, rollbackTriggers }
}
