import { fetchOrganisationSettings } from '../../../lib/settingsApi'
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'

const TABLES = {
  landlords: 'commercial_landlords',
  tenants: 'commercial_tenants',
  properties: 'commercial_properties',
  requirements: 'commercial_requirements',
  deals: 'commercial_deals',
  leases: 'commercial_leases',
  activity: 'commercial_activity',
  documents: 'commercial_documents',
  documentRequests: 'commercial_document_requests',
  headsOfTerms: 'commercial_heads_of_terms',
}

const SELECTS = {
  landlords:
    'id, organisation_id, created_at, updated_at, created_by, updated_by, status, notes, name, contact_person, email, phone, website, landlord_type, portfolio_notes, preferred_contact_method',
  tenants:
    'id, organisation_id, created_at, updated_at, created_by, updated_by, status, notes, name, contact_person, email, phone, industry, company_size, current_location, current_lease_expiry, preferred_contact_method',
  properties:
    'id, organisation_id, created_at, updated_at, created_by, updated_by, status, notes, landlord_id, property_name, property_type, address, suburb, city, province, country, gla_m2, available_space_m2, vacancy_percentage, zoning, parking_ratio, loading_bays, power_supply, height_m, asking_rental_per_m2, asking_sale_price',
  requirements:
    'id, organisation_id, created_at, updated_at, created_by, updated_by, status, notes, requirement_type, client_type, tenant_id, requirement_name, property_type, preferred_locations, min_size_m2, max_size_m2, budget_min, budget_max, target_occupation_date, lease_term_months, special_requirements, assigned_broker, stage',
  deals:
    'id, organisation_id, created_at, updated_at, created_by, updated_by, status, notes, deal_name, deal_type, requirement_id, tenant_id, landlord_id, property_id, assigned_broker, stage, deal_value, estimated_commission, expected_close_date, probability_percentage',
  leases:
    'id, organisation_id, created_at, updated_at, created_by, updated_by, status, notes, deal_id, tenant_id, landlord_id, property_id, lease_start_date, lease_end_date, occupation_date, lease_term_months, monthly_rental, rental_per_m2, escalation_percentage, deposit_amount, tenant_installation_allowance, rent_free_period_months, renewal_option, renewal_notice_date',
  activity:
    'id, organisation_id, entity_type, entity_id, activity_type, title, body, metadata, created_at, created_by',
  documents:
    'id, organisation_id, entity_type, entity_id, document_name, category, status, notes, file_name, file_path, file_bucket, file_size, mime_type, uploaded_by, uploaded_at, archived_at, created_at, updated_at, created_by, updated_by',
  documentRequests:
    'id, organisation_id, entity_type, entity_id, document_name, category, requested_from, due_date, notes, status, created_at, updated_at, created_by, updated_by',
  headsOfTerms:
    'id, organisation_id, deal_id, tenant_id, landlord_id, property_id, premises_description, lease_commencement_date, lease_term_months, monthly_rental, rental_per_m2, escalation_percentage, deposit_amount, tenant_installation_allowance, rent_free_period_months, beneficial_occupation_date, permitted_use, special_conditions, broker_commission_notes, status, created_at, updated_at, created_by, updated_by',
}

const COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES = ['documents', 'transaction-documents', 'private-listing-documents']

export const COMMERCIAL_TABLES = TABLES

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isMissingCommercialTableError(error) {
  if (!error) return false
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(error?.message)
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    (message.includes('schema cache') && message.includes('commercial_'))
  )
}

function isAuthSessionMissingError(error) {
  const message = normalizeLower(error?.message)
  return message.includes('auth session missing') || message.includes('missing auth session')
}

async function getCurrentUserId() {
  if (!isSupabaseConfigured || !supabase?.auth?.getUser) return null
  const { data } = await supabase.auth.getUser()
  return data?.user?.id || null
}

export async function resolveCommercialOrganisationContext() {
  let context = null
  try {
    context = await fetchOrganisationSettings()
  } catch (error) {
    if (!isAuthSessionMissingError(error)) throw error
  }

  const organisationId = normalizeText(context?.organisation?.id)

  return {
    organisationId,
    organisation: context?.organisation || null,
    membershipRole: normalizeLower(context?.membershipRole || 'viewer'),
    membershipStatus: normalizeLower(context?.membershipStatus || 'pending'),
  }
}

