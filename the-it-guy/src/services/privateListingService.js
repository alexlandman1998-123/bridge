import { MOCK_DATA_ENABLED } from '../lib/mockData'
import { buildSellerOnboardingLink, generateSellerOnboardingToken } from '../lib/agentListingStorage'
import {
  canTransitionPrivateListing,
  evaluatePrivateListingTransitionGuards,
  getAllowedPrivateListingTransitions,
  getPrivateListingLifecycleNextAction,
  getPrivateListingLifecycleState,
  getPrivateListingStatusDescription,
  getPrivateListingStatusGroup,
  getPrivateListingStatusLabel,
  getPrivateListingTransitionSideEffects,
  mapLegacyListingStatusToCanonicalStatus,
  PRIVATE_LISTING_LIFECYCLE,
} from '../lib/privateListingLifecycle'
import {
  buildSellerRequirementProfile,
  generateSellerDocumentRequirements as generateSellerDocumentRequirementsFromEngine,
  getListingActivationReadiness as getSellerListingActivationReadiness,
  getListingReadinessSummary,
  getMandateReadiness as getSellerMandateReadiness,
  getMissingSellerDocuments as getMissingSellerDocumentsFromEngine,
  syncSellerDocumentRequirements as syncSellerDocumentRequirementsFromEngine,
} from '../lib/privateListingRequirementEngine'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import {
  normalizeListingSource,
  normalizePropertyCategory,
  normalizePropertyStructureType,
} from '../lib/propertyTaxonomy'

const LISTING_STATUSES = PRIVATE_LISTING_LIFECYCLE.STATUSES

