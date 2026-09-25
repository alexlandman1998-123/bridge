function normalizedStatus(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Separates the seller's listing lane from a legal sale matter. A listing may
 * have offers, but legal milestones and attorney updates only become relevant
 * after the accepted-offer projection has started a transaction.
 */
export function buildSellerPortalSaleJourneyGate({ workflow = 'listing', offers = [] } = {}) {
  const visibleOffers = Array.isArray(offers) ? offers : []
  const acceptedOffer = visibleOffers.find((offer) =>
    ['accepted', 'offer_accepted', 'converted_to_transaction'].includes(normalizedStatus(offer?.status)),
  ) || null
  const isTransaction = workflow === 'transaction'

  return Object.freeze({
    isTransaction,
    acceptedOffer,
    offerCount: visibleOffers.length,
    title: isTransaction ? 'Your sale journey' : 'Your sale journey starts after an accepted offer',
    description: isTransaction
      ? 'Your linked transaction and legal milestones are shared here as the matter progresses.'
      : 'Your property is still in the listing stage. Offers remain visible for discussion, and the legal transfer journey begins only once your agent records an accepted offer.',
    primaryAction: isTransaction
      ? { key: 'documents', label: 'Open documents' }
      : { key: 'offers', label: visibleOffers.length ? 'Review offers' : 'View listing activity' },
  })
}
