import {
  deleteLeadActivity,
  deleteAgencyLead,
  deleteLeadTask,
  getAgencyPipelineSnapshot,
  reconcileAgencyPipelineSnapshot,
  updateAgencyContact,
  updateLeadActivity,
  updateAgencyLead,
  updateLeadTask,
} from './agencyPipelineService'
import { isUnsafeFallbackAllowed } from './envValidation'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import { assertResolvedWorkspaceContext } from '../services/workspaceResolutionService'

const LEAD_SELECT_FIELDS =
  'lead_id, organisation_id, assigned_agent_id, contact_id, lead_category, lead_direction, lead_source, stage, status, priority, budget, area_interest, property_interest, seller_property_address, estimated_value, notes, converted_transaction_id, created_at, updated_at'
const LEAD_SELECT_FIELDS_EXTENDED =
  `${LEAD_SELECT_FIELDS}, listing_id, mandate_packet_id, seller_onboarding_token, seller_onboarding_status`
const LEAD_ACTIVITY_SELECT_FIELDS =
  'activity_id, organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome, created_at'
const TASK_SELECT_FIELDS =
  'task_id, organisation_id, lead_id, assigned_agent_id, title, description, due_date, status, priority, created_at, updated_at'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function requireAgencyWorkspaceId(organisationId, service) {
  const workspaceId = normalizeText(organisationId)
  assertResolvedWorkspaceContext({ organisationId: workspaceId, appRole: 'agent' }, { service })
  if (!isUuidLike(workspaceId)) {
    throw new Error('A valid resolved agency workspace id is required before loading CRM data.')
  }
  return workspaceId
}

