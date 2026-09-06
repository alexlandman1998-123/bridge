export const ATTORNEY_PRACTICAL_PHASE6_VERSION = 'attorney-practical-release-candidate-phase6-v1'
export const ATTORNEY_PRACTICAL_PHASE6_CONFIRMATION = 'APPROVE_ATTORNEY_CONTROLLED_RELEASE'
export const ATTORNEY_PRACTICAL_STAGING_PROJECT_REF = 'vaszuxjeoajeuhlcnzzf'
export const ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'

const text = (value) => String(value || '').trim()
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

function chainBlockers({ contractFingerprint, phase0Report, phase0Approval, phase5Report, phase5Evidence, phase5EvidenceFingerprint }) {
  const blockers = []
  if (phase0Report?.status !== 'ACCEPTED' || phase0Report?.contractFingerprint !== contractFingerprint || phase0Approval?.contractFingerprint !== contractFingerprint || phase0Approval?.confirmation !== 'ACCEPT_ATTORNEY_RELEASE_BAR') blockers.push(issue('PHASE0_ACCEPTANCE_INVALID', 'Use the accepted Phase 0 release bar and exact approval.'))
  if (phase5Report?.status !== 'STABILIZED') blockers.push(issue('PHASE5_NOT_STABILIZED', 'Complete the clean practical staging soak.'))
  if (phase5Evidence?.contractFingerprint !== contractFingerprint || !text(phase5EvidenceFingerprint) || phase5Report?.evidenceFingerprint !== phase5EvidenceFingerprint) blockers.push(issue('PHASE5_EVIDENCE_MISMATCH', 'Use the exact stabilized Phase 5 evidence.'))
  return blockers
}

