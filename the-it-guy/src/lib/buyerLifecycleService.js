import { isSupabaseConfigured, supabase } from './supabaseClient'
import { createTransactionFromLeadOverride } from './transactionLifecycleService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const BUYER_LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Viewing Scheduled',
  'Viewing Completed',
  'Offer Draft',
  'Offer Submitted',
  'Negotiating',
  'Offer Accepted',
  'Onboarding',
  'Finance',
  'Transfer',
  'Registered',
  'Lost',
]

export const OFFER_STATUS = {
  DRAFT: 'draft',
  SENT_TO_BUYER: 'sent_to_buyer',
  BUYER_VIEWED: 'buyer_viewed',
  SUBMITTED: 'submitted',
  AGENT_REVIEW: 'agent_review',
  CHANGES_REQUESTED: 'changes_requested',
  SENT_TO_SELLER: 'sent_to_seller',
  SELLER_VIEWED: 'seller_viewed',
  COUNTERED: 'countered',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
  CONVERTED_TO_TRANSACTION: 'converted_to_transaction',
}

export const OFFER_STATUSES = Object.values(OFFER_STATUS)

const OFFER_STATUS_ALIASES = {
  pending: OFFER_STATUS.SUBMITTED,
  under_review: OFFER_STATUS.AGENT_REVIEW,
  review: OFFER_STATUS.AGENT_REVIEW,
  agent_review: OFFER_STATUS.AGENT_REVIEW,
  seller_review: OFFER_STATUS.SENT_TO_SELLER,
  awaiting_seller_review: OFFER_STATUS.SENT_TO_SELLER,
  buyer_review_counter: OFFER_STATUS.COUNTERED,
  negotiation: OFFER_STATUS.COUNTERED,
  approved: OFFER_STATUS.ACCEPTED,
  declined: OFFER_STATUS.REJECTED,
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

export const BUYER_LIFECYCLE_EVENTS = {
  VIEWING_CREATED: 'viewing_created',
  VIEWING_COMPLETED: 'viewing_completed',
  OFFER_CREATED: 'offer_created',
  OFFER_SUBMITTED: 'offer_submitted',
  OFFER_COUNTERED: 'offer_countered',
  OFFER_ACCEPTED: 'offer_accepted',
  ONBOARDING_STARTED: 'onboarding_started',
  TRANSACTION_CREATED: 'transaction_created',
  REGISTRATION_CONFIRMED: 'registration_confirmed',
}

const EVENT_STAGE_MAP = {
  [BUYER_LIFECYCLE_EVENTS.VIEWING_CREATED]: 'Viewing Scheduled',
  [BUYER_LIFECYCLE_EVENTS.VIEWING_COMPLETED]: 'Viewing Completed',
  [BUYER_LIFECYCLE_EVENTS.OFFER_CREATED]: 'Offer Draft',
  [BUYER_LIFECYCLE_EVENTS.OFFER_SUBMITTED]: 'Offer Submitted',
  [BUYER_LIFECYCLE_EVENTS.OFFER_COUNTERED]: 'Negotiating',
  [BUYER_LIFECYCLE_EVENTS.OFFER_ACCEPTED]: 'Offer Accepted',
  [BUYER_LIFECYCLE_EVENTS.ONBOARDING_STARTED]: 'Onboarding',
  [BUYER_LIFECYCLE_EVENTS.TRANSACTION_CREATED]: 'Finance',
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
  [BUYER_LIFECYCLE_EVENTS.TRANSACTION_CREATED]: ['Transaction Created', 'Transaction created from accepted offer.'],
  [BUYER_LIFECYCLE_EVENTS.REGISTRATION_CONFIRMED]: ['Registration Confirmed', 'Registration confirmed.'],
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function toNullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function money(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function jsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  return {}
}

function normalizeDate(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function splitFullName(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function normalizePurchaserType(value = '') {
  const key = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['company', 'pty', 'pty_ltd', 'business'].includes(key)) return 'company'
  if (['trust', 'family_trust'].includes(key)) return 'trust'
  return 'individual'
}

function buildAcceptedOfferOnboardingPrefill(offer = {}, payload = {}) {
  const conditions = jsonObject(offer?.conditions)
  const fullName = normalizeText(
    payload?.buyerName ||
      conditions.buyerName ||
      conditions.fullName ||
      [conditions.firstName, conditions.lastName].filter(Boolean).join(' '),
  )
  const split = splitFullName(fullName)
  const purchaserType = normalizePurchaserType(conditions.buyerType || conditions.purchaserType || payload?.purchaserType)
  const financeType = normalizeText(offer?.financeType || conditions.financeType || payload?.financeType || 'cash').toLowerCase()

  return Object.fromEntries(Object.entries({
    purchaser_type: purchaserType,
    first_name: normalizeText(conditions.firstName) || split.firstName,
    last_name: normalizeText(conditions.lastName) || split.lastName,
    email: normalizeText(payload?.buyerEmail || conditions.buyerEmail || conditions.email).toLowerCase(),
    phone: normalizeText(payload?.buyerPhone || conditions.buyerPhone || conditions.phone),
    identity_number: normalizeText(conditions.buyerIdNumber || conditions.identityNumber || conditions.idNumber),
    purchase_finance_type: financeType || 'cash',
    purchase_price: offer?.offerAmount ? String(offer.offerAmount) : '',
    cash_amount: offer?.cashComponent ? String(offer.cashComponent) : '',
    bond_amount: offer?.bondComponent ? String(offer.bondComponent) : '',
    deposit_amount: offer?.depositAmount ? String(offer.depositAmount) : '',
    source_of_funds: normalizeText(conditions.sourceOfFunds),
    occupation_date: normalizeText(conditions.occupationDate),
    occupational_rent: conditions.occupationalRent === true ? 'yes' : '',
    occupational_rent_payable: conditions.occupationalRent === true ? 'yes' : '',
    special_conditions: normalizeText(conditions.specialConditions || conditions.suspensiveConditions),
    subject_to_sale: conditions.subjectToSale === true ? 'yes' : '',
    subject_sale_property: normalizeText(conditions.subjectSaleProperty),
    subject_sale_timeline: normalizeText(conditions.subjectSaleTimeline),
    bridge_prefill_source: 'accepted_offer',
    bridge_prefilled_at: new Date().toISOString(),
  }).filter(([, value]) => value !== null && value !== undefined && value !== ''))
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

export function normalizeBuyerStage(stage, fallback = 'New Lead') {
  const normalized = normalizeText(stage)
  return BUYER_LEAD_STAGES.find((candidate) => candidate.toLowerCase() === normalized.toLowerCase()) || fallback
}

export function normalizeOfferStatus(status, fallback = 'draft') {
  const normalized = normalizeLower(status)
  const aliased = OFFER_STATUS_ALIASES[normalized] || normalized
  return OFFER_STATUSES.includes(aliased) ? aliased : fallback
}

export function isBuyerLifecycleAppointment(appointment = {}) {
  const type = normalizeLower(appointment?.appointmentType || appointment?.appointment_type || appointment?.type)
  const label = normalizeLower(appointment?.appointmentTypeLabel || appointment?.title || appointment?.label)
  return type.includes('viewing') || label.includes('viewing')
}

export function isBuyerLeadCategory(value) {
  const normalized = normalizeLower(value)
  return normalized === 'buyer' || normalized === 'buyer lead' || normalized.includes('buyer')
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
    conditions: row.conditions_json || {},
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
    conditions_json: jsonObject(payload?.conditions || payload?.conditionsJson),
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

export async function submitCanonicalBuyerOffer({ token = '', submission = {} } = {}) {
  const context = await getCanonicalOfferInviteContext(token)
  if (!context.ok || !context.canonicalOffer?.id) {
    throw new Error(context.reason === 'expired' ? 'Offer link has expired.' : 'Offer link is not valid.')
  }
  const fullName = normalizeText(submission?.fullName)
  const email = normalizeText(submission?.email)
  const phone = normalizeText(submission?.phone)
  const offerAmount = money(submission?.offerAmount)
  if (!fullName || !email || !phone || !offerAmount || offerAmount <= 0) {
    throw new Error('Buyer details and offer amount are required.')
  }
  return updateCanonicalOfferStatus(context.canonicalOffer.id, 'submitted', {
    organisationId: context.canonicalOffer.organisationId,
    patch: {
      offer_amount: offerAmount,
      deposit_amount: money(submission?.depositAmount),
      finance_type: normalizeText(submission?.financeType) || null,
      cash_component: money(submission?.cashContribution),
      bond_component: money(submission?.bondAmount),
      conditions_json: {
        ...(context.canonicalOffer.conditions || {}),
        buyerName: fullName,
        buyerEmail: email,
        buyerPhone: phone,
        buyerIdNumber: normalizeText(submission?.idNumber),
        proofOfFundsUrl: normalizeText(submission?.proofOfFundsUrl),
        suspensiveConditions: normalizeText(submission?.suspensiveConditions),
        subjectToSale: submission?.subjectToSale === true,
        subjectSaleProperty: normalizeText(submission?.subjectSaleProperty),
        subjectSaleTimeline: normalizeText(submission?.subjectSaleTimeline),
        occupationDate: normalizeText(submission?.occupationDate),
        occupationalRent: submission?.occupationalRent === true,
        occupationalRentPayable: submission?.occupationalRent === true,
        includedFixtures: normalizeText(submission?.includedFixtures),
        excludedFixtures: normalizeText(submission?.excludedFixtures),
        specialConditions: normalizeText(submission?.specialConditions),
        needsBondAssistance: submission?.needsBondAssistance === true,
        buyerSubmittedAt: new Date().toISOString(),
        verification: submission?.verification || {},
      },
      buyer_submitted_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
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

export async function createCanonicalOffer(payload = {}, { actor = null } = {}) {
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
    await applyBuyerLifecycleEvent({
      organisationId: activeInsertPayload.organisation_id,
      leadId: activeInsertPayload.buyer_lead_id,
      event,
      offerId: data?.id,
      actor,
    }).catch(() => null)
  }

  return mapOfferDbRow(data)
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

  return mapOfferDbRow(data)
}

export async function createOfferSellerReviewSession(payload = {}, { actor = null } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Seller offer review requires Supabase.')
  }

  const scopedOrganisationId = toNullableUuid(payload?.organisationId || payload?.offer?.organisationId)
  const scopedOfferId = toNullableUuid(payload?.offerId || payload?.offer?.id || payload?.offer?.offerId)
  if (!scopedOrganisationId || !scopedOfferId) {
    throw new Error('Organisation and offer are required before sending an offer to the seller.')
  }

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

  const insertPayload = {
    organisation_id: scopedOrganisationId,
    offer_id: scopedOfferId,
    seller_lead_id: toNullableUuid(payload?.sellerLeadId || offer?.sellerLeadId),
    seller_contact_id: toNullableUuid(payload?.sellerContactId || offer?.sellerContactId),
    listing_id: toNullableUuid(payload?.listingId || offer?.listingId),
    agent_id: toNullableUuid(payload?.agentId || offer?.agentId || actor?.id),
    token: normalizeText(payload?.token) || createSellerOfferReviewAccessToken(),
    status: 'sent',
    sent_at: normalizeDate(payload?.sentAt) || new Date().toISOString(),
    expires_at: normalizeDate(payload?.expiresAt),
    metadata_json: jsonObject(payload?.metadata || payload?.metadataJson),
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
  const sellerReviewRecipientEmail = normalizeText(payload?.sellerEmail || payload?.sellerRecipientEmail || conditions.sellerReviewRecipientEmail)
  const sellerReviewRecipientName = normalizeText(payload?.sellerName || payload?.sellerRecipientName || conditions.sellerReviewRecipientName)
  const nextConditions = {
    ...conditions,
    sellerReviewSessionToken: session.token,
    sellerReviewSentAt: session.sentAt,
    sellerReviewRecipientEmail,
    sellerReviewRecipientName,
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
    activityType: 'Offer Sent To Seller',
    activityNote: 'Agent reviewed the buyer offer and sent it to the seller for review.',
    outcome: 'Sent To Seller',
    actor,
  }).catch(() => null)

  return { session, offer: updatedOffer }
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

export async function submitSellerOfferDecision({ token = '', decision = '', notes = '' } = {}) {
  const normalizedToken = normalizeText(token)
  const normalizedDecision = normalizeLower(decision)
  if (!normalizedToken || !['accepted', 'rejected', 'countered'].includes(normalizedDecision) || !isSupabaseConfigured || !supabase) {
    throw new Error('A valid seller offer decision is required.')
  }
  const { data, error } = await supabase.rpc('bridge_submit_seller_offer_decision', {
    p_token: normalizedToken,
    p_decision: normalizedDecision,
    p_notes: normalizeText(notes) || null,
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

  return [...rowsById.values()].sort(sortOffersByLatest)
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
  return (Array.isArray(data) ? data : []).map(mapOfferDbRow).filter(Boolean)
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
    throw new Error('Unable to submit this offer right now.')
  }
  return data
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
  const canonicalOfferStatus = normalizeOfferStatus(canonicalOffer.status)
  const linkedTransactionId = toNullableUuid(canonicalOffer.transactionId || canonicalOffer.transaction_id)

  if (linkedTransactionId) {
    await upsertAcceptedOfferOnboardingPrefill({
      transactionId: linkedTransactionId,
      offer: canonicalOffer,
      payload,
    }).catch(() => null)

    if (canonicalOfferStatus !== 'converted_to_transaction') {
      await updateCanonicalOfferStatus(scopedOfferId, 'converted_to_transaction', {
        organisationId: scopedOrganisationId,
        actor,
        patch: { transaction_id: linkedTransactionId },
      }).catch(() => null)
    }

    if (canonicalOffer.buyerLeadId) {
      await recordBuyerLeadActivity({
        organisationId: scopedOrganisationId,
        leadId: canonicalOffer.buyerLeadId,
        activityType: 'Transaction Reused',
        activityNote: 'Existing transaction reused for this accepted buyer offer.',
        outcome: 'Transaction Linked',
        actor,
      }).catch(() => null)
    }

    return {
      transactionId: linkedTransactionId,
      existing: true,
      alreadyConverted: true,
      persisted: true,
      transactionRow: {
        transaction: {
          id: linkedTransactionId,
          organisation_id: scopedOrganisationId,
          accepted_offer_id: scopedOfferId,
        },
      },
      warning: 'existing_offer_transaction_reused',
    }
  }

  if (canonicalOfferStatus !== 'accepted') {
    throw new Error('Only an accepted offer can be converted to a transaction.')
  }

  const buyerLead = lead || {
    leadId: canonicalOffer.buyerLeadId,
    contactId: canonicalOffer.buyerContactId,
    assignedAgentId: canonicalOffer.agentId || actor?.id,
    assignedAgentName: actor?.name || '',
    assignedAgentEmail: actor?.email || '',
    budget: canonicalOffer.offerAmount,
  }

  const created = await createTransactionFromLeadOverride({
    lead: buyerLead,
    listing,
    actor,
    payload: {
      ...payload,
      organisationId: scopedOrganisationId,
      originatingBuyerLeadId: canonicalOffer.buyerLeadId,
      originatingLeadId: canonicalOffer.buyerLeadId,
      buyerContactId: canonicalOffer.buyerContactId,
      listingId: canonicalOffer.listingId || payload?.listingId,
      acceptedOfferId: canonicalOffer.offerId || canonicalOffer.id,
      purchasePrice: canonicalOffer.offerAmount || payload?.purchasePrice,
      dealValue: canonicalOffer.offerAmount || payload?.dealValue,
      depositAmount: canonicalOffer.depositAmount || payload?.depositAmount,
      cashAmount: canonicalOffer.cashComponent || payload?.cashAmount,
      bondAmount: canonicalOffer.bondComponent || payload?.bondAmount,
      financeType: canonicalOffer.financeType || payload?.financeType,
      purchaserType: canonicalOffer.conditions?.buyerType || canonicalOffer.conditions?.purchaserType || payload?.purchaserType || 'individual',
      assignedAgentId: canonicalOffer.agentId || payload?.assignedAgentId || actor?.id,
      assignedAgentName: payload?.assignedAgentName || actor?.name,
      assignedAgentEmail: payload?.assignedAgentEmail || actor?.email,
    },
  })

  const transactionId = normalizeText(created?.transactionId || created?.transactionRow?.transaction?.id)
  if (transactionId) {
    await upsertAcceptedOfferOnboardingPrefill({
      transactionId,
      offer: canonicalOffer,
      payload,
    }).catch(() => null)

    await updateCanonicalOfferStatus(scopedOfferId, 'converted_to_transaction', {
      organisationId: scopedOrganisationId,
      actor,
      patch: { transaction_id: transactionId },
    })
  }

  return created
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
  const mergedFormData = {
    ...prefill,
    ...existingFormData,
  }
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
