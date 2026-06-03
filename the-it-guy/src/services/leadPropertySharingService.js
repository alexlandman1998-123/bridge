import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'
import {
  COMMUNICATION_OPT_OUT_MESSAGE,
  markCommunicationDeliveryFailed,
  markCommunicationDeliverySent,
  prepareCommunicationDelivery,
  validateCommunicationSend,
} from './communicationDeliveryService'
import { createCommunicationEvent, listLeadCommunications } from './leadCommunicationService'
import { buildPropertyMessage } from './leadCommunicationTemplateService'
import { markLeadListingInterestSent } from './leadListingInterestService'
import { buildRequirementSummary } from './leadRequirementService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FREQUENCIES = ['daily', 'weekly', 'manual_only']
const CHANNELS = ['email', 'whatsapp']

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function nullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function readId(row = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return ''
}

function actorId(actor = null) {
  return nullableUuid(actor?.id || actor?.userId || actor?.user_id)
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before managing saved searches or property shares.')
  }
  return supabase
}

function normalizeFrequency(value = 'manual_only') {
  const normalized = normalizeLower(value).replace(/[-\s]+/g, '_')
  return FREQUENCIES.includes(normalized) ? normalized : 'manual_only'
}

function normalizeChannel(value = 'email') {
  const normalized = normalizeLower(value).replace(/[-\s]+/g, '_')
  return CHANNELS.includes(normalized) ? normalized : 'email'
}

function listingId(listing = {}) {
  return readId(listing, ['listingId', 'listing_id', 'id'])
}

function listingTitle(listing = {}) {
  return normalizeText(listing.title || listing.listingTitle || listing.propertyAddress || listing.property_address || listing.address || listing.suburb) || 'Listing details pending'
}

function leadEmail(lead = {}) {
  return normalizeText(lead.email || lead.sellerEmail || lead.seller_email).toLowerCase()
}

function leadPhone(lead = {}) {
  return normalizeText(lead.phone || lead.sellerPhone || lead.seller_phone)
}

export function mapLeadSavedSearch(row = {}) {
  return {
    id: readId(row, ['savedSearchId', 'saved_search_id', 'id']),
    savedSearchId: readId(row, ['savedSearchId', 'saved_search_id', 'id']),
    organisationId: readId(row, ['organisationId', 'organisation_id']),
    leadId: readId(row, ['leadId', 'lead_id']),
    requirementId: readId(row, ['requirementId', 'requirement_id']),
    searchName: normalizeText(row.searchName || row.search_name) || 'Saved Search',
    active: Boolean(row.active ?? true),
    consentGiven: Boolean(row.consentGiven ?? row.consent_given),
    emailEnabled: Boolean(row.emailEnabled ?? row.email_enabled ?? true),
    whatsappEnabled: Boolean(row.whatsappEnabled ?? row.whatsapp_enabled),
    frequency: normalizeFrequency(row.frequency),
    lastSentAt: row.lastSentAt || row.last_sent_at || null,
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
    raw: row,
  }
}

export function buildSavedSearchPayload(payload = {}) {
  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : {}
  const requirement = payload.requirement && typeof payload.requirement === 'object' ? payload.requirement : {}
  const organisationId = nullableUuid(payload.organisationId || payload.organisation_id || lead.organisationId || lead.organisation_id)
  const leadId = nullableUuid(payload.leadId || payload.lead_id || lead.leadId || lead.lead_id || lead.id)
  const requirementId = nullableUuid(payload.requirementId || payload.requirement_id || requirement.requirementId || requirement.requirement_id)
  if (!organisationId || !leadId) throw new Error('Valid organisation and lead ids are required for saved searches.')
  return {
    organisation_id: organisationId,
    lead_id: leadId,
    requirement_id: requirementId,
    search_name: normalizeText(payload.searchName || payload.search_name) || buildRequirementSummary(requirement) || 'Saved Search',
    active: payload.active === undefined ? true : Boolean(payload.active),
    consent_given: Boolean(payload.consentGiven ?? payload.consent_given),
    email_enabled: payload.emailEnabled === undefined && payload.email_enabled === undefined ? true : Boolean(payload.emailEnabled ?? payload.email_enabled),
    whatsapp_enabled: Boolean(payload.whatsappEnabled ?? payload.whatsapp_enabled),
    frequency: normalizeFrequency(payload.frequency),
  }
}

