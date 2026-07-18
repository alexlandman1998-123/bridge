import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import { LEGAL_DOCUMENT_V1_ACTIVATION_PLAN_CONTRACT } from './legalDocumentNextExpansionActivationPlan.js'

const NEXT_EXPANDED_COHORT_ACTIVATION_CONTRACT = 'legal-document-next-expanded-cohort-activation-v2-v1'

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function buildLegalDocumentNextExpandedCohortActivation({ plan = {}, approval = {}, activatedBy, activationReference, activatedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: NEXT_EXPANDED_COHORT_ACTIVATION_CONTRACT,
    status: 'activated',
    activatedAt: new Date(activatedAt).toISOString(),
    activatedBy: normalize(activatedBy),
    activationReference: normalize(activationReference),
    sourcePlanDigest: normalize(plan.planDigest),
    sourceCertificationDigest: normalize(plan.sourceCertificationDigest),
    sourcePendingDigest: normalize(plan.sourcePendingDigest),
    sourceApprovalDigest: normalize(plan.sourceApprovalDigest || approval.approvalDigest),
    sourceHandoffDigest: normalize(plan.sourceHandoffDigest),
    sourceContinuationDigest: normalize(plan.sourceContinuationDigest),
    sourcePreviousActivationDigest: normalize(plan.sourceActivationDigest),
    activationTarget: {
      environment: normalize(plan.activationTarget?.environment).toLowerCase(),
      projectRef: normalize(plan.activationTarget?.projectRef),
      organisationIds: ids(plan.activationTarget?.organisationIds),
    },
    previousOrganisationIds: ids(plan.currentOrganisationIds),
    addedOrganisationId: normalize(plan.addedOrganisationId),
    activatedOrganisationIds: ids(plan.proposedOrganisationIds),
    requiredNextPhases: ['V3 post-activation verification', 'fresh release authority'],
  })
}

