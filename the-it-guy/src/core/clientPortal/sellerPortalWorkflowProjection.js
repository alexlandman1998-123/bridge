function normalize(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const ACCEPTED_OFFER_STATUSES = new Set([
  'accepted',
  'offer_accepted',
  'accepted_by_seller',
  'signed',
  'signed_otp',
  'otp_signed',
  'converted_to_transaction',
])

const TRANSACTION_STAGES = new Set([
  'offer_accepted',
  'accepted',
  'otp',
  'finance',
  'transfer',
  'registration',
  'registered',
  'completed',
])

const TRANSACTION_MAIN_STAGES = new Set([
  'fin',
  'finance',
  'atty',
  'attorney',
  'xfer',
  'transfer',
  'reg',
  'registration',
  'registered',
  'completed',
])

export function resolveSellerPortalWorkflowProjection({ listing = {}, offers = [], transaction = null } = {}) {
  const acceptedOffer = (Array.isArray(offers) ? offers : []).find((offer) =>
    ACCEPTED_OFFER_STATUSES.has(normalize(offer?.status || offer?.offerStatus || offer?.decision)),
  ) || null
  const listingStatus = normalize(listing?.listingStatus || listing?.listing_status || listing?.status)
  const transactionStage = normalize(transaction?.stage || transaction?.detailed_stage || transaction?.current_stage)
  const transactionMainStage = normalize(transaction?.current_main_stage || transaction?.currentMainStage || transaction?.mainStage)
  const hasTransactionId = Boolean(String(transaction?.id || '').trim())
  const listingConfirmsAcceptedOffer = [
    'under_offer',
    'offer_accepted',
    'transaction_created',
    'converted_to_transaction',
    'sold',
    'registered',
  ].includes(listingStatus)
  // A transaction record becomes authoritative once it has moved beyond the
  // pre-sale/listing lane. A bare "listed" transaction shell is not enough to
  // start legal-sale progress for a seller.
  const transactionConfirmsAcceptedOffer = hasTransactionId && (
    TRANSACTION_STAGES.has(transactionStage) ||
    TRANSACTION_MAIN_STAGES.has(transactionMainStage)
  )
  const isTransaction = Boolean(acceptedOffer || listingConfirmsAcceptedOffer || transactionConfirmsAcceptedOffer)

  return Object.freeze({
    workflow: isTransaction ? 'transaction' : 'listing',
    isTransaction,
    isListing: !isTransaction,
    acceptedOffer,
    reason: acceptedOffer
      ? 'accepted_offer'
      : listingConfirmsAcceptedOffer
        ? 'listing_confirmed_offer'
        : transactionConfirmsAcceptedOffer
          ? 'transaction_progressed'
          : 'awaiting_accepted_offer',
  })
}
