import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import { LEGAL_DOCUMENT_U2_PENDING_EXPANSION_CONTRACT } from './legalDocumentNextPendingExpansion.js'

const NEXT_EXPANDED_COHORT_CERTIFICATION_CONTRACT = 'legal-document-next-expanded-cohort-certification-u3-v1'
const MAX_EVIDENCE_AGE_MINUTES = 15

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function assessLegalDocumentNextExpandedCohortCertification({ u2 = {}, pending = null, continuation = null, activation = null, pilot = {}, cohort = {}, l1 = {}, now = Date.now(), maxEvidenceAgeMinutes = MAX_EVIDENCE_AGE_MINUTES, digest } = {}) {
  const blockers = []
  const push = (code, solution, detail = null) => blockers.push({ code, detail, solution })
  const currentIds = ids(pending?.currentOrganisationIds)
  const proposedIds = ids(pending?.proposedOrganisationIds)
  const configuredIds = ids(pilot.organisationIds)
  const added = normalize(pending?.addedOrganisationId)
  if (u2.status !== 'READY_FOR_U3' || u2.ready !== true) push('U3_U2_NOT_READY', 'Resolve every U2 blocker and stage the exact approved expansion before certification.')
  if (!pending || pending.status !== 'staged' || !normalize(pending.pendingDigest)) push('U3_PENDING_CHANGESET_MISSING', 'Restore the digest-valid U2 pending expansion change set.')
  if (!continuation || continuation.status !== 'continued') push('U3_CONTINUATION_RECORD_MISSING', 'Restore the T1 continuation record bound by U2.')
  if (!activation || activation.status !== 'activated') push('U3_ACTIVATION_RECORD_MISSING', 'Restore the Q2 activation record bound by U2.')
  if (pending) {
    if (pending.contract !== LEGAL_DOCUMENT_U2_PENDING_EXPANSION_CONTRACT) push('U3_PENDING_CONTRACT_INVALID', 'Restage the change set using the current U2 contract before certification.')
    if (!continuation?.recordDigest || pending.sourceContinuationDigest !== continuation.recordDigest) push('U3_CONTINUATION_BINDING_INVALID', 'Certify only the U2 change set bound to the current T1 continuation.')
    if (!activation?.activationDigest || pending.sourceActivationDigest !== activation.activationDigest || continuation?.sourceActivationDigest !== activation.activationDigest) push('U3_ACTIVATION_BINDING_INVALID', 'Certify only the U2 change set bound to the current Q2 activation.')
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',') || currentIds.join(',') !== ids(pilot.releasePreparation?.organisationIds).join(',') || currentIds.join(',') !== ids(pilot.activation?.activatedOrganisationIds).join(',') || currentIds.join(',') !== ids(continuation?.releaseTarget?.organisationIds).join(',') || currentIds.join(',') !== ids(activation?.activatedOrganisationIds).join(',')) push('U3_CURRENT_COHORT_DRIFT', 'Restore the effective current cohort everywhere; do not expose the candidate before activation authority is renewed.')
    if (pilot.enabled !== true || pilot.activation?.status !== 'active') push('U3_CURRENT_ROLLOUT_NOT_ACTIVE', 'Restore the healthy active current rollout before certification.')
    if (!added || currentIds.includes(added) || proposedIds.length !== currentIds.length + 1 || !proposedIds.includes(added) || currentIds.some((id) => !proposedIds.includes(id)) || Number(pending.trancheSize) !== 1) push('U3_CERTIFICATION_TARGET_INVALID', 'Certify exactly the one-organisation tranche staged by U2.')
    const maximum = Number(pending.maximumOrganisations)
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5 || proposedIds.length > maximum || maximum !== Number(pilot.limits?.maxOrganisations)) push('U3_EXPANSION_LIMIT_EXCEEDED', 'Keep the proposed cohort within the unchanged one-to-five organisation limit.')
    if (!ids(pilot.cohortPreparation?.candidateOrganisationIds).includes(added)) push('U3_ADDED_ORGANISATION_NOT_GOVERNED', 'Keep the added organisation in the governed candidate set until certification completes.')
    const target = pending.releaseTarget || {}
    const continuedTarget = continuation?.releaseTarget || {}
    const activatedTarget = activation?.activationTarget || {}
    if (normalize(target.environment).toLowerCase() !== normalize(continuedTarget.environment).toLowerCase() || normalize(target.projectRef) !== normalize(continuedTarget.projectRef) || ids(target.organisationIds).join(',') !== currentIds.join(',') || normalize(target.environment).toLowerCase() !== normalize(activatedTarget.environment).toLowerCase() || normalize(target.projectRef) !== normalize(activatedTarget.projectRef) || normalize(pilot.environment).toLowerCase() !== normalize(target.environment).toLowerCase() || normalize(pilot.activation?.targetProjectRef) !== normalize(target.projectRef)) push('U3_RELEASE_TARGET_DRIFT', 'Restore the exact U2/T1/Q2/repository environment and project before certification.')
    if (typeof digest === 'function') {
      const { pendingDigest, ...payload } = pending
      if (!normalize(pendingDigest) || pendingDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('U3_PENDING_DIGEST_INVALID', 'Restore the exact digest-valid U2 change set; do not hand-edit it.')
    }
  }
  if (u2.mutatedData !== false || (cohort.status !== 'NOT_RUN' && cohort.mutatedData !== false) || (l1.status !== 'NOT_RUN' && l1.mutatedData !== false)) push('U3_NON_READ_ONLY_EVIDENCE', 'Use only read-only U2, cohort-readiness, and L1 certification evidence.')
  if (pending && cohort.status !== 'READY') push('U3_COHORT_READINESS_NOT_READY', 'Restore live readiness for every organisation in the proposed cohort.')
  const readyIds = ids(cohort.readyOrganisationIds)
  if (pending && proposedIds.some((id) => !readyIds.includes(id))) push('U3_PROPOSED_COHORT_NOT_READY', 'Resolve live readiness blockers for every proposed organisation before certification.')
  const addedAssessment = (cohort.assessments || []).find((row) => normalize(row.organisationId) === added)
  const minimumAgents = Number(pilot.cohortPreparation?.minimumActiveAgents || 1)
  if (pending && (!addedAssessment || addedAssessment.status !== 'READY' || (addedAssessment.blockers || []).length || Number(addedAssessment.activeAgentCount || 0) < minimumAgents || addedAssessment.templates?.otp !== true || addedAssessment.templates?.mandate !== true || addedAssessment.preferredTransferAttorney !== true)) push('U3_ADDED_ORGANISATION_EVIDENCE_INVALID', 'Restore the added agency, active-agent, OTP, mandate, and preferred-attorney evidence, then rerun U3.')
  if (pending && l1.status !== 'READY_FOR_L2') push('U3_L1_NOT_CERTIFIED', 'Restore every terminal OTP and mandate gate and rerun consolidated L1 certification.')
  if (pending && (l1.coverage?.otp !== true || l1.coverage?.mandate !== true)) push('U3_DOCUMENT_COVERAGE_INCOMPLETE', 'Retain successful controlled OTP and mandate lifecycle coverage before expansion.')
  if (pending) {
    const stagedAt = Date.parse(pending.stagedAt || '')
    const evidenceTimes = [u2.checkedAt, cohort.checkedAt, l1.checkedAt].map((value) => Date.parse(value || ''))
    const oldestAllowed = now - Number(maxEvidenceAgeMinutes) * 60_000
    if (!Number.isInteger(Number(maxEvidenceAgeMinutes)) || Number(maxEvidenceAgeMinutes) < 1 || Number(maxEvidenceAgeMinutes) > 60 || !Number.isFinite(stagedAt) || evidenceTimes.some((value) => !Number.isFinite(value) || value < stagedAt || value < oldestAllowed || value > now + 60_000)) push('U3_EVIDENCE_STALE_OR_MISORDERED', `Regenerate U2, cohort, and L1 evidence after staging and within the ${maxEvidenceAgeMinutes}-minute certification window.`)
  }
  return { ready: blockers.length === 0, blockers, currentOrganisationIds: currentIds, proposedOrganisationIds: proposedIds, addedOrganisationId: added || null, evidenceAgeLimitMinutes: Number(maxEvidenceAgeMinutes) }
}

