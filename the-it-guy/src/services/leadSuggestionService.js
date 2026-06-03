import { createAgencyCrmLeadActivity, listAgencyCrmLeadContacts } from '../lib/agencyCrmRepository'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  findListingsForRequirement,
  scoreListingAgainstRequirement,
} from './leadMatchingService'
import { upsertLeadListingInterest } from './leadListingInterestService'
import {
  buildRequirementSummary,
  getLeadRequirement,
  mapLeadRequirement,
} from './leadRequirementService'
import { getOrganisationPrivateListings } from './privateListingService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const LEAD_LISTING_SUGGESTION_STATUSES = ['pending', 'accepted', 'rejected', 'expired', 'converted']
const FINAL_STATUSES = ['accepted', 'rejected', 'converted']
const AVAILABLE_STATUS_HINTS = ['active', 'available', 'live', 'published', 'mandate_signed', 'ready']
const UNAVAILABLE_STATUS_HINTS = ['sold', 'archived', 'withdrawn', 'converted', 'removed', 'inactive', 'expired']

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function nullableUuid(value) {
  const normalized = normalizeText(value)
  return UUID_PATTERN.test(normalized) ? normalized : null
}

function normalizeStatus(value = 'pending') {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  return LEAD_LISTING_SUGGESTION_STATUSES.includes(normalized) ? normalized : 'pending'
}

function normalizeNumber(value) {
  if (normalizeText(value) === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function safeArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return [value]
  return []
}

function readId(row = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return ''
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before managing lead listing suggestions.')
  }
  return supabase
}

function actorId(actor = null) {
  return nullableUuid(actor?.id || actor?.user_id || actor?.userId)
}

function isRecoverableReadError(error, tableName = '') {
  const code = normalizeLower(error?.code)
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || code === 'pgrst204' || code === '42703' ||
    (tableName && message.includes(tableName.toLowerCase()) && (message.includes('does not exist') || message.includes('schema cache'))) ||
    message.includes('row-level security') || message.includes('permission denied')
}

function normalizeListingStatus(value = '') {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, '_')
}

export function isSuggestionEligibleListing(listing = {}) {
  const status = normalizeListingStatus(listing.status || listing.listingStatus || listing.listing_status)
  const visibility = normalizeListingStatus(listing.listingVisibility || listing.listing_visibility)
  if (visibility === 'archived') return false
  if (UNAVAILABLE_STATUS_HINTS.some((hint) => status.includes(hint))) return false
  if (!status) return true
  return AVAILABLE_STATUS_HINTS.some((hint) => status.includes(hint)) || !UNAVAILABLE_STATUS_HINTS.some((hint) => status.includes(hint))
}

export function mapLeadListingSuggestion(row = {}) {
  return {
    suggestionId: readId(row, ['suggestionId', 'suggestion_id', 'id']),
    organisationId: readId(row, ['organisationId', 'organisation_id']),
    leadId: readId(row, ['leadId', 'lead_id']),
    requirementId: readId(row, ['requirementId', 'requirement_id']),
    listingId: readId(row, ['listingId', 'listing_id']),
    score: normalizeNumber(row.score),
    reasons: safeArray(row.reasons),
    status: normalizeStatus(row.status),
    generatedBy: normalizeText(row.generatedBy || row.generated_by) || 'system',
    generatedAt: row.generatedAt || row.generated_at || null,
    reviewedBy: readId(row, ['reviewedBy', 'reviewed_by']),
    reviewedAt: row.reviewedAt || row.reviewed_at || null,
    acceptedAt: row.acceptedAt || row.accepted_at || null,
    rejectedAt: row.rejectedAt || row.rejected_at || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    listing: row.listing || null,
    lead: row.lead || null,
    requirement: row.requirement || null,
    raw: row,
  }
}

function buildSuggestionPayload(payload = {}) {
  const organisationId = nullableUuid(payload.organisationId || payload.organisation_id)
  const leadId = nullableUuid(payload.leadId || payload.lead_id)
  const requirementId = nullableUuid(payload.requirementId || payload.requirement_id)
  const listingId = nullableUuid(payload.listingId || payload.listing_id)
  if (!organisationId || !leadId || !requirementId || !listingId) {
    throw new Error('Valid organisation, lead, requirement, and listing ids are required for suggestions.')
  }
  return {
    organisation_id: organisationId,
    lead_id: leadId,
    requirement_id: requirementId,
    listing_id: listingId,
    score: normalizeNumber(payload.score),
    reasons: safeArray(payload.reasons),
    status: normalizeStatus(payload.status),
    generated_by: normalizeText(payload.generatedBy || payload.generated_by) || 'system',
    generated_at: payload.generatedAt || payload.generated_at || new Date().toISOString(),
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  }
}

