function text(value) {
  return String(value || '').trim()
}

function issue(code) {
  return code
}

/** Validates the committed result returned by bridge_create_mvp_transaction. */
export function assessMvpAtomicTransactionCreation({
  result = null,
  organisationId = '',
  listingId = '',
  leadId = '',
  acceptedOfferId = '',
  idempotencyKey = '',
} = {}) {
  const transaction = result?.transaction && typeof result.transaction === 'object' ? result.transaction : null
  const issues = []
  if (!text(transaction?.id)) issues.push(issue('transaction_missing'))
  if (text(organisationId) && text(transaction?.organisation_id) !== text(organisationId)) issues.push(issue('organisation_mismatch'))
  if (text(listingId) && text(transaction?.listing_id) !== text(listingId)) issues.push(issue('listing_mismatch'))
  if (text(leadId) && ![text(transaction?.originating_lead_id), text(transaction?.originating_buyer_lead_id)].includes(text(leadId))) issues.push(issue('buyer_lead_mismatch'))
  if (text(acceptedOfferId) && text(transaction?.accepted_offer_id) !== text(acceptedOfferId)) issues.push(issue('accepted_offer_mismatch'))
  if (text(idempotencyKey) && text(transaction?.creation_idempotency_key) !== text(idempotencyKey)) issues.push(issue('idempotency_key_mismatch'))
  return {
    ready: issues.length === 0,
    issues,
    transactionId: text(transaction?.id) || null,
    existing: result?.existing === true,
  }
}

export function assertMvpAtomicTransactionCreation(input = {}) {
  const assessment = assessMvpAtomicTransactionCreation(input)
  if (assessment.ready) return assessment
  const error = new Error('Transaction creation could not be verified as one complete accepted-offer conversion.')
  error.code = 'MVP_ATOMIC_TRANSACTION_CREATION_UNVERIFIED'
  error.details = assessment
  throw error
}