async function resolveOrganisationId(organisationId) {
  const provided = normalizeText(organisationId)
  if (provided) return provided
  const context = await resolveCommercialOrganisationContext()
  return normalizeText(context.organisationId)
}

async function listCommercialRecords(kind, organisationId, { order = 'updated_at', ascending = false } = {}) {
  const table = TABLES[kind]
  const fields = SELECTS[kind]
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)

  if (!table || !fields || !resolvedOrganisationId || !isSupabaseConfigured || !supabase) return []

  const query = await supabase
    .from(table)
    .select(fields)
    .eq('organisation_id', resolvedOrganisationId)
    .order(order, { ascending })

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return []
    throw query.error
  }

  return query.data || []
}

async function createCommercialRecord(kind, payload = {}) {
  const table = TABLES[kind]
  const fields = SELECTS[kind]
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)

  if (!table || !fields) throw new Error('Unknown commercial record type.')
  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const insertPayload = {
    ...payload,
    organisation_id: organisationId,
    created_by: payload.created_by || payload.createdBy || userId,
    updated_by: payload.updated_by || payload.updatedBy || userId,
  }

  delete insertPayload.organisationId
  delete insertPayload.createdBy
  delete insertPayload.updatedBy

  const query = await supabase.from(table).insert(insertPayload).select(fields).single()
  if (query.error) throw query.error
  return query.data || null
}

async function updateCommercialRecord(kind, id, payload = {}) {
  const table = TABLES[kind]
  const fields = SELECTS[kind]
  const recordId = normalizeText(id)

  if (!table || !fields) throw new Error('Unknown commercial record type.')
  if (!recordId) throw new Error('A valid commercial record id is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const updatePayload = {
    ...payload,
    updated_by: payload.updated_by || payload.updatedBy || userId,
  }

  delete updatePayload.id
  delete updatePayload.organisationId
  delete updatePayload.organisation_id
  delete updatePayload.createdBy
  delete updatePayload.created_by
  delete updatePayload.updatedBy

  const query = await supabase.from(table).update(updatePayload).eq('id', recordId).select(fields).single()
  if (query.error) throw query.error
  return query.data || null
}

async function archiveCommercialRecord(kind, id) {
  return updateCommercialRecord(kind, id, { status: 'archived' })
}

function safeFileName(value) {
  return normalizeText(value || 'document')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document'
}

function createObjectPath({ organisationId, entityType, entityId, fileName }) {
  const idPart = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return [
    'commercial',
    safeFileName(organisationId || 'organisation'),
    safeFileName(entityType || 'entity'),
    safeFileName(entityId || 'record'),
    `${idPart}-${safeFileName(fileName)}`,
  ].join('/')
}

async function uploadCommercialFile({ file, organisationId, entityType, entityId } = {}) {
  if (!file) return { bucket: '', path: '' }
  if (!isSupabaseConfigured || !supabase?.storage) throw new Error('Supabase is not configured.')

  const objectPath = createObjectPath({
    organisationId,
    entityType,
    entityId,
    fileName: file.name || 'commercial-document',
  })
  const checkedBuckets = []

  for (const bucket of COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES) {
    checkedBuckets.push(bucket)
    const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })
    if (!error) return { bucket, path: objectPath }
    if (!/bucket|not found|does not exist/i.test(String(error.message || ''))) throw error
  }

  throw new Error(`Commercial document storage is not configured. Checked: ${checkedBuckets.join(', ')}.`)
}

async function createCommercialActivity(payload = {}) {
  const table = TABLES.activity
  const fields = SELECTS.activity
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)

  if (!organisationId || !isSupabaseConfigured || !supabase) return null

  const userId = await getCurrentUserId()
  const activityPayload = {
    organisation_id: organisationId,
    entity_type: normalizeText(payload.entityType || payload.entity_type),
    entity_id: normalizeText(payload.entityId || payload.entity_id),
    activity_type: normalizeText(payload.activityType || payload.activity_type || 'note'),
    title: normalizeText(payload.title) || null,
    body: normalizeText(payload.body) || null,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    created_by: payload.created_by || payload.createdBy || userId,
  }

  if (!activityPayload.entity_type || !activityPayload.entity_id) return null

  const query = await supabase.from(table).insert(activityPayload).select(fields).single()
  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return null
    throw query.error
  }
  return query.data || null
}

