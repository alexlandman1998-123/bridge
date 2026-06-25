import { generateId, readAgentPrivateListings, writeAgentPrivateListings } from './agentListingStorage'
import { updateCanonicalOfferStatus } from './buyerLifecycleService'
import { isUnsafeFallbackAllowed } from './envValidation'
import { createTransactionFromAcceptedOffer } from './transactionLifecycleService'

const KEY_OFFER_INVITES = 'itg:listing-offer-invites:v1'
const KEY_OFFER_RECORDS = 'itg:listing-offer-records:v1'

export const OFFER_WORKFLOW_STATUS = {
  DRAFT: 'draft',
  SENT_TO_BUYER: 'sent_to_buyer',
  BUYER_VIEWED: 'buyer_viewed',
  SUBMITTED: 'submitted',
  AGENT_REVIEW: 'agent_review',
  CHANGES_REQUESTED: 'changes_requested',
  SENT_TO_SELLER: 'sent_to_seller',
  SELLER_REVIEW: 'sent_to_seller',
  SELLER_VIEWED: 'seller_viewed',
  COUNTERED: 'countered',
  BUYER_REVIEW_COUNTER: 'countered',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  WITHDRAWN: 'withdrawn',
  CONVERTED_TO_TRANSACTION: 'converted_to_transaction',
}

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  if (!isUnsafeFallbackAllowed()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  if (!isUnsafeFallbackAllowed()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeOfferWorkflowStatus(value) {
  const key = normalize(value)
  if (!key) return OFFER_WORKFLOW_STATUS.DRAFT
  if (key === 'pending') return OFFER_WORKFLOW_STATUS.SUBMITTED
  if (key === 'under_review' || key === 'review') return OFFER_WORKFLOW_STATUS.AGENT_REVIEW
  if (key === 'seller_review' || key === 'awaiting_seller_review') return OFFER_WORKFLOW_STATUS.SENT_TO_SELLER
  if (key === 'buyer_review_counter' || key === 'negotiation') return OFFER_WORKFLOW_STATUS.COUNTERED
  return key
}

function notifyUpdates() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('itg:listings-updated'))
  window.dispatchEvent(new Event('itg:transaction-updated'))
  window.dispatchEvent(new Event('itg:transaction-created'))
}

function listPrivateListings() {
  const rows = readAgentPrivateListings()
  return Array.isArray(rows) ? rows : []
}

function upsertListing(listingId, updater) {
  const rows = listPrivateListings()
  const nextRows = rows.map((row) => {
    if (String(row?.id || '') !== String(listingId || '')) return row
    return updater({ ...row })
  })
  writeAgentPrivateListings(nextRows)
  return nextRows.find((row) => String(row?.id || '') === String(listingId || '')) || null
}

