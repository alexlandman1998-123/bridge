import { agencyLeadAgentFilter, agencyLeadAgentScope } from './agencyLeadAgentScope'
import { buildAgencyLeadListModel, selectAgencyLeadCategoryRecords } from './agencyLeadListModel'
import { inferLeadCategoryFromRecord } from '../../lib/leadCategory'
import { enrichDevelopmentBuyerLeads } from '../../services/developmentBuyerLeadService.js'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  deleteAgencyLeadCoreCache,
  clearAgencyLeadCoreCache,
  readAgencyLeadCoreCache,
  writeAgencyLeadCoreCache,
} from './agencyLeadCoreCache'
import { seedAgencyLeadWorkspaceSnapshot } from './agencyLeadWorkspaceSnapshotCache'
import { AGENCY_CRM_UPDATED_EVENT, getAgencyCrmUpdateDetail } from '../../lib/agencyCrmUpdateBus'

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
const landingMetricsCache = new Map()
const leadCoreRequestCache = new Map()
const contactRecordsCache = new Map()
let compatibleLeadFields = null
let cacheRevision = 0

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

async function selectCompatibleLeads(workspaceId, leadId = '', { page = 0, pageSize = 0, agentScope = null, includeCount = true } = {}) {
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
    let query = supabase.from('leads').select(fields, { count: leadId || !includeCount ? undefined : 'exact' }).eq('organisation_id', workspaceId)
    if (!leadId && agentScope) query = query.or(agencyLeadAgentFilter(agentScope, fields))
    query = leadId
      ? query.eq('lead_id', leadId).limit(1).maybeSingle()
      : query.order('updated_at', { ascending: false }).order('lead_id', { ascending: true })
    if (!leadId && pageSize > 0) {
      const from = Math.max(0, Number(page) || 0) * pageSize
      query = query.range(from, from + pageSize - 1)
    }
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

async function fetchPrimaryRecords(workspaceId, { forceRefresh = false, page = 0, pageSize = 0, agentScope = null } = {}) {
  const normalizedPageSize = Math.max(0, Math.round(Number(pageSize) || 0))
  const normalizedPage = Math.max(0, Math.round(Number(page) || 0))
  const cacheKey = (normalizedPageSize ? `${workspaceId}:${normalizedPage}:${normalizedPageSize}` : workspaceId) + (agentScope ? `:agent:${JSON.stringify(agentScope)}` : '')
  if (!forceRefresh) {
    const cached = readFreshCache(primaryRecordsCache, cacheKey)
    if (cached?.data) return cached.data
    if (cached?.promise) return cached.promise
  }

  const revision = cacheRevision
  const entry = { expiresAt: Date.now() + PRIMARY_RECORDS_CACHE_TTL_MS }
  const promise = selectCompatibleLeads(workspaceId, '', { page: normalizedPage, pageSize: normalizedPageSize, agentScope })
    .then(async (leads) => {
      if (leads.error && !isUnavailable(leads.error)) throw leads.error
      const leadRows = Array.isArray(leads.data) ? leads.data : []
      const contactIds = [...new Set(leadRows.map((lead) => normalizeText(lead?.contact_id)).filter(Boolean))]
      const contacts = contactIds.length
        ? await supabase.from('contacts').select(CONTACT_FIELDS).eq('organisation_id', workspaceId).in('contact_id', contactIds)
        : { data: [], error: null }
      if (contacts.error && !isUnavailable(contacts.error)) throw contacts.error
      const data = {
        leads: await enrichDevelopmentBuyerLeads(workspaceId, leadRows.map(mapLead)),
        contacts: Array.isArray(contacts.data) ? contacts.data.map(mapContact) : [],
        totalCount: Number(leads.count || leadRows.length),
        page: normalizedPage,
        pageSize: normalizedPageSize || leadRows.length,
      }
      if (revision === cacheRevision && primaryRecordsCache.get(cacheKey) === entry) primaryRecordsCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + PRIMARY_RECORDS_CACHE_TTL_MS,
    })
    return data
  }).catch((error) => {
    if (primaryRecordsCache.get(cacheKey) === entry) primaryRecordsCache.delete(cacheKey)
    throw error
  })

  entry.promise = promise
  primaryRecordsCache.set(cacheKey, entry)
  return promise
}