function normalizeLeadUuid(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (isUuidLike(raw)) return raw
  const withoutPrefix = raw.replace(/^lead_/i, '')
  return isUuidLike(withoutPrefix) ? withoutPrefix : ''
}

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.padEnd(32, '0').slice(0, 32)
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-8${seed.slice(17, 20)}-${seed.slice(20, 32)}`
}

function isMissingColumnError(error, columnName = '') {
  const message = String(error?.message || error?.details || '')
  const code = normalizeText(error?.code).toUpperCase()
  const normalizedColumn = normalizeText(columnName).toLowerCase()
  if (normalizedColumn && message.toLowerCase().includes(normalizedColumn)) {
    return true
  }
  return code === '42703' || code === 'PGRST204' || /column .* does not exist/i.test(message) || message.toLowerCase().includes('schema cache')
}

function isMissingSchemaOrTableError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLowerText(error?.message || error?.details || '')
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || message.includes('does not exist')
}

function isPermissionDeniedError(error) {
  const status = Number(error?.status || error?.statusCode || 0)
  const code = normalizeText(error?.code)
  const message = normalizeLowerText(error?.message || error?.details || '')
  return status === 403 || code === '42501' || message.includes('permission denied') || message.includes('row-level security')
}

function isMissingRpcError(error, functionName = '') {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLowerText(error?.message || error?.details || '')
  const target = normalizeLowerText(functionName)
  return code === '42883' || message.includes('function') && message.includes(target)
}

function mapSupabaseContact(row = {}) {
  return {
    contactId: normalizeText(row?.contact_id),
    organisationId: normalizeText(row?.organisation_id),
    assignedAgentId: normalizeText(row?.assigned_agent_id),
    assignedAgentName: '',
    assignedAgentEmail: '',
    firstName: normalizeText(row?.first_name),
    lastName: normalizeText(row?.last_name),
    phone: normalizeText(row?.phone),
    email: normalizeText(row?.email).toLowerCase(),
    contactType: normalizeText(row?.contact_type) || 'Lead',
    notes: normalizeText(row?.notes),
    createdAt: row?.created_at || new Date().toISOString(),
    updatedAt: row?.updated_at || new Date().toISOString(),
  }
}

function mapSupabaseLead(row = {}) {
  return {
    leadId: normalizeText(row?.lead_id),
    organisationId: normalizeText(row?.organisation_id),
    assignedAgentId: normalizeText(row?.assigned_agent_id),
    assignedAgentName: '',
    assignedAgentEmail: '',
    contactId: normalizeText(row?.contact_id),
    leadCategory: normalizeText(row?.lead_category) || 'Buyer',
    leadDirection: normalizeText(row?.lead_direction) || 'Inbound',
    leadSource: normalizeText(row?.lead_source) || 'Other',
    stage: normalizeText(row?.stage) || 'New Lead',
    status: normalizeText(row?.status) || normalizeText(row?.stage) || 'New Lead',
    priority: normalizeText(row?.priority) || 'Medium',
    budget: Number(row?.budget || 0) || 0,
    areaInterest: normalizeText(row?.area_interest),
    propertyInterest: normalizeText(row?.property_interest),
    sellerPropertyAddress: normalizeText(row?.seller_property_address),
    estimatedValue: Number(row?.estimated_value || 0) || 0,
    notes: normalizeText(row?.notes),
    sellerOnboardingToken: normalizeText(row?.seller_onboarding_token),
    sellerOnboardingLink: '',
    sellerOnboardingStatus: normalizeText(row?.seller_onboarding_status),
    sellerWorkflowLeadId: '',
    mandatePacketId: normalizeText(row?.mandate_packet_id),
    listingId: normalizeText(row?.listing_id),
    createdAt: row?.created_at || new Date().toISOString(),
    updatedAt: row?.updated_at || new Date().toISOString(),
    convertedDealId: normalizeText(row?.converted_transaction_id) || null,
    convertedTransactionId: normalizeText(row?.converted_transaction_id) || null,
  }
}

function mapSupabaseLeadActivity(row = {}) {
  return {
    activityId: normalizeText(row?.activity_id),
    organisationId: normalizeText(row?.organisation_id),
    leadId: normalizeText(row?.lead_id),
    agentId: normalizeText(row?.agent_id),
    agentName: '',
    agentEmail: '',
    activityType: normalizeText(row?.activity_type) || 'Note',
    activityNote: normalizeText(row?.activity_note),
    activityDate: row?.activity_date || row?.created_at || new Date().toISOString(),
    outcome: normalizeText(row?.outcome),
    createdAt: row?.created_at || new Date().toISOString(),
  }
}

function mapSupabaseTask(row = {}) {
  return {
    taskId: normalizeText(row?.task_id),
    organisationId: normalizeText(row?.organisation_id),
    leadId: normalizeText(row?.lead_id),
    assignedAgentId: normalizeText(row?.assigned_agent_id),
    assignedAgentName: '',
    assignedAgentEmail: '',
    title: normalizeText(row?.title) || 'Follow-up',
    description: normalizeText(row?.description),
    dueDate: row?.due_date || null,
    status: normalizeText(row?.status) || 'Pending',
    priority: normalizeText(row?.priority) || 'Medium',
    createdAt: row?.created_at || new Date().toISOString(),
    updatedAt: row?.updated_at || new Date().toISOString(),
  }
}

function buildLocalLeadAndContactRows(payload = {}, organisationId = '') {
  const nowIso = new Date().toISOString()
  const leadPayload = {
    ...payload,
    ...(payload?.lead && typeof payload.lead === 'object' ? payload.lead : {}),
  }
  const contactId = normalizeText(payload?.contact?.contactId) || createUuid()
  const leadId = normalizeText(leadPayload?.leadId) || createUuid()
  const assignedAgent = payload?.assignedAgent || {}
  const contact = {
    contactId,
    organisationId,
    assignedAgentId: normalizeText(assignedAgent?.id),
    assignedAgentName: normalizeText(assignedAgent?.name || assignedAgent?.fullName),
    assignedAgentEmail: normalizeText(assignedAgent?.email).toLowerCase(),
    firstName: normalizeText(payload?.contact?.firstName) || 'Lead',
    lastName: normalizeText(payload?.contact?.lastName),
    phone: normalizeText(payload?.contact?.phone),
    email: normalizeText(payload?.contact?.email).toLowerCase(),
    contactType: normalizeText(payload?.contact?.contactType || leadPayload?.leadCategory) || 'Lead',
    notes: normalizeText(payload?.contact?.notes),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  const lead = {
    leadId,
    organisationId,
    assignedAgentId: normalizeText(assignedAgent?.id),
    assignedAgentName: normalizeText(assignedAgent?.name || assignedAgent?.fullName),
    assignedAgentEmail: normalizeText(assignedAgent?.email).toLowerCase(),
    contactId,
    leadCategory: normalizeText(leadPayload?.leadCategory) || 'Buyer',
    leadDirection: normalizeText(leadPayload?.leadDirection) || 'Inbound',
    leadSource: normalizeText(leadPayload?.leadSource) || 'Other',
    stage: normalizeText(leadPayload?.stage) || 'New Lead',
    status: normalizeText(leadPayload?.status || leadPayload?.stage) || 'New Lead',
    priority: normalizeText(leadPayload?.priority) || 'Medium',
    budget: Number(leadPayload?.budget || 0) || 0,
    areaInterest: normalizeText(leadPayload?.areaInterest),
    propertyInterest: normalizeText(leadPayload?.propertyInterest),
    sellerPropertyAddress: normalizeText(leadPayload?.sellerPropertyAddress),
    estimatedValue: Number(leadPayload?.estimatedValue || 0) || 0,
    listingId: normalizeText(leadPayload?.listingId || leadPayload?.listing_id),
    notes: normalizeText(leadPayload?.notes),
    canvassingProspectId: normalizeText(leadPayload?.canvassingProspectId),
    sellerName: normalizeText(leadPayload?.sellerName || payload?.contact?.firstName),
    sellerSurname: normalizeText(leadPayload?.sellerSurname || payload?.contact?.lastName),
    sellerEmail: normalizeText(leadPayload?.sellerEmail || payload?.contact?.email).toLowerCase(),
    sellerPhone: normalizeText(leadPayload?.sellerPhone || payload?.contact?.phone),
    syncStatus: normalizeText(leadPayload?.syncStatus || leadPayload?.sync_status),
    syncError: normalizeText(leadPayload?.syncError || leadPayload?.sync_error),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  return { contact, lead }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key)
}

function normalizeNullableUuid(value) {
  const raw = normalizeText(value)
  if (!raw) return null
  return isUuidLike(raw) ? raw : null
}

function normalizeSellerOnboardingStatusValue(value) {
  const normalized = normalizeLowerText(value).replace(/\s+/g, '_')
  if (['not_started', 'sent', 'in_progress', 'completed', 'rejected'].includes(normalized)) {
    return normalized
  }
  return ''
}

function buildRemoteLeadUpdatePayload(patch = {}) {
  const corePayload = {}
  const bridgePayload = {}

  if (hasOwn(patch, 'assignedAgentId')) corePayload.assigned_agent_id = normalizeNullableUuid(patch.assignedAgentId)
  if (hasOwn(patch, 'contactId')) corePayload.contact_id = normalizeNullableUuid(patch.contactId)
  if (hasOwn(patch, 'leadCategory')) corePayload.lead_category = normalizeText(patch.leadCategory) || 'Buyer'
  if (hasOwn(patch, 'leadDirection')) corePayload.lead_direction = normalizeText(patch.leadDirection) || 'Inbound'
  if (hasOwn(patch, 'leadSource')) corePayload.lead_source = normalizeText(patch.leadSource) || 'Other'
  if (hasOwn(patch, 'stage')) corePayload.stage = normalizeText(patch.stage) || 'New Lead'
  if (hasOwn(patch, 'status')) corePayload.status = normalizeText(patch.status) || normalizeText(patch.stage) || 'New Lead'
  if (hasOwn(patch, 'priority')) corePayload.priority = normalizeText(patch.priority) || 'Medium'
  if (hasOwn(patch, 'budget')) corePayload.budget = Number(patch.budget || 0) || 0
  if (hasOwn(patch, 'areaInterest')) corePayload.area_interest = normalizeText(patch.areaInterest) || null
  if (hasOwn(patch, 'propertyInterest')) corePayload.property_interest = normalizeText(patch.propertyInterest) || null
  if (hasOwn(patch, 'sellerPropertyAddress')) corePayload.seller_property_address = normalizeText(patch.sellerPropertyAddress) || null
  if (hasOwn(patch, 'estimatedValue')) corePayload.estimated_value = Number(patch.estimatedValue || 0) || 0
  if (hasOwn(patch, 'notes')) corePayload.notes = normalizeText(patch.notes) || null

  if (hasOwn(patch, 'listingId')) bridgePayload.listing_id = normalizeText(patch.listingId) || null
  if (hasOwn(patch, 'mandatePacketId')) {
    const mandatePacketId = normalizeText(patch.mandatePacketId)
    if (!mandatePacketId) {
      bridgePayload.mandate_packet_id = null
    } else if (isUuidLike(mandatePacketId)) {
      bridgePayload.mandate_packet_id = mandatePacketId
    }
  }
  if (hasOwn(patch, 'sellerOnboardingToken')) bridgePayload.seller_onboarding_token = normalizeText(patch.sellerOnboardingToken) || null
  if (hasOwn(patch, 'sellerOnboardingStatus')) {
    const onboardingStatus = normalizeSellerOnboardingStatusValue(patch.sellerOnboardingStatus)
    if (onboardingStatus) {
      bridgePayload.seller_onboarding_status = onboardingStatus
    }
  }

  return {
    corePayload,
    bridgePayload,
    payload: {
      ...corePayload,
      ...bridgePayload,
    },
  }
}

export async function listAgencyCrmLeadContacts(organisationId) {
  const workspaceId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.listAgencyCrmLeadContacts')
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before loading agency CRM data.')
  }

  let leadResult = await supabase
    .from('leads')
    .select(LEAD_SELECT_FIELDS_EXTENDED)
    .eq('organisation_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (leadResult.error && isMissingColumnError(leadResult.error)) {
    leadResult = await supabase
      .from('leads')
      .select(LEAD_SELECT_FIELDS)
      .eq('organisation_id', workspaceId)
      .order('updated_at', { ascending: false })
  }

  const contactResult = await supabase
    .from('contacts')
    .select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at')
    .eq('organisation_id', workspaceId)
    .order('updated_at', { ascending: false })
  const activityResult = await supabase
    .from('lead_activities')
    .select(LEAD_ACTIVITY_SELECT_FIELDS)
    .eq('organisation_id', workspaceId)
    .order('activity_date', { ascending: false })
  const taskResult = await supabase
    .from('tasks')
    .select(TASK_SELECT_FIELDS)
    .eq('organisation_id', workspaceId)
    .order('updated_at', { ascending: false })

  const leadBlocked = leadResult.error && (isPermissionDeniedError(leadResult.error) || isMissingSchemaOrTableError(leadResult.error))
  const contactBlocked = contactResult.error && (isPermissionDeniedError(contactResult.error) || isMissingSchemaOrTableError(contactResult.error))
  const activityBlocked = activityResult.error && (isPermissionDeniedError(activityResult.error) || isMissingSchemaOrTableError(activityResult.error))
  const taskBlocked = taskResult.error && (isPermissionDeniedError(taskResult.error) || isMissingSchemaOrTableError(taskResult.error))
  if (leadResult.error && !leadBlocked) throw leadResult.error
  if (contactResult.error && !contactBlocked) throw contactResult.error
  if (activityResult.error && !activityBlocked) throw activityResult.error
  if (taskResult.error && !taskBlocked) throw taskResult.error

  const remoteContacts = Array.isArray(contactResult.data) ? contactResult.data.map(mapSupabaseContact) : []
  const remoteLeads = Array.isArray(leadResult.data) ? leadResult.data.map(mapSupabaseLead) : []
  const remoteLeadActivities = Array.isArray(activityResult.data) ? activityResult.data.map(mapSupabaseLeadActivity) : []
  const remoteTasks = Array.isArray(taskResult.data) ? taskResult.data.map(mapSupabaseTask) : []

  const reconciled = reconcileAgencyPipelineSnapshot(workspaceId, {
    contacts: remoteContacts,
    leads: remoteLeads,
    leadActivities: remoteLeadActivities,
    tasks: remoteTasks,
  }, {
    replaceCollections: ['contacts', 'leads', 'leadActivities', 'tasks'],
  })

  return {
    contacts: Array.isArray(reconciled.contacts) ? reconciled.contacts : remoteContacts,
    leads: Array.isArray(reconciled.leads) ? reconciled.leads : remoteLeads,
    leadActivities: Array.isArray(reconciled.leadActivities) ? reconciled.leadActivities : remoteLeadActivities,
    tasks: Array.isArray(reconciled.tasks) ? reconciled.tasks : remoteTasks,
    source: 'remote',
  }
}

export async function fetchAgencyCrmLeadWorkspace(organisationId, leadId) {
  const workspaceId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.fetchAgencyCrmLeadWorkspace')
  const leadUuid = normalizeLeadUuid(leadId)
  if (!leadUuid) {
    return {
      contacts: [],
      leads: [],
      leadActivities: [],
      tasks: [],
      source: 'remote',
    }
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before loading agency CRM lead data.')
  }

  let leadResult = await supabase
    .from('leads')
    .select(LEAD_SELECT_FIELDS_EXTENDED)
    .eq('organisation_id', workspaceId)
    .eq('lead_id', leadUuid)
    .maybeSingle()

  if (leadResult.error && isMissingColumnError(leadResult.error)) {
    leadResult = await supabase
      .from('leads')
      .select(LEAD_SELECT_FIELDS)
      .eq('organisation_id', workspaceId)
      .eq('lead_id', leadUuid)
      .maybeSingle()
  }

  const leadBlocked = leadResult.error && (isPermissionDeniedError(leadResult.error) || isMissingSchemaOrTableError(leadResult.error))
  if (leadResult.error && !leadBlocked) throw leadResult.error
  if (leadBlocked || !leadResult.data) {
    return {
      contacts: [],
      leads: [],
      leadActivities: [],
      tasks: [],
      source: 'remote',
    }
  }

  const contactId = normalizeText(leadResult.data?.contact_id)
  const contactPromise = contactId
    ? supabase
      .from('contacts')
      .select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at')
      .eq('organisation_id', workspaceId)
      .eq('contact_id', contactId)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null })
  const activityPromise = supabase
    .from('lead_activities')
    .select(LEAD_ACTIVITY_SELECT_FIELDS)
    .eq('organisation_id', workspaceId)
    .eq('lead_id', leadUuid)
    .order('activity_date', { ascending: false })
  const taskPromise = supabase
    .from('tasks')
    .select(TASK_SELECT_FIELDS)
    .eq('organisation_id', workspaceId)
    .eq('lead_id', leadUuid)
    .order('updated_at', { ascending: false })

  const [contactResult, activityResult, taskResult] = await Promise.all([contactPromise, activityPromise, taskPromise])
  const contactBlocked = contactResult.error && (isPermissionDeniedError(contactResult.error) || isMissingSchemaOrTableError(contactResult.error))
  const activityBlocked = activityResult.error && (isPermissionDeniedError(activityResult.error) || isMissingSchemaOrTableError(activityResult.error))
  const taskBlocked = taskResult.error && (isPermissionDeniedError(taskResult.error) || isMissingSchemaOrTableError(taskResult.error))
  if (contactResult.error && !contactBlocked) throw contactResult.error
  if (activityResult.error && !activityBlocked) throw activityResult.error
  if (taskResult.error && !taskBlocked) throw taskResult.error

  return {
    contacts: contactResult.data && !contactBlocked ? [mapSupabaseContact(contactResult.data)] : [],
    leads: [mapSupabaseLead(leadResult.data)],
    leadActivities: Array.isArray(activityResult.data) && !activityBlocked ? activityResult.data.map(mapSupabaseLeadActivity) : [],
    tasks: Array.isArray(taskResult.data) && !taskBlocked ? taskResult.data.map(mapSupabaseTask) : [],
    source: 'remote',
  }
}

export async function createAgencyCrmLeadRecord(organisationId, payload = {}, { actor = null, requireRemote = false } = {}) {
  const workspaceId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.createAgencyCrmLeadRecord')
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before creating agency CRM data.')
  }

  const { contact, lead } = buildLocalLeadAndContactRows(payload, workspaceId)

  try {
    const contactResult = await supabase.from('contacts').upsert({
      contact_id: normalizeText(contact.contactId),
      organisation_id: workspaceId,
      assigned_agent_id: normalizeNullableUuid(contact.assignedAgentId),
      first_name: normalizeText(contact.firstName),
      last_name: normalizeText(contact.lastName),
      phone: normalizeText(contact.phone) || null,
      email: normalizeText(contact.email).toLowerCase() || null,
      contact_type: normalizeText(contact.contactType) || 'Lead',
      notes: normalizeText(contact.notes) || null,
      updated_at: contact.updatedAt,
    }, { onConflict: 'contact_id' })
    if (contactResult.error) throw contactResult.error

    const leadPayloadForRemote = {
      lead_id: normalizeText(lead.leadId),
      organisation_id: workspaceId,
      assigned_agent_id: normalizeNullableUuid(lead.assignedAgentId),
      contact_id: normalizeText(lead.contactId) || null,
      lead_category: normalizeText(lead.leadCategory) || 'Buyer',
      lead_direction: normalizeText(lead.leadDirection) || 'Inbound',
      lead_source: normalizeText(lead.leadSource) || 'Other',
      stage: normalizeText(lead.stage) || 'New Lead',
      status: normalizeText(lead.status) || 'New Lead',
      priority: normalizeText(lead.priority) || 'Medium',
      budget: Number(lead.budget || 0) || 0,
      area_interest: normalizeText(lead.areaInterest) || null,
      property_interest: normalizeText(lead.propertyInterest) || null,
      seller_property_address: normalizeText(lead.sellerPropertyAddress) || null,
      estimated_value: Number(lead.estimatedValue || 0) || 0,
      listing_id: normalizeText(lead.listingId) || null,
      notes: normalizeText(lead.notes) || null,
      updated_at: lead.updatedAt,
    }
    let leadResult = await supabase.from('leads').upsert(leadPayloadForRemote, { onConflict: 'lead_id' })
    if (leadResult.error && isMissingColumnError(leadResult.error, 'listing_id')) {
      const fallbackLeadPayload = { ...leadPayloadForRemote }
      delete fallbackLeadPayload.listing_id
      leadResult = await supabase.from('leads').upsert(fallbackLeadPayload, { onConflict: 'lead_id' })
    }
    if (leadResult.error) throw leadResult.error

    const reconciled = reconcileAgencyPipelineSnapshot(workspaceId, {
      contacts: [contact],
      leads: [{
        ...lead,
        syncStatus: '',
        syncError: '',
      }],
    })
    return (Array.isArray(reconciled.leads) ? reconciled.leads : []).find((row) => normalizeText(row?.leadId) === normalizeText(lead.leadId)) || lead
  } catch (error) {
    console.error('[agencyCrmRepository] create lead failed without local fallback', error)
    throw error
  }
}

export async function ensureAgencyCrmLeadRecordPersisted(organisationId, lead = {}, contact = {}, { actor = null } = {}) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.ensureAgencyCrmLeadRecordPersisted')
  const normalizedLeadId = normalizeLeadUuid(lead?.leadId || lead?.lead_id || lead?.id)
  if (!normalizedOrganisationId || !isUuidLike(normalizedOrganisationId)) {
    throw new Error('A database-backed organisation is required before this buyer lifecycle action can continue.')
  }
  if (!normalizedLeadId) {
    throw new Error('This lead is using a legacy local id. Repair the lead before continuing with viewings or offers.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before this buyer lifecycle action can continue.')
  }

  const assignedAgent = {
    id: normalizeText(lead?.assignedAgentId || lead?.assigned_agent_id || actor?.id),
    name: normalizeText(lead?.assignedAgentName || lead?.assigned_agent_name || actor?.name || actor?.fullName),
    email: normalizeText(lead?.assignedAgentEmail || lead?.assigned_agent_email || actor?.email).toLowerCase(),
  }
  const contactId = normalizeNullableUuid(contact?.contactId || contact?.contact_id || lead?.contactId || lead?.contact_id) || createUuid()
  const firstName = normalizeText(contact?.firstName || contact?.first_name || lead?.firstName || lead?.first_name || lead?.sellerName)
  const lastName = normalizeText(contact?.lastName || contact?.last_name || lead?.lastName || lead?.last_name || lead?.sellerSurname)
  const email = normalizeText(contact?.email || lead?.email || lead?.sellerEmail).toLowerCase()
  const phone = normalizeText(contact?.phone || lead?.phone || lead?.sellerPhone)

  const existing = await supabase
    .from('leads')
    .select('lead_id, contact_id')
    .eq('organisation_id', normalizedOrganisationId)
    .eq('lead_id', normalizedLeadId)
    .maybeSingle()

  if (existing.error && !isMissingSchemaOrTableError(existing.error) && !isPermissionDeniedError(existing.error)) {
    throw existing.error
  }
  if (existing.data?.lead_id) {
    const resolvedContactId = normalizeNullableUuid(existing.data.contact_id) || contactId
    const contactResult = await supabase.from('contacts').upsert({
      contact_id: resolvedContactId,
      organisation_id: normalizedOrganisationId,
      assigned_agent_id: normalizeNullableUuid(assignedAgent.id),
      first_name: firstName || 'Lead',
      last_name: lastName || null,
      phone: phone || null,
      email: email || null,
      contact_type: normalizeText(contact?.contactType || contact?.contact_type || lead?.leadCategory || lead?.lead_category) || 'Lead',
      notes: normalizeText(contact?.notes) || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'contact_id' })
    if (contactResult.error) throw contactResult.error

    if (normalizeText(existing.data.contact_id) !== resolvedContactId) {
      const leadLinkResult = await supabase
        .from('leads')
        .update({ contact_id: resolvedContactId, updated_at: new Date().toISOString() })
        .eq('organisation_id', normalizedOrganisationId)
        .eq('lead_id', normalizedLeadId)
      if (leadLinkResult.error) throw leadLinkResult.error
    }

    if (normalizeText(lead?.syncStatus || lead?.sync_status) && isUnsafeFallbackAllowed()) {
      updateAgencyLead(normalizedOrganisationId, normalizedLeadId, {
        syncStatus: '',
        syncError: '',
        contactId: resolvedContactId,
      })
    }
    return {
      ok: true,
      repaired: false,
      leadId: existing.data.lead_id,
      contactId: resolvedContactId,
    }
  }

  const repairedLead = await createAgencyCrmLeadRecord(
    normalizedOrganisationId,
    {
      assignedAgent,
      contact: {
        contactId,
        firstName: firstName || 'Lead',
        lastName,
        email,
        phone,
        contactType: normalizeText(contact?.contactType || contact?.contact_type || lead?.leadCategory || lead?.lead_category) || 'Lead',
        notes: normalizeText(contact?.notes),
      },
      lead: {
        leadId: normalizedLeadId,
        contactId,
        leadCategory: normalizeText(lead?.leadCategory || lead?.lead_category) || 'Buyer',
        leadDirection: normalizeText(lead?.leadDirection || lead?.lead_direction) || 'Inbound',
        leadSource: normalizeText(lead?.leadSource || lead?.lead_source) || 'Other',
        stage: normalizeText(lead?.stage || lead?.currentStage || lead?.current_stage) || 'New Lead',
        status: normalizeText(lead?.status || lead?.stage || lead?.currentStage || lead?.current_stage) || 'New Lead',
        priority: normalizeText(lead?.priority) || 'Medium',
        budget: Number(lead?.budget || 0) || 0,
        areaInterest: normalizeText(lead?.areaInterest || lead?.area_interest),
        propertyInterest: normalizeText(lead?.propertyInterest || lead?.property_interest),
        sellerPropertyAddress: normalizeText(lead?.sellerPropertyAddress || lead?.seller_property_address),
        estimatedValue: Number(lead?.estimatedValue || lead?.estimated_value || 0) || 0,
        listingId: normalizeText(lead?.listingId || lead?.listing_id),
        notes: normalizeText(lead?.notes),
      },
    },
    { actor, requireRemote: true },
  )

  return {
    ok: true,
    repaired: true,
    leadId: normalizeText(repairedLead?.leadId || normalizedLeadId),
    contactId: normalizeText(repairedLead?.contactId || contactId),
  }
}

export async function updateAgencyCrmLeadRecord(organisationId, leadId, patch = {}) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.updateAgencyCrmLeadRecord')
  const normalizedLeadId = normalizeText(leadId)
  if (!normalizedLeadId) return null

  const updatedAt = new Date().toISOString()
  const updatedLead = isUnsafeFallbackAllowed()
    ? updateAgencyLead(normalizedOrganisationId, normalizedLeadId, patch)
    : {
        ...patch,
        leadId: normalizedLeadId,
        organisationId: normalizedOrganisationId,
        updatedAt,
      }
  const dbLeadId = normalizeLeadUuid(normalizedLeadId)

  if (!isSupabaseConfigured || !supabase || !isUuidLike(normalizedOrganisationId) || !dbLeadId) {
    throw new Error('Supabase and a persisted lead id are required before updating agency CRM data.')
  }

  const { corePayload, bridgePayload, payload } = buildRemoteLeadUpdatePayload(patch)
  const payloadWithTimestamp = {
    ...payload,
    updated_at: updatedAt,
  }

  if (Object.keys(payloadWithTimestamp).length <= 1) {
    return updatedLead
  }

  try {
    let updateResult = await supabase
      .from('leads')
      .update(payloadWithTimestamp)
      .eq('organisation_id', normalizedOrganisationId)
      .eq('lead_id', dbLeadId)
      .select('lead_id')

    if (updateResult.error && isMissingColumnError(updateResult.error) && Object.keys(bridgePayload).length > 0) {
      updateResult = await supabase
        .from('leads')
        .update({
          ...corePayload,
          updated_at: payloadWithTimestamp.updated_at,
        })
        .eq('organisation_id', normalizedOrganisationId)
        .eq('lead_id', dbLeadId)
        .select('lead_id')
    }

    if (updateResult.error) {
      throw updateResult.error
    }
  } catch (error) {
    console.error('[agencyCrmRepository] update lead failed without local fallback', error)
    throw error
  }

  return updatedLead
}

export async function updateAgencyCrmContactRecord(organisationId, contactId, patch = {}) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.updateAgencyCrmContactRecord')
  const normalizedContactId = normalizeText(contactId)
  if (!normalizedContactId) return null

  const updatedAt = new Date().toISOString()
  const updatedContact = isUnsafeFallbackAllowed()
    ? updateAgencyContact(normalizedOrganisationId, normalizedContactId, patch)
    : {
        ...patch,
        contactId: normalizedContactId,
        organisationId: normalizedOrganisationId,
        updatedAt,
      }
  const dbContactId = normalizeNullableUuid(normalizedContactId)

  if (!isSupabaseConfigured || !supabase || !isUuidLike(normalizedOrganisationId) || !dbContactId) {
    throw new Error('Supabase and a persisted contact id are required before updating agency CRM data.')
  }

  const payload = {
    updated_at: updatedAt,
  }
  if (hasOwn(patch, 'assignedAgentId')) payload.assigned_agent_id = normalizeNullableUuid(patch.assignedAgentId)
  if (hasOwn(patch, 'firstName')) payload.first_name = normalizeText(patch.firstName) || 'Contact'
  if (hasOwn(patch, 'lastName')) payload.last_name = normalizeText(patch.lastName) || null
  if (hasOwn(patch, 'phone')) payload.phone = normalizeText(patch.phone) || null
  if (hasOwn(patch, 'email')) payload.email = normalizeText(patch.email).toLowerCase() || null
  if (hasOwn(patch, 'contactType')) payload.contact_type = normalizeText(patch.contactType) || 'Lead'
  if (hasOwn(patch, 'notes')) payload.notes = normalizeText(patch.notes) || null

  try {
    const updateResult = await supabase
      .from('contacts')
      .update(payload)
      .eq('organisation_id', normalizedOrganisationId)
      .eq('contact_id', dbContactId)
      .select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at')
      .single()
    if (updateResult.error) throw updateResult.error
    const mappedContact = mapSupabaseContact(updateResult.data || {})
    reconcileAgencyPipelineSnapshot(normalizedOrganisationId, {
      contacts: [mappedContact],
    })
  } catch (error) {
    console.error('[agencyCrmRepository] update contact failed without local fallback', error)
    throw error
  }

  return updatedContact
}

export async function createAgencyCrmLeadActivity(organisationId, leadId, payload = {}, { actor = null } = {}) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.createAgencyCrmLeadActivity')
  const normalizedLeadId = normalizeText(leadId)
  if (!normalizedLeadId) return null

  if (!isSupabaseConfigured || !supabase || !isUuidLike(normalizedOrganisationId) || !normalizeLeadUuid(normalizedLeadId)) {
    throw new Error('Supabase and a persisted lead id are required before creating CRM activity.')
  }

  const activityId = createUuid()
  const agentId = normalizeNullableUuid(actor?.id || payload?.agent?.id)
  const nowIso = payload?.activityDate || new Date().toISOString()

  try {
    const insertResult = await supabase
      .from('lead_activities')
      .insert({
        activity_id: activityId,
        organisation_id: normalizedOrganisationId,
        lead_id: normalizeLeadUuid(normalizedLeadId),
        agent_id: agentId,
        activity_type: normalizeText(payload?.activityType) || 'Note',
        activity_note: normalizeText(payload?.activityNote) || null,
        activity_date: nowIso,
        outcome: normalizeText(payload?.outcome) || null,
      })
      .select(LEAD_ACTIVITY_SELECT_FIELDS)
      .single()

    if (insertResult.error) throw insertResult.error
    const mappedActivity = mapSupabaseLeadActivity(insertResult.data || {})
    const reconciled = reconcileAgencyPipelineSnapshot(normalizedOrganisationId, {
      leadActivities: [mappedActivity],
    })
    return (Array.isArray(reconciled.leadActivities) ? reconciled.leadActivities : []).find(
      (row) => normalizeText(row?.activityId) === normalizeText(mappedActivity.activityId),
    ) || mappedActivity
  } catch (error) {
    console.error('[agencyCrmRepository] create activity failed without local fallback', error)
    throw error
  }
}

export async function updateAgencyCrmLeadActivity(organisationId, activityId, updater = {}) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.updateAgencyCrmLeadActivity')
  const normalizedActivityId = normalizeText(activityId)
  if (!normalizedActivityId) return null

  const updatedActivity = updateLeadActivity(normalizedOrganisationId, normalizedActivityId, updater)
  const dbActivityId = normalizeNullableUuid(normalizedActivityId)

  if (!isSupabaseConfigured || !supabase || !isUuidLike(normalizedOrganisationId) || !dbActivityId) {
    throw new Error('Supabase and a persisted activity id are required before updating CRM activity.')
  }

  const payload = {}
  if (hasOwn(updater, 'activityType')) payload.activity_type = normalizeText(updater.activityType) || 'Note'
  if (hasOwn(updater, 'activityNote')) payload.activity_note = normalizeText(updater.activityNote) || null
  if (hasOwn(updater, 'activityDate')) payload.activity_date = updater.activityDate || new Date().toISOString()
  if (hasOwn(updater, 'outcome')) payload.outcome = normalizeText(updater.outcome) || null

  try {
    const updateResult = await supabase
      .from('lead_activities')
      .update(payload)
      .eq('organisation_id', normalizedOrganisationId)
      .eq('activity_id', dbActivityId)
      .select(LEAD_ACTIVITY_SELECT_FIELDS)
      .single()
    if (updateResult.error) throw updateResult.error
    const mappedActivity = mapSupabaseLeadActivity(updateResult.data || {})
    reconcileAgencyPipelineSnapshot(normalizedOrganisationId, {
      leadActivities: [mappedActivity],
    })
  } catch (error) {
    console.error('[agencyCrmRepository] update activity failed without local fallback', error)
    throw error
  }

  return updatedActivity
}

export async function deleteAgencyCrmLeadActivity(organisationId, activityId) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.deleteAgencyCrmLeadActivity')
  const normalizedActivityId = normalizeText(activityId)
  if (!normalizedActivityId) return false

  const locallyDeleted = deleteLeadActivity(normalizedOrganisationId, normalizedActivityId)
  const dbActivityId = normalizeNullableUuid(normalizedActivityId)
  if (!isSupabaseConfigured || !supabase || !isUuidLike(normalizedOrganisationId) || !dbActivityId) {
    throw new Error('Supabase and a persisted activity id are required before deleting CRM activity.')
  }

  try {
    const deleteResult = await supabase
      .from('lead_activities')
      .delete()
      .eq('organisation_id', normalizedOrganisationId)
      .eq('activity_id', dbActivityId)
      .select('activity_id')
    if (deleteResult.error) throw deleteResult.error
    return locallyDeleted || (Array.isArray(deleteResult.data) && deleteResult.data.length > 0)
  } catch (error) {
    console.error('[agencyCrmRepository] delete activity failed without local fallback', error)
    throw error
  }
}

export async function createAgencyCrmLeadTask(organisationId, leadId, payload = {}, { actor = null } = {}) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.createAgencyCrmLeadTask')
  const normalizedLeadId = normalizeText(leadId)
  if (!normalizedLeadId) return null

  if (!isSupabaseConfigured || !supabase || !isUuidLike(normalizedOrganisationId) || !normalizeLeadUuid(normalizedLeadId)) {
    throw new Error('Supabase and a persisted lead id are required before creating CRM tasks.')
  }

  const assignedAgentId = normalizeNullableUuid(payload?.assignedAgent?.id || actor?.id)
  const taskId = createUuid()
  const nowIso = new Date().toISOString()

  try {
    const insertResult = await supabase
      .from('tasks')
      .insert({
        task_id: taskId,
        organisation_id: normalizedOrganisationId,
        lead_id: normalizeLeadUuid(normalizedLeadId),
        assigned_agent_id: assignedAgentId,
        title: normalizeText(payload?.title) || 'Follow-up',
        description: normalizeText(payload?.description) || null,
        due_date: normalizeText(payload?.dueDate) || null,
        status: normalizeText(payload?.status) || 'Pending',
        priority: normalizeText(payload?.priority) || 'Medium',
        updated_at: nowIso,
      })
      .select(TASK_SELECT_FIELDS)
      .single()

    if (insertResult.error) throw insertResult.error
    const mappedTask = mapSupabaseTask(insertResult.data || {})
    const activityResult = await createAgencyCrmLeadActivity(normalizedOrganisationId, normalizedLeadId, {
      activityType: 'Follow-up',
      activityNote: `Task created: ${mappedTask.title}`,
      outcome: mappedTask.status,
      activityDate: nowIso,
    }, { actor })
    void activityResult
    const reconciled = reconcileAgencyPipelineSnapshot(normalizedOrganisationId, {
      tasks: [mappedTask],
    })
    return (Array.isArray(reconciled.tasks) ? reconciled.tasks : []).find(
      (row) => normalizeText(row?.taskId) === normalizeText(mappedTask.taskId),
    ) || mappedTask
  } catch (error) {
    console.error('[agencyCrmRepository] create task failed without local fallback', error)
    throw error
  }
}

export async function updateAgencyCrmLeadTask(organisationId, taskId, updater = {}, { actor = null } = {}) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.updateAgencyCrmLeadTask')
  const normalizedTaskId = normalizeText(taskId)
  if (!normalizedTaskId) return null

  const updatedAt = new Date().toISOString()
  const updatedTask = isUnsafeFallbackAllowed()
    ? updateLeadTask(normalizedOrganisationId, normalizedTaskId, updater, { actor, suppressActivity: true })
    : {
        ...updater,
        taskId: normalizedTaskId,
        organisationId: normalizedOrganisationId,
        status: normalizeText(updater?.status) || 'Pending',
        priority: normalizeText(updater?.priority) || 'Medium',
        updatedAt,
      }
  const dbTaskId = normalizeNullableUuid(normalizedTaskId)

  if (!isSupabaseConfigured || !supabase || !isUuidLike(normalizedOrganisationId) || !dbTaskId) {
    throw new Error('Supabase and a persisted task id are required before updating CRM tasks.')
  }

  const taskPayload = {
    updated_at: updatedAt,
  }
  if (hasOwn(updater, 'title')) taskPayload.title = normalizeText(updater.title) || 'Follow-up'
  if (hasOwn(updater, 'description')) taskPayload.description = normalizeText(updater.description) || null
  if (hasOwn(updater, 'dueDate')) taskPayload.due_date = normalizeText(updater.dueDate) || null
  if (hasOwn(updater, 'status')) taskPayload.status = normalizeText(updatedTask?.status || updater.status) || 'Pending'
  if (hasOwn(updater, 'priority')) taskPayload.priority = normalizeText(updatedTask?.priority || updater.priority) || 'Medium'
  if (hasOwn(updater, 'assignedAgentId')) taskPayload.assigned_agent_id = normalizeNullableUuid(updater.assignedAgentId)

  try {
    const updateResult = await supabase
      .from('tasks')
      .update(taskPayload)
      .eq('organisation_id', normalizedOrganisationId)
      .eq('task_id', dbTaskId)
      .select(TASK_SELECT_FIELDS)
      .single()
    if (updateResult.error) throw updateResult.error
    const mappedTask = mapSupabaseTask(updateResult.data || {})
    const activityResult = updatedTask?.leadId
      ? await createAgencyCrmLeadActivity(normalizedOrganisationId, updatedTask.leadId, {
          activityType: 'Follow-up',
          activityNote: `Task updated: ${mappedTask.title}`,
          outcome: mappedTask.status,
          activityDate: taskPayload.updated_at,
        }, { actor })
      : null
    void activityResult
    reconcileAgencyPipelineSnapshot(normalizedOrganisationId, {
      tasks: [mappedTask],
    })
  } catch (error) {
    console.error('[agencyCrmRepository] update task failed without local fallback', error)
    throw error
  }

  return updatedTask
}

export async function deleteAgencyCrmLeadTask(organisationId, taskId, { actor = null } = {}) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.deleteAgencyCrmLeadTask')
  const normalizedTaskId = normalizeText(taskId)
  if (!normalizedTaskId) return false

  const localSnapshot = isUnsafeFallbackAllowed()
    ? getAgencyPipelineSnapshot(normalizedOrganisationId)
    : { tasks: [] }
  const taskToDelete = (Array.isArray(localSnapshot.tasks) ? localSnapshot.tasks : []).find(
    (row) => normalizeText(row?.taskId) === normalizedTaskId,
  ) || null
  const locallyDeleted = isUnsafeFallbackAllowed()
    ? deleteLeadTask(normalizedOrganisationId, normalizedTaskId)
    : false
  const dbTaskId = normalizeNullableUuid(normalizedTaskId)

  if (!isSupabaseConfigured || !supabase || !isUuidLike(normalizedOrganisationId) || !dbTaskId) {
    throw new Error('Supabase and a persisted task id are required before deleting CRM tasks.')
  }

  try {
    const deleteResult = await supabase
      .from('tasks')
      .delete()
      .eq('organisation_id', normalizedOrganisationId)
      .eq('task_id', dbTaskId)
      .select('task_id')
    if (deleteResult.error) throw deleteResult.error
    return locallyDeleted || (Array.isArray(deleteResult.data) && deleteResult.data.length > 0)
  } catch (error) {
    console.error('[agencyCrmRepository] delete task failed without local fallback', error)
    throw error
  } finally {
    if (taskToDelete?.leadId) {
      try {
        await createAgencyCrmLeadActivity(normalizedOrganisationId, taskToDelete.leadId, {
          activityType: 'Follow-up',
          activityNote: `Task deleted: ${normalizeText(taskToDelete.title) || 'Follow-up'}`,
          outcome: 'Deleted',
          activityDate: new Date().toISOString(),
        }, { actor: actor || { id: taskToDelete.assignedAgentId || null } })
      } catch (activityError) {
        console.warn('[agencyCrmRepository] non-blocking task delete activity failed', activityError)
      }
    }
  }
}

export async function deleteAgencyCrmLeadRecord(organisationId, leadId) {
  const normalizedOrganisationId = requireAgencyWorkspaceId(organisationId, 'agencyCrmRepository.deleteAgencyCrmLeadRecord')
  const normalizedLeadId = normalizeText(leadId)
  const dbLeadId = normalizeLeadUuid(normalizedLeadId)

  if (isSupabaseConfigured && supabase && isUuidLike(normalizedOrganisationId) && dbLeadId) {
    let remoteDeleted = false
    let remoteDeleteError = null

    try {
      const rpcResult = await supabase.rpc('bridge_delete_agency_lead', {
        p_organisation_id: normalizedOrganisationId,
        p_lead_id: dbLeadId,
      })
      if (rpcResult.error) {
        remoteDeleteError = rpcResult.error
      } else {
        remoteDeleted = rpcResult.data === true
      }
    } catch (rpcError) {
      if (!isMissingRpcError(rpcError, 'bridge_delete_agency_lead')) {
        remoteDeleteError = rpcError
      }
    }

    try {
      const appointmentResult = await supabase
        .from('appointments')
        .update({ lead_id: null, updated_at: new Date().toISOString() })
        .eq('organisation_id', normalizedOrganisationId)
        .eq('lead_id', dbLeadId)
      if (appointmentResult.error) throw appointmentResult.error
    } catch (syncError) {
      console.warn('[agencyCrmRepository] non-blocking appointment unlink before lead delete failed', syncError)
    }
    try {
      const activityResult = await supabase
        .from('lead_activities')
        .delete()
        .eq('organisation_id', normalizedOrganisationId)
        .eq('lead_id', dbLeadId)
      if (activityResult.error) throw activityResult.error
    } catch (syncError) {
      console.warn('[agencyCrmRepository] non-blocking lead activity delete failed', syncError)
    }

    if (!remoteDeleted) {
      const deleteResult = await supabase
        .from('leads')
        .delete()
        .eq('organisation_id', normalizedOrganisationId)
        .eq('lead_id', dbLeadId)
        .select('lead_id')
      if (deleteResult.error) {
        remoteDeleteError = remoteDeleteError || deleteResult.error
      } else {
        remoteDeleted = Array.isArray(deleteResult.data) && deleteResult.data.length > 0
      }
    }

    if (!remoteDeleted) {
      const existingResult = await supabase
        .from('leads')
        .select('lead_id', { count: 'exact', head: true })
        .eq('organisation_id', normalizedOrganisationId)
        .eq('lead_id', dbLeadId)

      if (existingResult.error && !isPermissionDeniedError(existingResult.error)) {
        throw existingResult.error
      }
      if (existingResult.error && isPermissionDeniedError(existingResult.error) && isPermissionDeniedError(remoteDeleteError)) {
        throw new Error('The lead still exists in the database, and your account is not allowed to delete it there.')
      }

      const stillExists = Number(existingResult.count || 0) > 0
      if (stillExists) {
        if (isPermissionDeniedError(remoteDeleteError)) {
          throw new Error('The lead still exists in the database, and your account is not allowed to delete it there.')
        }
        throw remoteDeleteError || new Error('The lead could not be deleted from the database.')
      }
    }
  }

  if (isUnsafeFallbackAllowed()) {
    return deleteAgencyLead(normalizedOrganisationId, normalizedLeadId)
  }
  return true
}
