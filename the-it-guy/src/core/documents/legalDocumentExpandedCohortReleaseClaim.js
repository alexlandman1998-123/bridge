import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const EXPANDED_COHORT_RELEASE_CLAIM_CONTRACT = 'legal-document-expanded-cohort-release-claim-r3-v1'

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

export function buildLegalDocumentExpandedCohortReleaseClaim({ receipt = {}, claimedBy, executionReference, claimedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: EXPANDED_COHORT_RELEASE_CLAIM_CONTRACT,
    status: 'claimed',
    claimedAt: new Date(claimedAt).toISOString(),
    claimedBy: normalize(claimedBy),
    executionReference: normalize(executionReference),
    sourceReceiptDigest: normalize(receipt.receiptDigest),
    sourceAuthorityDigest: normalize(receipt.sourceAuthorityDigest),
    sourceActivationDigest: normalize(receipt.sourceActivationDigest),
    releaseTarget: target(receipt.releaseTarget),
    expiresAt: receipt.expiresAt || null,
    requiredNextPhases: ['S1 expanded-cohort rollout window'],
  })
}

export function assessLegalDocumentExpandedCohortReleaseClaim({ r2 = {}, receipt = null, claim = null, activation = null, now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (r2.status !== 'READY_FOR_R3' || r2.ready !== true) push('R3_R2_NOT_READY', 'Resolve R2 and issue a valid, unexpired expanded-cohort receipt before claiming it.')
  if (!receipt?.receiptDigest) push('R3_SOURCE_RECEIPT_MISSING', 'Restore or issue the source R2 receipt before creating an execution claim.')
  if (!claim || claim.status !== 'claimed') push('R3_RECEIPT_NOT_CLAIMED', 'Run the guarded R3 claim operator with an accountable operator and execution reference.')
  if (claim) {
    if (claim.contract !== EXPANDED_COHORT_RELEASE_CLAIM_CONTRACT) push('R3_CLAIM_CONTRACT_INVALID', 'Recreate the claim using the current R3 contract.')
    if (!normalize(claim.claimedBy) || !normalize(claim.executionReference)) push('R3_CLAIM_ACCOUNTABILITY_MISSING', 'Recreate the claim with an accountable operator and execution reference.')
    if (!receipt?.receiptDigest || claim.sourceReceiptDigest !== receipt.receiptDigest) push('R3_RECEIPT_BINDING_INVALID', 'Claim the current R2 receipt; claims cannot be moved between receipts.')
    if (claim.sourceAuthorityDigest !== receipt?.sourceAuthorityDigest) push('R3_AUTHORITY_BINDING_INVALID', 'Keep the claim bound to the R1 authority embedded in R2.')
    if (!normalize(activation?.activationDigest) || claim.sourceActivationDigest !== activation.activationDigest || receipt?.sourceActivationDigest !== activation.activationDigest) push('R3_ACTIVATION_BINDING_INVALID', 'Claim only the receipt for the exact active Q2 expansion.')
    if (JSON.stringify(target(claim.releaseTarget)) !== JSON.stringify(target(receipt?.releaseTarget)) || JSON.stringify(target(claim.releaseTarget)) !== JSON.stringify(target(activation?.activationTarget))) push('R3_CLAIM_TARGET_DRIFT', 'Recreate the claim against the exact environment, project, and cohort in R2 and Q2.')
    const claimedAt = Date.parse(claim.claimedAt || '')
    const issuedAt = Date.parse(receipt?.issuedAt || '')
    const expiresAt = Date.parse(claim.expiresAt || '')
    const receiptExpiry = Date.parse(receipt?.expiresAt || '')
    if (!Number.isFinite(claimedAt) || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || claimedAt < issuedAt || claimedAt > now + 60_000 || expiresAt !== receiptExpiry || claimedAt >= expiresAt || now >= expiresAt) push('R3_CLAIM_EXPIRED_OR_INVALID', 'Rebuild R1, issue a new R2 receipt, and claim it within the evidence window.')
    if (r2.mutatedData !== false) push('R3_NON_READ_ONLY_RECEIPT_EVIDENCE', 'Use only read-only R2 verification evidence.')
    if (typeof digest === 'function') {
      const { claimDigest, ...payload } = claim
      if (!normalize(claimDigest) || claimDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('R3_CLAIM_DIGEST_INVALID', 'Restore the committed claim or create a new claim from a new receipt; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers, expiresAt: claim?.expiresAt || null }
}

export { EXPANDED_COHORT_RELEASE_CLAIM_CONTRACT as LEGAL_DOCUMENT_R3_RELEASE_CLAIM_CONTRACT }