async function logCommercialActivity(payload = {}) {
  try {
    return await createCommercialActivity(payload)
  } catch (error) {
    console.warn('[commercialApi] activity log skipped', error)
    return null
  }
}

export const getCommercialLandlords = (organisationId) => listCommercialRecords('landlords', organisationId, { order: 'name', ascending: true })
export const getCommercialTenants = (organisationId) => listCommercialRecords('tenants', organisationId, { order: 'name', ascending: true })
export const getCommercialProperties = (organisationId) => listCommercialRecords('properties', organisationId, { order: 'property_name', ascending: true })
export const getCommercialRequirements = (organisationId) => listCommercialRecords('requirements', organisationId)
export const getCommercialDeals = (organisationId) => listCommercialRecords('deals', organisationId)
export const getCommercialLeases = (organisationId) => listCommercialRecords('leases', organisationId)
export const getCommercialAllDocuments = (organisationId) => listCommercialRecords('documents', organisationId)
export const getCommercialAllDocumentRequests = (organisationId) => listCommercialRecords('documentRequests', organisationId)
export const getCommercialAllHeadsOfTerms = (organisationId) => listCommercialRecords('headsOfTerms', organisationId)

export const createCommercialLandlord = (payload) => createCommercialRecord('landlords', payload)
export const createCommercialTenant = (payload) => createCommercialRecord('tenants', payload)
export const createCommercialProperty = (payload) => createCommercialRecord('properties', payload)
export const createCommercialRequirement = (payload) => createCommercialRecord('requirements', payload)
export const createCommercialDeal = (payload) => createCommercialRecord('deals', payload)
export const createCommercialLease = (payload) => createCommercialRecord('leases', payload)

export const updateCommercialLandlord = (id, payload) => updateCommercialRecord('landlords', id, payload)
export const updateCommercialTenant = (id, payload) => updateCommercialRecord('tenants', id, payload)
export const updateCommercialProperty = (id, payload) => updateCommercialRecord('properties', id, payload)
export const updateCommercialRequirement = (id, payload) => updateCommercialRecord('requirements', id, payload)
export const updateCommercialDeal = (id, payload) => updateCommercialRecord('deals', id, payload)
export const updateCommercialLease = (id, payload) => updateCommercialRecord('leases', id, payload)

export const archiveCommercialLandlord = (id) => archiveCommercialRecord('landlords', id)
export const archiveCommercialTenant = (id) => archiveCommercialRecord('tenants', id)
export const archiveCommercialProperty = (id) => archiveCommercialRecord('properties', id)
export const archiveCommercialRequirement = (id) => archiveCommercialRecord('requirements', id)
export const archiveCommercialDeal = (id) => archiveCommercialRecord('deals', id)
export const archiveCommercialLease = (id) => archiveCommercialRecord('leases', id)

export async function getCommercialDocuments(entityType, entityId, organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const normalizedEntityType = normalizeText(entityType)
  const normalizedEntityId = normalizeText(entityId)
  if (!resolvedOrganisationId || !normalizedEntityType || !normalizedEntityId || !isSupabaseConfigured || !supabase) return []

  const query = await supabase
    .from(TABLES.documents)
    .select(SELECTS.documents)
    .eq('organisation_id', resolvedOrganisationId)
    .eq('entity_type', normalizedEntityType)
    .eq('entity_id', normalizedEntityId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return []
    throw query.error
  }
  return query.data || []
}