function money(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

function expiryIso(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function createOfferToken() {
  return `offer-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
}

function getInviteLink(token, baseUrl = '') {
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.arch9.co.za')
  return `${origin}/client/offer/${token}`
}

export function buildOfferInviteLink(token, baseUrl = '') {
  return getInviteLink(token, baseUrl)
}

function getOfferRecords() {
  const rows = readJson(KEY_OFFER_RECORDS, [])
  return Array.isArray(rows) ? rows : []
}

function writeOfferRecords(rows) {
  writeJson(KEY_OFFER_RECORDS, Array.isArray(rows) ? rows : [])
}

function getOfferInvites() {
  const rows = readJson(KEY_OFFER_INVITES, [])
  const invites = Array.isArray(rows) ? rows : []
  const now = Date.now()
  let changed = false
  const nextRows = invites.map((invite) => {
    const status = normalize(invite?.status)
    if ([OFFER_WORKFLOW_STATUS.EXPIRED, OFFER_WORKFLOW_STATUS.WITHDRAWN].includes(status)) return invite
    const expiresAt = new Date(invite?.expiresAt || 0).getTime()
    if (Number.isFinite(expiresAt) && expiresAt < now) {
      changed = true
      return {
        ...invite,
        status: OFFER_WORKFLOW_STATUS.EXPIRED,
        expiredAt: new Date().toISOString(),
      }
    }
    return invite
  })
  if (changed) {
    writeJson(KEY_OFFER_INVITES, nextRows)
  }
  return nextRows
}

function writeOfferInvites(rows) {
  writeJson(KEY_OFFER_INVITES, Array.isArray(rows) ? rows : [])
}

function listingFromId(listingId) {
  return listPrivateListings().find((row) => String(row?.id || '') === String(listingId || '')) || null
}

function mapRecordToListingOffer(record) {
  return {
    id: record.id,
    buyerName: record.buyer?.fullName || 'Buyer',
    offerPrice: money(record.offer?.offerAmount),
    conditions: record.offer?.specialConditions || record.offer?.suspensiveConditions || '',
    supportingDocsUrl: record.offer?.proofOfFundsUrl || '',
    offerDate: record.submittedAt,
    expiryDate: record.offer?.expiryDate || '',
    agentNotes: record.agentNotes || '',
    sellerNotes: record.sellerNotes || '',
    status: normalizeOfferWorkflowStatus(record.status),
    version: record.version,
    threadId: record.threadId,
    financeType: record.offer?.financeType || 'unknown',
    depositAmount: record.offer?.depositAmount || 0,
  }
}

function syncListingOffers(listingId) {
  const records = getOfferRecords()
    .filter((record) => String(record?.listingId || '') === String(listingId || ''))
    .sort((left, right) => new Date(right?.submittedAt || 0) - new Date(left?.submittedAt || 0))
  const mappedOffers = records.map(mapRecordToListingOffer)
  upsertListing(listingId, (row) => ({ ...row, offers: mappedOffers }))
}

function ensureSingleAcceptedInThread(offerRecords, threadId, acceptedOfferId) {
  return offerRecords.map((record) => {
    if (String(record?.threadId || '') !== String(threadId || '')) return record
    if (String(record?.id || '') === String(acceptedOfferId || '')) return record
    if (normalize(record?.status) === OFFER_WORKFLOW_STATUS.ACCEPTED) {
      return {
        ...record,
        status: OFFER_WORKFLOW_STATUS.REJECTED,
        updatedAt: new Date().toISOString(),
      }
    }
    return record
  })
}

function hydrateLegacyListingOffers(listingId) {
  const records = getOfferRecords().filter((record) => String(record?.listingId || '') === String(listingId || ''))
  if (records.length) return

  const listing = listingFromId(listingId)
  const legacyOffers = Array.isArray(listing?.offers) ? listing.offers : []
  if (!legacyOffers.length) return

  const now = new Date().toISOString()
  const nextRecords = [...getOfferRecords()]
  for (const legacy of legacyOffers) {
    nextRecords.push({
      id: legacy?.id || generateId('offer_record'),
      threadId: legacy?.threadId || generateId('offer_thread'),
      version: Number(legacy?.version || 1),
      listingId: String(listingId || ''),
      buyerLeadId: '',
      viewingId: '',
      sellerToken: listing?.sellerOnboarding?.token || '',
      inviteToken: '',
      source: 'legacy_listing',
      status: normalize(legacy?.status) || OFFER_WORKFLOW_STATUS.SUBMITTED,
      verification: {
        verified: true,
        method: 'legacy',
        verifiedAt: legacy?.offerDate || now,
      },
      buyer: {
        fullName: legacy?.buyerName || 'Buyer',
        email: '',
        phone: '',
        idNumber: '',
      },
      offer: {
        offerAmount: money(legacy?.offerPrice),
        depositAmount: 0,
        financeType: legacy?.financeType || 'unknown',
        bondAmount: 0,
        cashContribution: 0,
        proofOfFundsUrl: legacy?.supportingDocsUrl || '',
        suspensiveConditions: legacy?.conditions || '',
        subjectToSale: false,
        subjectSaleProperty: '',
        subjectSaleTimeline: '',
        subjectSaleAgentInvolved: false,
        occupationDate: '',
        occupationalRent: '',
        includedFixtures: '',
        excludedFixtures: '',
        specialConditions: legacy?.conditions || '',
        expiryDate: legacy?.expiryDate || expiryIso(7),
      },
      agentNotes: legacy?.agentNotes || '',
      sellerNotes: legacy?.sellerNotes || '',
      submittedAt: legacy?.offerDate || now,
      updatedAt: now,
      transactionId: '',
      onboardingUrl: '',
    })
  }
  writeOfferRecords(nextRecords)
}

export function createOfferInvite({
  listingId,
  buyerLeadId = '',
  buyerLeadName = '',
  agentId = '',
  agentName = '',
  agentEmail = '',
  agencyName = '',
  sellerToken = '',
  viewingId = '',
  organisationId = '',
  canonicalOfferId = '',
  expiresInDays = 7,
} = {}) {
  if (!String(listingId || '').trim()) {
    throw new Error('Listing is required to send an offer link.')
  }
  if (!String(buyerLeadId || '').trim()) {
    throw new Error('Select a buyer lead before sending an offer link.')
  }

  const listing = listingFromId(listingId)
  if (!listing) {
    throw new Error('Listing not found.')
  }

  const token = createOfferToken()
  const invite = {
    id: generateId('offer_invite'),
    token,
    listingId: String(listingId || '').trim(),
    buyerLeadId: String(buyerLeadId || '').trim(),
    buyerLeadName: String(buyerLeadName || '').trim(),
    agentId: String(agentId || '').trim(),
    agentName: String(agentName || '').trim(),
    agentEmail: String(agentEmail || '').trim(),
    agencyName: String(agencyName || '').trim(),
    sellerToken: String(sellerToken || listing?.sellerOnboarding?.token || '').trim(),
    viewingId: String(viewingId || '').trim(),
    organisationId: String(organisationId || listing?.organisationId || listing?.organisation_id || '').trim(),
    canonicalOfferId: String(canonicalOfferId || '').trim(),
    status: OFFER_WORKFLOW_STATUS.DRAFT,
    createdAt: new Date().toISOString(),
    expiresAt: expiryIso(expiresInDays),
    consumedAt: null,
  }

  const invites = getOfferInvites()
  writeOfferInvites([invite, ...invites])

  return {
    invite,
    link: getInviteLink(token),
  }
}

export function getOfferInviteContext(token) {
  const invites = getOfferInvites()
  const invite = invites.find((row) => String(row?.token || '').trim() === String(token || '').trim()) || null
  if (!invite) {
    return { ok: false, reason: 'not_found', invite: null, listing: null, offers: [] }
  }
  const status = normalizeOfferWorkflowStatus(invite?.status)
  if (status === OFFER_WORKFLOW_STATUS.EXPIRED) {
    return { ok: false, reason: 'expired', invite, listing: null, offers: [] }
  }
  if (status === OFFER_WORKFLOW_STATUS.WITHDRAWN) {
    return { ok: false, reason: 'withdrawn', invite, listing: null, offers: [] }
  }

  const listing = listingFromId(invite.listingId)
  const offers = getOffersForListing(invite.listingId).filter((row) => String(row?.buyerLeadId || '') === String(invite?.buyerLeadId || ''))
  return { ok: true, reason: '', invite, listing, offers }
}

export function getOfferInvitesForListing(listingId) {
  const targetListingId = String(listingId || '').trim()
  if (!targetListingId) return []
  return getOfferInvites()
    .filter((invite) => String(invite?.listingId || '').trim() === targetListingId)
    .sort((left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0))
    .map((invite) => ({
      ...invite,
      status: normalizeOfferWorkflowStatus(invite?.status),
      link: getInviteLink(invite?.token || ''),
    }))
}

export function getOffersForListing(listingId) {
  hydrateLegacyListingOffers(listingId)
  const rows = getOfferRecords()
    .filter((row) => String(row?.listingId || '') === String(listingId || ''))
    .sort((left, right) => new Date(right?.submittedAt || 0) - new Date(left?.submittedAt || 0))
  return rows
}

export async function submitBuyerOffer({ token, submission, mode = 'new' } = {}) {
  const context = getOfferInviteContext(token)
  if (!context.ok) {
    throw new Error(context.reason === 'expired' ? 'Offer link has expired.' : 'Offer link is not valid.')
  }
  const { invite, listing } = context
  if (!listing) {
    throw new Error('Listing is not available for this offer link.')
  }

  const fullName = String(submission?.fullName || '').trim()
  const email = String(submission?.email || '').trim()
  const phone = String(submission?.phone || '').trim()
  const idNumber = String(submission?.idNumber || '').trim()
  const offerAmount = money(submission?.offerAmount)
  if (!fullName || !email || !phone || !idNumber || offerAmount <= 0) {
    throw new Error('Buyer details and offer amount are required.')
  }
  const records = getOfferRecords()
  const existingForInvite = records
    .filter((row) => String(row?.inviteToken || '') === String(token || ''))
    .sort((left, right) => Number(right?.version || 0) - Number(left?.version || 0))
  const previous = existingForInvite[0] || null
  const threadId = previous?.threadId || generateId('offer_thread')
  const version = previous ? Number(previous.version || 0) + 1 : 1

  const nextRecord = {
    id: generateId('offer_record'),
    threadId,
    version,
    listingId: invite.listingId,
    buyerLeadId: invite.buyerLeadId,
    canonicalOfferId: invite.canonicalOfferId || '',
    organisationId: invite.organisationId || listing?.organisationId || listing?.organisation_id || '',
    viewingId: invite.viewingId || '',
    sellerToken: invite.sellerToken || '',
    inviteToken: token,
    source: mode === 'counter_response' ? 'buyer_counter_response' : 'buyer_offer_link',
    status: OFFER_WORKFLOW_STATUS.SUBMITTED,
    verification: {
      verified: false,
      method: 'not_required',
      verifiedAt: '',
      email,
      phone,
    },
    buyer: {
      fullName,
      email,
      phone,
      idNumber,
    },
    offer: {
      offerAmount,
      depositAmount: money(submission?.depositAmount),
      financeType: String(submission?.financeType || 'unknown').trim().toLowerCase(),
      bondAmount: money(submission?.bondAmount),
      cashContribution: money(submission?.cashContribution),
      needsBondAssistance: Boolean(submission?.needsBondAssistance),
      proofOfFundsUrl: String(submission?.proofOfFundsUrl || '').trim(),
      suspensiveConditions: String(submission?.suspensiveConditions || '').trim(),
      subjectToSale: Boolean(submission?.subjectToSale),
      subjectSaleProperty: String(submission?.subjectSaleProperty || '').trim(),
      subjectSaleTimeline: String(submission?.subjectSaleTimeline || '').trim(),
      subjectSaleAgentInvolved: Boolean(submission?.subjectSaleAgentInvolved),
      occupationDate: String(submission?.occupationDate || '').trim(),
      occupationalRent: Boolean(submission?.occupationalRent),
      includedFixtures: String(submission?.includedFixtures || '').trim(),
      excludedFixtures: String(submission?.excludedFixtures || '').trim(),
      specialConditions: String(submission?.specialConditions || '').trim(),
      expiryDate: String(submission?.expiryDate || expiryIso(7)).trim(),
    },
    buyerAcknowledgements: {
      sellerReview: Boolean(submission?.acknowledgeSellerReview),
      legalDisclaimer: Boolean(submission?.acknowledgeLegalDisclaimer),
      infoAccuracy: Boolean(submission?.acknowledgeInfoAccuracy),
    },
    agentNotes: mode === 'counter_response' ? 'Buyer submitted revised offer after counter.' : 'Buyer submitted offer via secure link.',
    sellerNotes: '',
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    transactionId: '',
    onboardingUrl: '',
  }

  const nextRecords = [nextRecord, ...records].map((record) => {
    if (String(record?.threadId || '') !== String(threadId)) return record
    if (String(record?.id || '') === String(nextRecord.id)) return record
    if (normalize(record?.status) === OFFER_WORKFLOW_STATUS.COUNTERED) {
      return {
        ...record,
        status: OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER,
        updatedAt: new Date().toISOString(),
      }
    }
    return record
  })
  writeOfferRecords(nextRecords)

  const invites = getOfferInvites().map((row) =>
    String(row?.token || '') === String(token || '')
      ? { ...row, status: OFFER_WORKFLOW_STATUS.SUBMITTED, consumedAt: row?.consumedAt || new Date().toISOString() }
      : row,
  )
  writeOfferInvites(invites)

  if (nextRecord.canonicalOfferId && nextRecord.organisationId) {
    await updateCanonicalOfferStatus(nextRecord.canonicalOfferId, 'submitted', {
      organisationId: nextRecord.organisationId,
      patch: {
        offer_amount: nextRecord.offer.offerAmount,
        deposit_amount: nextRecord.offer.depositAmount,
        finance_type: nextRecord.offer.financeType,
        bond_component: nextRecord.offer.bondAmount,
        cash_component: nextRecord.offer.cashContribution,
        conditions_json: {
          suspensiveConditions: nextRecord.offer.suspensiveConditions,
          subjectToSale: nextRecord.offer.subjectToSale,
          subjectSaleProperty: nextRecord.offer.subjectSaleProperty,
          subjectSaleTimeline: nextRecord.offer.subjectSaleTimeline,
          occupationDate: nextRecord.offer.occupationDate,
          occupationalRent: nextRecord.offer.occupationalRent,
          occupationalRentPayable: nextRecord.offer.occupationalRent,
          needsBondAssistance: nextRecord.offer.needsBondAssistance,
          includedFixtures: nextRecord.offer.includedFixtures,
          excludedFixtures: nextRecord.offer.excludedFixtures,
          specialConditions: nextRecord.offer.specialConditions,
          proofOfFundsUrl: nextRecord.offer.proofOfFundsUrl,
        },
        expiry_date: nextRecord.offer.expiryDate || null,
      },
    })
  }

  syncListingOffers(invite.listingId)
  notifyUpdates()
  return nextRecord
}

export function markOfferAgentAction(offerId, action, notes = '') {
  const records = getOfferRecords()
  let target = null
  const nowIso = new Date().toISOString()

  const nextRecords = records.map((record) => {
    if (String(record?.id || '') !== String(offerId || '')) return record
    target = record
    const next = { ...record, updatedAt: nowIso }
    if (action === 'forward_to_seller') {
      next.status = OFFER_WORKFLOW_STATUS.SELLER_REVIEW
      next.sellerReviewAt = nowIso
      next.agentNotes = [record.agentNotes, String(notes || '').trim() || 'Offer forwarded to seller.'].filter(Boolean).join(' ')
    } else if (action === 'reject_invalid') {
      next.status = OFFER_WORKFLOW_STATUS.REJECTED
      next.agentNotes = [record.agentNotes, String(notes || '').trim() || 'Offer rejected as invalid by agent.'].filter(Boolean).join(' ')
    } else if (action === 'mark_incomplete') {
      next.status = OFFER_WORKFLOW_STATUS.AGENT_REVIEW
      next.agentNotes = [record.agentNotes, String(notes || '').trim() || 'Offer marked incomplete by agent.'].filter(Boolean).join(' ')
    } else if (action === 'request_clarification') {
      next.status = OFFER_WORKFLOW_STATUS.AGENT_REVIEW
      next.agentNotes = [record.agentNotes, String(notes || '').trim() || 'Clarification requested from buyer.'].filter(Boolean).join(' ')
    }
    return next
  })

  if (!target) {
    throw new Error('Offer not found.')
  }
  writeOfferRecords(nextRecords)
  syncListingOffers(target.listingId)
  notifyUpdates()
  return nextRecords.find((record) => String(record?.id || '') === String(offerId || '')) || null
}

export function sellerOfferDecision({ offerId, decision, comment = '', counterPayload = null } = {}) {
  const records = getOfferRecords()
  const offer = records.find((row) => String(row?.id || '') === String(offerId || ''))
  if (!offer) throw new Error('Offer not found.')

  const nowIso = new Date().toISOString()
  let nextRecords = [...records]
  let updatedOffer = null
  let createdTransaction = null

  if (decision === 'counter') {
    const counterRecord = {
      ...offer,
      id: generateId('offer_record'),
      version: Number(offer?.version || 0) + 1,
      parentOfferId: offer.id,
      status: OFFER_WORKFLOW_STATUS.COUNTERED,
      source: 'seller_counter',
      sellerNotes: [offer.sellerNotes, String(comment || '').trim() || 'Seller requested counter offer.'].filter(Boolean).join(' '),
      submittedAt: nowIso,
      updatedAt: nowIso,
      offer: {
        ...(offer?.offer || {}),
        ...(counterPayload || {}),
      },
    }
    nextRecords = [counterRecord, ...nextRecords.map((record) => {
      if (String(record?.id || '') === String(offer.id)) {
        return {
          ...record,
          status: OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER,
          updatedAt: nowIso,
        }
      }
      return record
    })]
    updatedOffer = counterRecord
  } else if (decision === 'reject') {
    nextRecords = nextRecords.map((record) =>
      String(record?.id || '') === String(offer.id)
        ? {
            ...record,
            status: OFFER_WORKFLOW_STATUS.REJECTED,
            sellerNotes: [record.sellerNotes, String(comment || '').trim() || 'Offer rejected by seller.'].filter(Boolean).join(' '),
            updatedAt: nowIso,
          }
        : record,
    )
    updatedOffer = nextRecords.find((record) => String(record?.id || '') === String(offer.id)) || null
  } else if (decision === 'accept') {
    nextRecords = nextRecords.map((record) =>
      String(record?.id || '') === String(offer.id)
        ? {
            ...record,
            status: OFFER_WORKFLOW_STATUS.ACCEPTED,
            sellerAcceptedAt: nowIso,
            sellerNotes: [record.sellerNotes, String(comment || '').trim() || 'Offer accepted by seller.'].filter(Boolean).join(' '),
            updatedAt: nowIso,
          }
        : record,
    )
    nextRecords = ensureSingleAcceptedInThread(nextRecords, offer.threadId, offer.id)
    updatedOffer = nextRecords.find((record) => String(record?.id || '') === String(offer.id)) || null

    const listing = listingFromId(offer.listingId)
    if (listing && updatedOffer) {
      const { onboardingToken, onboardingUrl, transactionId } = createTransactionFromAcceptedOffer({
        listing,
        offerRecord: updatedOffer,
        actor: {
          id: listing?.assignedAgentId || offer?.agentId || '',
          name: listing?.assignedAgentName || listing?.assignedAgent || offer?.agentName || '',
          email: listing?.assignedAgentEmail || offer?.agentEmail || '',
        },
      })
      createdTransaction = {
        transactionId,
        onboardingToken,
        onboardingUrl,
      }
      nextRecords = nextRecords.map((record) =>
        String(record?.id || '') === String(updatedOffer.id)
          ? {
              ...record,
              status: OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION,
              transactionId,
              onboardingUrl,
              updatedAt: nowIso,
            }
          : record,
      )
      upsertListing(offer.listingId, (row) => ({
        ...row,
        status: 'under_offer',
        listingStatus: 'under_offer',
        acceptedOfferId: updatedOffer.id,
      }))
    }
  } else {
    throw new Error('Unknown seller decision.')
  }

  writeOfferRecords(nextRecords)
  syncListingOffers(offer.listingId)
  notifyUpdates()
  return {
    offer: updatedOffer,
    createdTransaction,
  }
}

export function getOfferSummaryCards(listingId) {
  const offers = getOffersForListing(listingId)
  const submitted = offers.filter((offer) => normalizeOfferWorkflowStatus(offer?.status) === OFFER_WORKFLOW_STATUS.SUBMITTED).length
  const sellerReview = offers.filter((offer) => normalizeOfferWorkflowStatus(offer?.status) === OFFER_WORKFLOW_STATUS.SELLER_REVIEW).length
  const accepted = offers.filter((offer) => [OFFER_WORKFLOW_STATUS.ACCEPTED, OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION].includes(normalizeOfferWorkflowStatus(offer?.status))).length
  const countered = offers.filter((offer) => normalizeOfferWorkflowStatus(offer?.status) === OFFER_WORKFLOW_STATUS.COUNTERED).length
  const highest = Math.max(0, ...offers.map((offer) => money(offer?.offer?.offerAmount)))
  return {
    total: offers.length,
    submitted,
    sellerReview,
    accepted,
    countered,
    highest,
  }
}
