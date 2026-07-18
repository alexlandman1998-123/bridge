import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const EXPANSION_APPROVAL_CONTRACT = 'legal-document-expansion-approval-p1-v1'

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

export function buildLegalDocumentExpansionApprovalPayload({ o3 = {}, continuation = {}, approvedBy, approvalReference, approvedAt = new Date().toISOString() } = {}) {
  const proposal = o3.proposal || {}
  const candidate = (o3.candidateAssessments || []).find((row) => row.organisationId === proposal.addedOrganisationId) || null
  return canonicalLegalDocumentReleaseValue({
    contract: EXPANSION_APPROVAL_CONTRACT,
    status: 'approved',
    approvedAt: new Date(approvedAt).toISOString(),
    approvedBy: normalize(approvedBy),
    approvalReference: normalize(approvalReference),
    releaseTarget: continuation.releaseTarget || null,
    sourceContinuationDigest: normalize(continuation.recordDigest),
    sourceO3CheckedAt: o3.checkedAt || null,
    currentOrganisationIds: ids(proposal.currentOrganisationIds),
    addedOrganisationId: normalize(proposal.addedOrganisationId),
    proposedOrganisationIds: ids(proposal.proposedOrganisationIds),
    maximumOrganisations: Number(proposal.maximumOrganisations),
    trancheSize: Number(proposal.trancheSize),
    candidateEvidence: candidate ? { organisationId: candidate.organisationId, organisationName: candidate.organisationName || null, activeAgentCount: Number(candidate.activeAgentCount || 0), status: candidate.status, blockers: candidate.blockers || [] } : null,
    requiredNextPhases: proposal.requiredNextPhases || [],
  })
}

export function assessLegalDocumentExpansionApproval({ approval = null, continuation = null, configuredOrganisationIds = [], digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!approval || approval.status !== 'approved') push('P1_EXPANSION_NOT_APPROVED', 'Run the guarded P1 approver against a current READY_FOR_P1 proposal.')
  if (!continuation || continuation.status !== 'continued') push('P1_CONTINUATION_RECORD_MISSING', 'Restore the O1 continuation record that established the current cohort.')
  if (approval) {
    if (approval.contract !== EXPANSION_APPROVAL_CONTRACT) push('P1_APPROVAL_CONTRACT_INVALID', 'Recreate approval using the current P1 contract.')
    if (!normalize(approval.approvedBy) || !normalize(approval.approvalReference)) push('P1_APPROVAL_ACCOUNTABILITY_MISSING', 'Record the accountable approver and approval/change reference.')
    if (!continuation?.recordDigest || approval.sourceContinuationDigest !== continuation.recordDigest) push('P1_CONTINUATION_BINDING_INVALID', 'Approve only the expansion from the exact current O1 continuation record.')
    const currentIds = ids(approval.currentOrganisationIds)
    const proposedIds = ids(approval.proposedOrganisationIds)
    const configuredIds = ids(configuredOrganisationIds)
    const added = normalize(approval.addedOrganisationId)
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',') || currentIds.join(',') !== ids(continuation?.releaseTarget?.organisationIds).join(',')) push('P1_CURRENT_COHORT_DRIFT', 'Restore the configured/O1/current approval cohort match before expansion.')
    if (!added || currentIds.includes(added) || proposedIds.length !== currentIds.length + 1 || !proposedIds.includes(added) || currentIds.some((id) => !proposedIds.includes(id)) || Number(approval.trancheSize) !== 1) push('P1_TRANCHE_INVALID', 'Approve exactly one new organisation while retaining every current organisation.')
    if (!Number.isInteger(Number(approval.maximumOrganisations)) || proposedIds.length > Number(approval.maximumOrganisations)) push('P1_EXPANSION_LIMIT_EXCEEDED', 'Keep the proposed cohort inside the approved maximum organisation limit.')
    if (approval.candidateEvidence?.organisationId !== added || approval.candidateEvidence?.status !== 'READY' || (approval.candidateEvidence?.blockers || []).length || Number(approval.candidateEvidence?.activeAgentCount || 0) < 1) push('P1_CANDIDATE_EVIDENCE_INVALID', 'Re-run O3 and approve only a currently ready candidate with an active agent and no readiness blockers.')
    const approvedAt = timestamp(approval.approvedAt)
    const proposedAt = timestamp(approval.sourceO3CheckedAt)
    if (approvedAt === null || proposedAt === null || approvedAt < proposedAt) push('P1_APPROVAL_TIME_INVALID', 'Record approval after the source O3 proposal was generated.')
    if (typeof digest === 'function') {
      const { approvalDigest, ...payload } = approval
      if (!normalize(approvalDigest) || approvalDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('P1_APPROVAL_DIGEST_INVALID', 'Restore the committed approval or create a fresh O3 proposal; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { EXPANSION_APPROVAL_CONTRACT as LEGAL_DOCUMENT_P1_EXPANSION_APPROVAL_CONTRACT }
