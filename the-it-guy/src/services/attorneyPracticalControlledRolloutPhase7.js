import { ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF } from './attorneyPracticalReleaseCandidatePhase6.js'

export const ATTORNEY_PRACTICAL_PHASE7_VERSION = 'attorney-practical-controlled-rollout-phase7-v1'
export const ATTORNEY_PRACTICAL_PHASE7_CONFIRMATION = 'EXECUTE_ATTORNEY_CONTROLLED_RELEASE'

const text = (value) => String(value || '').trim()
const count = (value) => Number(value)
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })
const validHttpsUrl = (value) => { try { return new URL(value).protocol === 'https:' } catch { return false } }

function phase6Blockers({ phase6Report, phase6Candidate, phase6CandidateFingerprint, phase6Approval }) {
  const blockers = []
  if (phase6Report?.status !== 'APPROVED' || phase6Report?.releaseAuthorized !== true) blockers.push(issue('PHASE6_NOT_APPROVED', 'Obtain approval for the immutable Phase 6 candidate.'))
  if (!text(phase6CandidateFingerprint) || phase6Report?.candidateFingerprint !== phase6CandidateFingerprint || phase6Approval?.candidateFingerprint !== phase6CandidateFingerprint) blockers.push(issue('PHASE6_CANDIDATE_MISMATCH', 'Use the exact approved Phase 6 candidate and approval.'))
  if (phase6Candidate?.environmentSafety?.productionProjectRef !== ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF) blockers.push(issue('PRODUCTION_TARGET_MISMATCH', 'Use the exact approved production project.'))
  return blockers
}

