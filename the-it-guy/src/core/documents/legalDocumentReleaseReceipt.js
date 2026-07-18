const RECEIPT_CONTRACT = 'legal-document-release-m2-v1'

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function canonicalLegalDocumentReleaseValue(value) {
  if (Array.isArray(value)) return value.map(canonicalLegalDocumentReleaseValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalLegalDocumentReleaseValue(value[key])]))
  return value ?? null
}

export function buildLegalDocumentReleaseReceiptPayload({ m1 = {}, issuedBy, releaseReference, issuedAt = new Date().toISOString(), m1Digest } = {}) {
  const ageMinutes = Number(m1.evidenceAgeLimitMinutes || 15)
  const evidenceTime = Date.parse(m1.checkedAt || '')
  const expiryBase = Number.isFinite(evidenceTime) ? evidenceTime : Date.parse(issuedAt)
  return canonicalLegalDocumentReleaseValue({
    contract: RECEIPT_CONTRACT,
    status: 'issued',
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(expiryBase + ageMinutes * 60_000).toISOString(),
    issuedBy: normalize(issuedBy),
    releaseReference: normalize(releaseReference),
    releaseTarget: {
      environment: normalize(m1.releaseTarget?.environment).toLowerCase(),
      projectRef: normalize(m1.releaseTarget?.projectRef),
      organisationIds: ids(m1.releaseTarget?.organisationIds),
    },
    m1CheckedAt: m1.checkedAt || null,
    m1Digest: normalize(m1Digest),
  })
}

export function assessLegalDocumentReleaseReceipt({ m1 = {}, receipt = null, now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (m1.status !== 'READY_FOR_M2' || m1.authorized !== true) push('M2_M1_NOT_AUTHORIZED', 'Resolve every M1 release hold and rebuild the receipt from a fresh READY_FOR_M2 decision.')
  if (!receipt || receipt.status !== 'issued') push('M2_RECEIPT_NOT_ISSUED', 'Run the guarded M2 issuer after M1 reports READY_FOR_M2.')
  if (receipt) {
    if (receipt.contract !== RECEIPT_CONTRACT) push('M2_RECEIPT_CONTRACT_INVALID', 'Reissue the receipt using the current M2 contract.')
    if (!normalize(receipt.issuedBy) || !normalize(receipt.releaseReference)) push('M2_ACCOUNTABILITY_MISSING', 'Reissue with an accountable issuer and release/change reference.')
    const issuedAt = Date.parse(receipt.issuedAt || '')
    const expiresAt = Date.parse(receipt.expiresAt || '')
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 60_000 || expiresAt <= issuedAt || now >= expiresAt) push('M2_RECEIPT_EXPIRED_OR_INVALID', 'Rebuild M1 and issue a new receipt inside its evidence window.')
    const currentTarget = canonicalLegalDocumentReleaseValue({ environment: normalize(m1.releaseTarget?.environment).toLowerCase(), projectRef: normalize(m1.releaseTarget?.projectRef), organisationIds: ids(m1.releaseTarget?.organisationIds) })
    const receiptTarget = canonicalLegalDocumentReleaseValue({ environment: normalize(receipt.releaseTarget?.environment).toLowerCase(), projectRef: normalize(receipt.releaseTarget?.projectRef), organisationIds: ids(receipt.releaseTarget?.organisationIds) })
    if (JSON.stringify(currentTarget) !== JSON.stringify(receiptTarget)) push('M2_RELEASE_TARGET_DRIFT', 'Reissue only after the current M1 target exactly matches the intended receipt target.')
    if (!normalize(receipt.m1Digest)) push('M2_M1_DIGEST_MISSING', 'Reissue the receipt with the source M1 evidence digest.')
    if (typeof digest === 'function') {
      const { receiptDigest, ...payload } = receipt
      if (!normalize(receiptDigest) || receiptDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('M2_RECEIPT_DIGEST_INVALID', 'Restore the committed receipt or reissue it from fresh M1 evidence; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers, expiresAt: receipt?.expiresAt || null }
}

export { RECEIPT_CONTRACT as LEGAL_DOCUMENT_M2_RECEIPT_CONTRACT }
