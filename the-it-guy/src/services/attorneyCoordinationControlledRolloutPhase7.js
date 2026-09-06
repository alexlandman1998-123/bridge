export const ATTORNEY_COORDINATION_PHASE7_VERSION = 'attorney-coordination-controlled-rollout-v1'
export const ATTORNEY_COORDINATION_PHASE7_CONFIRMATION = 'AUTHORIZE_ATTORNEY_COORDINATION_PILOT'
export const ATTORNEY_COORDINATION_REQUIRED_MIGRATIONS = Object.freeze([
  '20260906070938_attorney_lane_delegation_phase3',
  '20260906071644_attorney_coordination_propagation_phase4',
])

const text = (value) => String(value || '').trim()
const issue = (code, message) => ({ code, message })

export function buildAttorneyCoordinationPhase7Decision({
  phase6Report = null,
  phase6ReportFingerprint = '',
  phase6Evidence = null,
  phase6EvidenceFingerprint = '',
  request = null,
  requestFingerprint = '',
  receipt = null,
  receiptFingerprint = '',
} = {}) {
  const blockers = []
  if (phase6Report?.status !== 'PASSED') blockers.push(issue('PHASE6_NOT_PASSED', 'A genuine Phase 6 PASSED report is required.'))
  if (!text(phase6ReportFingerprint) || phase6Report?.reportFingerprint !== phase6ReportFingerprint) blockers.push(issue('PHASE6_REPORT_MISMATCH', 'Use the intact Phase 6 report.'))
  if (!text(phase6EvidenceFingerprint) || phase6Report?.evidenceFingerprint !== phase6EvidenceFingerprint) blockers.push(issue('PHASE6_EVIDENCE_MISMATCH', 'Use the exact Phase 6 evidence bound to the report.'))
  if (phase6Evidence?.environment !== 'staging' || !text(phase6Evidence?.codeRevision)) blockers.push(issue('PHASE6_SOURCE_INVALID', 'Phase 6 evidence must identify staging and a code revision.'))
  if (blockers.length) return { status: 'BLOCKED', pilotAuthorized: false, pilotActive: false, blockers, rollbackTriggers: [] }
  if (!request) return { status: 'READY_FOR_AUTHORIZATION', pilotAuthorized: false, pilotActive: false, blockers: [], rollbackTriggers: [] }

  const authorizationFailures = []
  if (!text(requestFingerprint)) authorizationFailures.push(issue('REQUEST_FINGERPRINT_MISSING', 'Fingerprint the immutable pilot request.'))
  if (request.version !== ATTORNEY_COORDINATION_PHASE7_VERSION) authorizationFailures.push(issue('REQUEST_VERSION_INVALID', 'Use the current Phase 7 request version.'))
  if (request.phase6ReportFingerprint !== phase6ReportFingerprint || request.phase6EvidenceFingerprint !== phase6EvidenceFingerprint) authorizationFailures.push(issue('REQUEST_NOT_BOUND_TO_PHASE6', 'Bind the request to the exact Phase 6 evidence chain.'))
  if (request.codeRevision !== phase6Evidence.codeRevision) authorizationFailures.push(issue('CODE_REVISION_MISMATCH', 'Release only the Phase 6-tested revision.'))
  if (request.confirmation !== ATTORNEY_COORDINATION_PHASE7_CONFIRMATION) authorizationFailures.push(issue('CONFIRMATION_REQUIRED', `Use ${ATTORNEY_COORDINATION_PHASE7_CONFIRMATION}.`))
  if (!text(request.authorizedBy) || !text(request.authorizedAt) || !text(request.changeReference)) authorizationFailures.push(issue('AUTHORITY_INCOMPLETE', 'Record a named authorizer, timestamp and change reference.'))
  if (!text(request.productionProjectRef) || request.productionProjectRef === request.stagingProjectRef) authorizationFailures.push(issue('TARGET_SEPARATION_FAILED', 'Production and staging project references must be distinct.'))
  if (!Array.isArray(request.organisationIds) || request.organisationIds.length !== 1 || !text(request.organisationIds[0])) authorizationFailures.push(issue('PILOT_SCOPE_INVALID', 'Phase 7 permits exactly one pilot organisation.'))
  if (!text(request.featureFlag) || request.killSwitchVerified !== true) authorizationFailures.push(issue('ROLLOUT_CONTROL_MISSING', 'A named feature flag and verified kill switch are required.'))
  if (JSON.stringify(request.migrations) !== JSON.stringify(ATTORNEY_COORDINATION_REQUIRED_MIGRATIONS)) authorizationFailures.push(issue('MIGRATION_SET_MISMATCH', 'Apply only the exact ordered Phase 3–4 migration set.'))
  if (authorizationFailures.length) return { status: 'AUTHORIZATION_INVALID', pilotAuthorized: false, pilotActive: false, blockers: authorizationFailures, rollbackTriggers: [] }
  if (!receipt) return { status: 'AUTHORIZED_TO_EXECUTE', pilotAuthorized: true, pilotActive: false, blockers: [], rollbackTriggers: [] }

  const failures = []
  const rollbackTriggers = []
  if (!text(receiptFingerprint)) failures.push(issue('RECEIPT_FINGERPRINT_MISSING', 'Fingerprint the immutable activation receipt.'))
  if (receipt.version !== ATTORNEY_COORDINATION_PHASE7_VERSION || receipt.requestFingerprint !== requestFingerprint) failures.push(issue('RECEIPT_NOT_BOUND_TO_REQUEST', 'Use a receipt from this exact authorization.'))
  if (receipt.productionProjectRef !== request.productionProjectRef || receipt.codeRevision !== request.codeRevision) rollbackTriggers.push(issue('DEPLOYMENT_IDENTITY_DRIFT', 'Disable the pilot and restore the approved target and revision.'))
  if (JSON.stringify(receipt.organisationIds) !== JSON.stringify(request.organisationIds) || receipt.featureFlag !== request.featureFlag) rollbackTriggers.push(issue('PILOT_SCOPE_DRIFT', 'Disable the feature flag immediately.'))
  if (JSON.stringify(receipt.appliedMigrations) !== JSON.stringify(ATTORNEY_COORDINATION_REQUIRED_MIGRATIONS)) rollbackTriggers.push(issue('MIGRATION_DRIFT', 'Stop pilot writes and reconcile migration state.'))
  if (receipt.killSwitchAvailable !== true || receipt.featureFlagEnabled !== true) failures.push(issue('PILOT_NOT_ACTIVE', 'Confirm the bounded flag and kill switch are operational.'))
  for (const role of ['transfer_attorney', 'bond_attorney', 'cancellation_attorney']) {
    const smoke = receipt.roleSmokes?.find((item) => item.role === role)
    if (!smoke || smoke.passed !== true || !text(smoke.evidence)) failures.push(issue('ROLE_SMOKE_FAILED', `Production pilot smoke failed for ${role}.`))
  }
  for (const destination of ['attorney_workspace', 'transaction_sync', 'televent_updates']) {
    const smoke = receipt.destinationSmokes?.find((item) => item.destination === destination)
    if (!smoke || smoke.passed !== true || !text(smoke.evidence)) failures.push(issue('DESTINATION_SMOKE_FAILED', `Pilot propagation was not proven for ${destination}.`))
  }
  for (const [field, code] of [
    ['securityIncidents', 'SECURITY_INCIDENT'],
    ['visibilityIncidents', 'VISIBILITY_INCIDENT'],
    ['unexpectedPermissionAllows', 'PERMISSION_BOUNDARY_FAILURE'],
    ['propagationGaps', 'PROPAGATION_GAP'],
    ['attributionGaps', 'ATTRIBUTION_GAP'],
    ['productionErrors', 'PRODUCTION_ERROR'],
  ]) {
    if (Number(receipt[field]) !== 0) rollbackTriggers.push(issue(code, `Disable the pilot; ${field} must remain zero.`))
  }
  if (!text(receipt.monitoringEvidence) || !text(receipt.activatedAt) || !text(receipt.activatedBy)) failures.push(issue('ACTIVATION_EVIDENCE_INCOMPLETE', 'Record activation and monitoring evidence.'))
  const status = rollbackTriggers.length ? 'ROLLBACK' : failures.length ? 'HOLD' : 'PILOT_ACTIVE'
  return { status, pilotAuthorized: true, pilotActive: status === 'PILOT_ACTIVE', blockers: failures, rollbackTriggers }
}
