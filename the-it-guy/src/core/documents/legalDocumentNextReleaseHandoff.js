import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import { LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT } from './legalDocumentNextExpandedCohortActivation.js'
import { LEGAL_DOCUMENT_V3_VERIFICATION_CONTRACT } from './legalDocumentNextExpandedCohortActivationVerification.js'

const NEXT_RELEASE_HANDOFF_CONTRACT = 'legal-document-next-release-handoff-v4-v1'

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function buildLegalDocumentNextReleaseHandoff({ v3 = {}, activation = {}, handedOffAt = new Date().toISOString(), evidenceAgeLimitMinutes = 15 } = {}) {
  const verification = v3.verification || {}
  const verifiedAt = Date.parse(verification.verifiedAt || '')
  return canonicalLegalDocumentReleaseValue({
    contract: NEXT_RELEASE_HANDOFF_CONTRACT,
    status: 'handed_off',
    handedOffAt: new Date(handedOffAt).toISOString(),
    expiresAt: new Date(verifiedAt + Number(evidenceAgeLimitMinutes) * 60_000).toISOString(),
    sourceVerification: verification,
    sourceVerificationDigest: normalize(verification.verificationDigest),
    sourceActivationDigest: normalize(activation.activationDigest),
    sourcePlanDigest: normalize(activation.sourcePlanDigest),
    sourceCertificationDigest: normalize(activation.sourceCertificationDigest),
    sourcePendingDigest: normalize(activation.sourcePendingDigest),
    sourceApprovalDigest: normalize(activation.sourceApprovalDigest),
    sourceHandoffDigest: normalize(activation.sourceHandoffDigest),
    sourceContinuationDigest: normalize(activation.sourceContinuationDigest),
    sourcePreviousActivationDigest: normalize(activation.sourcePreviousActivationDigest),
    releaseTarget: activation.activationTarget || null,
    previousOrganisationIds: ids(activation.previousOrganisationIds),
    addedOrganisationId: normalize(activation.addedOrganisationId),
    organisationIds: ids(activation.activatedOrganisationIds),
    runtimeAssurance: verification.runtimeAssurance || null,
    cohortReadinessEvidence: verification.cohortReadinessEvidence || [],
    requiredNextPhases: ['W1 expanded-cohort release authority', 'fresh receipt', 'one-time claim'],
  })
}

