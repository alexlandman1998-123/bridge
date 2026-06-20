import { isUnsafeFallbackAllowed } from './envValidation'
import { isSupabaseConfigured, supabase } from './supabaseClient'

const STORAGE_PREFIX = 'itg:agency-canvassing:v1'
export const CANVASSING_UPDATED_EVENT = 'itg:agency-canvassing-updated'

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

function isMissingCanvassingSchemaError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message || error?.details).toLowerCase()
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('canvassing_prospects') ||
    message.includes('canvassing_activities') ||
    message.includes('schema cache')
  )
}

function getStorageKey(organisationId) {
  const id = normalizeText(organisationId)
  if (!id) throw new Error('A resolved workspace is required before loading canvassing data.')
  return `${STORAGE_PREFIX}:${id}`
}

export function readCanvassingFallbackStore(organisationId) {
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

function writeCanvassingFallbackStore(organisationId, store) {
  if (typeof window === 'undefined') return
  if (!isUnsafeFallbackAllowed()) return
  window.localStorage.setItem(getStorageKey(organisationId), JSON.stringify({
    prospects: Array.isArray(store?.prospects) ? store.prospects : [],
    activities: Array.isArray(store?.activities) ? store.activities : [],
  }))
}

export function emitCanvassingUpdated(organisationId) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CANVASSING_UPDATED_EVENT, { detail: { organisationId } }))
}

function mapProspectRow(row = {}) {
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id),
    assignedAgentId: normalizeText(row.assigned_agent_id),
    assignedUserId: normalizeText(row.assigned_user_id || row.assigned_agent_id),
    assignedAgentName: normalizeText(row.assigned_agent_name),
    assignedAgentEmail: normalizeEmail(row.assigned_agent_email),
    branchId: normalizeText(row.branch_id),
    firstName: normalizeText(row.first_name),
    lastName: normalizeText(row.last_name),
    phone: normalizeText(row.phone),
    email: normalizeEmail(row.email),
    prospectType: normalizeText(row.prospect_type) || 'Seller Prospect',
    area: normalizeText(row.area),
    areaSuburb: normalizeText(row.area_suburb || row.area),
    areaSuburbPlaceId: normalizeText(row.area_suburb_place_id),
    streetAddress: normalizeText(row.street_address),
    formattedAddress: normalizeText(row.formatted_address),
    city: normalizeText(row.city),
    province: normalizeText(row.province),
    country: normalizeText(row.country),
    postalCode: normalizeText(row.postal_code),
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    googlePlaceId: normalizeText(row.google_place_id),
    propertyType: normalizeText(row.property_type),
    enquiryListingId: normalizeText(row.enquiry_listing_id),
    buyerStatus: normalizeText(row.buyer_status || row.status),
    areaOfInterest: normalizeText(row.area_of_interest || row.area),
    areaOfInterestPlaceId: normalizeText(row.area_of_interest_place_id),
    preferredPropertyType: normalizeText(row.preferred_property_type || row.property_type),
    budgetRange: normalizeText(row.budget_range || row.estimated_property_value),
    bedrooms: normalizeText(row.bedrooms),
    financeStatus: normalizeText(row.finance_status),
    timeframe: normalizeText(row.timeframe),
    subjectToSale: normalizeText(row.subject_to_sale),
    source: normalizeText(row.source || row.canvassing_method) || 'Cold Call',
    canvassingMethod: normalizeText(row.canvassing_method) || 'Cold Call',
    status: normalizeText(row.status) || 'New',
    nextFollowUpDate: normalizeText(row.next_follow_up_date),
    followUpPriority: normalizeText(row.follow_up_priority) || 'Medium',
    followUpNote: normalizeText(row.follow_up_note),
    estimatedValue: Number(row.estimated_value || 0) || 0,
    estimatedPropertyValue: normalizeText(row.estimated_property_value),
    sellingIntent: normalizeText(row.selling_intent),
    lastContactOutcome: normalizeText(row.last_contact_outcome),
    propertyOccupancy: normalizeText(row.property_occupancy),
    notes: normalizeText(row.notes),
    convertedLeadId: normalizeText(row.converted_lead_id),
    convertedAt: normalizeText(row.converted_at),
    lostReason: normalizeText(row.lost_reason),
    archivedAt: normalizeText(row.archived_at),
    createdBy: normalizeText(row.created_by),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  }
}

