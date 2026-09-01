import {
  createAgencyCrmLeadActivity,
  createAgencyCrmLeadRecord,
  createAgencyCrmLeadTask,
  updateAgencyCrmContactRecord,
} from '../lib/agencyCrmRepository'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { createLeadRequirement, listLeadRequirements } from './leadRequirementService'
import { upsertLeadListingInterest } from './leadListingInterestService'
import { autoAssignLead } from './leadAssignmentService'
import { createAgencyIntroducedDeveloperLead } from './developerLeadService'
import { inferLeadCategoryFromRecord, inferLeadCategoryFromSource, normalizeLeadCategory } from '../lib/leadCategory'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACTIVE_LEAD_BLOCKLIST = ['converted', 'lost', 'archived', 'closed', 'dead']

export const CANONICAL_LEAD_SOURCES = [
  'Property24',
  'Private Property',
  'Website',
  'WhatsApp',
  'Referral',
  'Facebook',
  'Google',
  'Show Day',
  'Walk-In',
  'Manual Import',
  'Other',
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeEmail(value) {
  return normalizeLower(value)
}

function normalizePhone(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const plus = text.startsWith('+') ? '+' : ''
  return `${plus}${text.replace(/[^\d]/g, '')}`
}

function normalizeListingMatchText(value = '') {
  return normalizeLower(value)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:for|sale|rent|to|let|property|listing|enquiry|new)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeDevelopmentMatchText(value = '') {
  return normalizeListingMatchText(value)
    .replace(/\b(?:development|estate|residences|residence|apartments|apartment|unit|units)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreListingTextMatch(listing = {}, enquiry = {}) {
  const enquirySignals = [
    enquiry.lead?.enquiredPropertyTitle,
    enquiry.lead?.enquiredPropertyAddress,
    enquiry.lead?.propertyInterest,
    enquiry.raw?.propertyTitle,
    enquiry.raw?.propertyAddress,
  ].map(normalizeListingMatchText).filter((value) => value.length >= 6)
  if (!enquirySignals.length) return 0
  const listingSignals = [
    listing.title,
    listing.property_address,
    listing.address_line_1,
    [listing.address_line_1, listing.suburb, listing.city].filter(Boolean).join(' '),
  ].map(normalizeListingMatchText).filter((value) => value.length >= 6)
  if (!listingSignals.length) return 0

  let bestScore = 0
  for (const enquirySignal of enquirySignals) {
    const enquiryTokens = new Set(enquirySignal.split(' ').filter((token) => token.length > 2))
    for (const listingSignal of listingSignals) {
      if (enquirySignal === listingSignal) bestScore = Math.max(bestScore, 1)
      if (enquirySignal.includes(listingSignal) || listingSignal.includes(enquirySignal)) bestScore = Math.max(bestScore, 0.92)
      const listingTokens = new Set(listingSignal.split(' ').filter((token) => token.length > 2))
      const overlap = [...enquiryTokens].filter((token) => listingTokens.has(token)).length
      const denominator = Math.max(1, Math.min(enquiryTokens.size, listingTokens.size))
      bestScore = Math.max(bestScore, overlap / denominator)
    }
  }
  return Number(bestScore.toFixed(2))
}

function scoreDevelopmentTextMatch(development = {}, enquiry = {}) {
  const raw = enquiry.raw || {}
  const explicitDevelopmentSignals = [
    enquiry.developmentName,
    raw.developmentName,
    raw.development_name,
    raw.primaryDevelopmentName,
    raw.primary_development_name,
    raw.projectName,
    raw.project_name,
  ].map(normalizeDevelopmentMatchText).filter((value) => value.length >= 4)
  const enquirySignals = [
    ...explicitDevelopmentSignals,
    enquiry.lead?.enquiredPropertyTitle,
    enquiry.lead?.enquiredPropertyAddress,
    enquiry.lead?.propertyInterest,
    enquiry.message,
    raw.propertyTitle,
    raw.property_title,
    raw.propertyAddress,
    raw.property_address,
  ].map(normalizeDevelopmentMatchText).filter((value) => value.length >= 4)
  if (!enquirySignals.length) return 0

  const developmentSignals = [
    development.name,
    development.development_name,
    development.developer_company,
    development.location,
    development.address,
    development.formatted_address,
    development.street_address,
    [development.suburb, development.city].filter(Boolean).join(' '),
    [development.name, development.suburb, development.city].filter(Boolean).join(' '),
  ].map(normalizeDevelopmentMatchText).filter((value) => value.length >= 4)
  if (!developmentSignals.length) return 0

  let bestScore = 0
  for (const enquirySignal of enquirySignals) {
    const enquiryTokens = new Set(enquirySignal.split(' ').filter((token) => token.length > 2))
    for (const developmentSignal of developmentSignals) {
      if (enquirySignal === developmentSignal) bestScore = Math.max(bestScore, explicitDevelopmentSignals.includes(enquirySignal) ? 1 : 0.96)
      if (enquirySignal.includes(developmentSignal) || developmentSignal.includes(enquirySignal)) {
        bestScore = Math.max(bestScore, explicitDevelopmentSignals.includes(enquirySignal) ? 0.98 : 0.9)
      }
      const developmentTokens = new Set(developmentSignal.split(' ').filter((token) => token.length > 2))
      const overlap = [...enquiryTokens].filter((token) => developmentTokens.has(token)).length
      const denominator = Math.max(1, Math.min(enquiryTokens.size, developmentTokens.size))
      bestScore = Math.max(bestScore, overlap / denominator)
    }
  }
  return Number(bestScore.toFixed(2))
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.padEnd(32, '0').slice(0, 32)
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-8${seed.slice(17, 20)}-${seed.slice(20, 32)}`
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before ingesting external leads.')
  }
  return supabase
}

function sourceKey(value = '') {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, '')
}

export function normalizeLeadSource(value = '') {
  const key = sourceKey(value)
  const map = {
    property24: 'Property24',
    p24: 'Property24',
    privateproperty: 'Private Property',
    privatepropertysa: 'Private Property',
    website: 'Website',
    web: 'Website',
    whatsapp: 'WhatsApp',
    wa: 'WhatsApp',
    referral: 'Referral',
    facebook: 'Facebook',
    google: 'Google',
    showday: 'Show Day',
    showing: 'Show Day',
    openhouse: 'Show Day',
    walkin: 'Walk-In',
    manualimport: 'Manual Import',
    import: 'Manual Import',
    csv: 'Manual Import',
  }
  return map[key] || CANONICAL_LEAD_SOURCES.find((source) => sourceKey(source) === key) || 'Other'
}

function splitName(name = '') {
  const parts = normalizeText(name).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: 'Lead', lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export function normalizeEnquiryPayload(payload = {}, defaultSource = 'Other') {
  const contact = payload.contact && typeof payload.contact === 'object' ? payload.contact : {}
  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : {}
  const rawName = normalizeText(payload.name || payload.fullName || contact.name || contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' '))
  const nameParts = splitName(rawName)
  const source = normalizeLeadSource(payload.source || payload.leadSource || lead.leadSource || defaultSource)
  const leadCategory = normalizeLeadCategory(
    lead.leadCategory || payload.leadCategory || payload.lead_category,
    inferLeadCategoryFromSource(source, 'other'),
  )
  const email = normalizeEmail(payload.email || contact.email || payload.fromEmail)
  const phone = normalizePhone(payload.phone || contact.phone || payload.mobile || payload.fromPhone)
  const externalReference = normalizeText(payload.externalReference || payload.external_reference || payload.enquiryId || payload.enquiry_id || payload.id || payload.reference)
  const listingReference = normalizeText(payload.listingReference || payload.listing_reference || payload.externalListingReference || payload.external_listing_reference || payload.property24ListingId || payload.privatePropertyListingId)
  const developmentId = normalizeText(lead.developmentId || lead.development_id || payload.developmentId || payload.development_id || payload.primaryDevelopmentId || payload.primary_development_id)
  const developmentReference = normalizeText(lead.developmentReference || lead.development_reference || payload.developmentReference || payload.development_reference || payload.externalDevelopmentReference || payload.external_development_reference)
  const developmentName = normalizeText(lead.developmentName || lead.development_name || payload.developmentName || payload.development_name || payload.primaryDevelopmentName || payload.primary_development_name || payload.projectName || payload.project_name)
  const enquiredPropertyAddress = normalizeText(payload.enquiredPropertyAddress || payload.enquired_property_address || payload.propertyAddress || payload.property_address)
  const enquiredPropertyTitle = normalizeText(payload.enquiredPropertyTitle || payload.enquired_property_title || payload.propertyTitle || payload.property_title)
  const enquiredPropertyPrice = payload.enquiredPropertyPrice ?? payload.enquired_property_price ?? payload.propertyPrice ?? payload.property_price
  return {
    organisationId: normalizeText(payload.organisationId || payload.organisation_id),
    source,
    externalReference,
    enquiryTimestamp: payload.enquiryTimestamp || payload.enquiry_timestamp || payload.receivedAt || payload.createdAt || new Date().toISOString(),
    message: normalizeText(payload.message || payload.notes || payload.body || payload.comment),
    contact: {
      contactId: normalizeText(contact.contactId || contact.contact_id),
      firstName: normalizeText(contact.firstName || contact.first_name || payload.firstName || nameParts.firstName) || 'Lead',
      lastName: normalizeText(contact.lastName || contact.last_name || payload.lastName || nameParts.lastName),
      email,
      phone,
      notes: normalizeText(contact.notes),
      hasIdentity: Boolean(email || phone || rawName),
    },
    lead: {
      leadId: normalizeText(lead.leadId || lead.lead_id),
      leadCategory,
      leadDirection: normalizeText(lead.leadDirection || payload.leadDirection) || 'Inbound',
      leadSource: source,
      stage: normalizeText(lead.stage || payload.stage) || 'New Lead',
      status: normalizeText(lead.status || payload.status) || 'New Lead',
      priority: normalizeText(lead.priority || payload.priority) || 'Medium',
      budget: Number(lead.budget || payload.budget || payload.budgetMax || 0) || 0,
      areaInterest: normalizeText(lead.areaInterest || payload.areaInterest || payload.area || payload.suburb),
      propertyInterest: normalizeText(lead.propertyInterest || payload.propertyInterest || payload.propertyType || payload.property_type || enquiredPropertyAddress || enquiredPropertyTitle),
      listingId: normalizeText(lead.listingId || payload.listingId || payload.listing_id),
      enquiredPropertyTitle,
      enquiredPropertyAddress,
      enquiredPropertyPrice: enquiredPropertyPrice === undefined || enquiredPropertyPrice === null || enquiredPropertyPrice === '' ? null : Number(enquiredPropertyPrice) || null,
      sourceReferenceId: normalizeText(payload.sourceReferenceId || payload.source_reference_id || listingReference),
      notes: normalizeText(lead.notes || payload.leadNotes),
    },
    listingId: normalizeText(payload.listingId || payload.listing_id || payload.privateListingId || payload.private_listing_id || lead.listingId),
    listingReference,
    developmentId,
    developmentReference,
    developmentName,
    assignedAgent: payload.assignedAgent && typeof payload.assignedAgent === 'object' ? payload.assignedAgent : null,
    requirement: payload.requirement && typeof payload.requirement === 'object' ? payload.requirement : null,
    raw: payload,
  }
}

function isActiveLead(lead = {}) {
  const text = `${lead.status || ''} ${lead.stage || ''}`.toLowerCase()
  return !ACTIVE_LEAD_BLOCKLIST.some((blocked) => text.includes(blocked))
}

function isRecoverableReadError(error, tableName = '') {
  const code = normalizeText(error?.code).toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || code === 'pgrst204' || code === '42703' ||
    (tableName && message.includes(tableName.toLowerCase()) && (message.includes('does not exist') || message.includes('schema cache'))) ||
    message.includes('row-level security') || message.includes('permission denied')
}

async function getExistingLog(client, enquiry) {
  if (!enquiry.externalReference) return null
  const { data, error } = await client
    .from('lead_ingestion_logs')
    .select('*')
    .eq('organisation_id', enquiry.organisationId)
    .ilike('source', enquiry.source)
    .eq('external_reference', enquiry.externalReference)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isRecoverableReadError(error, 'lead_ingestion_logs')) return null
    throw error
  }
  return data || null
}

async function createIngestionLog(client, enquiry, patch = {}) {
  const status = patch.status || 'processed'
  const payload = {
    log_id: createUuid(),
    organisation_id: enquiry.organisationId,
    source: enquiry.source,
    external_reference: enquiry.externalReference || null,
    payload: enquiry.raw || {},
    status,
    lead_id: isUuidLike(patch.leadId) ? patch.leadId : null,
    contact_id: isUuidLike(patch.contactId) ? patch.contactId : null,
    listing_id: isUuidLike(patch.listingId) ? patch.listingId : null,
    assigned_agent_id: isUuidLike(patch.assignedAgentId) ? patch.assignedAgentId : null,
    review_status: normalizeText(patch.reviewStatus) || (status === 'failed' || patch.error ? 'needs_review' : null),
    duplicate_of_log_id: isUuidLike(patch.duplicateOfLogId) ? patch.duplicateOfLogId : null,
    processed_at: ['assigned', 'processed', 'duplicate'].includes(status) ? new Date().toISOString() : null,
    error: normalizeText(patch.error) || null,
  }
  const { data, error } = await client
    .from('lead_ingestion_logs')
    .insert(payload)
    .select('*')
    .single()
  if (error) {
    if (normalizeText(error.code) === '23505') return getExistingLog(client, enquiry)
    throw error
  }
  return data
}

export async function recordLeadIngestionFailure(payload = {}, errorMessage = 'Lead ingestion payload failed validation.') {
  const client = requireClient()
  const enquiry = normalizeEnquiryPayload(payload, payload.source || 'Other')
  if (!isUuidLike(enquiry.organisationId)) throw new Error('A valid organisation id is required before logging lead ingestion failure.')
  const log = await createIngestionLog(client, enquiry, {
    status: 'failed',
    reviewStatus: 'needs_review',
    listingId: enquiry.listingId,
    error: errorMessage,
  })
  return { ok: false, status: 'failed', error: log.error, log }
}

async function findExistingContact(client, enquiry) {
  const { organisationId } = enquiry
  const email = enquiry.contact.email
  const phone = enquiry.contact.phone
  if (!email && !phone) return null

  if (email && phone) {
    const { data, error } = await client
      .from('contacts')
      .select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at')
      .eq('organisation_id', organisationId)
      .eq('phone', phone)
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    if (!error && data) return data
    if (error && !isRecoverableReadError(error, 'contacts')) throw error
  }

  if (phone) {
    const { data, error } = await client
      .from('contacts')
      .select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at')
      .eq('organisation_id', organisationId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle()
    if (!error && data) return data
    if (error && !isRecoverableReadError(error, 'contacts')) throw error
  }

  if (email) {
    const { data, error } = await client
      .from('contacts')
      .select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at')
      .eq('organisation_id', organisationId)
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    if (!error && data) return data
    if (error && !isRecoverableReadError(error, 'contacts')) throw error
  }

  return null
}

async function findExistingLead(client, organisationId, contactId) {
  if (!contactId) return null
  const { data, error } = await client
    .from('leads')
    .select('lead_id, organisation_id, assigned_agent_id, assigned_agent_email, assigned_user_id, branch_id, contact_id, lead_source, stage, status, priority, budget, area_interest, property_interest, listing_id, notes, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .eq('contact_id', contactId)
    .order('updated_at', { ascending: false })
    .limit(10)
  if (error) {
    if (isRecoverableReadError(error, 'leads')) return null
    throw error
  }
  return (Array.isArray(data) ? data : []).find(isActiveLead) || null
}

async function resolveListing(client, enquiry) {
  const listingId = enquiry.listingId || enquiry.lead.listingId
  const selectVariants = [
    'id, organisation_id, development_id, assigned_agent_id, assigned_agent_email, listing_reference, title, property_address, address_line_1, suburb, city, listing_status',
    'id, organisation_id, assigned_agent_id, listing_reference, title, property_address, address_line_1, suburb, city, listing_status',
  ]
  if (isUuidLike(listingId)) {
    for (const fields of selectVariants) {
      const { data, error } = await client
        .from('private_listings')
        .select(fields)
        .eq('organisation_id', enquiry.organisationId)
        .eq('id', listingId)
        .maybeSingle()
      if (!error && data) return data
      if (error && !isRecoverableReadError(error, 'private_listings')) throw error
    }
  }
  if (enquiry.listingReference) {
    for (const fields of selectVariants) {
      const { data, error } = await client
        .from('private_listings')
        .select(fields)
        .eq('organisation_id', enquiry.organisationId)
        .eq('listing_reference', enquiry.listingReference)
        .maybeSingle()
      if (!error && data) return data
      if (error && !isRecoverableReadError(error, 'private_listings')) throw error
    }
  }
  const hasTextMatchSignal = [
    enquiry.lead.enquiredPropertyTitle,
    enquiry.lead.enquiredPropertyAddress,
    enquiry.lead.propertyInterest,
  ].some((value) => normalizeListingMatchText(value).length >= 6)
  if (hasTextMatchSignal) {
    for (const fields of selectVariants) {
      const { data, error } = await client
        .from('private_listings')
        .select(fields)
        .eq('organisation_id', enquiry.organisationId)
        .limit(250)
      if (error) {
        if (!isRecoverableReadError(error, 'private_listings')) throw error
        continue
      }
      const candidates = (Array.isArray(data) ? data : [])
        .map((listing) => ({ listing, score: scoreListingTextMatch(listing, enquiry) }))
        .filter((candidate) => candidate.score >= 0.72)
        .sort((left, right) => right.score - left.score)
      if (candidates[0]?.listing) return candidates[0].listing
    }
  }
  return null
}

async function fetchDevelopmentById(client, developmentId) {
  if (!isUuidLike(developmentId)) return null
  const selectVariants = [
    'id, organisation_id, name, status, location, developer_company, address, formatted_address, street_address, suburb, city, province',
    'id, organisation_id, name, status, location, developer_company',
    'id, organisation_id, name',
  ]
  for (const fields of selectVariants) {
    const { data, error } = await client
      .from('developments')
      .select(fields)
      .eq('id', developmentId)
      .maybeSingle()
    if (!error && data) return data
    if (error && !isRecoverableReadError(error, 'developments')) throw error
  }
  return null
}

async function fetchDevelopmentsForMatching(client) {
  const selectVariants = [
    'id, organisation_id, name, status, location, developer_company, address, formatted_address, street_address, suburb, city, province, external_reference, development_reference',
    'id, organisation_id, name, status, location, developer_company, address, formatted_address, street_address, suburb, city, province',
    'id, organisation_id, name, status, location, developer_company',
    'id, organisation_id, name',
  ]
  for (const fields of selectVariants) {
    const { data, error } = await client
      .from('developments')
      .select(fields)
      .limit(500)
    if (!error) return Array.isArray(data) ? data : []
    if (!isRecoverableReadError(error, 'developments')) throw error
  }
  return []
}

async function resolveDevelopmentByReference(client, reference = '') {
  const normalizedReference = normalizeText(reference)
  if (!normalizedReference) return null
  for (const column of ['external_reference', 'development_reference']) {
    const { data, error } = await client
      .from('developments')
      .select('id, organisation_id, name, status, location, developer_company')
      .eq(column, normalizedReference)
      .limit(1)
      .maybeSingle()
    if (!error && data) return data
    if (error && !isRecoverableReadError(error, 'developments')) throw error
  }
  return null
}

async function resolveDevelopmentInterest(client, enquiry) {
  const explicitDevelopment = await fetchDevelopmentById(client, enquiry.developmentId)
  if (explicitDevelopment) {
    return { development: explicitDevelopment, score: 1, reason: 'explicit_development_id' }
  }

  const explicitReferenceMatch = await resolveDevelopmentByReference(client, enquiry.developmentReference)
  if (explicitReferenceMatch) {
    return { development: explicitReferenceMatch, score: 1, reason: 'explicit_development_reference' }
  }

  const referenceSignals = [
    enquiry.developmentReference,
    enquiry.listingReference,
    enquiry.lead?.sourceReferenceId,
  ].map(normalizeLower).filter(Boolean)
  const hasTextMatchSignal = [
    enquiry.developmentName,
    enquiry.lead?.enquiredPropertyTitle,
    enquiry.lead?.enquiredPropertyAddress,
    enquiry.lead?.propertyInterest,
    enquiry.message,
  ].some((value) => normalizeDevelopmentMatchText(value).length >= 4)
  if (!referenceSignals.length && !hasTextMatchSignal) return null

  const developments = await fetchDevelopmentsForMatching(client)
  const referenceCandidate = developments.find((development) => {
    const candidateReferences = [
      development.external_reference,
      development.development_reference,
      development.public_reference,
    ].map(normalizeLower).filter(Boolean)
    return referenceSignals.some((reference) => candidateReferences.includes(reference))
  })
  if (referenceCandidate) {
    return { development: referenceCandidate, score: 1, reason: 'matched_development_reference' }
  }

  const candidates = developments
    .map((development) => ({ development, score: scoreDevelopmentTextMatch(development, enquiry) }))
    .filter((candidate) => candidate.score >= 0.8)
    .sort((left, right) => right.score - left.score)
  const best = candidates[0]
  if (!best?.development) return null
  const secondScore = candidates[1]?.score || 0
  if (best.score < 0.92 && best.score - secondScore < 0.1) return null
  return {
    development: best.development,
    score: best.score,
    reason: best.score >= 0.92 ? 'strong_text_match' : 'text_match',
  }
}

function buildAssignedAgent(enquiry, listing) {
  const listingAgentId = normalizeText(listing?.assigned_agent_id)
  const listingAgentEmail = normalizeEmail(listing?.assigned_agent_email)
  if (listingAgentId || listingAgentEmail) return { id: listingAgentId, userId: listingAgentId, email: listingAgentEmail }
  if (enquiry.assignedAgent) return enquiry.assignedAgent
  return null
}

function buildBuyerFullName(enquiry) {
  return [enquiry.contact.firstName, enquiry.contact.lastName].map(normalizeText).filter(Boolean).join(' ')
}

function formatCurrencySignal(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return `R ${amount.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}

function buildDevelopmentMirrorProtectedSummary(enquiry, development = {}) {
  const priceSignal = formatCurrencySignal(enquiry.lead.enquiredPropertyPrice || enquiry.lead.budget)
  return [
    normalizeText(development.name) || 'Development enquiry',
    normalizeText(enquiry.lead.propertyInterest || enquiry.lead.enquiredPropertyTitle),
    priceSignal ? `Budget/price signal ${priceSignal}` : '',
    `${enquiry.source} inbound lead`,
  ].filter(Boolean).join(' | ')
}

async function mirrorDevelopmentLeadFromEnquiry({
  enquiry,
  lead,
  contactId,
  developmentMatch,
  assignedAgentId = '',
  actor = null,
} = {}) {
  const development = developmentMatch?.development || null
  if (!development?.id) return { developerLead: null, warning: '' }

  const developerOrgId = normalizeText(development.organisation_id || development.organisationId)
  if (!isUuidLike(developerOrgId)) {
    return { developerLead: null, warning: 'Development match missing developer workspace id.' }
  }

  const buyerFullName = buildBuyerFullName(enquiry) || 'Inbound buyer lead'
  const budgetMax = enquiry.lead.enquiredPropertyPrice || enquiry.lead.budget || null
  const assignedAgent = normalizeText(assignedAgentId)
  const sourceReference = normalizeText(enquiry.externalReference || enquiry.lead.sourceReferenceId)

  const developerLead = await createAgencyIntroducedDeveloperLead({
    developerOrgId,
    sourceAgencyOrgId: enquiry.organisationId,
    sourceAgentUserId: assignedAgent,
    assignedAgentId: assignedAgent,
    sourceLeadId: lead.leadId,
    primaryDevelopmentId: development.id,
    buyerFullName,
    buyerEmail: enquiry.contact.email,
    buyerPhone: enquiry.contact.phone,
    budgetMax,
    unitTypeInterest: enquiry.lead.propertyInterest || enquiry.lead.enquiredPropertyTitle,
    protectedSummary: buildDevelopmentMirrorProtectedSummary(enquiry, development),
    privateNotes: [
      `Mirrored from ${enquiry.source} pipeline lead ${lead.leadId}.`,
      contactId ? `CRM contact: ${contactId}` : '',
      sourceReference ? `External reference: ${sourceReference}` : '',
      enquiry.message ? `Original message: ${enquiry.message}` : '',
    ].filter(Boolean).join('\n'),
    leadSource: `${enquiry.source} development enquiry`,
    leadStatus: 'new',
    publicReference: sourceReference,
    rawPayload: {
      contract: 'lead-ingestion-development-mirror-v1',
      source: enquiry.source,
      externalReference: enquiry.externalReference,
      developmentMatch: {
        developmentId: development.id,
        developmentName: normalizeText(development.name),
        score: developmentMatch.score,
        reason: developmentMatch.reason,
      },
    },
  })

  await createAgencyCrmLeadActivity(
    enquiry.organisationId,
    lead.leadId,
    {
      activityType: 'Development lead mirrored',
      activityNote: [
        `Mirrored into development module for ${normalizeText(development.name) || 'matched development'}.`,
        `Match: ${developmentMatch.reason || 'development_match'} (${developmentMatch.score || 0}).`,
        developerLead?.developerLeadId ? `Developer lead: ${developerLead.developerLeadId}` : '',
      ].filter(Boolean).join('\n'),
      activityDate: new Date().toISOString(),
      outcome: 'development_mirror',
    },
    { actor },
  ).catch((activityError) => {
    console.warn('[leadIngestionService] development mirror activity skipped', activityError)
  })

  return { developerLead, warning: '' }
}

function buildRequirementPayload(enquiry, lead, existingRequirements = []) {
  if (existingRequirements.some((requirement) => requirement.status === 'active')) return null
  const sourceRequirement = enquiry.requirement || {}
  const areas = sourceRequirement.areas || enquiry.lead.areaInterest || enquiry.raw.area || enquiry.raw.suburb
  const propertyTypes = sourceRequirement.propertyTypes || sourceRequirement.property_types || enquiry.lead.propertyInterest || enquiry.raw.propertyType || enquiry.raw.property_type
  const budgetMax = sourceRequirement.budgetMax ?? sourceRequirement.budget_max ?? enquiry.raw.budgetMax ?? enquiry.raw.budget ?? enquiry.lead.budget
  const hasRequirementSignal = areas || propertyTypes || budgetMax || sourceRequirement.bedroomsMin || sourceRequirement.bedrooms_min
  if (!hasRequirementSignal) return null
  return {
    organisationId: enquiry.organisationId,
    leadId: lead.leadId || lead.lead_id,
    contactId: lead.contactId || lead.contact_id,
    title: sourceRequirement.title || `${enquiry.source} enquiry requirement`,
    intentType: sourceRequirement.intentType || sourceRequirement.intent_type || 'buy',
    propertyTypes,
    areas,
    suburbs: sourceRequirement.suburbs || enquiry.raw.suburbs,
    city: sourceRequirement.city || enquiry.raw.city,
    province: sourceRequirement.province || enquiry.raw.province,
    budgetMin: sourceRequirement.budgetMin ?? sourceRequirement.budget_min,
    budgetMax,
    bedroomsMin: sourceRequirement.bedroomsMin ?? sourceRequirement.bedrooms_min ?? enquiry.raw.bedrooms,
    bathroomsMin: sourceRequirement.bathroomsMin ?? sourceRequirement.bathrooms_min ?? enquiry.raw.bathrooms,
    garagesMin: sourceRequirement.garagesMin ?? sourceRequirement.garages_min,
    parkingMin: sourceRequirement.parkingMin ?? sourceRequirement.parking_min,
    mustHaves: sourceRequirement.mustHaves ?? sourceRequirement.must_haves,
    notes: sourceRequirement.notes || enquiry.message,
    status: 'active',
    isPrimary: true,
  }
}

function mapLeadRow(row = {}) {
  return {
    leadId: normalizeText(row.leadId || row.lead_id),
    contactId: normalizeText(row.contactId || row.contact_id),
    assignedAgentId: normalizeText(row.assignedAgentId || row.assigned_agent_id),
    assignedAgentEmail: normalizeEmail(row.assignedAgentEmail || row.assigned_agent_email),
    organisationId: normalizeText(row.organisationId || row.organisation_id),
    leadSource: normalizeText(row.leadSource || row.lead_source),
    stage: normalizeText(row.stage),
    status: normalizeText(row.status),
  }
}

async function maybeUpdateContact(organisationId, contact, enquiry) {
  if (!contact?.contact_id) return
  const patch = {}
  if (!normalizeText(contact.first_name) && enquiry.contact.firstName) patch.firstName = enquiry.contact.firstName
  if (!normalizeText(contact.last_name) && enquiry.contact.lastName) patch.lastName = enquiry.contact.lastName
  if (!normalizeText(contact.phone) && enquiry.contact.phone) patch.phone = enquiry.contact.phone
  if (!normalizeText(contact.email) && enquiry.contact.email) patch.email = enquiry.contact.email
  if (Object.keys(patch).length) await updateAgencyCrmContactRecord(organisationId, contact.contact_id, patch)
}

async function createOrReuseLead({ enquiry, contact, listing, actor }) {
  const client = requireClient()
  const existingLead = contact?.contact_id ? await findExistingLead(client, enquiry.organisationId, contact.contact_id) : null
  if (existingLead) return { lead: mapLeadRow(existingLead), reusedLead: true }

  const contactId = contact?.contact_id || enquiry.contact.contactId || createUuid()
  const assignedAgent = buildAssignedAgent(enquiry, listing)
  const lead = await createAgencyCrmLeadRecord(
    enquiry.organisationId,
    {
      assignedAgent,
      contact: {
        contactId,
        firstName: enquiry.contact.firstName,
        lastName: enquiry.contact.lastName,
        email: enquiry.contact.email,
        phone: enquiry.contact.phone,
        contactType: 'Lead',
        notes: enquiry.contact.notes,
      },
      lead: {
        leadId: enquiry.lead.leadId || createUuid(),
        contactId,
        leadCategory: enquiry.lead.leadCategory,
        leadDirection: 'Inbound',
        leadSource: enquiry.source,
        stage: 'New Lead',
        status: 'New Lead',
        priority: enquiry.lead.priority,
        budget: enquiry.lead.budget,
        areaInterest: enquiry.lead.areaInterest,
        propertyInterest: enquiry.lead.propertyInterest,
        listingId: listing?.id || enquiry.lead.listingId,
        enquiredPropertyTitle: enquiry.lead.enquiredPropertyTitle,
        enquiredPropertyAddress: enquiry.lead.enquiredPropertyAddress,
        enquiredPropertyPrice: enquiry.lead.enquiredPropertyPrice,
        sourceReferenceId: enquiry.lead.sourceReferenceId,
        notes: [enquiry.lead.notes, enquiry.message].filter(Boolean).join('\n'),
      },
    },
    { actor },
  )
  return { lead: mapLeadRow(lead), reusedLead: false }
}

export async function createOrUpdateLeadFromEnquiry(
  payload = {},
  {
    actor = null,
    createInitialTask = true,
    createLeadRecommendation = true,
    workflowVariant = '',
  } = {},
) {
  const client = requireClient()
  const enquiry = normalizeEnquiryPayload(payload, payload.source || 'Other')
  const normalizedWorkflowVariant = normalizeLower(workflowVariant).replace(/[^a-z0-9]+/g, '_')
  const isShowDayWorkflow = normalizedWorkflowVariant === 'show_day'
  const shouldCreateInitialTask = createInitialTask !== false && !isShowDayWorkflow
  const shouldCreateLeadRecommendation = createLeadRecommendation !== false && !isShowDayWorkflow
  if (!isUuidLike(enquiry.organisationId)) throw new Error('A valid organisation id is required for lead ingestion.')
  if (!enquiry.contact.hasIdentity) {
    const failure = await createIngestionLog(client, enquiry, { status: 'failed', error: 'Invalid contact: name, phone, or email is required.' })
    return { ok: false, status: 'failed', error: failure.error, log: failure }
  }

  const duplicateLog = await getExistingLog(client, enquiry)
  if (duplicateLog?.status === 'processed' || duplicateLog?.status === 'duplicate') {
    const log = await createIngestionLog(client, enquiry, {
      status: 'duplicate',
      leadId: duplicateLog.lead_id,
      contactId: duplicateLog.contact_id,
      listingId: duplicateLog.listing_id,
      duplicateOfLogId: duplicateLog.log_id,
      reviewStatus: 'duplicate',
      error: 'Duplicate payload external reference.',
    })
    return {
      ok: true,
      status: 'duplicate',
      source: enquiry.source,
      contactId: normalizeText(duplicateLog.contact_id),
      leadId: normalizeText(duplicateLog.lead_id),
      listingId: normalizeText(duplicateLog.listing_id),
      log,
      duplicateOf: duplicateLog,
    }
  }

  try {
    const [existingContact, listing, developmentMatch] = await Promise.all([
      findExistingContact(client, enquiry),
      resolveListing(client, enquiry),
      resolveDevelopmentInterest(client, enquiry),
    ])
    let resolvedDevelopmentMatch = developmentMatch
    const linkedDevelopmentId = normalizeText(listing?.development_id || listing?.developmentId)
    if (!resolvedDevelopmentMatch && linkedDevelopmentId) {
      const linkedDevelopment = await fetchDevelopmentById(client, linkedDevelopmentId)
      if (linkedDevelopment) {
        resolvedDevelopmentMatch = {
          development: linkedDevelopment,
          score: 1,
          reason: 'linked_listing_development_id',
        }
      }
    }
    if (existingContact) await maybeUpdateContact(enquiry.organisationId, existingContact, enquiry)
    const { lead, reusedLead } = await createOrReuseLead({ enquiry, contact: existingContact, listing, actor })
    const contactId = existingContact?.contact_id || lead.contactId
    const existingRequirements = await listLeadRequirements({ organisationId: enquiry.organisationId, leadId: lead.leadId }).catch(() => [])
    const isBuyerLead = inferLeadCategoryFromRecord(lead, enquiry.lead.leadCategory) === 'buyer'
    const requirementPayload = isBuyerLead ? buildRequirementPayload(enquiry, { ...lead, contactId }, existingRequirements) : null
    const requirement = requirementPayload ? await createLeadRequirement(requirementPayload, { actor }).catch(() => null) : existingRequirements[0] || null

    const activity = await createAgencyCrmLeadActivity(
      enquiry.organisationId,
      lead.leadId,
      {
        activityType: `${enquiry.source} enquiry received`,
        activityNote: [
          enquiry.message || 'External enquiry received.',
          enquiry.externalReference ? `Reference: ${enquiry.externalReference}` : '',
          `Received: ${enquiry.enquiryTimestamp}`,
        ].filter(Boolean).join('\n'),
        activityDate: enquiry.enquiryTimestamp,
        outcome: enquiry.source,
      },
      { actor },
    )

    const task = shouldCreateInitialTask
      ? await createAgencyCrmLeadTask(
          enquiry.organisationId,
          lead.leadId,
          {
            title: 'Contact Lead',
            description: `${enquiry.source} enquiry follow-up.`,
            dueDate: new Date(enquiry.enquiryTimestamp).toISOString().slice(0, 10),
            status: 'Pending',
            priority: 'High',
            assignedAgent: buildAssignedAgent(enquiry, listing) || actor,
          },
          { actor },
        )
      : null

    let listingInterest = null
    let warning = ''
    if (listing?.id) {
      listingInterest = await upsertLeadListingInterest(
        {
          organisationId: enquiry.organisationId,
          leadId: lead.leadId,
          contactId,
          listingId: listing.id,
          requirementId: requirement?.requirementId,
          source: enquiry.source,
          status: 'interested',
          isOriginalEnquiry: true,
          isAgentSelected: false,
          notes: enquiry.message,
          createdBy: actor?.id,
        },
        { actor },
      )
    } else if (enquiry.listingId || enquiry.listingReference) {
      warning = 'Unknown listing: original enquiry listing could not be resolved.'
    }

    const assignment = await autoAssignLead(
      { organisationId: enquiry.organisationId, leadId: lead.leadId },
      { actor },
    ).catch((assignmentError) => {
      console.warn('[leadIngestionService] auto assignment skipped', assignmentError)
      return null
    })

    let developerLead = null
    if (isBuyerLead && resolvedDevelopmentMatch?.development) {
      const assignedAgentId = assignment?.agentId || assignment?.newAgentId || buildAssignedAgent(enquiry, listing)?.id || actor?.id
      const mirrorResult = await mirrorDevelopmentLeadFromEnquiry({
        enquiry,
        lead,
        contactId,
        developmentMatch: resolvedDevelopmentMatch,
        assignedAgentId,
        actor,
      }).catch((mirrorError) => ({
        developerLead: null,
        warning: `Development lead mirror skipped: ${mirrorError?.message || 'Unable to create development lead mirror.'}`,
      }))
      developerLead = mirrorResult.developerLead
      warning = [warning, mirrorResult.warning].filter(Boolean).join('\n')
    }

    const log = await createIngestionLog(client, enquiry, {
      status: reusedLead ? 'assigned' : 'processed',
      leadId: lead.leadId,
      contactId,
      listingId: listing?.id,
      assignedAgentId: assignment?.agentId || assignment?.newAgentId || buildAssignedAgent(enquiry, listing)?.id,
      reviewStatus: warning ? 'needs_review' : null,
      error: warning,
    })

    if (shouldCreateLeadRecommendation) {
      void import('./leadActionEngineService')
        .then(({ processLeadEvent }) => processLeadEvent({
          organisationId: enquiry.organisationId,
          leadId: lead.leadId,
          contactId,
          assignedAgentId: assignment?.agentId || assignment?.newAgentId || buildAssignedAgent(enquiry, listing)?.id || actor?.id,
          eventType: 'new_lead',
          sourceEvent: `ingestion:${log?.log_id || enquiry.externalReference || lead.leadId}`,
          metadata: {
            source: enquiry.source,
            ingestionLogId: log?.log_id,
            reusedLead,
          },
        }, { actor }))
        .catch((recommendationError) => console.warn('[leadIngestionService] recommendation generation skipped', recommendationError))
    }

    return {
      ok: true,
      status: log.status,
      source: enquiry.source,
      contactId,
      leadId: lead.leadId,
      reusedContact: Boolean(existingContact),
      reusedLead,
      requirement,
      listing,
      listingInterest,
      developmentMatch,
      developerLead,
      activity,
      task,
      log,
      assignment,
      warning,
      workflowVariant: normalizedWorkflowVariant,
    }
  } catch (error) {
    const log = await createIngestionLog(client, enquiry, { status: 'failed', error: error?.message || 'Lead ingestion failed.' }).catch(() => null)
    return { ok: false, status: 'failed', error: error?.message || 'Lead ingestion failed.', log }
  }
}

export function ingestProperty24Lead(payload = {}, options = {}) {
  return createOrUpdateLeadFromEnquiry({ ...payload, source: 'Property24' }, options)
}

export function ingestPrivatePropertyLead(payload = {}, options = {}) {
  return createOrUpdateLeadFromEnquiry({ ...payload, source: 'Private Property' }, options)
}

export function ingestWebsiteLead(payload = {}, options = {}) {
  return createOrUpdateLeadFromEnquiry({ ...payload, source: 'Website' }, options)
}

export function ingestWhatsAppLead(payload = {}, options = {}) {
  return createOrUpdateLeadFromEnquiry({ ...payload, source: 'WhatsApp' }, options)
}

export function ingestReferralLead(payload = {}, options = {}) {
  return createOrUpdateLeadFromEnquiry({ ...payload, source: 'Referral' }, options)
}

export function ingestGenericLead(payload = {}, options = {}) {
  return createOrUpdateLeadFromEnquiry(payload, options)
}

export const __leadIngestionServiceTestUtils = {
  buildRequirementPayload,
  isActiveLead,
  normalizeEnquiryPayload,
  normalizeDevelopmentMatchText,
  normalizeListingMatchText,
  normalizeLeadSource,
  normalizePhone,
  scoreDevelopmentTextMatch,
  scoreListingTextMatch,
}
