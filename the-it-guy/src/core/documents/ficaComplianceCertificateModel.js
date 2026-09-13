export const FICA_COMPLIANCE_CERTIFICATE_DOCUMENT_KEY = 'fica_compliance_certificate'

function text(value) {
  return String(value || '').trim()
}

function valueOrFallback(value, fallback = 'Not available') {
  return text(value) || fallback
}

/**
 * Produces the deliberately minimal, shareable record of an approved FICA result.
 * Identity numbers, source documents and provider payloads are intentionally not
 * accepted into this model.
 */
export function buildFicaComplianceCertificateModel({
  certificateReference,
  party = {},
  transaction = {},
  provider = {},
  approval = {},
  generatedAt,
} = {}) {
  const result = valueOrFallback(provider.overallStatus || provider.result, 'Pending')
  return {
    documentKey: FICA_COMPLIANCE_CERTIFICATE_DOCUMENT_KEY,
    title: 'FICA Compliance Certificate',
    certificateReference: valueOrFallback(certificateReference || transaction.reference),
    partyName: valueOrFallback(party.name || party.displayName),
    partyRole: valueOrFallback(party.role),
    transactionReference: valueOrFallback(transaction.reference || transaction.id),
    propertyReference: valueOrFallback(transaction.propertyReference || transaction.propertyAddress),
    providerName: valueOrFallback(provider.name, 'Knowledge Factory'),
    providerReference: valueOrFallback(provider.reference),
    result,
    checkSummary: Array.isArray(provider.checkSummary)
      ? provider.checkSummary.map((item) => ({ label: valueOrFallback(item?.label), status: valueOrFallback(item?.status) }))
      : [],
    reviewerName: valueOrFallback(approval.reviewerName || approval.reviewer),
    approvedAt: valueOrFallback(approval.approvedAt),
    expiresAt: valueOrFallback(provider.expiresAt),
    generatedAt: valueOrFallback(generatedAt),
  }
}