function mapActivityRow(row = {}) {
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id),
    prospectId: normalizeText(row.prospect_id),
    agentId: normalizeText(row.agent_id),
    agentName: normalizeText(row.agent_name),
    activityType: normalizeText(row.activity_type) || 'Note',
    activityNote: normalizeText(row.activity_note),
    outcome: normalizeText(row.outcome),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    activityDate: normalizeText(row.activity_date),
    createdAt: normalizeText(row.created_at),
    createdBy: normalizeText(row.created_by),
  }
}

function prospectPayloadToRow(organisationId, payload = {}) {
  return {
    organisation_id: normalizeText(organisationId),
    assigned_agent_id: toNullableUuid(payload.assignedAgentId),
    assigned_user_id: toNullableUuid(payload.assignedUserId || payload.assignedAgentId),
    branch_id: toNullableUuid(payload.branchId),
    assigned_agent_name: normalizeText(payload.assignedAgentName),
    assigned_agent_email: normalizeEmail(payload.assignedAgentEmail),
    first_name: normalizeText(payload.firstName) || 'Prospect',
    last_name: normalizeText(payload.lastName) || null,
    phone: normalizeText(payload.phone) || null,
    email: normalizeEmail(payload.email) || null,
    prospect_type: normalizeText(payload.prospectType) || 'Seller Prospect',
    area: normalizeText(payload.area || payload.areaSuburb) || null,
    area_suburb: normalizeText(payload.areaSuburb || payload.area) || null,
    area_suburb_place_id: normalizeText(payload.areaSuburbPlaceId) || null,
    street_address: normalizeText(payload.streetAddress) || null,
    formatted_address: normalizeText(payload.formattedAddress || payload.streetAddress) || null,
    city: normalizeText(payload.city) || null,
    province: normalizeText(payload.province) || null,
    country: normalizeText(payload.country) || null,
    postal_code: normalizeText(payload.postalCode) || null,
    latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
    longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
    google_place_id: normalizeText(payload.googlePlaceId) || null,
    property_type: normalizeText(payload.propertyType) || null,
    enquiry_listing_id: toNullableUuid(payload.enquiryListingId || payload.linkedListingId || payload.listingId),
    buyer_status: normalizeText(payload.buyerStatus) || null,
    area_of_interest: normalizeText(payload.areaOfInterest || payload.area) || null,
    area_of_interest_place_id: normalizeText(payload.areaOfInterestPlaceId || payload.areaSuburbPlaceId) || null,
    preferred_property_type: normalizeText(payload.preferredPropertyType || payload.propertyType) || null,
    budget_range: normalizeText(payload.budgetRange || payload.estimatedPropertyValue) || null,
    bedrooms: normalizeText(payload.bedrooms) || null,
    finance_status: normalizeText(payload.financeStatus) || null,
    timeframe: normalizeText(payload.timeframe) || null,
    subject_to_sale: normalizeText(payload.subjectToSale) || null,
    source: normalizeText(payload.source || payload.canvassingMethod) || 'Cold Call',
    canvassing_method: normalizeText(payload.canvassingMethod || payload.source) || 'Cold Call',
    status: normalizeText(payload.status) || 'New',
    next_follow_up_date: normalizeText(payload.nextFollowUpDate) || null,
    follow_up_priority: normalizeText(payload.followUpPriority) || 'Medium',
    follow_up_note: normalizeText(payload.followUpNote) || null,
    estimated_value: Number(payload.estimatedValue || 0) || null,
    estimated_property_value: normalizeText(payload.estimatedPropertyValue) || null,
    selling_intent: normalizeText(payload.sellingIntent) || null,
    last_contact_outcome: normalizeText(payload.lastContactOutcome) || null,
    property_occupancy: normalizeText(payload.propertyOccupancy) || null,
    notes: normalizeText(payload.notes) || null,
    converted_lead_id: toNullableUuid(payload.convertedLeadId),
    converted_at: normalizeText(payload.convertedAt) || null,
    lost_reason: normalizeText(payload.lostReason) || null,
    archived_at: normalizeText(payload.archivedAt) || null,
    created_by: toNullableUuid(payload.createdBy),
  }
}

function activityPayloadToRow(organisationId, payload = {}) {
  return {
    organisation_id: normalizeText(organisationId),
    prospect_id: toNullableUuid(payload.prospectId),
    agent_id: toNullableUuid(payload.agentId),
    agent_name: normalizeText(payload.agentName) || null,
    activity_type: normalizeText(payload.activityType) || 'Note',
    activity_note: normalizeText(payload.activityNote) || null,
    outcome: normalizeText(payload.outcome) || null,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    activity_date: normalizeText(payload.activityDate) || new Date().toISOString(),
    created_by: toNullableUuid(payload.createdBy),
  }
}

