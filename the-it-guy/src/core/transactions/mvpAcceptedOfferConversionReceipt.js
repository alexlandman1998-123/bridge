export const MVP_ACCEPTED_OFFER_CONVERSION_RECEIPT_VERSION = 'arch9_mvp_accepted_offer_conversion_receipt_v1'

function text(value) {
  return String(value || '').trim()
}

/**
 * Normalises the one result that the offer workspace may treat as a successful
 * conversion. A transaction id alone is not enough: a fresh conversion must
 * have passed the atomic RPC assertion; a reused one must be explicitly marked
 * as persisted.
 */
export function assessMvpAcceptedOfferConversionReceipt({
  candidate = {},
  result = {},
  acceptedOfferId = '',
} = {}) {
  const transactionId = text(result?.transactionId || result?.transactionRow?.transaction?.id)
  const expectedOfferId = text(acceptedOfferId || candidate?.acceptedOfferId)
  const candidateStatus = text(candidate?.status)
  const existing = result?.existing === true || result?.alreadyConverted === true
  const atomicCreation = result?.atomicCreation || null
  const issues = []

  if (!expectedOfferId) issues.push('accepted_offer_missing')
  if (!['ready', 'converted'].includes(candidateStatus)) issues.push('conversion_candidate_not_ready')
  if (!transactionId) issues.push('transaction_missing')
  if (result?.persisted !== true) issues.push('transaction_not_confirmed_persisted')
  if (!existing && atomicCreation?.ready !== true) issues.push('atomic_creation_not_verified')

  return {
    version: MVP_ACCEPTED_OFFER_CONVERSION_RECEIPT_VERSION,
    ready: issues.length === 0,
    status: existing ? 'reused' : 'created',
    transactionId: transactionId || null,
    acceptedOfferId: expectedOfferId || null,
    candidateStatus: candidateStatus || 'unknown',
    atomicVerified: existing ? null : atomicCreation?.ready === true,
    issues,
  }
}

export function assertMvpAcceptedOfferConversionReceipt(input = {}) {
  const receipt = assessMvpAcceptedOfferConversionReceipt(input)
  if (receipt.ready) return receipt
  const error = new Error('Arch9 could not verify the accepted-offer transaction conversion. Do not retry blindly; use the transaction health check first.')
  error.code = 'MVP_ACCEPTED_OFFER_CONVERSION_UNCONFIRMED'
  error.details = receipt
  throw error
}
