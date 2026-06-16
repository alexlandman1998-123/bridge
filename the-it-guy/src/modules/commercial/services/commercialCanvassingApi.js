import { isUnsafeFallbackAllowed } from '../../../lib/envValidation'
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'
import { resolveCommercialAccessContext } from './commercialApi'

const STORAGE_PREFIX = 'itg:commercial-canvassing:v1'
export const COMMERCIAL_CANVASSING_UPDATED_EVENT = 'itg:commercial-canvassing-updated'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function toNullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function isMissingCommercialCanvassingSchemaError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message || error?.details).toLowerCase()
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('commercial_canvassing_prospects') ||
    message.includes('commercial_canvassing_activities') ||
    message.includes('schema cache') ||
    message.includes('commercial canvassing')
  )
}

function getStorageKey(organisationId) {
  const id = normalizeText(organisationId)
  if (!id) throw new Error('A resolved workspace is required before loading commercial canvassing data.')
  return `${STORAGE_PREFIX}:${id}`
}

function readFallbackStore(organisationId) {
  if (typeof window === 'undefined') return { prospects: [], activities: [] }
  if (!isUnsafeFallbackAllowed()) return { prospects: [], activities: [] }
  try {
    const raw = window.localStorage.getItem(getStorageKey(organisationId))
    if (!raw) return { prospects: [], activities: [] }
    const parsed = JSON.parse(raw)
    return {
      prospects: Array.isArray(parsed?.prospects) ? parsed.prospects : [],
      activities: Array.isArray(parsed?.activities) ? parsed.activities : [],
    }
  } catch {
    return { prospects: [], activities: [] }
  }
}

function writeFallbackStore(organisationId, store) {
  if (typeof window === 'undefined') return
  if (!isUnsafeFallbackAllowed()) return
  window.localStorage.setItem(getStorageKey(organisationId), JSON.stringify({
    prospects: Array.isArray(store?.prospects) ? store.prospects : [],
    activities: Array.isArray(store?.activities) ? store.activities : [],
  }))
}

function emitUpdated(organisationId) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COMMERCIAL_CANVASSING_UPDATED_EVENT, { detail: { organisationId } }))
}

function mapProspectRow(row = {}) {
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    branchId: normalizeText(row.branch_id || row.branchId),
    assignedBrokerId: normalizeText(row.assigned_broker_id || row.assignedBrokerId || row.broker_id || row.brokerId),
    assignedBrokerName: normalizeText(row.assigned_broker_name || row.assignedBrokerName),
    assignedBrokerEmail: normalizeEmail(row.assigned_broker_email || row.assignedBrokerEmail),
    companyName: normalizeText(row.company_name || row.companyName),
    contactName: normalizeText(row.contact_name || row.contactName),
    firstName: normalizeText(row.first_name || row.firstName),
    lastName: normalizeText(row.last_name || row.lastName),
    phone: normalizeText(row.phone),
    email: normalizeEmail(row.email),
    prospectType: normalizeText(row.prospect_type || row.prospectType) || 'Landlord Prospect',
    canvassingMethod: normalizeText(row.canvassing_method || row.canvassingMethod) || 'Cold Call',
    propertyType: normalizeText(row.property_type || row.propertyType),
    area: normalizeText(row.area),
    status: normalizeText(row.status) || 'New',
    nextFollowUpDate: normalizeText(row.next_follow_up_date || row.nextFollowUpDate),
    followUpPriority: normalizeText(row.follow_up_priority || row.followUpPriority) || 'Medium',
    followUpNote: normalizeText(row.follow_up_note || row.followUpNote),
    estimatedValue: Number(row.estimated_value || row.estimatedValue || 0) || 0,
    notes: normalizeText(row.notes),
    linkedEntityType: normalizeText(row.linked_entity_type || row.linkedEntityType),
    linkedEntityId: normalizeText(row.linked_entity_id || row.linkedEntityId),
    companyId: normalizeText(row.company_id || row.companyId),
    contactId: normalizeText(row.contact_id || row.contactId),
    propertyId: normalizeText(row.property_id || row.propertyId),
    vacancyId: normalizeText(row.vacancy_id || row.vacancyId),
    listingId: normalizeText(row.listing_id || row.listingId),
    requirementId: normalizeText(row.requirement_id || row.requirementId),
    dealId: normalizeText(row.deal_id || row.dealId),
    convertedRequirementId: normalizeText(row.converted_requirement_id || row.convertedRequirementId),
    convertedDealId: normalizeText(row.converted_deal_id || row.convertedDealId),
    convertedContactId: normalizeText(row.converted_contact_id || row.convertedContactId),
    convertedCompanyId: normalizeText(row.converted_company_id || row.convertedCompanyId),
    lostReason: normalizeText(row.lost_reason || row.lostReason),
    archivedAt: normalizeText(row.archived_at || row.archivedAt),
    createdBy: normalizeText(row.created_by || row.createdBy),
    createdAt: normalizeText(row.created_at || row.createdAt),
    updatedAt: normalizeText(row.updated_at || row.updatedAt),
  }
}