const LISTING_VISIBILITY = ['internal', 'active_market', 'archived']
const SELLER_ONBOARDING_STATUSES = ['not_started', 'sent', 'in_progress', 'completed', 'rejected']
const MANDATE_STATUSES = ['not_started', 'ready', 'generated', 'sent', 'viewed', 'signed', 'rejected', 'expired']

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function normalizeLeadLink(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeStatus(value, allowed, fallback) {
  const normalized = normalizeText(value).toLowerCase()
  return allowed.includes(normalized) ? normalized : fallback
}

function isMissingTableError(error, tableName = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = String(error.message || '').toLowerCase()
  return code === '42p01' || code === 'pgrst205' || (tableName && message.includes(String(tableName).toLowerCase()))
}

function buildSupabaseErrorSummary(error) {
  if (!error) return 'unknown'
  const code = normalizeText(error.code || 'n/a')
  const message = normalizeText(error.message || 'unknown error')
  const details = normalizeText(error.details || '')
  const hint = normalizeText(error.hint || '')
  return [code && `code=${code}`, `message=${message}`, details && `details=${details}`, hint && `hint=${hint}`]
    .filter(Boolean)
    .join(' | ')
}

function isMissingColumnError(error, columnName = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = String(error.message || '').toLowerCase()
  return code === '42703' || code === 'pgrst204' || (columnName && message.includes(String(columnName).toLowerCase()))
}

function stripUnsupportedTaxonomyColumns(payload = {}) {
  const next = { ...(payload || {}) }
  delete next.property_category
  delete next.listing_source
  delete next.property_structure_type
  return next
}

function mapPrivateListingRow(row, onboardingByListingId = null, requirementsByListingId = null, documentsByListingId = null) {
  if (!row) return null
  const onboarding = onboardingByListingId ? onboardingByListingId.get(String(row.id || '')) || null : null
  const requirementRows = requirementsByListingId ? requirementsByListingId.get(String(row.id || '')) || [] : []
  const documentRows = documentsByListingId ? documentsByListingId.get(String(row.id || '')) || [] : []
  const listingStatus = mapLegacyListingStatusToCanonicalStatus(row.listing_status || row.status)
  const onboardingStatus = normalizeStatus(
    onboarding?.status || row.seller_onboarding_status,
    SELLER_ONBOARDING_STATUSES,
    'not_started',
  )

  const mapped = {
    id: row.id,
    organisationId: row.organisation_id || null,
    assignedAgentId: row.assigned_agent_id || null,
    sellerLeadId: row.seller_lead_id || null,
    originatingCrmLeadId: row.originating_crm_lead_id || null,
    sellerProfileId: row.seller_profile_id || null,
    propertyProfileId: row.property_profile_id || null,
    listingReference: row.listing_reference || '',
    listingStatus,
    listingVisibility: normalizeStatus(row.listing_visibility, LISTING_VISIBILITY, 'internal'),
    propertyCategory: normalizePropertyCategory(row.property_category || row.property_type, { fallback: 'residential' }),
    listingSource: normalizeListingSource(row.listing_source || row.stock_source || row.listing_category, { fallback: 'private_listing' }),
    propertyStructureType: normalizePropertyStructureType(row.property_structure_type || row.ownership_structure || row.property_type, { fallback: 'other' }),
    propertyType: row.property_type || '',
    listingCategory: row.listing_category || 'private_sale',
    title: row.title || '',
    description: row.description || '',
    askingPrice: Number(row.asking_price || 0) || 0,
    estimatedValue: Number(row.estimated_value || 0) || 0,
    addressLine1: row.address_line_1 || '',
    addressLine2: row.address_line_2 || '',
    suburb: row.suburb || '',
    city: row.city || '',
    province: row.province || '',
    postalCode: row.postal_code || '',
    sellerType: row.seller_type || '',
    financeContext: row.finance_context || '',
    mandateType: row.mandate_type || 'sole',
    mandateStatus: normalizeStatus(row.mandate_status, MANDATE_STATUSES, 'not_started'),
    sellerOnboardingStatus: onboardingStatus,
    isActive: Boolean(row.is_active),
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    // Compatibility shape used by existing listing UI while migration is underway.
    listingTitle: row.title || row.address_line_1 || 'Untitled listing',
    propertyAddress: [row.address_line_1, row.address_line_2].filter(Boolean).join(', '),
    status: listingStatus,
    listingStatusLegacy: listingStatus,
    lifecycleStatus: listingStatus,
    lifecycleStatusLabel: getPrivateListingStatusLabel(listingStatus),
    lifecycleStatusDescription: getPrivateListingStatusDescription(listingStatus),
    lifecycleStatusGroup: getPrivateListingStatusGroup(listingStatus),
    lifecycleNextAction: getPrivateListingLifecycleNextAction({ ...row, listingStatus }),
    documentRequirements: requirementRows,
    documents: documentRows,
    mandateStartDate: null,
    mandateEndDate: null,
    seller: {
      name: '',
      email: '',
      phone: '',
    },
    sellerOnboarding: onboarding
      ? {
          token: onboarding.token || '',
          link: onboarding.token ? buildSellerOnboardingLink(onboarding.token) : '',
          status: onboardingStatus,
          submittedAt: onboarding.submitted_at || null,
          completedAt: onboarding.submitted_at || null,
          currentStep: Number(onboarding?.form_data?.currentStep || 0),
          formData: onboarding.form_data || {},
        }
      : {
          token: '',
          link: '',
          status: onboardingStatus,
          submittedAt: null,
          completedAt: null,
          currentStep: 0,
          formData: {},
        },
  }

  return {
    ...mapped,
    readinessSummary: getListingReadinessSummary(mapped),
  }
}

function createListingReference() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PRV-${timestamp}-${randomPart}`
}

async function getCurrentUser(client) {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data?.user?.id) throw new Error('Authentication is required.')
  return data.user
}

async function fetchOnboardingRowsForListings(client, listingIds = []) {
  const ids = Array.isArray(listingIds) ? listingIds.filter(Boolean) : []
  if (!ids.length) return new Map()
  const query = await client
    .from('private_listing_seller_onboarding')
    .select('id, private_listing_id, token, token_expires_at, seller_type, ownership_structure, marital_regime, form_data, status, submitted_at, created_at, updated_at')
    .in('private_listing_id', ids)
    .order('created_at', { ascending: false })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listing_seller_onboarding')) return new Map()
    throw query.error
  }

  const map = new Map()
  for (const row of query.data || []) {
    const listingId = String(row.private_listing_id || '')
    if (!listingId || map.has(listingId)) continue
    map.set(listingId, row)
  }
  return map
}

async function fetchRequirementRowsForListings(client, listingIds = []) {
  const ids = Array.isArray(listingIds) ? listingIds.filter(Boolean) : []
  if (!ids.length) return new Map()
  const query = await client
    .from('private_listing_document_requirements')
    .select('id, private_listing_id, requirement_key, requirement_name, requirement_description, requirement_group, applies_to, document_visibility, status, is_required, generated_from, created_at, updated_at')
    .in('private_listing_id', ids)
    .order('created_at', { ascending: true })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listing_document_requirements')) return new Map()
    throw query.error
  }
  const map = new Map()
  for (const row of query.data || []) {
    const listingId = String(row.private_listing_id || '')
    if (!listingId) continue
    const existing = map.get(listingId) || []
    existing.push(row)
    map.set(listingId, existing)
  }
  return map
}

async function fetchDocumentRowsForListings(client, listingIds = []) {
  const ids = Array.isArray(listingIds) ? listingIds.filter(Boolean) : []
  if (!ids.length) return new Map()
  const query = await client
    .from('private_listing_documents')
    .select('id, private_listing_id, requirement_id, document_type, document_name, storage_path, file_url, uploaded_by, status, visibility, uploaded_at, created_at, updated_at')
    .in('private_listing_id', ids)
    .order('uploaded_at', { ascending: false })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listing_documents')) return new Map()
    throw query.error
  }
  const map = new Map()
  for (const row of query.data || []) {
    const listingId = String(row.private_listing_id || '')
    if (!listingId) continue
    const existing = map.get(listingId) || []
    existing.push(row)
    map.set(listingId, existing)
  }
  return map
}

function buildPrivateListingPayload(payload = {}, userId = null) {
  const organisationId = normalizeUuid(payload.organisationId)
  if (!organisationId) {
    throw new Error('Organisation context is missing or invalid. Confirm this user has an active organisation_users membership linked to organisations.id.')
  }

  const stage = normalizeStatus(payload.listingStatus, LISTING_STATUSES, 'seller_lead')
  const visibility = normalizeStatus(payload.listingVisibility, LISTING_VISIBILITY, 'internal')

  return {
    organisation_id: organisationId,
    assigned_agent_id: normalizeUuid(payload.assignedAgentId),
    seller_lead_id: normalizeLeadLink(payload.sellerLeadId),
    originating_crm_lead_id: normalizeLeadLink(payload.originatingCrmLeadId),
    seller_profile_id: normalizeUuid(payload.sellerProfileId),
    property_profile_id: normalizeUuid(payload.propertyProfileId),
    listing_reference: normalizeNullableText(payload.listingReference) || createListingReference(),
    listing_status: stage,
    listing_visibility: visibility,
    property_category: normalizePropertyCategory(payload.propertyCategory || payload.propertyType, { fallback: 'residential' }),
    listing_source: normalizeListingSource(payload.listingSource || payload.stockSource || payload.listingCategory, { fallback: 'private_listing' }),
    property_structure_type: normalizePropertyStructureType(payload.propertyStructureType || payload.ownershipType || payload.propertyType, { fallback: 'other' }),
    property_type: normalizeNullableText(payload.propertyType),
    listing_category: normalizeNullableText(payload.listingCategory) || 'private_sale',
    title: normalizeNullableText(payload.title),
    description: normalizeNullableText(payload.description),
    asking_price: normalizeNumber(payload.askingPrice),
    estimated_value: normalizeNumber(payload.estimatedValue),
    address_line_1: normalizeNullableText(payload.addressLine1 || payload.propertyAddress),
    address_line_2: normalizeNullableText(payload.addressLine2),
    suburb: normalizeNullableText(payload.suburb),
    city: normalizeNullableText(payload.city),
    province: normalizeNullableText(payload.province),
    postal_code: normalizeNullableText(payload.postalCode),
    seller_type: normalizeNullableText(payload.sellerType),
    finance_context: normalizeNullableText(payload.financeContext),
    mandate_type: normalizeNullableText(payload.mandateType) || 'sole',
    mandate_status: normalizeStatus(payload.mandateStatus, MANDATE_STATUSES, 'not_started'),
    seller_onboarding_status: normalizeStatus(payload.sellerOnboardingStatus, SELLER_ONBOARDING_STATUSES, 'not_started'),
    is_active: payload.isActive === undefined ? false : Boolean(payload.isActive),
    created_by: normalizeUuid(payload.createdBy || userId),
  }
}

export async function createPrivateListing(payload = {}) {
  const client = requireClient()
  const user = await getCurrentUser(client)

  const originatingCrmLeadId = normalizeUuid(payload.originatingCrmLeadId)
  if (originatingCrmLeadId) {
    const existingQuery = await client
      .from('private_listings')
      .select('*')
      .eq('originating_crm_lead_id', originatingCrmLeadId)
      .neq('listing_status', 'withdrawn')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!existingQuery.error && existingQuery.data) {
      const [onboardingMap, requirementsMap, documentsMap] = await Promise.all([
        fetchOnboardingRowsForListings(client, [existingQuery.data.id]),
        fetchRequirementRowsForListings(client, [existingQuery.data.id]),
        fetchDocumentRowsForListings(client, [existingQuery.data.id]),
      ])
      return { listing: mapPrivateListingRow(existingQuery.data, onboardingMap, requirementsMap, documentsMap), existing: true }
    }
  }

  const listingPayload = buildPrivateListingPayload(payload, user.id)
  let insert = await client.from('private_listings').insert(listingPayload).select('*').single()
  if (insert.error && (
    isMissingColumnError(insert.error, 'property_category') ||
    isMissingColumnError(insert.error, 'listing_source') ||
    isMissingColumnError(insert.error, 'property_structure_type')
  )) {
    insert = await client.from('private_listings').insert(stripUnsupportedTaxonomyColumns(listingPayload)).select('*').single()
  }
  if (insert.error) {
    if (isMissingTableError(insert.error, 'private_listings')) {
      const errorSummary = buildSupabaseErrorSummary(insert.error)
      throw new Error(
        `Private listings table is unavailable to this API context. ` +
        `Run sql/20260509_private_listing_foundation.sql on the same Supabase project as this app and reload schema. ` +
        `(${errorSummary})`,
      )
    }
    throw insert.error
  }

  const [onboardingMap, requirementsMap, documentsMap] = await Promise.all([
    fetchOnboardingRowsForListings(client, [insert.data.id]),
    fetchRequirementRowsForListings(client, [insert.data.id]),
    fetchDocumentRowsForListings(client, [insert.data.id]),
  ])
  const listing = mapPrivateListingRow(insert.data, onboardingMap, requirementsMap, documentsMap)

  const requirementSync = await syncPrivateListingRequirements(listing.id, {
    emitActivity: false,
    reason: 'listing_created',
  }).catch(() => null)
  const listingWithRequirements = requirementSync?.listing || listing

  await createPrivateListingActivity({
    privateListingId: insert.data.id,
    activityType: 'seller_lead_created',
    activityTitle: 'Seller lead captured',
    activityDescription: 'Private listing intake shell created.',
    performedBy: user.id,
    visibility: 'internal',
    metadata: {
      source: normalizeText(payload.source || 'manual'),
      originatingCrmLeadId: listingWithRequirements.originatingCrmLeadId,
      sellerLeadId: listingWithRequirements.sellerLeadId,
    },
  }).catch(() => {})

  return { listing: listingWithRequirements, existing: false }
}

export async function updatePrivateListing(listingId, payload = {}) {
  const client = requireClient()
  const normalizedId = normalizeText(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')

  const patch = {}
  if (payload.assignedAgentId !== undefined) patch.assigned_agent_id = normalizeUuid(payload.assignedAgentId)
  if (payload.sellerLeadId !== undefined) patch.seller_lead_id = normalizeLeadLink(payload.sellerLeadId)
  if (payload.originatingCrmLeadId !== undefined) patch.originating_crm_lead_id = normalizeLeadLink(payload.originatingCrmLeadId)
  if (payload.sellerProfileId !== undefined) patch.seller_profile_id = normalizeUuid(payload.sellerProfileId)
  if (payload.propertyProfileId !== undefined) patch.property_profile_id = normalizeUuid(payload.propertyProfileId)
  if (payload.listingReference !== undefined) patch.listing_reference = normalizeNullableText(payload.listingReference)
  if (payload.listingStatus !== undefined) patch.listing_status = normalizeStatus(payload.listingStatus, LISTING_STATUSES, 'seller_lead')
  if (payload.listingVisibility !== undefined) patch.listing_visibility = normalizeStatus(payload.listingVisibility, LISTING_VISIBILITY, 'internal')
  if (payload.propertyCategory !== undefined) patch.property_category = normalizePropertyCategory(payload.propertyCategory, { fallback: 'residential' })
  if (payload.listingSource !== undefined || payload.stockSource !== undefined) {
    patch.listing_source = normalizeListingSource(payload.listingSource || payload.stockSource, { fallback: 'private_listing' })
  }
  if (payload.propertyStructureType !== undefined || payload.ownershipType !== undefined) {
    patch.property_structure_type = normalizePropertyStructureType(payload.propertyStructureType || payload.ownershipType, { fallback: 'other' })
  }
  if (payload.propertyType !== undefined) patch.property_type = normalizeNullableText(payload.propertyType)
  if (payload.listingCategory !== undefined) patch.listing_category = normalizeNullableText(payload.listingCategory)
  if (payload.title !== undefined) patch.title = normalizeNullableText(payload.title)
  if (payload.description !== undefined) patch.description = normalizeNullableText(payload.description)
  if (payload.askingPrice !== undefined) patch.asking_price = normalizeNumber(payload.askingPrice)
  if (payload.estimatedValue !== undefined) patch.estimated_value = normalizeNumber(payload.estimatedValue)
  if (payload.addressLine1 !== undefined) patch.address_line_1 = normalizeNullableText(payload.addressLine1)
  if (payload.addressLine2 !== undefined) patch.address_line_2 = normalizeNullableText(payload.addressLine2)
  if (payload.suburb !== undefined) patch.suburb = normalizeNullableText(payload.suburb)
  if (payload.city !== undefined) patch.city = normalizeNullableText(payload.city)
  if (payload.province !== undefined) patch.province = normalizeNullableText(payload.province)
  if (payload.postalCode !== undefined) patch.postal_code = normalizeNullableText(payload.postalCode)
  if (payload.sellerType !== undefined) patch.seller_type = normalizeNullableText(payload.sellerType)
  if (payload.financeContext !== undefined) patch.finance_context = normalizeNullableText(payload.financeContext)
  if (payload.mandateType !== undefined) patch.mandate_type = normalizeNullableText(payload.mandateType)
  if (payload.mandateStatus !== undefined) patch.mandate_status = normalizeStatus(payload.mandateStatus, MANDATE_STATUSES, 'not_started')
  if (payload.sellerOnboardingStatus !== undefined) {
    patch.seller_onboarding_status = normalizeStatus(payload.sellerOnboardingStatus, SELLER_ONBOARDING_STATUSES, 'not_started')
  }
  if (payload.isActive !== undefined) patch.is_active = Boolean(payload.isActive)

  let updateQuery = await client.from('private_listings').update(patch).eq('id', normalizedId).select('*').single()
  if (updateQuery.error && (
    isMissingColumnError(updateQuery.error, 'property_category') ||
    isMissingColumnError(updateQuery.error, 'listing_source') ||
    isMissingColumnError(updateQuery.error, 'property_structure_type')
  )) {
    updateQuery = await client
      .from('private_listings')
      .update(stripUnsupportedTaxonomyColumns(patch))
      .eq('id', normalizedId)
      .select('*')
      .single()
  }
  if (updateQuery.error) throw updateQuery.error
  const [onboardingMap, requirementsMap, documentsMap] = await Promise.all([
    fetchOnboardingRowsForListings(client, [normalizedId]),
    fetchRequirementRowsForListings(client, [normalizedId]),
    fetchDocumentRowsForListings(client, [normalizedId]),
  ])
  return mapPrivateListingRow(updateQuery.data, onboardingMap, requirementsMap, documentsMap)
}

export async function getPrivateListing(listingId) {
  const client = requireClient()
  const normalizedId = normalizeText(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const query = await client.from('private_listings').select('*').eq('id', normalizedId).maybeSingle()
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listings')) return null
    throw query.error
  }
  if (!query.data) return null
  const [onboardingMap, requirementsMap, documentsMap] = await Promise.all([
    fetchOnboardingRowsForListings(client, [query.data.id]),
    fetchRequirementRowsForListings(client, [query.data.id]),
    fetchDocumentRowsForListings(client, [query.data.id]),
  ])
  return mapPrivateListingRow(query.data, onboardingMap, requirementsMap, documentsMap)
}

export async function getOrganisationPrivateListings(organisationId) {
  const client = requireClient()
  const normalizedOrgId = normalizeUuid(organisationId)
  if (!normalizedOrgId) throw new Error('Organisation id is required.')
  const query = await client
    .from('private_listings')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .order('updated_at', { ascending: false })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listings')) return []
    throw query.error
  }
  const rows = Array.isArray(query.data) ? query.data : []
  const listingIds = rows.map((row) => row.id)
  const [onboardingMap, requirementsMap, documentsMap] = await Promise.all([
    fetchOnboardingRowsForListings(client, listingIds),
    fetchRequirementRowsForListings(client, listingIds),
    fetchDocumentRowsForListings(client, listingIds),
  ])
  return rows.map((row) => mapPrivateListingRow(row, onboardingMap, requirementsMap, documentsMap)).filter(Boolean)
}

export async function getAgentPrivateListings(agentId, { organisationId = null, includeAllOrganisationListings = false } = {}) {
  const client = requireClient()
  const normalizedAgentId = normalizeUuid(agentId)
  const normalizedOrgId = normalizeUuid(organisationId)
  if (!includeAllOrganisationListings && !normalizedAgentId) return []
  const queryBuilder = client.from('private_listings').select('*')

  if (normalizedOrgId) {
    queryBuilder.eq('organisation_id', normalizedOrgId)
  }
  if (normalizedAgentId && !includeAllOrganisationListings) {
    queryBuilder.eq('assigned_agent_id', normalizedAgentId)
  }

  const query = await queryBuilder.order('updated_at', { ascending: false })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listings')) return []
    throw query.error
  }
  const rows = Array.isArray(query.data) ? query.data : []
  const listingIds = rows.map((row) => row.id)
  const [onboardingMap, requirementsMap, documentsMap] = await Promise.all([
    fetchOnboardingRowsForListings(client, listingIds),
    fetchRequirementRowsForListings(client, listingIds),
    fetchDocumentRowsForListings(client, listingIds),
  ])
  return rows.map((row) => mapPrivateListingRow(row, onboardingMap, requirementsMap, documentsMap)).filter(Boolean)
}

export async function createPrivateListingActivity(payload = {}) {
  const client = requireClient()
  const privateListingId = normalizeUuid(payload.privateListingId)
  if (!privateListingId) throw new Error('privateListingId is required.')

  const insert = await client
    .from('private_listing_activity')
    .insert({
      private_listing_id: privateListingId,
      activity_type: normalizeNullableText(payload.activityType),
      activity_title: normalizeNullableText(payload.activityTitle),
      activity_description: normalizeNullableText(payload.activityDescription),
      performed_by: normalizeUuid(payload.performedBy),
      visibility: normalizeStatus(payload.visibility, ['internal', 'shared', 'client_visible'], 'internal'),
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    })
    .select('id, private_listing_id, activity_type, activity_title, activity_description, performed_by, visibility, metadata, created_at')
    .single()

  if (insert.error) {
    if (isMissingTableError(insert.error, 'private_listing_activity')) return null
    throw insert.error
  }
  return insert.data
}

export async function getPrivateListingActivity(listingId) {
  const client = requireClient()
  const normalizedId = normalizeUuid(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const query = await client
    .from('private_listing_activity')
    .select('id, private_listing_id, activity_type, activity_title, activity_description, performed_by, visibility, metadata, created_at')
    .eq('private_listing_id', normalizedId)
    .order('created_at', { ascending: false })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listing_activity')) return []
    throw query.error
  }
  return query.data || []
}

export async function getPrivateListingDocumentRequirements(listingId) {
  const client = requireClient()
  const normalizedId = normalizeUuid(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const query = await client
    .from('private_listing_document_requirements')
    .select('id, private_listing_id, requirement_key, requirement_name, requirement_description, requirement_group, applies_to, document_visibility, status, is_required, generated_from, created_at, updated_at')
    .eq('private_listing_id', normalizedId)
    .order('created_at', { ascending: true })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listing_document_requirements')) return []
    throw query.error
  }
  return query.data || []
}

export async function getPrivateListingDocuments(listingId) {
  const client = requireClient()
  const normalizedId = normalizeUuid(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const query = await client
    .from('private_listing_documents')
    .select('id, private_listing_id, requirement_id, document_type, document_name, storage_path, file_url, uploaded_by, status, visibility, uploaded_at, created_at, updated_at')
    .eq('private_listing_id', normalizedId)
    .order('uploaded_at', { ascending: false })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listing_documents')) return []
    throw query.error
  }
  return query.data || []
}

function hydrateListingWithRequirementData(listing = {}, requirements = [], documents = []) {
  return {
    ...listing,
    documentRequirements: Array.isArray(requirements) ? requirements : [],
    documents: Array.isArray(documents) ? documents : [],
    readinessSummary: getListingReadinessSummary({
      ...listing,
      documentRequirements: Array.isArray(requirements) ? requirements : [],
      documents: Array.isArray(documents) ? documents : [],
    }),
  }
}

export async function syncPrivateListingRequirements(listingOrId, { emitActivity = true, reason = 'system' } = {}) {
  const client = requireClient()
  const listing =
    typeof listingOrId === 'object' && listingOrId
      ? listingOrId
      : await getPrivateListing(normalizeText(listingOrId))

  if (!listing?.id) throw new Error('Private listing not found.')

  const existingRequirements = await getPrivateListingDocumentRequirements(listing.id)
  const profile = buildSellerRequirementProfile(listing)
  const syncedRequirements = syncSellerDocumentRequirementsFromEngine(listing, existingRequirements || [])
  const upsertRows = (syncedRequirements?.upsertRows || []).map((row) => ({
    ...row,
    private_listing_id: listing.id,
    document_visibility: row.document_visibility || row.visibility || 'seller_visible',
  }))
  const markNotApplicableRows = (syncedRequirements?.markNotApplicableRows || []).map((row) => ({
    ...row,
    private_listing_id: listing.id,
    document_visibility: row.document_visibility || row.visibility || 'seller_visible',
    generated_from: {
      ...(row.generated_from && typeof row.generated_from === 'object' ? row.generated_from : {}),
      archivedByReason: reason,
    },
  }))

  const payload = [...upsertRows, ...markNotApplicableRows]
  if (payload.length) {
    const upsertQuery = await client
      .from('private_listing_document_requirements')
      .upsert(payload, { onConflict: 'private_listing_id,requirement_key' })
      .select('id, private_listing_id, requirement_key, requirement_name, requirement_description, requirement_group, applies_to, document_visibility, status, is_required, generated_from, created_at, updated_at')
    if (upsertQuery.error) {
      if (!isMissingTableError(upsertQuery.error, 'private_listing_document_requirements')) {
        throw upsertQuery.error
      }
    }
  }

  const [requirements, documents] = await Promise.all([
    getPrivateListingDocumentRequirements(listing.id),
    getPrivateListingDocuments(listing.id),
  ])
  const hydrated = hydrateListingWithRequirementData(listing, requirements, documents)

  if (emitActivity) {
    const createdCount = upsertRows.filter((row) => !row.id).length
    const archivedCount = markNotApplicableRows.length
    const activityType = existingRequirements.length ? 'requirements_updated' : 'requirements_generated'
    const activityTitle = existingRequirements.length ? 'Seller requirements updated' : 'Seller requirements generated'
    const activityDescription = existingRequirements.length
      ? 'Seller requirements were refreshed based on latest onboarding answers.'
      : 'Dynamic seller requirements were generated from onboarding/profile context.'
    await createPrivateListingActivity({
      privateListingId: listing.id,
      activityType,
      activityTitle,
      activityDescription,
      performedBy: null,
      visibility: 'internal',
      metadata: {
        reason,
        sellerType: profile.sellerType,
        lifecycleStatus: profile.lifecycleStatus,
        createdCount,
        archivedCount,
        totalRequirements: requirements.length,
        missingRequirements: hydrated?.readinessSummary?.missingRequirementsCount || 0,
      },
    }).catch(() => {})

    const mandateReadiness = getSellerMandateReadiness({
      ...listing,
      documentRequirements: requirements,
      documents,
    })
    await createPrivateListingActivity({
      privateListingId: listing.id,
      activityType: mandateReadiness?.ready ? 'mandate_ready' : 'mandate_blocked',
      activityTitle: mandateReadiness?.ready ? 'Mandate readiness achieved' : 'Mandate readiness blocked',
      activityDescription: mandateReadiness?.ready
        ? 'Listing has enough onboarding and compliance detail for mandate preparation.'
        : `Mandate is blocked: ${(mandateReadiness?.blockers || []).slice(0, 3).join(', ') || 'missing seller details'}.`,
      performedBy: null,
      visibility: 'internal',
      metadata: {
        blockers: mandateReadiness?.blockers || [],
      },
    }).catch(() => {})
  }

  return {
    listing: hydrated,
    requirementProfile: profile,
    requirements,
    readinessSummary: hydrated.readinessSummary,
  }
}

export async function sendSellerOnboarding(
  listingId,
  { expiresInDays = 14, sellerType = null, ownershipStructure = null, maritalRegime = null, sellerContactEmail = '', sellerContactPhone = '' } = {},
) {
  const client = requireClient()
  const user = await getCurrentUser(client)
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) throw new Error('Private listing not found.')

  const existingQuery = await client
    .from('private_listing_seller_onboarding')
    .select('*')
    .eq('private_listing_id', listing.id)
    .maybeSingle()
  if (existingQuery.error && !isMissingTableError(existingQuery.error, 'private_listing_seller_onboarding')) {
    throw existingQuery.error
  }

  const token = normalizeText(existingQuery.data?.token) || generateSellerOnboardingToken()
  const expiresAt = new Date(Date.now() + Math.max(1, Number(expiresInDays || 14)) * 24 * 60 * 60 * 1000).toISOString()
  const payload = {
    private_listing_id: listing.id,
    token,
    token_expires_at: expiresAt,
    seller_type: normalizeNullableText(sellerType || listing.sellerType),
    ownership_structure: normalizeNullableText(ownershipStructure),
    marital_regime: normalizeNullableText(maritalRegime),
    form_data: existingQuery.data?.form_data && typeof existingQuery.data.form_data === 'object' ? existingQuery.data.form_data : {},
    status: 'sent',
  }

  const upsert = await client
    .from('private_listing_seller_onboarding')
    .upsert(payload, { onConflict: 'private_listing_id' })
    .select('*')
    .single()
  if (upsert.error) {
    if (isMissingTableError(upsert.error, 'private_listing_seller_onboarding')) {
      throw new Error('Seller onboarding table is not set up yet. Run sql/20260509_private_listing_foundation.sql first.')
    }
    throw upsert.error
  }

  const currentLifecycle = getPrivateListingLifecycleState(listing)
  if (currentLifecycle === 'seller_lead') {
    await transitionPrivateListingStatus(listing.id, 'onboarding_sent', {
      metadata: {
        onboardingToken: token,
        sellerContactEmail,
        sellerContactPhone,
      },
      performedBy: user.id,
      patch: {
        sellerOnboardingStatus: 'sent',
      },
      allowOverride: false,
    })
  }

  return {
    onboarding: upsert.data,
    token,
    link: buildSellerOnboardingLink(token),
    expiresAt,
  }
}

export async function getSellerOnboardingByToken(token) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Onboarding token is required.')
  const query = await client
    .from('private_listing_seller_onboarding')
    .select('*')
    .eq('token', normalizedToken)
    .maybeSingle()
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listing_seller_onboarding')) return null
    throw query.error
  }
  if (!query.data) return null
  const listing = await getPrivateListing(query.data.private_listing_id)
  return {
    onboarding: query.data,
    listing,
  }
}

export async function submitSellerOnboarding(token, payload = {}) {
  const client = requireClient()
  const context = await getSellerOnboardingByToken(token)
  if (!context?.onboarding?.id || !context?.listing?.id) {
    throw new Error('Seller onboarding link is invalid or inactive.')
  }

  const nowIso = new Date().toISOString()
  const existingFormData =
    context.onboarding.form_data && typeof context.onboarding.form_data === 'object' ? context.onboarding.form_data : {}
  const nextFormData = {
    ...existingFormData,
    ...(payload.formData && typeof payload.formData === 'object' ? payload.formData : {}),
  }

  const sellerTypeFromPayload =
    normalizeNullableText(payload.sellerType) ||
    normalizeNullableText(nextFormData.ownershipType) ||
    normalizeNullableText(nextFormData.sellerType)

  const updateOnboarding = await client
    .from('private_listing_seller_onboarding')
    .update({
      status: normalizeStatus(payload.status || 'completed', SELLER_ONBOARDING_STATUSES, 'completed'),
      form_data: nextFormData,
      submitted_at: nowIso,
      seller_type: normalizeNullableText(payload.sellerType || context.onboarding.seller_type),
      ownership_structure: normalizeNullableText(payload.ownershipStructure || context.onboarding.ownership_structure),
      marital_regime: normalizeNullableText(payload.maritalRegime || context.onboarding.marital_regime),
    })
    .eq('id', context.onboarding.id)
    .select('*')
    .single()
  if (updateOnboarding.error) throw updateOnboarding.error

  const transitionResult = await transitionPrivateListingStatus(context.listing.id, 'onboarding_completed', {
    metadata: {
      onboardingId: context.onboarding.id,
      submittedAt: nowIso,
      onboardingStatus: 'completed',
      onboardingFormData: nextFormData,
    },
    patch: {
      sellerType: sellerTypeFromPayload,
      sellerOnboardingStatus: 'completed',
    },
    allowOverride: false,
  })
  const requirementsSync = await syncPrivateListingRequirements(transitionResult?.listing?.id || context.listing.id, {
    emitActivity: true,
    reason: 'onboarding_completed',
  }).catch(() => null)

  return {
    onboarding: updateOnboarding.data,
    listing: requirementsSync?.listing || transitionResult?.listing || null,
  }
}

export async function updateSellerOnboardingProgress(token, payload = {}) {
  const client = requireClient()
  const context = await getSellerOnboardingByToken(token)
  if (!context?.onboarding?.id) {
    throw new Error('Seller onboarding link is invalid or inactive.')
  }

  const existingFormData =
    context.onboarding.form_data && typeof context.onboarding.form_data === 'object' ? context.onboarding.form_data : {}
  const nextFormData = {
    ...existingFormData,
    ...(payload.formData && typeof payload.formData === 'object' ? payload.formData : {}),
    ...(payload.currentStep !== undefined ? { currentStep: Number(payload.currentStep || 0) } : {}),
  }

  const nextStatus = normalizeStatus(payload.status || 'in_progress', SELLER_ONBOARDING_STATUSES, 'in_progress')
  const updateQuery = await client
    .from('private_listing_seller_onboarding')
    .update({
      status: nextStatus,
      form_data: nextFormData,
      seller_type: normalizeNullableText(payload.sellerType || context.onboarding.seller_type),
      ownership_structure: normalizeNullableText(payload.ownershipStructure || context.onboarding.ownership_structure),
      marital_regime: normalizeNullableText(payload.maritalRegime || context.onboarding.marital_regime),
    })
    .eq('id', context.onboarding.id)
    .select('*')
    .single()
  if (updateQuery.error) throw updateQuery.error

  if (nextStatus === 'in_progress') {
    await updatePrivateListing(context.listing.id, {
      sellerOnboardingStatus: 'in_progress',
      listingStatus: context.listing.listingStatus === 'seller_lead' ? 'onboarding_sent' : context.listing.listingStatus,
    }).catch(() => {})
  }

  return {
    onboarding: updateQuery.data,
    listing: await getPrivateListing(context.listing.id),
  }
}

export async function validatePrivateListingTransition(listingId, targetStatus, options = {}) {
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) {
    throw new Error('Private listing not found.')
  }

  const evaluation = canTransitionPrivateListing(listing, targetStatus, {
    allowOverride: Boolean(options?.allowOverride),
    metadata: options?.metadata || {},
  })

  return {
    listing,
    ...evaluation,
  }
}

export async function getPrivateListingNextActions(listingId) {
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) return []

  const currentStatus = getPrivateListingLifecycleState(listing)
  const allowedTargets = getAllowedPrivateListingTransitions(currentStatus)
  return allowedTargets.map((target) => {
    const evaluation = canTransitionPrivateListing(listing, target, {
      allowOverride: false,
      metadata: {},
    })
    return {
      targetStatus: target,
      label: getPrivateListingStatusLabel(target),
      description: getPrivateListingStatusDescription(target),
      blocked: !evaluation.allowed,
      blockers: evaluation.blockers,
    }
  })
}

export async function getPrivateListingLifecycleSummary(listingId) {
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) return null

  const currentStatus = getPrivateListingLifecycleState(listing)
  const blockers = evaluatePrivateListingTransitionGuards(listing, currentStatus, {})
  const nextActions = await getPrivateListingNextActions(listingId)
  return {
    listingId: listing.id,
    currentStatus,
    currentLabel: getPrivateListingStatusLabel(currentStatus),
    currentDescription: getPrivateListingStatusDescription(currentStatus),
    currentGroup: getPrivateListingStatusGroup(currentStatus),
    nextAction: getPrivateListingLifecycleNextAction(listing),
    blockers,
    nextActions,
    listing,
  }
}

export async function getMissingSellerRequirements(listingId) {
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) return []
  return getMissingSellerDocumentsFromEngine(listing)
}

export async function generateSellerDocumentRequirements(listingId) {
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) return []
  const profile = buildSellerRequirementProfile(listing)
  return generateSellerDocumentRequirementsFromEngine(profile)
}

export async function syncSellerDocumentRequirements(listingId, options = {}) {
  const result = await syncPrivateListingRequirements(listingId, options)
  return result?.requirements || []
}

export async function getMissingSellerDocuments(listingId) {
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) return []
  return getMissingSellerDocumentsFromEngine(listing)
}

export async function getMandateReadiness(listingId) {
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) return { ready: false, blockers: ['Listing not found'], checks: [] }
  return getSellerMandateReadiness(listing)
}

export async function getListingActivationReadiness(listingId) {
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) return { ready: false, blockers: ['Listing not found'], mandateSigned: false, missingRequirementsCount: 0 }
  const summary = getListingReadinessSummary(listing)
  return getSellerListingActivationReadiness(summary)
}

export async function updatePrivateListingRequirementStatus(requirementId, status, { isRequired, generatedFrom } = {}) {
  const client = requireClient()
  const normalizedRequirementId = normalizeUuid(requirementId)
  if (!normalizedRequirementId) throw new Error('Requirement id is required.')
  const nextStatus = normalizeStatus(status, ['required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable'], 'required')
  const patch = { status: nextStatus }
  if (typeof isRequired === 'boolean') patch.is_required = isRequired
  if (generatedFrom && typeof generatedFrom === 'object') patch.generated_from = generatedFrom

  const query = await client
    .from('private_listing_document_requirements')
    .update(patch)
    .eq('id', normalizedRequirementId)
    .select('id, private_listing_id, requirement_key, requirement_name, requirement_description, requirement_group, applies_to, document_visibility, status, is_required, generated_from, created_at, updated_at')
    .single()
  if (query.error) throw query.error
  return query.data
}

export async function transitionPrivateListingStatus(listingId, targetStatus, options = {}) {
  const client = requireClient()
  const user = await getCurrentUser(client)
  const validation = await validatePrivateListingTransition(listingId, targetStatus, options)
  const metadata = options?.metadata && typeof options.metadata === 'object' ? options.metadata : {}
  const transitionBlockers = [...validation.blockers]

  if (validation.targetStatus === 'mandate_sent' || validation.targetStatus === 'active') {
    const syncResult = await syncPrivateListingRequirements(validation.listing.id, {
      emitActivity: false,
      reason: 'transition_validation',
    }).catch(() => null)
    const readiness = syncResult?.readinessSummary || null
    if (readiness) {
      const missingRows = Array.isArray(readiness.missingRequirements) ? readiness.missingRequirements : []
      const missingForMandateSent =
        validation.targetStatus === 'mandate_sent'
          ? missingRows.filter((row) => normalizeKey(row?.requirement_key) !== 'mandate_signature')
          : missingRows
      if (missingForMandateSent.length) {
        transitionBlockers.push('Required seller/property documents are still outstanding.')
      }
      if (validation.targetStatus === 'active' && !readiness.mandateSigned) {
        transitionBlockers.push('Mandate must be signed before activation.')
      }
    }
  }

  if (!validation.transitionAllowed) {
    throw new Error('This listing cannot move to that stage yet.')
  }
  if ((!validation.allowed || transitionBlockers.length) && !options?.allowOverride) {
    throw new Error(transitionBlockers[0] || 'This listing cannot move to that stage yet.')
  }

  const sideEffects = getPrivateListingTransitionSideEffects(validation.targetStatus)
  const updatedListing = await updatePrivateListing(validation.listing.id, {
    listingStatus: validation.targetStatus,
    sellerOnboardingStatus:
      options?.sellerOnboardingStatus !== undefined ? options.sellerOnboardingStatus : sideEffects.sellerOnboardingStatus,
    mandateStatus: options?.mandateStatus !== undefined ? options.mandateStatus : sideEffects.mandateStatus,
    listingVisibility: options?.listingVisibility !== undefined ? options.listingVisibility : sideEffects.listingVisibility,
    isActive: options?.isActive !== undefined ? options.isActive : sideEffects.isActive,
    ...(options?.patch && typeof options.patch === 'object' ? options.patch : {}),
  })

  await createPrivateListingActivity({
    privateListingId: validation.listing.id,
    activityType: sideEffects.activityType || 'listing_status_changed',
    activityTitle: sideEffects.activityTitle || 'Listing status changed',
    activityDescription:
      sideEffects.activityDescription ||
      `Listing moved from ${getPrivateListingStatusLabel(validation.currentStatus)} to ${getPrivateListingStatusLabel(validation.targetStatus)}.`,
    performedBy: normalizeUuid(options?.performedBy || user.id),
    visibility: 'internal',
    metadata: {
      previousStatus: validation.currentStatus,
      nextStatus: validation.targetStatus,
      override: Boolean(options?.allowOverride),
      blockers: transitionBlockers,
      ...metadata,
    },
  }).catch(() => {})

  return {
    listing: updatedListing,
    validation: {
      ...validation,
      blockers: transitionBlockers,
      allowed: validation.allowed && transitionBlockers.length === 0,
    },
    sideEffects,
  }
}

export async function activatePrivateListing(listingId) {
  const result = await transitionPrivateListingStatus(listingId, 'active', {
    allowOverride: false,
  })
  return result?.listing || null
}

export async function resolvePrivateListingContextForCurrentUser() {
  const client = requireClient()
  const user = await getCurrentUser(client)
  let organisationId = null
  try {
    const context = await fetchOrganisationSettings()
    organisationId = normalizeUuid(context?.organisation?.id)
  } catch {
    organisationId = null
  }
  return {
    userId: user.id,
    organisationId,
    dbFirstEnabled: Boolean(isSupabaseConfigured && !MOCK_DATA_ENABLED),
  }
}

export const PRIVATE_LISTING_CONSTANTS = {
  LISTING_STATUSES,
  LISTING_VISIBILITY,
  SELLER_ONBOARDING_STATUSES,
  MANDATE_STATUSES,
  LISTING_STATUS_GROUPS: PRIVATE_LISTING_LIFECYCLE.STATUS_GROUPS,
}
