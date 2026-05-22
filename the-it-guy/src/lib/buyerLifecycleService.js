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

export const OFFER_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'countered',
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
  'converted_to_transaction',
]

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
  return OFFER_STATUSES.includes(normalized) ? normalized : fallback
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
    submittedAt: row.submitted_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
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
    metadata: session.metadata || session.metadata_json || {},
    createdAt: session.createdAt || session.created_at,
    updatedAt: session.updatedAt || session.updated_at,
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
      submittedAt: offer.submittedAt || offer.submitted_at,
      acceptedAt: offer.acceptedAt || offer.accepted_at,
      rejectedAt: offer.rejectedAt || offer.rejected_at,
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
    submitted_at: status === 'submitted' ? (normalizeDate(payload?.submittedAt) || nowIso) : normalizeDate(payload?.submittedAt),
    accepted_at: status === 'accepted' ? (normalizeDate(payload?.acceptedAt) || nowIso) : normalizeDate(payload?.acceptedAt),
    rejected_at: status === 'rejected' ? (normalizeDate(payload?.rejectedAt) || nowIso) : normalizeDate(payload?.rejectedAt),
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
  const { data, error } = await query.maybeSingle()
  if (error || !data) return { ok: false, reason: 'not_found', invite: null, listing: null, offers: [] }

  const offer = mapOfferDbRow(data)
  if (offer?.status === 'expired') return { ok: false, reason: 'expired', invite: null, listing: null, offers: [] }
  if (offer?.status === 'withdrawn') return { ok: false, reason: 'withdrawn', invite: null, listing: null, offers: [] }
  if (offer?.expiryDate && new Date(offer.expiryDate).getTime() < Date.now()) return { ok: false, reason: 'expired', invite: null, listing: null, offers: [] }

  let listing = null
  if (offer?.listingId) {
    const listingResult = await supabase.from('private_listings').select('*').eq('id', offer.listingId).maybeSingle()
    if (!listingResult.error) listing = mapListingDbRow(listingResult.data)
  }

  const buyerName = normalizeText(offer?.conditions?.buyerName) || 'Prospect'
  return {
    ok: true,
    source: 'canonical',
    reason: '',
    canonicalOffer: offer,
    invite: {
      token: offer.offerToken || offer.id,
      buyerLeadName: buyerName,
      expiresAt: offer.expiryDate,
      agentName: 'Assigned agent',
      status: offer.status,
    },
    listing,
    offers: offer.status === 'submitted'
      ? [{
          id: offer.id,
          status: offer.status,
          submittedAt: offer.submittedAt,
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
        occupationalRent: money(submission?.occupationalRent),
        includedFixtures: normalizeText(submission?.includedFixtures),
        excludedFixtures: normalizeText(submission?.excludedFixtures),
        specialConditions: normalizeText(submission?.specialConditions),
        buyerSubmittedAt: new Date().toISOString(),
        verification: submission?.verification || {},
      },
      submitted_at: new Date().toISOString(),
    },
  })
}

function statusToEvent(status) {
  if (status === 'draft') return BUYER_LIFECYCLE_EVENTS.OFFER_CREATED
  if (status === 'submitted' || status === 'under_review') return BUYER_LIFECYCLE_EVENTS.OFFER_SUBMITTED
  if (status === 'countered') return BUYER_LIFECYCLE_EVENTS.OFFER_COUNTERED
  if (status === 'accepted') return BUYER_LIFECYCLE_EVENTS.OFFER_ACCEPTED
  if (status === 'converted_to_transaction') return BUYER_LIFECYCLE_EVENTS.TRANSACTION_CREATED
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
  if (nextStatus === 'submitted' && !updatePayload.submitted_at) updatePayload.submitted_at = nowIso
  if (nextStatus === 'accepted' && !updatePayload.accepted_at) updatePayload.accepted_at = nowIso
  if (nextStatus === 'rejected' && !updatePayload.rejected_at) updatePayload.rejected_at = nowIso

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

export async function listCanonicalOffersForLead({ organisationId = '', leadId = '' } = {}) {
  const scopedOrganisationId = toNullableUuid(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  if (!scopedOrganisationId || !scopedLeadId || !isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('organisation_id', scopedOrganisationId)
    .eq('buyer_lead_id', scopedLeadId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (Array.isArray(data) ? data : []).map(mapOfferDbRow).filter(Boolean)
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
  if (normalizeOfferStatus(canonicalOffer.status) !== 'accepted') {
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
      financeType: canonicalOffer.financeType || payload?.financeType,
      assignedAgentId: canonicalOffer.agentId || payload?.assignedAgentId || actor?.id,
      assignedAgentName: payload?.assignedAgentName || actor?.name,
      assignedAgentEmail: payload?.assignedAgentEmail || actor?.email,
    },
  })

  const transactionId = normalizeText(created?.transactionId || created?.transactionRow?.transaction?.id)
  if (transactionId) {
    await updateCanonicalOfferStatus(scopedOfferId, 'converted_to_transaction', {
      organisationId: scopedOrganisationId,
      actor,
      patch: { transaction_id: transactionId },
    })
  }

  return created
}