function mapActivityRow(row = {}) {
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    prospectId: normalizeText(row.prospect_id || row.prospectId),
    brokerId: normalizeText(row.broker_id || row.brokerId),
    brokerName: normalizeText(row.broker_name || row.brokerName),
    activityType: normalizeText(row.activity_type || row.activityType) || 'Note',
    activityNote: normalizeText(row.activity_note || row.activityNote),
    outcome: normalizeText(row.outcome),
    activityDate: normalizeText(row.activity_date || row.activityDate),
    createdAt: normalizeText(row.created_at || row.createdAt),
    createdBy: normalizeText(row.created_by || row.createdBy),
  }
}

function prospectPayloadToRow(organisationId, payload = {}) {
  return {
    organisation_id: normalizeText(organisationId),
    branch_id: toNullableUuid(payload.branchId || payload.branch_id),
    assigned_broker_id: toNullableUuid(payload.assignedBrokerId || payload.assigned_broker_id || payload.brokerId || payload.broker_id),
    assigned_broker_name: normalizeText(payload.assignedBrokerName || payload.assigned_broker_name),
    assigned_broker_email: normalizeEmail(payload.assignedBrokerEmail || payload.assigned_broker_email),
    company_name: normalizeText(payload.companyName || payload.company_name) || null,
    contact_name: normalizeText(payload.contactName || payload.contact_name) || null,
    first_name: normalizeText(payload.firstName || payload.first_name) || null,
    last_name: normalizeText(payload.lastName || payload.last_name) || null,
    phone: normalizeText(payload.phone) || null,
    email: normalizeEmail(payload.email) || null,
    prospect_type: normalizeText(payload.prospectType || payload.prospect_type) || 'Landlord Prospect',
    canvassing_method: normalizeText(payload.canvassingMethod || payload.canvassing_method) || 'Cold Call',
    property_type: normalizeText(payload.propertyType || payload.property_type) || null,
    area: normalizeText(payload.area) || null,
    status: normalizeText(payload.status) || 'New',
    next_follow_up_date: normalizeText(payload.nextFollowUpDate || payload.next_follow_up_date) || null,
    follow_up_priority: normalizeText(payload.followUpPriority || payload.follow_up_priority) || 'Medium',
    follow_up_note: normalizeText(payload.followUpNote || payload.follow_up_note) || null,
    estimated_value: Number(payload.estimatedValue || payload.estimated_value || 0) || null,
    notes: normalizeText(payload.notes) || null,
    linked_entity_type: normalizeText(payload.linkedEntityType || payload.linked_entity_type) || null,
    linked_entity_id: normalizeText(payload.linkedEntityId || payload.linked_entity_id) || null,
    company_id: toNullableUuid(payload.companyId || payload.company_id),
    contact_id: toNullableUuid(payload.contactId || payload.contact_id),
    property_id: toNullableUuid(payload.propertyId || payload.property_id),
    vacancy_id: toNullableUuid(payload.vacancyId || payload.vacancy_id),
    listing_id: toNullableUuid(payload.listingId || payload.listing_id),
    requirement_id: toNullableUuid(payload.requirementId || payload.requirement_id),
    deal_id: toNullableUuid(payload.dealId || payload.deal_id),
    converted_requirement_id: toNullableUuid(payload.convertedRequirementId || payload.converted_requirement_id),
    converted_deal_id: toNullableUuid(payload.convertedDealId || payload.converted_deal_id),
    converted_contact_id: toNullableUuid(payload.convertedContactId || payload.converted_contact_id),
    converted_company_id: toNullableUuid(payload.convertedCompanyId || payload.converted_company_id),
    lost_reason: normalizeText(payload.lostReason || payload.lost_reason) || null,
    archived_at: normalizeText(payload.archivedAt || payload.archived_at) || null,
    created_by: toNullableUuid(payload.createdBy || payload.created_by),
  }
}