async function migrateFallbackStoreToSupabase(client, organisationId, fallbackStore = {}) {
  const localProspects = Array.isArray(fallbackStore?.prospects) ? fallbackStore.prospects : []
  if (!localProspects.length) return null

  const prospectRows = localProspects.map((prospect) => ({
    ...prospectPayloadToRow(organisationId, prospect),
    demo_metadata: {
      migratedFromLocalStorage: true,
      localId: normalizeText(prospect?.id),
    },
    created_at: normalizeText(prospect?.createdAt) || new Date().toISOString(),
    updated_at: normalizeText(prospect?.updatedAt) || new Date().toISOString(),
  }))

  const prospectInsert = await client
    .from('canvassing_prospects')
    .insert(prospectRows)
    .select('*')
  if (prospectInsert.error) throw prospectInsert.error

  const insertedProspects = prospectInsert.data || []
  const idMap = new Map()
  localProspects.forEach((prospect, index) => {
    const inserted = insertedProspects[index]
    if (prospect?.id && inserted?.id) idMap.set(normalizeText(prospect.id), inserted.id)
  })

  const localActivities = Array.isArray(fallbackStore?.activities) ? fallbackStore.activities : []
  const activityRows = localActivities
    .map((activity) => {
      const nextProspectId = idMap.get(normalizeText(activity?.prospectId))
      if (!nextProspectId) return null
      return {
        ...activityPayloadToRow(organisationId, { ...activity, prospectId: nextProspectId }),
        demo_metadata: {
          migratedFromLocalStorage: true,
          localId: normalizeText(activity?.id),
          localProspectId: normalizeText(activity?.prospectId),
        },
        created_at: normalizeText(activity?.createdAt) || new Date().toISOString(),
      }
    })
    .filter(Boolean)

  let insertedActivities = []
  if (activityRows.length) {
    const activityInsert = await client
      .from('canvassing_activities')
      .insert(activityRows)
      .select('*')
    if (activityInsert.error) throw activityInsert.error
    insertedActivities = activityInsert.data || []
  }

  const migratedStore = {
    prospects: insertedProspects.map(mapProspectRow),
    activities: insertedActivities.map(mapActivityRow),
    persistence: 'supabase',
    migratedFromLocalStorage: true,
  }
  writeCanvassingFallbackStore(organisationId, migratedStore)
  return migratedStore
}

async function withFallback(organisationId, task) {
  if (!isSupabaseConfigured || !supabase) {
    return { ...readCanvassingFallbackStore(organisationId), persistence: 'local' }
  }
  try {
    return await task(supabase)
  } catch (error) {
    if (isMissingCanvassingSchemaError(error)) {
      return { ...readCanvassingFallbackStore(organisationId), persistence: 'local', schemaMissing: true }
    }
    throw error
  }
}

export async function listCanvassingWorkspace(organisationId) {
  const orgId = normalizeText(organisationId)
  if (!orgId) return { prospects: [], activities: [], persistence: 'none' }
  return withFallback(orgId, async (client) => {
    const fallbackStore = readCanvassingFallbackStore(orgId)
    const [prospectsResult, activitiesResult] = await Promise.all([
      client
        .from('canvassing_prospects')
        .select('*')
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: false }),
      client
        .from('canvassing_activities')
        .select('*')
        .eq('organisation_id', orgId)
        .order('activity_date', { ascending: false }),
    ])
    if (prospectsResult.error) throw prospectsResult.error
    if (activitiesResult.error) throw activitiesResult.error
    if (!(prospectsResult.data || []).length && Array.isArray(fallbackStore.prospects) && fallbackStore.prospects.length) {
      const migrated = await migrateFallbackStoreToSupabase(client, orgId, fallbackStore)
      if (migrated) return migrated
    }
    const store = {
      prospects: (prospectsResult.data || []).map(mapProspectRow),
      activities: (activitiesResult.data || []).map(mapActivityRow),
      persistence: 'supabase',
    }
    writeCanvassingFallbackStore(orgId, store)
    return store
  })
}

