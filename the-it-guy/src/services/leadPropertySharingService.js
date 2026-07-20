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

function listingAddress(listing = {}) {
  return [listing.address, listing.suburb, listing.city].map(normalizeText).filter(Boolean).join(', ') ||
    normalizeText(listing.location || listing.propertyAddress || listing.property_address) ||
    'Address available on request'
}

function listingPrice(listing = {}) {
  const amount = Number(listing.price || listing.askingPrice || listing.asking_price || listing.estimatedValue || listing.estimated_value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount).replace('ZAR', 'R')
}

function listingImage(listing = {}) {
  return normalizeText(
    listing.mainImageUrl ||
      listing.main_image_url ||
      listing.thumbnailUrl ||
      listing.thumbnail_url ||
      listing.coverImageUrl ||
      listing.cover_image_url ||
      listing.imageUrl ||
      listing.image_url ||
      listing.photos?.[0]?.url ||
      listing.images?.[0]?.url,
  )
}

function listingPublicUrl(listing = {}) {
  return normalizeText(
    listing.publicListingUrl ||
      listing.public_listing_url ||
      listing.externalUrl ||
      listing.external_url ||
      listing.url ||
      listing.listingUrl ||
      listing.listing_url,
  )
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
    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'lead_property_share',
        to,
        subject,
        message,
        metadata,
      },
    })
    if (response?.error || response?.data?.error) {
      return { ok: false, error: response.error || response.data.error, data: response.data }
    }
    return { ok: Boolean(response?.data?.ok), data: response?.data }
  } catch (error) {
    return { ok: false, error: error?.message || 'email_send_failed' }
  }
}

