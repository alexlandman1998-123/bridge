export const BUYER_LEAD_OFFER_STATES = Object.freeze({
  searchOpportunity: 'search_opportunity',
  listingInterest: 'listing_interest',
  offerReady: 'offer_ready',
  acceptedOfferReady: 'accepted_offer_ready',
  transactionReady: 'transaction_ready',
})

export const BUYER_LEAD_OFFER_BLOCKERS = Object.freeze({
  buyerLeadRequired: 'buyer_lead_required',
  listingRequiredForOffer: 'listing_required_for_offer',
  contactRequiredForOffer: 'contact_required_for_offer',
  qualificationRequiredForOffer: 'qualification_required_for_offer',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function hasContactChannel(...values) {
  return values.some((value) => normalizeText(value))
}

function isAcceptedOffer(offer = {}) {
  const status = normalizeKey(offer?.status)
  return status === 'accepted' || status === 'converted_to_transaction' || Boolean(normalizeText(offer?.transactionId || offer?.transaction_id))
}

function resolveQualificationEvidence(qualificationEvidence = {}, buyerIntent = {}) {
  const answeredCount = Number(qualificationEvidence?.answeredCount || 0)
  const minimumCount = Number(qualificationEvidence?.minimumCount || 0) || 2
  const buyerIntentAnsweredCount = [
    buyerIntent.budget,
    buyerIntent.financeType,
    buyerIntent.timeline,
    buyerIntent.propertyInterest,
    buyerIntent.viewingStatus,
  ].filter((value) => normalizeText(value)).length
  const resolvedAnsweredCount = Math.max(answeredCount, buyerIntentAnsweredCount)
  return {
    answeredCount: resolvedAnsweredCount,
    minimumCount,
    complete: qualificationEvidence?.complete === true || resolvedAnsweredCount >= minimumCount,
  }
}

export function assessBuyerLeadOfferReadiness({
  lead = null,
  contact = null,
  listingId = '',
  transactionId = '',
  offers = [],
  qualificationEvidence = {},
  buyerIntent = {},
  buyerEmail = '',
  buyerPhone = '',
  requiresDigitalContact = false,
} = {}) {
  if (!lead) {
    return {
      state: BUYER_LEAD_OFFER_STATES.searchOpportunity,
      label: 'Buyer lead required',
      readyForOffer: false,
      readyForTransactionOnboarding: false,
      blockers: [BUYER_LEAD_OFFER_BLOCKERS.buyerLeadRequired],
      warnings: [],
    }
  }

  const resolvedListingId = normalizeText(
    listingId ||
      lead?.listingId ||
      lead?.listing_id,
  )
  const resolvedTransactionId = normalizeText(
    transactionId ||
      lead?.convertedTransactionId ||
      lead?.converted_transaction_id ||
      lead?.convertedDealId ||
      lead?.converted_deal_id,
  )
  const acceptedOffer = (Array.isArray(offers) ? offers : []).find(isAcceptedOffer) || null
  const resolvedContactReady = requiresDigitalContact
    ? hasContactChannel(buyerEmail, contact?.email, lead?.email)
    : hasContactChannel(buyerEmail, buyerPhone, contact?.email, contact?.phone, lead?.email, lead?.phone)
  const resolvedQualification = resolveQualificationEvidence(qualificationEvidence, {
    budget: buyerIntent.budget || lead?.budget || lead?.estimatedValue || lead?.estimated_value,
    financeType: buyerIntent.financeType || lead?.financeType || lead?.finance_type || lead?.preferredFinanceType,
    timeline: buyerIntent.timeline || lead?.moveTimeframe || lead?.move_timeframe,
    propertyInterest: buyerIntent.propertyInterest || lead?.propertyInterest || lead?.property_interest,
    viewingStatus: buyerIntent.viewingStatus,
  })
  const blockers = []
  const warnings = []

  if (!resolvedListingId) blockers.push(BUYER_LEAD_OFFER_BLOCKERS.listingRequiredForOffer)
  if (!resolvedContactReady) blockers.push(BUYER_LEAD_OFFER_BLOCKERS.contactRequiredForOffer)
  if (!resolvedQualification.complete) blockers.push(BUYER_LEAD_OFFER_BLOCKERS.qualificationRequiredForOffer)

  if (resolvedTransactionId) {
    return {
      state: BUYER_LEAD_OFFER_STATES.transactionReady,
      label: 'Transaction buyer onboarding ready',
      readyForOffer: true,
      readyForTransactionOnboarding: true,
      blockers: [],
      warnings,
      listingId: resolvedListingId,
      transactionId: resolvedTransactionId,
      acceptedOffer,
      qualification: resolvedQualification,
    }
  }

  if (acceptedOffer) {
    return {
      state: BUYER_LEAD_OFFER_STATES.acceptedOfferReady,
      label: 'Accepted offer ready for transaction onboarding',
      readyForOffer: true,
      readyForTransactionOnboarding: true,
      blockers: [],
      warnings,
      listingId: resolvedListingId,
      transactionId: normalizeText(acceptedOffer.transactionId || acceptedOffer.transaction_id),
      acceptedOffer,
      qualification: resolvedQualification,
    }
  }

  if (!resolvedListingId) {
    return {
      state: BUYER_LEAD_OFFER_STATES.searchOpportunity,
      label: 'Search opportunity',
      readyForOffer: false,
      readyForTransactionOnboarding: false,
      blockers,
      warnings,
      listingId: '',
      qualification: resolvedQualification,
    }
  }

  if (blockers.length) {
    return {
      state: BUYER_LEAD_OFFER_STATES.listingInterest,
      label: 'Listing interest',
      readyForOffer: false,
      readyForTransactionOnboarding: false,
      blockers,
      warnings,
      listingId: resolvedListingId,
      qualification: resolvedQualification,
    }
  }

  return {
    state: BUYER_LEAD_OFFER_STATES.offerReady,
    label: 'Offer ready',
    readyForOffer: true,
    readyForTransactionOnboarding: false,
    blockers: [],
    warnings,
    listingId: resolvedListingId,
    qualification: resolvedQualification,
  }
}

export function formatBuyerLeadOfferReadinessBlocker(readiness = {}) {
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : []
  if (blockers.includes(BUYER_LEAD_OFFER_BLOCKERS.listingRequiredForOffer)) {
    return 'Select a listing before sending an offer link. Buyer leads without a listing remain search opportunities.'
  }
  if (blockers.includes(BUYER_LEAD_OFFER_BLOCKERS.contactRequiredForOffer)) {
    return 'Add buyer email or phone before sending an offer link.'
  }
  if (blockers.includes(BUYER_LEAD_OFFER_BLOCKERS.qualificationRequiredForOffer)) {
    const minimumCount = Number(readiness?.qualification?.minimumCount || 2)
    return `Capture at least ${minimumCount} buyer qualification answers before sending an offer link.`
  }
  return 'Complete buyer offer readiness before sending an offer link.'
}