function activityPayloadToRow(organisationId, payload = {}) {
  return {
    organisation_id: normalizeText(organisationId),
    prospect_id: toNullableUuid(payload.prospectId || payload.prospect_id),
    broker_id: toNullableUuid(payload.brokerId || payload.broker_id),
    broker_name: normalizeText(payload.brokerName || payload.broker_name) || null,
    activity_type: normalizeText(payload.activityType || payload.activity_type) || 'Note',
    activity_note: normalizeText(payload.activityNote || payload.activity_note) || null,
    outcome: normalizeText(payload.outcome) || null,
    activity_date: normalizeText(payload.activityDate || payload.activity_date) || new Date().toISOString(),
    created_by: toNullableUuid(payload.createdBy || payload.created_by),
  }
}

async function withFallback(organisationId, task) {
  if (!isSupabaseConfigured || !supabase) {
    return { ...readFallbackStore(organisationId), persistence: 'local' }
  }

  try {
    return await task(supabase)
  } catch (error) {
    if (isMissingCommercialCanvassingSchemaError(error)) {
      return { ...readFallbackStore(organisationId), persistence: 'local', schemaMissing: true }
    }
    throw error
  }
}

export async function listCommercialCanvassingWorkspace(organisationId) {
  const orgId = normalizeText(organisationId)
  if (!orgId) return { prospects: [], activities: [], persistence: 'none' }

  return withFallback(orgId, async (client) => {
    const fallbackStore = readFallbackStore(orgId)
    const [prospectsResult, activitiesResult] = await Promise.all([
      client
        .from('commercial_canvassing_prospects')
        .select('*')
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: false }),
      client
        .from('commercial_canvassing_activities')
        .select('*')
        .eq('organisation_id', orgId)
        .order('activity_date', { ascending: false }),
    ])

    if (prospectsResult.error) throw prospectsResult.error
    if (activitiesResult.error) throw activitiesResult.error

    if (!(prospectsResult.data || []).length && Array.isArray(fallbackStore.prospects) && fallbackStore.prospects.length) {
      return { ...fallbackStore, persistence: 'local', schemaMissing: true }
    }

    const store = {
      prospects: (prospectsResult.data || []).map(mapProspectRow),
      activities: (activitiesResult.data || []).map(mapActivityRow),
      persistence: 'supabase',
    }
    writeFallbackStore(orgId, store)
    return store
  })
}