export function assessLegalDocumentNextReleaseHandoff({ v3 = {}, handoff = null, activation = null, pilot = {}, now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, kind, solution) => blockers.push({ code, kind, solution })
  if (v3.status !== 'READY_FOR_V4' || v3.ready !== true || !v3.verification) push('V4_V3_NOT_READY', 'upstream', 'Resolve V3 and regenerate a current post-activation verification.')
  if (!activation || activation.status !== 'activated') push('V4_ACTIVATION_RECORD_MISSING', 'upstream', 'Restore the exact V2 activation receipt verified by V3.')
  if (!handoff || handoff.status !== 'handed_off') push('V4_HANDOFF_MISSING', 'upstream', 'Build the V4 integrity handoff from a current READY_FOR_V4 verification.')
  if (handoff) {
    if (handoff.contract !== NEXT_RELEASE_HANDOFF_CONTRACT) push('V4_HANDOFF_CONTRACT_INVALID', 'stop', 'Rebuild the handoff using the current V4 contract.')
    const verification = handoff.sourceVerification || {}
    if (verification.contract !== LEGAL_DOCUMENT_V3_VERIFICATION_CONTRACT || verification.status !== 'verified') push('V4_SOURCE_VERIFICATION_INVALID', 'stop', 'Hand off only a complete verification produced by the current V3 contract.')
    if (!normalize(verification.verificationDigest) || handoff.sourceVerificationDigest !== verification.verificationDigest || v3.verification?.verificationDigest !== verification.verificationDigest) push('V4_VERIFICATION_BINDING_INVALID', 'stop', 'Bind V4 to the exact current V3 verification digest.')
    if (activation?.contract !== LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT || !normalize(activation?.activationDigest) || handoff.sourceActivationDigest !== activation.activationDigest || verification.sourceActivationDigest !== activation.activationDigest) push('V4_ACTIVATION_BINDING_INVALID', 'stop', 'Bind V4 and V3 to the exact digest-valid V2 activation receipt.')
    const chain = ['Plan', 'Certification', 'Pending', 'Approval', 'Handoff', 'Continuation', 'PreviousActivation']
    for (const name of chain) {
      const field = `source${name}Digest`
      if (!normalize(activation?.[field]) || handoff[field] !== activation[field] || verification[field] !== activation[field]) push(`V4_${name.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '')}_BINDING_INVALID`, 'stop', `Restore the exact ${field} carried consistently through V2, V3, and V4.`)
    }
    const organisationIds = ids(handoff.organisationIds)
    if (!organisationIds.length || organisationIds.join(',') !== ids(activation?.activatedOrganisationIds).join(',') || organisationIds.join(',') !== ids(pilot.organisationIds).join(',') || organisationIds.join(',') !== ids(pilot.releasePreparation?.organisationIds).join(',') || organisationIds.join(',') !== ids(pilot.activation?.activatedOrganisationIds).join(',')) push('V4_ACTIVATED_COHORT_DRIFT', 'stop', 'Restore the exact V2/V3 effective, approved, and repository-activated cohort before handoff.')
    if (normalize(pilot.activation?.nextExpansionActivationDigest) !== normalize(activation?.activationDigest)) push('V4_REPOSITORY_RECEIPT_BINDING_INVALID', 'stop', 'Bind repository activation state to the exact V2 receipt before handoff.')
    const target = handoff.releaseTarget || {}
    if (normalize(target.environment).toLowerCase() !== normalize(activation?.activationTarget?.environment).toLowerCase() || normalize(target.projectRef) !== normalize(activation?.activationTarget?.projectRef) || ids(target.organisationIds).join(',') !== organisationIds.join(',') || normalize(pilot.environment).toLowerCase() !== normalize(target.environment).toLowerCase() || normalize(pilot.activation?.targetProjectRef) !== normalize(target.projectRef)) push('V4_RELEASE_TARGET_DRIFT', 'stop', 'Restore the exact V2/V3 environment, project, and activated cohort target.')
    if (handoff.runtimeAssurance?.a3Status !== 'HEALTHY' || handoff.runtimeAssurance?.secretDigestsVerified !== true || handoff.runtimeAssurance?.releaseStatus !== 'GO') push('V4_RUNTIME_ASSURANCE_INVALID', 'stop', 'Regenerate V3 after A3 reports healthy secret parity and a GO release gate.')
    const readiness = handoff.cohortReadinessEvidence || []
    if (ids(readiness.map((row) => row.organisationId)).join(',') !== organisationIds.join(',') || readiness.some((row) => Number(row.activeAgentCount || 0) < Number(pilot.cohortPreparation?.minimumActiveAgents || 1) || row.templates?.otp !== true || row.templates?.mandate !== true || row.preferredTransferAttorney !== true)) push('V4_COHORT_ASSURANCE_INVALID', 'stop', 'Regenerate V3 with complete live readiness evidence for every activated organisation.')
    if (normalize(handoff.addedOrganisationId) !== normalize(activation?.addedOrganisationId) || ids(handoff.previousOrganisationIds).join(',') !== ids(activation?.previousOrganisationIds).join(',')) push('V4_TRANCHE_BINDING_INVALID', 'stop', 'Restore the exact V2 previous cohort and added organisation binding.')
    const activatedAt = Date.parse(activation?.activatedAt || '')
    const verifiedAt = Date.parse(verification.verifiedAt || '')
    const handedOffAt = Date.parse(handoff.handedOffAt || '')
    const expiresAt = Date.parse(handoff.expiresAt || '')
    if (!Number.isFinite(activatedAt) || !Number.isFinite(verifiedAt) || !Number.isFinite(handedOffAt) || !Number.isFinite(expiresAt) || verifiedAt < activatedAt || handedOffAt < verifiedAt || handedOffAt > now + 60_000 || expiresAt <= handedOffAt || now >= expiresAt) push('V4_HANDOFF_EXPIRED_OR_MISORDERED', 'stop', 'Re-run V3 and rebuild V4 inside the fresh verification evidence window.')
    if (typeof digest === 'function') {
      const { verificationDigest, ...verificationPayload } = verification
      if (!normalize(verificationDigest) || verificationDigest !== digest(canonicalLegalDocumentReleaseValue(verificationPayload))) push('V4_SOURCE_VERIFICATION_DIGEST_INVALID', 'stop', 'Restore the exact digest-valid V3 verification; do not hand-edit it.')
      const { handoffDigest, ...handoffPayload } = handoff
      if (!normalize(handoffDigest) || handoffDigest !== digest(canonicalLegalDocumentReleaseValue(handoffPayload))) push('V4_HANDOFF_DIGEST_INVALID', 'stop', 'Restore the exact V4 handoff or rebuild it; do not hand-edit it.')
    }
  }
  const stop = blockers.some((row) => row.kind === 'stop')
  return { ready: blockers.length === 0, status: blockers.length === 0 ? 'READY_FOR_W1' : stop ? 'HANDOFF_BLOCKED' : 'NO_GO', blockers }
}

export { NEXT_RELEASE_HANDOFF_CONTRACT as LEGAL_DOCUMENT_V4_HANDOFF_CONTRACT }
