import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LEAD_REQUIREMENT_INTENT_TYPES = ['buy', 'rent', 'sell', 'lease', 'invest', 'other']
export const LEAD_REQUIREMENT_STATUSES = ['active', 'paused', 'fulfilled', 'archived']
export const LEAD_REQUIREMENT_FINANCE_STATUSES = ['unknown', 'cash', 'bond_needed', 'pre_approved', 'bond_in_progress', 'not_ready']
export const LEAD_REQUIREMENT_TIMELINES = ['immediately', '0_3_months', '3_6_months', '6_12_months', 'not_sure']
export const LEAD_REQUIREMENT_URGENCIES = ['low', 'medium', 'high']

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

function normalizeNumber(value) {
  if (normalizeText(value) === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeBoolean(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value
  return ['true', 'yes', '1', 'on'].includes(normalizeLower(value))
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  if (!text) return []
  return text.split(/[,;\n]/).map(normalizeText).filter(Boolean)
}

function normalizeEnum(value, allowed = [], fallback = '') {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  return allowed.includes(normalized) ? normalized : fallback
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
    throw new Error('Supabase is required before managing lead requirements.')
  }
  return supabase
}

function sortRequirements(left = {}, right = {}) {
  if (Boolean(left.isPrimary) !== Boolean(right.isPrimary)) return left.isPrimary ? -1 : 1
  const statusOrder = { active: 0, paused: 1, fulfilled: 2, archived: 3 }
  const leftStatus = statusOrder[left.status] ?? 9
  const rightStatus = statusOrder[right.status] ?? 9
  if (leftStatus !== rightStatus) return leftStatus - rightStatus
  return new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime()
}

export function mapLeadRequirement(row = {}) {
  return {
    id: readId(row, ['requirementId', 'requirement_id', 'id']),
    requirementId: readId(row, ['requirementId', 'requirement_id', 'id']),
    organisationId: readId(row, ['organisationId', 'organisation_id']),
    leadId: readId(row, ['leadId', 'lead_id']),
    contactId: readId(row, ['contactId', 'contact_id']),
    title: normalizeText(row?.title),
    intentType: normalizeEnum(row?.intentType ?? row?.intent_type, LEAD_REQUIREMENT_INTENT_TYPES, 'buy'),
    propertyCategory: normalizeText(row?.propertyCategory ?? row?.property_category),
    propertyTypes: normalizeArray(row?.propertyTypes ?? row?.property_types),
    areas: normalizeArray(row?.areas),
    suburbs: normalizeArray(row?.suburbs),
    city: normalizeText(row?.city),
    province: normalizeText(row?.province),
    budgetMin: normalizeNumber(row?.budgetMin ?? row?.budget_min),
    budgetMax: normalizeNumber(row?.budgetMax ?? row?.budget_max),
    bedroomsMin: normalizeNumber(row?.bedroomsMin ?? row?.bedrooms_min),
    bathroomsMin: normalizeNumber(row?.bathroomsMin ?? row?.bathrooms_min),
    garagesMin: normalizeNumber(row?.garagesMin ?? row?.garages_min),
    parkingMin: normalizeNumber(row?.parkingMin ?? row?.parking_min),
    erfSizeMin: normalizeNumber(row?.erfSizeMin ?? row?.erf_size_min),
    floorSizeMin: normalizeNumber(row?.floorSizeMin ?? row?.floor_size_min),
    mustHaves: normalizeArray(row?.mustHaves ?? row?.must_haves),
    niceToHaves: normalizeArray(row?.niceToHaves ?? row?.nice_to_haves),
    dealBreakers: normalizeArray(row?.dealBreakers ?? row?.deal_breakers),
    financeStatus: normalizeEnum(row?.financeStatus ?? row?.finance_status, LEAD_REQUIREMENT_FINANCE_STATUSES, 'unknown'),
    financeType: normalizeText(row?.financeType ?? row?.finance_type),
    preApproved: normalizeBoolean(row?.preApproved ?? row?.pre_approved),
    depositAvailable: normalizeBoolean(row?.depositAvailable ?? row?.deposit_available),
    timeline: normalizeEnum(row?.timeline, LEAD_REQUIREMENT_TIMELINES, ''),
    urgency: normalizeEnum(row?.urgency, LEAD_REQUIREMENT_URGENCIES, ''),
    communicationPreference: normalizeText(row?.communicationPreference ?? row?.communication_preference),
    consentToReceiveMatches: Boolean(row?.consentToReceiveMatches ?? row?.consent_to_receive_matches),
    notes: normalizeText(row?.notes),
    status: normalizeEnum(row?.status, LEAD_REQUIREMENT_STATUSES, 'active'),
    isPrimary: Boolean(row?.isPrimary ?? row?.is_primary),
    createdBy: readId(row, ['createdBy', 'created_by']),
    createdAt: row?.createdAt || row?.created_at || null,
    updatedAt: row?.updatedAt || row?.updated_at || null,
    raw: row,
  }
}

export function buildLeadRequirementPayload(payload = {}) {
  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : {}
  const contact = payload.contact && typeof payload.contact === 'object' ? payload.contact : {}
  const organisationId = nullableUuid(payload.organisationId || payload.organisation_id || lead.organisationId || lead.organisation_id)
  const leadId = nullableUuid(payload.leadId || payload.lead_id || lead.leadId || lead.lead_id || lead.id)
  const contactId = nullableUuid(payload.contactId || payload.contact_id || contact.contactId || contact.contact_id || contact.id || lead.contactId || lead.contact_id)
  if (!organisationId || !leadId) {
    throw new Error('A valid organisation id and lead id are required for lead requirements.')
  }
  const budgetMin = normalizeNumber(payload.budgetMin ?? payload.budget_min)
  const budgetMax = normalizeNumber(payload.budgetMax ?? payload.budget_max)
  if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    throw new Error('Budget minimum cannot be greater than budget maximum.')
  }

  return {
    organisation_id: organisationId,
    lead_id: leadId,
    contact_id: contactId,
    title: normalizeText(payload.title) || null,
    intent_type: normalizeEnum(payload.intentType ?? payload.intent_type, LEAD_REQUIREMENT_INTENT_TYPES, 'buy'),
    property_category: normalizeText(payload.propertyCategory ?? payload.property_category) || null,
    property_types: normalizeArray(payload.propertyTypes ?? payload.property_types),
    areas: normalizeArray(payload.areas),
    suburbs: normalizeArray(payload.suburbs),
    city: normalizeText(payload.city) || null,
    province: normalizeText(payload.province) || null,
    budget_min: budgetMin,
    budget_max: budgetMax,
    bedrooms_min: normalizeNumber(payload.bedroomsMin ?? payload.bedrooms_min),
    bathrooms_min: normalizeNumber(payload.bathroomsMin ?? payload.bathrooms_min),
    garages_min: normalizeNumber(payload.garagesMin ?? payload.garages_min),
    parking_min: normalizeNumber(payload.parkingMin ?? payload.parking_min),
    erf_size_min: normalizeNumber(payload.erfSizeMin ?? payload.erf_size_min),
    floor_size_min: normalizeNumber(payload.floorSizeMin ?? payload.floor_size_min),
    must_haves: normalizeArray(payload.mustHaves ?? payload.must_haves),
    nice_to_haves: normalizeArray(payload.niceToHaves ?? payload.nice_to_haves),
    deal_breakers: normalizeArray(payload.dealBreakers ?? payload.deal_breakers),
    finance_status: normalizeEnum(payload.financeStatus ?? payload.finance_status, LEAD_REQUIREMENT_FINANCE_STATUSES, 'unknown'),
    finance_type: normalizeText(payload.financeType ?? payload.finance_type) || null,
    pre_approved: normalizeBoolean(payload.preApproved ?? payload.pre_approved),
    deposit_available: normalizeBoolean(payload.depositAvailable ?? payload.deposit_available),
    timeline: normalizeEnum(payload.timeline, LEAD_REQUIREMENT_TIMELINES, '') || null,
    urgency: normalizeEnum(payload.urgency, LEAD_REQUIREMENT_URGENCIES, '') || null,
    communication_preference: normalizeText(payload.communicationPreference ?? payload.communication_preference) || null,
    consent_to_receive_matches: Boolean(payload.consentToReceiveMatches ?? payload.consent_to_receive_matches),
    notes: normalizeText(payload.notes) || null,
    status: normalizeEnum(payload.status, LEAD_REQUIREMENT_STATUSES, 'active'),
    is_primary: Boolean(payload.isPrimary ?? payload.is_primary),
    created_by: nullableUuid(payload.createdBy || payload.created_by),
  }
}

