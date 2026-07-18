import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const PENDING_EXPANSION_CONTRACT = 'legal-document-pending-expansion-p2-v1'

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

export function buildLegalDocumentPendingExpansionPayload({ approval = {}, stagedBy, stagingReference, stagedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: PENDING_EXPANSION_CONTRACT,
    status: 'staged',
    stagedAt: new Date(stagedAt).toISOString(),
    stagedBy: normalize(stagedBy),
    stagingReference: normalize(stagingReference),
    sourceApprovalDigest: normalize(approval.approvalDigest),
    releaseTarget: approval.releaseTarget || null,
    currentOrganisationIds: ids(approval.currentOrganisationIds),
    addedOrganisationId: normalize(approval.addedOrganisationId),
    proposedOrganisationIds: ids(approval.proposedOrganisationIds),
    maximumOrganisations: Number(approval.maximumOrganisations),
    requiredNextPhases: ['P3 expanded-cohort certification', 'fresh M1 release authority', 'fresh M2 receipt', 'fresh M3 claim'],
  })
}

export function assessLegalDocumentPendingExpansion({ pending = null, approval = null, configuredOrganisationIds = [], digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!pending || pending.status !== 'staged') push('P2_EXPANSION_NOT_STAGED', 'Run the guarded P2 staging operator after P1 reports READY_FOR_P2.')
  if (!approval || approval.status !== 'approved') push('P2_SOURCE_APPROVAL_MISSING', 'Restore the exact P1 approval bound to the pending expansion.')
  if (pending) {
    if (pending.contract !== PENDING_EXPANSION_CONTRACT) push('P2_STAGING_CONTRACT_INVALID', 'Recreate the pending change set using the current P2 contract.')
    if (!normalize(pending.stagedBy) || !normalize(pending.stagingReference)) push('P2_STAGING_ACCOUNTABILITY_MISSING', 'Record the accountable staging operator and change reference.')
    if (!approval?.approvalDigest || pending.sourceApprovalDigest !== approval.approvalDigest) push('P2_APPROVAL_BINDING_INVALID', 'Stage only the exact digest-valid P1 approval.')
    const currentIds = ids(pending.currentOrganisationIds)
    const proposedIds = ids(pending.proposedOrganisationIds)
    const configuredIds = ids(configuredOrganisationIds)
    const added = normalize(pending.addedOrganisationId)
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',') || currentIds.join(',') !== ids(approval?.currentOrganisationIds).join(',')) push('P2_CURRENT_ALLOWLIST_CHANGED', 'Restore the current approved allowlist; P2 must not expose the proposed organisation.')
    if (!added || currentIds.includes(added) || proposedIds.length !== currentIds.length + 1 || !proposedIds.includes(added) || currentIds.some((id) => !proposedIds.includes(id))) push('P2_PENDING_TRANCHE_INVALID', 'Stage exactly one added organisation while retaining the complete current cohort.')
    if (proposedIds.join(',') !== ids(approval?.proposedOrganisationIds).join(',') || added !== normalize(approval?.addedOrganisationId)) push('P2_APPROVED_COHORT_MISMATCH', 'Make the pending before/after cohorts identical to the P1 approval.')
    if (!Number.isInteger(Number(pending.maximumOrganisations)) || proposedIds.length > Number(pending.maximumOrganisations)) push('P2_EXPANSION_LIMIT_EXCEEDED', 'Keep the staged cohort within the approved safety limit.')
    const stagedAt = timestamp(pending.stagedAt)
    const approvedAt = timestamp(approval?.approvedAt)
    if (stagedAt === null || approvedAt === null || stagedAt < approvedAt) push('P2_STAGING_TIME_INVALID', 'Stage the change set after the P1 approval was recorded.')
    if (typeof digest === 'function') {
      const { pendingDigest, ...payload } = pending
      if (!normalize(pendingDigest) || pendingDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('P2_PENDING_DIGEST_INVALID', 'Restore the committed change set or restage from P1; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { PENDING_EXPANSION_CONTRACT as LEGAL_DOCUMENT_P2_PENDING_EXPANSION_CONTRACT }