export async function uploadCommercialDocument(payload = {}) {
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)
  const entityType = normalizeText(payload.entityType || payload.entity_type)
  const entityId = normalizeText(payload.entityId || payload.entity_id)
  const file = payload.file || null

  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!entityType || !entityId) throw new Error('A valid commercial document link is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const uploaded = await uploadCommercialFile({ file, organisationId, entityType, entityId })
  const documentPayload = {
    organisation_id: organisationId,
    entity_type: entityType,
    entity_id: entityId,
    document_name: normalizeText(payload.documentName || payload.document_name || file?.name || 'Commercial document'),
    category: normalizeText(payload.category) || null,
    status: normalizeText(payload.status || 'uploaded'),
    notes: normalizeText(payload.notes) || null,
    file_name: normalizeText(file?.name || payload.fileName || payload.file_name) || null,
    file_path: uploaded.path || normalizeText(payload.filePath || payload.file_path) || null,
    file_bucket: uploaded.bucket || normalizeText(payload.fileBucket || payload.file_bucket || 'documents'),
    file_size: Number.isFinite(Number(file?.size)) ? Number(file.size) : null,
    mime_type: normalizeText(file?.type || payload.mimeType || payload.mime_type) || null,
    uploaded_by: userId,
    uploaded_at: new Date().toISOString(),
    created_by: userId,
    updated_by: userId,
  }

  const query = await supabase.from(TABLES.documents).insert(documentPayload).select(SELECTS.documents).single()
  if (query.error) throw query.error

  await logCommercialActivity({
    organisationId,
    entityType,
    entityId,
    activityType: 'document_uploaded',
    title: 'Document uploaded',
    body: `${documentPayload.document_name} was uploaded.`,
    metadata: { documentId: query.data?.id, category: documentPayload.category },
  })

  return query.data || null
}

export async function updateCommercialDocumentStatus(documentId, status) {
  const updated = await updateCommercialRecord('documents', documentId, { status })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: updated?.entity_type,
    entityId: updated?.entity_id,
    activityType: `document_${status}`,
    title: `Document ${normalizeText(status).replace(/_/g, ' ')}`,
    body: `${updated?.document_name || 'A commercial document'} was marked ${normalizeText(status).replace(/_/g, ' ')}.`,
    metadata: { documentId, status },
  })
  return updated
}

export async function archiveCommercialDocument(documentId) {
  const updated = await updateCommercialRecord('documents', documentId, {
    status: 'archived',
    archived_at: new Date().toISOString(),
  })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: updated?.entity_type,
    entityId: updated?.entity_id,
    activityType: 'document_archived',
    title: 'Document archived',
    body: `${updated?.document_name || 'A commercial document'} was archived.`,
    metadata: { documentId },
  })
  return updated
}

export async function getCommercialDocumentDownloadUrl(document) {
  const path = normalizeText(document?.file_path)
  const bucket = normalizeText(document?.file_bucket || 'documents')
  if (!path || !isSupabaseConfigured || !supabase?.storage) return ''
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data?.signedUrl || ''
}

export async function getCommercialDocumentRequests(entityType, entityId, organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const normalizedEntityType = normalizeText(entityType)
  const normalizedEntityId = normalizeText(entityId)
  if (!resolvedOrganisationId || !normalizedEntityType || !normalizedEntityId || !isSupabaseConfigured || !supabase) return []

  const query = await supabase
    .from(TABLES.documentRequests)
    .select(SELECTS.documentRequests)
    .eq('organisation_id', resolvedOrganisationId)
    .eq('entity_type', normalizedEntityType)
    .eq('entity_id', normalizedEntityId)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return []
    throw query.error
  }
  return query.data || []
}

export async function createCommercialDocumentRequest(payload = {}) {
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)
  const entityType = normalizeText(payload.entityType || payload.entity_type)
  const entityId = normalizeText(payload.entityId || payload.entity_id)

  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!entityType || !entityId) throw new Error('A valid commercial document request link is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const requestPayload = {
    organisation_id: organisationId,
    entity_type: entityType,
    entity_id: entityId,
    document_name: normalizeText(payload.documentName || payload.document_name),
    category: normalizeText(payload.category) || null,
    requested_from: normalizeText(payload.requestedFrom || payload.requested_from) || null,
    due_date: normalizeText(payload.dueDate || payload.due_date) || null,
    notes: normalizeText(payload.notes) || null,
    status: normalizeText(payload.status || 'requested'),
    created_by: userId,
    updated_by: userId,
  }

  const query = await supabase.from(TABLES.documentRequests).insert(requestPayload).select(SELECTS.documentRequests).single()
  if (query.error) throw query.error

  await logCommercialActivity({
    organisationId,
    entityType,
    entityId,
    activityType: 'document_requested',
    title: 'Document requested',
    body: `${requestPayload.document_name || 'A commercial document'} was requested.`,
    metadata: { requestId: query.data?.id, category: requestPayload.category },
  })

  return query.data || null
}