function buildLeadRequirementPatch(updates = {}) {
  const payload = buildLeadRequirementPayload({
    organisationId: updates.organisationId || updates.organisation_id || '11111111-1111-4111-8111-111111111111',
    leadId: updates.leadId || updates.lead_id || '22222222-2222-4222-8222-222222222222',
    ...updates,
  })
  delete payload.organisation_id
  delete payload.lead_id
  delete payload.created_by
  if (!('contactId' in updates) && !('contact_id' in updates) && !('contact' in updates)) delete payload.contact_id
  return payload
}

function formatCurrency(value) {
  const number = Number(value || 0)
  if (!number) return ''
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(number)
}

export function buildRequirementSummary(requirement = null) {
  if (!requirement) return 'No structured requirement'
  const item = requirement.requirementId || requirement.requirement_id ? mapLeadRequirement(requirement) : requirement
  const property = item.propertyTypes?.[0] || item.propertyCategory || ''
  const bedrooms = item.bedroomsMin ? `${item.bedroomsMin}-bed` : ''
  const location = item.suburbs?.[0] || item.areas?.[0] || item.city || ''
  const budget = item.budgetMin && item.budgetMax
    ? `${formatCurrency(item.budgetMin)}-${formatCurrency(item.budgetMax)}`
    : item.budgetMax
      ? `up to ${formatCurrency(item.budgetMax)}`
      : item.budgetMin
        ? `from ${formatCurrency(item.budgetMin)}`
        : ''
  return [bedrooms, property, location, budget].filter(Boolean).join(' · ') || item.title || `${item.intentType || 'buy'} requirement`
}

