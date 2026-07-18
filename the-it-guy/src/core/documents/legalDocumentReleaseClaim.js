import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const CLAIM_CONTRACT = 'legal-document-release-claim-m3-v1'

function normalize(value) {
  return String(value || '').trim()
}

function target(value = {}) {
  return canonicalLegalDocumentReleaseValue({
    environment: normalize(value.environment).toLowerCase(),
    projectRef: normalize(value.projectRef),
    organisationIds: [...new Set((value.organisationIds || []).map(normalize).filter(Boolean))].sort(),
  })
}

export function buildLegalDocumentReleaseClaimPayload({ receipt = {}, claimedBy, executionReference, claimedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: CLAIM_CONTRACT,
    status: 'claimed',
    claimedAt: new Date(claimedAt).toISOString(),
    claimedBy: normalize(claimedBy),
    executionReference: normalize(executionReference),
    receiptDigest: normalize(receipt.receiptDigest),
    releaseTarget: target(receipt.releaseTarget),
    expiresAt: receipt.expiresAt || null,
  })
}

export function assessLegalDocumentReleaseClaim({ m2 = {}, receipt = null, claim = null, now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (m2.status !== 'READY_FOR_M3' || m2.ready !== true) push('M3_M2_NOT_READY', 'Resolve M2 and issue a valid, unexpired release receipt before claiming it.')
  if (!receipt?.receiptDigest) push('M3_SOURCE_RECEIPT_MISSING', 'Restore or issue the source M2 receipt before creating an execution claim.')
  if (!claim || claim.status !== 'claimed') push('M3_RECEIPT_NOT_CLAIMED', 'Run the guarded M3 claim operator with an accountable release operator and execution reference.')
  if (claim) {
    if (claim.contract !== CLAIM_CONTRACT) push('M3_CLAIM_CONTRACT_INVALID', 'Recreate the claim using the current M3 contract.')
    if (!normalize(claim.claimedBy) || !normalize(claim.executionReference)) push('M3_CLAIM_ACCOUNTABILITY_MISSING', 'Recreate the claim with an accountable operator and execution reference.')
    if (!receipt?.receiptDigest || claim.receiptDigest !== receipt.receiptDigest) push('M3_RECEIPT_BINDING_INVALID', 'Claim the current M2 receipt; claims cannot be moved between receipts.')
    if (JSON.stringify(target(claim.releaseTarget)) !== JSON.stringify(target(receipt?.releaseTarget))) push('M3_CLAIM_TARGET_DRIFT', 'Recreate the claim against the exact environment, project, and cohort in the M2 receipt.')
    const claimedAt = Date.parse(claim.claimedAt || '')
    const expiresAt = Date.parse(claim.expiresAt || '')
    const receiptExpiry = Date.parse(receipt?.expiresAt || '')
    if (!Number.isFinite(claimedAt) || !Number.isFinite(expiresAt) || claimedAt > now + 60_000 || expiresAt !== receiptExpiry || claimedAt >= expiresAt || now >= expiresAt) push('M3_CLAIM_EXPIRED_OR_INVALID', 'Rebuild M1, issue a new M2 receipt, and claim it within the evidence window.')
    if (typeof digest === 'function') {
      const { claimDigest, ...payload } = claim
      if (!normalize(claimDigest) || claimDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('M3_CLAIM_DIGEST_INVALID', 'Restore the committed claim or create a new claim from a new receipt; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers, expiresAt: claim?.expiresAt || null }
}

export { CLAIM_CONTRACT as LEGAL_DOCUMENT_M3_CLAIM_CONTRACT }