export async function listLeadSavedSearches({ organisationId = '', leadId = '' } = {}) {
  const normalizedOrgId = nullableUuid(organisationId)
  if (!normalizedOrgId) return []
  const client = requireClient()
  let query = client
    .from('lead_saved_searches')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .order('updated_at', { ascending: false })
  if (nullableUuid(leadId)) query = query.eq('lead_id', nullableUuid(leadId))
  const { data, error } = await query
  if (error) throw error
  return (Array.isArray(data) ? data : []).map(mapLeadSavedSearch)
}

export async function createLeadSavedSearch(payload = {}, { actor = null } = {}) {
  const client = requireClient()
  const dbPayload = buildSavedSearchPayload(payload)
  let existingQuery = client
    .from('lead_saved_searches')
    .select('saved_search_id')
    .eq('organisation_id', dbPayload.organisation_id)
    .eq('lead_id', dbPayload.lead_id)
    .eq('search_name', dbPayload.search_name)
    .limit(1)
  existingQuery = dbPayload.requirement_id ? existingQuery.eq('requirement_id', dbPayload.requirement_id) : existingQuery.is('requirement_id', null)
  const { data: existingRows, error: existingError } = await existingQuery
  if (existingError) throw existingError
  const existingId = existingRows?.[0]?.saved_search_id
  const query = existingId
    ? client
      .from('lead_saved_searches')
      .update({ ...dbPayload, updated_at: new Date().toISOString() })
      .eq('saved_search_id', existingId)
    : client
      .from('lead_saved_searches')
      .insert({ ...dbPayload, updated_at: new Date().toISOString() })
  const { data, error } = await query
    .select('*')
    .single()
  if (error) throw error
  void actor
  return mapLeadSavedSearch(data)
}

export async function updateLeadSavedSearch({ savedSearchId = '', updates = {} } = {}, { actor = null } = {}) {
  const client = requireClient()
  const normalizedId = nullableUuid(savedSearchId)
  if (!normalizedId) throw new Error('Saved search id is required.')
  const patch = {}
  if (updates.searchName !== undefined || updates.search_name !== undefined) patch.search_name = normalizeText(updates.searchName || updates.search_name) || 'Saved Search'
  if (updates.active !== undefined) patch.active = Boolean(updates.active)
  if (updates.consentGiven !== undefined || updates.consent_given !== undefined) patch.consent_given = Boolean(updates.consentGiven ?? updates.consent_given)
  if (updates.emailEnabled !== undefined || updates.email_enabled !== undefined) patch.email_enabled = Boolean(updates.emailEnabled ?? updates.email_enabled)
  if (updates.whatsappEnabled !== undefined || updates.whatsapp_enabled !== undefined) patch.whatsapp_enabled = Boolean(updates.whatsappEnabled ?? updates.whatsapp_enabled)
  if (updates.frequency !== undefined) patch.frequency = normalizeFrequency(updates.frequency)
  if (updates.lastSentAt !== undefined || updates.last_sent_at !== undefined) patch.last_sent_at = updates.lastSentAt || updates.last_sent_at || null
  patch.updated_at = new Date().toISOString()
  const { data, error } = await client
    .from('lead_saved_searches')
    .update(patch)
    .eq('saved_search_id', normalizedId)
    .select('*')
    .single()
  if (error) throw error
  void actor
  return mapLeadSavedSearch(data)
}

export function enableLeadSavedSearch({ savedSearchId = '' } = {}, options = {}) {
  return updateLeadSavedSearch({ savedSearchId, updates: { active: true } }, options)
}

export function disableLeadSavedSearch({ savedSearchId = '' } = {}, options = {}) {
  return updateLeadSavedSearch({ savedSearchId, updates: { active: false } }, options)
}

export function validateShareConsent({ requirement = null, savedSearch = null } = {}) {
  if (savedSearch?.consentGiven || savedSearch?.consent_given) return { ok: true, source: 'saved_search' }
  if (requirement?.consentToReceiveMatches || requirement?.consent_to_receive_matches) return { ok: true, source: 'requirement' }
  return {
    ok: false,
    source: 'missing',
    warning: 'Consent to receive property matches is not recorded for this lead.',
  }
}

