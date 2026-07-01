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
  const enquiredPropertyTitle = normalizeText(payload.enquiredPropertyTitle || payload.enquired_property_title || payload.propertyTitle || payload.property_title)
  const enquiredPropertyAddress = normalizeText(payload.enquiredPropertyAddress || payload.enquired_property_address || payload.propertyAddress || payload.property_address)
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
      propertyInterest: normalizeText(lead.propertyInterest || payload.propertyInterest || payload.propertyType || payload.property_type),
      listingId: normalizeText(lead.listingId || payload.listingId || payload.listing_id),
      enquiredPropertyTitle,
      enquiredPropertyAddress,
      enquiredPropertyPrice: enquiredPropertyPrice === undefined || enquiredPropertyPrice === null || enquiredPropertyPrice === '' ? null : Number(enquiredPropertyPrice) || null,
      sourceReferenceId: normalizeText(payload.sourceReferenceId || payload.source_reference_id || listingReference),
      notes: normalizeText(lead.notes || payload.leadNotes),
    },
    listingId: normalizeText(payload.listingId || payload.listing_id || payload.privateListingId || payload.private_listing_id || lead.listingId),
    listingReference,
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
    'id, organisation_id, assigned_agent_id, assigned_agent_email, listing_reference, title, property_address, address_line_1, suburb, city, listing_status',
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
  return null
}

function buildAssignedAgent(enquiry, listing) {
  const listingAgentId = normalizeText(listing?.assigned_agent_id)
  const listingAgentEmail = normalizeEmail(listing?.assigned_agent_email)
  if (listingAgentId || listingAgentEmail) return { id: listingAgentId, userId: listingAgentId, email: listingAgentEmail }
  if (enquiry.assignedAgent) return enquiry.assignedAgent
  return null
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

export async function createOrUpdateLeadFromEnquiry(payload = {}, { actor = null } = {}) {
  const client = requireClient()
  const enquiry = normalizeEnquiryPayload(payload, payload.source || 'Other')
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
    return { ok: true, status: 'duplicate', log, duplicateOf: duplicateLog }
  }

  try {
    const [existingContact, listing] = await Promise.all([
      findExistingContact(client, enquiry),
      resolveListing(client, enquiry),
    ])
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

    const task = await createAgencyCrmLeadTask(
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

    const log = await createIngestionLog(client, enquiry, {
      status: reusedLead ? 'assigned' : 'processed',
      leadId: lead.leadId,
      contactId,
      listingId: listing?.id,
      reviewStatus: warning ? 'needs_review' : null,
      error: warning,
    })

    const assignment = await autoAssignLead(
      { organisationId: enquiry.organisationId, leadId: lead.leadId },
      { actor },
    ).catch((assignmentError) => {
      console.warn('[leadIngestionService] auto assignment skipped', assignmentError)
      return null
    })

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
      activity,
      task,
      log,
      assignment,
      warning,
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
  normalizeLeadSource,
  normalizePhone,
}