export async function getHeadsOfTermsByDeal(dealId, organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const normalizedDealId = normalizeText(dealId)
  if (!resolvedOrganisationId || !normalizedDealId || !isSupabaseConfigured || !supabase) return null

  const query = await supabase
    .from(TABLES.headsOfTerms)
    .select(SELECTS.headsOfTerms)
    .eq('organisation_id', resolvedOrganisationId)
    .eq('deal_id', normalizedDealId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return null
    throw query.error
  }
  return query.data || null
}

export async function createHeadsOfTerms(payload = {}) {
  const organisationId = await resolveOrganisationId(payload.organisationId || payload.organisation_id)
  if (!organisationId) throw new Error('Commercial organisation context is not available.')
  if (!normalizeText(payload.deal_id || payload.dealId)) throw new Error('A deal is required before Heads of Terms can be saved.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const insertPayload = {
    ...payload,
    organisation_id: organisationId,
    deal_id: payload.deal_id || payload.dealId,
    created_by: payload.created_by || payload.createdBy || userId,
    updated_by: payload.updated_by || payload.updatedBy || userId,
    status: payload.status || 'draft',
  }
  delete insertPayload.organisationId
  delete insertPayload.dealId
  delete insertPayload.createdBy
  delete insertPayload.updatedBy

  const query = await supabase.from(TABLES.headsOfTerms).insert(insertPayload).select(SELECTS.headsOfTerms).single()
  if (query.error) throw query.error

  await logCommercialActivity({
    organisationId,
    entityType: 'commercial_deal',
    entityId: insertPayload.deal_id,
    activityType: 'heads_of_terms_created',
    title: 'Heads of Terms created',
    body: 'Heads of Terms draft was created.',
    metadata: { headsOfTermsId: query.data?.id },
  })

  return query.data || null
}

export async function updateHeadsOfTerms(id, payload = {}) {
  const hotId = normalizeText(id)
  if (!hotId) throw new Error('A valid Heads of Terms id is required.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')

  const userId = await getCurrentUserId()
  const updatePayload = { ...payload, updated_by: payload.updated_by || payload.updatedBy || userId }
  delete updatePayload.id
  delete updatePayload.organisationId
  delete updatePayload.organisation_id
  delete updatePayload.createdBy
  delete updatePayload.created_by
  delete updatePayload.updatedBy

  const query = await supabase.from(TABLES.headsOfTerms).update(updatePayload).eq('id', hotId).select(SELECTS.headsOfTerms).single()
  if (query.error) throw query.error

  await logCommercialActivity({
    organisation_id: query.data?.organisation_id,
    entityType: 'commercial_deal',
    entityId: query.data?.deal_id,
    activityType: 'heads_of_terms_updated',
    title: 'Heads of Terms updated',
    body: 'Heads of Terms details were updated.',
    metadata: { headsOfTermsId: hotId },
  })

  return query.data || null
}

export async function updateHeadsOfTermsStatus(id, status) {
  const updated = await updateHeadsOfTerms(id, { status })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: 'commercial_deal',
    entityId: updated?.deal_id,
    activityType: 'heads_of_terms_status_changed',
    title: 'Heads of Terms status changed',
    body: `Heads of Terms marked ${normalizeText(status).replace(/_/g, ' ')}.`,
    metadata: { headsOfTermsId: id, status },
  })
  return updated
}

export async function updateCommercialRequirementStage(id, stage, previousStage = '') {
  const updated = await updateCommercialRecord('requirements', id, { stage })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: 'commercial_requirement',
    entityId: id,
    activityType: 'stage_changed',
    title: 'Requirement stage changed',
    body: previousStage ? `Moved from ${previousStage} to ${stage}.` : `Moved to ${stage}.`,
    metadata: { previousStage, nextStage: stage },
  })
  return updated
}

export async function updateCommercialDealStage(id, stage, previousStage = '') {
  const updated = await updateCommercialRecord('deals', id, { stage })
  await logCommercialActivity({
    organisation_id: updated?.organisation_id,
    entityType: 'commercial_deal',
    entityId: id,
    activityType: 'stage_changed',
    title: 'Deal stage changed',
    body: previousStage ? `Moved from ${previousStage} to ${stage}.` : `Moved to ${stage}.`,
    metadata: { previousStage, nextStage: stage },
  })
  return updated
}

