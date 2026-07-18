import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import { LEGAL_DOCUMENT_U3_CERTIFICATION_CONTRACT } from './legalDocumentNextExpandedCohortCertification.js'

const NEXT_EXPANSION_ACTIVATION_PLAN_CONTRACT = 'legal-document-next-expansion-activation-plan-v1-v1'

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function buildLegalDocumentNextExpansionActivationPlan({ certification = {}, plannedBy, planningReference, plannedAt = new Date().toISOString(), evidenceAgeLimitMinutes = 15 } = {}) {
  const certifiedAt = Date.parse(certification.certifiedAt || '')
  return canonicalLegalDocumentReleaseValue({
    contract: NEXT_EXPANSION_ACTIVATION_PLAN_CONTRACT,
    status: 'planned',
    plannedAt: new Date(plannedAt).toISOString(),
    expiresAt: new Date(certifiedAt + Number(evidenceAgeLimitMinutes) * 60_000).toISOString(),
    plannedBy: normalize(plannedBy),
    planningReference: normalize(planningReference),
    sourceCertification: certification,
    sourceCertificationDigest: normalize(certification.certificationDigest),
    sourcePendingDigest: normalize(certification.sourcePendingDigest),
    sourceApprovalDigest: normalize(certification.sourceApprovalDigest),
    sourceHandoffDigest: normalize(certification.sourceHandoffDigest),
    sourceContinuationDigest: normalize(certification.sourceContinuationDigest),
    sourceActivationDigest: normalize(certification.sourceActivationDigest),
    activationTarget: {
      environment: normalize(certification.releaseTarget?.environment).toLowerCase(),
      projectRef: normalize(certification.releaseTarget?.projectRef),
      organisationIds: ids(certification.proposedOrganisationIds),
    },
    currentOrganisationIds: ids(certification.currentOrganisationIds),
    addedOrganisationId: normalize(certification.addedOrganisationId),
    proposedOrganisationIds: ids(certification.proposedOrganisationIds),
    maximumOrganisations: Number(certification.maximumOrganisations),
    trancheSize: Number(certification.trancheSize),
    requiredNextPhases: ['V2 guarded expanded-cohort activation', 'post-activation verification', 'fresh release authority'],
  })
}

