import { inferLeadCategoryFromRecord } from '../../lib/leadCategory'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  deleteAgencyLeadCoreCache,
  readAgencyLeadCoreCache,
  writeAgencyLeadCoreCache,
} from './agencyLeadCoreCache'

const LEGACY_LEAD_FIELDS =
  'lead_id, organisation_id, assigned_agent_id, contact_id, lead_category, lead_direction, lead_source, stage, status, priority, budget, area_interest, property_interest, seller_property_address, estimated_value, notes, converted_transaction_id, created_at, updated_at'
const LEAD_FIELDS = `${LEGACY_LEAD_FIELDS}, branch_id, assigned_user_id, created_by`
const LEAD_FIELDS_WITH_AGENT = `${LEAD_FIELDS}, assigned_agent_email`
const LEAD_FIELDS_SELLER = `${LEAD_FIELDS_WITH_AGENT}, listing_id, mandate_packet_id, seller_onboarding_token, seller_onboarding_status`
const LEAD_FIELDS_EXTENDED = `${LEAD_FIELDS_SELLER}, enquired_listing_id, enquired_property_title, enquired_property_address, enquired_property_price, source_reference_id, raw_enquiry_payload`
const LEAD_FIELDS_LOCATION = `${LEAD_FIELDS_EXTENDED}, formatted_address, street_address, suburb, city, province, country, postal_code, latitude, longitude, google_place_id`
const LEAD_FIELDS_ASSIGNMENT = `${LEAD_FIELDS_LOCATION}, assigned_at, first_contacted_at, ownership_status, sla_due_at, assigned_queue_id`
const CONTACT_FIELDS = 'contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at'
const ACTIVITY_FIELDS = 'activity_id, organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome, created_at'
const TASK_FIELDS = 'task_id, organisation_id, lead_id, assigned_agent_id, title, description, due_date, status, priority, created_at, updated_at'
const PRIMARY_RECORDS_CACHE_TTL_MS = 60_000
const primaryRecordsCache = new Map()
const leadCoreRequestCache = new Map()
let compatibleLeadFields = null

function normalizeText(value = '') {
  return String(value || '').trim()
}

function requireWorkspaceId(value) {
  const workspaceId = normalizeText(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    throw new Error('A valid resolved agency workspace id is required before loading CRM data.')
  }
  return workspaceId
}

function errorText(error) {
  return normalizeText(error?.message || error?.details).toLowerCase()
}

function isMissingColumn(error) {
  const code = normalizeText(error?.code).toUpperCase()
  return code === '42703' || code === 'PGRST204' || /column .* does not exist/i.test(errorText(error)) || errorText(error).includes('schema cache')
}

function isUnavailable(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const status = Number(error?.status || error?.statusCode || 0)
  const message = errorText(error)
  return status === 403 || code === '42501' || code === '42P01' || code === 'PGRST205' || message.includes('permission denied') || message.includes('row-level security') || message.includes('does not exist')
}

async function selectCompatibleLeads(workspaceId, leadId = '') {
  const fieldSets = [
    LEAD_FIELDS_ASSIGNMENT,
    LEAD_FIELDS_LOCATION,
    LEAD_FIELDS_EXTENDED,
    LEAD_FIELDS_SELLER,
    LEAD_FIELDS_WITH_AGENT,
    LEAD_FIELDS,
    LEGACY_LEAD_FIELDS,
  ]
  const candidates = compatibleLeadFields
    ? [compatibleLeadFields, ...fieldSets.filter((fields) => fields !== compatibleLeadFields)]
    : fieldSets
  let result = { data: [], error: null }
  for (const fields of candidates) {
    let query = supabase.from('leads').select(fields).eq('organisation_id', workspaceId)
    query = leadId
      ? query.eq('lead_id', leadId).limit(1).maybeSingle()
      : query.order('updated_at', { ascending: false })
    result = await query
    if (!result.error) {
      compatibleLeadFields = fields
      return result
    }
    if (!isMissingColumn(result.error)) return result
    if (compatibleLeadFields === fields) compatibleLeadFields = null
  }
  return result
}

function mapContact(row = {}) {
  return {
    contactId: normalizeText(row.contact_id),
    organisationId: normalizeText(row.organisation_id),
    assignedAgentId: normalizeText(row.assigned_agent_id),
    assignedAgentName: '',
    assignedAgentEmail: '',
    firstName: normalizeText(row.first_name),
    lastName: normalizeText(row.last_name),
    phone: normalizeText(row.phone),
    email: normalizeText(row.email).toLowerCase(),
    contactType: normalizeText(row.contact_type) || 'Lead',
    notes: normalizeText(row.notes),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  }
}