export async function createCanvassingProspect(organisationId, payload = {}) {
  const orgId = normalizeText(organisationId)
  if (!orgId) throw new Error('A resolved workspace is required before creating a prospect.')
  if (!isSupabaseConfigured || !supabase) {
    const created = { ...payload, id: payload.id || `prospect_${Date.now().toString(36)}`, organisationId: orgId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const store = readCanvassingFallbackStore(orgId)
    store.prospects = [created, ...(store.prospects || [])]
    writeCanvassingFallbackStore(orgId, store)
    emitCanvassingUpdated(orgId)
    return created
  }
  const insert = await supabase
    .from('canvassing_prospects')
    .insert(prospectPayloadToRow(orgId, payload))
    .select('*')
    .single()
  if (insert.error) {
    if (isMissingCanvassingSchemaError(insert.error)) return createCanvassingProspectLocal(orgId, payload)
    throw insert.error
  }
  const created = mapProspectRow(insert.data)
  emitCanvassingUpdated(orgId)
  return created
}

function createCanvassingProspectLocal(orgId, payload = {}) {
  const created = { ...payload, id: payload.id || `prospect_${Date.now().toString(36)}`, organisationId: orgId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  const store = readCanvassingFallbackStore(orgId)
  store.prospects = [created, ...(store.prospects || [])]
  writeCanvassingFallbackStore(orgId, store)
  emitCanvassingUpdated(orgId)
  return created
}

export async function updateCanvassingProspect(organisationId, prospectId, payload = {}) {
  const orgId = normalizeText(organisationId)
  const id = toNullableUuid(prospectId)
  if (!orgId || !prospectId) throw new Error('A prospect and workspace are required before saving.')
  if (!isSupabaseConfigured || !supabase || !id) return updateCanvassingProspectLocal(orgId, prospectId, payload)
  const update = await supabase
    .from('canvassing_prospects')
    .update(prospectPayloadToRow(orgId, payload))
    .eq('id', id)
    .eq('organisation_id', orgId)
    .select('*')
    .single()
  if (update.error) {
    if (isMissingCanvassingSchemaError(update.error)) return updateCanvassingProspectLocal(orgId, prospectId, payload)
    throw update.error
  }
  const updated = mapProspectRow(update.data)
  emitCanvassingUpdated(orgId)
  return updated
}

function updateCanvassingProspectLocal(orgId, prospectId, payload = {}) {
  const store = readCanvassingFallbackStore(orgId)
  const updatedAt = new Date().toISOString()
  let updated = null
  store.prospects = (store.prospects || []).map((row) => {
    if (normalizeText(row?.id) !== normalizeText(prospectId)) return row
    updated = { ...row, ...payload, id: row.id, updatedAt }
    return updated
  })
  writeCanvassingFallbackStore(orgId, store)
  emitCanvassingUpdated(orgId)
  return updated
}

export async function deleteCanvassingProspect(organisationId, prospectId) {
  const orgId = normalizeText(organisationId)
  const id = toNullableUuid(prospectId)
  if (!orgId || !prospectId) return
  if (!isSupabaseConfigured || !supabase || !id) return deleteCanvassingProspectLocal(orgId, prospectId)
  const result = await supabase
    .from('canvassing_prospects')
    .delete()
    .eq('id', id)
    .eq('organisation_id', orgId)
  if (result.error) {
    if (isMissingCanvassingSchemaError(result.error)) return deleteCanvassingProspectLocal(orgId, prospectId)
    throw result.error
  }
  emitCanvassingUpdated(orgId)
}

function deleteCanvassingProspectLocal(orgId, prospectId) {
  const store = readCanvassingFallbackStore(orgId)
  store.prospects = (store.prospects || []).filter((row) => normalizeText(row?.id) !== normalizeText(prospectId))
  store.activities = (store.activities || []).filter((row) => normalizeText(row?.prospectId) !== normalizeText(prospectId))
  writeCanvassingFallbackStore(orgId, store)
  emitCanvassingUpdated(orgId)
}

export async function createCanvassingActivity(organisationId, payload = {}) {
  const orgId = normalizeText(organisationId)
  if (!orgId) throw new Error('A resolved workspace is required before logging activity.')
  if (!isSupabaseConfigured || !supabase || !toNullableUuid(payload.prospectId)) return createCanvassingActivityLocal(orgId, payload)
  const insert = await supabase
    .from('canvassing_activities')
    .insert(activityPayloadToRow(orgId, payload))
    .select('*')
    .single()
  if (insert.error) {
    if (isMissingCanvassingSchemaError(insert.error)) return createCanvassingActivityLocal(orgId, payload)
    throw insert.error
  }
  const created = mapActivityRow(insert.data)
  emitCanvassingUpdated(orgId)
  return created
}

function createCanvassingActivityLocal(orgId, payload = {}) {
  const created = { ...payload, id: payload.id || `canvassing_activity_${Date.now().toString(36)}`, organisationId: orgId, createdAt: new Date().toISOString() }
  const store = readCanvassingFallbackStore(orgId)
  store.activities = [created, ...(store.activities || [])]
  writeCanvassingFallbackStore(orgId, store)
  emitCanvassingUpdated(orgId)
  return created
}
