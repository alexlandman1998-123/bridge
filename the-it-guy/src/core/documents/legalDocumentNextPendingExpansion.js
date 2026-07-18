import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import { assessLegalDocumentNextExpansionApproval, LEGAL_DOCUMENT_U1_APPROVAL_CONTRACT } from './legalDocumentNextExpansionApproval.js'

const NEXT_PENDING_EXPANSION_CONTRACT = 'legal-document-next-pending-expansion-u2-v1'

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function buildLegalDocumentNextPendingExpansion({ approval = {}, stagedBy, stagingReference, stagedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: NEXT_PENDING_EXPANSION_CONTRACT,
    status: 'staged',
    stagedAt: new Date(stagedAt).toISOString(),
    stagedBy: normalize(stagedBy),
    stagingReference: normalize(stagingReference),
    sourceApprovalDigest: normalize(approval.approvalDigest),
    sourceHandoffDigest: normalize(approval.sourceHandoffDigest),
    sourceContinuationDigest: normalize(approval.sourceContinuationDigest),
    sourceActivationDigest: normalize(approval.sourceActivationDigest),
    releaseTarget: approval.releaseTarget || null,
    currentOrganisationIds: ids(approval.currentOrganisationIds),
    addedOrganisationId: normalize(approval.addedOrganisationId),
    proposedOrganisationIds: ids(approval.proposedOrganisationIds),
    maximumOrganisations: Number(approval.maximumOrganisations),
    trancheSize: Number(approval.trancheSize),
    requiredNextPhases: ['U3 fresh expanded-cohort certification', 'guarded activation', 'fresh release authority'],
  })
}