export function buildLegalDocumentNextExpandedCohortCertification({ pending = {}, cohort = {}, l1 = {}, checkedAt = new Date().toISOString() } = {}) {
  const readinessEvidence = ids(pending.proposedOrganisationIds).map((organisationId) => {
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
    contract: NEXT_EXPANDED_COHORT_CERTIFICATION_CONTRACT,
    status: 'certified',
    certifiedAt: new Date(checkedAt).toISOString(),
    sourcePendingDigest: normalize(pending.pendingDigest),
    sourceApprovalDigest: normalize(pending.sourceApprovalDigest),
    sourceHandoffDigest: normalize(pending.sourceHandoffDigest),
    sourceContinuationDigest: normalize(pending.sourceContinuationDigest),
    sourceActivationDigest: normalize(pending.sourceActivationDigest),
    releaseTarget: pending.releaseTarget || null,
    currentOrganisationIds: ids(pending.currentOrganisationIds),
    addedOrganisationId: normalize(pending.addedOrganisationId),
    proposedOrganisationIds: ids(pending.proposedOrganisationIds),
    maximumOrganisations: Number(pending.maximumOrganisations),
    trancheSize: Number(pending.trancheSize),
    cohortReadinessEvidence: readinessEvidence,
    terminalCertification: { status: l1.status || 'UNAVAILABLE', coverage: { otp: l1.coverage?.otp === true, mandate: l1.coverage?.mandate === true } },
    requiredNextPhases: ['V1 accountable activation plan', 'guarded activation', 'fresh release authority'],
  })
}

export { NEXT_EXPANDED_COHORT_CERTIFICATION_CONTRACT as LEGAL_DOCUMENT_U3_CERTIFICATION_CONTRACT, MAX_EVIDENCE_AGE_MINUTES as LEGAL_DOCUMENT_U3_MAX_EVIDENCE_AGE_MINUTES }
