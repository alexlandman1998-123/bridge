import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const EXPANDED_COHORT_ACTIVATION_CONTRACT = 'legal-document-expanded-cohort-activation-q2-v1'

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

export function buildLegalDocumentExpandedCohortActivation({ plan = {}, approval = {}, activatedBy, activationReference, activatedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: EXPANDED_COHORT_ACTIVATION_CONTRACT,
    status: 'activated',
    activatedAt: new Date(activatedAt).toISOString(),
    activatedBy: normalize(activatedBy),
    activationReference: normalize(activationReference),
    sourcePlanDigest: normalize(plan.planDigest),
    sourceCertificationDigest: normalize(plan.sourceCertificationDigest),
    sourcePendingDigest: normalize(plan.sourcePendingDigest),
    sourceApprovalDigest: normalize(approval.approvalDigest),
    activationTarget: {
      environment: normalize(plan.activationTarget?.environment).toLowerCase(),
      projectRef: normalize(plan.activationTarget?.projectRef),
      organisationIds: ids(plan.activationTarget?.organisationIds),
    },
    previousOrganisationIds: ids(plan.currentOrganisationIds),
    addedOrganisationId: normalize(plan.addedOrganisationId),
    activatedOrganisationIds: ids(plan.proposedOrganisationIds),
    requiredNextPhases: ['Q3 activation verification', 'fresh M1 release authority', 'fresh M2 receipt', 'fresh M3 claim'],
  })
}

export function assessLegalDocumentExpandedCohortActivation({ activation = null, plan = null, approval = null, pending = null, pilot = {}, runtimeSecretsVerified = false, now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!activation || activation.status !== 'activated') push('Q2_ACTIVATION_RECORD_MISSING', 'Run the guarded Q2 activation after Q1 reports READY_FOR_Q2.')
  if (!plan || plan.status !== 'planned') push('Q2_SOURCE_PLAN_MISSING', 'Restore the exact Q1 activation plan used for expansion.')
  if (!approval || approval.status !== 'approved') push('Q2_SOURCE_APPROVAL_MISSING', 'Restore the exact P1 accountable expansion approval.')
  if (activation) {
    if (activation.contract !== EXPANDED_COHORT_ACTIVATION_CONTRACT) push('Q2_ACTIVATION_CONTRACT_INVALID', 'Recreate the activation through the current Q2 operator.')
    if (!normalize(activation.activatedBy) || !normalize(activation.activationReference)) push('Q2_ACTIVATION_ACCOUNTABILITY_MISSING', 'Record the accountable activator and change reference.')
    if (!normalize(plan?.planDigest) || activation.sourcePlanDigest !== plan.planDigest) push('Q2_PLAN_BINDING_INVALID', 'Bind activation to the exact digest-valid Q1 plan.')
    if (!normalize(approval?.approvalDigest) || activation.sourceApprovalDigest !== approval.approvalDigest || pending?.sourceApprovalDigest !== approval.approvalDigest) push('Q2_APPROVAL_BINDING_INVALID', 'Activate only the exact P1 approval carried through P2 and Q1.')
    if (!normalize(pending?.pendingDigest) || activation.sourcePendingDigest !== pending.pendingDigest || plan?.sourcePendingDigest !== pending.pendingDigest) push('Q2_PENDING_BINDING_INVALID', 'Activate only the exact staged P2 change set.')
    const previousIds = ids(activation.previousOrganisationIds)
    const activatedIds = ids(activation.activatedOrganisationIds)
    const configuredIds = ids(pilot.organisationIds)
    const approvedIds = ids(pilot.releasePreparation?.organisationIds)
    const repositoryActivatedIds = ids(pilot.activation?.activatedOrganisationIds)
    const added = normalize(activation.addedOrganisationId)
    if (!previousIds.length || !added || previousIds.includes(added) || activatedIds.length !== previousIds.length + 1 || !activatedIds.includes(added) || previousIds.some((id) => !activatedIds.includes(id))) push('Q2_ACTIVATED_TRANCHE_INVALID', 'Activate exactly the certified single-organisation expansion while retaining the current cohort.')
    if (previousIds.join(',') !== ids(plan?.currentOrganisationIds).join(',') || activatedIds.join(',') !== ids(plan?.proposedOrganisationIds).join(',') || activatedIds.join(',') !== ids(plan?.activationTarget?.organisationIds).join(',')) push('Q2_PLANNED_TARGET_MISMATCH', 'Make the activated cohort identical to the exact Q1 activation target.')
    if (pilot.enabled !== true || pilot.activation?.status !== 'active') push('Q2_PILOT_NOT_ACTIVE', 'Restore the active repository state or execute Q2 again with rollback protection.')
    if (configuredIds.join(',') !== activatedIds.join(',') || approvedIds.join(',') !== activatedIds.join(',') || repositoryActivatedIds.join(',') !== activatedIds.join(',')) push('Q2_REPOSITORY_COHORT_MISMATCH', 'Make effective, release-approved, and activated repository cohorts identical to Q1.')
    const target = activation.activationTarget || {}
    if (normalize(pilot.environment).toLowerCase() !== normalize(target.environment).toLowerCase() || normalize(pilot.activation?.targetProjectRef) !== normalize(target.projectRef)) push('Q2_ACTIVATION_TARGET_MISMATCH', 'Restore the certified environment and project target in the activation state.')
    if (pilot.releasePreparation?.approvedBy !== approval?.approvedBy || pilot.releasePreparation?.approvedAt !== approval?.approvedAt || pilot.releasePreparation?.approvalReference !== approval?.approvalReference) push('Q2_RELEASE_APPROVAL_EVIDENCE_MISMATCH', 'Carry the original accountable P1 approval into expanded release preparation without substituting operator identity.')
    const activatedAt = timestamp(activation.activatedAt)
    const plannedAt = timestamp(plan?.plannedAt)
    const expiresAt = timestamp(plan?.expiresAt)
    if (activatedAt === null || plannedAt === null || expiresAt === null || activatedAt < plannedAt || activatedAt >= expiresAt || activatedAt > now + 60_000) push('Q2_ACTIVATION_TIME_INVALID', 'Activate after Q1 planning and before its evidence window expires.')
    if (!runtimeSecretsVerified) push('Q2_RUNTIME_SECRET_MISMATCH', 'Restore runtime pilot secrets to the exact activated organisation cohort.')
    if (typeof digest === 'function') {
      const { activationDigest, ...payload } = activation
      if (!normalize(activationDigest) || activationDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('Q2_ACTIVATION_DIGEST_INVALID', 'Restore the committed activation record; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { EXPANDED_COHORT_ACTIVATION_CONTRACT as LEGAL_DOCUMENT_Q2_ACTIVATION_CONTRACT }