export function buildAttorneyPracticalPhase7Decision({ contract = {}, phase6Report = null, phase6Candidate = null, phase6CandidateFingerprint = '', phase6Approval = null, request = null, requestFingerprint = '', receipt = null, receiptFingerprint = null } = {}) {
  const blockers = phase6Blockers({ phase6Report, phase6Candidate, phase6CandidateFingerprint, phase6Approval })
  if (blockers.length) return { version: ATTORNEY_PRACTICAL_PHASE7_VERSION, status: 'BLOCKED', executionAuthorized: false, pilotActive: false, blockerCount: blockers.length, blockers, requestFingerprint: requestFingerprint || null, receiptFingerprint: null }
  if (!request) return { version: ATTORNEY_PRACTICAL_PHASE7_VERSION, status: 'READY_FOR_AUTHORIZATION', executionAuthorized: false, pilotActive: false, blockerCount: 0, blockers: [], requestFingerprint: null, receiptFingerprint: null }

  const requestFailures = []
  if (!text(requestFingerprint)) requestFailures.push(issue('EXECUTION_REQUEST_FINGERPRINT_MISSING', 'Hash and retain the immutable execution request.'))
  if (request.version !== ATTORNEY_PRACTICAL_PHASE7_VERSION || request.candidateFingerprint !== phase6CandidateFingerprint) requestFailures.push(issue('EXECUTION_REQUEST_STALE', 'Bind the execution request to the exact approved candidate.'))
  if (request.productionProjectRef !== ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF) requestFailures.push(issue('EXECUTION_TARGET_DENIED', 'Target only the approved production project.'))
  if (!text(request.authorizedBy) || !text(request.authorizedAt) || !text(request.changeReference)) requestFailures.push(issue('EXECUTION_AUTHORITY_INCOMPLETE', 'Record authorizer, timestamp, and change reference.'))
  if (request.confirmation !== ATTORNEY_PRACTICAL_PHASE7_CONFIRMATION) requestFailures.push(issue('EXACT_EXECUTION_CONFIRMATION_REQUIRED', `Use the exact confirmation ${ATTORNEY_PRACTICAL_PHASE7_CONFIRMATION}.`))
  const cohort = Array.isArray(request.organisationIds) ? request.organisationIds.filter(text) : []
  if (!cohort.length || cohort.length > count(phase6Candidate?.rollout?.maximumOrganisations) || new Set(cohort).size !== cohort.length) requestFailures.push(issue('COHORT_INVALID', 'Authorize a unique non-empty cohort within the approved maximum.'))
  if (request.featureFlag !== phase6Candidate?.rollout?.featureFlag || request.cohortReference !== phase6Candidate?.rollout?.cohortReference) requestFailures.push(issue('ROLLOUT_CONTROL_MISMATCH', 'Use the approved feature flag and cohort reference.'))
  if (requestFailures.length) return { version: ATTORNEY_PRACTICAL_PHASE7_VERSION, status: 'AUTHORIZATION_INVALID', executionAuthorized: false, pilotActive: false, blockerCount: requestFailures.length, blockers: requestFailures, requestFingerprint: requestFingerprint || null, receiptFingerprint: null }
  if (!receipt) return { version: ATTORNEY_PRACTICAL_PHASE7_VERSION, status: 'AUTHORIZED_TO_EXECUTE', executionAuthorized: true, pilotActive: false, blockerCount: 0, blockers: [], requestFingerprint, receiptFingerprint: null }

  const failures = []
  const rollbackTriggers = []
  if (receipt.version !== ATTORNEY_PRACTICAL_PHASE7_VERSION || receipt.candidateFingerprint !== phase6CandidateFingerprint || receipt.requestFingerprint !== requestFingerprint) failures.push(issue('DEPLOYMENT_RECEIPT_STALE', 'Use a receipt from this exact candidate and execution request.'))
  if (receipt.productionProjectRef !== ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF || receipt.target !== 'production') rollbackTriggers.push(issue('WRONG_PRODUCTION_TARGET', 'Stop and roll back the deployment target immediately.'))
  if (receipt.deploymentStatus !== 'READY' || !text(receipt.deploymentId) || !validHttpsUrl(receipt.deploymentUrl) || !text(receipt.deployedAt) || !text(receipt.deployedBy)) failures.push(issue('DEPLOYMENT_NOT_READY', 'Retain a READY deployment receipt with URL, ID, actor, and timestamp.'))
  if (!text(receiptFingerprint)) failures.push(issue('RECEIPT_FINGERPRINT_MISSING', 'Hash and retain the immutable deployment receipt.'))
  const authorizedMs = Date.parse(request.authorizedAt || '')
  const deployedMs = Date.parse(receipt.deployedAt || '')
  const smokeMs = Date.parse(receipt.smokeCompletedAt || '')
  if (!Number.isFinite(authorizedMs) || !Number.isFinite(deployedMs) || deployedMs < authorizedMs) failures.push(issue('DEPLOYMENT_TIME_INVALID', 'Deploy only after execution authorization.'))
  if (!Number.isFinite(smokeMs) || smokeMs < deployedMs || smokeMs - deployedMs > 30 * 60000) failures.push(issue('SMOKE_WINDOW_INVALID', 'Complete immediate production smoke within 30 minutes of deployment.'))
  if (receipt.codeRevision !== phase6Candidate?.codeRevision || receipt.buildArtifactHash !== phase6Candidate?.buildArtifactHash || receipt.deploymentMethod !== 'promote_prevalidated_artifact') failures.push(issue('DEPLOYED_ARTIFACT_MISMATCH', 'Promote the exact prevalidated artifact without rebuilding it.'))
  if (receipt.featureFlag !== request.featureFlag || receipt.cohortReference !== request.cohortReference || JSON.stringify(receipt.organisationIds) !== JSON.stringify(cohort)) rollbackTriggers.push(issue('COHORT_ACTIVATION_MISMATCH', 'Disable the flag and restore the approved cohort boundary.'))
  if (receipt.killSwitchAvailable !== true) rollbackTriggers.push(issue('KILL_SWITCH_UNAVAILABLE', 'Stop rollout until the kill switch is operational.'))

  for (const role of Object.keys(contract.roles || {})) {
    const smoke = (receipt.roleSmokes || []).find((item) => item.role === role)
    if (!smoke || smoke.authenticated !== true || smoke.assignedMatterOpened !== true || smoke.safeMutationPassed !== true || !text(smoke.evidencePath)) failures.push(issue('ROLE_SMOKE_FAILED', 'Pass authenticated production smoke for every attorney role.', { role }))
  }
  for (const destination of contract.destinations || []) {
    const smoke = (receipt.destinationSmokes || []).find((item) => item.destination === destination)
    if (!smoke || smoke.passed !== true || !text(smoke.evidencePath)) failures.push(issue('DESTINATION_SMOKE_FAILED', 'Verify every contracted destination after activation.', { destination }))
  }
  for (const [field, code, remedy] of [
    ['securityIncidents', 'SECURITY_INCIDENT', 'Disable the pilot and execute rollback.'],
    ['visibilityIncidents', 'VISIBILITY_INCIDENT', 'Disable update delivery and execute rollback.'],
    ['dataIntegrityIncidents', 'DATA_INTEGRITY_INCIDENT', 'Stop writes and execute rollback.'],
    ['propagationGaps', 'PROPAGATION_REGRESSION', 'Disable the pilot and reconcile propagation.'],
    ['unexpectedPermissionAllows', 'PERMISSION_BOUNDARY_FAILURE', 'Disable the pilot and investigate authorization.'],
  ]) {
    const value = count(receipt[field])
    if (!Number.isFinite(value) || value < 0) failures.push(issue('SAFETY_COUNTER_INVALID', 'Record every safety counter explicitly.', { field }))
    else if (value > 0) rollbackTriggers.push(issue(code, remedy, { count: value }))
  }
  if (count(receipt.productionErrorCount) !== 0) rollbackTriggers.push(issue('PRODUCTION_ERRORS_DETECTED', 'Stop expansion and investigate production errors.', { count: count(receipt.productionErrorCount) }))
  if (!text(receipt.monitoringSnapshotPath) || !text(receipt.smokeCompletedAt)) failures.push(issue('POST_DEPLOY_EVIDENCE_INCOMPLETE', 'Retain monitoring and smoke-completion evidence.'))
  const status = rollbackTriggers.length ? 'ROLLBACK' : failures.length ? 'HOLD' : 'PILOT_ACTIVE'
  return { version: ATTORNEY_PRACTICAL_PHASE7_VERSION, status, executionAuthorized: true, pilotActive: status === 'PILOT_ACTIVE', blockerCount: failures.length + rollbackTriggers.length, blockers: failures, rollbackTriggers, requestFingerprint, receiptFingerprint }
}
