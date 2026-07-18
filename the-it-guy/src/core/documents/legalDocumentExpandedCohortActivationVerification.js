import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const EXPANDED_COHORT_VERIFICATION_CONTRACT = 'legal-document-expanded-cohort-verification-q3-v1'
const MAX_EVIDENCE_AGE_MINUTES = 15

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

export function assessLegalDocumentExpandedCohortActivationVerification({ q2 = {}, activation = null, pilot = {}, a3 = {}, cohort = {}, now = Date.now(), maxEvidenceAgeMinutes = MAX_EVIDENCE_AGE_MINUTES } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  const activatedIds = ids(activation?.activatedOrganisationIds)
  const configuredIds = ids(pilot.organisationIds)
  const repositoryActivatedIds = ids(pilot.activation?.activatedOrganisationIds)
  const readyIds = ids(cohort.readyOrganisationIds)
  const added = normalize(activation?.addedOrganisationId)
  const canAssessDownstream = q2.status === 'READY_FOR_Q3' && q2.ready === true && Boolean(activation)

  if (q2.status !== 'READY_FOR_Q3' || q2.ready !== true) push('Q3_Q2_NOT_READY', 'Resolve the Q2 activation and runtime-secret verification before post-activation acceptance.')
  if (!activation || activation.status !== 'activated' || !normalize(activation.activationDigest)) push('Q3_ACTIVATION_RECORD_MISSING', 'Restore the digest-valid Q2 expanded-cohort activation record.')
  if (activation) {
    if (pilot.enabled !== true || pilot.activation?.status !== 'active') push('Q3_PILOT_NOT_ACTIVE', 'Restore the guarded active state or roll back the expansion.')
    if (!activatedIds.length || configuredIds.join(',') !== activatedIds.join(',') || repositoryActivatedIds.join(',') !== activatedIds.join(',')) push('Q3_ACTIVATED_COHORT_DRIFT', 'Make effective and repository-activated cohorts identical to the Q2 receipt.')
    if (normalize(pilot.activation?.expansionActivationDigest) !== normalize(activation.activationDigest)) push('Q3_ACTIVATION_RECEIPT_BINDING_INVALID', 'Bind the active repository state to the exact Q2 activation receipt.')
    if (normalize(pilot.environment).toLowerCase() !== normalize(activation.activationTarget?.environment).toLowerCase() || normalize(pilot.activation?.targetProjectRef) !== normalize(activation.activationTarget?.projectRef)) push('Q3_ACTIVATION_TARGET_DRIFT', 'Restore the exact Q2 environment and project activation target.')
  }
  if (canAssessDownstream && (a3.status !== 'HEALTHY' || a3.secretDigestsVerified !== true || a3.releaseStatus !== 'GO')) push('Q3_A3_HEALTH_INVALID', 'Restore runtime-secret parity and a complete GO release gate, then rerun Q3.')
  if (canAssessDownstream && activatedIds.length && ids(a3.organisationIds).join(',') !== activatedIds.join(',')) push('Q3_A3_COHORT_MISMATCH', 'Make A3 runtime verification cover the exact expanded Q2 cohort.')
  if (canAssessDownstream && cohort.status !== 'READY') push('Q3_COHORT_READINESS_NOT_READY', 'Restore live agency, agent, template, and preferred-attorney readiness after activation.')
  if (canAssessDownstream && (activatedIds.some((id) => !readyIds.includes(id)) || ids(cohort.configuredOrganisationIds).join(',') !== activatedIds.join(','))) push('Q3_EXPANDED_COHORT_NOT_READY', 'Make every activated organisation live-ready and present in the verified configured cohort.')
  const addedAssessment = (cohort.assessments || []).find((row) => normalize(row.organisationId) === added)
  if (canAssessDownstream && (!addedAssessment || addedAssessment.status !== 'READY' || (addedAssessment.blockers || []).length || Number(addedAssessment.activeAgentCount || 0) < 1 || addedAssessment.templates?.otp !== true || addedAssessment.templates?.mandate !== true || addedAssessment.preferredTransferAttorney !== true)) push('Q3_ADDED_ORGANISATION_EVIDENCE_INVALID', 'Roll back or restore the added organisation’s complete live readiness evidence.')
  if (q2.mutatedData !== false || a3.mutatedData !== false || cohort.mutatedData !== false) push('Q3_NON_READ_ONLY_EVIDENCE', 'Use only read-only Q2, A3, and cohort verification evidence.')
  if (activation) {
    const activatedAt = timestamp(activation.activatedAt)
    const evidenceTimes = [q2.checkedAt, a3.checkedAt, cohort.checkedAt].map(timestamp)
    const oldestAllowed = now - maxEvidenceAgeMinutes * 60_000
    if (activatedAt === null || evidenceTimes.some((value) => value === null || value < activatedAt || value < oldestAllowed || value > now + 60_000)) push('Q3_EVIDENCE_STALE_OR_MISORDERED', `Regenerate all post-activation evidence within ${maxEvidenceAgeMinutes} minutes and after Q2 activation.`)
  }
  return { ready: blockers.length === 0, blockers, activatedOrganisationIds: activatedIds, addedOrganisationId: added || null, evidenceAgeLimitMinutes: maxEvidenceAgeMinutes }
}

export function buildLegalDocumentExpandedCohortVerification({ activation = {}, a3 = {}, cohort = {}, checkedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: EXPANDED_COHORT_VERIFICATION_CONTRACT,
    status: 'verified',
    verifiedAt: new Date(checkedAt).toISOString(),
    sourceActivationDigest: normalize(activation.activationDigest),
    activationTarget: activation.activationTarget || null,
    previousOrganisationIds: ids(activation.previousOrganisationIds),
    addedOrganisationId: normalize(activation.addedOrganisationId),
    activatedOrganisationIds: ids(activation.activatedOrganisationIds),
    runtimeAssurance: { a3Status: a3.status || 'UNAVAILABLE', secretDigestsVerified: a3.secretDigestsVerified === true, releaseStatus: a3.releaseStatus || 'UNAVAILABLE' },
    cohortAssurance: { status: cohort.status || 'UNAVAILABLE', readyOrganisationIds: ids(cohort.readyOrganisationIds) },
    requiredNextPhases: ['fresh M1 release authority', 'fresh M2 receipt', 'fresh M3 claim'],
  })
}

export { EXPANDED_COHORT_VERIFICATION_CONTRACT as LEGAL_DOCUMENT_Q3_VERIFICATION_CONTRACT, MAX_EVIDENCE_AGE_MINUTES as LEGAL_DOCUMENT_Q3_MAX_EVIDENCE_AGE_MINUTES }