async function fetchLandingMetricLeads(workspaceId, { forceRefresh = false, agentScope = null } = {}) {
  const cacheKey = agentScope ? `${workspaceId}:agent:${JSON.stringify(agentScope)}` : workspaceId
  if (!forceRefresh) {
    const cached = readFreshCache(landingMetricsCache, cacheKey)
    if (cached?.data) return cached.data
    if (cached?.promise) return cached.promise
  }

  const revision = cacheRevision
  const entry = { expiresAt: Date.now() + PRIMARY_RECORDS_CACHE_TTL_MS }
  const promise = (async () => {
    // We already read every row for legacy category inference. Count those rows
    // instead of executing a second RLS-filtered scan via count=exact.
    const pageSize = 1000
    const leads = []
    let page = 0
    let hasMore = true
    while (hasMore) {
      const result = await selectCompatibleLeads(workspaceId, '', { page, pageSize, agentScope, includeCount: false })
      if (result.error && !isUnavailable(result.error)) throw result.error
      const rows = Array.isArray(result.data) ? result.data : []
      leads.push(...rows.map(mapLead))
      page += 1
      hasMore = rows.length === pageSize
    }
    const data = { leads: await enrichDevelopmentBuyerLeads(workspaceId, leads), totalCount: leads.length, source: 'remote' }
    if (revision === cacheRevision && landingMetricsCache.get(cacheKey) === entry) landingMetricsCache.set(cacheKey, { data, expiresAt: Date.now() + PRIMARY_RECORDS_CACHE_TTL_MS })
    return data
  })().catch((error) => {
    if (landingMetricsCache.get(cacheKey) === entry) landingMetricsCache.delete(cacheKey)
    throw error
  })

  entry.promise = promise
  landingMetricsCache.set(cacheKey, entry)
  return promise
}

async function fetchCategoryRecords(workspaceId, { category, forceRefresh = false, agentScope = null } = {}) {
  // The summary already reads every lead in this scope. Use that same snapshot
  // to filter before paging, including legacy records whose category is inferred.
  const revision = cacheRevision
  const snapshot = await fetchLandingMetricLeads(workspaceId, { forceRefresh, agentScope })
  const cacheKey = `${workspaceId}:category:${category}` + (agentScope ? `:agent:${JSON.stringify(agentScope)}` : '')
  const cached = readFreshCache(primaryRecordsCache, cacheKey)
  if (!forceRefresh && cached?.data?.metricLeads === snapshot.leads) return cached.data

  const leads = selectAgencyLeadCategoryRecords(snapshot.leads, category)
  const data = { leads, metricLeads: snapshot.leads, totalCount: leads.length }
  if (revision === cacheRevision) primaryRecordsCache.set(cacheKey, { data, expiresAt: Date.now() + PRIMARY_RECORDS_CACHE_TTL_MS })
  return data
}

async function fetchLeadContacts(workspaceId, leads, { forceRefresh = false } = {}) {
  const contactIds = [...new Set(leads.map((lead) => lead.contactId).filter(Boolean))].sort()
  const contacts = []
  // Bound request URLs. Reuse both completed and in-flight batches during paging/search.
  for (let offset = 0; offset < contactIds.length; offset += 200) {
    const batch = contactIds.slice(offset, offset + 200)
    const key = `${workspaceId}:${batch.join(',')}`
    const cached = !forceRefresh && readFreshCache(contactRecordsCache, key)
    if (cached) {
      contacts.push(...(cached.data || await cached.promise))
      continue
    }
    const entry = { expiresAt: Date.now() + PRIMARY_RECORDS_CACHE_TTL_MS }
    entry.promise = (async () => {
      const result = await supabase.from('contacts').select(CONTACT_FIELDS).eq('organisation_id', workspaceId).in('contact_id', batch)
      if (result.error && !isUnavailable(result.error)) throw result.error
      const rows = Array.isArray(result.data) ? result.data.map(mapContact) : []
      if (contactRecordsCache.get(key) === entry) entry.data = rows
      return rows
    })().catch((error) => {
      if (contactRecordsCache.get(key) === entry) contactRecordsCache.delete(key)
      throw error
    })
    contactRecordsCache.set(key, entry)
    contacts.push(...await entry.promise)
  }
  return contacts
}