export function buildRequirementFromLeadFallback(lead = {}) {
  const budget = normalizeNumber(lead.budget ?? lead.estimatedValue ?? lead.estimated_value)
  const areaInterest = normalizeText(lead.areaInterest || lead.area_interest)
  const propertyInterest = normalizeText(lead.propertyInterest || lead.property_interest)
  const propertyTypes = []
  const lowerInterest = propertyInterest.toLowerCase()
  for (const type of ['townhouse', 'apartment', 'flat', 'house', 'land', 'commercial']) {
    if (new RegExp(`\\b${type}\\b`).test(lowerInterest)) propertyTypes.push(type === 'flat' ? 'apartment' : type)
  }
  const notes = [
    areaInterest ? `Legacy area interest: ${areaInterest}` : '',
    propertyInterest ? `Legacy property interest: ${propertyInterest}` : '',
  ].filter(Boolean).join('\n')
  return {
    organisationId: lead.organisationId || lead.organisation_id,
    leadId: lead.leadId || lead.lead_id || lead.id,
    contactId: lead.contactId || lead.contact_id,
    title: propertyInterest || areaInterest ? 'Requirement from existing lead details' : 'Buyer requirement',
    intentType: 'buy',
    propertyTypes: [...new Set(propertyTypes)],
    areas: normalizeArray(areaInterest),
    budgetMax: budget,
    notes,
    status: 'active',
    isPrimary: true,
  }
}

async function clearPrimaryRequirement(client, organisationId, leadId, excludeRequirementId = '') {
  let query = client
    .from('lead_requirements')
    .update({ is_primary: false })
    .eq('organisation_id', organisationId)
    .eq('lead_id', leadId)
    .eq('is_primary', true)
  if (excludeRequirementId) query = query.neq('requirement_id', excludeRequirementId)
  const { error } = await query
  if (error && !isRecoverableReadError(error, 'lead_requirements')) throw error
}

