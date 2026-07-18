import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import { LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT } from './legalDocumentNextExpandedCohortActivation.js'

const NEXT_EXPANDED_COHORT_VERIFICATION_CONTRACT = 'legal-document-next-expanded-cohort-verification-v3-v1'
const MAX_EVIDENCE_AGE_MINUTES = 15

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function assessLegalDocumentNextExpandedCohortActivationVerification({ v2 = {}, activation = null, pilot = {}, a3 = {}, cohort = {}, now = Date.now(), maxEvidenceAgeMinutes = MAX_EVIDENCE_AGE_MINUTES, digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  const activatedIds = ids(activation?.activatedOrganisationIds)
  const configuredIds = ids(pilot.organisationIds)
  const repositoryActivatedIds = ids(pilot.activation?.activatedOrganisationIds)
  const releaseApprovedIds = ids(pilot.releasePreparation?.organisationIds)
  const readyIds = ids(cohort.readyOrganisationIds)
  const added = normalize(activation?.addedOrganisationId)
  const canAssessDownstream = v2.status === 'READY_FOR_V3' && v2.ready === true && Boolean(activation)
  if (v2.status !== 'READY_FOR_V3' || v2.ready !== true) push('V3_V2_NOT_READY', 'Resolve V2 activation and runtime-secret verification before post-activation acceptance.')
  if (!activation || activation.status !== 'activated' || !normalize(activation.activationDigest)) push('V3_ACTIVATION_RECORD_MISSING', 'Restore the digest-valid V2 expanded-cohort activation record.')
  if (activation) {
    if (activation.contract !== LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT) push('V3_ACTIVATION_CONTRACT_INVALID', 'Restore an activation receipt produced by the current V2 contract.')
    if (pilot.enabled !== true || pilot.activation?.status !== 'active') push('V3_PILOT_NOT_ACTIVE', 'Restore the guarded active state or roll back the V2 expansion.')
    if (!activatedIds.length || configuredIds.join(',') !== activatedIds.join(',') || repositoryActivatedIds.join(',') !== activatedIds.join(',') || releaseApprovedIds.join(',') !== activatedIds.join(',')) push('V3_ACTIVATED_COHORT_DRIFT', 'Make effective, release-approved, and repository-activated cohorts identical to the V2 receipt.')
    if (normalize(pilot.activation?.nextExpansionActivationDigest) !== normalize(activation.activationDigest)) push('V3_ACTIVATION_RECEIPT_BINDING_INVALID', 'Bind active repository state to the exact V2 activation receipt.')
    if (normalize(pilot.environment).toLowerCase() !== normalize(activation.activationTarget?.environment).toLowerCase() || normalize(pilot.activation?.targetProjectRef) !== normalize(activation.activationTarget?.projectRef)) push('V3_ACTIVATION_TARGET_DRIFT', 'Restore the exact V2 environment and project activation target.')
    if (typeof digest === 'function') {
      const { activationDigest, ...payload } = activation
      if (!normalize(activationDigest) || activationDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('V3_ACTIVATION_DIGEST_INVALID', 'Restore the exact digest-valid V2 activation receipt; do not hand-edit it.')
    }
  }
  if (canAssessDownstream && (a3.status !== 'HEALTHY' || a3.secretDigestsVerified !== true || a3.releaseStatus !== 'GO')) push('V3_A3_HEALTH_INVALID', 'Restore runtime-secret parity and a complete GO release gate, then rerun V3.')
  if (canAssessDownstream && activatedIds.length && ids(a3.organisationIds).join(',') !== activatedIds.join(',')) push('V3_A3_COHORT_MISMATCH', 'Make A3 runtime verification cover the exact expanded V2 cohort.')
  if (canAssessDownstream && cohort.status !== 'READY') push('V3_COHORT_READINESS_NOT_READY', 'Restore live agency, agent, template, and preferred-attorney readiness after activation.')
  if (canAssessDownstream && activatedIds.some((id) => !readyIds.includes(id))) push('V3_EXPANDED_COHORT_NOT_READY', 'Make every activated organisation live-ready in the direct post-activation check.')
  const minimumAgents = Number(pilot.cohortPreparation?.minimumActiveAgents || 1)
  const addedAssessment = (cohort.assessments || []).find((row) => normalize(row.organisationId) === added)
  if (canAssessDownstream && (!addedAssessment || addedAssessment.status !== 'READY' || (addedAssessment.blockers || []).length || Number(addedAssessment.activeAgentCount || 0) < minimumAgents || addedAssessment.templates?.otp !== true || addedAssessment.templates?.mandate !== true || addedAssessment.preferredTransferAttorney !== true)) push('V3_ADDED_ORGANISATION_EVIDENCE_INVALID', 'Roll back or restore the added organisation’s complete live readiness evidence.')
  if (v2.mutatedData !== false || a3.mutatedData !== false || cohort.mutatedData !== false) push('V3_NON_READ_ONLY_EVIDENCE', 'Use only read-only V2, A3, and cohort verification evidence.')
  if (activation) {
    const activatedAt = Date.parse(activation.activatedAt || '')
    const evidenceTimes = [v2.checkedAt, a3.checkedAt, cohort.checkedAt].map((value) => Date.parse(value || ''))
    const oldestAllowed = now - Number(maxEvidenceAgeMinutes) * 60_000
    if (!Number.isInteger(Number(maxEvidenceAgeMinutes)) || Number(maxEvidenceAgeMinutes) < 1 || Number(maxEvidenceAgeMinutes) > 60 || !Number.isFinite(activatedAt) || evidenceTimes.some((value) => !Number.isFinite(value) || value < activatedAt || value < oldestAllowed || value > now + 60_000)) push('V3_EVIDENCE_STALE_OR_MISORDERED', `Regenerate all post-activation evidence within ${maxEvidenceAgeMinutes} minutes and after V2 activation.`)
  }
  return { ready: blockers.length === 0, blockers, activatedOrganisationIds: activatedIds, addedOrganisationId: added || null, evidenceAgeLimitMinutes: Number(maxEvidenceAgeMinutes) }
}

export function buildLegalDocumentNextExpandedCohortVerification({ activation = {}, a3 = {}, cohort = {}, checkedAt = new Date().toISOString() } = {}) {
  const readinessEvidence = ids(activation.activatedOrganisationIds).map((organisationId) => {
    const assessment = (cohort.assessments || []).find((row) => normalize(row.organisationId) === organisationId)
    return {
      organisationId,
      organisationName: assessment?.organisationName || null,
      activeAgentCount: Number(assessment?.activeAgentCount || 0),
      templates: { otp: assessment?.templates?.otp === true, mandate: assessment?.templates?.mandate === true },
      preferredTransferAttorney: assessment?.preferredTransferAttorney === true,
    }
  })
  return canonicalLegalDocumentReleaseValue({
    contract: NEXT_EXPANDED_COHORT_VERIFICATION_CONTRACT,
    status: 'verified',
    verifiedAt: new Date(checkedAt).toISOString(),
    sourceActivationDigest: normalize(activation.activationDigest),
    sourcePlanDigest: normalize(activation.sourcePlanDigest),
    sourceCertificationDigest: normalize(activation.sourceCertificationDigest),
    sourcePendingDigest: normalize(activation.sourcePendingDigest),
    sourceApprovalDigest: normalize(activation.sourceApprovalDigest),
    sourceHandoffDigest: normalize(activation.sourceHandoffDigest),
    sourceContinuationDigest: normalize(activation.sourceContinuationDigest),
    sourcePreviousActivationDigest: normalize(activation.sourcePreviousActivationDigest),
    activationTarget: activation.activationTarget || null,
    previousOrganisationIds: ids(activation.previousOrganisationIds),
    addedOrganisationId: normalize(activation.addedOrganisationId),
    activatedOrganisationIds: ids(activation.activatedOrganisationIds),
    runtimeAssurance: { a3Status: a3.status || 'UNAVAILABLE', secretDigestsVerified: a3.secretDigestsVerified === true, releaseStatus: a3.releaseStatus || 'UNAVAILABLE' },
    cohortReadinessEvidence: readinessEvidence,
    requiredNextPhases: ['V4 post-activation integrity handoff', 'W1 expanded-cohort release authority', 'fresh receipt', 'one-time claim'],
  })
}

export { NEXT_EXPANDED_COHORT_VERIFICATION_CONTRACT as LEGAL_DOCUMENT_V3_VERIFICATION_CONTRACT, MAX_EVIDENCE_AGE_MINUTES as LEGAL_DOCUMENT_V3_MAX_EVIDENCE_AGE_MINUTES }