function mapLead(row = {}) {
  return {
    leadId: normalizeText(row.lead_id),
    organisationId: normalizeText(row.organisation_id),
    branchId: normalizeText(row.branch_id),
    assignedUserId: normalizeText(row.assigned_user_id),
    createdBy: normalizeText(row.created_by),
    assignedAgentId: normalizeText(row.assigned_agent_id),
    assignedAgentName: normalizeText(row.assigned_agent_name || row.assigned_agent),
    assignedAgentEmail: normalizeText(row.assigned_agent_email).toLowerCase(),
    contactId: normalizeText(row.contact_id),
    leadCategory: inferLeadCategoryFromRecord(row, 'other'),
    leadDirection: normalizeText(row.lead_direction) || 'Inbound',
    leadSource: normalizeText(row.lead_source) || 'Other',
    stage: normalizeText(row.stage) || 'New Lead',
    status: normalizeText(row.status || row.stage) || 'New Lead',
    assignedAt: row.assigned_at || null,
    firstContactedAt: row.first_contacted_at || null,
    ownershipStatus: normalizeText(row.ownership_status),
    slaDueAt: row.sla_due_at || null,
    assignedQueueId: normalizeText(row.assigned_queue_id),
    priority: normalizeText(row.priority) || 'Medium',
    budget: Number(row.budget || 0) || 0,
    areaInterest: normalizeText(row.area_interest),
    propertyInterest: normalizeText(row.property_interest),
    sellerPropertyAddress: normalizeText(row.seller_property_address),
    formattedAddress: normalizeText(row.formatted_address),
    streetAddress: normalizeText(row.street_address),
    suburb: normalizeText(row.suburb),
    city: normalizeText(row.city),
    province: normalizeText(row.province),
    country: normalizeText(row.country) || 'South Africa',
    postalCode: normalizeText(row.postal_code),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    googlePlaceId: normalizeText(row.google_place_id),
    estimatedValue: Number(row.estimated_value || 0) || 0,
    notes: normalizeText(row.notes),
    sellerOnboardingToken: normalizeText(row.seller_onboarding_token),
    sellerOnboardingLink: '',
    sellerOnboardingStatus: normalizeText(row.seller_onboarding_status),
    sellerWorkflowLeadId: '',
    mandatePacketId: normalizeText(row.mandate_packet_id),
    listingId: normalizeText(row.listing_id),
    enquiredListingId: normalizeText(row.enquired_listing_id),
    enquiredPropertyTitle: normalizeText(row.enquired_property_title),
    enquiredPropertyAddress: normalizeText(row.enquired_property_address),
    enquiredPropertyPrice: row.enquired_property_price == null || row.enquired_property_price === '' ? null : Number(row.enquired_property_price) || null,
    sourceReferenceId: normalizeText(row.source_reference_id),
    rawEnquiryPayload: row.raw_enquiry_payload ?? null,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    convertedDealId: normalizeText(row.converted_transaction_id) || null,
    convertedTransactionId: normalizeText(row.converted_transaction_id) || null,
  }
}

