export const ATTORNEY_RELEASE_PHASE7_VERSION = 'attorney-release-final-gate-phase7-v1'
export const ATTORNEY_RELEASE_PHASE7_CONFIRMATION = 'AUTHORIZE_ATTORNEY_RELEASE'
const text = (value) => String(value || '').trim()
const blocker = (code, remedy, details = {}) => ({ code, remedy, ...details })

export function buildAttorneyReleasePhase7Decision({ releaseFingerprint = '', phase6Report = null, observationRefreshPassed = false, codeGatePassed = false, buildPassed = false, approval = null } = {}) {
  const blockers = []
  const fingerprint = text(releaseFingerprint)
  if (phase6Report?.status !== 'STABILIZED') blockers.push(blocker('PHASE6_NOT_STABILIZED', 'Complete the real Phase 6 observation window and action sample.', { phase6Status: phase6Report?.status || 'missing' }))
  if (!observationRefreshPassed) blockers.push(blocker('PHASE6_OBSERVATION_REFRESH_FAILED', 'Refresh Phase 6 evidence from staging before making a release decision.'))
  if (!phase6Report?.evidence?.artifactIntegrityPassed) blockers.push(blocker('PHASE6_ARTIFACT_INTEGRITY_FAILED', 'Regenerate and verify the Phase 5–6 evidence chain.'))
  if (!phase6Report?.evidence?.livePropagationCheckPassed || phase6Report?.rollbackTriggers?.length) blockers.push(blocker('PHASE6_LIVE_SAFETY_FAILED', 'Resolve live propagation or rollback conditions before release.'))
  if (!codeGatePassed) blockers.push(blocker('CODE_GATE_FAILED', 'Run and pass the cumulative attorney release test suite.'))
  if (!buildPassed) blockers.push(blocker('BUILD_GATE_FAILED', 'Create a successful production build.'))
  if (!fingerprint || approval?.releaseFingerprint !== fingerprint) blockers.push(blocker('APPROVAL_FINGERPRINT_MISMATCH', 'Approve the exact Phase 7 release fingerprint after all evidence passes.'))
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt) || !text(approval?.approvalReference)) blockers.push(blocker('ACCOUNTABLE_APPROVAL_REQUIRED', 'Record an accountable release owner, timestamp, and approval reference.'))
  if (approval?.confirmation !== ATTORNEY_RELEASE_PHASE7_CONFIRMATION) blockers.push(blocker('EXACT_RELEASE_CONFIRMATION_REQUIRED', `Use the exact confirmation ${ATTORNEY_RELEASE_PHASE7_CONFIRMATION}.`))
  return { version: ATTORNEY_RELEASE_PHASE7_VERSION, releaseFingerprint: fingerprint, sourceFingerprint: text(phase6Report?.sourceFingerprint), status: blockers.length ? 'NO_GO' : 'GO', evaluatedAt: new Date().toISOString(), blockerCount: blockers.length, blockers }
}
