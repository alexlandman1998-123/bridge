import { getClientPortalWorkspaceData } from './clientPortalWorkspaceService'

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value || '').replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function pickText(...values) {
  for (const value of values) {
    const normalized = toText(value)
    if (normalized) return normalized
  }
  return ''
}

function normalizeOfferStatus(value = '') {
  const normalized = normalizeKey(value)
  if (['new', 'submitted', 'seller_review', 'sent_to_seller', 'seller_viewed', 'awaiting_seller_review', 'awaiting_review'].includes(normalized)) {
    return 'new'
  }
  if (['under_review', 'agent_review', 'changes_requested', 'review', 'countered', 'buyer_review_counter', 'negotiation'].includes(normalized)) {
    return 'under_review'
  }
  if (['conditionally_accepted', 'conditional_acceptance', 'accepted_with_conditions', 'conditional'].includes(normalized)) {
    return 'conditionally_accepted'
  }
  if (['accepted', 'approved', 'converted_to_transaction'].includes(normalized)) return 'accepted'
  if (['declined', 'rejected', 'withdrawn'].includes(normalized)) return 'declined'
  if (normalized === 'expired') return 'expired'
  return normalized || 'new'
}

function isSellerSafeOffer(offer = {}) {
  const visibility = normalizeKey(offer.visibility || offer.visibility_scope || offer.scope)
  if (['internal', 'internal_only', 'staff_only', 'private'].includes(visibility)) return false
  if (offer.clientVisible === false || offer.sellerVisible === false || offer.isInternal === true || offer.internalOnly === true) return false

  const status = normalizeKey(offer.status || offer.workflowStatus || offer.workflow_status)
  if (['draft', 'internal_draft', 'incomplete', 'private_note'].includes(status)) return false
  return true
}

function resolveBuyerName(offer = {}) {
  const buyer = offer.buyer && typeof offer.buyer === 'object' ? offer.buyer : {}
  return pickText(
    offer.buyerName,
    offer.buyer_name,
    buyer.displayName,
    buyer.display_name,
    buyer.fullName,
    buyer.full_name,
    buyer.name,
    'Buyer details withheld',
  )
}

function resolveOfferAmount(offer = {}) {
  const nestedOffer = offer.offer && typeof offer.offer === 'object' ? offer.offer : {}
  return toNumber(
    offer.offerAmount ??
      offer.offer_amount ??
      offer.offerPrice ??
      offer.offer_price ??
      offer.amount ??
      offer.price ??
      nestedOffer.offerAmount ??
      nestedOffer.offer_amount ??
      nestedOffer.amount,
  )
}

function resolveAskingPrice(offer = {}, fallbackAskingPrice = 0) {
  const nestedOffer = offer.offer && typeof offer.offer === 'object' ? offer.offer : {}
  return toNumber(
    offer.askingPrice ??
      offer.asking_price ??
      offer.listPrice ??
      offer.list_price ??
      nestedOffer.askingPrice ??
      nestedOffer.asking_price ??
      fallbackAskingPrice,
  )
}

function resolveFinanceStatus(offer = {}) {
  const nestedOffer = offer.offer && typeof offer.offer === 'object' ? offer.offer : {}
  const raw = normalizeKey(
    offer.financeStatus ||
      offer.finance_status ||
      nestedOffer.financeStatus ||
      nestedOffer.finance_status ||
      offer.buyerFinance ||
      offer.buyer_finance,
  )
  const financeType = normalizeKey(offer.financeType || offer.finance_type || nestedOffer.financeType || nestedOffer.finance_type)

  if (['pre_approved', 'preapproved', 'bond_pre_approved'].includes(raw)) return 'Pre-approved'
  if (['approved', 'confirmed'].includes(raw)) return 'Approved'
  if (['cash', 'proof_of_funds'].includes(raw) || financeType === 'cash' || nestedOffer.proofOfFundsUrl) return 'Proof of funds'
  if (['bond', 'finance', 'home_loan'].includes(financeType)) return 'Subject to finance'
  return 'To be confirmed'
}

function resolveOfferType(offer = {}) {
  const nestedOffer = offer.offer && typeof offer.offer === 'object' ? offer.offer : {}
  const explicit = pickText(offer.offerType, offer.offer_type, nestedOffer.offerType, nestedOffer.offer_type)
  if (explicit) return explicit.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())

  const financeType = normalizeKey(offer.financeType || offer.finance_type || nestedOffer.financeType || nestedOffer.finance_type)
  if (financeType === 'cash') return 'Cash Offer'
  if (['bond', 'finance', 'home_loan'].includes(financeType)) return 'Finance Offer'
  return 'Standard Offer'
}

function resolveConditions(offer = {}) {
  const nestedOffer = offer.offer && typeof offer.offer === 'object' ? offer.offer : {}
  return pickText(
    offer.conditions,
    offer.conditionSummary,
    offer.condition_summary,
    nestedOffer.specialConditions,
    nestedOffer.special_conditions,
    nestedOffer.suspensiveConditions,
    nestedOffer.suspensive_conditions,
    'No suspension clauses',
  )
}

function resolveSellerNotes(offer = {}) {
  const nestedOffer = offer.offer && typeof offer.offer === 'object' ? offer.offer : {}
  return pickText(
    offer.sellerNotes,
    offer.seller_notes,
    offer.publicNotes,
    offer.public_notes,
    offer.buyerMessage,
    offer.buyer_message,
    offer.notes,
    nestedOffer.sellerNotes,
    nestedOffer.publicNotes,
    nestedOffer.notes,
    'Your agent will walk you through the detail of this offer.',
  )
}

