// Existing async operations, loaded on demand by the service facade.
import {
  SELLER_REVIEW_DELIVERY_MODE,
  OFFER_STATUS,
  BUYER_LIFECYCLE_EVENTS,
  __normalizeText as normalizeText,
  getOfferLifecycleSummary,
  normalizeOfferStatus,
  __normalizeLower as normalizeLower,
  __jsonObject as jsonObject,
  buildAcceptedOfferOnboardingPrefill,
  __buildAcceptedOfferContinuityFacts as buildAcceptedOfferContinuityFacts,
  __normalizePurchaserType as normalizePurchaserType,
  normalizeBuyerStage,
  buildSellerOfferReviewPreparation,
  __resolveListingSellerEmail as resolveListingSellerEmail,
  __resolveListingSellerName as resolveListingSellerName,
  __toNullableUuid as toNullableUuid,
  __isUuidLike as isUuidLike,
  __normalizeDate as normalizeDate,
  buildAcceptedOfferConversionCandidate,
} from './buyerLifecycleModel.js'

import {
  isSupabaseConfigured,
  supabase,
} from './supabaseClient'

import {
  createTransactionFromLeadOverride,
  findExistingTransactionForAcceptedOffer,
  findTransactionIdentityById,
} from './transactionLifecycleService'

import {
  resolveTransactionRoutingProfile,
} from '../services/transactionRoutingProfileService.js'

import {
  prepareAgentLegalHandoff,
} from '../services/agentLegalHandoffService.js'



import {
  assertMvpAcceptedOfferConversionReceipt,
} from '../core/transactions/mvpAcceptedOfferConversionReceipt.js'

import {
  mergeResidentialOfferTermsIntoConditions,
} from '../core/offers/residentialOfferTerms.js'

import {
  buildResidentialOfferConditionReviewPatch,
} from '../core/offers/residentialOfferConditionReview.js'

import {
  assertOfferWorkflowAvailable,
} from '../core/offers/offerWorkflowRetirement.js'



import {
  mapOfferFormToBuyerOnboardingForm,
} from './offerBuyerOnboardingBridge.js'

let privateListingActionsPromise = null

function loadPrivateListingActions() {
  if (!privateListingActionsPromise) {
    privateListingActionsPromise = import('../services/privateListingService.js').then((service) => ({
      updatePrivateListing: service.updatePrivateListing,
    }))
  }
  return privateListingActionsPromise
}

async function updatePrivateListing(...args) {
  const { updatePrivateListing: action } = await loadPrivateListingActions()
  return action(...args)
}

const OFFER_STATUS_TIMESTAMP_FIELDS = {
  [OFFER_STATUS.SENT_TO_BUYER]: 'sent_to_buyer_at',
  [OFFER_STATUS.BUYER_VIEWED]: 'buyer_viewed_at',
  [OFFER_STATUS.SUBMITTED]: 'submitted_at',
  [OFFER_STATUS.AGENT_REVIEW]: 'agent_reviewed_at',
  [OFFER_STATUS.CHANGES_REQUESTED]: 'changes_requested_at',
  [OFFER_STATUS.SENT_TO_SELLER]: 'sent_to_seller_at',
  [OFFER_STATUS.SELLER_VIEWED]: 'seller_viewed_at',
  [OFFER_STATUS.COUNTERED]: 'countered_at',
  [OFFER_STATUS.ACCEPTED]: 'accepted_at',
  [OFFER_STATUS.REJECTED]: 'rejected_at',
  [OFFER_STATUS.WITHDRAWN]: 'withdrawn_at',
  [OFFER_STATUS.EXPIRED]: 'expired_at',
  [OFFER_STATUS.CONVERTED_TO_TRANSACTION]: 'converted_to_transaction_at',
}

const EVENT_STAGE_MAP = {
  [BUYER_LIFECYCLE_EVENTS.VIEWING_CREATED]: 'Viewing Scheduled',
  [BUYER_LIFECYCLE_EVENTS.VIEWING_COMPLETED]: 'Viewing Completed',
  [BUYER_LIFECYCLE_EVENTS.OFFER_CREATED]: 'Offer Draft',
  [BUYER_LIFECYCLE_EVENTS.OFFER_SUBMITTED]: 'Offer Submitted',
  [BUYER_LIFECYCLE_EVENTS.OFFER_COUNTERED]: 'Negotiating',
  [BUYER_LIFECYCLE_EVENTS.OFFER_ACCEPTED]: 'Offer Accepted',
  [BUYER_LIFECYCLE_EVENTS.ONBOARDING_STARTED]: 'Onboarding',
  [BUYER_LIFECYCLE_EVENTS.TRANSACTION_CREATED]: 'Onboarding',
  [BUYER_LIFECYCLE_EVENTS.REGISTRATION_CONFIRMED]: 'Registered',
}

const EVENT_ACTIVITY_MAP = {
  [BUYER_LIFECYCLE_EVENTS.VIEWING_CREATED]: ['Viewing Scheduled', 'Viewing scheduled for buyer lead.'],
  [BUYER_LIFECYCLE_EVENTS.VIEWING_COMPLETED]: ['Viewing Completed', 'Viewing completed for buyer lead.'],
  [BUYER_LIFECYCLE_EVENTS.OFFER_CREATED]: ['Offer Draft', 'Offer draft created.'],
  [BUYER_LIFECYCLE_EVENTS.OFFER_SUBMITTED]: ['Offer Submitted', 'Offer submitted.'],
  [BUYER_LIFECYCLE_EVENTS.OFFER_COUNTERED]: ['Offer Countered', 'Offer moved into negotiation.'],
  [BUYER_LIFECYCLE_EVENTS.OFFER_ACCEPTED]: ['Offer Accepted', 'Offer accepted.'],
  [BUYER_LIFECYCLE_EVENTS.ONBOARDING_STARTED]: ['Onboarding Started', 'Buyer onboarding started.'],
  [BUYER_LIFECYCLE_EVENTS.TRANSACTION_CREATED]: ['Transaction Created', 'Transaction created from accepted offer and moved into onboarding / OTP preparation.'],
  [BUYER_LIFECYCLE_EVENTS.REGISTRATION_CONFIRMED]: ['Registration Confirmed', 'Registration confirmed.'],
}

function money(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function shouldMergePrefillValue(value, prefilledValue) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string' && value.trim() === '' && prefilledValue !== undefined) return false
  if (Array.isArray(value) && value.length === 0 && prefilledValue !== undefined) return false
  return true
}

function mergeExistingOnboardingValues(prefill = {}, existing = {}) {
  const merged = { ...prefill }
  Object.entries(existing).forEach(([key, value]) => {
    if (key === 'finance') return
    if (shouldMergePrefillValue(value, prefill[key])) {
      merged[key] = value
    }
  })
  const prefilledFinance = jsonObject(prefill.finance)
  const existingFinance = jsonObject(existing.finance)
  const mergedFinance = { ...prefilledFinance }
  Object.entries(existingFinance).forEach(([key, value]) => {
    if (shouldMergePrefillValue(value, prefilledFinance[key])) {
      mergedFinance[key] = value
    }
  })
  if (Object.keys(mergedFinance).length) merged.finance = mergedFinance
  else delete merged.finance
  return merged
}

async function attachLegalHandoff(result = {}, transactionId = '') {
  const normalizedTransactionId = normalizeText(transactionId || result?.transactionId || result?.transactionRow?.transaction?.id)
  if (!normalizedTransactionId) return result
  try {
    return {
      ...result,
      legalHandoff: await prepareAgentLegalHandoff(normalizedTransactionId),
    }
  } catch (handoffError) {
    return {
      ...result,
      legalHandoff: {
        prepared: false,
        transactionId: normalizedTransactionId,
        error: handoffError?.message || 'Legal handoff preparation failed.',
      },
      warning: result?.warning || 'legal_handoff_needs_retry',
    }
  }
}

function createOfferAccessToken() {
  const randomValue = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
  return `offer-${randomValue}`
}

function createOfferPortalAccessToken() {
  const randomValue = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
  return `portal-${randomValue}`
}

function createSellerOfferReviewAccessToken() {
  const randomValue = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
  return `seller-offer-${randomValue}`
}

function isMissingColumnError(error) {
  return String(error?.code || '') === '42703' || /column .* does not exist/i.test(String(error?.message || ''))
}

function isMissingTableError(error, tableName = '') {
  const message = String(error?.message || '')
  return String(error?.code || '') === '42P01' || (tableName && message.includes(tableName) && /does not exist|schema cache/i.test(message))
}

function isForeignKeyViolation(error, constraintName = '') {
  if (String(error?.code || '') !== '23503') return false
  const constraint = normalizeLower(constraintName)
  if (!constraint) return true
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.constraint,
  ].some((value) => normalizeLower(value).includes(constraint))
}