async function readRequirementRow(requirementId = '') {
  const client = requireClient()
  const normalizedId = nullableUuid(requirementId)
  if (!normalizedId) throw new Error('Requirement id is required.')
  const { data, error } = await client
    .from('lead_requirements')
    .select('*')
    .eq('requirement_id', normalizedId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function listLeadRequirements({ organisationId = '', leadId = '' } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedLeadId = nullableUuid(leadId)
  if (!normalizedOrgId || !normalizedLeadId) return []
  const { data, error } = await client
    .from('lead_requirements')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .eq('lead_id', normalizedLeadId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) {
    if (isRecoverableReadError(error, 'lead_requirements')) return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map(mapLeadRequirement).sort(sortRequirements)
}

export async function getLeadRequirement({ requirementId = '' } = {}) {
  const row = await readRequirementRow(requirementId)
  return row ? mapLeadRequirement(row) : null
}

export async function createLeadRequirement(payload = {}, { actor = null } = {}) {
  const client = requireClient()
  const dbPayload = buildLeadRequirementPayload({ ...payload, createdBy: payload.createdBy || payload.created_by || actor?.id })
  if (dbPayload.is_primary && dbPayload.status === 'active') {
    await clearPrimaryRequirement(client, dbPayload.organisation_id, dbPayload.lead_id)
  }
  const { data, error } = await client
    .from('lead_requirements')
    .insert(dbPayload)
    .select('*')
    .single()
  if (error) throw error
  return mapLeadRequirement(data)
}

export async function updateLeadRequirement({ requirementId = '', updates = {} } = {}) {
  const client = requireClient()
  const existing = await readRequirementRow(requirementId)
  if (!existing) throw new Error('Requirement not found.')
  const patch = buildLeadRequirementPatch({ ...mapLeadRequirement(existing), ...updates })
  if ((patch.is_primary ?? existing.is_primary) && (patch.status || existing.status) === 'active') {
    await clearPrimaryRequirement(client, existing.organisation_id, existing.lead_id, existing.requirement_id)
  }
  const { data, error } = await client
    .from('lead_requirements')
    .update(patch)
    .eq('requirement_id', existing.requirement_id)
    .select('*')
    .single()
  if (error) throw error
  return mapLeadRequirement(data)
}

export async function deleteLeadRequirement({ requirementId = '' } = {}) {
  const existing = await readRequirementRow(requirementId)
  const client = requireClient()
  const { error } = await client
    .from('lead_requirements')
    .delete()
    .eq('requirement_id', nullableUuid(requirementId))
  if (error) throw error
  return existing ? mapLeadRequirement(existing) : null
}

export async function archiveLeadRequirement({ requirementId = '' } = {}, options = {}) {
  return updateLeadRequirement({ requirementId, updates: { status: 'archived', isPrimary: false } }, options)
}

export async function pauseLeadRequirement({ requirementId = '' } = {}, options = {}) {
  return updateLeadRequirement({ requirementId, updates: { status: 'paused', isPrimary: false } }, options)
}

export async function activateLeadRequirement({ requirementId = '' } = {}, options = {}) {
  return updateLeadRequirement({ requirementId, updates: { status: 'active' } }, options)
}

export async function setPrimaryLeadRequirement({ leadId = '', requirementId = '' } = {}) {
  const client = requireClient()
  const existing = await readRequirementRow(requirementId)
  const normalizedLeadId = nullableUuid(leadId || existing?.lead_id)
  if (!existing || !normalizedLeadId || existing.lead_id !== normalizedLeadId) {
    throw new Error('A valid lead id and requirement id are required to set the primary requirement.')
  }
  await clearPrimaryRequirement(client, existing.organisation_id, existing.lead_id, existing.requirement_id)
  const { data, error } = await client
    .from('lead_requirements')
    .update({ is_primary: true, status: 'active' })
    .eq('requirement_id', existing.requirement_id)
    .select('*')
    .single()
  if (error) throw error
  return mapLeadRequirement(data)
}

export const __leadRequirementServiceTestUtils = {
  buildLeadRequirementPayload,
  buildLeadRequirementPatch,
  buildRequirementFromLeadFallback,
  buildRequirementSummary,
  mapLeadRequirement,
  normalizeArray,
  normalizeEnum,
}