export function assessLegalDocumentNextExpandedCohortActivation({ activation = null, plan = null, approval = null, pending = null, continuation = null, previousActivation = null, pilot = {}, runtimeSecretsVerified = false, now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!activation || activation.status !== 'activated') push('V2_ACTIVATION_RECORD_MISSING', 'Run the guarded V2 activation after V1 reports READY_FOR_V2.')
  if (!plan || plan.status !== 'planned') push('V2_SOURCE_PLAN_MISSING', 'Restore the exact V1 activation plan used for expansion.')
  if (!approval || approval.status !== 'approved') push('V2_SOURCE_APPROVAL_MISSING', 'Restore the exact U1 accountable expansion approval.')
  if (!pending || pending.status !== 'staged') push('V2_SOURCE_PENDING_MISSING', 'Restore the exact U2 pending change set.')
  if (!continuation || continuation.status !== 'continued') push('V2_CONTINUATION_RECORD_MISSING', 'Restore the T1 continuation record for the previous cohort.')
  if (!previousActivation || previousActivation.status !== 'activated') push('V2_PREVIOUS_ACTIVATION_MISSING', 'Restore the Q2 activation record for the previous cohort.')
  if (activation) {
    if (activation.contract !== NEXT_EXPANDED_COHORT_ACTIVATION_CONTRACT) push('V2_ACTIVATION_CONTRACT_INVALID', 'Recreate the activation through the current V2 operator.')
    if (!normalize(activation.activatedBy) || !normalize(activation.activationReference)) push('V2_ACTIVATION_ACCOUNTABILITY_MISSING', 'Record the accountable activator and change reference.')
    if (plan?.contract !== LEGAL_DOCUMENT_V1_ACTIVATION_PLAN_CONTRACT || !normalize(plan?.planDigest) || activation.sourcePlanDigest !== plan.planDigest) push('V2_PLAN_BINDING_INVALID', 'Bind activation to the exact digest-valid V1 plan.')
    if (!normalize(plan?.sourceCertificationDigest) || activation.sourceCertificationDigest !== plan.sourceCertificationDigest) push('V2_CERTIFICATION_BINDING_INVALID', 'Activate only the U3 certificate embedded by V1.')
    if (!normalize(pending?.pendingDigest) || activation.sourcePendingDigest !== pending.pendingDigest || plan?.sourcePendingDigest !== pending.pendingDigest) push('V2_PENDING_BINDING_INVALID', 'Activate only the exact staged U2 change set.')
    if (!normalize(approval?.approvalDigest) || activation.sourceApprovalDigest !== approval.approvalDigest || pending?.sourceApprovalDigest !== approval.approvalDigest || plan?.sourceApprovalDigest !== approval.approvalDigest) push('V2_APPROVAL_BINDING_INVALID', 'Activate only the exact U1 approval carried through U2 and V1.')
    if (!normalize(pending?.sourceHandoffDigest) || activation.sourceHandoffDigest !== pending.sourceHandoffDigest || plan?.sourceHandoffDigest !== pending.sourceHandoffDigest) push('V2_HANDOFF_BINDING_INVALID', 'Carry the exact T4 handoff digest through activation.')
    if (!normalize(continuation?.recordDigest) || activation.sourceContinuationDigest !== continuation.recordDigest || pending?.sourceContinuationDigest !== continuation.recordDigest || plan?.sourceContinuationDigest !== continuation.recordDigest) push('V2_CONTINUATION_BINDING_INVALID', 'Activate only from the exact T1 continuation record.')
    if (!normalize(previousActivation?.activationDigest) || activation.sourcePreviousActivationDigest !== previousActivation.activationDigest || continuation?.sourceActivationDigest !== previousActivation.activationDigest || pending?.sourceActivationDigest !== previousActivation.activationDigest || plan?.sourceActivationDigest !== previousActivation.activationDigest) push('V2_PREVIOUS_ACTIVATION_BINDING_INVALID', 'Activate only from the exact Q2 activation bound by T1.')
    const previousIds = ids(activation.previousOrganisationIds)
    const activatedIds = ids(activation.activatedOrganisationIds)
    const configuredIds = ids(pilot.organisationIds)
    const approvedIds = ids(pilot.releasePreparation?.organisationIds)
    const repositoryActivatedIds = ids(pilot.activation?.activatedOrganisationIds)
    const added = normalize(activation.addedOrganisationId)
    if (!previousIds.length || !added || previousIds.includes(added) || activatedIds.length !== previousIds.length + 1 || !activatedIds.includes(added) || previousIds.some((id) => !activatedIds.includes(id))) push('V2_ACTIVATED_TRANCHE_INVALID', 'Activate exactly the certified single-organisation expansion while retaining the previous cohort.')
    if (previousIds.join(',') !== ids(plan?.currentOrganisationIds).join(',') || previousIds.join(',') !== ids(continuation?.releaseTarget?.organisationIds).join(',') || previousIds.join(',') !== ids(previousActivation?.activatedOrganisationIds).join(',') || activatedIds.join(',') !== ids(plan?.proposedOrganisationIds).join(',') || activatedIds.join(',') !== ids(plan?.activationTarget?.organisationIds).join(',') || activatedIds.join(',') !== ids(pending?.proposedOrganisationIds).join(',')) push('V2_PLANNED_TARGET_MISMATCH', 'Make the activated cohort identical to the exact V1 target and retain the previous cohort.')
    if (pilot.enabled !== true || pilot.activation?.status !== 'active') push('V2_PILOT_NOT_ACTIVE', 'Restore the active repository state or execute V2 again with rollback protection.')
    if (configuredIds.join(',') !== activatedIds.join(',') || approvedIds.join(',') !== activatedIds.join(',') || repositoryActivatedIds.join(',') !== activatedIds.join(',')) push('V2_REPOSITORY_COHORT_MISMATCH', 'Make effective, release-approved, and activated repository cohorts identical to V1.')
    const target = activation.activationTarget || {}
    if (normalize(pilot.environment).toLowerCase() !== normalize(target.environment).toLowerCase() || normalize(pilot.activation?.targetProjectRef) !== normalize(target.projectRef)) push('V2_ACTIVATION_TARGET_MISMATCH', 'Restore the certified environment and project target in repository activation state.')
    if (pilot.releasePreparation?.approvedBy !== approval?.approvedBy || pilot.releasePreparation?.approvedAt !== approval?.approvedAt || pilot.releasePreparation?.approvalReference !== approval?.approvalReference || pilot.releasePreparation?.nextExpansionSourceApprovalDigest !== approval?.approvalDigest) push('V2_RELEASE_APPROVAL_EVIDENCE_MISMATCH', 'Carry the original accountable U1 approval into expanded release preparation without substituting the V2 operator.')
    const activatedAt = Date.parse(activation.activatedAt || '')
    const plannedAt = Date.parse(plan?.plannedAt || '')
    const expiresAt = Date.parse(plan?.expiresAt || '')
    if (!Number.isFinite(activatedAt) || !Number.isFinite(plannedAt) || !Number.isFinite(expiresAt) || activatedAt < plannedAt || activatedAt >= expiresAt || activatedAt > now + 60_000) push('V2_ACTIVATION_TIME_INVALID', 'Activate after V1 planning and before its evidence window expires.')
    if (!runtimeSecretsVerified) push('V2_RUNTIME_SECRET_MISMATCH', 'Restore runtime pilot secrets to the exact activated organisation cohort.')
    if (typeof digest === 'function') {
      if (plan) {
        const { planDigest, ...planPayload } = plan
        if (!normalize(planDigest) || planDigest !== digest(canonicalLegalDocumentReleaseValue(planPayload))) push('V2_SOURCE_PLAN_DIGEST_INVALID', 'Restore the exact digest-valid V1 plan; do not hand-edit it.')
      }
      const { activationDigest, ...payload } = activation
      if (!normalize(activationDigest) || activationDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('V2_ACTIVATION_DIGEST_INVALID', 'Restore the committed activation record; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { NEXT_EXPANDED_COHORT_ACTIVATION_CONTRACT as LEGAL_DOCUMENT_V2_ACTIVATION_CONTRACT }