async function readExistingSuggestions({ organisationId = '', requirementId = '', listingId = '', leadId = '' } = {}) {
  const client = requireClient()
  const orgId = nullableUuid(organisationId)
  if (!orgId) return []
  let query = client.from('lead_listing_suggestions').select('*').eq('organisation_id', orgId)
  if (nullableUuid(requirementId)) query = query.eq('requirement_id', nullableUuid(requirementId))
  if (nullableUuid(listingId)) query = query.eq('listing_id', nullableUuid(listingId))
  if (nullableUuid(leadId)) query = query.eq('lead_id', nullableUuid(leadId))
  const { data, error } = await query
  if (error) {
    if (isRecoverableReadError(error, 'lead_listing_suggestions')) return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map(mapLeadListingSuggestion)
}

async function upsertSuggestion(payload = {}) {
  const client = requireClient()
  const dbPayload = buildSuggestionPayload(payload)
  const { data, error } = await client
    .from('lead_listing_suggestions')
    .upsert(dbPayload, { onConflict: 'lead_id,requirement_id,listing_id' })
    .select('*')
    .single()
  if (error) throw error
  return mapLeadListingSuggestion(data)
}

async function updateSuggestionStatus({ suggestionId = '', status = '', metadata = {} } = {}, { actor = null } = {}) {
  const client = requireClient()
  const normalizedId = nullableUuid(suggestionId)
  if (!normalizedId) throw new Error('Suggestion id is required.')
  const normalizedStatus = normalizeStatus(status)
  const now = new Date().toISOString()
  const patch = {
    status: normalizedStatus,
    reviewed_by: actorId(actor),
    reviewed_at: ['accepted', 'rejected'].includes(normalizedStatus) ? now : null,
    accepted_at: normalizedStatus === 'accepted' ? now : null,
    rejected_at: normalizedStatus === 'rejected' ? now : null,
    metadata,
  }
  if (normalizedStatus === 'expired') {
    patch.reviewed_by = null
    patch.reviewed_at = null
  }
  const { data, error } = await client
    .from('lead_listing_suggestions')
    .update(patch)
    .eq('suggestion_id', normalizedId)
    .select('*')
    .single()
  if (error) throw error
  return mapLeadListingSuggestion(data)
}

async function readSuggestion(suggestionId = '') {
  const client = requireClient()
  const normalizedId = nullableUuid(suggestionId)
  if (!normalizedId) throw new Error('Suggestion id is required.')
  const { data, error } = await client
    .from('lead_listing_suggestions')
    .select('*')
    .eq('suggestion_id', normalizedId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Suggestion not found.')
  return mapLeadListingSuggestion(data)
}

function shouldRegenerate(existing = null, { force = false } = {}) {
  if (!existing) return true
  if (force) return !['accepted', 'converted'].includes(existing.status)
  return !FINAL_STATUSES.includes(existing.status)
}

export async function generateSuggestionsForRequirement({
  organisationId = '',
  requirementId = '',
  limit = 20,
  minScore = 35,
  force = false,
  generatedBy = 'system',
} = {}) {
  const result = await findListingsForRequirement({ organisationId, requirementId, limit: Math.max(limit, 100) })
  const requirement = result.requirement
  if (!requirement || requirement.status !== 'active') return []
  const matches = (result.matches || [])
    .filter((match) => isSuggestionEligibleListing(match))
    .filter((match) => !match.alreadyLinked)
    .filter((match) => Number(match.matchScore || 0) >= minScore)
    .slice(0, limit)
  const existing = await readExistingSuggestions({ organisationId: requirement.organisationId, requirementId: requirement.requirementId })
  const existingByListingId = new Map(existing.map((suggestion) => [suggestion.listingId, suggestion]))
  const saved = []
  for (const match of matches) {
    const current = existingByListingId.get(match.id)
    if (!shouldRegenerate(current, { force })) continue
    saved.push(await upsertSuggestion({
      organisationId: requirement.organisationId,
      leadId: requirement.leadId,
      requirementId: requirement.requirementId,
      listingId: match.id,
      score: match.matchScore,
      reasons: match.matchReasons,
      status: 'pending',
      generatedBy,
      metadata: {
        requirementSummary: buildRequirementSummary(requirement),
        listingTitle: match.title,
        regenerated: Boolean(current),
      },
    }))
  }
  return saved
}

async function listActiveRequirementsForOrganisation(organisationId = '') {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  if (!normalizedOrgId) return []
  const { data, error } = await client
    .from('lead_requirements')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1000)
  if (error) {
    if (isRecoverableReadError(error, 'lead_requirements')) return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map(mapLeadRequirement)
}

export async function generateSuggestionsForLead({ organisationId = '', leadId = '', limitPerRequirement = 20, force = false } = {}) {
  const requirements = (await listActiveRequirementsForOrganisation(organisationId)).filter((requirement) => requirement.leadId === leadId)
  const results = []
  for (const requirement of requirements) {
    results.push(...await generateSuggestionsForRequirement({
      organisationId: requirement.organisationId,
      requirementId: requirement.requirementId,
      limit: limitPerRequirement,
      force,
      generatedBy: 'lead_requirement_refresh',
    }))
  }
  return results
}

function normalizePrivateListing(row = {}) {
  const propertyDetails = row?.propertyDetails && typeof row.propertyDetails === 'object' ? row.propertyDetails : {}
  return {
    id: readId(row, ['id', 'listingId', 'listing_id']),
    organisationId: readId(row, ['organisationId', 'organisation_id']),
    title: normalizeText(row.title || row.listingTitle || row.property_address || row.propertyAddress || row.addressLine1 || propertyDetails.headline || 'Untitled listing'),
    address: normalizeText(row.addressLine1 || row.address_line_1 || row.propertyAddress || row.property_address || propertyDetails.addressLine1),
    suburb: normalizeText(row.suburb || propertyDetails.suburb),
    city: normalizeText(row.city || propertyDetails.city),
    province: normalizeText(row.province || propertyDetails.province),
    price: normalizeNumber(row.askingPrice ?? row.asking_price ?? propertyDetails.price),
    propertyType: normalizeText(row.propertyType || row.property_type || propertyDetails.propertyType),
    status: normalizeText(row.listingStatus || row.listing_status || row.status),
    bedrooms: normalizeNumber(row.bedrooms ?? propertyDetails.bedrooms),
    bathrooms: normalizeNumber(row.bathrooms ?? propertyDetails.bathrooms),
    garages: normalizeNumber(row.garages ?? propertyDetails.garages),
    coveredParking: normalizeNumber(row.coveredParking ?? row.covered_parking ?? propertyDetails.coveredParking),
    openParking: normalizeNumber(row.openParking ?? row.open_parking ?? propertyDetails.openParking),
    raw: row,
  }
}

export async function generateSuggestionsForListing({
  organisationId = '',
  listingId = '',
  limit = 100,
  minScore = 35,
  force = false,
  generatedBy = 'listing_refresh',
} = {}) {
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedListingId = nullableUuid(listingId)
  if (!normalizedOrgId || !normalizedListingId) return []
  const rows = await getOrganisationPrivateListings(normalizedOrgId, { includeRequirementsAndDocuments: false }).catch((error) => {
    if (isRecoverableReadError(error, 'private_listings')) return []
    throw error
  })
  const listing = rows.map(normalizePrivateListing).find((row) => row.id === normalizedListingId)
  if (!listing || !isSuggestionEligibleListing(listing)) return []
  const requirements = await listActiveRequirementsForOrganisation(normalizedOrgId)
  const existing = await readExistingSuggestions({ organisationId: normalizedOrgId, listingId: normalizedListingId })
  const existingByRequirementId = new Map(existing.map((suggestion) => [suggestion.requirementId, suggestion]))
  const saved = []
  for (const requirement of requirements) {
    const score = scoreListingAgainstRequirement({ listing, requirement })
    if (Number(score.matchScore || 0) < minScore) continue
    const current = existingByRequirementId.get(requirement.requirementId)
    if (!shouldRegenerate(current, { force })) continue
    saved.push(await upsertSuggestion({
      organisationId: normalizedOrgId,
      leadId: requirement.leadId,
      requirementId: requirement.requirementId,
      listingId: normalizedListingId,
      score: score.matchScore,
      reasons: score.matchReasons,
      status: 'pending',
      generatedBy,
      metadata: {
        requirementSummary: buildRequirementSummary(requirement),
        listingTitle: listing.title,
        regenerated: Boolean(current),
      },
    }))
    if (saved.length >= limit) break
  }
  return saved
}

export async function generateAllSuggestions({ organisationId = '', limitPerRequirement = 20, force = false } = {}) {
  const requirements = await listActiveRequirementsForOrganisation(organisationId)
  const saved = []
  for (const requirement of requirements) {
    saved.push(...await generateSuggestionsForRequirement({
      organisationId: requirement.organisationId,
      requirementId: requirement.requirementId,
      limit: limitPerRequirement,
      force,
      generatedBy: 'batch_refresh',
    }))
  }
  return saved
}

export async function acceptSuggestion({ suggestionId = '' } = {}, { actor = null } = {}) {
  const suggestion = await readSuggestion(suggestionId)
  if (!['pending', 'expired'].includes(suggestion.status)) {
    if (suggestion.status === 'accepted') return suggestion
    throw new Error('Only pending suggestions can be accepted.')
  }
  const requirement = await getLeadRequirement({ requirementId: suggestion.requirementId })
  const interest = await upsertLeadListingInterest(
    {
      organisationId: suggestion.organisationId,
      leadId: suggestion.leadId,
      contactId: requirement?.contactId,
      listingId: suggestion.listingId,
      requirementId: suggestion.requirementId,
      source: 'automated_suggestion',
      status: 'suggested',
      isAgentSelected: true,
      isSystemSuggested: true,
      matchScore: suggestion.score,
      matchReasons: suggestion.reasons,
      createdBy: actor?.id,
    },
    { actor },
  )
  const updated = await updateSuggestionStatus(
    {
      suggestionId: suggestion.suggestionId,
      status: 'accepted',
      metadata: {
        ...suggestion.metadata,
        acceptedInterestId: interest?.interestId,
      },
    },
    { actor },
  )
  try {
    await createAgencyCrmLeadActivity(
      suggestion.organisationId,
      suggestion.leadId,
      {
        activityType: 'Suggestion accepted',
        activityNote: 'Automated listing suggestion accepted by agent.',
        outcome: 'automated_suggestion_accepted',
      },
      { actor },
    )
  } catch (error) {
    console.warn('[leadSuggestionService] accept activity skipped', error)
  }
  void import('./leadActionEngineService')
    .then(({ processSuggestionEvent }) => processSuggestionEvent({
      organisationId: suggestion.organisationId,
      leadId: suggestion.leadId,
      contactId: requirement?.contactId,
      eventType: 'suggestion_accepted',
      status: 'accepted',
      suggestionId: suggestion.suggestionId,
      sourceEvent: `suggestion_accepted:${suggestion.suggestionId}`,
      metadata: {
        suggestionId: suggestion.suggestionId,
        listingId: suggestion.listingId,
        requirementId: suggestion.requirementId,
        interestId: interest?.interestId,
      },
    }, { actor }))
    .catch((recommendationError) => console.warn('[leadSuggestionService] recommendation generation skipped', recommendationError))
  return { ...updated, acceptedInterest: interest }
}

export function rejectSuggestion({ suggestionId = '', reason = '' } = {}, options = {}) {
  return updateSuggestionStatus({ suggestionId, status: 'rejected', metadata: { reason: normalizeText(reason) || 'Rejected by agent.' } }, options)
}

export function expireSuggestion({ suggestionId = '', reason = 'Suggestion expired.' } = {}, options = {}) {
  return updateSuggestionStatus({ suggestionId, status: 'expired', metadata: { reason: normalizeText(reason) } }, options)
}

async function enrichSuggestions(organisationId = '', rows = []) {
  const mapped = rows.map(mapLeadListingSuggestion)
  const [snapshot, listings, requirements] = await Promise.all([
    listAgencyCrmLeadContacts(organisationId).catch(() => ({ leads: [], contacts: [] })),
    getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false }).catch(() => []),
    listActiveRequirementsForOrganisation(organisationId).catch(() => []),
  ])
  const leadsById = new Map((snapshot.leads || []).map((lead) => [readId(lead, ['leadId', 'lead_id', 'id']), lead]).filter(([id]) => id))
  const contactsById = new Map((snapshot.contacts || []).map((contact) => [readId(contact, ['contactId', 'contact_id', 'id']), contact]).filter(([id]) => id))
  const listingsById = new Map(listings.map(normalizePrivateListing).map((listing) => [listing.id, listing]).filter(([id]) => id))
  const requirementsById = new Map(requirements.map((requirement) => [requirement.requirementId, requirement]).filter(([id]) => id))
  return mapped.map((suggestion) => {
    const lead = leadsById.get(suggestion.leadId) || {}
    const contact = contactsById.get(readId(lead, ['contactId', 'contact_id'])) || {}
    const requirement = requirementsById.get(suggestion.requirementId) || null
    const leadName = normalizeText(contact.fullName || contact.full_name) ||
      [contact.firstName || contact.first_name || lead.firstName || lead.first_name, contact.lastName || contact.last_name || lead.lastName || lead.last_name].map(normalizeText).filter(Boolean).join(' ') ||
      normalizeText(lead.name) ||
      'Unnamed lead'
    return {
      ...suggestion,
      listing: listingsById.get(suggestion.listingId) || null,
      requirement,
      requirementSummary: buildRequirementSummary(requirement || suggestion.metadata),
      lead: {
        ...lead,
        name: leadName,
        email: normalizeText(contact.email || lead.email || lead.sellerEmail || lead.seller_email).toLowerCase(),
        phone: normalizeText(contact.phone || contact.phone_number || lead.phone || lead.sellerPhone || lead.seller_phone),
        assignedAgent: normalizeText(lead.assignedAgentName || lead.assigned_agent_name || lead.assignedAgentEmail || lead.assigned_agent_email || lead.assignedAgentId || lead.assigned_agent_id) || 'Unassigned',
      },
    }
  })
}