function mapActivity(row = {}) {
  return {
    activityId: normalizeText(row.activity_id),
    organisationId: normalizeText(row.organisation_id),
    leadId: normalizeText(row.lead_id),
    agentId: normalizeText(row.agent_id),
    agentName: '',
    agentEmail: '',
    activityType: normalizeText(row.activity_type) || 'Note',
    activityNote: normalizeText(row.activity_note),
    activityDate: row.activity_date || row.created_at || new Date().toISOString(),
    outcome: normalizeText(row.outcome),
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function mapTask(row = {}) {
  return {
    taskId: normalizeText(row.task_id),
    organisationId: normalizeText(row.organisation_id),
    leadId: normalizeText(row.lead_id),
    assignedAgentId: normalizeText(row.assigned_agent_id),
    assignedAgentName: '',
    assignedAgentEmail: '',
    title: normalizeText(row.title) || 'Follow-up',
    description: normalizeText(row.description),
    dueDate: row.due_date || null,
    status: normalizeText(row.status) || 'Pending',
    priority: normalizeText(row.priority) || 'Medium',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  }
}

function readFreshCache(cache, key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry
}

async function fetchPrimaryRecords(workspaceId, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = readFreshCache(primaryRecordsCache, workspaceId)
    if (cached?.data) return cached.data
    if (cached?.promise) return cached.promise
  }

  const promise = Promise.all([
    selectCompatibleLeads(workspaceId),
    supabase.from('contacts').select(CONTACT_FIELDS).eq('organisation_id', workspaceId).order('updated_at', { ascending: false }),
  ]).then(([leads, contacts]) => {
    for (const result of [leads, contacts]) {
      if (result.error && !isUnavailable(result.error)) throw result.error
    }
    const data = {
      leads: Array.isArray(leads.data) ? leads.data.map(mapLead) : [],
      contacts: Array.isArray(contacts.data) ? contacts.data.map(mapContact) : [],
    }
    primaryRecordsCache.set(workspaceId, {
      data,
      expiresAt: Date.now() + PRIMARY_RECORDS_CACHE_TTL_MS,
    })
    return data
  }).catch((error) => {
    primaryRecordsCache.delete(workspaceId)
    throw error
  })

  primaryRecordsCache.set(workspaceId, {
    promise,
    expiresAt: Date.now() + PRIMARY_RECORDS_CACHE_TTL_MS,
  })
  return promise
}

function findLeadCoreInPrimaryCache(workspaceId, leadId) {
  const cached = readFreshCache(primaryRecordsCache, workspaceId)?.data
  if (!cached) return null
  const lead = cached.leads.find((row) => normalizeText(row?.leadId) === leadId)
  if (!lead) return null
  const contact = cached.contacts.find((row) => normalizeText(row?.contactId) === normalizeText(lead?.contactId)) || null
  return { lead, contact, source: 'primary-cache' }
}

export function readCachedAgencyLeadCoreRecord(organisationId, leadId) {
  const workspaceId = normalizeText(organisationId)
  const resolvedLeadId = normalizeText(leadId)
  if (!workspaceId || !resolvedLeadId) return null
  const primary = findLeadCoreInPrimaryCache(workspaceId, resolvedLeadId)
  if (primary) return primary
  return readAgencyLeadCoreCache(workspaceId, resolvedLeadId)
}

export async function preloadAgencyLeadCoreRecord(organisationId, leadId) {
  const workspaceId = requireWorkspaceId(organisationId)
  const resolvedLeadId = normalizeText(leadId)
  if (!resolvedLeadId) return null
  const cached = readCachedAgencyLeadCoreRecord(workspaceId, resolvedLeadId)
  if (cached) return writeAgencyLeadCoreCache(workspaceId, resolvedLeadId, cached)

  const cacheKey = `${workspaceId}:${resolvedLeadId}`
  if (leadCoreRequestCache.has(cacheKey)) return leadCoreRequestCache.get(cacheKey)

  const promise = selectCompatibleLeads(workspaceId, resolvedLeadId).then(async (leadResult) => {
    if (leadResult.error && !isUnavailable(leadResult.error)) throw leadResult.error
    if (!leadResult.data) return null
    const lead = mapLead(leadResult.data)
    let contact = null
    if (lead.contactId) {
      const contactResult = await supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('organisation_id', workspaceId)
        .eq('contact_id', lead.contactId)
        .limit(1)
        .maybeSingle()
      if (contactResult.error && !isUnavailable(contactResult.error)) throw contactResult.error
      contact = contactResult.data ? mapContact(contactResult.data) : null
    }
    const data = { lead, contact, source: 'remote-core' }
    return writeAgencyLeadCoreCache(workspaceId, resolvedLeadId, data)
  }).catch((error) => {
    throw error
  }).finally(() => {
    leadCoreRequestCache.delete(cacheKey)
  })

  leadCoreRequestCache.set(cacheKey, promise)
  return promise
}

export function preloadAgencyLeadListRecords(organisationId) {
  const workspaceId = requireWorkspaceId(organisationId)
  return fetchPrimaryRecords(workspaceId).catch(() => null)
}

export function invalidateAgencyLeadListCache(organisationId, leadId = '') {
  const workspaceId = normalizeText(organisationId)
  if (!workspaceId) return
  primaryRecordsCache.delete(workspaceId)
  const resolvedLeadId = normalizeText(leadId)
  if (resolvedLeadId) deleteAgencyLeadCoreCache(workspaceId, resolvedLeadId)
}

export async function listAgencyLeadListRecords(organisationId, options = {}) {
  const workspaceId = requireWorkspaceId(organisationId)
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is required before loading agency CRM data.')

  const includePrimaryRecords = options.includePrimaryRecords !== false
  const includeRelatedRecords = options.includeRelatedRecords !== false
  const empty = Promise.resolve({ data: [], error: null })
  const requests = [
    includePrimaryRecords ? fetchPrimaryRecords(workspaceId, { forceRefresh: options.forceRefresh === true }) : Promise.resolve({ leads: [], contacts: [] }),
    includeRelatedRecords
      ? supabase.from('lead_activities').select(ACTIVITY_FIELDS).eq('organisation_id', workspaceId).order('activity_date', { ascending: false })
      : empty,
    includeRelatedRecords
      ? supabase.from('tasks').select(TASK_FIELDS).eq('organisation_id', workspaceId).order('updated_at', { ascending: false })
      : empty,
  ]
  const [primary, activities, tasks] = await Promise.all(requests)

  for (const result of [activities, tasks]) {
    if (result.error && !isUnavailable(result.error)) throw result.error
  }

  return {
    leads: Array.isArray(primary.leads) ? primary.leads : [],
    contacts: Array.isArray(primary.contacts) ? primary.contacts : [],
    leadActivities: Array.isArray(activities.data) ? activities.data.map(mapActivity) : [],
    tasks: Array.isArray(tasks.data) ? tasks.data.map(mapTask) : [],
    source: 'remote',
  }
}