function resolveDate(offer = {}, keys = []) {
  const nestedOffer = offer.offer && typeof offer.offer === 'object' ? offer.offer : {}
  for (const key of keys) {
    const value = offer[key] || nestedOffer[key]
    if (value) return value
  }
  return ''
}

function resolveDocuments(offer = {}) {
  const documents = toArray(offer.documents).filter((document) => {
    const visibility = normalizeKey(document?.visibility || document?.scope)
    return !['internal', 'private', 'staff_only'].includes(visibility)
  })
  return documents.map((document) => ({
    id: toText(document.id || document.path || document.url),
    name: toText(document.name || document.fileName || document.file_name, 'Offer document'),
    url: toText(document.url || document.publicUrl || document.public_url),
  }))
}

export function normalizeSellerPortalOffer(offer = {}, index = 0, options = {}) {
  const status = normalizeOfferStatus(offer.status || offer.workflowStatus || offer.workflow_status)
  const askingPrice = resolveAskingPrice(offer, options.askingPrice)

  return {
    id: toText(offer.offerId || offer.offer_id || offer.id, `seller_offer_${index}`),
    transactionId: toText(offer.transactionId || offer.transaction_id || options.transactionId),
    propertyId: toText(offer.propertyId || offer.property_id || offer.listingId || offer.listing_id || options.propertyId),
    buyerName: resolveBuyerName(offer),
    offerAmount: resolveOfferAmount(offer),
    askingPrice,
    offerDate: resolveDate(offer, ['offerDate', 'offer_date', 'submittedAt', 'submitted_at', 'createdAt', 'created_at']),
    expiryDate: resolveDate(offer, ['expiryDate', 'expiry_date', 'expiresAt', 'expires_at']),
    financeStatus: resolveFinanceStatus(offer),
    offerType: resolveOfferType(offer),
    conditions: resolveConditions(offer),
    notes: resolveSellerNotes(offer),
    status,
    documents: resolveDocuments(offer),
    createdAt: resolveDate(offer, ['createdAt', 'created_at', 'submittedAt', 'submitted_at']),
    updatedAt: resolveDate(offer, ['updatedAt', 'updated_at']),
  }
}

function dedupeById(items = []) {
  return Array.from(new Map(items.map((item) => [String(item.id || '').trim(), item])).values())
}

export function buildSellerPortalOffersPayload(offers = [], options = {}) {
  const normalizedOffers = dedupeById(
    toArray(offers)
      .filter((offer) => isSellerSafeOffer(offer))
      .map((offer, index) => normalizeSellerPortalOffer(offer, index, options))
      .filter((offer) => offer.offerAmount > 0 || offer.buyerName),
  )

  const offerAmounts = normalizedOffers.map((offer) => offer.offerAmount).filter((amount) => amount > 0)
  const askingPrice = toNumber(options.askingPrice || normalizedOffers.find((offer) => offer.askingPrice > 0)?.askingPrice)
  const highestOffer = offerAmounts.length ? Math.max(...offerAmounts) : 0
  const lowestOffer = offerAmounts.length ? Math.min(...offerAmounts) : 0
  const averageOffer = offerAmounts.length
    ? Math.round(offerAmounts.reduce((total, amount) => total + amount, 0) / offerAmounts.length)
    : 0

  return {
    summary: {
      newCount: normalizedOffers.filter((offer) => offer.status === 'new').length,
      underReviewCount: normalizedOffers.filter((offer) => offer.status === 'under_review').length,
      conditionallyAcceptedCount: normalizedOffers.filter((offer) => offer.status === 'conditionally_accepted').length,
      acceptedCount: normalizedOffers.filter((offer) => offer.status === 'accepted').length,
      declinedCount: normalizedOffers.filter((offer) => offer.status === 'declined').length,
      expiredCount: normalizedOffers.filter((offer) => offer.status === 'expired').length,
      highestOffer,
      averageOffer,
      lowestOffer,
      askingPrice,
      offerToAskingPercentage: askingPrice > 0 && highestOffer > 0 ? Number(((highestOffer / askingPrice) * 100).toFixed(1)) : 0,
    },
    offers: normalizedOffers,
    agent: options.agent || {},
  }
}

export async function getSellerPortalOffers({ token } = {}) {
  const workspaceData = await getClientPortalWorkspaceData(token, 'seller')
  const portal = workspaceData?.legacyPortalData || {}
  const rawOffers = [
    ...toArray(portal?.offers),
    ...toArray(portal?.activeSellingContext?.offers),
    ...toArray(workspaceData?.offers),
  ]
  const assignedAgent = workspaceData?.rolePlayers?.team?.assignedAgent || {}

  return buildSellerPortalOffersPayload(rawOffers, {
    askingPrice: workspaceData?.property?.price || portal?.unit?.price || 0,
    transactionId: workspaceData?.transaction?.id || portal?.transaction?.id || '',
    propertyId: workspaceData?.property?.id || portal?.unit?.id || '',
    agent: {
      id: assignedAgent?.id || '',
      name: assignedAgent?.full_name || assignedAgent?.name || 'Bridge Property Team',
      phone: assignedAgent?.phone || '',
      email: assignedAgent?.email || '',
    },
  })
}
