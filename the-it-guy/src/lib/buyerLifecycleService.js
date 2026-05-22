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

function isMissingColumnError(error) {
  return String(error?.code || '') === '42703' || /column .* does not exist/i.test(String(error?.message || ''))
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

  const { data, error } = await supabase
    .from('offers')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) throw error

  const event = statusToEvent(insertPayload.status)
  if (event && insertPayload.buyer_lead_id) {
    await applyBuyerLifecycleEvent({
      organisationId: insertPayload.organisation_id,
      leadId: insertPayload.buyer_lead_id,
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