export async function createDealFromRequirement(requirement, payload = {}) {
  const sourceRequirement = requirement || {}
  const deal = await createCommercialRecord('deals', {
    ...payload,
    organisation_id: payload.organisation_id || sourceRequirement.organisation_id,
    requirement_id: payload.requirement_id || sourceRequirement.id,
    tenant_id: payload.tenant_id || sourceRequirement.tenant_id,
    assigned_broker: payload.assigned_broker || sourceRequirement.assigned_broker,
    status: payload.status || 'active',
    stage: payload.stage || 'requirement',
  })

  await logCommercialActivity({
    organisation_id: sourceRequirement.organisation_id || deal?.organisation_id,
    entityType: 'commercial_requirement',
    entityId: sourceRequirement.id,
    activityType: 'requirement_converted_to_deal',
    title: 'Deal created from requirement',
    body: deal?.deal_name ? `Created ${deal.deal_name}.` : 'A commercial deal was created from this requirement.',
    metadata: { dealId: deal?.id },
  })

  await logCommercialActivity({
    organisation_id: deal?.organisation_id || sourceRequirement.organisation_id,
    entityType: 'commercial_deal',
    entityId: deal?.id,
    activityType: 'deal_created',
    title: 'Deal created',
    body: sourceRequirement.requirement_name ? `Created from ${sourceRequirement.requirement_name}.` : 'Commercial deal created.',
    metadata: { requirementId: sourceRequirement.id },
  })

  return deal
}

export async function getCommercialActivity({ organisationId, entityType, entityId } = {}) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  const normalizedEntityType = normalizeText(entityType)
  const normalizedEntityId = normalizeText(entityId)
  if (!resolvedOrganisationId || !normalizedEntityType || !normalizedEntityId || !isSupabaseConfigured || !supabase) return []

  const query = await supabase
    .from(TABLES.activity)
    .select(SELECTS.activity)
    .eq('organisation_id', resolvedOrganisationId)
    .eq('entity_type', normalizedEntityType)
    .eq('entity_id', normalizedEntityId)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingCommercialTableError(query.error)) return []
    throw query.error
  }

  return query.data || []
}

export async function addCommercialNote({ organisationId, entityType, entityId, body }) {
  return createCommercialActivity({
    organisationId,
    entityType,
    entityId,
    activityType: 'note_added',
    title: 'Note added',
    body,
  })
}

