import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import { LEGAL_DOCUMENT_T4_HANDOFF_CONTRACT } from './legalDocumentNextExpansionHandoff.js'

const NEXT_EXPANSION_APPROVAL_CONTRACT = 'legal-document-next-expansion-approval-u1-v1'

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function buildLegalDocumentNextExpansionApproval({ handoff = {}, approvedBy, approvalReference, approvedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: NEXT_EXPANSION_APPROVAL_CONTRACT,
    status: 'approved',
    approvedAt: new Date(approvedAt).toISOString(),
    approvedBy: normalize(approvedBy),
    approvalReference: normalize(approvalReference),
    sourceHandoff: handoff,
    sourceHandoffDigest: normalize(handoff.handoffDigest),
    sourceContinuationDigest: normalize(handoff.sourceContinuationDigest),
    sourceActivationDigest: normalize(handoff.sourceActivationDigest),
    releaseTarget: handoff.releaseTarget || null,
    currentOrganisationIds: ids(handoff.currentOrganisationIds),
    addedOrganisationId: normalize(handoff.addedOrganisationId),
    proposedOrganisationIds: ids(handoff.proposedOrganisationIds),
    maximumOrganisations: Number(handoff.maximumOrganisations),
    trancheSize: Number(handoff.trancheSize),
    candidateEvidence: handoff.candidateEvidence || null,
    requiredNextPhases: ['U2 pending expansion change set', 'fresh certification', 'guarded activation', 'fresh release authority'],
  })
}