export async function recordBuyerLeadActivity({
  organisationId = '',
  leadId = '',
  activityType = 'Note',
  activityNote = '',
  outcome = '',
  activityDate = '',
  actor = null,
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  if (!scopedOrganisationId || !scopedLeadId || !isSupabaseConfigured || !supabase) return null

  const { error } = await supabase.from('lead_activities').insert({
    organisation_id: scopedOrganisationId,
    lead_id: scopedLeadId,
    agent_id: toNullableUuid(actor?.id),
    activity_type: normalizeText(activityType) || 'Note',
    activity_note: normalizeText(activityNote) || null,
    outcome: normalizeText(outcome) || null,
    activity_date: normalizeDate(activityDate) || new Date().toISOString(),
  })
  if (error) throw error
  return true
}

export async function updateBuyerLeadStage({
  organisationId = '',
  leadId = '',
  stage = '',
  actor = null,
  activityType = 'Stage Change',
  activityNote = '',
  outcome = '',
  extra = {},
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  const nextStage = normalizeBuyerStage(stage)
  if (!scopedOrganisationId || !scopedLeadId || !isSupabaseConfigured || !supabase) return null

  const updatePayload = {
    current_stage: nextStage,
    stage: nextStage,
    status: nextStage,
    updated_at: new Date().toISOString(),
    ...extra,
  }

  let result = await supabase
    .from('leads')
    .update(updatePayload)
    .eq('lead_id', scopedLeadId)
    .eq('organisation_id', scopedOrganisationId)
    .select('lead_id,current_stage,stage,status')
    .maybeSingle()

  if (result.error && isMissingColumnError(result.error)) {
    const fallbackPayload = { ...updatePayload }
    delete fallbackPayload.current_stage
    result = await supabase
      .from('leads')
      .update(fallbackPayload)
      .eq('lead_id', scopedLeadId)
      .eq('organisation_id', scopedOrganisationId)
      .select('lead_id,stage,status')
      .maybeSingle()
  }

  if (result.error) throw result.error

  await recordBuyerLeadActivity({
    organisationId: scopedOrganisationId,
    leadId: scopedLeadId,
    activityType,
    activityNote: activityNote || `Buyer lead moved to ${nextStage}.`,
    outcome: outcome || nextStage,
    actor,
  }).catch(() => null)

  return result.data
}

export async function applyBuyerLifecycleEvent({
  organisationId = '',
  leadId = '',
  event = '',
  actor = null,
  activityNote = '',
  offerId = '',
  transactionId = '',
  extra = {},
} = {}) {
  const normalizedEvent = normalizeLower(event)
  const nextStage = EVENT_STAGE_MAP[normalizedEvent]
  if (!nextStage) return null
  const [activityType, defaultNote] = EVENT_ACTIVITY_MAP[normalizedEvent] || ['Stage Change', 'Buyer lifecycle updated.']
  const result = await updateBuyerLeadStage({
    organisationId,
    leadId,
    stage: nextStage,
    actor,
    activityType,
    activityNote: activityNote || defaultNote,
    outcome: nextStage,
    extra,
  })
  const { runWorkflowAutomations } = await import('./workflowEngine')
  await runWorkflowAutomations({
    organisationId,
    event: normalizedEvent,
    leadId,
    offerId,
    transactionId,
    actor,
    toStage: nextStage,
    metadata: { source: 'buyer_lifecycle_service' },
  }).catch(() => null)
  return result
}

function mapOfferDbRow(row = {}) {
  if (!row) return null
  const conditions = row.conditions_json || {}
  return {
    id: row.id,
    offerId: row.id,
    offerToken: row.offer_token,
    organisationId: row.organisation_id,
    buyerLeadId: row.buyer_lead_id,
    buyerContactId: row.buyer_contact_id,
    listingId: row.listing_id,
    sellerLeadId: row.seller_lead_id,
    sellerContactId: row.seller_contact_id,
    agentId: row.agent_id,
    viewingAppointmentId: row.viewing_appointment_id,
    status: row.status,
    offerAmount: row.offer_amount,
    depositAmount: row.deposit_amount,
    financeType: row.finance_type,
    cashComponent: row.cash_component,
    bondComponent: row.bond_component,
    conditions,
    buyerOnboarding: conditions.buyerOnboarding || null,
    buyerOnboardingStatus: conditions.buyerOnboardingStatus || '',
    buyerOnboardingSubmittedAt: conditions.buyerOnboardingSubmittedAt || '',
    expiryDate: row.expiry_date,
    sentToBuyerAt: row.sent_to_buyer_at,
    buyerViewedAt: row.buyer_viewed_at,
    buyerSubmittedAt: row.buyer_submitted_at,
    agentReviewedAt: row.agent_reviewed_at,
    changesRequestedAt: row.changes_requested_at,
    sentToSellerAt: row.sent_to_seller_at,
    sellerViewedAt: row.seller_viewed_at,
    submittedAt: row.submitted_at,
    counteredAt: row.countered_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    withdrawnAt: row.withdrawn_at,
    expiredAt: row.expired_at,
    convertedToTransactionAt: row.converted_to_transaction_at,
    transactionId: row.transaction_id,
    sellerReviewSessionId: row.seller_review_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAppointmentViewedListingDbRow(row = {}) {
  if (!row) return null
  return {
    id: row.id,
    organisationId: row.organisation_id,
    appointmentId: row.appointment_id,
    leadId: row.lead_id,
    listingId: row.listing_id,
    agentId: row.agent_id,
    viewedAt: row.viewed_at,
    outcome: row.outcome,
    buyerFeedback: row.buyer_feedback,
    agentNotes: row.agent_notes,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapOfferPortalSessionDbRow(row = {}) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.id,
    organisationId: row.organisation_id,
    buyerLeadId: row.buyer_lead_id,
    buyerContactId: row.buyer_contact_id,
    appointmentId: row.appointment_id,
    agentId: row.agent_id,
    token: row.token,
    status: row.status,
    expiresAt: row.expires_at,
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    submittedAt: row.submitted_at,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapOfferPortalSessionPayload(session = {}) {
  if (!session) return null
  return {
    id: session.id,
    sessionId: session.id,
    organisationId: session.organisationId || session.organisation_id,
    buyerLeadId: session.buyerLeadId || session.buyer_lead_id,
    buyerContactId: session.buyerContactId || session.buyer_contact_id,
    appointmentId: session.appointmentId || session.appointment_id,
    agentId: session.agentId || session.agent_id,
    token: session.token,
    status: session.status,
    expiresAt: session.expiresAt || session.expires_at,
    sentAt: session.sentAt || session.sent_at,
    viewedAt: session.viewedAt || session.viewed_at,
    submittedAt: session.submittedAt || session.submitted_at,
    metadata: session.metadata || session.metadata_json || {},
    createdAt: session.createdAt || session.created_at,
    updatedAt: session.updatedAt || session.updated_at,
  }
}

function mapOfferSellerReviewSessionDbRow(row = {}) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.id,
    organisationId: row.organisation_id,
    offerId: row.offer_id,
    sellerLeadId: row.seller_lead_id,
    sellerContactId: row.seller_contact_id,
    listingId: row.listing_id,
    agentId: row.agent_id,
    token: row.token,
    status: row.status,
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    counteredAt: row.countered_at,
    expiresAt: row.expires_at,
    decisionNotes: row.decision_notes,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSellerOfferReviewPayload(payload = {}) {
  const response = payload && typeof payload === 'object' ? payload : {}
  if (!response.ok) {
    return {
      ok: false,
      reason: normalizeText(response.reason) || 'not_found',
      session: null,
      offer: null,
      listing: null,
    }
  }
  const offer = response.offer || {}
  const conditions = offer.conditionsJson || offer.conditions_json || offer.conditions || {}
  return {
    ok: true,
    reason: '',
    transactionId: response.transactionId || response.transaction_id || null,
    session: response.session || null,
    listing: response.listing || null,
    seller: response.seller || null,
    buyer: response.buyer || null,
    agent: response.agent || null,
    offer: {
      id: offer.id,
      offerId: offer.id,
      organisationId: offer.organisationId || offer.organisation_id,
      buyerLeadId: offer.buyerLeadId || offer.buyer_lead_id,
      buyerContactId: offer.buyerContactId || offer.buyer_contact_id,
      listingId: offer.listingId || offer.listing_id,
      status: offer.status,
      offerAmount: money(offer.offerAmount || offer.offer_amount),
      depositAmount: money(offer.depositAmount || offer.deposit_amount),
      financeType: offer.financeType || offer.finance_type,
      cashComponent: money(offer.cashComponent || offer.cash_component),
      bondComponent: money(offer.bondComponent || offer.bond_component),
      conditions,
      expiryDate: offer.expiryDate || offer.expiry_date,
      submittedAt: offer.submittedAt || offer.submitted_at,
      buyerSubmittedAt: offer.buyerSubmittedAt || offer.buyer_submitted_at,
      sentToSellerAt: offer.sentToSellerAt || offer.sent_to_seller_at,
      sellerViewedAt: offer.sellerViewedAt || offer.seller_viewed_at,
      acceptedAt: offer.acceptedAt || offer.accepted_at,
      rejectedAt: offer.rejectedAt || offer.rejected_at,
      counteredAt: offer.counteredAt || offer.countered_at,
      transactionId: offer.transactionId || offer.transaction_id,
      createdAt: offer.createdAt || offer.created_at,
      updatedAt: offer.updatedAt || offer.updated_at,
    },
  }
}

function mapOfferPortalPropertyPayload(item = {}) {
  const listing = item?.listing || {}
  const viewedListing = item?.viewedListing || item?.viewed_listing || {}
  return {
    viewedListing: {
      id: viewedListing.id,
      organisationId: viewedListing.organisationId || viewedListing.organisation_id,
      appointmentId: viewedListing.appointmentId || viewedListing.appointment_id,
      leadId: viewedListing.leadId || viewedListing.lead_id,
      listingId: viewedListing.listingId || viewedListing.listing_id,
      agentId: viewedListing.agentId || viewedListing.agent_id,
      viewedAt: viewedListing.viewedAt || viewedListing.viewed_at,
      outcome: viewedListing.outcome,
      buyerFeedback: viewedListing.buyerFeedback || viewedListing.buyer_feedback,
      agentNotes: viewedListing.agentNotes || viewedListing.agent_notes,
      metadata: viewedListing.metadata || viewedListing.metadata_json || {},
      createdAt: viewedListing.createdAt || viewedListing.created_at,
      updatedAt: viewedListing.updatedAt || viewedListing.updated_at,
    },
    listing: {
      id: listing.id,
      listingTitle: listing.listingTitle || listing.listing_title || listing.title || 'Listing',
      propertyAddress: listing.propertyAddress || listing.property_address || listing.address || '',
      suburb: listing.suburb || '',
      city: listing.city || '',
      askingPrice: money(listing.askingPrice || listing.asking_price || listing.price),
      raw: listing.raw || {},
    },
    offers: (Array.isArray(item?.offers) ? item.offers : []).map((offer) => ({
      id: offer.id,
      offerToken: offer.offerToken || offer.offer_token,
      status: offer.status,
      offerAmount: offer.offerAmount || offer.offer_amount,
      depositAmount: offer.depositAmount || offer.deposit_amount,
      financeType: offer.financeType || offer.finance_type,
      sentToBuyerAt: offer.sentToBuyerAt || offer.sent_to_buyer_at,
      buyerViewedAt: offer.buyerViewedAt || offer.buyer_viewed_at,
      buyerSubmittedAt: offer.buyerSubmittedAt || offer.buyer_submitted_at,
      agentReviewedAt: offer.agentReviewedAt || offer.agent_reviewed_at,
      changesRequestedAt: offer.changesRequestedAt || offer.changes_requested_at,
      sentToSellerAt: offer.sentToSellerAt || offer.sent_to_seller_at,
      sellerViewedAt: offer.sellerViewedAt || offer.seller_viewed_at,
      submittedAt: offer.submittedAt || offer.submitted_at,
      counteredAt: offer.counteredAt || offer.countered_at,
      acceptedAt: offer.acceptedAt || offer.accepted_at,
      rejectedAt: offer.rejectedAt || offer.rejected_at,
      withdrawnAt: offer.withdrawnAt || offer.withdrawn_at,
      expiredAt: offer.expiredAt || offer.expired_at,
      convertedToTransactionAt: offer.convertedToTransactionAt || offer.converted_to_transaction_at,
      transactionId: offer.transactionId || offer.transaction_id,
      createdAt: offer.createdAt || offer.created_at,
      updatedAt: offer.updatedAt || offer.updated_at,
    })),
  }
}

function mapOfferPortalContextPayload(payload = {}) {
  const response = payload && typeof payload === 'object' ? payload : {}
  if (!response.ok) {
    return {
      ok: false,
      reason: normalizeText(response.reason) || 'not_found',
      session: null,
      properties: [],
      source: 'offer_portal_session',
    }
  }
  return {
    ok: true,
    reason: '',
    source: 'offer_portal_session',
    session: mapOfferPortalSessionPayload(response.session),
    agent: response.agent || null,
    buyer: response.buyer || null,
    properties: (Array.isArray(response.properties) ? response.properties : [])
      .map(mapOfferPortalPropertyPayload)
      .filter((item) => item?.viewedListing?.listingId || item?.listing?.id),
  }
}

function buildAppointmentViewedListingUpsert(payload = {}) {
  return {
    organisation_id: toNullableUuid(payload?.organisationId),
    appointment_id: toNullableUuid(payload?.appointmentId),
    lead_id: toNullableUuid(payload?.leadId),
    listing_id: toNullableUuid(payload?.listingId),
    agent_id: toNullableUuid(payload?.agentId),
    viewed_at: normalizeDate(payload?.viewedAt) || new Date().toISOString(),
    outcome: normalizeText(payload?.outcome) || null,
    buyer_feedback: normalizeText(payload?.buyerFeedback) || null,
    agent_notes: normalizeText(payload?.agentNotes) || null,
    metadata_json: jsonObject(payload?.metadata || payload?.metadataJson),
  }
}

function buildOfferInsert(payload = {}) {
  const status = normalizeOfferStatus(payload?.status)
  const nowIso = new Date().toISOString()
  const conditionsJson = mergeResidentialOfferTermsIntoConditions(
    jsonObject(payload?.conditions || payload?.conditionsJson),
    {
      ...(payload?.conditions || payload?.conditionsJson || {}),
      offerAmount: payload?.offerAmount,
      depositAmount: payload?.depositAmount,
      financeType: payload?.financeType,
      cashContribution: payload?.cashComponent,
      bondAmount: payload?.bondComponent,
      expiryDate: payload?.expiryDate,
      otpDocumentVariant: payload?.otpDocumentVariant || payload?.conditionsJson?.otpDocumentVariant || payload?.conditions?.otpDocumentVariant,
      transactionType: payload?.transactionType || payload?.transaction_type,
      developmentId: payload?.developmentId || payload?.development_id,
    },
    {
      source: payload?.conditionsJson?.source || payload?.conditions?.source || 'canonical_offer',
      captureMethod: payload?.conditionsJson?.capturedByAgent || payload?.conditions?.capturedByAgent ? 'agent_assisted' : 'agent_preparation',
      sourceContext: payload,
    },
  )
  return {
    organisation_id: toNullableUuid(payload?.organisationId),
    offer_token: normalizeText(payload?.offerToken) || createOfferAccessToken(),
    buyer_lead_id: toNullableUuid(payload?.buyerLeadId),
    buyer_contact_id: toNullableUuid(payload?.buyerContactId),
    listing_id: toNullableUuid(payload?.listingId),
    seller_lead_id: toNullableUuid(payload?.sellerLeadId),
    seller_contact_id: toNullableUuid(payload?.sellerContactId),
    agent_id: toNullableUuid(payload?.agentId),
    viewing_appointment_id: toNullableUuid(payload?.viewingAppointmentId),
    status,
    offer_amount: money(payload?.offerAmount),
    deposit_amount: money(payload?.depositAmount),
    finance_type: normalizeText(payload?.financeType) || null,
    cash_component: money(payload?.cashComponent),
    bond_component: money(payload?.bondComponent),
    conditions_json: conditionsJson,
    expiry_date: normalizeDate(payload?.expiryDate),
    sent_to_buyer_at: status === OFFER_STATUS.SENT_TO_BUYER ? (normalizeDate(payload?.sentToBuyerAt) || nowIso) : normalizeDate(payload?.sentToBuyerAt),
    buyer_viewed_at: status === OFFER_STATUS.BUYER_VIEWED ? (normalizeDate(payload?.buyerViewedAt) || nowIso) : normalizeDate(payload?.buyerViewedAt),
    buyer_submitted_at: status === OFFER_STATUS.SUBMITTED ? (normalizeDate(payload?.buyerSubmittedAt || payload?.submittedAt) || nowIso) : normalizeDate(payload?.buyerSubmittedAt),
    agent_reviewed_at: status === OFFER_STATUS.AGENT_REVIEW ? (normalizeDate(payload?.agentReviewedAt) || nowIso) : normalizeDate(payload?.agentReviewedAt),
    changes_requested_at: status === OFFER_STATUS.CHANGES_REQUESTED ? (normalizeDate(payload?.changesRequestedAt) || nowIso) : normalizeDate(payload?.changesRequestedAt),
    sent_to_seller_at: status === OFFER_STATUS.SENT_TO_SELLER ? (normalizeDate(payload?.sentToSellerAt) || nowIso) : normalizeDate(payload?.sentToSellerAt),
    seller_viewed_at: status === OFFER_STATUS.SELLER_VIEWED ? (normalizeDate(payload?.sellerViewedAt) || nowIso) : normalizeDate(payload?.sellerViewedAt),
    submitted_at: status === OFFER_STATUS.SUBMITTED ? (normalizeDate(payload?.submittedAt) || nowIso) : normalizeDate(payload?.submittedAt),
    countered_at: status === OFFER_STATUS.COUNTERED ? (normalizeDate(payload?.counteredAt) || nowIso) : normalizeDate(payload?.counteredAt),
    accepted_at: status === OFFER_STATUS.ACCEPTED ? (normalizeDate(payload?.acceptedAt) || nowIso) : normalizeDate(payload?.acceptedAt),
    rejected_at: status === OFFER_STATUS.REJECTED ? (normalizeDate(payload?.rejectedAt) || nowIso) : normalizeDate(payload?.rejectedAt),
    withdrawn_at: status === OFFER_STATUS.WITHDRAWN ? (normalizeDate(payload?.withdrawnAt) || nowIso) : normalizeDate(payload?.withdrawnAt),
    expired_at: status === OFFER_STATUS.EXPIRED ? (normalizeDate(payload?.expiredAt) || nowIso) : normalizeDate(payload?.expiredAt),
    converted_to_transaction_at: status === OFFER_STATUS.CONVERTED_TO_TRANSACTION ? (normalizeDate(payload?.convertedToTransactionAt) || nowIso) : normalizeDate(payload?.convertedToTransactionAt),
    transaction_id: toNullableUuid(payload?.transactionId),
  }
}

function mapListingDbRow(row = {}) {
  if (!row) return null
  const propertyDetails = row.property_details && typeof row.property_details === 'object' ? row.property_details : {}
  const marketing = row.marketing && typeof row.marketing === 'object' ? row.marketing : {}
  return {
    id: row.id,
    listingTitle: row.listing_title || marketing.title || propertyDetails.title || 'Listing',
    propertyAddress: row.property_address || propertyDetails.address || propertyDetails.addressLine1 || '',
    suburb: row.suburb || propertyDetails.suburb || '',
    city: row.city || propertyDetails.city || '',
    askingPrice: row.asking_price || row.price || propertyDetails.askingPrice || 0,
    transactionType: row.transaction_type || row.transactionType || propertyDetails.transactionType || '',
    developmentId: row.development_id || row.developmentId || propertyDetails.developmentId || '',
  }
}

export async function getCanonicalOfferInviteContext(token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken || !isSupabaseConfigured || !supabase) {
    return { ok: false, reason: 'not_found', invite: null, listing: null, offers: [] }
  }

  let query = supabase.from('offers').select('*')
  if (isUuidLike(normalizedToken)) {
    query = query.or(`id.eq.${normalizedToken},offer_token.eq.${normalizedToken}`)
  } else {
    query = query.eq('offer_token', normalizedToken)
  }
  let { data, error } = await query.maybeSingle()
  if (error || !data) return { ok: false, reason: 'not_found', invite: null, listing: null, offers: [] }

  let offer = mapOfferDbRow(data)
  const lifecycle = getOfferLifecycleSummary(offer)
  if (lifecycle.expiredByDate) {
    const expiredOffer = await updateCanonicalOfferStatus(offer.id, OFFER_STATUS.EXPIRED, {
      organisationId: offer.organisationId,
      patch: {
        expired_at: new Date().toISOString(),
      },
    }).catch(() => null)
    if (expiredOffer) offer = expiredOffer
  }
  if (offer?.status === 'expired') return { ok: false, reason: 'expired', invite: null, listing: null, offers: [] }
  if (offer?.status === 'withdrawn') return { ok: false, reason: 'withdrawn', invite: null, listing: null, offers: [] }
  if (offer?.expiryDate && new Date(offer.expiryDate).getTime() < Date.now()) return { ok: false, reason: 'expired', invite: null, listing: null, offers: [] }

  if ([OFFER_STATUS.DRAFT, OFFER_STATUS.SENT_TO_BUYER].includes(normalizeOfferStatus(offer?.status))) {
    const viewedResult = await supabase
      .from('offers')
      .update({
        status: OFFER_STATUS.BUYER_VIEWED,
        buyer_viewed_at: new Date().toISOString(),
      })
      .eq('id', offer.id)
      .select('*')
      .maybeSingle()
    if (!viewedResult.error && viewedResult.data) {
      data = viewedResult.data
      offer = mapOfferDbRow(data)
    }
  }

  let listing = null
  if (offer?.listingId) {
    const listingResult = await supabase.from('private_listings').select('*').eq('id', offer.listingId).maybeSingle()
    if (!listingResult.error) listing = mapListingDbRow(listingResult.data)
  }

  const buyerName = normalizeText(offer?.conditions?.buyerName) || 'Prospect'
  const agentName = normalizeText(offer?.conditions?.agentName) || 'Assigned agent'
  return {
    ok: true,
    source: 'canonical',
    reason: '',
    canonicalOffer: offer,
    invite: {
      token: offer.offerToken || offer.id,
      buyerLeadName: buyerName,
      expiresAt: offer.expiryDate,
      agentName,
      agentEmail: normalizeText(offer?.conditions?.agentEmail).toLowerCase(),
      otpDocumentVariant: normalizeText(offer?.conditions?.otpDocumentVariant),
      status: offer.status,
    },
    listing,
    offers: [
      OFFER_STATUS.SUBMITTED,
      OFFER_STATUS.AGENT_REVIEW,
      OFFER_STATUS.CHANGES_REQUESTED,
      OFFER_STATUS.SENT_TO_SELLER,
      OFFER_STATUS.SELLER_VIEWED,
      OFFER_STATUS.COUNTERED,
      OFFER_STATUS.ACCEPTED,
      OFFER_STATUS.REJECTED,
      OFFER_STATUS.CONVERTED_TO_TRANSACTION,
    ].includes(normalizeOfferStatus(offer.status))
      ? [{
          id: offer.id,
          status: offer.status,
          submittedAt: offer.submittedAt,
          buyerSubmittedAt: offer.buyerSubmittedAt,
          offer: { offerAmount: offer.offerAmount },
        }]
      : [],
  }
}

function buildBuyerOnboardingSubmissionSnapshot(submission = {}, context = {}, submittedAt = new Date().toISOString()) {
  const listing = context?.listing || {}
  const canonicalOffer = context?.canonicalOffer || {}
  const purchaserEntityType = normalizeText(submission?.purchaser_entity_type || submission?.purchaserEntityType || submission?.purchaser_type || 'individual').toLowerCase() || 'individual'
  const entityName = purchaserEntityType === 'company'
    ? normalizeText(submission?.company_name)
    : purchaserEntityType === 'trust'
      ? normalizeText(submission?.trust_name)
      : ''
  const fullName = normalizeText(
    submission?.fullName ||
      entityName ||
      submission?.company_contact_name ||
      submission?.trust_contact_name ||
      submission?.authorised_signatory_name ||
      submission?.authorised_trustee_name,
  )
  const email = normalizeText(
    submission?.email ||
      submission?.company_contact_email ||
      submission?.trust_contact_email ||
      submission?.authorised_signatory_email ||
      submission?.authorised_trustee_email,
  ).toLowerCase()
  const phone = normalizeText(
    submission?.phone ||
      submission?.company_contact_phone ||
      submission?.trust_contact_phone ||
      submission?.authorised_signatory_phone ||
      submission?.authorised_trustee_phone,
  )
  const idNumber = normalizeText(submission?.idNumber || submission?.authorised_signatory_identity_number || submission?.authorised_trustee_identity_number)
  const purchasePrice = money(
    submission?.purchasePrice ||
      submission?.listingAskingPrice ||
      listing?.askingPrice ||
      listing?.asking_price ||
      canonicalOffer?.offerAmount,
  )
  const financeType = normalizeText(submission?.financeType).toLowerCase() === 'hybrid'
    ? 'combination'
    : normalizeText(submission?.financeType).toLowerCase()
  const formData = mapOfferFormToBuyerOnboardingForm(
    {
      ...submission,
      fullName,
      email,
      phone,
      idNumber,
      purchasePrice,
      financeType,
    },
    {
      purchasePrice,
      depositAmount: submission?.depositAmount,
      loanAmount: submission?.bondAmount,
      financeType,
      transaction: canonicalOffer,
    },
  )

  return {
    status: 'submitted',
    source: 'buyer_onboarding_link',
    captureMethod: 'buyer_self_service',
    submittedAt,
    nextAction: 'prepare_otp_transaction',
    buyer: {
      fullName,
      email,
      phone,
      idNumber,
      purchaserEntityType,
      entityName,
    },
    entity: purchaserEntityType === 'company'
      ? {
          type: 'company',
          name: normalizeText(submission?.company_name),
          registrationNumber: normalizeText(submission?.company_registration_number),
          authorisedSignatory: normalizeText(submission?.authorised_signatory_name),
          directors: Array.isArray(submission?.directors) ? submission.directors : [],
        }
      : purchaserEntityType === 'trust'
        ? {
            type: 'trust',
            name: normalizeText(submission?.trust_name),
            registrationNumber: normalizeText(submission?.trust_registration_number),
            authorisedTrustee: normalizeText(submission?.authorised_trustee_name),
            trustees: Array.isArray(submission?.trustees) ? submission.trustees : [],
          }
        : null,
    finance: {
      financeType,
      purchasePrice,
      depositAmount: money(submission?.depositAmount),
      bondAmount: money(submission?.bondAmount),
      cashContribution: money(submission?.cashContribution),
      bondAssistancePreference: normalizeText(submission?.bondAssistancePreference || submission?.bond_assistance_preference),
      bondHelpRequested: normalizeText(submission?.bond_help_requested || submission?.bondHelpRequested),
      needsBondAssistance: Boolean(submission?.needsBondAssistance),
      proofOfFundsUrl: normalizeText(submission?.proofOfFundsUrl),
    },
    compliance: {
      confirmedAccuracy: Boolean(
        submission?.confirmedAccuracy ||
          submission?.acknowledgeInfoAccuracy ||
          submission?.buyerAcknowledgements?.infoAccuracy,
      ),
    },
    otpDocumentVariant: normalizeText(
      submission?.otpDocumentVariant ||
        canonicalOffer?.conditions?.otpDocumentVariant ||
        context?.invite?.otpDocumentVariant,
    ),
    formData,
  }
}

export async function submitCanonicalBuyerOnboarding({ token = '', submission = {} } = {}) {
  const context = await getCanonicalOfferInviteContext(token)
  if (!context.ok || !context.canonicalOffer?.id) {
    throw new Error(context.reason === 'expired' ? 'Buyer onboarding link has expired.' : 'Buyer onboarding link is not valid.')
  }
  const lifecycle = getOfferLifecycleSummary(context.canonicalOffer)
  if (!lifecycle.buyerCanResubmit) {
    throw new Error(lifecycle.blockedReason || 'This buyer onboarding link can no longer be updated.')
  }
  const conditions = context.canonicalOffer.conditions || {}
  const existingOnboardingSubmitted = normalizeText(conditions.buyerOnboardingStatus).toLowerCase() === 'submitted'
  const canReplaceOnboarding = [OFFER_STATUS.CHANGES_REQUESTED, OFFER_STATUS.COUNTERED].includes(lifecycle.effectiveStatus)
  if (existingOnboardingSubmitted && !canReplaceOnboarding) {
    throw new Error('Buyer onboarding has already been submitted. Ask the agent for a new secure link if details need to change.')
  }

  const purchaserEntityType = normalizeText(submission?.purchaser_entity_type || submission?.purchaserEntityType || submission?.purchaser_type || 'individual').toLowerCase() || 'individual'
  const fullName = normalizeText(
    submission?.fullName ||
      submission?.company_name ||
      submission?.trust_name ||
      submission?.company_contact_name ||
      submission?.trust_contact_name ||
      submission?.authorised_signatory_name ||
      submission?.authorised_trustee_name,
  )
  const email = normalizeText(submission?.email || submission?.company_contact_email || submission?.trust_contact_email || submission?.authorised_signatory_email || submission?.authorised_trustee_email)
  const phone = normalizeText(submission?.phone || submission?.company_contact_phone || submission?.trust_contact_phone || submission?.authorised_signatory_phone || submission?.authorised_trustee_phone)
  const idNumber = normalizeText(submission?.idNumber || submission?.authorised_signatory_identity_number || submission?.authorised_trustee_identity_number)
  const hasEntityAuthority = purchaserEntityType === 'company'
    ? Boolean(submission?.company_name && submission?.company_registration_number && submission?.authorised_signatory_name && (submission?.directors || []).length)
    : purchaserEntityType === 'trust'
      ? Boolean(submission?.trust_name && submission?.trust_registration_number && submission?.authorised_trustee_name && (submission?.trustees || []).length)
      : true
  if (!fullName || !email || !phone || (!idNumber && purchaserEntityType === 'individual') || !hasEntityAuthority) {
    throw new Error('Buyer details are required before submitting onboarding.')
  }

  const submittedAt = new Date().toISOString()
  const buyerOnboarding = buildBuyerOnboardingSubmissionSnapshot(submission, context, submittedAt)
  const nextConditions = {
    ...conditions,
    buyerName: fullName,
    buyerEmail: email.toLowerCase(),
    buyerPhone: phone,
    buyerOnboarding,
    buyerOnboardingStatus: 'submitted',
    buyerOnboardingSubmittedAt: submittedAt,
    buyerOnboardingNextAction: 'prepare_otp_transaction',
    buyerOnboardingFormData: buyerOnboarding.formData,
    verification: submission?.verification || conditions.verification || {},
  }
  const patch = {
    conditions_json: nextConditions,
    updated_at: submittedAt,
  }

  let query = supabase
    .from('offers')
    .update(patch)
    .eq('id', context.canonicalOffer.id)
  if (context.canonicalOffer.organisationId) {
    query = query.eq('organisation_id', context.canonicalOffer.organisationId)
  }
  const { data, error } = await query.select('*').maybeSingle()
  if (error || !data) {
    throw new Error(error?.message || 'Unable to save buyer onboarding.')
  }

  if (context.canonicalOffer.organisationId && context.canonicalOffer.buyerLeadId) {
    await applyBuyerLifecycleEvent({
      organisationId: context.canonicalOffer.organisationId,
      leadId: context.canonicalOffer.buyerLeadId,
      event: BUYER_LIFECYCLE_EVENTS.ONBOARDING_STARTED,
      actor: {
        id: context.canonicalOffer.agentId,
        name: normalizeText(nextConditions.agentName),
        email: normalizeText(nextConditions.agentEmail),
      },
      offerId: context.canonicalOffer.id,
      activityNote: 'Buyer onboarding submitted. OTP transaction preparation is next.',
      extra: {
        source: 'buyer_onboarding_link',
        buyerOnboardingSubmittedAt: submittedAt,
        nextAction: 'prepare_otp_transaction',
      },
    }).catch(() => null)
  }

  return mapOfferDbRow(data)
}

export async function submitCanonicalBuyerOffer({ token = '', submission = {} } = {}) {
  assertOfferWorkflowAvailable()
  const context = await getCanonicalOfferInviteContext(token)
  if (!context.ok || !context.canonicalOffer?.id) {
    throw new Error(context.reason === 'expired' ? 'Offer link has expired.' : 'Offer link is not valid.')
  }
  const lifecycle = getOfferLifecycleSummary(context.canonicalOffer)
  if (!lifecycle.buyerCanResubmit) {
    throw new Error(lifecycle.blockedReason || 'This offer can no longer be edited from the buyer link.')
  }
  const fullName = normalizeText(submission?.fullName)
  const email = normalizeText(submission?.email)
  const phone = normalizeText(submission?.phone)
  const offerAmount = money(submission?.offerAmount)
  const normalizedFinanceType = normalizeText(submission?.financeType).toLowerCase() === 'hybrid'
    ? 'combination'
    : normalizeText(submission?.financeType) || null
  if (!fullName || !email || !phone || !offerAmount || offerAmount <= 0) {
    throw new Error('Buyer details and offer amount are required.')
  }
  const buyerSubmittedAt = new Date().toISOString()
  const conditionsJson = mergeResidentialOfferTermsIntoConditions(
    context.canonicalOffer.conditions || {},
    {
      ...submission,
      fullName,
      email,
      phone,
      offerAmount,
      financeType: normalizedFinanceType,
      otpDocumentVariant: submission?.otpDocumentVariant || context?.canonicalOffer?.conditions?.otpDocumentVariant || context?.invite?.otpDocumentVariant,
      transactionType: context?.listing?.transactionType,
      developmentId: context?.listing?.developmentId,
      buyerSubmittedAt,
    },
    {
      source: 'canonical_buyer_offer_link',
      captureMethod: 'buyer_self_service',
      capturedAt: buyerSubmittedAt,
      sourceContext: { offer: context.canonicalOffer, listing: context.listing, invite: context.invite },
    },
  )
  return updateCanonicalOfferStatus(context.canonicalOffer.id, 'submitted', {
    organisationId: context.canonicalOffer.organisationId,
    patch: {
      offer_amount: offerAmount,
      deposit_amount: money(submission?.depositAmount),
      finance_type: normalizedFinanceType,
      cash_component: money(submission?.cashContribution),
      bond_component: money(submission?.bondAmount),
      conditions_json: {
        ...conditionsJson,
        buyerSubmittedAt,
        verification: submission?.verification || {},
      },
      buyer_submitted_at: buyerSubmittedAt,
      submitted_at: buyerSubmittedAt,
    },
  })
}

function statusToEvent(status) {
  const normalized = normalizeOfferStatus(status)
  if ([OFFER_STATUS.DRAFT, OFFER_STATUS.SENT_TO_BUYER, OFFER_STATUS.BUYER_VIEWED].includes(normalized)) {
    return BUYER_LIFECYCLE_EVENTS.OFFER_CREATED
  }
  if ([
    OFFER_STATUS.SUBMITTED,
    OFFER_STATUS.AGENT_REVIEW,
    OFFER_STATUS.CHANGES_REQUESTED,
    OFFER_STATUS.SENT_TO_SELLER,
    OFFER_STATUS.SELLER_VIEWED,
  ].includes(normalized)) {
    return BUYER_LIFECYCLE_EVENTS.OFFER_SUBMITTED
  }
  if (normalized === OFFER_STATUS.COUNTERED) return BUYER_LIFECYCLE_EVENTS.OFFER_COUNTERED
  if (normalized === OFFER_STATUS.ACCEPTED) return BUYER_LIFECYCLE_EVENTS.OFFER_ACCEPTED
  if (normalized === OFFER_STATUS.CONVERTED_TO_TRANSACTION) return BUYER_LIFECYCLE_EVENTS.TRANSACTION_CREATED
  return ''
}

export async function createCanonicalOffer(payload = {}, { actor = null, waitForLifecycle = true } = {}) {
  assertOfferWorkflowAvailable()
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Offer creation requires the canonical Supabase offers table.')
  }
  const insertPayload = buildOfferInsert(payload)
  if (!insertPayload.organisation_id) {
    throw new Error('Organisation id is required before creating an offer.')
  }
  if (!insertPayload.buyer_lead_id && !insertPayload.buyer_contact_id) {
    throw new Error('A buyer lead or buyer contact is required before creating an offer.')
  }

  let activeInsertPayload = { ...insertPayload }
  let { data, error } = await supabase
    .from('offers')
    .insert(activeInsertPayload)
    .select('*')
    .single()

  if (error && isForeignKeyViolation(error, 'offers_buyer_lead_id_fkey')) {
    activeInsertPayload = { ...activeInsertPayload, buyer_lead_id: null }
    const retry = await supabase
      .from('offers')
      .insert(activeInsertPayload)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error && isForeignKeyViolation(error, 'offers_buyer_contact_id_fkey')) {
    activeInsertPayload = { ...activeInsertPayload, buyer_contact_id: null }
    const retry = await supabase
      .from('offers')
      .insert(activeInsertPayload)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error && isForeignKeyViolation(error, 'offers_buyer_lead_id_fkey')) {
    activeInsertPayload = { ...activeInsertPayload, buyer_lead_id: null }
    const retry = await supabase
      .from('offers')
      .insert(activeInsertPayload)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error

  const event = statusToEvent(activeInsertPayload.status)
  if (event && activeInsertPayload.buyer_lead_id) {
    const lifecycleUpdate = applyBuyerLifecycleEvent({
      organisationId: activeInsertPayload.organisation_id,
      leadId: activeInsertPayload.buyer_lead_id,
      event,
      offerId: data?.id,
      actor,
    }).catch(() => null)
    if (waitForLifecycle) await lifecycleUpdate
    else void lifecycleUpdate
  }

  return mapOfferDbRow(data)
}

export async function ensureAcceptedOfferConversionCandidate({ organisationId = '', offerId = '', offer = null } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Accepted-offer conversion candidates require the canonical Supabase offers table.')
  const scopedOrganisationId = toNullableUuid(organisationId || offer?.organisationId || offer?.organisation_id)
  const scopedOfferId = toNullableUuid(offerId || offer?.offerId || offer?.id)
  if (!scopedOrganisationId || !scopedOfferId) throw new Error('Accepted offer id and organisation id are required before preparing conversion.')

  // The saved offer, not a caller's possibly stale screen snapshot, owns the
  // conversion identity and agreed terms.
  const { data: offerRow, error: offerError } = await supabase
    .from('offers')
    .select('*')
    .eq('id', scopedOfferId)
    .eq('organisation_id', scopedOrganisationId)
    .maybeSingle()
  if (offerError) throw offerError
  let canonicalOffer = mapOfferDbRow(offerRow)
  if (!canonicalOffer) throw new Error('Accepted offer not found.')
  if (!['accepted', 'converted_to_transaction'].includes(normalizeOfferStatus(canonicalOffer.status))) {
    throw new Error('Only an accepted offer can prepare a transaction conversion candidate.')
  }

  const conversionCandidate = buildAcceptedOfferConversionCandidate(canonicalOffer)
  const currentCandidate = jsonObject(canonicalOffer.conditions?.conversionCandidate)
  const unchanged = currentCandidate.contract === conversionCandidate.contract &&
    currentCandidate.candidateKey === conversionCandidate.candidateKey &&
    currentCandidate.status === conversionCandidate.status &&
    JSON.stringify(currentCandidate.blockers || []) === JSON.stringify(conversionCandidate.blockers || []) &&
    Number(currentCandidate.offerAmount || 0) === Number(conversionCandidate.offerAmount || 0) &&
    normalizeText(currentCandidate.purchaserType) === normalizeText(conversionCandidate.purchaserType) &&
    normalizeText(currentCandidate.purchaserEntityType) === normalizeText(conversionCandidate.purchaserEntityType) &&
    normalizeText(currentCandidate.purchaserEntityName) === normalizeText(conversionCandidate.purchaserEntityName) &&
    normalizeText(currentCandidate.bondAssistancePreference) === normalizeText(conversionCandidate.bondAssistancePreference) &&
    normalizeText(currentCandidate.bondHelpRequested) === normalizeText(conversionCandidate.bondHelpRequested) &&
    normalizeText(currentCandidate.bondAssistanceSelection) === normalizeText(conversionCandidate.bondAssistanceSelection) &&
    normalizeText(currentCandidate.bondOriginatorName) === normalizeText(conversionCandidate.bondOriginatorName) &&
    normalizeText(currentCandidate.bondOriginatorContact) === normalizeText(conversionCandidate.bondOriginatorContact) &&
    normalizeText(currentCandidate.financeManagedBy) === normalizeText(conversionCandidate.financeManagedBy) &&
    normalizeText(currentCandidate.transactionId) === normalizeText(conversionCandidate.transactionId)
  if (unchanged) return { offer: canonicalOffer, candidate: currentCandidate, persisted: true }

  const { data, error } = await supabase
    .from('offers')
    .update({
      conditions_json: {
        ...jsonObject(canonicalOffer.conditions),
        conversionCandidate,
      },
    })
    .eq('id', scopedOfferId)
    .eq('organisation_id', scopedOrganisationId)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Accepted-offer conversion candidate could not be persisted. Refresh and try again.')
  return { offer: mapOfferDbRow(data), candidate: conversionCandidate, persisted: true }
}

export async function updateCanonicalOfferStatus(offerId, status, { organisationId = '', actor = null, patch = {} } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Offer updates require the canonical Supabase offers table.')
  }
  const scopedOfferId = toNullableUuid(offerId)
  const scopedOrganisationId = toNullableUuid(organisationId)
  const nextStatus = normalizeOfferStatus(status)
  if (!scopedOfferId || !scopedOrganisationId) return null

  const nowIso = new Date().toISOString()
  const updatePayload = {
    status: nextStatus,
    ...patch,
  }
  const statusTimestampField = OFFER_STATUS_TIMESTAMP_FIELDS[nextStatus]
  if (statusTimestampField && !updatePayload[statusTimestampField]) {
    updatePayload[statusTimestampField] = nowIso
  }
  if (nextStatus === OFFER_STATUS.SUBMITTED) {
    if (!updatePayload.submitted_at) updatePayload.submitted_at = nowIso
    if (!updatePayload.buyer_submitted_at) updatePayload.buyer_submitted_at = updatePayload.submitted_at
  }
  if (nextStatus === OFFER_STATUS.ACCEPTED && !updatePayload.accepted_at) updatePayload.accepted_at = nowIso
  if (nextStatus === OFFER_STATUS.REJECTED && !updatePayload.rejected_at) updatePayload.rejected_at = nowIso

  const { data, error } = await supabase
    .from('offers')
    .update(updatePayload)
    .eq('id', scopedOfferId)
    .eq('organisation_id', scopedOrganisationId)
    .select('*')
    .maybeSingle()

  if (error) throw error

  let mappedOffer = mapOfferDbRow(data)
  if (data && [OFFER_STATUS.ACCEPTED, OFFER_STATUS.CONVERTED_TO_TRANSACTION].includes(nextStatus)) {
    const candidateResult = await ensureAcceptedOfferConversionCandidate({
      organisationId: scopedOrganisationId,
      offerId: data.id,
      offer: mappedOffer,
    })
    mappedOffer = candidateResult.offer
  }

  const event = statusToEvent(nextStatus)
  if (event && data?.buyer_lead_id) {
    await applyBuyerLifecycleEvent({
      organisationId: scopedOrganisationId,
      leadId: data.buyer_lead_id,
      event,
      offerId: data.id,
      transactionId: data.transaction_id,
      actor,
    }).catch(() => null)
  }

  if ([OFFER_STATUS.SUBMITTED, OFFER_STATUS.ACCEPTED, OFFER_STATUS.REJECTED].includes(nextStatus) && data?.buyer_lead_id) {
    void import('../services/leadActionEngineService')
      .then(({ processOfferEvent }) => processOfferEvent({
        organisationId: scopedOrganisationId,
        leadId: data.buyer_lead_id,
        contactId: data.buyer_contact_id,
        assignedAgentId: actor?.id,
        status: nextStatus,
        offerId: data.id,
        sourceEvent: `offer_${nextStatus}:${data.id}`,
        metadata: {
          offerId: data.id,
          listingId: data.listing_id,
          transactionId: data.transaction_id,
        },
      }, { actor }))
      .catch((recommendationError) => console.warn('[buyerLifecycleService] offer recommendation skipped', recommendationError))
  }

  return mappedOffer
}

export async function reviewCanonicalOfferConditions({
  offerId = '',
  organisationId = '',
  decision = 'approve',
  revisedConditions = {},
  note = '',
  actor = null,
} = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Offer condition review requires the canonical Supabase offers table.')
  }
  const scopedOfferId = toNullableUuid(offerId)
  const scopedOrganisationId = toNullableUuid(organisationId)
  if (!scopedOfferId || !scopedOrganisationId) return null
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('id', scopedOfferId)
    .eq('organisation_id', scopedOrganisationId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Offer not found.')

  const offer = mapOfferDbRow(data)
  const patch = buildResidentialOfferConditionReviewPatch({
    offer,
    decision,
    revisedConditions,
    actor,
    note,
  })
  return updateCanonicalOfferStatus(scopedOfferId, decision === 'request_changes' ? OFFER_STATUS.CHANGES_REQUESTED : OFFER_STATUS.AGENT_REVIEW, {
    organisationId: scopedOrganisationId,
    actor,
    patch,
  })
}

export async function createOfferSellerReviewSession(payload = {}, { actor = null } = {}) {
  assertOfferWorkflowAvailable()
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Seller offer review requires Supabase.')
  }

  const scopedOrganisationId = toNullableUuid(payload?.organisationId || payload?.offer?.organisationId)
  const scopedOfferId = toNullableUuid(payload?.offerId || payload?.offer?.id || payload?.offer?.offerId)
  if (!scopedOrganisationId || !scopedOfferId) {
    throw new Error('Organisation and offer are required before sending an offer to the seller.')
  }

  const sourceListing = payload?.listing && typeof payload.listing === 'object' ? payload.listing : {}
  let offer = payload?.offer || null
  if (!offer?.id) {
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('id', scopedOfferId)
      .eq('organisation_id', scopedOrganisationId)
      .maybeSingle()
    if (error) throw error
    offer = mapOfferDbRow(data)
  }

  const reviewPreparation = buildSellerOfferReviewPreparation({
    listing: sourceListing,
    offer,
    deliveryMode: payload?.deliveryMode,
    sellerEmail: payload?.sellerEmail,
    sellerPhone: payload?.sellerPhone,
    sellerName: payload?.sellerName,
    sellerLeadId: payload?.sellerLeadId,
    sellerContactId: payload?.sellerContactId,
    expiresAt: payload?.expiresAt,
  })
  if (!reviewPreparation.ready) {
    throw new Error(reviewPreparation.blockers.join(' '))
  }

  const insertPayload = {
    organisation_id: scopedOrganisationId,
    offer_id: scopedOfferId,
    seller_lead_id: reviewPreparation.sellerLeadId,
    seller_contact_id: reviewPreparation.sellerContactId,
    listing_id: toNullableUuid(payload?.listingId || offer?.listingId),
    agent_id: toNullableUuid(payload?.agentId || offer?.agentId || actor?.id),
    token: normalizeText(payload?.token) || createSellerOfferReviewAccessToken(),
    status: 'sent',
    sent_at: normalizeDate(payload?.sentAt) || new Date().toISOString(),
    expires_at: reviewPreparation.expiresAt,
    metadata_json: {
      ...jsonObject(payload?.metadata || payload?.metadataJson),
      ...reviewPreparation.metadata,
    },
  }

  let activeInsertPayload = { ...insertPayload }
  let { data, error } = await supabase
    .from('offer_seller_review_sessions')
    .insert(activeInsertPayload)
    .select('*')
    .single()

  if (error && isForeignKeyViolation(error, 'offer_seller_review_sessions_seller_lead_id_fkey')) {
    activeInsertPayload = { ...activeInsertPayload, seller_lead_id: null }
    const retry = await supabase
      .from('offer_seller_review_sessions')
      .insert(activeInsertPayload)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error && isForeignKeyViolation(error, 'offer_seller_review_sessions_seller_contact_id_fkey')) {
    activeInsertPayload = { ...activeInsertPayload, seller_contact_id: null }
    const retry = await supabase
      .from('offer_seller_review_sessions')
      .insert(activeInsertPayload)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error

  const session = mapOfferSellerReviewSessionDbRow(data)
  const conditions = jsonObject(offer?.conditions)
  const sellerReviewRecipientEmail = normalizeText(
    reviewPreparation.sellerEmail ||
      payload?.sellerEmail ||
      payload?.sellerRecipientEmail ||
      conditions.sellerReviewRecipientEmail,
  )
  const sellerReviewRecipientName = normalizeText(
    reviewPreparation.sellerName ||
      payload?.sellerName ||
      payload?.sellerRecipientName ||
      conditions.sellerReviewRecipientName,
  )
  const nextConditions = {
    ...conditions,
    sellerReviewSessionToken: session.token,
    sellerReviewSentAt: session.sentAt,
    sellerReviewRecipientEmail,
    sellerReviewRecipientName,
    sellerReviewDeliveryMode: reviewPreparation.deliveryMode,
    sellerReviewDeliveryModeLabel: reviewPreparation.deliveryModeLabel,
    sellerReviewAuthorityStatus: reviewPreparation.authorityStatus,
    sellerReviewAuthorityBlockers: reviewPreparation.blockers,
    sellerReviewAuthorityWarnings: reviewPreparation.warnings,
    sellerEmail: sellerReviewRecipientEmail || conditions.sellerEmail || '',
    sellerName: sellerReviewRecipientName || conditions.sellerName || '',
    agentReviewNotes: normalizeText(payload?.agentReviewNotes) || conditions.agentReviewNotes || conditions.latestAgentNote || '',
  }

  const updatedOffer = await updateCanonicalOfferStatus(scopedOfferId, OFFER_STATUS.SENT_TO_SELLER, {
    organisationId: scopedOrganisationId,
    actor,
    patch: {
      seller_review_session_id: session.id,
      seller_lead_id: activeInsertPayload.seller_lead_id || offer?.sellerLeadId || null,
      seller_contact_id: activeInsertPayload.seller_contact_id || offer?.sellerContactId || null,
      conditions_json: nextConditions,
    },
  })

  await recordBuyerLeadActivity({
    organisationId: scopedOrganisationId,
    leadId: updatedOffer?.buyerLeadId || offer?.buyerLeadId,
    activityType: reviewPreparation.deliveryMode === SELLER_REVIEW_DELIVERY_MODE.EMAIL ? 'Offer Sent To Seller' : 'Offer Prepared For Seller Review',
    activityNote:
      reviewPreparation.deliveryMode === SELLER_REVIEW_DELIVERY_MODE.EMAIL
        ? 'Agent reviewed the buyer offer and sent it to the seller for review.'
        : `Agent reviewed the buyer offer and prepared it for ${reviewPreparation.deliveryModeLabel.toLowerCase()} seller review.`,
    outcome: reviewPreparation.deliveryMode === SELLER_REVIEW_DELIVERY_MODE.EMAIL ? 'Sent To Seller' : reviewPreparation.deliveryModeLabel,
    actor,
  }).catch(() => null)

  return { session, offer: updatedOffer, reviewPreparation }
}

export async function getSellerOfferReviewContext(token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken || !isSupabaseConfigured || !supabase) {
    return { ok: false, reason: 'not_found', session: null, offer: null, listing: null }
  }

  const { data, error } = await supabase.rpc('bridge_get_seller_offer_review_session', {
    p_token: normalizedToken,
  })
  if (error) {
    if (isMissingTableError(error, 'offer_seller_review_sessions')) {
      return { ok: false, reason: 'not_found', session: null, offer: null, listing: null }
    }
    throw error
  }
  return mapSellerOfferReviewPayload(data)
}

export async function submitSellerOfferDecision({ token = '', decision = '', notes = '', counterTerms = null } = {}) {
  assertOfferWorkflowAvailable()
  const normalizedToken = normalizeText(token)
  const normalizedDecision = normalizeLower(decision)
  if (!normalizedToken || !['accepted', 'rejected', 'countered'].includes(normalizedDecision) || !isSupabaseConfigured || !supabase) {
    throw new Error('A valid seller offer decision is required.')
  }
  const { data, error } = await supabase.rpc('bridge_submit_seller_offer_decision', {
    p_token: normalizedToken,
    p_decision: normalizedDecision,
    p_notes: normalizeText(notes) || null,
    p_counter_terms: counterTerms && typeof counterTerms === 'object' ? counterTerms : null,
  })
  if (error) throw error
  if (!data?.ok) {
    const reason = normalizeText(data?.reason)
    if (reason === 'already_decided') throw new Error(`This offer has already been ${normalizeText(data?.status) || 'decided'}.`)
    if (reason === 'expired') throw new Error('This seller offer review link has expired.')
    if (reason === 'invalid_decision') throw new Error('Choose accept, reject, or counter before submitting.')
    throw new Error('Unable to submit this offer decision.')
  }
  return mapSellerOfferReviewPayload(data)
}

function normalizeIdList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(toNullableUuid).filter(Boolean))]
}

