import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const CONTINUATION_CONTRACT = 'legal-document-cohort-continuation-o1-v1'

function normalize(value) {
  return String(value || '').trim()
}

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

function target(value = {}) {
  return canonicalLegalDocumentReleaseValue({ environment: normalize(value.environment).toLowerCase(), projectRef: normalize(value.projectRef), organisationIds: [...new Set((value.organisationIds || []).map(normalize).filter(Boolean))].sort() })
}

export function buildLegalDocumentCohortContinuationPayload({ n4 = {}, claim = {}, recordedBy, continuationReference, recordedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: CONTINUATION_CONTRACT,
    status: 'continued',
    decision: 'CONTINUE_CONTROLLED_COHORT',
    recordedAt: new Date(recordedAt).toISOString(),
    recordedBy: normalize(recordedBy),
    continuationReference: normalize(continuationReference),
    releaseTarget: target(n4.launchTarget || claim.releaseTarget),
    sourceClaimDigest: normalize(claim.claimDigest),
    sourceReceiptDigest: normalize(claim.receiptDigest),
    n4CheckedAt: n4.checkedAt || null,
    watchdog: n4.evidence?.watchdog || null,
    canaries: (n4.acceptedCanaries || []).map((row) => canonicalLegalDocumentReleaseValue({ packetType: normalize(row.packetType).toLowerCase(), packetId: normalize(row.packetId), versionId: normalize(row.versionId), finalArtifactSha256: normalize(row.finalArtifactSha256).toLowerCase(), deliveredAt: row.deliveredAt || null })).sort((a, b) => a.packetType.localeCompare(b.packetType)),
  })
}

export function assessLegalDocumentCohortContinuationRecord({ record = null, claim = null, digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!record || record.status !== 'continued') push('O1_CONTINUATION_NOT_RECORDED', 'Run the guarded O1 recorder during a READY_FOR_O1 claim window.')
  if (!claim || claim.status !== 'claimed') push('O1_SOURCE_CLAIM_MISSING', 'Restore the exact M3 claim bound to the continuation record.')
  if (record) {
    if (record.contract !== CONTINUATION_CONTRACT || record.decision !== 'CONTINUE_CONTROLLED_COHORT') push('O1_CONTINUATION_CONTRACT_INVALID', 'Recreate the continuation record through the current O1 contract.')
    if (!normalize(record.recordedBy) || !normalize(record.continuationReference)) push('O1_CONTINUATION_ACCOUNTABILITY_MISSING', 'Record the accountable continuation operator and change/incident reference.')
    if (!claim?.claimDigest || record.sourceClaimDigest !== claim.claimDigest || record.sourceReceiptDigest !== claim.receiptDigest) push('O1_AUTHORITY_BINDING_INVALID', 'Restore the record bound to the exact M3 claim and M2 receipt; never transplant continuation authority.')
    if (JSON.stringify(target(record.releaseTarget)) !== JSON.stringify(target(claim?.releaseTarget))) push('O1_CONTINUATION_TARGET_DRIFT', 'Make the continuation target exactly match the claimed environment, project, and cohort.')
    const types = new Set((record.canaries || []).map((row) => normalize(row.packetType).toLowerCase()))
    const packetIds = new Set((record.canaries || []).map((row) => normalize(row.packetId)).filter(Boolean))
    const versionIds = new Set((record.canaries || []).map((row) => normalize(row.versionId)).filter(Boolean))
    const canariesValid = record.canaries?.length === 2 && types.has('otp') && types.has('mandate') && packetIds.size === 2 && versionIds.size === 2 && record.canaries.every((row) => /^[a-f0-9]{64}$/i.test(normalize(row.finalArtifactSha256)) && timestamp(row.deliveredAt) !== null)
    if (!canariesValid) push('O1_CANARY_BINDING_INVALID', 'Record the exact distinct OTP and mandate packet/version/hash/delivery evidence accepted by N4.')
    const recordedAt = timestamp(record.recordedAt)
    const n4CheckedAt = timestamp(record.n4CheckedAt)
    const claimStart = timestamp(claim?.claimedAt)
    const claimExpiry = timestamp(claim?.expiresAt)
    if (recordedAt === null || n4CheckedAt === null || claimStart === null || claimExpiry === null || n4CheckedAt < claimStart || recordedAt < n4CheckedAt || recordedAt >= claimExpiry) push('O1_CONTINUATION_WINDOW_INVALID', 'Record continuation after the N4 decision and before the source claim expires.')
    if (record.watchdog?.status !== 'healthy' || !normalize(record.watchdog?.id) || Number(record.watchdog?.blockerCount || 0) !== 0) push('O1_WATCHDOG_BINDING_INVALID', 'Record the healthy no-blocker watchdog snapshot used by N4.')
    if (typeof digest === 'function') {
      const { recordDigest, ...payload } = record
      if (!normalize(recordDigest) || recordDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('O1_CONTINUATION_DIGEST_INVALID', 'Restore the committed record or create a new authorised release attempt; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { CONTINUATION_CONTRACT as LEGAL_DOCUMENT_O1_CONTINUATION_CONTRACT }