export function buildAttorneyPracticalPhase6Decision({ contract = {}, contractFingerprint = '', phase0Report = null, phase0Approval = null, phase5Report = null, phase5Evidence = null, phase5EvidenceFingerprint = '', candidate = null, candidateFingerprint = '', approval = null } = {}) {
  const blockers = chainBlockers({ contractFingerprint, phase0Report, phase0Approval, phase5Report, phase5Evidence, phase5EvidenceFingerprint })
  if (blockers.length) return { version: ATTORNEY_PRACTICAL_PHASE6_VERSION, status: 'BLOCKED', releaseAuthorized: false, candidateFingerprint: candidateFingerprint || null, blockerCount: blockers.length, blockers }
  if (!candidate) return { version: ATTORNEY_PRACTICAL_PHASE6_VERSION, status: 'READY_TO_PREPARE', releaseAuthorized: false, candidateFingerprint: null, blockerCount: 0, blockers: [] }

  const failures = []
  if (candidate.version !== ATTORNEY_PRACTICAL_PHASE6_VERSION) failures.push(issue('CANDIDATE_VERSION_INVALID', 'Use the current Phase 6 candidate format.'))
  if (candidate.sourceEnvironment !== 'staging') failures.push(issue('SOURCE_ENVIRONMENT_INVALID', 'Promote only the certified staging candidate.'))
  if (candidate.contractFingerprint !== contractFingerprint || candidate.phase5EvidenceFingerprint !== phase5EvidenceFingerprint) failures.push(issue('CANDIDATE_EVIDENCE_STALE', 'Bind the candidate to the current contract and stabilized soak.'))
  if (!text(candidate.codeRevision) || !text(candidate.buildArtifactHash) || !text(candidate.buildEvidencePath) || !text(candidate.preparedBy) || !text(candidate.preparedAt)) failures.push(issue('CANDIDATE_IDENTITY_INCOMPLETE', 'Record revision, build hash/evidence, preparer, and timestamp.'))
  if (candidate.cumulativeTestsPassed !== true || candidate.productionBuildPassed !== true) failures.push(issue('CODE_OR_BUILD_GATE_FAILED', 'Pass cumulative attorney tests and a fresh production build.'))

  const environment = candidate.environmentSafety || {}
  if (environment.stagingProjectRef !== ATTORNEY_PRACTICAL_STAGING_PROJECT_REF || environment.productionProjectRef !== ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF || environment.stagingProjectRef === environment.productionProjectRef) failures.push(issue('ENVIRONMENT_SEPARATION_FAILED', 'Use the exact approved staging and production project references without swapping them.'))
  if (environment.productionTargetConfirmed !== true || environment.secretsSeparated !== true || environment.productionBackupVerified !== true) failures.push(issue('PRODUCTION_SAFETY_INCOMPLETE', 'Confirm the production target, isolated secrets, and recoverable backup.'))
  if (!['none', 'verified'].includes(environment.migrationPlanStatus)) failures.push(issue('MIGRATION_PLAN_UNVERIFIED', 'Mark database migration as none or attach a verified plan.'))

  const rollback = candidate.rollback || {}
  if (!text(rollback.owner) || !text(rollback.runbookPath) || !text(rollback.verifiedAt) || rollback.killSwitchVerified !== true || !Number.isFinite(Number(rollback.maximumMinutes)) || Number(rollback.maximumMinutes) > 15) failures.push(issue('ROLLBACK_NOT_READY', 'Verify an owned kill switch and rollback procedure executable within 15 minutes.'))
  const rollout = candidate.rollout || {}
  if (rollout.mode !== 'controlled' || !Number.isInteger(rollout.maximumOrganisations) || rollout.maximumOrganisations < 1 || rollout.maximumOrganisations > 3 || !text(rollout.featureFlag) || !text(rollout.cohortReference)) failures.push(issue('ROLLOUT_NOT_CONTROLLED', 'Use a named feature flag and a one-to-three organisation cohort.'))

  const monitoring = candidate.monitoring || {}
  if (!text(monitoring.owner) || !text(monitoring.dashboardPath) || monitoring.securityAlertReady !== true || monitoring.visibilityAlertReady !== true || monitoring.propagationAlertReady !== true || monitoring.dataIntegrityAlertReady !== true) failures.push(issue('MONITORING_NOT_READY', 'Assign monitoring and verify all release-critical alerts.'))
  for (const destination of contract.destinations || []) if (!monitoring.destinations?.includes(destination)) failures.push(issue('MONITORING_DESTINATION_MISSING', 'Monitor every contracted update destination.', { destination }))
  if (!text(candidate.support?.owner) || !text(candidate.support?.escalationPath) || !text(candidate.support?.coverageWindow)) failures.push(issue('SUPPORT_NOT_READY', 'Record launch support ownership, escalation, and coverage.'))

  if (failures.length) return { version: ATTORNEY_PRACTICAL_PHASE6_VERSION, status: 'INVALID', releaseAuthorized: false, candidateFingerprint: candidateFingerprint || null, blockerCount: failures.length, blockers: failures }
  const approvalBlockers = []
  if (!text(candidateFingerprint) || approval?.candidateFingerprint !== candidateFingerprint) approvalBlockers.push(issue('APPROVAL_FINGERPRINT_MISMATCH', 'Approve the exact immutable Phase 6 candidate fingerprint.'))
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt) || !text(approval?.approvalReference)) approvalBlockers.push(issue('ACCOUNTABLE_APPROVAL_REQUIRED', 'Record release owner, timestamp, and approval reference.'))
  if (approval?.confirmation !== ATTORNEY_PRACTICAL_PHASE6_CONFIRMATION) approvalBlockers.push(issue('EXACT_CONFIRMATION_REQUIRED', `Use the exact confirmation ${ATTORNEY_PRACTICAL_PHASE6_CONFIRMATION}.`))
  return { version: ATTORNEY_PRACTICAL_PHASE6_VERSION, status: approvalBlockers.length ? 'READY_FOR_APPROVAL' : 'APPROVED', releaseAuthorized: approvalBlockers.length === 0, candidateFingerprint, blockerCount: approvalBlockers.length, blockers: approvalBlockers }
}