export function assessLegalDocumentNextExpansionActivationPlan({ plan = null, currentU3 = {}, pending = null, continuation = null, activation = null, pilot = {}, now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!plan || plan.status !== 'planned') push('V1_ACTIVATION_PLAN_MISSING', 'Run the guarded V1 planner against a fresh READY_FOR_V1 U3 certificate.')
  if (currentU3.status !== 'READY_FOR_V1' || currentU3.ready !== true || !currentU3.certification) push('V1_U3_NOT_READY', 'Resolve U3 and rebuild the activation plan from fresh expanded-cohort certification.')
  if (!pending || pending.status !== 'staged') push('V1_PENDING_CHANGESET_MISSING', 'Restore the exact U2 change set certified by U3.')
  if (!continuation || continuation.status !== 'continued') push('V1_CONTINUATION_RECORD_MISSING', 'Restore the T1 continuation record bound by U3.')
  if (!activation || activation.status !== 'activated') push('V1_ACTIVATION_RECORD_MISSING', 'Restore the Q2 activation record bound by U3.')
  if (plan) {
    if (plan.contract !== NEXT_EXPANSION_ACTIVATION_PLAN_CONTRACT) push('V1_PLAN_CONTRACT_INVALID', 'Recreate the activation plan using the current V1 contract.')
    if (!normalize(plan.plannedBy) || !normalize(plan.planningReference)) push('V1_PLAN_ACCOUNTABILITY_MISSING', 'Record the accountable planner and activation/change reference.')
    const source = plan.sourceCertification || {}
    if (source.contract !== LEGAL_DOCUMENT_U3_CERTIFICATION_CONTRACT || source.status !== 'certified') push('V1_SOURCE_CERTIFICATION_INVALID', 'Plan only from a complete certificate produced by the current U3 contract.')
    if (!normalize(source.certificationDigest) || plan.sourceCertificationDigest !== source.certificationDigest) push('V1_CERTIFICATION_BINDING_INVALID', 'Bind the plan to the exact U3 certification digest.')
    if (!pending?.pendingDigest || plan.sourcePendingDigest !== pending.pendingDigest || source.sourcePendingDigest !== pending.pendingDigest) push('V1_PENDING_BINDING_INVALID', 'Plan activation only for the exact current U2 pending change set.')
    if (!pending?.sourceApprovalDigest || plan.sourceApprovalDigest !== pending.sourceApprovalDigest || source.sourceApprovalDigest !== pending.sourceApprovalDigest) push('V1_APPROVAL_BINDING_INVALID', 'Carry the exact U1 approval digest through U2 and U3 into V1.')
    if (!pending?.sourceHandoffDigest || plan.sourceHandoffDigest !== pending.sourceHandoffDigest || source.sourceHandoffDigest !== pending.sourceHandoffDigest) push('V1_HANDOFF_BINDING_INVALID', 'Carry the exact T4 handoff digest through the activation plan.')
    if (!continuation?.recordDigest || plan.sourceContinuationDigest !== continuation.recordDigest || pending?.sourceContinuationDigest !== continuation.recordDigest || source.sourceContinuationDigest !== continuation.recordDigest) push('V1_CONTINUATION_BINDING_INVALID', 'Plan only from the current T1 continuation evidence.')
    if (!activation?.activationDigest || plan.sourceActivationDigest !== activation.activationDigest || pending?.sourceActivationDigest !== activation.activationDigest || source.sourceActivationDigest !== activation.activationDigest || continuation?.sourceActivationDigest !== activation.activationDigest) push('V1_ACTIVATION_BINDING_INVALID', 'Plan only from the current Q2 activation bound by T1.')
    const currentIds = ids(plan.currentOrganisationIds)
    const proposedIds = ids(plan.proposedOrganisationIds)
    const configuredIds = ids(pilot.organisationIds)
    const added = normalize(plan.addedOrganisationId)
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',') || currentIds.join(',') !== ids(pilot.releasePreparation?.organisationIds).join(',') || currentIds.join(',') !== ids(pilot.activation?.activatedOrganisationIds).join(',') || currentIds.join(',') !== ids(continuation?.releaseTarget?.organisationIds).join(',') || currentIds.join(',') !== ids(activation?.activatedOrganisationIds).join(',')) push('V1_EFFECTIVE_ALLOWLIST_CHANGED', 'Restore the effective rollout to the current cohort; V1 must not activate the expansion.')
    if (pilot.enabled !== true || pilot.activation?.status !== 'active') push('V1_CURRENT_ROLLOUT_NOT_ACTIVE', 'Restore the healthy active current rollout before planning activation.')
    if (!added || currentIds.includes(added) || proposedIds.length !== currentIds.length + 1 || !proposedIds.includes(added) || currentIds.some((id) => !proposedIds.includes(id)) || Number(plan.trancheSize) !== 1) push('V1_ACTIVATION_TRANCHE_INVALID', 'Plan exactly the one-organisation tranche certified by U3.')
    const maximum = Number(plan.maximumOrganisations)
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5 || proposedIds.length > maximum || maximum !== Number(pilot.limits?.maxOrganisations)) push('V1_EXPANSION_LIMIT_INVALID', 'Keep the activation target within the unchanged one-to-five organisation limit.')
    if (proposedIds.join(',') !== ids(source.proposedOrganisationIds).join(',') || proposedIds.join(',') !== ids(pending?.proposedOrganisationIds).join(',') || currentIds.join(',') !== ids(source.currentOrganisationIds).join(',') || currentIds.join(',') !== ids(pending?.currentOrganisationIds).join(',') || added !== normalize(source.addedOrganisationId) || added !== normalize(pending?.addedOrganisationId)) push('V1_CERTIFIED_TARGET_MISMATCH', 'Make the V1 target identical to the U2/U3 current, added, and proposed cohorts.')
    const readinessIds = ids((source.cohortReadinessEvidence || []).map((row) => row.organisationId))
    if (readinessIds.join(',') !== proposedIds.join(',') || (source.cohortReadinessEvidence || []).some((row) => Number(row.activeAgentCount || 0) < Number(pilot.cohortPreparation?.minimumActiveAgents || 1) || row.templates?.otp !== true || row.templates?.mandate !== true || row.preferredTransferAttorney !== true) || source.terminalCertification?.status !== 'READY_FOR_L2' || source.terminalCertification?.coverage?.otp !== true || source.terminalCertification?.coverage?.mandate !== true) push('V1_CERTIFICATION_EVIDENCE_INCOMPLETE', 'Re-run U3 with complete proposed-cohort readiness and OTP/mandate terminal coverage.')
    const target = plan.activationTarget || {}
    const releaseTarget = source.releaseTarget || {}
    if (ids(target.organisationIds).join(',') !== proposedIds.join(',') || normalize(target.environment).toLowerCase() !== normalize(releaseTarget.environment).toLowerCase() || normalize(target.projectRef) !== normalize(releaseTarget.projectRef) || normalize(pilot.environment).toLowerCase() !== normalize(releaseTarget.environment).toLowerCase() || normalize(pilot.activation?.targetProjectRef) !== normalize(releaseTarget.projectRef)) push('V1_ACTIVATION_TARGET_INVALID', 'Use the certified environment, project, and proposed organisation cohort as the exact future activation target.')
    const currentCertificate = currentU3.certification || {}
    if (currentU3.ready === true && (currentCertificate.certificationDigest !== plan.sourceCertificationDigest || currentCertificate.sourcePendingDigest !== plan.sourcePendingDigest || ids(currentCertificate.proposedOrganisationIds).join(',') !== proposedIds.join(','))) push('V1_CURRENT_CERTIFICATION_DRIFT', 'Discard the stale plan and rebuild it from the current U3 certification target.')
    const plannedAt = Date.parse(plan.plannedAt || '')
    const certifiedAt = Date.parse(source.certifiedAt || '')
    const expiresAt = Date.parse(plan.expiresAt || '')
    if (!Number.isFinite(plannedAt) || !Number.isFinite(certifiedAt) || !Number.isFinite(expiresAt) || plannedAt < certifiedAt || expiresAt <= plannedAt || now >= expiresAt || plannedAt > now + 60_000) push('V1_PLAN_EXPIRED_OR_MISORDERED', 'Re-run U3 and create a new V1 plan inside its certification evidence window.')
    if (typeof digest === 'function') {
      const { certificationDigest, ...certificatePayload } = source
      if (!normalize(certificationDigest) || certificationDigest !== digest(canonicalLegalDocumentReleaseValue(certificatePayload))) push('V1_SOURCE_CERTIFICATION_DIGEST_INVALID', 'Restore the exact U3 certificate; do not hand-edit certification evidence.')
      const { planDigest, ...planPayload } = plan
      if (!normalize(planDigest) || planDigest !== digest(canonicalLegalDocumentReleaseValue(planPayload))) push('V1_PLAN_DIGEST_INVALID', 'Restore the committed plan or recreate it from fresh U3 evidence; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { NEXT_EXPANSION_ACTIVATION_PLAN_CONTRACT as LEGAL_DOCUMENT_V1_ACTIVATION_PLAN_CONTRACT }