export async function createCommercialCanvassingProspect(organisationId, payload = {}) {
  const orgId = normalizeText(organisationId)
  if (!orgId) throw new Error('A resolved workspace is required before creating a commercial canvassing prospect.')

  if (!isSupabaseConfigured || !supabase) {
    const created = {
      ...payload,
      id: payload.id || `commercial_prospect_${Date.now().toString(36)}`,
      organisationId: orgId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const store = readFallbackStore(orgId)
    store.prospects = [created, ...(store.prospects || [])]
    writeFallbackStore(orgId, store)
    emitUpdated(orgId)
    return created
  }

  const insert = await supabase
    .from('commercial_canvassing_prospects')
    .insert(prospectPayloadToRow(orgId, payload))
    .select('*')
    .single()

  if (insert.error) {
    if (isMissingCommercialCanvassingSchemaError(insert.error)) {
      return createCommercialCanvassingProspect(orgId, payload)
    }
    throw insert.error
  }

  const created = mapProspectRow(insert.data)
  emitUpdated(orgId)
  return created
}

export async function updateCommercialCanvassingProspect(organisationId, prospectId, payload = {}) {
  const orgId = normalizeText(organisationId)
  const id = toNullableUuid(prospectId)
  if (!orgId || !prospectId) throw new Error('A prospect and workspace are required before saving.')

  if (!isSupabaseConfigured || !supabase || !id) {
    const store = readFallbackStore(orgId)
    const updatedAt = new Date().toISOString()
    let updated = null
    store.prospects = (store.prospects || []).map((row) => {
      if (normalizeText(row?.id) !== normalizeText(prospectId)) return row
      updated = { ...row, ...payload, id: row.id, updatedAt }
      return updated
    })
    writeFallbackStore(orgId, store)
    emitUpdated(orgId)
    return updated
  }

  const update = await supabase
    .from('commercial_canvassing_prospects')
    .update(prospectPayloadToRow(orgId, payload))
    .eq('id', id)
    .eq('organisation_id', orgId)
    .select('*')
    .single()

  if (update.error) {
    if (isMissingCommercialCanvassingSchemaError(update.error)) {
      return updateCommercialCanvassingProspect(orgId, prospectId, payload)
    }
    throw update.error
  }

  const updated = mapProspectRow(update.data)
  emitUpdated(orgId)
  return updated
}

export async function deleteCommercialCanvassingProspect(organisationId, prospectId) {
  const orgId = normalizeText(organisationId)
  const id = toNullableUuid(prospectId)
  if (!orgId || !prospectId) return

  if (!isSupabaseConfigured || !supabase || !id) {
    const store = readFallbackStore(orgId)
    store.prospects = (store.prospects || []).filter((row) => normalizeText(row?.id) !== normalizeText(prospectId))
    store.activities = (store.activities || []).filter((row) => normalizeText(row?.prospectId) !== normalizeText(prospectId))
    writeFallbackStore(orgId, store)
    emitUpdated(orgId)
    return
  }

  const result = await supabase
    .from('commercial_canvassing_prospects')
    .delete()
    .eq('id', id)
    .eq('organisation_id', orgId)

  if (result.error) {
    if (isMissingCommercialCanvassingSchemaError(result.error)) {
      const store = readFallbackStore(orgId)
      store.prospects = (store.prospects || []).filter((row) => normalizeText(row?.id) !== normalizeText(prospectId))
      store.activities = (store.activities || []).filter((row) => normalizeText(row?.prospectId) !== normalizeText(prospectId))
      writeFallbackStore(orgId, store)
      emitUpdated(orgId)
      return
    }
    throw result.error
  }

  emitUpdated(orgId)
}

export async function createCommercialCanvassingActivity(organisationId, payload = {}) {
  const orgId = normalizeText(organisationId)
  if (!orgId) throw new Error('A resolved workspace is required before logging canvassing activity.')

  if (!isSupabaseConfigured || !supabase || !toNullableUuid(payload.prospectId)) {
    const created = {
      ...payload,
      id: payload.id || `commercial_canvassing_activity_${Date.now().toString(36)}`,
      organisationId: orgId,
      createdAt: new Date().toISOString(),
    }
    const store = readFallbackStore(orgId)
    store.activities = [created, ...(store.activities || [])]
    writeFallbackStore(orgId, store)
    emitUpdated(orgId)
    return created
  }

  const insert = await supabase
    .from('commercial_canvassing_activities')
    .insert(activityPayloadToRow(orgId, payload))
    .select('*')
    .single()

  if (insert.error) {
    if (isMissingCommercialCanvassingSchemaError(insert.error)) {
      return createCommercialCanvassingActivity(orgId, payload)
    }
    throw insert.error
  }

  const created = mapActivityRow(insert.data)
  emitUpdated(orgId)
  return created
}

export async function listCommercialCanvassingActivity(organisationId, prospectId) {
  const workspace = await listCommercialCanvassingWorkspace(organisationId)
  if (!prospectId) return workspace.activities || []
  return (workspace.activities || []).filter((row) => normalizeText(row?.prospectId) === normalizeText(prospectId))
}

export async function getCommercialCanvassingContext() {
  return resolveCommercialAccessContext()
}
