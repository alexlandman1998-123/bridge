import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const EXPANDED_COHORT_CERTIFICATION_CONTRACT = 'legal-document-expanded-cohort-certification-p3-v1'
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

export function assessLegalDocumentExpandedCohortCertification({ p2 = {}, pending = null, pilot = {}, cohort = {}, l1 = {}, now = Date.now(), maxEvidenceAgeMinutes = MAX_EVIDENCE_AGE_MINUTES } = {}) {
  const blockers = []
  const push = (code, solution, detail = null) => blockers.push({ code, detail, solution })
  const currentIds = ids(pending?.currentOrganisationIds)
  const proposedIds = ids(pending?.proposedOrganisationIds)
  const configuredIds = ids(pilot.organisationIds)
  const candidateIds = ids(pilot.cohortPreparation?.candidateOrganisationIds)
  const readyIds = ids(cohort.readyOrganisationIds)
  const added = normalize(pending?.addedOrganisationId)

  if (p2.status !== 'READY_FOR_P3' || p2.ready !== true) push('P3_P2_NOT_READY', 'Resolve every P2 blocker and restage the exact approved expansion before certification.')
  if (!pending || pending.status !== 'staged' || !normalize(pending.pendingDigest)) push('P3_PENDING_CHANGESET_MISSING', 'Restore the digest-valid P2 pending expansion change set.')
  if (pending) {
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',')) push('P3_CURRENT_COHORT_DRIFT', 'Restore the effective allowlist to the P2 current cohort; do not expose the candidate before authority is renewed.')
    if (!added || currentIds.includes(added) || proposedIds.length !== currentIds.length + 1 || !proposedIds.includes(added) || currentIds.some((id) => !proposedIds.includes(id))) push('P3_CERTIFICATION_TARGET_INVALID', 'Certify exactly the one-organisation tranche staged by P2.')
    if (!Number.isInteger(Number(pending.maximumOrganisations)) || proposedIds.length > Number(pending.maximumOrganisations)) push('P3_EXPANSION_LIMIT_EXCEEDED', 'Keep the expanded cohort within the approved maximum organisation limit.')
  }

  if (p2.mutatedData !== false || (cohort.status !== 'NOT_RUN' && cohort.mutatedData !== false) || (l1.status !== 'NOT_RUN' && l1.mutatedData !== false)) push('P3_NON_READ_ONLY_EVIDENCE', 'Use only read-only P2, cohort-readiness, and L1 certification evidence.')
  if (pending && cohort.status !== 'READY') push('P3_COHORT_READINESS_NOT_READY', 'Restore live A1 readiness for every organisation in the proposed expanded cohort.')
  if (pending && (!added || !candidateIds.includes(added))) push('P3_ADDED_ORGANISATION_NOT_CANDIDATE', 'Add the approved organisation to the governed candidate cohort before certification.')
  if (pending && proposedIds.some((id) => !candidateIds.includes(id))) push('P3_PROPOSED_COHORT_NOT_GOVERNED', 'Keep every proposed organisation inside the governed candidate cohort.')
  if (pending && proposedIds.some((id) => !readyIds.includes(id))) push('P3_PROPOSED_COHORT_NOT_READY', 'Resolve the live readiness blockers for every proposed organisation before certification.')
  const addedAssessment = (cohort.assessments || []).find((row) => normalize(row.organisationId) === added)
  if (pending && (!addedAssessment || addedAssessment.status !== 'READY' || (addedAssessment.blockers || []).length || Number(addedAssessment.activeAgentCount || 0) < 1 || addedAssessment.templates?.otp !== true || addedAssessment.templates?.mandate !== true || addedAssessment.preferredTransferAttorney !== true)) push('P3_ADDED_ORGANISATION_EVIDENCE_INVALID', 'Re-establish the added agency, active-agent, OTP, mandate, and preferred-attorney evidence, then rerun P3.')

  if (pending && l1.status !== 'READY_FOR_L2') push('P3_L1_NOT_CERTIFIED', 'Restore the complete OTP and mandate terminal gates and rerun consolidated L1 certification.')
  if (pending && (l1.coverage?.otp !== true || l1.coverage?.mandate !== true)) push('P3_DOCUMENT_COVERAGE_INCOMPLETE', 'Retain successful controlled OTP and mandate lifecycle coverage before expansion.')

  if (pending) {
    const stagedAt = timestamp(pending.stagedAt)
    const evidenceTimes = [p2.checkedAt, cohort.checkedAt, l1.checkedAt].map(timestamp)
    const oldestAllowed = now - maxEvidenceAgeMinutes * 60_000
    if (stagedAt === null || evidenceTimes.some((value) => value === null || value < stagedAt || value < oldestAllowed || value > now + 60_000)) push('P3_EVIDENCE_STALE_OR_MISORDERED', `Regenerate P2, cohort, and L1 evidence after staging and within the ${maxEvidenceAgeMinutes}-minute certification window.`)
  }

  return { ready: blockers.length === 0, blockers, currentOrganisationIds: currentIds, proposedOrganisationIds: proposedIds, addedOrganisationId: added || null, evidenceAgeLimitMinutes: maxEvidenceAgeMinutes }
}

export function buildLegalDocumentExpandedCohortCertification({ pending = {}, cohort = {}, l1 = {}, checkedAt = new Date().toISOString() } = {}) {
  const added = (cohort.assessments || []).find((row) => normalize(row.organisationId) === normalize(pending.addedOrganisationId))
  return canonicalLegalDocumentReleaseValue({
    contract: EXPANDED_COHORT_CERTIFICATION_CONTRACT,
    status: 'certified',
    certifiedAt: new Date(checkedAt).toISOString(),
    sourcePendingDigest: normalize(pending.pendingDigest),
    releaseTarget: pending.releaseTarget || null,
    currentOrganisationIds: ids(pending.currentOrganisationIds),
    addedOrganisationId: normalize(pending.addedOrganisationId),
    proposedOrganisationIds: ids(pending.proposedOrganisationIds),
    maximumOrganisations: Number(pending.maximumOrganisations),
    addedOrganisationEvidence: added ? {
      organisationId: normalize(added.organisationId),
      activeAgentCount: Number(added.activeAgentCount || 0),
      templates: { otp: added.templates?.otp === true, mandate: added.templates?.mandate === true },
      preferredTransferAttorney: added.preferredTransferAttorney === true,
    } : null,
    terminalCertification: { status: l1.status || 'UNAVAILABLE', coverage: { otp: l1.coverage?.otp === true, mandate: l1.coverage?.mandate === true } },
    requiredNextPhases: ['fresh expanded-cohort activation', 'fresh M1 release authority', 'fresh M2 receipt', 'fresh M3 claim'],
  })
}

export { EXPANDED_COHORT_CERTIFICATION_CONTRACT as LEGAL_DOCUMENT_P3_CERTIFICATION_CONTRACT, MAX_EVIDENCE_AGE_MINUTES as LEGAL_DOCUMENT_P3_MAX_EVIDENCE_AGE_MINUTES }
