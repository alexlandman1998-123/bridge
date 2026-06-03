import { createAgencyCrmLeadActivity, listAgencyCrmLeadContacts } from '../lib/agencyCrmRepository'
import { createAppointmentAsync } from '../lib/agencyPipelineService'
import { listCanonicalOffersForLead } from '../lib/buyerLifecycleService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getOrganisationPrivateListings } from './privateListingService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LEAD_LISTING_INTEREST_STATUSES = [
  'interested',
  'suggested',
  'shortlisted',
  'sent',
  'viewed',
  'viewing_scheduled',
  'dismissed',
  'offer_submitted',
  'converted',
]

const STATUS_ACTIVITY = {
  interested: ['Listing linked to lead', 'Listing linked to lead.'],
  suggested: ['Listing suggested to lead', 'Listing suggested to lead.'],
  shortlisted: ['Listing shortlisted for lead', 'Listing shortlisted for lead.'],
  sent: ['Listing sent to lead', 'Listing sent to lead.'],
  viewed: ['Listing viewed by lead', 'Listing viewed by lead.'],
  viewing_scheduled: ['Viewing scheduled from listing interest', 'Viewing scheduled from listing interest.'],
  dismissed: ['Listing dismissed', 'Listing dismissed from lead interest.'],
  offer_submitted: ['Offer submitted', 'Offer submitted for interested listing.'],
  converted: ['Listing interest converted', 'Listing interest converted through existing transaction flow.'],
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

function nullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function normalizeStatus(value, fallback = 'interested') {
  const normalized = normalizeLower(value)
  return LEAD_LISTING_INTEREST_STATUSES.includes(normalized) ? normalized : fallback
}

function normalizeMatchReasons(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return [value]
  const text = normalizeText(value)
  return text ? [text] : []
}

function normalizeNumber(value) {
  if (normalizeText(value) === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function readId(row = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return ''
}

function isRecoverableReadError(error, tableName = '') {
  const code = normalizeLower(error?.code)
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || code === 'pgrst204' || code === '42703' ||
    (tableName && message.includes(tableName.toLowerCase()) && (message.includes('does not exist') || message.includes('schema cache'))) ||
    message.includes('row-level security') || message.includes('permission denied')
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before managing lead listing interests.')
  }
  return supabase
}

function normalizeListing(row = {}) {
  const propertyDetails = row?.propertyDetails && typeof row.propertyDetails === 'object' ? row.propertyDetails : {}
  const marketing = row?.marketing && typeof row.marketing === 'object' ? row.marketing : {}
  return {
    id: readId(row, ['id', 'listingId', 'listing_id']),
    organisationId: readId(row, ['organisationId', 'organisation_id']),
    title: normalizeText(row?.listingTitle || row?.title || propertyDetails.headline || row?.addressLine1 || row?.address_line_1 || 'Untitled listing'),
    address: normalizeText(row?.propertyAddress || row?.addressLine1 || row?.address_line_1 || propertyDetails.addressLine1),
    suburb: normalizeText(row?.suburb || propertyDetails.suburb),
    city: normalizeText(row?.city || propertyDetails.city),
    province: normalizeText(row?.province || propertyDetails.province),
    price: normalizeNumber(row?.askingPrice ?? row?.asking_price ?? propertyDetails.price),
    status: normalizeText(row?.listingStatus || row?.listing_status || row?.status),
    imageUrl: normalizeText(marketing.mediaUrl || row?.imageUrl || row?.image_url),
    bedrooms: normalizeNumber(row?.bedrooms ?? propertyDetails.bedrooms),
    bathrooms: normalizeNumber(row?.bathrooms ?? propertyDetails.bathrooms),
    garages: normalizeNumber(row?.garages ?? propertyDetails.garages),
    coveredParking: normalizeNumber(row?.coveredParking ?? propertyDetails.coveredParking),
    openParking: normalizeNumber(row?.openParking ?? propertyDetails.openParking),
    updatedAt: row?.updatedAt || row?.updated_at || null,
    createdAt: row?.createdAt || row?.created_at || null,
    raw: row,
  }
}

function normalizeLead(row = {}, contact = null) {
  const name = [
    contact?.firstName || contact?.first_name || row?.firstName || row?.sellerName,
    contact?.lastName || contact?.last_name || row?.lastName || row?.sellerSurname,
  ].map(normalizeText).filter(Boolean).join(' ')
  return {
    id: readId(row, ['leadId', 'lead_id', 'id']),
    contactId: readId(row, ['contactId', 'contact_id']),
    name: name || normalizeText(row?.name) || 'Unnamed lead',
    phone: normalizeText(contact?.phone || row?.phone || row?.sellerPhone),
    email: normalizeText(contact?.email || row?.email || row?.sellerEmail).toLowerCase(),
    source: normalizeText(row?.leadSource || row?.lead_source) || 'Unknown',
    status: normalizeText(row?.status || row?.stage) || 'Unknown',
    stage: normalizeText(row?.stage || row?.status) || 'Unknown',
    assignedAgent: normalizeText(row?.assignedAgentName || row?.assignedAgentEmail || row?.assignedAgentId || row?.assigned_agent_id) || 'Unassigned',
    createdAt: row?.createdAt || row?.created_at || null,
    raw: row,
  }
}

export function mapLeadListingInterest(row = {}, { listing = null, lead = null, contact = null, offers = [] } = {}) {
  return {
    id: readId(row, ['interestId', 'interest_id', 'id']),
    interestId: readId(row, ['interestId', 'interest_id', 'id']),
    organisationId: readId(row, ['organisationId', 'organisation_id']),
    leadId: readId(row, ['leadId', 'lead_id']),
    contactId: readId(row, ['contactId', 'contact_id']),
    listingId: readId(row, ['listingId', 'listing_id']),
    source: normalizeText(row?.source) || 'manual',
    status: normalizeStatus(row?.status),
    matchScore: row?.matchScore ?? row?.match_score ?? null,
    matchReasons: normalizeMatchReasons(row?.matchReasons ?? row?.match_reasons),
    notes: normalizeText(row?.notes),
    isOriginalEnquiry: Boolean(row?.isOriginalEnquiry ?? row?.is_original_enquiry),
    isAgentSelected: Boolean(row?.isAgentSelected ?? row?.is_agent_selected),
    isSystemSuggested: Boolean(row?.isSystemSuggested ?? row?.is_system_suggested),
    dismissedAt: row?.dismissedAt || row?.dismissed_at || null,
    viewedAt: row?.viewedAt || row?.viewed_at || null,
    sentAt: row?.sentAt || row?.sent_at || null,
    createdBy: readId(row, ['createdBy', 'created_by']),
    createdAt: row?.createdAt || row?.created_at || null,
    updatedAt: row?.updatedAt || row?.updated_at || null,
    listing: listing ? normalizeListing(listing) : null,
    lead: lead ? normalizeLead(lead, contact) : null,
    contact,
    offers,
    raw: row,
  }
}

export function buildLeadListingInterestPayload(payload = {}) {
  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : {}
  const contact = payload.contact && typeof payload.contact === 'object' ? payload.contact : {}
  const listing = payload.listing && typeof payload.listing === 'object' ? payload.listing : {}
  const organisationId = nullableUuid(payload.organisationId || payload.organisation_id || lead.organisationId || lead.organisation_id || listing.organisationId || listing.organisation_id)
  const leadId = nullableUuid(payload.leadId || payload.lead_id || lead.leadId || lead.lead_id || lead.id)
  const contactId = nullableUuid(payload.contactId || payload.contact_id || contact.contactId || contact.contact_id || contact.id || lead.contactId || lead.contact_id)
  const listingId = nullableUuid(payload.listingId || payload.listing_id || listing.id || listing.listingId || listing.listing_id)
  if (!organisationId || !leadId || !listingId) {
    throw new Error('A valid organisation id, lead id, and listing id are required for lead listing interests.')
  }

  return {
    organisation_id: organisationId,
    lead_id: leadId,
    contact_id: contactId,
    listing_id: listingId,
    source: normalizeText(payload.source) || 'manual',
    status: normalizeStatus(payload.status),
    match_score: payload.matchScore === undefined && payload.match_score === undefined ? null : normalizeNumber(payload.matchScore ?? payload.match_score),
    match_reasons: normalizeMatchReasons(payload.matchReasons ?? payload.match_reasons),
    notes: normalizeText(payload.notes) || null,
    is_original_enquiry: Boolean(payload.isOriginalEnquiry ?? payload.is_original_enquiry),
    is_agent_selected: Boolean(payload.isAgentSelected ?? payload.is_agent_selected),
    is_system_suggested: Boolean(payload.isSystemSuggested ?? payload.is_system_suggested),
    created_by: nullableUuid(payload.createdBy || payload.created_by),
  }
}

function statusPatch(status, extra = {}) {
  const normalized = normalizeStatus(status)
  const now = new Date().toISOString()
  return {
    status: normalized,
    ...(normalized === 'sent' ? { sent_at: now } : {}),
    ...(normalized === 'viewed' ? { viewed_at: now } : {}),
    ...(normalized === 'dismissed' ? { dismissed_at: now } : {}),
    ...extra,
  }
}

async function logLeadInterestActivity(organisationId, leadId, status, { note = '', actor = null } = {}) {
  const [activityType, fallbackNote] = STATUS_ACTIVITY[normalizeStatus(status)] || STATUS_ACTIVITY.interested
  try {
    await createAgencyCrmLeadActivity(
      organisationId,
      leadId,
      {
        activityType,
        activityNote: normalizeText(note) || fallbackNote,
        outcome: normalizeStatus(status),
      },
      { actor },
    )
  } catch (error) {
    console.warn('[leadListingInterestService] activity logging skipped', error)
  }
}

async function getInterestById(interestId = '') {
  const client = requireClient()
  const normalizedId = nullableUuid(interestId)
  if (!normalizedId) throw new Error('Interest id is required.')
  const { data, error } = await client
    .from('lead_listing_interests')
    .select('*')
    .eq('interest_id', normalizedId)
    .maybeSingle()
  if (error) throw error
  return data ? mapLeadListingInterest(data) : null
}

async function enrichInterests(organisationId = '', rows = []) {
  const interests = Array.isArray(rows) ? rows.map((row) => mapLeadListingInterest(row)) : []
  if (!interests.length) return []
  const listingIds = [...new Set(interests.map((item) => item.listingId).filter(Boolean))]
  const [allListings, crm] = await Promise.all([
    listSearchablePrivateListings({ organisationId }),
    listAgencyCrmLeadContacts(organisationId).catch(() => ({ leads: [], contacts: [] })),
  ])
  const listingById = new Map(allListings.map((listing) => [listing.id, listing]))
  const contactById = new Map((crm.contacts || []).map((contact) => [contact.contactId || contact.contact_id, contact]))
  const leadById = new Map((crm.leads || []).map((lead) => [lead.leadId || lead.lead_id || lead.id, lead]))

  const offerRowsByLeadListing = new Map()
  await Promise.all(interests.map(async (interest) => {
    if (!interest.leadId) return
    try {
      const offers = await listCanonicalOffersForLead({
        organisationId,
        leadId: interest.leadId,
        contactId: interest.contactId,
        listingIds: listingIds.filter((id) => id === interest.listingId),
      })
      offerRowsByLeadListing.set(`${interest.leadId}:${interest.listingId}`, Array.isArray(offers) ? offers : [])
    } catch {
      offerRowsByLeadListing.set(`${interest.leadId}:${interest.listingId}`, [])
    }
  }))

  return interests.map((interest) => {
    const lead = leadById.get(interest.leadId) || null
    const contact = contactById.get(interest.contactId || lead?.contactId || lead?.contact_id) || null
    return {
      ...interest,
      listing: listingById.get(interest.listingId) || null,
      lead: lead ? normalizeLead(lead, contact) : null,
      contact,
      offers: offerRowsByLeadListing.get(`${interest.leadId}:${interest.listingId}`) || [],
    }
  })
}

export async function listSearchablePrivateListings({ organisationId = '', search = '', status = 'all', minPrice = '', maxPrice = '' } = {}) {
  const normalizedOrgId = nullableUuid(organisationId)
  if (!normalizedOrgId) return []
  const rows = await getOrganisationPrivateListings(normalizedOrgId, { includeRequirementsAndDocuments: false }).catch((error) => {
    if (isRecoverableReadError(error, 'private_listings')) return []
    throw error
  })
  const query = normalizeLower(search)
  const normalizedStatus = normalizeLower(status)
  const min = normalizeNumber(minPrice)
  const max = normalizeNumber(maxPrice)
  return rows.map(normalizeListing).filter((listing) => {
    if (query) {
      const haystack = [listing.title, listing.address, listing.suburb, listing.city, listing.province].map(normalizeLower).join(' ')
      if (!haystack.includes(query)) return false
    }
    if (normalizedStatus && normalizedStatus !== 'all' && normalizeLower(listing.status) !== normalizedStatus) return false
    if (min !== null && Number(listing.price || 0) < min) return false
    if (max !== null && Number(listing.price || 0) > max) return false
    return true
  })
}

export async function listLeadListingInterests({ organisationId = '', leadId = '' } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedLeadId = nullableUuid(leadId)
  if (!normalizedOrgId || !normalizedLeadId) return []
  const { data, error } = await client
    .from('lead_listing_interests')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .eq('lead_id', normalizedLeadId)
    .order('updated_at', { ascending: false })
  if (error) {
    if (isRecoverableReadError(error, 'lead_listing_interests')) return []
    throw error
  }
  return enrichInterests(normalizedOrgId, data || [])
}

export async function listListingLeadInterests({ organisationId = '', listingId = '' } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedListingId = nullableUuid(listingId)
  if (!normalizedOrgId || !normalizedListingId) return []
  const { data, error } = await client
    .from('lead_listing_interests')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .eq('listing_id', normalizedListingId)
    .order('updated_at', { ascending: false })
  if (error) {
    if (isRecoverableReadError(error, 'lead_listing_interests')) return []
    throw error
  }
  return enrichInterests(normalizedOrgId, data || [])
}

export async function createLeadListingInterest(payload = {}, { actor = null } = {}) {
  const client = requireClient()
  const dbPayload = buildLeadListingInterestPayload(payload)
  const { data, error } = await client
    .from('lead_listing_interests')
    .insert(dbPayload)
    .select('*')
    .single()
  if (error) throw error
  await logLeadInterestActivity(dbPayload.organisation_id, dbPayload.lead_id, dbPayload.status, { actor })
  return mapLeadListingInterest(data)
}

export async function upsertLeadListingInterest(payload = {}, { actor = null } = {}) {
  const client = requireClient()
  const dbPayload = buildLeadListingInterestPayload(payload)
  const { data, error } = await client
    .from('lead_listing_interests')
    .upsert(
      {
        ...dbPayload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'lead_id,listing_id' },
    )
    .select('*')
    .single()
  if (error) throw error
  await logLeadInterestActivity(dbPayload.organisation_id, dbPayload.lead_id, dbPayload.status, { actor })
  return mapLeadListingInterest(data)
}

export async function updateLeadListingInterestStatus({ interestId = '', status = '', notes = '' } = {}, { actor = null } = {}) {
  const client = requireClient()
  const normalizedId = nullableUuid(interestId)
  if (!normalizedId) throw new Error('Interest id is required.')
  const patch = statusPatch(status, notes ? { notes: normalizeText(notes) } : {})
  const { data, error } = await client
    .from('lead_listing_interests')
    .update(patch)
    .eq('interest_id', normalizedId)
    .select('*')
    .single()
  if (error) throw error
  const mapped = mapLeadListingInterest(data)
  await logLeadInterestActivity(mapped.organisationId, mapped.leadId, mapped.status, { note: notes, actor })
  return mapped
}

export async function dismissLeadListingInterest({ interestId = '', reason = '' } = {}, options = {}) {
  return updateLeadListingInterestStatus({ interestId, status: 'dismissed', notes: reason }, options)
}

export async function markLeadListingInterestSent({ interestId = '' } = {}, options = {}) {
  return updateLeadListingInterestStatus({ interestId, status: 'sent' }, options)
}

export async function markLeadListingInterestViewed({ interestId = '' } = {}, options = {}) {
  return updateLeadListingInterestStatus({ interestId, status: 'viewed' }, options)
}

export async function updateLeadListingInterestNotes({ interestId = '', notes = '' } = {}, { actor = null } = {}) {
  const client = requireClient()
  const normalizedId = nullableUuid(interestId)
  if (!normalizedId) throw new Error('Interest id is required.')
  const { data, error } = await client
    .from('lead_listing_interests')
    .update({ notes: normalizeText(notes) || null })
    .eq('interest_id', normalizedId)
    .select('*')
    .single()
  if (error) throw error
  const mapped = mapLeadListingInterest(data)
  await logLeadInterestActivity(mapped.organisationId, mapped.leadId, mapped.status, { note: 'Listing interest note updated.', actor })
  return mapped
}

export async function deleteLeadListingInterest({ interestId = '' } = {}) {
  const client = requireClient()
  const normalizedId = nullableUuid(interestId)
  if (!normalizedId) throw new Error('Interest id is required.')
  const existing = await getInterestById(normalizedId)
  const { error } = await client
    .from('lead_listing_interests')
    .delete()
    .eq('interest_id', normalizedId)
  if (error) throw error
  return existing
}

export async function scheduleViewingFromLeadListingInterest({
  organisationId = '',
  interest = null,
  date = '',
  time = '',
  notes = '',
  actor = null,
} = {}) {
  const scopedOrganisationId = nullableUuid(organisationId || interest?.organisationId || interest?.organisation_id)
  if (!scopedOrganisationId || !interest?.leadId || !interest?.listingId) {
    throw new Error('A lead listing interest with organisation, lead, and listing context is required.')
  }
  const appointment = await createAppointmentAsync(
    scopedOrganisationId,
    {
      title: 'Viewing',
      appointmentType: 'Viewing',
      date,
      startTime: time,
      status: 'requested',
      notes,
      leadId: interest.leadId,
      contactId: interest.contactId || null,
      listingId: interest.listingId,
      sendInviteEmails: false,
      attachCalendarInvite: false,
      assignedAgent: actor,
    },
    { actor },
  )
  await updateLeadListingInterestStatus({ interestId: interest.interestId || interest.id, status: 'viewing_scheduled' }, { actor })
  return appointment
}

export const __leadListingInterestServiceTestUtils = {
  buildLeadListingInterestPayload,
  mapLeadListingInterest,
  normalizeListing,
  normalizeLead,
  normalizeStatus,
}