export function previewPropertyMessage({
  lead = {},
  listings = [],
  listing = null,
  requirement = null,
  savedSearch = null,
  channel = 'email',
  templateType = 'property_match',
  note = '',
} = {}) {
  const selectedListings = listings.length ? listings : [listing].filter(Boolean)
  const consent = validateShareConsent({ requirement, savedSearch })
  const message = buildPropertyMessage({
    templateType,
    lead,
    listings: selectedListings,
    requirement,
    requirementSummary: requirement ? buildRequirementSummary(requirement) : '',
    note,
  })
  return {
    ...message,
    channel: normalizeChannel(channel),
    listings: selectedListings,
    listingIds: selectedListings.map(listingId).filter(Boolean),
    consent,
    recipient: normalizeChannel(channel) === 'whatsapp' ? leadPhone(lead) : leadEmail(lead),
  }
}

async function sendEmailPayload({ to = '', subject = '', message = '', metadata = {} } = {}) {
  if (!isSupabaseConfigured || !supabase || !to) return { ok: false, skipped: true, reason: 'email_infrastructure_unavailable' }
  try {
    return await invokeEdgeFunction('send-email', {
      body: {
        type: 'lead_property_share',
        to,
        subject,
        message,
        metadata,
      },
    })
  } catch (error) {
    return { ok: false, error: error?.message || 'email_send_failed' }
  }
}

async function sendWhatsAppPayload({ to = '', message = '' } = {}) {
  const normalizedPhone = formatSouthAfricanWhatsAppNumber(to)
  if (!normalizedPhone) return { ok: false, skipped: true, reason: 'missing_whatsapp_number' }
  return sendWhatsAppNotification({ to: normalizedPhone, message, role: 'lead_property_share' })
}

export async function logPropertyShare(payload = {}, { actor = null } = {}) {
  const preview = payload.preview || previewPropertyMessage(payload)
  const listings = preview.listings || []
  return createCommunicationEvent({
    organisationId: payload.organisationId,
    branchId: payload.branchId || payload.lead?.branchId || payload.lead?.branch_id,
    leadId: payload.leadId || payload.lead?.leadId,
    contactId: payload.contactId || payload.lead?.contactId,
    agentId: actorId(actor),
    communicationType: preview.channel,
    direction: 'outbound',
    subject: payload.subject || preview.subject,
    message: preview.message,
    summary: `${preview.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} property update ${payload.deliveryStatus === 'sent' ? 'sent' : payload.deliveryStatus === 'failed' ? 'failed' : 'prepared'} for ${listings.length || 1} listing${listings.length === 1 ? '' : 's'}.`,
    source: 'property_share',
    status: payload.deliveryStatus || 'pending',
    metadata: {
      shareType: 'property_share',
      channel: preview.channel,
      listingIds: preview.listingIds,
      listings: listings.map((item) => ({ listingId: listingId(item), title: listingTitle(item) })),
      requirementId: payload.requirementId || payload.requirement?.requirementId,
      savedSearchId: payload.savedSearchId || payload.savedSearch?.savedSearchId,
      recommendationId: payload.recommendationId,
      suggestionId: payload.suggestionId,
      interestIds: payload.interestIds || [payload.interestId].filter(Boolean),
      deliveryId: payload.delivery?.id || payload.deliveryId || '',
      deliveryStatus: payload.delivery?.status || payload.deliveryStatus || '',
      leadName: payload.lead?.name || '',
      leadEmail: leadEmail(payload.lead || {}),
      leadPhone: leadPhone(payload.lead || {}),
      consentSource: preview.consent.source,
      sendResult: payload.sendResult || null,
    },
  }, { actor, mirrorActivity: true })
}