export async function getSuggestionsForLead({ organisationId = '', leadId = '', status = 'all' } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedLeadId = nullableUuid(leadId)
  if (!normalizedOrgId || !normalizedLeadId) return []
  let query = client
    .from('lead_listing_suggestions')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .eq('lead_id', normalizedLeadId)
    .order('score', { ascending: false })
    .order('generated_at', { ascending: false })
  if (status && status !== 'all') query = query.eq('status', normalizeStatus(status))
  const { data, error } = await query
  if (error) {
    if (isRecoverableReadError(error, 'lead_listing_suggestions')) return []
    throw error
  }
  return enrichSuggestions(normalizedOrgId, data || [])
}

export async function getSuggestionsForListing({ organisationId = '', listingId = '', status = 'all' } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedListingId = nullableUuid(listingId)
  if (!normalizedOrgId || !normalizedListingId) return []
  let query = client
    .from('lead_listing_suggestions')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .eq('listing_id', normalizedListingId)
    .order('score', { ascending: false })
    .order('generated_at', { ascending: false })
  if (status && status !== 'all') query = query.eq('status', normalizeStatus(status))
  const { data, error } = await query
  if (error) {
    if (isRecoverableReadError(error, 'lead_listing_suggestions')) return []
    throw error
  }
  return enrichSuggestions(normalizedOrgId, data || [])
}

export async function expireStaleSuggestions({ organisationId = '', days = 30 } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  if (!normalizedOrgId) return []
  const cutoff = new Date(Date.now() - Math.max(1, Number(days || 30)) * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await client
    .from('lead_listing_suggestions')
    .update({ status: 'expired', metadata: { reason: `${days} day expiry` } })
    .eq('organisation_id', normalizedOrgId)
    .eq('status', 'pending')
    .lt('generated_at', cutoff)
    .select('*')
  if (error) {
    if (isRecoverableReadError(error, 'lead_listing_suggestions')) return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map(mapLeadListingSuggestion)
}

export const __leadSuggestionServiceTestUtils = {
  buildSuggestionPayload,
  isSuggestionEligibleListing,
  mapLeadListingSuggestion,
  normalizePrivateListing,
  normalizeStatus,
  shouldRegenerate,
}