export async function getCommercialLookupData(organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  if (!resolvedOrganisationId) {
    return { landlords: [], tenants: [], properties: [], requirements: [], deals: [], leases: [] }
  }

  const [landlords, tenants, properties, requirements, deals, leases] = await Promise.all([
    getCommercialLandlords(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
  ])

  return { landlords, tenants, properties, requirements, deals, leases }
}

export async function getCommercialDashboardData(organisationId) {
  const resolvedOrganisationId = await resolveOrganisationId(organisationId)
  if (!resolvedOrganisationId) {
    return buildCommercialDashboardData()
  }

  const [landlords, tenants, properties, requirements, deals, leases, documents, documentRequests, headsOfTerms] = await Promise.all([
    getCommercialLandlords(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
    getCommercialAllDocuments(resolvedOrganisationId),
    getCommercialAllDocumentRequests(resolvedOrganisationId),
    getCommercialAllHeadsOfTerms(resolvedOrganisationId),
  ])

  return buildCommercialDashboardData({ landlords, tenants, properties, requirements, deals, leases, documents, documentRequests, headsOfTerms, organisationId: resolvedOrganisationId })
}

function isActiveStatus(row) {
  return normalizeLower(row?.status || 'active') === 'active'
}

function isOpenStage(stage) {
  return !['closed_won', 'closed_lost', 'signed'].includes(normalizeLower(stage))
}

function isLeaseExpiringSoon(lease) {
  const endDate = lease?.lease_end_date ? new Date(lease.lease_end_date) : null
  if (!endDate || Number.isNaN(endDate.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + 180)
  return endDate >= today && endDate <= horizon
}

export function buildCommercialDashboardData({
  landlords = [],
  tenants = [],
  properties = [],
  requirements = [],
  deals = [],
  leases = [],
  documents = [],
  documentRequests = [],
  headsOfTerms = [],
  organisationId = '',
} = {}) {
  const activeRequirements = requirements.filter((row) => isActiveStatus(row) && isOpenStage(row.stage)).length
  const availableSpace = properties.reduce((total, row) => total + toNumber(row.available_space_m2), 0)
  const glaTracked = properties.reduce((total, row) => total + toNumber(row.gla_m2), 0)
  const dealsInNegotiation = deals.filter((row) =>
    isActiveStatus(row) && ['proposal', 'heads_of_terms', 'lease_draft'].includes(normalizeLower(row.stage)),
  ).length
  const leaseExpiries = leases.filter(isLeaseExpiringSoon).length
  const occupiedSpace = Math.max(glaTracked - availableSpace, 0)
  const occupancyPipeline = glaTracked > 0 ? Math.round((occupiedSpace / glaTracked) * 100) : 0
  const requirementStageCounts = requirements.reduce((counts, row) => {
    const stage = normalizeText(row.stage || 'new_requirement')
    counts[stage] = (counts[stage] || 0) + 1
    return counts
  }, {})
  const dealStageCounts = deals.reduce((counts, row) => {
    const stage = normalizeText(row.stage || 'requirement')
    counts[stage] = (counts[stage] || 0) + 1
    return counts
  }, {})
  const now = new Date()
  const closeSoonHorizon = new Date(now)
  closeSoonHorizon.setDate(closeSoonHorizon.getDate() + 45)
  const dealsClosingSoon = deals.filter((row) => {
    const date = row.expected_close_date ? new Date(row.expected_close_date) : null
    return date && !Number.isNaN(date.getTime()) && date >= now && date <= closeSoonHorizon
  })
  const requirementsNeedingFollowUp = requirements.filter((row) => isActiveStatus(row) && ['new_requirement', 'shortlisting', 'viewing'].includes(normalizeLower(row.stage)))
  const negotiationItems = [
    ...requirements.filter((row) => isActiveStatus(row) && normalizeLower(row.stage) === 'negotiation'),
    ...deals.filter((row) => isActiveStatus(row) && ['proposal', 'heads_of_terms', 'lease_draft'].includes(normalizeLower(row.stage))),
  ]
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const outstandingDocumentRequests = documentRequests.filter((row) => ['requested', 'under_review'].includes(normalizeLower(row.status))).length
  const overdueDocumentRequests = documentRequests.filter((row) => {
    const dueDate = row.due_date ? new Date(row.due_date) : null
    return dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < today && !['completed', 'approved', 'archived'].includes(normalizeLower(row.status))
  }).length
  const recentlyUploadedDocuments = documents
    .filter((row) => !row.archived_at && normalizeLower(row.status) !== 'archived')
    .sort((a, b) => new Date(b.uploaded_at || b.created_at || 0) - new Date(a.uploaded_at || a.created_at || 0))
    .slice(0, 3)
  const hotStatusCounts = headsOfTerms.reduce((counts, row) => {
    const status = normalizeText(row.status || 'draft')
    counts[status] = (counts[status] || 0) + 1
    return counts
  }, {})

  return {
    organisationId,
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    leases,
    documents,
    documentRequests,
    headsOfTerms,
    summary: {
      activeRequirements,
      availableSpace,
      dealsInNegotiation,
      leaseExpiries,
      occupancyPipeline,
      glaTracked,
      requirementStageCounts,
      dealStageCounts,
      priority: {
        requirementsNeedingFollowUp: requirementsNeedingFollowUp.slice(0, 4),
        dealsClosingSoon: dealsClosingSoon.slice(0, 4),
        negotiationItems: negotiationItems.slice(0, 4),
      },
      documents: {
        outstandingDocumentRequests,
        overdueDocumentRequests,
        recentlyUploadedDocuments,
      },
      headsOfTerms: {
        drafts: hotStatusCounts.draft || 0,
        sentForReview: hotStatusCounts.sent_for_review || 0,
        readyForLease: hotStatusCounts.ready_for_lease || 0,
        statusCounts: hotStatusCounts,
      },
    },
  }
}