export function assessLegalDocumentNextExpansionApproval({ approval = null, continuation = null, activation = null, pilot = {}, digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!approval || approval.status !== 'approved') push('U1_EXPANSION_NOT_APPROVED', 'Run the guarded U1 approver against a current READY_FOR_U1 T4 handoff.')
  if (!continuation || continuation.status !== 'continued') push('U1_CONTINUATION_RECORD_MISSING', 'Restore the exact T1 continuation record bound by T4.')
  if (!activation || activation.status !== 'activated') push('U1_ACTIVATION_RECORD_MISSING', 'Restore the exact Q2 activation record bound by T4.')
  if (approval) {
    if (approval.contract !== NEXT_EXPANSION_APPROVAL_CONTRACT) push('U1_APPROVAL_CONTRACT_INVALID', 'Recreate approval using the current U1 contract.')
    if (!normalize(approval.approvedBy) || !normalize(approval.approvalReference)) push('U1_APPROVAL_ACCOUNTABILITY_MISSING', 'Record the accountable approver and approval/change reference.')
    const handoff = approval.sourceHandoff || {}
    if (handoff.contract !== LEGAL_DOCUMENT_T4_HANDOFF_CONTRACT || handoff.status !== 'handed_off') push('U1_SOURCE_HANDOFF_INVALID', 'Approve only a complete handoff produced by the current T4 contract.')
    if (!normalize(handoff.handoffDigest) || approval.sourceHandoffDigest !== handoff.handoffDigest) push('U1_HANDOFF_BINDING_INVALID', 'Bind approval to the exact T4 handoff digest.')
    if (!continuation?.recordDigest || approval.sourceContinuationDigest !== continuation.recordDigest || handoff.sourceContinuationDigest !== continuation.recordDigest) push('U1_CONTINUATION_BINDING_INVALID', 'Approve only the handoff from the exact current T1 continuation record.')
    if (!activation?.activationDigest || approval.sourceActivationDigest !== activation.activationDigest || handoff.sourceActivationDigest !== activation.activationDigest || continuation?.sourceActivationDigest !== activation.activationDigest) push('U1_ACTIVATION_BINDING_INVALID', 'Approve only the handoff from the exact Q2 activation bound by T1.')
    const currentIds = ids(approval.currentOrganisationIds)
    const proposedIds = ids(approval.proposedOrganisationIds)
    const configuredIds = ids(pilot.organisationIds)
    const continuedIds = ids(continuation?.releaseTarget?.organisationIds)
    const activatedIds = ids(activation?.activatedOrganisationIds)
    const repositoryActivatedIds = ids(pilot.activation?.activatedOrganisationIds)
    const releaseApprovedIds = ids(pilot.releasePreparation?.organisationIds)
    const added = normalize(approval.addedOrganisationId)
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',') || currentIds.join(',') !== continuedIds.join(',') || currentIds.join(',') !== activatedIds.join(',') || currentIds.join(',') !== repositoryActivatedIds.join(',') || currentIds.join(',') !== releaseApprovedIds.join(',')) push('U1_CURRENT_COHORT_DRIFT', 'Restore the configured, release-approved, runtime-activated, T1, and Q2 current cohort match.')
    if (pilot.enabled !== true || pilot.activation?.status !== 'active') push('U1_CURRENT_ROLLOUT_NOT_ACTIVE', 'Restore the healthy current expanded rollout before approving another organisation.')
    const target = approval.releaseTarget || {}
    const continuedTarget = continuation?.releaseTarget || {}
    const activatedTarget = activation?.activationTarget || {}
    if (normalize(target.environment).toLowerCase() !== normalize(continuedTarget.environment).toLowerCase() || normalize(target.projectRef) !== normalize(continuedTarget.projectRef) || ids(target.organisationIds).join(',') !== currentIds.join(',') || normalize(activatedTarget.environment).toLowerCase() !== normalize(continuedTarget.environment).toLowerCase() || normalize(activatedTarget.projectRef) !== normalize(continuedTarget.projectRef) || normalize(pilot.environment).toLowerCase() !== normalize(target.environment).toLowerCase() || normalize(pilot.activation?.targetProjectRef) !== normalize(target.projectRef)) push('U1_RELEASE_TARGET_DRIFT', 'Restore the exact repository/T1/Q2 environment, project, and current cohort before approval.')
    if (!added || currentIds.includes(added) || proposedIds.length !== currentIds.length + 1 || !proposedIds.includes(added) || currentIds.some((id) => !proposedIds.includes(id)) || Number(approval.trancheSize) !== 1) push('U1_TRANCHE_INVALID', 'Approve exactly one new organisation while retaining every current organisation.')
    const maximum = Number(approval.maximumOrganisations)
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5 || proposedIds.length > maximum || maximum !== Number(pilot.limits?.maxOrganisations)) push('U1_EXPANSION_LIMIT_INVALID', 'Keep the approved cohort within the unchanged one-to-five organisation limit.')
    const candidate = approval.candidateEvidence
    if (!candidate || normalize(candidate.organisationId) !== added || candidate.status !== 'READY' || (candidate.blockers || []).length || Number(candidate.activeAgentCount || 0) < Number(pilot.cohortPreparation?.minimumActiveAgents || 1)) push('U1_CANDIDATE_EVIDENCE_INVALID', 'Approve only the exact blocker-free candidate assessed by T3 and handed off by T4.')
    const approvedAt = Date.parse(approval.approvedAt || '')
    const handedOffAt = Date.parse(handoff.handedOffAt || '')
    const expiresAt = Date.parse(handoff.expiresAt || '')
    if (!Number.isFinite(approvedAt) || !Number.isFinite(handedOffAt) || !Number.isFinite(expiresAt) || approvedAt < handedOffAt || approvedAt >= expiresAt) push('U1_APPROVAL_TIME_INVALID', 'Approve after T4 handoff and before its evidence window expires.')
    if (ids(handoff.currentOrganisationIds).join(',') !== currentIds.join(',') || ids(handoff.proposedOrganisationIds).join(',') !== proposedIds.join(',') || normalize(handoff.addedOrganisationId) !== added || Number(handoff.maximumOrganisations) !== maximum || Number(handoff.trancheSize) !== 1) push('U1_HANDOFF_TARGET_MISMATCH', 'Make the approval target identical to the T4 current, added, proposed, and safety-limit evidence.')
    if (typeof digest === 'function') {
      const { handoffDigest, ...handoffPayload } = handoff
      if (!normalize(handoffDigest) || handoffDigest !== digest(canonicalLegalDocumentReleaseValue(handoffPayload))) push('U1_SOURCE_HANDOFF_DIGEST_INVALID', 'Restore the exact digest-valid T4 handoff; do not hand-edit it.')
      const { approvalDigest, ...approvalPayload } = approval
      if (!normalize(approvalDigest) || approvalDigest !== digest(canonicalLegalDocumentReleaseValue(approvalPayload))) push('U1_APPROVAL_DIGEST_INVALID', 'Restore the committed approval or create a fresh T4 handoff; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { NEXT_EXPANSION_APPROVAL_CONTRACT as LEGAL_DOCUMENT_U1_APPROVAL_CONTRACT }