function findLeadCoreInPrimaryCache(workspaceId, leadId) {
  // Category/paged browsing already fetched this lead and its visible contact.
  // Reuse that complete pair on intent instead of repeating core/link/contact
  // requests merely because the list cache has a more specific key.
  for (const key of primaryRecordsCache.keys()) {
    if (key !== workspaceId && !key.startsWith(`${workspaceId}:`)) continue
    const cached = readFreshCache(primaryRecordsCache, key)?.data
    const lead = cached?.leads?.find((row) => normalizeText(row?.leadId) === leadId)
    if (!lead) continue
    const contactId = normalizeText(lead.contactId)
    let contact = (cached.contacts || []).find((row) => normalizeText(row?.contactId) === contactId) || null
    if (contactId && !contact) {
      for (const contactKey of contactRecordsCache.keys()) {
        if (!contactKey.startsWith(`${workspaceId}:`)) continue
        contact = readFreshCache(contactRecordsCache, contactKey)?.data?.find((row) => normalizeText(row?.contactId) === contactId) || null
        if (contact) break
      }
    }
    // An incomplete list row must still take the full guarded core-read path.
    if (!contactId || contact) return { lead, contact, source: 'primary-cache' }
  }
  return null
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
  if (cached) {
    const core = writeAgencyLeadCoreCache(workspaceId, resolvedLeadId, cached)
    seedAgencyLeadWorkspaceSnapshot(workspaceId, resolvedLeadId, core, core?.source || 'lead_core_cache')
    return core
  }

  const cacheKey = `${workspaceId}:${resolvedLeadId}`
  if (leadCoreRequestCache.has(cacheKey)) return leadCoreRequestCache.get(cacheKey)

  const promise = selectCompatibleLeads(workspaceId, resolvedLeadId).then(async (leadResult) => {
    if (leadResult.error && !isUnavailable(leadResult.error)) throw leadResult.error
    if (!leadResult.data) return null
    const [lead] = await enrichDevelopmentBuyerLeads(workspaceId, [mapLead(leadResult.data)])
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
    if (leadCoreRequestCache.get(cacheKey) === promise) {
      writeAgencyLeadCoreCache(workspaceId, resolvedLeadId, data)
      seedAgencyLeadWorkspaceSnapshot(workspaceId, resolvedLeadId, data, 'remote_core')
    }
    return data
  }).finally(() => {
    if (leadCoreRequestCache.get(cacheKey) === promise) leadCoreRequestCache.delete(cacheKey)
  })

  leadCoreRequestCache.set(cacheKey, promise)
  return promise
}

export function preloadAgencyLeadListRecords(organisationId) {
  const workspaceId = requireWorkspaceId(organisationId)
  return fetchPrimaryRecords(workspaceId).catch(() => null)
}