export async function sendMultipleListingsToLead(payload = {}, { actor = null } = {}) {
  const preview = previewPropertyMessage(payload)
  if (!preview.consent.ok) {
    return { ok: false, status: 'blocked', warning: preview.consent.warning, preview }
  }
  const channel = preview.channel
  const recipient = preview.recipient
  const preferenceConsent = await validateCommunicationSend({
    organisationId: payload.organisationId,
    leadId: payload.leadId || payload.lead?.leadId,
    channel,
    communicationType: 'property_share',
  }, { actor })
  if (!preferenceConsent.ok) {
    return { ok: false, status: 'blocked', warning: preferenceConsent.message || COMMUNICATION_OPT_OUT_MESSAGE, preview }
  }
  const delivery = await prepareCommunicationDelivery({
    organisationId: payload.organisationId,
    leadId: payload.leadId || payload.lead?.leadId,
    listingId: preview.listingIds[0] || payload.listingId || payload.listing?.id,
    communicationType: 'property_share',
    channel,
    recipient,
    subject: preview.subject,
    messagePreview: preview.message,
    provider: 'internal',
  }, { actor, validateConsent: false })
  let sendResult = { ok: false, skipped: true, reason: 'unsupported_channel' }
  if (channel === 'email') {
    sendResult = await sendEmailPayload({ to: recipient, subject: preview.subject, message: preview.message, metadata: { listingIds: preview.listingIds } })
  } else if (channel === 'whatsapp') {
    sendResult = await sendWhatsAppPayload({ to: recipient, message: preview.message })
  }
  const deliveryStatus = sendResult?.ok ? 'sent' : 'failed'
  const deliveryUpdate = sendResult?.ok
    ? await markCommunicationDeliverySent(delivery.id, {
      provider: channel === 'email' ? 'sendgrid' : 'twilio',
      providerMessageId: sendResult?.data?.id || sendResult?.messageId || sendResult?.sid || '',
      sentBy: actorId(actor),
    }).catch(() => delivery)
    : await markCommunicationDeliveryFailed(delivery.id, {
      provider: channel === 'email' ? 'sendgrid' : 'twilio',
      errorMessage: sendResult?.reason || sendResult?.error || 'communication_delivery_failed',
      sentBy: actorId(actor),
    }).catch(() => delivery)
  const event = await logPropertyShare({
    ...payload,
    preview,
    sendResult,
    delivery: deliveryUpdate,
    deliveryStatus,
  }, { actor })

  await Promise.all((payload.interestIds || [payload.interestId].filter(Boolean)).map((interestId) => markLeadListingInterestSent({ interestId }, { actor }).catch(() => null)))
  if (payload.savedSearchId) {
    await updateLeadSavedSearch({ savedSearchId: payload.savedSearchId, updates: { lastSentAt: new Date().toISOString() } }, { actor }).catch(() => null)
  }
  return { ok: true, status: deliveryStatus, preview, sendResult, event, delivery: deliveryUpdate }
}

export function sendListingToLead(payload = {}, options = {}) {
  return sendMultipleListingsToLead({
    ...payload,
    listings: payload.listings || [payload.listing].filter(Boolean),
  }, options)
}

function communicationIsShare(event = {}) {
  const metadata = event.metadata || {}
  return metadata.shareType === 'property_share' || normalizeLower(event.source) === 'property_share'
}

function mapPropertyShareEvent(event = {}) {
  const metadata = event.metadata || {}
  return {
    ...event,
    shareId: event.communicationId,
    channel: metadata.channel || event.communicationType,
    listingIds: Array.isArray(metadata.listingIds) ? metadata.listingIds : [],
    listings: Array.isArray(metadata.listings) ? metadata.listings : [],
    requirementId: metadata.requirementId || '',
    savedSearchId: metadata.savedSearchId || '',
    recommendationId: metadata.recommendationId || '',
    deliveryId: metadata.deliveryId || '',
    deliveryStatus: metadata.deliveryStatus || event.status || '',
    status: metadata.deliveryStatus || event.status || '',
    leadName: metadata.leadName || '',
    leadEmail: metadata.leadEmail || '',
    leadPhone: metadata.leadPhone || '',
    sentAt: event.occurredAt,
    agentId: event.agentId,
  }
}

export async function listLeadPropertyShares({ organisationId = '', leadId = '' } = {}) {
  const events = await listLeadCommunications({ organisationId, leadId, search: 'property_share', limit: 500 }).catch(() => [])
  return events.filter(communicationIsShare).map(mapPropertyShareEvent)
}

export async function listListingPropertyShares({ organisationId = '', listingId = '' } = {}) {
  const normalizedListingId = nullableUuid(listingId)
  if (!nullableUuid(organisationId) || !normalizedListingId) return []
  const events = await listLeadCommunications({ organisationId, limit: 1000 }).catch(() => [])
  return events
    .filter(communicationIsShare)
    .map(mapPropertyShareEvent)
    .filter((event) => event.listingIds.includes(normalizedListingId))
}

export const __leadPropertySharingServiceTestUtils = {
  buildSavedSearchPayload,
  listListingPropertyShares,
  mapLeadSavedSearch,
  previewPropertyMessage,
  validateShareConsent,
}