function normalizePhoneKey(value) {
  return normalizeText(value).replace(/[^\d+]/g, '')
}

function normalizeNameKey(value) {
  return normalizeLower(value).replace(/\s+/g, ' ')
}

function offerMatchesLeadContext(offer = {}, context = {}) {
  const leadId = toNullableUuid(context.leadId)
  const contactId = toNullableUuid(context.contactId)
  if (leadId && offer.buyerLeadId === leadId) return true
  if (contactId && offer.buyerContactId === contactId) return true

  const appointmentIds = new Set(normalizeIdList(context.appointmentIds))
  if (offer.viewingAppointmentId && appointmentIds.has(offer.viewingAppointmentId)) return true

  const listingIds = new Set(normalizeIdList(context.listingIds))
  const hasListingContext = offer.listingId && listingIds.has(offer.listingId)
  const conditions = offer.conditions || {}
  const buyerEmail = normalizeLower(context.buyerEmail)
  const buyerPhone = normalizePhoneKey(context.buyerPhone)
  const buyerName = normalizeNameKey(context.buyerName)
  const offerEmails = [
    conditions.buyerEmail,
    conditions.email,
  ].map(normalizeLower).filter(Boolean)
  const offerPhones = [
    conditions.buyerPhone,
    conditions.phone,
  ].map(normalizePhoneKey).filter(Boolean)
  const offerNames = [
    conditions.buyerName,
    conditions.fullName,
    conditions.name,
  ].map(normalizeNameKey).filter(Boolean)

  if (hasListingContext && buyerEmail && offerEmails.includes(buyerEmail)) return true
  if (hasListingContext && buyerPhone && offerPhones.includes(buyerPhone)) return true
  if (hasListingContext && buyerName && offerNames.includes(buyerName)) return true
  return false
}