export function invalidateAgencyLeadListCache(organisationId, leadId = '') {
  cacheRevision += 1
  const workspaceId = normalizeText(organisationId)
  if (!workspaceId) {
    clearAgencyLeadCoreCache()
    primaryRecordsCache.clear()
    landingMetricsCache.clear()
    leadCoreRequestCache.clear()
    contactRecordsCache.clear()
    return
  }
  for (const key of contactRecordsCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) contactRecordsCache.delete(key)
  }
  for (const key of primaryRecordsCache.keys()) {
    if (key === workspaceId || key.startsWith(`${workspaceId}:`)) primaryRecordsCache.delete(key)
  }
  for (const key of landingMetricsCache.keys()) {
    if (key === workspaceId || key.startsWith(`${workspaceId}:`)) landingMetricsCache.delete(key)
  }
  const resolvedLeadId = normalizeText(leadId)
  if (resolvedLeadId) {
    deleteAgencyLeadCoreCache(workspaceId, resolvedLeadId)
    leadCoreRequestCache.delete(`${workspaceId}:${resolvedLeadId}`)
  } else {
    clearAgencyLeadCoreCache(workspaceId)
    for (const key of leadCoreRequestCache.keys()) {
      if (key.startsWith(`${workspaceId}:`)) leadCoreRequestCache.delete(key)
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('bridge:workspace-scoped-cache-cleared', () => invalidateAgencyLeadListCache())
  window.addEventListener(AGENCY_CRM_UPDATED_EVENT, (event) => {
    const update = getAgencyCrmUpdateDetail(event)
    invalidateAgencyLeadListCache(update.organisationId, update.leadId)
  })
}

export async function listAgencyLeadListRecords(organisationId, options = {}) {
  const workspaceId = requireWorkspaceId(organisationId)
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is required before loading agency CRM data.')

  const includePrimaryRecords = options.includePrimaryRecords !== false
  const includeRelatedRecords = options.includeRelatedRecords !== false
  const category = ['buyer', 'seller', 'development', 'archived'].includes(options.category) ? options.category : ''
  const agentScope = agencyLeadAgentScope(options.scopedAgent)
  const empty = Promise.resolve({ data: [], error: null })
  const requests = [
    includePrimaryRecords
      ? category ? fetchCategoryRecords(workspaceId, {
          category,
          forceRefresh: options.forceRefresh === true,
          agentScope,
        }) : fetchPrimaryRecords(workspaceId, {
          forceRefresh: options.forceRefresh === true,
          page: options.page,
          pageSize: options.pageSize,
          agentScope,
        })
      : Promise.resolve({ leads: [], contacts: [], totalCount: 0, page: 0, pageSize: 0 }),
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

  const leadActivities = Array.isArray(activities.data) ? activities.data.map(mapActivity) : []
  const mappedTasks = Array.isArray(tasks.data) ? tasks.data.map(mapTask) : []
  const searchContacts = category && includePrimaryRecords && options.filters?.search
    ? await fetchLeadContacts(workspaceId, primary.leads, options) : []
  const rows = category && includePrimaryRecords ? buildAgencyLeadListModel({
    leads: primary.leads, contacts: searchContacts, activities: leadActivities, tasks: mappedTasks,
    category, filters: options.filters, includePresentation: false,
  }).rows : null
  const totalCount = rows ? rows.length : Number(primary.totalCount || 0)
  const pageSize = rows ? Math.max(0, Math.round(Number(options.pageSize) || 0)) : Number(primary.pageSize || 0)
  const requestedPage = Math.max(0, Math.round(Number(options.page) || 0))
  const page = rows ? (pageSize ? Math.min(requestedPage, Math.max(0, Math.ceil(totalCount / pageSize) - 1)) : 0) : Number(primary.page || 0)
  const leads = rows ? (pageSize ? rows.slice(page * pageSize, (page + 1) * pageSize) : rows).map((row) => row.raw) : primary.leads
  const pageContactIds = new Set(leads.map((lead) => lead.contactId))
  const contacts = rows ? (options.filters?.search ? searchContacts : await fetchLeadContacts(workspaceId, leads, options)) : primary.contacts

  return {
    leads,
    contacts: rows ? contacts.filter((contact) => pageContactIds.has(contact.contactId)) : primary.contacts,
    leadActivities,
    tasks: mappedTasks,
    totalCount,
    page,
    pageSize,
    ...(rows ? {
      metricLeads: primary.metricLeads,
      sources: [...new Set(primary.leads.map((lead) => lead.leadSource).filter(Boolean))].sort(),
    } : {}),
    source: 'remote',
  }
}

export async function listAgencyLeadLandingMetrics(organisationId, { forceRefresh = false, scopedAgent = null } = {}) {
  const workspaceId = requireWorkspaceId(organisationId)
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is required before loading agency CRM data.')
  return fetchLandingMetricLeads(workspaceId, { forceRefresh, agentScope: agencyLeadAgentScope(scopedAgent) })
}
