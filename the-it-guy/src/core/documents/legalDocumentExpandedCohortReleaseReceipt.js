import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const EXPANDED_COHORT_RELEASE_RECEIPT_CONTRACT = 'legal-document-expanded-cohort-release-receipt-r2-v1'

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

export function buildLegalDocumentExpandedCohortReleaseReceipt({ authority = {}, issuedBy, releaseReference, issuedAt = new Date().toISOString() } = {}) {
  const authorityAt = timestamp(authority.authorizedAt)
  const evidenceWindowMinutes = Number(authority.evidenceWindowMinutes || 15)
  return canonicalLegalDocumentReleaseValue({
    contract: EXPANDED_COHORT_RELEASE_RECEIPT_CONTRACT,
    status: 'issued',
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date((authorityAt ?? Date.parse(issuedAt)) + evidenceWindowMinutes * 60_000).toISOString(),
    issuedBy: normalize(issuedBy),
    releaseReference: normalize(releaseReference),
    sourceAuthority: authority,
    sourceAuthorityDigest: normalize(authority.authorityDigest),
    sourceActivationDigest: normalize(authority.sourceActivationDigest),
    sourceQ3VerificationDigest: normalize(authority.sourceQ3VerificationDigest),
    sourceM1Digest: normalize(authority.sourceM1Digest),
    releaseTarget: {
      environment: normalize(authority.releaseTarget?.environment).toLowerCase(),
      projectRef: normalize(authority.releaseTarget?.projectRef),
      organisationIds: ids(authority.releaseTarget?.organisationIds),
    },
    requiredNextPhases: ['R3 expanded-cohort receipt claim'],
  })
}

export function assessLegalDocumentExpandedCohortReleaseReceipt({ receipt = null, currentR1 = {}, activation = null, now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!receipt || receipt.status !== 'issued') push('R2_RECEIPT_NOT_ISSUED', 'Run the guarded R2 issuer after R1 reports READY_FOR_R2.')
  if (currentR1.status !== 'READY_FOR_R2' || currentR1.authorized !== true || !currentR1.authority) push('R2_R1_NOT_AUTHORIZED', 'Resolve R1 and regenerate fresh expanded-cohort authority before receipt verification.')
  if (receipt) {
    if (receipt.contract !== EXPANDED_COHORT_RELEASE_RECEIPT_CONTRACT) push('R2_RECEIPT_CONTRACT_INVALID', 'Reissue the receipt using the current R2 contract.')
    if (!normalize(receipt.issuedBy) || !normalize(receipt.releaseReference)) push('R2_RECEIPT_ACCOUNTABILITY_MISSING', 'Record the accountable issuer and release/change reference.')
    const source = receipt.sourceAuthority || {}
    if (source.status !== 'authorized' || !normalize(source.authorityDigest) || receipt.sourceAuthorityDigest !== source.authorityDigest) push('R2_AUTHORITY_BINDING_INVALID', 'Bind the receipt to the exact complete R1 authority record.')
    if (typeof digest === 'function' && source.authorityDigest) {
      const { authorityDigest, ...authorityPayload } = source
      if (source.authorityDigest !== digest(canonicalLegalDocumentReleaseValue(authorityPayload))) push('R2_SOURCE_AUTHORITY_DIGEST_INVALID', 'Restore the exact R1 authority; do not hand-edit embedded evidence.')
    }
    if (!normalize(activation?.activationDigest) || receipt.sourceActivationDigest !== activation.activationDigest || source.sourceActivationDigest !== activation.activationDigest) push('R2_ACTIVATION_BINDING_INVALID', 'Issue only for the exact currently active Q2 expansion receipt.')
    const receiptTarget = receipt.releaseTarget || {}
    const sourceTarget = source.releaseTarget || {}
    const currentTarget = currentR1.authority?.releaseTarget || {}
    const activatedIds = ids(activation?.activatedOrganisationIds)
    if (normalize(receiptTarget.environment).toLowerCase() !== normalize(sourceTarget.environment).toLowerCase() || normalize(receiptTarget.projectRef) !== normalize(sourceTarget.projectRef) || ids(receiptTarget.organisationIds).join(',') !== ids(sourceTarget.organisationIds).join(',')) push('R2_SOURCE_TARGET_MISMATCH', 'Make the receipt target identical to its embedded R1 authority.')
    if (currentR1.authorized === true && (normalize(receiptTarget.environment).toLowerCase() !== normalize(currentTarget.environment).toLowerCase() || normalize(receiptTarget.projectRef) !== normalize(currentTarget.projectRef) || ids(receiptTarget.organisationIds).join(',') !== ids(currentTarget.organisationIds).join(',') || ids(receiptTarget.organisationIds).join(',') !== activatedIds.join(',') || currentR1.authority?.sourceActivationDigest !== receipt.sourceActivationDigest)) push('R2_CURRENT_AUTHORITY_DRIFT', 'Discard the stale receipt and reissue it from the current R1 decision and active cohort.')
    const authorityAt = timestamp(source.authorizedAt)
    const issuedAt = timestamp(receipt.issuedAt)
    const expiresAt = timestamp(receipt.expiresAt)
    const expectedExpiry = authorityAt === null ? null : authorityAt + Number(source.evidenceWindowMinutes || 15) * 60_000
    if (authorityAt === null || issuedAt === null || expiresAt === null || issuedAt < authorityAt || issuedAt > now + 60_000 || expiresAt !== expectedExpiry || expiresAt <= issuedAt || now >= expiresAt) push('R2_RECEIPT_EXPIRED_OR_MISORDERED', 'Rebuild R1 and issue a new R2 receipt inside the authority evidence window.')
    if (currentR1.mutatedData !== false) push('R2_NON_READ_ONLY_AUTHORITY', 'Use only read-only R1 authority evidence.')
    if (typeof digest === 'function') {
      const { receiptDigest, ...payload } = receipt
      if (!normalize(receiptDigest) || receiptDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('R2_RECEIPT_DIGEST_INVALID', 'Restore the committed receipt or reissue it from fresh R1 authority; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers, expiresAt: receipt?.expiresAt || null }
}

export { EXPANDED_COHORT_RELEASE_RECEIPT_CONTRACT as LEGAL_DOCUMENT_R2_RELEASE_RECEIPT_CONTRACT }