function sortOffersByLatest(left = {}, right = {}) {
  return new Date(right.updatedAt || right.submittedAt || right.createdAt || 0).getTime() -
    new Date(left.updatedAt || left.submittedAt || left.createdAt || 0).getTime()
}

export async function listCanonicalOffersForLead({
  organisationId = '',
  leadId = '',
  contactId = '',
  appointmentIds = [],
  listingIds = [],
  buyerEmail = '',
  buyerPhone = '',
  buyerName = '',
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  const scopedContactId = toNullableUuid(contactId)
  const scopedAppointmentIds = normalizeIdList(appointmentIds)
  const scopedListingIds = normalizeIdList(listingIds)
  if (!scopedOrganisationId || !isSupabaseConfigured || !supabase) return []

  const rowsById = new Map()
  const addRows = (rows = []) => {
    for (const offer of (Array.isArray(rows) ? rows : []).map(mapOfferDbRow).filter(Boolean)) {
      if (!offer?.id) continue
      if (!offerMatchesLeadContext(offer, {
        leadId: scopedLeadId,
        contactId: scopedContactId,
        appointmentIds: scopedAppointmentIds,
        listingIds: scopedListingIds,
        buyerEmail,
        buyerPhone,
        buyerName,
      })) continue
      rowsById.set(offer.id, offer)
    }
  }

  const targetedQueries = []
  if (scopedLeadId) {
    targetedQueries.push(
      supabase
        .from('offers')
        .select('*')
        .eq('organisation_id', scopedOrganisationId)
        .eq('buyer_lead_id', scopedLeadId)
        .order('updated_at', { ascending: false }),
    )
  }

  if (scopedContactId) {
    targetedQueries.push(
      supabase
        .from('offers')
        .select('*')
        .eq('organisation_id', scopedOrganisationId)
        .eq('buyer_contact_id', scopedContactId)
        .order('updated_at', { ascending: false }),
    )
  }

  if (scopedAppointmentIds.length) {
    targetedQueries.push(
      supabase
        .from('offers')
        .select('*')
        .eq('organisation_id', scopedOrganisationId)
        .in('viewing_appointment_id', scopedAppointmentIds)
        .order('updated_at', { ascending: false }),
    )
  }

  if (targetedQueries.length) {
    const targetedResults = await Promise.all(targetedQueries)
    for (const { data, error } of targetedResults) {
      if (error) throw error
      addRows(data)
    }
  }

  if (!rowsById.size && scopedListingIds.length && (buyerEmail || buyerPhone || buyerName)) {
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('organisation_id', scopedOrganisationId)
      .in('listing_id', scopedListingIds)
      .order('updated_at', { ascending: false })
    if (error) throw error
    addRows(data)
  }

  const offers = [...rowsById.values()]
  const offerIds = offers.map((offer) => toNullableUuid(offer?.id)).filter(Boolean)

  if (offerIds.length) {
    const { data, error } = await supabase
      .from('offer_seller_review_sessions')
      .select('*')
      .eq('organisation_id', scopedOrganisationId)
      .in('offer_id', offerIds)
      .order('updated_at', { ascending: false })

    if (error && !isMissingTableError(error, 'offer_seller_review_sessions')) throw error

    const latestSessionByOfferId = new Map()
    for (const session of (Array.isArray(data) ? data : []).map(mapOfferSellerReviewSessionDbRow).filter(Boolean)) {
      if (!session?.offerId || latestSessionByOfferId.has(session.offerId)) continue
      latestSessionByOfferId.set(session.offerId, session)
    }

    for (const offer of offers) {
      const session = latestSessionByOfferId.get(offer.id) || null
      if (!session) continue
      offer.sellerReviewSession = session
      offer.sellerReviewSessionId = offer.sellerReviewSessionId || session.id
    }
  }

  return offers.sort(sortOffersByLatest)
}

export async function getBuyerLeadLifecycleDiagnostic({
  organisationId = '',
  leadId = '',
  offerId = '',
  transactionId = '',
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  const scopedOfferId = toNullableUuid(offerId)
  const scopedTransactionId = toNullableUuid(transactionId)

  const emptyDiagnostic = {
    ok: false,
    lead: null,
    offer: null,
    offers: [],
    transaction: null,
    onboarding: null,
    onboardingPrefill: null,
    transactionEvents: [],
    workflowAudit: [],
    checks: {
      offerConverted: false,
      transactionLinked: false,
      leadLinked: false,
      onboardingReady: false,
      prefillReady: false,
      transactionEventLogged: false,
      workflowAuditLogged: false,
    },
    warnings: [],
  }

  if (!scopedOrganisationId || !isSupabaseConfigured || !supabase) {
    return {
      ...emptyDiagnostic,
      warnings: ['Supabase is not available for lifecycle diagnostics.'],
    }
  }

  const warnings = []
  let lead = null
  let offers = []
  let offer = null
  let transaction = null
  let onboarding = null
  let onboardingPrefill = null
  let transactionEvents = []
  let workflowAudit = []

  if (scopedLeadId) {
    const leadQuery = await supabase
      .from('leads')
      .select('lead_id, organisation_id, contact_id, converted_transaction_id, converted_at, current_stage, stage, status, updated_at')
      .eq('organisation_id', scopedOrganisationId)
      .eq('lead_id', scopedLeadId)
      .maybeSingle()
    if (leadQuery.error && !isMissingTableError(leadQuery.error, 'leads') && !isMissingColumnError(leadQuery.error)) {
      throw leadQuery.error
    }
    lead = leadQuery.data || null
  }

  if (scopedOfferId) {
    const offerQuery = await supabase
      .from('offers')
      .select('*')
      .eq('organisation_id', scopedOrganisationId)
      .eq('id', scopedOfferId)
      .maybeSingle()
    if (offerQuery.error && !isMissingTableError(offerQuery.error, 'offers')) throw offerQuery.error
    offer = mapOfferDbRow(offerQuery.data)
    offers = offer ? [offer] : []
  } else if (scopedLeadId) {
    offers = await listCanonicalOffersForLead({
      organisationId: scopedOrganisationId,
      leadId: scopedLeadId,
    })
    offer = offers.find((row) => normalizeText(row?.transactionId || row?.transaction_id)) ||
      offers.find((row) => normalizeOfferStatus(row?.status) === OFFER_STATUS.ACCEPTED) ||
      offers[0] ||
      null
  }

  const resolvedTransactionId = toNullableUuid(
    scopedTransactionId ||
      offer?.transactionId ||
      offer?.transaction_id ||
      lead?.converted_transaction_id,
  )

  if (resolvedTransactionId) {
    let transactionQuery = await supabase
      .from('transactions')
      .select('id, organisation_id, buyer_id, accepted_offer_id, originating_lead_id, originating_buyer_lead_id, buyer_contact_id, listing_id, onboarding_status, stage, current_main_stage, next_action, updated_at, created_at')
      .eq('id', resolvedTransactionId)
      .maybeSingle()

    if (transactionQuery.error && isMissingColumnError(transactionQuery.error)) {
      transactionQuery = await supabase
        .from('transactions')
        .select('id, organisation_id, buyer_id, stage, updated_at, created_at')
        .eq('id', resolvedTransactionId)
        .maybeSingle()
    }
    if (transactionQuery.error && !isMissingTableError(transactionQuery.error, 'transactions')) {
      throw transactionQuery.error
    }
    transaction = transactionQuery.data || null

    const onboardingQuery = await supabase
      .from('transaction_onboarding')
      .select('id, transaction_id, token, status, purchaser_type, is_active, submitted_at, created_at, updated_at')
      .eq('transaction_id', resolvedTransactionId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (onboardingQuery.error && !isMissingTableError(onboardingQuery.error, 'transaction_onboarding')) {
      throw onboardingQuery.error
    }
    onboarding = (onboardingQuery.data || [])[0] || null

    const prefillQuery = await supabase
      .from('onboarding_form_data')
      .select('id, transaction_id, purchaser_type, form_data, updated_at')
      .eq('transaction_id', resolvedTransactionId)
      .maybeSingle()
    if (prefillQuery.error && !isMissingTableError(prefillQuery.error, 'onboarding_form_data')) {
      throw prefillQuery.error
    }
    onboardingPrefill = prefillQuery.data || null

    const eventQuery = await supabase
      .from('transaction_events')
      .select('id, transaction_id, event_type, event_data, created_at')
      .eq('transaction_id', resolvedTransactionId)
      .order('created_at', { ascending: false })
      .limit(10)
    if (eventQuery.error && !isMissingTableError(eventQuery.error, 'transaction_events')) {
      throw eventQuery.error
    }
    transactionEvents = eventQuery.data || []

    const auditQuery = await supabase
      .from('workflow_audit_log')
      .select('id, transaction_id, offer_id, event_type, from_stage, to_stage, metadata_json, created_at')
      .eq('transaction_id', resolvedTransactionId)
      .order('created_at', { ascending: false })
      .limit(10)
    if (auditQuery.error && !isMissingTableError(auditQuery.error, 'workflow_audit_log')) {
      throw auditQuery.error
    }
    workflowAudit = auditQuery.data || []
  }

  const offerStatus = normalizeOfferStatus(offer?.status)
  const offerTransactionId = normalizeText(offer?.transactionId || offer?.transaction_id)
  const transactionRowId = normalizeText(transaction?.id || resolvedTransactionId)
  const prefill = jsonObject(onboardingPrefill?.form_data)
  const checks = {
    offerConverted: offerStatus === OFFER_STATUS.CONVERTED_TO_TRANSACTION && Boolean(offerTransactionId),
    transactionLinked: Boolean(transactionRowId),
    leadLinked: Boolean(
      scopedLeadId &&
        transactionRowId &&
        (
          normalizeText(lead?.converted_transaction_id) === transactionRowId ||
          normalizeText(transaction?.originating_buyer_lead_id) === scopedLeadId ||
          normalizeText(transaction?.originating_lead_id) === scopedLeadId
        ),
    ),
    onboardingReady: Boolean(onboarding?.token),
    prefillReady: Boolean(prefill.bridge_prefill_source === 'accepted_offer' || Object.keys(prefill).length >= 3),
    transactionEventLogged: transactionEvents.some((event) =>
      normalizeText(event?.event_type) === 'TransactionCreated' &&
      jsonObject(event?.event_data).source === 'accepted_offer_conversion',
    ),
    workflowAuditLogged: workflowAudit.some((event) => normalizeText(event?.event_type) === 'offer_converted_to_transaction'),
  }

  if (offer && !checks.offerConverted) warnings.push('Offer is not marked converted_to_transaction yet.')
  if (offer && !checks.transactionLinked) warnings.push('Offer does not have a linked transaction.')
  if (transactionRowId && !checks.leadLinked) warnings.push('Lead-to-transaction linkage is incomplete.')
  if (transactionRowId && !checks.onboardingReady) warnings.push('Buyer onboarding record is missing.')
  if (transactionRowId && !checks.prefillReady) warnings.push('Buyer onboarding prefill data is missing or incomplete.')
  if (transactionRowId && !checks.transactionEventLogged) warnings.push('Transaction event audit row is missing.')
  if (transactionRowId && !checks.workflowAuditLogged) warnings.push('Workflow audit row is missing.')

  return {
    ok: Object.values(checks).every(Boolean),
    lead,
    offer,
    offers,
    transaction,
    onboarding,
    onboardingPrefill,
    transactionEvents,
    workflowAudit,
    checks,
    warnings,
  }
}

export async function listCanonicalOffersForListing({ organisationId = '', listingId = '' } = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedListingId = toNullableUuid(listingId)
  if (!scopedOrganisationId || !scopedListingId || !isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('organisation_id', scopedOrganisationId)
    .eq('listing_id', scopedListingId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  const offers = (Array.isArray(data) ? data : []).map(mapOfferDbRow).filter(Boolean)
  const offerIds = offers.map((offer) => toNullableUuid(offer?.id)).filter(Boolean)

  if (offerIds.length) {
    const sessionsResult = await supabase
      .from('offer_seller_review_sessions')
      .select('*')
      .eq('organisation_id', scopedOrganisationId)
      .in('offer_id', offerIds)
      .order('updated_at', { ascending: false })

    if (sessionsResult.error && !isMissingTableError(sessionsResult.error, 'offer_seller_review_sessions')) throw sessionsResult.error

    const latestSessionByOfferId = new Map()
    for (const session of (Array.isArray(sessionsResult.data) ? sessionsResult.data : []).map(mapOfferSellerReviewSessionDbRow).filter(Boolean)) {
      if (!session?.offerId || latestSessionByOfferId.has(session.offerId)) continue
      latestSessionByOfferId.set(session.offerId, session)
    }

    for (const offer of offers) {
      const session = latestSessionByOfferId.get(offer.id) || null
      if (!session) continue
      offer.sellerReviewSession = session
      offer.sellerReviewSessionId = offer.sellerReviewSessionId || session.id
    }
  }

  return offers
}

export async function listAppointmentViewedListings({
  organisationId = '',
  appointmentId = '',
  leadId = '',
  listingId = '',
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  if (!scopedOrganisationId || !isSupabaseConfigured || !supabase) return []

  let query = supabase
    .from('appointment_viewed_listings')
    .select('*')
    .eq('organisation_id', scopedOrganisationId)
    .order('viewed_at', { ascending: false })
    .order('updated_at', { ascending: false })

  const scopedAppointmentId = toNullableUuid(appointmentId)
  const scopedLeadId = toNullableUuid(leadId)
  const scopedListingId = toNullableUuid(listingId)
  if (scopedAppointmentId) query = query.eq('appointment_id', scopedAppointmentId)
  if (scopedLeadId) query = query.eq('lead_id', scopedLeadId)
  if (scopedListingId) query = query.eq('listing_id', scopedListingId)

  const { data, error } = await query
  if (error) {
    if (isMissingTableError(error, 'appointment_viewed_listings')) return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map(mapAppointmentViewedListingDbRow).filter(Boolean)
}

export async function upsertAppointmentViewedListings({
  organisationId = '',
  appointmentId = '',
  leadId = '',
  agentId = '',
  viewedListings = [],
  replaceExisting = false,
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedAppointmentId = toNullableUuid(appointmentId)
  if (!scopedOrganisationId || !scopedAppointmentId || !isSupabaseConfigured || !supabase) return []

  const rows = (Array.isArray(viewedListings) ? viewedListings : [])
    .map((item) => {
      const source = typeof item === 'string' ? { listingId: item } : (item || {})
      return buildAppointmentViewedListingUpsert({
        ...source,
        organisationId: scopedOrganisationId,
        appointmentId: scopedAppointmentId,
        leadId: source.leadId || leadId,
        agentId: source.agentId || agentId,
      })
    })
    .filter((row) => row.organisation_id && row.appointment_id && row.listing_id)

  if (!rows.length) return []

  if (replaceExisting) {
    const listingIds = rows.map((row) => row.listing_id).filter(Boolean)
    let deleteQuery = supabase
      .from('appointment_viewed_listings')
      .delete()
      .eq('organisation_id', scopedOrganisationId)
      .eq('appointment_id', scopedAppointmentId)
    if (listingIds.length) {
      deleteQuery = deleteQuery.not('listing_id', 'in', `(${listingIds.join(',')})`)
    }
    const deleteResult = await deleteQuery
    if (deleteResult.error && !isMissingTableError(deleteResult.error, 'appointment_viewed_listings')) {
      throw deleteResult.error
    }
  }

  const { data, error } = await supabase
    .from('appointment_viewed_listings')
    .upsert(rows, { onConflict: 'organisation_id,appointment_id,listing_id' })
    .select('*')

  if (error) {
    if (isMissingTableError(error, 'appointment_viewed_listings')) return []
    if (isForeignKeyViolation(error, 'appointment_viewed_listings_lead_id_fkey')) {
      const fallbackRows = rows.map((row) => ({ ...row, lead_id: null }))
      const retry = await supabase
        .from('appointment_viewed_listings')
        .upsert(fallbackRows, { onConflict: 'organisation_id,appointment_id,listing_id' })
        .select('*')

      if (retry.error) {
        if (isMissingTableError(retry.error, 'appointment_viewed_listings')) return []
        throw retry.error
      }
      return (Array.isArray(retry.data) ? retry.data : []).map(mapAppointmentViewedListingDbRow).filter(Boolean)
    }
    throw error
  }
  return (Array.isArray(data) ? data : []).map(mapAppointmentViewedListingDbRow).filter(Boolean)
}

export async function createOfferPortalSession(payload = {}, { actor = null } = {}) {
  assertOfferWorkflowAvailable()
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Offer portal sessions require Supabase.')
  }

  const insertPayload = {
    organisation_id: toNullableUuid(payload?.organisationId),
    buyer_lead_id: toNullableUuid(payload?.buyerLeadId),
    buyer_contact_id: toNullableUuid(payload?.buyerContactId),
    appointment_id: toNullableUuid(payload?.appointmentId),
    agent_id: toNullableUuid(payload?.agentId || actor?.id),
    token: normalizeText(payload?.token) || createOfferPortalAccessToken(),
    status: normalizeText(payload?.status) || 'sent',
    expires_at: normalizeDate(payload?.expiresAt),
    sent_at: normalizeDate(payload?.sentAt) || new Date().toISOString(),
    metadata_json: jsonObject(payload?.metadata || payload?.metadataJson),
  }

  if (!insertPayload.organisation_id) {
    throw new Error('Organisation id is required before creating an offer portal link.')
  }
  if (!insertPayload.appointment_id) {
    throw new Error('A viewing appointment is required before creating an offer portal link.')
  }
  if (!insertPayload.buyer_lead_id && !insertPayload.buyer_contact_id) {
    throw new Error('A buyer lead or buyer contact is required before creating an offer portal link.')
  }

  let activeInsertPayload = { ...insertPayload }
  let { data, error } = await supabase
    .from('offer_portal_sessions')
    .insert(activeInsertPayload)
    .select('*')
    .single()

  if (error && isForeignKeyViolation(error, 'offer_portal_sessions_buyer_lead_id_fkey')) {
    activeInsertPayload = { ...activeInsertPayload, buyer_lead_id: null }
    const retry = await supabase
      .from('offer_portal_sessions')
      .insert(activeInsertPayload)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error && isForeignKeyViolation(error, 'offer_portal_sessions_buyer_contact_id_fkey')) {
    activeInsertPayload = { ...activeInsertPayload, buyer_contact_id: null }
    const retry = await supabase
      .from('offer_portal_sessions')
      .insert(activeInsertPayload)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error && isForeignKeyViolation(error, 'offer_portal_sessions_buyer_lead_id_fkey')) {
    activeInsertPayload = { ...activeInsertPayload, buyer_lead_id: null }
    const retry = await supabase
      .from('offer_portal_sessions')
      .insert(activeInsertPayload)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error

  if (activeInsertPayload.buyer_lead_id) {
    await applyBuyerLifecycleEvent({
      organisationId: activeInsertPayload.organisation_id,
      leadId: activeInsertPayload.buyer_lead_id,
      event: BUYER_LIFECYCLE_EVENTS.OFFER_CREATED,
      actor,
      activityNote: 'Post-viewing offer portal link created.',
    }).catch(() => null)
  }

  return mapOfferPortalSessionDbRow(data)
}

export async function listOfferPortalSessions({
  organisationId = '',
  leadId = '',
  contactId = '',
  appointmentIds = [],
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  if (!scopedOrganisationId || !isSupabaseConfigured || !supabase) return []

  let query = supabase
    .from('offer_portal_sessions')
    .select('*')
    .eq('organisation_id', scopedOrganisationId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })

  const scopedLeadId = toNullableUuid(leadId)
  const scopedContactId = toNullableUuid(contactId)
  const scopedAppointmentIds = (Array.isArray(appointmentIds) ? appointmentIds : [])
    .map(toNullableUuid)
    .filter(Boolean)

  if (scopedLeadId) query = query.eq('buyer_lead_id', scopedLeadId)
  if (scopedContactId) query = query.eq('buyer_contact_id', scopedContactId)
  if (scopedAppointmentIds.length) query = query.in('appointment_id', scopedAppointmentIds)

  const { data, error } = await query
  if (error) {
    if (isMissingTableError(error, 'offer_portal_sessions')) return []
    throw error
  }

  return (Array.isArray(data) ? data : []).map(mapOfferPortalSessionDbRow).filter(Boolean)
}

export async function getOfferPortalSessionContext(token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken || !isSupabaseConfigured || !supabase) {
    return { ok: false, reason: 'not_found', session: null, properties: [], source: 'offer_portal_session' }
  }
  const { data, error } = await supabase.rpc('bridge_get_offer_portal_session', {
    p_token: normalizedToken,
  })
  if (error) {
    if (isMissingTableError(error, 'offer_portal_sessions')) {
      return { ok: false, reason: 'not_found', session: null, properties: [], source: 'offer_portal_session' }
    }
    throw error
  }
  return mapOfferPortalContextPayload(data)
}

export async function submitOfferPortalOffer({ token = '', listingId = '', submission = {} } = {}) {
  const normalizedToken = normalizeText(token)
  const scopedListingId = toNullableUuid(listingId)
  if (!normalizedToken || !scopedListingId || !isSupabaseConfigured || !supabase) {
    throw new Error('Offer portal link and selected property are required.')
  }
  const { data, error } = await supabase.rpc('bridge_submit_offer_portal_offer', {
    p_token: normalizedToken,
    p_listing_id: scopedListingId,
    p_submission: jsonObject(submission),
  })
  if (error) throw error
  if (!data?.ok) {
    const reason = normalizeText(data?.reason)
    if (reason === 'expired') throw new Error('This offer portal link has expired. Ask the agent to send a new link.')
    if (reason === 'listing_not_in_session') throw new Error('This property is not part of the viewing session.')
    if (reason === 'offer_amount_required') throw new Error('Add an offer amount before submitting.')
    if (reason === 'buyer_details_required') throw new Error('Buyer name, email, and phone are required.')
    if (reason === 'deposit_terms_required') throw new Error('Deposit amount and deposit due date are required.')
    if (reason === 'occupation_terms_required') throw new Error('Occupation date and rent terms must be completed.')
    if (reason === 'expiry_terms_required') throw new Error('Offer expiry date and time are required.')
    if (reason === 'finance_terms_required') throw new Error('Finance terms are incomplete for this offer.')
    if (reason === 'proof_of_funds_required') throw new Error('Proof of funds or a finance reference is required.')
    if (reason === 'subject_sale_details_required') throw new Error('Subject-to-sale offers need the linked property and sale timeline.')
    if (reason === 'purchaser_structure_required') throw new Error('Company and trust offers require the entity name.')
    throw new Error('Unable to submit this offer right now.')
  }
  return data
}

async function markAcceptedOfferListingUnderOffer({ offer = null, listing = null } = {}) {
  const listingId = toNullableUuid(
    listing?.id ||
    listing?.listingId ||
    offer?.listingId ||
    offer?.listing_id,
  )
  if (!listingId) return null
  return updatePrivateListing(listingId, { listingStatus: 'under_offer' }, { includeRequirementsAndDocuments: false })
}

async function finalizeAcceptedOfferTransactionLinkage({
  organisationId = '',
  offerId = '',
  offer = null,
  listing = null,
  transactionId = '',
  actor = null,
  payload = {},
  activityNote = '',
} = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId || offer?.organisationId)
  const scopedOfferId = toNullableUuid(offerId || offer?.offerId || offer?.id)
  const scopedTransactionId = toNullableUuid(transactionId)
  if (!scopedOrganisationId || !scopedOfferId || !scopedTransactionId || !offer) return null

  await upsertAcceptedOfferOnboardingPrefill({
    transactionId: scopedTransactionId,
    offer,
    payload,
  }).catch(() => null)

  await markAcceptedOfferListingUnderOffer({ offer, listing }).catch(() => null)

  const linkedOfferTransactionId = toNullableUuid(offer?.transactionId || offer?.transaction_id)
  const offerStatus = normalizeOfferStatus(offer?.status)
  if (offerStatus !== 'converted_to_transaction' || linkedOfferTransactionId !== scopedTransactionId) {
    await updateCanonicalOfferStatus(scopedOfferId, 'converted_to_transaction', {
      organisationId: scopedOrganisationId,
      actor,
      patch: { transaction_id: scopedTransactionId },
    })
  }

  if (offer?.buyerLeadId && activityNote) {
    await recordBuyerLeadActivity({
      organisationId: scopedOrganisationId,
      leadId: offer.buyerLeadId,
      activityType: 'Transaction Reused',
      activityNote,
      outcome: 'Transaction Linked',
      actor,
    }).catch(() => null)
  }

  return { transactionId: scopedTransactionId }
}

function assertAcceptedOfferTransactionSources(transaction, offer, listingId) {
  const offerId = toNullableUuid(offer?.offerId || offer?.id)
  if (!transaction ||
    toNullableUuid(transaction.accepted_offer_id) !== offerId ||
    toNullableUuid(transaction.listing_id) !== listingId ||
    toNullableUuid(transaction.originating_buyer_lead_id) !== toNullableUuid(offer?.buyerLeadId) ||
    toNullableUuid(transaction.buyer_contact_id) !== toNullableUuid(offer?.buyerContactId) ||
    (offer?.sellerContactId && toNullableUuid(transaction.seller_contact_id) !== toNullableUuid(offer.sellerContactId))) {
    const error = new Error('The existing transaction has conflicting offer, listing, or party source links.')
    error.code = 'ACCEPTED_OFFER_SOURCE_CONFLICT'
    throw error
  }
}

export async function createTransactionFromAcceptedCanonicalOffer({
  organisationId = '',
  offerId = '',
  offer = null,
  lead = null,
  listing = null,
  actor = null,
  payload = {},
} = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Transaction conversion requires the canonical Supabase offer and transaction tables.')
  }
  const scopedOrganisationId = toNullableUuid(organisationId || offer?.organisationId)
  const scopedOfferId = toNullableUuid(offerId || offer?.offerId || offer?.id)
  if (!scopedOrganisationId || !scopedOfferId) {
    throw new Error('Accepted offer id and organisation id are required before creating a transaction.')
  }

  let canonicalOffer = offer
  if (!canonicalOffer) {
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('id', scopedOfferId)
      .eq('organisation_id', scopedOrganisationId)
      .maybeSingle()
    if (error) throw error
    canonicalOffer = mapOfferDbRow(data)
  }

  if (!canonicalOffer) {
    throw new Error('Accepted offer not found.')
  }
  if ((offer?.id || offer?.offerId) && toNullableUuid(offer.id || offer.offerId) !== scopedOfferId) {
    const error = new Error('The requested offer conflicts with the provided offer snapshot.')
    error.code = 'ACCEPTED_OFFER_SOURCE_CONFLICT'
    throw error
  }
  const offerListingId = toNullableUuid(canonicalOffer.listingId)
  if (!offerListingId) throw new Error('The accepted offer has no saved listing source.')
  const requestedListingId = toNullableUuid(payload?.listingId || listing?.id)
  if (requestedListingId && requestedListingId !== offerListingId) {
    const error = new Error('The requested listing conflicts with the saved accepted offer.')
    error.code = 'ACCEPTED_OFFER_SOURCE_CONFLICT'
    throw error
  }
  const offerBuyerLeadId = toNullableUuid(canonicalOffer.buyerLeadId)
  const requestedBuyerLeadId = toNullableUuid(payload?.originatingBuyerLeadId || payload?.originatingLeadId || lead?.leadId)
  if (requestedBuyerLeadId && requestedBuyerLeadId !== offerBuyerLeadId) {
    const error = new Error('The buyer lead conflicts with the saved accepted offer.')
    error.code = 'ACCEPTED_OFFER_SOURCE_CONFLICT'
    throw error
  }
  const requestedBuyerContactId = toNullableUuid(payload?.buyerContactId || lead?.contactId)
  if (requestedBuyerContactId && requestedBuyerContactId !== toNullableUuid(canonicalOffer.buyerContactId)) {
    const error = new Error('The buyer contact conflicts with the saved accepted offer.')
    error.code = 'ACCEPTED_OFFER_SOURCE_CONFLICT'
    throw error
  }
  const requestedSellerContactId = toNullableUuid(payload?.sellerContactId)
  const canonicalOfferStatus = normalizeOfferStatus(canonicalOffer.status)
  const linkedTransactionId = toNullableUuid(canonicalOffer.transactionId || canonicalOffer.transaction_id)

  if (linkedTransactionId) {
    const linkedTransactionIdentity = await findTransactionIdentityById({
      organisationId: scopedOrganisationId,
      transactionId: linkedTransactionId,
    })
    assertAcceptedOfferTransactionSources(linkedTransactionIdentity, canonicalOffer, offerListingId)
    await finalizeAcceptedOfferTransactionLinkage({
      organisationId: scopedOrganisationId,
      offerId: scopedOfferId,
      offer: canonicalOffer,
      listing: null,
      transactionId: linkedTransactionId,
      actor,
      payload,
      activityNote: 'Existing transaction reused for this accepted buyer offer.',
    })

    const reusedResult = {
      transactionId: linkedTransactionId,
      existing: true,
      alreadyConverted: true,
      persisted: true,
      transactionRow: {
        transaction: linkedTransactionIdentity || {
          id: linkedTransactionId,
          organisation_id: scopedOrganisationId,
        },
      },
      warning: 'existing_offer_transaction_reused',
    }
    const conversionReceipt = assertMvpAcceptedOfferConversionReceipt({
      candidate: { status: 'converted', acceptedOfferId: scopedOfferId },
      result: reusedResult,
      acceptedOfferId: scopedOfferId,
    })

    return attachLegalHandoff({ ...reusedResult, conversionReceipt }, linkedTransactionId)
  }

  const existingAcceptedOfferTransaction = await findExistingTransactionForAcceptedOffer({
    organisationId: scopedOrganisationId,
    acceptedOfferId: scopedOfferId,
  })

  if (existingAcceptedOfferTransaction?.id) {
    const reusedTransactionId = toNullableUuid(existingAcceptedOfferTransaction.id)
    assertAcceptedOfferTransactionSources(existingAcceptedOfferTransaction, canonicalOffer, offerListingId)
    await finalizeAcceptedOfferTransactionLinkage({
      organisationId: scopedOrganisationId,
      offerId: scopedOfferId,
      offer: canonicalOffer,
      listing: null,
      transactionId: reusedTransactionId,
      actor,
      payload,
      activityNote: 'Existing transaction reused from the accepted-offer conversion record.',
    })

    const reusedResult = {
      transactionId: reusedTransactionId,
      existing: true,
      alreadyConverted: canonicalOfferStatus === 'converted_to_transaction',
      persisted: true,
      transactionRow: {
        transaction: existingAcceptedOfferTransaction,
      },
      warning: 'existing_offer_transaction_reused',
    }
    const conversionReceipt = assertMvpAcceptedOfferConversionReceipt({
      candidate: { status: 'converted', acceptedOfferId: scopedOfferId },
      result: reusedResult,
      acceptedOfferId: scopedOfferId,
    })

    return attachLegalHandoff({ ...reusedResult, conversionReceipt }, reusedTransactionId)
  }

  const wetInkExecution = await supabase.rpc('bridge_assert_wet_ink_offer_transaction_ready', {
    p_organisation_id: scopedOrganisationId,
    p_offer_id: scopedOfferId,
  })
  if (wetInkExecution.error) throw wetInkExecution.error
  if (wetInkExecution.data?.executionReady !== true) {
    throw new Error('A reviewed, fully executed wet-ink OTP is required before creating a transaction.')
  }

  if (canonicalOfferStatus !== 'accepted') {
    throw new Error('The reviewed wet-ink OTP must mark this offer accepted before it can create a transaction.')
  }

  const candidateResult = await ensureAcceptedOfferConversionCandidate({
    organisationId: scopedOrganisationId,
    offerId: scopedOfferId,
    offer: canonicalOffer,
  })
  canonicalOffer = candidateResult.offer
  if (candidateResult.candidate?.status !== 'ready') {
    const error = new Error('The accepted offer needs attention before a transaction can be created.')
    error.code = 'ACCEPTED_OFFER_CONVERSION_CANDIDATE_BLOCKED'
    error.details = candidateResult.candidate
    throw error
  }

  const listingQuery = await supabase
    .from('private_listings')
    .select('*')
    .eq('id', offerListingId)
    .eq('organisation_id', scopedOrganisationId)
    .maybeSingle()
  if (listingQuery.error) throw listingQuery.error
  if (!listingQuery.data) throw new Error('The accepted offer listing is not available in this organisation.')
  const canonicalListing = {
    ...listingQuery.data,
    listingTitle: listingQuery.data.title,
    propertyAddress: listingQuery.data.address_line_1,
    askingPrice: listingQuery.data.asking_price,
  }
  const onboardingQuery = await supabase
    .from('private_listing_seller_onboarding')
    .select('id, private_listing_id, form_data, seller_type, status')
    .eq('private_listing_id', offerListingId)
    .maybeSingle()
  if (onboardingQuery.error && !isMissingTableError(onboardingQuery.error, 'private_listing_seller_onboarding')) {
    throw onboardingQuery.error
  }
  if (onboardingQuery.data) {
    canonicalListing.sellerOnboarding = {
      id: onboardingQuery.data.id,
      formData: onboardingQuery.data.form_data || {},
      sellerType: onboardingQuery.data.seller_type,
      status: onboardingQuery.data.status,
    }
  }
  const offerSellerLeadId = toNullableUuid(canonicalOffer.sellerLeadId)
  const listingSellerLeadId = toNullableUuid(canonicalListing.seller_lead_id)
  if (offerSellerLeadId && listingSellerLeadId && offerSellerLeadId !== listingSellerLeadId) {
    const error = new Error('The saved offer and listing link different seller leads.')
    error.code = 'ACCEPTED_OFFER_SOURCE_CONFLICT'
    throw error
  }
  const offerSellerContactId = toNullableUuid(canonicalOffer.sellerContactId)
  const listingSellerContactId = toNullableUuid(canonicalListing.seller_contact_id)
  if (offerSellerContactId && listingSellerContactId && offerSellerContactId !== listingSellerContactId) {
    const error = new Error('The saved offer and listing link different seller contacts.')
    error.code = 'ACCEPTED_OFFER_SOURCE_CONFLICT'
    throw error
  }
  if (requestedSellerContactId && requestedSellerContactId !== (offerSellerContactId || listingSellerContactId)) {
    const error = new Error('The seller contact conflicts with the saved offer and listing.')
    error.code = 'ACCEPTED_OFFER_SOURCE_CONFLICT'
    throw error
  }
  const requestedSellerLeadId = toNullableUuid(payload?.originatingSellerLeadId)
  if (requestedSellerLeadId && requestedSellerLeadId !== (listingSellerLeadId || offerSellerLeadId)) {
    const error = new Error('The seller lead conflicts with the saved listing and offer.')
    error.code = 'ACCEPTED_OFFER_SOURCE_CONFLICT'
    throw error
  }

  let buyerSource = null
  if (offerBuyerLeadId) {
    const buyerLeadQuery = await supabase
      .from('leads')
      .select('*')
      .eq('lead_id', offerBuyerLeadId)
      .eq('organisation_id', scopedOrganisationId)
      .maybeSingle()
    if (buyerLeadQuery.error) throw buyerLeadQuery.error
    if (!buyerLeadQuery.data) throw new Error('The accepted offer buyer lead is not available in this organisation.')
    buyerSource = buyerLeadQuery.data
  } else if (canonicalOffer.buyerContactId) {
    const buyerContactQuery = await supabase
      .from('contacts')
      .select('*')
      .eq('contact_id', canonicalOffer.buyerContactId)
      .eq('organisation_id', scopedOrganisationId)
      .maybeSingle()
    if (buyerContactQuery.error) throw buyerContactQuery.error
    if (!buyerContactQuery.data) throw new Error('The accepted offer buyer contact is not available in this organisation.')
    buyerSource = buyerContactQuery.data
  }
  const buyerLead = {
    leadId: offerBuyerLeadId || null,
    contactId: toNullableUuid(canonicalOffer.buyerContactId),
    firstName: buyerSource?.first_name || '',
    lastName: buyerSource?.last_name || '',
    contactName: buyerSource?.name || buyerSource?.full_name || '',
    email: buyerSource?.email || '',
    phone: buyerSource?.phone || buyerSource?.mobile || '',
    assignedAgentId: canonicalOffer.agentId || actor?.id,
    assignedAgentName: actor?.name || '',
    assignedAgentEmail: actor?.email || '',
    budget: canonicalOffer.offerAmount,
  }

  const continuityFacts = buildAcceptedOfferContinuityFacts(canonicalOffer, payload)
  const conversionPayload = {
    ...payload,
    organisationId: scopedOrganisationId,
    creationMode: payload?.creationMode || payload?.creation_mode || 'onboarding_capture',
    allowIncompleteRoutingFacts: true,
    originatingBuyerLeadId: canonicalOffer.buyerLeadId,
    originatingLeadId: canonicalOffer.buyerLeadId,
    buyerContactId: canonicalOffer.buyerContactId,
    buyerName: normalizeText([buyerLead.firstName, buyerLead.lastName].filter(Boolean).join(' ')) || buyerLead.contactName || payload?.buyerName,
    buyerEmail: buyerLead.email || payload?.buyerEmail,
    buyerPhone: buyerLead.phone || payload?.buyerPhone,
    originatingSellerLeadId: listingSellerLeadId || offerSellerLeadId || null,
    sellerContactId: offerSellerContactId || listingSellerContactId || null,
    sellerName: resolveListingSellerName(canonicalListing) || payload?.sellerName,
    sellerEmail: resolveListingSellerEmail(canonicalListing) || payload?.sellerEmail,
    listingId: offerListingId,
    acceptedOfferId: canonicalOffer.offerId || canonicalOffer.id,
    purchasePrice: canonicalOffer.offerAmount || payload?.purchasePrice,
    dealValue: canonicalOffer.offerAmount || payload?.dealValue,
    depositAmount: canonicalOffer.depositAmount || payload?.depositAmount,
    cashAmount: canonicalOffer.cashComponent || payload?.cashAmount,
    bondAmount: canonicalOffer.bondComponent || payload?.bondAmount,
    financeType: continuityFacts.financeType || payload?.financeType,
    purchaserType: continuityFacts.purchaserType || 'individual',
    purchaser_type: continuityFacts.purchaserType || 'individual',
    purchaserEntityType: continuityFacts.purchaserEntityType || continuityFacts.purchaserType || 'individual',
    purchaser_entity_type: continuityFacts.purchaserEntityType || continuityFacts.purchaserType || 'individual',
    buyerEntityType: continuityFacts.purchaserEntityType || continuityFacts.purchaserType || 'individual',
    buyer_entity_type: continuityFacts.purchaserEntityType || continuityFacts.purchaserType || 'individual',
    purchaserEntityName: continuityFacts.purchaserEntityName || payload?.purchaserEntityName,
    purchaser_entity_name: continuityFacts.purchaserEntityName || payload?.purchaser_entity_name,
    bondAssistancePreference: continuityFacts.bondAssistancePreference || payload?.bondAssistancePreference,
    bond_assistance_preference: continuityFacts.bondAssistancePreference || payload?.bond_assistance_preference,
    bondHelpRequested: continuityFacts.bondHelpRequested || payload?.bondHelpRequested,
    bond_help_requested: continuityFacts.bondHelpRequested || payload?.bond_help_requested,
    ooba_assist_requested: continuityFacts.bondHelpRequested || payload?.ooba_assist_requested,
    bondAssistanceSelection: continuityFacts.bondAssistanceSelection || payload?.bondAssistanceSelection,
    bond_assistance_selection: continuityFacts.bondAssistanceSelection || payload?.bond_assistance_selection,
    bondOriginatorName: continuityFacts.bondOriginatorName || payload?.bondOriginatorName,
    bond_originator_name: continuityFacts.bondOriginatorName || payload?.bond_originator_name,
    bondOriginatorContact: continuityFacts.bondOriginatorContact || payload?.bondOriginatorContact,
    bond_originator_contact: continuityFacts.bondOriginatorContact || payload?.bond_originator_contact,
    financeManagedBy: continuityFacts.financeManagedBy || payload?.financeManagedBy,
    finance_managed_by: continuityFacts.financeManagedBy || payload?.finance_managed_by,
    sellerEntityType: canonicalListing?.sellerType || canonicalListing?.seller_type || canonicalListing?.seller?.sellerType || canonicalListing?.seller?.type || payload?.sellerEntityType || payload?.sellerType,
    sellerHasExistingBond: canonicalListing?.sellerHasExistingBond ?? canonicalListing?.seller_has_existing_bond ?? canonicalListing?.existing_bond ?? canonicalListing?.seller?.hasExistingBond ?? payload?.sellerHasExistingBond,
    cancellationRequired: canonicalListing?.cancellationRequired ?? canonicalListing?.cancellation_required ?? payload?.cancellationRequired,
    propertyTenure: canonicalListing?.propertyTenure || canonicalListing?.property_tenure || canonicalListing?.propertyStructureType || canonicalListing?.property_structure_type || payload?.propertyTenure,
    vatTreatment: canonicalListing?.vatTreatment || canonicalListing?.vat_treatment || canonicalListing?.sellerOnboarding?.formData?.vatTreatment || payload?.vatTreatment,
    assignedAgentId: canonicalOffer.agentId || payload?.assignedAgentId || actor?.id,
    assignedAgentName: payload?.assignedAgentName || actor?.name,
    assignedAgentEmail: payload?.assignedAgentEmail || actor?.email,
    stage: payload?.stage || 'Buyer Onboarding Pending',
    clientIntakePreference:
      payload?.clientIntakePreference ||
      payload?.deliveryMode ||
      canonicalOffer.conditions?.clientIntakePreference ||
      canonicalOffer.conditions?.deliveryMode,
  }
  conversionPayload.routingProfile = resolveTransactionRoutingProfile({
    transaction: conversionPayload,
    listing: canonicalListing,
    offer: canonicalOffer,
    buyerLead,
    sellerOnboarding: canonicalListing?.sellerOnboarding,
  })

  const created = await createTransactionFromLeadOverride({
    lead: buyerLead,
    listing: canonicalListing,
    actor,
    payload: conversionPayload,
  })

  const transactionId = normalizeText(created?.transactionId || created?.transactionRow?.transaction?.id)
  if (!transactionId) {
    const error = new Error('Arch9 could not confirm that the transaction was persisted. No further conversion steps were started.')
    error.code = 'ACCEPTED_OFFER_TRANSACTION_CREATE_UNCONFIRMED'
    error.details = { acceptedOfferId: scopedOfferId, conversionCandidate: candidateResult.candidate }
    throw error
  }
  const conversionReceipt = assertMvpAcceptedOfferConversionReceipt({
    candidate: candidateResult.candidate,
    result: created,
    acceptedOfferId: scopedOfferId,
  })
  await finalizeAcceptedOfferTransactionLinkage({
    organisationId: scopedOrganisationId,
    offerId: scopedOfferId,
    offer: canonicalOffer,
    listing: canonicalListing,
    transactionId,
    actor,
    payload,
  })

  return attachLegalHandoff({ ...created, conversionReceipt }, transactionId)
}

export async function upsertAcceptedOfferOnboardingPrefill({ transactionId = '', offer = null, payload = {} } = {}) {
  const scopedTransactionId = toNullableUuid(transactionId)
  if (!scopedTransactionId || !offer || !isSupabaseConfigured || !supabase) return null

  const prefill = buildAcceptedOfferOnboardingPrefill(offer, payload)
  if (!Object.keys(prefill).length) return null

  const existingQuery = await supabase
    .from('onboarding_form_data')
    .select('id, form_data, purchaser_type')
    .eq('transaction_id', scopedTransactionId)
    .maybeSingle()

  if (existingQuery.error && !isMissingTableError(existingQuery.error, 'onboarding_form_data')) {
    throw existingQuery.error
  }
  if (existingQuery.error && isMissingTableError(existingQuery.error, 'onboarding_form_data')) {
    return null
  }

  const existingFormData = jsonObject(existingQuery.data?.form_data)
  const mergedFormData = mergeExistingOnboardingValues(prefill, existingFormData)
  const purchaserType = normalizePurchaserType(existingFormData.purchaser_type || prefill.purchaser_type)

  const { data, error } = await supabase
    .from('onboarding_form_data')
    .upsert({
      transaction_id: scopedTransactionId,
      purchaser_type: purchaserType,
      form_data: mergedFormData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'transaction_id' })
    .select('id, transaction_id, purchaser_type, form_data, updated_at')
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'onboarding_form_data')) return null
    throw error
  }

  return data
}
