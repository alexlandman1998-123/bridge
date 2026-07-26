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

function isDemoCanvassingRow(row = {}) {
  const metadata = row?.demo_metadata && typeof row.demo_metadata === 'object' ? row.demo_metadata : {}
  return (
    row?.is_demo_data === true ||
    metadata?.isDemoData === true ||
    metadata?.is_demo_data === true ||
    metadata?.seedData === true ||
    metadata?.seed_data === true
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
      persistence: normalizeText(parsed?.persistence),
      pendingLocalChanges: parsed?.pendingLocalChanges === true,
      syncedAt: normalizeText(parsed?.syncedAt),
    }
  } catch {
    return { prospects: [], activities: [] }
  }
}

function writeCanvassingFallbackStore(organisationId, store) {
  if (typeof window === 'undefined') return
  if (!isUnsafeFallbackAllowed()) return
  const nextStore = {
    prospects: Array.isArray(store?.prospects) ? store.prospects : [],
    activities: Array.isArray(store?.activities) ? store.activities : [],
    pendingLocalChanges: store?.pendingLocalChanges === true,
  }
  const persistence = normalizeText(store?.persistence)
  const syncedAt = normalizeText(store?.syncedAt)
  if (persistence) nextStore.persistence = persistence
  if (syncedAt) nextStore.syncedAt = syncedAt
  window.localStorage.setItem(getStorageKey(organisationId), JSON.stringify(nextStore))
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

function normalizeComparable(value = '') {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ')
}

function getProspectIdentityKeys(prospect = {}) {
  const firstName = normalizeComparable(prospect?.firstName || prospect?.first_name)
  const lastName = normalizeComparable(prospect?.lastName || prospect?.last_name)
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const prospectType = normalizeComparable(prospect?.prospectType || prospect?.prospect_type)
  const email = normalizeEmail(prospect?.email)
  const phone = normalizeComparable(prospect?.phone).replace(/[^0-9+]/g, '')
  const address = normalizeComparable(
    prospect?.formattedAddress ||
      prospect?.formatted_address ||
      prospect?.streetAddress ||
      prospect?.street_address ||
      prospect?.sellerPropertyAddress ||
      prospect?.seller_property_address,
  )
  const area = normalizeComparable(
    prospect?.areaSuburb ||
      prospect?.area_suburb ||
      prospect?.areaOfInterest ||
      prospect?.area_of_interest ||
      prospect?.area,
  )
  return [
    email ? `email:${email}` : '',
    phone ? `phone:${phone}` : '',
    fullName && address ? `name-address:${fullName}:${address}` : '',
    fullName && area ? `name-area:${prospectType}:${fullName}:${area}` : '',
  ].filter(Boolean)
}

function getActivityIdentityKey(activity = {}, prospectId = '') {
  return [
    normalizeText(prospectId || activity?.prospectId || activity?.prospect_id),
    normalizeComparable(activity?.activityType || activity?.activity_type || 'Note'),
    normalizeComparable(activity?.activityNote || activity?.activity_note),
    normalizeComparable(activity?.outcome),
    normalizeText(activity?.activityDate || activity?.activity_date || '').slice(0, 19),
  ].join('|')
}

function buildExistingProspectMigrationIndex(existingProspectRows = []) {
  const byLocalId = new Map()
  const byIdentity = new Map()
  for (const row of Array.isArray(existingProspectRows) ? existingProspectRows : []) {
    const id = normalizeText(row?.id)
    if (!id) continue
    byLocalId.set(id, id)
    const metadata = row?.demo_metadata && typeof row.demo_metadata === 'object' ? row.demo_metadata : {}
    const localId = normalizeText(metadata?.localId || metadata?.local_id)
    if (localId) byLocalId.set(localId, id)
    const mapped = mapProspectRow(row)
    for (const key of getProspectIdentityKeys(mapped)) {
      if (!byIdentity.has(key)) byIdentity.set(key, id)
    }
  }
  return { byLocalId, byIdentity }
}

function buildExistingActivityMigrationIndex(existingActivityRows = []) {
  const byLocalId = new Set()
  const byIdentity = new Set()
  for (const row of Array.isArray(existingActivityRows) ? existingActivityRows : []) {
    const id = normalizeText(row?.id)
    if (id) byLocalId.add(id)
    const metadata = row?.demo_metadata && typeof row.demo_metadata === 'object' ? row.demo_metadata : {}
    const localId = normalizeText(metadata?.localId || metadata?.local_id)
    if (localId) byLocalId.add(localId)
    byIdentity.add(getActivityIdentityKey(mapActivityRow(row), row?.prospect_id))
  }
  return { byLocalId, byIdentity }
}

async function migrateFallbackStoreToSupabase(client, organisationId, fallbackStore = {}, existingProspectRows = [], existingActivityRows = []) {
  const localProspects = Array.isArray(fallbackStore?.prospects) ? fallbackStore.prospects : []
  const localActivities = Array.isArray(fallbackStore?.activities) ? fallbackStore.activities : []
  if (!localProspects.length && !localActivities.length) return null

  const existingProspectIndex = buildExistingProspectMigrationIndex(existingProspectRows)
  const idMap = new Map()
  const prospectRows = []
  for (const prospect of localProspects) {
    const localId = normalizeText(prospect?.id)
    const existingByLocalId = localId ? existingProspectIndex.byLocalId.get(localId) : ''
    const existingByIdentity = getProspectIdentityKeys(prospect)
      .map((key) => existingProspectIndex.byIdentity.get(key))
      .find(Boolean)
    const existingId = existingByLocalId || existingByIdentity
    if (existingId) {
      if (localId) idMap.set(localId, existingId)
      continue
    }
    prospectRows.push({
      ...prospectPayloadToRow(organisationId, prospect),
      demo_metadata: {
        migratedFromLocalStorage: true,
        localId,
      },
      created_at: normalizeText(prospect?.createdAt) || new Date().toISOString(),
      updated_at: normalizeText(prospect?.updatedAt) || new Date().toISOString(),
    })
  }

  let insertedProspects = []
  if (prospectRows.length) {
    const prospectInsert = await client
      .from('canvassing_prospects')
      .insert(prospectRows)
      .select('*')
    if (prospectInsert.error) throw prospectInsert.error
    insertedProspects = prospectInsert.data || []
  }

  prospectRows.forEach((prospect, index) => {
    const inserted = insertedProspects[index]
    const localId = normalizeText(prospect?.demo_metadata?.localId)
    if (localId && inserted?.id) idMap.set(localId, inserted.id)
  })

  const existingActivityIndex = buildExistingActivityMigrationIndex(existingActivityRows)
  const existingProspectIds = new Set((Array.isArray(existingProspectRows) ? existingProspectRows : [])
    .map((row) => normalizeText(row?.id))
    .filter(Boolean))
  const activityRows = localActivities
    .map((activity) => {
      const localProspectId = normalizeText(activity?.prospectId)
      const nextProspectId = idMap.get(localProspectId) || (existingProspectIds.has(localProspectId) ? localProspectId : '')
      if (!nextProspectId) return null
      const localId = normalizeText(activity?.id)
      if (localId && existingActivityIndex.byLocalId.has(localId)) return null
      const identityKey = getActivityIdentityKey(activity, nextProspectId)
      if (existingActivityIndex.byIdentity.has(identityKey)) return null
      return {
        ...activityPayloadToRow(organisationId, { ...activity, prospectId: nextProspectId }),
        demo_metadata: {
          migratedFromLocalStorage: true,
          localId,
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

  const prospectRowsForStore = [...insertedProspects, ...(Array.isArray(existingProspectRows) ? existingProspectRows : [])]
  const prospectIds = new Set(prospectRowsForStore.map((row) => normalizeText(row?.id)).filter(Boolean))
  const activityRowsForStore = [...insertedActivities, ...(Array.isArray(existingActivityRows) ? existingActivityRows : [])]
    .filter((row) => prospectIds.has(normalizeText(row?.prospect_id)))

  const migratedStore = {
    prospects: prospectRowsForStore
      .map(mapProspectRow)
      .sort((left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0)),
    activities: activityRowsForStore
      .map(mapActivityRow)
      .sort((left, right) => new Date(right?.activityDate || right?.createdAt || 0) - new Date(left?.activityDate || left?.createdAt || 0)),
    persistence: 'supabase',
    pendingLocalChanges: false,
    migratedFromLocalStorage: true,
    syncedAt: new Date().toISOString(),
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

export async function listCanvassingWorkspace(organisationId, options = {}) {
  const orgId = normalizeText(organisationId)
  if (!orgId) return { prospects: [], activities: [], persistence: 'none' }
  const includeLocalFallback = options?.includeLocalFallback !== false

  if (!includeLocalFallback) {
    if (!isSupabaseConfigured || !supabase) {
      return { prospects: [], activities: [], persistence: 'none' }
    }

    try {
      const [prospectsResult, activitiesResult] = await Promise.all([
        supabase
          .from('canvassing_prospects')
          .select('*')
          .eq('organisation_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('canvassing_activities')
          .select('*')
          .eq('organisation_id', orgId)
          .order('activity_date', { ascending: false }),
      ])
      if (prospectsResult.error) throw prospectsResult.error
      if (activitiesResult.error) throw activitiesResult.error

      const prospects = (prospectsResult.data || []).filter((row) => !isDemoCanvassingRow(row))
      const prospectIds = new Set(prospects.map((row) => normalizeText(row?.id)).filter(Boolean))
      const activities = (activitiesResult.data || []).filter((row) => {
        if (isDemoCanvassingRow(row)) return false
        const prospectId = normalizeText(row?.prospect_id)
        return prospectIds.has(prospectId)
      })

      return {
        prospects: prospects.map(mapProspectRow),
        activities: activities.map(mapActivityRow),
        persistence: 'supabase',
      }
    } catch (error) {
      if (isMissingCanvassingSchemaError(error)) {
        return { prospects: [], activities: [], persistence: 'none', schemaMissing: true }
      }
      throw error
    }
  }

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
    const hasFallbackRows = (
      (Array.isArray(fallbackStore.prospects) && fallbackStore.prospects.length) ||
      (Array.isArray(fallbackStore.activities) && fallbackStore.activities.length)
    )
    const fallbackIsSyncedSnapshot = fallbackStore.persistence === 'supabase' && fallbackStore.pendingLocalChanges !== true
    if (
      hasFallbackRows &&
      !fallbackIsSyncedSnapshot
    ) {
      const migrated = await migrateFallbackStoreToSupabase(client, orgId, fallbackStore, prospectsResult.data || [], activitiesResult.data || [])
      if (migrated) return migrated
    }
    const store = {
      prospects: (prospectsResult.data || []).map(mapProspectRow),
      activities: (activitiesResult.data || []).map(mapActivityRow),
      persistence: 'supabase',
      pendingLocalChanges: false,
      syncedAt: new Date().toISOString(),
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
    store.persistence = 'local'
    store.pendingLocalChanges = true
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
  store.persistence = 'local'
  store.pendingLocalChanges = true
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
  store.persistence = 'local'
  store.pendingLocalChanges = true
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
  store.persistence = 'local'
  store.pendingLocalChanges = true
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
  store.persistence = 'local'
  store.pendingLocalChanges = true
  writeCanvassingFallbackStore(orgId, store)
  emitCanvassingUpdated(orgId)
  return created
}