function escapeHtml(value) {
  return normalizeText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function firstName(value = '') {
  return normalizeText(value).split(/\s+/).filter(Boolean)[0] || 'there'
}

function agencyName(payload = {}) {
  return normalizeText(payload.agency?.name || payload.agencyName || payload.organisationName || payload.lead?.organisationName) || 'Arch9'
}

function agentName(payload = {}) {
  return normalizeText(payload.agent?.fullName || payload.agent?.name || payload.actor?.fullName || payload.actor?.name || payload.actor?.email) || 'Your agent'
}

function agentEmail(payload = {}) {
  return normalizeText(payload.agent?.email || payload.actor?.email)
}

function agentPhone(payload = {}) {
  return normalizeText(payload.agent?.phone || payload.actor?.phone)
}

function requirementValue(requirement = {}, keys = []) {
  for (const key of keys) {
    const value = requirement?.[key]
    if (Array.isArray(value)) {
      const label = value.map(normalizeText).filter(Boolean).join(', ')
      if (label) return label
    }
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function requirementBudget(requirement = {}, lead = {}) {
  const min = Number(requirement.budgetMin || requirement.budget_min || requirement.priceMin || requirement.price_min || 0)
  const max = Number(requirement.budgetMax || requirement.budget_max || requirement.priceMax || requirement.price_max || lead.budget || 0)
  if (Number.isFinite(min) && min > 0 && Number.isFinite(max) && max > 0 && min !== max) return `${listingPrice({ price: min })} - ${listingPrice({ price: max })}`
  if (Number.isFinite(max) && max > 0) return listingPrice({ price: max })
  if (Number.isFinite(min) && min > 0) return `From ${listingPrice({ price: min })}`
  return ''
}

function propertySpec(label, value) {
  const normalized = normalizeText(value)
  return normalized ? { label, value: normalized } : null
}

function buildSearchProfileFields({ lead = {}, requirement = {} } = {}) {
  return [
    propertySpec('Budget', requirementBudget(requirement, lead)),
    propertySpec('Locations', requirementValue(requirement, ['areas', 'preferredAreas', 'preferred_areas', 'locations', 'preferredLocations', 'preferred_locations']) || normalizeText(lead.areaInterest || lead.area_interest)),
    propertySpec('Bedrooms', requirementValue(requirement, ['bedroomsLabel', 'bedrooms_label']) || (requirement.bedroomsMin || requirement.bedrooms_min ? `${requirement.bedroomsMin || requirement.bedrooms_min}+ Bedrooms` : '')),
    propertySpec('Bathrooms', requirement.bathroomsMin || requirement.bathrooms_min ? `${requirement.bathroomsMin || requirement.bathrooms_min}+ Bathrooms` : ''),
    propertySpec('Property Types', requirementValue(requirement, ['propertyTypes', 'property_types', 'propertyType', 'property_type']) || normalizeText(lead.propertyInterest || lead.property_interest)),
    propertySpec('Pet Friendly', requirementValue(requirement, ['petFriendly', 'pet_friendly', 'petsAllowed', 'pets_allowed'])),
    propertySpec('Security Preference', requirementValue(requirement, ['securityPreference', 'security_preference', 'security', 'estatePreference', 'estate_preference'])),
    propertySpec('Work Location', requirementValue(requirement, ['workLocation', 'work_location'])),
    propertySpec('Move Timeframe', requirementValue(requirement, ['moveTimeframe', 'move_timeframe', 'timeline', 'urgency'])),
  ].filter(Boolean)
}

function normalizeCollectionProperty(item = {}, index = 0) {
  const listing = item.listing || item
  const score = Number(item.score || item.matchScore || item.match_score || listing.matchScore || listing.match_score || 0)
  const reasons = Array.isArray(item.reasons || item.matchReasons || item.match_reasons)
    ? (item.reasons || item.matchReasons || item.match_reasons).map(normalizeText).filter(Boolean)
    : []
  return {
    id: normalizeText(item.id || listingId(listing) || `property-${index + 1}`),
    rank: Number(item.rank || item.rankOrder || item.rank_order || index + 1),
    listing,
    title: listingTitle(listing),
    address: listingAddress(listing),
    suburb: normalizeText(listing.suburb || listing.city),
    propertyType: normalizeText(listing.propertyType || listing.property_type || listing.listingType || listing.listing_type),
    price: listingPrice(listing),
    imageUrl: listingImage(listing),
    publicUrl: listingPublicUrl(listing),
    bedrooms: normalizeText(listing.bedrooms),
    bathrooms: normalizeText(listing.bathrooms),
    garages: normalizeText(listing.garages || listing.parking),
    floorSize: normalizeText(listing.floorSize || listing.floor_size),
    erfSize: normalizeText(listing.erfSize || listing.erf_size),
    description: normalizeText(listing.shortDescription || listing.short_description || listing.description),
    matchScore: Number.isFinite(score) && score > 0 ? Math.round(score) : 0,
    matchReasons: reasons,
  }
}

export function buildPropertyCollectionEmailPreview({
  lead = {},
  requirement = {},
  properties = [],
  subject = '',
  introMessage = '',
  agent = {},
  agency = {},
  bookingUrl = '',
} = {}) {
  const selectedProperties = properties.map(normalizeCollectionProperty).filter((property) => property.title)
  const buyerName = normalizeText(lead.name || lead.fullName || lead.full_name || lead.contact?.fullName || lead.contact?.name)
  const buyerFirstName = firstName(buyerName)
  const resolvedSubject = normalizeText(subject) || `We found ${selectedProperties.length} homes that match your requirements`
  const resolvedAgencyName = agencyName({ agency, lead })
  const resolvedAgentName = agentName({ agent })
  const resolvedAgentEmail = agentEmail({ agent })
  const resolvedAgentPhone = agentPhone({ agent })
  const profileFields = buildSearchProfileFields({ lead, requirement })
  const intro = normalizeText(introMessage) ||
    `Based on the details you provided, we've carefully selected these properties that we believe are a strong fit for your budget, location preferences and lifestyle needs.`
  const today = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
  const ctaUrl = normalizeText(bookingUrl) || (resolvedAgentEmail ? `mailto:${resolvedAgentEmail}?subject=${encodeURIComponent('Viewing request')}` : '')
  const logoUrl = normalizeText(agency.logoUrl || agency.logo_url || agency.logo || '')
  const agentPhoto = normalizeText(agent.photoUrl || agent.photo_url || agent.avatarUrl || agent.avatar_url || '')
  const propertyRows = selectedProperties.map((property) => {
    const specs = [
      property.propertyType,
      property.bedrooms ? `${escapeHtml(property.bedrooms)} bed` : '',
      property.bathrooms ? `${escapeHtml(property.bathrooms)} bath` : '',
      property.garages ? `${escapeHtml(property.garages)} garage` : '',
      property.floorSize ? `${escapeHtml(property.floorSize)}m2` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')
    const reasons = property.matchReasons.length
      ? `<div style="margin-top:10px;">${property.matchReasons.slice(0, 4).map((reason) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 8px;border-radius:999px;background:#f0fdf4;color:#166534;font-size:12px;font-weight:700;">${escapeHtml(reason)}</span>`).join('')}</div>`
      : ''
    const imageHtml = property.imageUrl
      ? `<img src="${escapeHtml(property.imageUrl)}" alt="" width="190" class="collection-property-image" style="display:block;width:190px;max-width:190px;height:132px;object-fit:cover;border-radius:18px;background:#eef2f7;" />`
      : `<div class="collection-property-image" style="width:190px;height:132px;border-radius:18px;background:#eef2f7;color:#64748b;text-align:center;line-height:132px;font-size:13px;">Property image</div>`
    const viewUrl = property.publicUrl || ctaUrl
    return `
      <tr>
        <td style="padding:0 0 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;box-shadow:0 10px 24px rgba(15,23,42,0.06);overflow:hidden;">
            <tr>
              <td width="210" valign="top" class="collection-property-image-col" style="padding:14px;">
                <div style="position:relative;">
                  ${imageHtml}
                </div>
              </td>
              <td valign="top" class="collection-property-copy-col" style="padding:18px 14px 16px 0;">
                <p style="margin:0 0 4px;font-size:16px;line-height:1.35;color:#0f172a;font-weight:800;">${escapeHtml(property.title)}</p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748b;">${escapeHtml(property.suburb || property.address)}</p>
                ${specs ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#334155;">${specs}</p>` : ''}
                ${property.description ? `<p style="margin:0;font-size:13px;line-height:1.55;color:#475569;">${escapeHtml(property.description).slice(0, 180)}</p>` : ''}
                ${reasons}
              </td>
              <td width="150" valign="top" class="collection-property-action-col" style="padding:18px 16px;border-left:1px solid #eef2f7;">
                <p style="margin:0 0 10px;font-size:20px;line-height:1.2;color:#0f172a;font-weight:900;">${escapeHtml(property.price || 'Price on request')}</p>
                ${property.matchScore ? `<p style="display:inline-block;margin:0 0 16px;padding:7px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:12px;font-weight:800;">${property.matchScore}% Match</p>` : ''}
                ${viewUrl ? `<a href="${escapeHtml(viewUrl)}" style="display:inline-block;color:#4f46e5;text-decoration:none;font-size:14px;font-weight:800;">View Property →</a>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `
  }).join('')
  const profileHtml = profileFields.length ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:24px;background:#f8f7ff;border:1px solid #ede9fe;">
      <tr>
        <td style="padding:22px;">
          <p style="margin:0 0 14px;font-size:17px;color:#0f172a;font-weight:900;">Your Search Profile</p>
          ${profileFields.map((field) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#334155;"><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(field.value)}</p>`).join('')}
        </td>
      </tr>
    </table>
  ` : ''
  const html = `<!doctype html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        @media screen and (max-width: 640px) {
          .collection-outer { padding: 0 !important; }
          .collection-shell { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
          .collection-padded { padding-left: 20px !important; padding-right: 20px !important; }
          .collection-hero-col, .collection-profile-col, .collection-property-image-col, .collection-property-copy-col, .collection-property-action-col, .collection-cta-copy, .collection-cta-action { display: block !important; width: 100% !important; box-sizing: border-box !important; }
          .collection-hero-col { padding-right: 0 !important; }
          .collection-profile-col { padding-top: 22px !important; }
          .collection-property-image-col { padding-bottom: 0 !important; }
          .collection-property-copy-col { padding: 18px 14px !important; }
          .collection-property-action-col { border-left: 0 !important; border-top: 1px solid #eef2f7 !important; }
          .collection-property-image { width: 100% !important; max-width: 100% !important; height: 180px !important; line-height: 180px !important; }
          .collection-cta-action { padding-top: 0 !important; }
        }
      </style>
    </head>
    <body style="margin:0;padding:0;background:#f6f8fb;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="margin:0;padding:0;background:#f6f8fb;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(resolvedSubject)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;">
        <tr>
          <td align="center" class="collection-outer" style="padding:28px 14px;">
            <!--[if mso]>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="720" align="center"><tr><td>
            <![endif]-->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="collection-shell" style="max-width:720px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:28px;box-shadow:0 24px 70px rgba(15,23,42,0.08);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;overflow:hidden;">
              <tr>
                <td class="collection-padded" style="padding:34px 34px 18px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td>
                        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(resolvedAgencyName)}" style="display:block;max-height:42px;max-width:190px;width:auto;height:auto;" />` : `<p style="margin:0;font-size:22px;letter-spacing:0.08em;color:#0f172a;font-weight:900;">${escapeHtml(resolvedAgencyName)}</p>`}
                      </td>
                      <td align="right" style="font-size:13px;color:#64748b;">${escapeHtml(today)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="collection-padded" style="padding:18px 34px 28px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td valign="top" class="collection-hero-col" style="padding-right:24px;">
                        <p style="margin:0 0 8px;font-size:22px;line-height:1.2;color:#4f46e5;font-weight:900;">Hi ${escapeHtml(buyerFirstName)},</p>
                        <h1 style="margin:0 0 14px;font-size:34px;line-height:1.1;color:#0f172a;font-weight:900;letter-spacing:-0.04em;">We found ${selectedProperties.length} homes that match your requirements</h1>
                        <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#475569;">${escapeHtml(intro)}</p>
                        <table role="presentation" cellspacing="0" cellpadding="0">
                          <tr>
                            <td style="padding-right:12px;">
                              ${agentPhoto ? `<img src="${escapeHtml(agentPhoto)}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:999px;object-fit:cover;background:#e2e8f0;" />` : `<div style="width:56px;height:56px;border-radius:999px;background:#0f172a;color:#ffffff;text-align:center;line-height:56px;font-weight:900;">${escapeHtml(resolvedAgentName.slice(0, 1))}</div>`}
                            </td>
                            <td>
                              <p style="margin:0 0 3px;font-size:15px;color:#0f172a;font-weight:900;">${escapeHtml(resolvedAgentName)}</p>
                              <p style="margin:0 0 3px;font-size:13px;color:#475569;">${escapeHtml(resolvedAgencyName)}</p>
                              <p style="margin:0;font-size:13px;color:#475569;">${escapeHtml([resolvedAgentPhone, resolvedAgentEmail].filter(Boolean).join(' · '))}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="260" valign="top" class="collection-profile-col">${profileHtml}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="collection-padded" style="padding:0 34px 10px;">
                  <div style="height:1px;background:#e5e7eb;"></div>
                  <p style="margin:20px 0 16px;font-size:18px;color:#0f172a;font-weight:900;">Your Matched Properties</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${propertyRows}</table>
                </td>
              </tr>
              <tr>
                <td class="collection-padded" style="padding:16px 34px 34px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:24px;background:#f8f7ff;border:1px solid #ede9fe;">
                    <tr>
                      <td class="collection-cta-copy" style="padding:24px;">
                        <p style="margin:0 0 8px;font-size:18px;color:#0f172a;font-weight:900;">Ready to schedule a viewing?</p>
                        <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">I'd be happy to arrange viewings or provide more information on any of these properties.</p>
                      </td>
                      <td width="210" align="center" class="collection-cta-action" style="padding:24px;">
                        ${ctaUrl ? `<a href="${escapeHtml(ctaUrl)}" style="display:block;padding:14px 18px;border-radius:12px;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;">Schedule a Viewing</a><p style="margin:12px 0 0;font-size:13px;"><a href="mailto:${escapeHtml(resolvedAgentEmail)}" style="color:#4f46e5;text-decoration:none;font-weight:700;">Reply to this email</a></p>` : ''}
                      </td>
                    </tr>
                  </table>
                  <p style="margin:28px 0 0;text-align:center;font-size:12px;line-height:1.6;color:#64748b;">${escapeHtml(resolvedAgencyName)}<br />Helping you find the right home.</p>
                </td>
              </tr>
            </table>
            <!--[if mso]>
            </td></tr></table>
            <![endif]-->
          </td>
        </tr>
      </table>
    </div>
    </body>
    </html>
  `
  const text = [
    `Hi ${buyerFirstName},`,
    '',
    `We found ${selectedProperties.length} homes that match your requirements.`,
    intro,
    '',
    'Your Search Profile',
    ...profileFields.map((field) => `${field.label}: ${field.value}`),
    '',
    'Your Matched Properties',
    ...selectedProperties.map((property) => `${property.rank}. ${property.title} - ${property.price || 'Price on request'}${property.matchScore ? ` (${property.matchScore}% match)` : ''}`),
    '',
    'Ready to schedule a viewing? Reply to this email and I will arrange it.',
    '',
    resolvedAgentName,
    resolvedAgencyName,
  ].join('\n')
  return {
    subject: resolvedSubject,
    html,
    text,
    properties: selectedProperties,
    propertyIds: selectedProperties.map((property) => listingId(property.listing) || property.id).filter(Boolean),
    searchProfile: profileFields,
    recipient: leadEmail(lead),
  }
}

export async function sendPropertyCollectionEmail(payload = {}, { actor = null } = {}) {
  const lead = payload.lead || {}
  const organisationId = payload.organisationId || lead.organisationId || lead.organisation_id
  const leadId = payload.leadId || lead.leadId || lead.lead_id || lead.id
  const preview = buildPropertyCollectionEmailPreview(payload)
  if (!preview.recipient) return { ok: false, status: 'blocked', warning: 'This buyer does not have an email address yet.', preview }
  if (!preview.properties.length) return { ok: false, status: 'blocked', warning: 'Select at least one property to include.', preview }
  const preferenceConsent = await validateCommunicationSend({
    organisationId,
    leadId,
    channel: 'email',
    communicationType: 'property_collection',
  }, { actor })
  if (!preferenceConsent.ok) {
    return { ok: false, status: 'blocked', warning: preferenceConsent.message || COMMUNICATION_OPT_OUT_MESSAGE, preview }
  }
  const delivery = await prepareCommunicationDelivery({
    organisationId,
    leadId,
    listingId: preview.propertyIds[0],
    communicationType: 'property_collection',
    channel: 'email',
    recipient: preview.recipient,
    recipientRole: 'buyer',
    subject: preview.subject,
    messagePreview: preview.text,
    provider: 'resend',
    metadata: {
      type: 'property_collection_email_sent',
      collectionId: payload.collectionId || '',
      propertyIds: preview.propertyIds,
      propertyCount: preview.properties.length,
      sendMode: 'manual',
    },
  }, { actor, validateConsent: false })
  const sendResult = await invokeEdgeFunction('send-email', {
    body: {
      type: 'lead_property_share',
      to: preview.recipient,
      subject: preview.subject,
      html: preview.html,
      text: preview.text,
      message: preview.text,
      organisationId,
      leadId,
      listingId: preview.propertyIds[0],
      recipientRole: 'buyer',
      deliveryMetadata: {
        type: 'property_collection_email_sent',
        collectionId: payload.collectionId || '',
        propertyIds: preview.propertyIds,
        propertyCount: preview.properties.length,
        sendMode: 'manual',
      },
    },
  })
  const ok = Boolean(sendResult?.data?.ok || sendResult?.ok) && !sendResult?.error && !sendResult?.data?.error
  const deliveryUpdate = ok
    ? await markCommunicationDeliverySent(delivery.id, {
      provider: 'resend',
      providerMessageId: sendResult?.data?.emailId || sendResult?.data?.id || sendResult?.data?.providerMessageId || '',
      sentBy: actorId(actor),
    }).catch(() => delivery)
    : await markCommunicationDeliveryFailed(delivery.id, {
      provider: 'resend',
      errorMessage: sendResult?.error?.message || sendResult?.data?.error || 'property_collection_email_failed',
      sentBy: actorId(actor),
    }).catch(() => delivery)

  const status = ok ? 'sent' : 'failed'
  const buyerName = normalizeText(lead.name || lead.fullName || lead.full_name) || 'buyer'
  const event = await createCommunicationEvent({
    organisationId,
    leadId,
    contactId: lead.contactId || lead.contact_id,
    agentId: actorId(actor),
    communicationType: 'email',
    direction: 'outbound',
    subject: preview.subject,
    message: preview.text,
    summary: ok
      ? `Property collection email sent to ${buyerName}. ${preview.properties.length} matched properties included.`
      : `Property collection email failed for ${buyerName}.`,
    source: 'property_collection',
    status,
    metadata: {
      type: 'property_collection_email_sent',
      shareType: 'property_collection',
      collectionId: payload.collectionId || '',
      emailLogId: deliveryUpdate.id,
      deliveryId: deliveryUpdate.id,
      deliveryStatus: deliveryUpdate.status || status,
      propertyIds: preview.propertyIds,
      propertyCount: preview.properties.length,
      recipientEmail: preview.recipient,
      sentBy: actorId(actor),
      providerMessageId: deliveryUpdate.providerMessageId || '',
    },
  }, { actor, mirrorActivity: true }).catch(() => null)

  await Promise.all((payload.interestIds || []).map((interestId) => markLeadListingInterestSent({ interestId }, { actor }).catch(() => null)))
  return ok
    ? { ok: true, status: 'sent', preview, sendResult, delivery: deliveryUpdate, event }
    : {
      ok: false,
      status: 'failed',
      warning: sendResult?.error?.message || sendResult?.data?.error || "We couldn't send the email. Please try again.",
      preview,
      sendResult,
      delivery: deliveryUpdate,
      event,
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
