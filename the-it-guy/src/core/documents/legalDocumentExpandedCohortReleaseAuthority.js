import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const EXPANDED_COHORT_RELEASE_AUTHORITY_CONTRACT = 'legal-document-expanded-cohort-release-authority-r1-v1'
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

export function assessLegalDocumentExpandedCohortReleaseAuthority({ q3 = {}, m1 = {}, activation = null, now = Date.now(), maxEvidenceAgeMinutes = MAX_EVIDENCE_AGE_MINUTES } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  const canAssessM1 = q3.status === 'READY_FOR_M1' && q3.ready === true && Boolean(q3.verification) && Boolean(activation)
  const activatedIds = ids(activation?.activatedOrganisationIds)

  if (q3.status !== 'READY_FOR_M1' || q3.ready !== true || !q3.verification) push('R1_Q3_NOT_READY', 'Complete Q3 post-activation verification before requesting expanded-cohort release authority.')
  if (!activation || activation.status !== 'activated' || !normalize(activation.activationDigest)) push('R1_ACTIVATION_RECORD_MISSING', 'Restore the exact digest-valid Q2 activation record before R1.')
  if (canAssessM1) {
    if (m1.status !== 'READY_FOR_M2' || m1.authorized !== true) push('R1_M1_NOT_AUTHORIZED', 'Resolve every fresh M1 release hold for the expanded cohort.')
    if (m1.evidence?.expansionRequired !== true || m1.evidence?.q3Status !== 'READY_FOR_M1') push('R1_M1_EXPANSION_BYPASS', 'Run the expansion-aware M1 path with mandatory Q3 verification.')
    if (q3.verification.sourceActivationDigest !== activation.activationDigest || m1.evidence?.expansionActivationDigest !== activation.activationDigest) push('R1_ACTIVATION_BINDING_INVALID', 'Bind Q3 and M1 to the exact same Q2 activation receipt.')
    const target = m1.releaseTarget || {}
    const q3Target = q3.verification.activationTarget || {}
    if (normalize(target.environment).toLowerCase() !== normalize(q3Target.environment).toLowerCase() || normalize(target.projectRef) !== normalize(q3Target.projectRef) || ids(target.organisationIds).join(',') !== activatedIds.join(',') || ids(q3.verification.activatedOrganisationIds).join(',') !== activatedIds.join(',')) push('R1_RELEASE_TARGET_MISMATCH', 'Make M1 environment, project, and organisation IDs identical to the Q3 expanded target.')
    if (q3.mutatedData !== false || m1.mutatedData !== false) push('R1_NON_READ_ONLY_EVIDENCE', 'Use only read-only Q3 and M1 authority evidence.')
    const activatedAt = timestamp(activation.activatedAt)
    const q3At = timestamp(q3.checkedAt)
    const m1At = timestamp(m1.checkedAt)
    const oldestAllowed = now - maxEvidenceAgeMinutes * 60_000
    if (activatedAt === null || q3At === null || m1At === null || q3At < activatedAt || m1At < q3At || q3At < oldestAllowed || m1At < oldestAllowed || m1At > now + 60_000) push('R1_AUTHORITY_EVIDENCE_STALE_OR_MISORDERED', `Regenerate Q3 and M1 in order within the ${maxEvidenceAgeMinutes}-minute authority window.`)
  }
  return { ready: blockers.length === 0, blockers, releaseTarget: m1.releaseTarget || null, evidenceAgeLimitMinutes: maxEvidenceAgeMinutes }
}

export function buildLegalDocumentExpandedCohortReleaseAuthority({ q3 = {}, m1 = {}, m1Digest, authorizedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: EXPANDED_COHORT_RELEASE_AUTHORITY_CONTRACT,
    status: 'authorized',
    authorizedAt: new Date(authorizedAt).toISOString(),
    sourceActivationDigest: normalize(q3.verification?.sourceActivationDigest),
    sourceQ3VerificationDigest: normalize(q3.verification?.verificationDigest),
    sourceM1Digest: normalize(m1Digest),
    releaseTarget: {
      environment: normalize(m1.releaseTarget?.environment).toLowerCase(),
      projectRef: normalize(m1.releaseTarget?.projectRef),
      organisationIds: ids(m1.releaseTarget?.organisationIds),
    },
    evidenceWindowMinutes: Number(m1.evidenceAgeLimitMinutes || MAX_EVIDENCE_AGE_MINUTES),
    requiredNextPhases: ['R2 expanded-cohort release receipt', 'R3 expanded-cohort claim'],
  })
}

export { EXPANDED_COHORT_RELEASE_AUTHORITY_CONTRACT as LEGAL_DOCUMENT_R1_RELEASE_AUTHORITY_CONTRACT, MAX_EVIDENCE_AGE_MINUTES as LEGAL_DOCUMENT_R1_MAX_EVIDENCE_AGE_MINUTES }