export function assessLegalDocumentNextPendingExpansion({ pending = null, approval = null, continuation = null, activation = null, pilot = {}, digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!pending || pending.status !== 'staged') push('U2_EXPANSION_NOT_STAGED', 'Run the guarded U2 staging operator after U1 reports READY_FOR_U2.')
  if (!approval || approval.status !== 'approved') push('U2_SOURCE_APPROVAL_MISSING', 'Restore the exact U1 approval bound to the pending expansion.')
  if (!continuation || continuation.status !== 'continued') push('U2_CONTINUATION_RECORD_MISSING', 'Restore the exact T1 continuation record bound by U1.')
  if (!activation || activation.status !== 'activated') push('U2_ACTIVATION_RECORD_MISSING', 'Restore the exact Q2 activation record bound by U1.')
  if (pending) {
    if (pending.contract !== NEXT_PENDING_EXPANSION_CONTRACT) push('U2_STAGING_CONTRACT_INVALID', 'Recreate the pending change set using the current U2 contract.')
    if (!normalize(pending.stagedBy) || !normalize(pending.stagingReference)) push('U2_STAGING_ACCOUNTABILITY_MISSING', 'Record the accountable staging operator and change reference.')
    if (approval?.contract !== LEGAL_DOCUMENT_U1_APPROVAL_CONTRACT) push('U2_SOURCE_APPROVAL_CONTRACT_INVALID', 'Restore an approval produced by the current U1 contract.')
    if (approval && !assessLegalDocumentNextExpansionApproval({ approval, continuation, activation, pilot, digest }).ready) push('U2_SOURCE_APPROVAL_INVALID', 'Restore the complete digest-valid U1 approval and its T4 evidence before staging.')
    if (!approval?.approvalDigest || pending.sourceApprovalDigest !== approval.approvalDigest) push('U2_APPROVAL_BINDING_INVALID', 'Stage only the exact digest-valid U1 approval.')
    if (!approval?.sourceHandoffDigest || pending.sourceHandoffDigest !== approval.sourceHandoffDigest) push('U2_HANDOFF_BINDING_INVALID', 'Carry the exact T4 handoff digest through U1 into U2.')
    if (!continuation?.recordDigest || pending.sourceContinuationDigest !== continuation.recordDigest || approval?.sourceContinuationDigest !== continuation.recordDigest) push('U2_CONTINUATION_BINDING_INVALID', 'Stage only the U1 approval bound to the current T1 continuation.')
    if (!activation?.activationDigest || pending.sourceActivationDigest !== activation.activationDigest || approval?.sourceActivationDigest !== activation.activationDigest || continuation?.sourceActivationDigest !== activation.activationDigest) push('U2_ACTIVATION_BINDING_INVALID', 'Stage only the U1 approval bound to the current Q2 activation.')
    const currentIds = ids(pending.currentOrganisationIds)
    const proposedIds = ids(pending.proposedOrganisationIds)
    const configuredIds = ids(pilot.organisationIds)
    const releaseApprovedIds = ids(pilot.releasePreparation?.organisationIds)
    const runtimeActivatedIds = ids(pilot.activation?.activatedOrganisationIds)
    const continuedIds = ids(continuation?.releaseTarget?.organisationIds)
    const activatedIds = ids(activation?.activatedOrganisationIds)
    const added = normalize(pending.addedOrganisationId)
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',') || currentIds.join(',') !== releaseApprovedIds.join(',') || currentIds.join(',') !== runtimeActivatedIds.join(',') || currentIds.join(',') !== continuedIds.join(',') || currentIds.join(',') !== activatedIds.join(',') || currentIds.join(',') !== ids(approval?.currentOrganisationIds).join(',')) push('U2_CURRENT_ALLOWLIST_CHANGED', 'Restore the complete current cohort everywhere; U2 must not expose the proposed organisation.')
    if (pilot.enabled !== true || pilot.activation?.status !== 'active') push('U2_CURRENT_ROLLOUT_NOT_ACTIVE', 'Restore the healthy current rollout before staging another expansion.')
    if (!added || currentIds.includes(added) || proposedIds.length !== currentIds.length + 1 || !proposedIds.includes(added) || currentIds.some((id) => !proposedIds.includes(id)) || Number(pending.trancheSize) !== 1) push('U2_PENDING_TRANCHE_INVALID', 'Stage exactly one added organisation while retaining the complete current cohort.')
    if (proposedIds.join(',') !== ids(approval?.proposedOrganisationIds).join(',') || added !== normalize(approval?.addedOrganisationId) || Number(approval?.trancheSize) !== 1) push('U2_APPROVED_COHORT_MISMATCH', 'Make the pending before/after cohorts identical to the U1 approval.')
    const maximum = Number(pending.maximumOrganisations)
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5 || proposedIds.length > maximum || maximum !== Number(approval?.maximumOrganisations) || maximum !== Number(pilot.limits?.maxOrganisations)) push('U2_EXPANSION_LIMIT_EXCEEDED', 'Keep the staged cohort within the unchanged approved safety limit.')
    const target = pending.releaseTarget || {}
    const approvalTarget = approval?.releaseTarget || {}
    const continuedTarget = continuation?.releaseTarget || {}
    const activatedTarget = activation?.activationTarget || {}
    if (normalize(target.environment).toLowerCase() !== normalize(approvalTarget.environment).toLowerCase() || normalize(target.projectRef) !== normalize(approvalTarget.projectRef) || ids(target.organisationIds).join(',') !== currentIds.join(',') || normalize(target.environment).toLowerCase() !== normalize(continuedTarget.environment).toLowerCase() || normalize(target.projectRef) !== normalize(continuedTarget.projectRef) || normalize(target.environment).toLowerCase() !== normalize(activatedTarget.environment).toLowerCase() || normalize(target.projectRef) !== normalize(activatedTarget.projectRef) || normalize(pilot.environment).toLowerCase() !== normalize(target.environment).toLowerCase() || normalize(pilot.activation?.targetProjectRef) !== normalize(target.projectRef)) push('U2_RELEASE_TARGET_DRIFT', 'Restore the exact U1/T1/Q2/repository environment and project before staging.')
    const stagedAt = Date.parse(pending.stagedAt || '')
    const approvedAt = Date.parse(approval?.approvedAt || '')
    if (!Number.isFinite(stagedAt) || !Number.isFinite(approvedAt) || stagedAt < approvedAt) push('U2_STAGING_TIME_INVALID', 'Stage the change set after the U1 approval was recorded.')
    if (typeof digest === 'function') {
      if (approval) {
        const { approvalDigest, ...approvalPayload } = approval
        if (!normalize(approvalDigest) || approvalDigest !== digest(canonicalLegalDocumentReleaseValue(approvalPayload))) push('U2_SOURCE_APPROVAL_DIGEST_INVALID', 'Restore the exact digest-valid U1 approval; do not hand-edit it.')
      }
      const { pendingDigest, ...payload } = pending
      if (!normalize(pendingDigest) || pendingDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('U2_PENDING_DIGEST_INVALID', 'Restore the committed change set or restage from U1; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { NEXT_PENDING_EXPANSION_CONTRACT as LEGAL_DOCUMENT_U2_PENDING_EXPANSION_CONTRACT }
