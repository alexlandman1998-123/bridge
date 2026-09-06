export const ATTORNEY_RELEASE_PHASE8_VERSION = 'attorney-release-controlled-cutover-phase8-v1'
export const ATTORNEY_RELEASE_PHASE8_CONFIRMATION = 'AUTHORIZE_ATTORNEY_CANARY_CUTOVER'
export const ATTORNEY_PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const text = (value) => String(value || '').trim()
const blocker = (code, remedy, details = {}) => ({ code, remedy, ...details })
const validUrl = (value) => { try { const url = new URL(text(value)); return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app') } catch { return false } }
const validUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export function buildAttorneyReleasePhase8Decision({ phase7Receipt = null, receiptIntegrityPassed = false, candidate = null, approval = null } = {}) {
  const blockers = []
  const releaseFingerprint = text(phase7Receipt?.releaseFingerprint)
  const cohortIds = [...new Set((candidate?.organisationIds || []).map(text).filter(Boolean))].sort()
  if (phase7Receipt?.status !== 'GO' || phase7Receipt?.immutable !== true || !releaseFingerprint) blockers.push(blocker('PHASE7_GO_RECEIPT_REQUIRED', 'Complete Phase 7 and supply its immutable GO receipt.'))
  if (!receiptIntegrityPassed) blockers.push(blocker('PHASE7_RECEIPT_INTEGRITY_FAILED', 'Use an unmodified, read-only Phase 7 receipt.'))
  if (candidate?.releaseFingerprint !== releaseFingerprint) blockers.push(blocker('CANDIDATE_FINGERPRINT_MISMATCH', 'Verify the preview against the exact Phase 7 release fingerprint.'))
  if (!text(candidate?.deploymentId) || !validUrl(candidate?.deploymentUrl) || !text(candidate?.verifiedAt) || candidate?.browserSmokePassed !== true) blockers.push(blocker('VERIFIED_PREVIEW_REQUIRED', 'Record the validated Vercel preview deployment, timestamp, and successful browser smoke.'))
  if (!text(candidate?.rollbackDeploymentId) || candidate?.rollbackTested !== true) blockers.push(blocker('ROLLBACK_DEPLOYMENT_REQUIRED', 'Record and test the known-good rollback deployment before cutover.'))
  if (candidate?.productionProjectRef !== ATTORNEY_PRODUCTION_PROJECT_REF) blockers.push(blocker('PRODUCTION_TARGET_MISMATCH', 'Bind the plan to the canonical production project reference.'))
  if (cohortIds.length < 1 || cohortIds.length > 3) blockers.push(blocker('CANARY_COHORT_OUT_OF_BOUNDS', 'Use one to three explicitly identified attorney organisations.', { cohortSize: cohortIds.length }))
  if (cohortIds.some((id) => !validUuid(id))) blockers.push(blocker('CANARY_COHORT_INVALID', 'Use canonical organisation UUIDs for the approved canary cohort.'))
  if (!text(candidate?.monitoringOwner) || !text(candidate?.rollbackOwner)) blockers.push(blocker('CUTOVER_OWNERS_REQUIRED', 'Record monitoring and rollback owners.'))
  if (approval?.releaseFingerprint !== releaseFingerprint || approval?.candidateDeploymentId !== candidate?.deploymentId) blockers.push(blocker('CUTOVER_APPROVAL_MISMATCH', 'Approve the exact release fingerprint and candidate deployment.'))
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt) || !text(approval?.approvalReference)) blockers.push(blocker('ACCOUNTABLE_CUTOVER_APPROVAL_REQUIRED', 'Record an accountable cutover owner, timestamp, and reference.'))
  if (approval?.confirmation !== ATTORNEY_RELEASE_PHASE8_CONFIRMATION) blockers.push(blocker('EXACT_CUTOVER_CONFIRMATION_REQUIRED', `Use the exact confirmation ${ATTORNEY_RELEASE_PHASE8_CONFIRMATION}.`))
  return { version: ATTORNEY_RELEASE_PHASE8_VERSION, status: blockers.length ? 'BLOCKED' : 'READY_FOR_CANARY', releaseFingerprint, cohortSize: cohortIds.length, blockers, blockerCount: blockers.length, evaluatedAt: new Date().toISOString() }
}
