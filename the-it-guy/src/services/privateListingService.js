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
import { DOCUMENTS_BUCKET_CANDIDATES, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
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

function normalizeUuidList(values = []) {
  const entries = Array.isArray(values) ? values : []
  const valid = new Set()
  const invalid = []
  for (const value of entries) {
    const normalized = normalizeUuid(value)
    if (normalized) {
      valid.add(normalized)
    } else {
      const raw = normalizeText(value)
      if (raw) invalid.push(raw)
    }
  }
  if (invalid.length) {
    console.debug('[Private Listings] Filtered non-UUID listing ids from batch lookup.', {
      invalidCount: invalid.length,
      invalidIds: invalid.slice(0, 10),
    })
  }
  return Array.from(valid)
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
  const status = Number(String(error.status || error.statusCode || 0))
  const text = String(message).toLowerCase()
  const tableNameHint = normalizeText(tableName).toLowerCase()
  return (
    code === '42p01' ||
    code === 'pgrst205' ||
    code === 'not_found' ||
    status === 404 ||
    (tableNameHint && (text.includes(tableNameHint) || text.includes('relation does not exist') || text.includes('could not find the table'))) ||
    text.includes('schema cache')
  )
}

const MISSING_PRIVATE_LISTING_TABLE_CACHE = new Set()

function getMissingTableCacheKey(tableName = '') {
  return normalizeText(tableName).toLowerCase()
}

function hasMissingTableCache(tableName = '') {
  const key = getMissingTableCacheKey(tableName)
  return key ? MISSING_PRIVATE_LISTING_TABLE_CACHE.has(key) : false
}

function rememberMissingTable(tableName = '') {
  const key = getMissingTableCacheKey(tableName)
  if (!key) return
  if (!MISSING_PRIVATE_LISTING_TABLE_CACHE.has(key)) {
    MISSING_PRIVATE_LISTING_TABLE_CACHE.add(key)
    console.warn('[Private Listings] table not present in project schema; skipping further read attempts for this session.', {
      tableName,
    })
  }
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
  const status = Number(String(error.status || error.statusCode || 0))
  const text = String(message).toLowerCase()
  const columnHint = String(columnName || '').toLowerCase()
  return (
    code === '42703' ||
    code === 'pgrst204' ||
    code === 'pgrst116' ||
    status === 400 && text.includes('column') && text.includes('does not exist') ||
    (columnHint && text.includes(columnHint) && text.includes('does not exist'))
  )
}

function isMissingRpcError(error, functionName = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = String(error.message || '').toLowerCase()
  return (
    code === '42883' ||
    code === 'pgrst202' ||
    (functionName && message.includes(String(functionName).toLowerCase()))
  )
}

function isMissingPrivateListingActivityError(error) {
  return isMissingTableError(error, 'private_listing_activity')
}

function isStorageBucketNotFoundError(error) {
  if (!error) return false
  const status = Number(error.status || error.statusCode || 0)
  const message = String(error.message || error.error || '').toLowerCase()
  return status === 404 || message.includes('bucket not found') || message.includes('not found')
}

async function uploadToPrivateListingDocumentsBucket(client, filePath, file, options = undefined) {
  let lastError = null
  for (const bucketName of DOCUMENTS_BUCKET_CANDIDATES) {
    const { error } = await client.storage.from(bucketName).upload(filePath, file, options)
    if (!error) return bucketName
    lastError = error
    if (isStorageBucketNotFoundError(error)) continue
    throw error
  }
  const error = new Error(
    `Storage bucket not found for seller document upload. Checked: ${DOCUMENTS_BUCKET_CANDIDATES.join(', ')}.`,
  )
  error.cause = lastError
  throw error
}

async function createPrivateListingDocumentSignedUrl(client, filePath, expiresInSeconds = 120) {
  if (!filePath) return ''
  for (const bucketName of DOCUMENTS_BUCKET_CANDIDATES) {
    const { data, error } = await client.storage.from(bucketName).createSignedUrl(filePath, expiresInSeconds)
    if (!error && data?.signedUrl) return data.signedUrl
    if (error && isStorageBucketNotFoundError(error)) continue
  }
  return ''
}

const PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS =
  'id, private_listing_id, requirement_key, requirement_name, requirement_description, requirement_group, applies_to, document_visibility, status, is_required, generated_from, created_at, updated_at'
const PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS_LEGACY =
  'id, private_listing_id, requirement_key, status, is_required, created_at, updated_at'
const PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS_MIN =
  'id, private_listing_id, requirement_key, status, is_required, created_at, updated_at'
const PRIVATE_LISTING_DOCUMENT_SELECT_FIELDS =
  'id, private_listing_id, requirement_id, document_type, document_name, storage_path, file_url, uploaded_by, status, visibility, uploaded_at, created_at, updated_at'
const PRIVATE_LISTING_DOCUMENT_SELECT_FIELDS_LEGACY =
  'id, private_listing_id, requirement_id, document_type, document_name, status, uploaded_at, created_at'
const PRIVATE_LISTING_DOCUMENT_SELECT_FIELDS_MIN =
  'id, private_listing_id, requirement_id, document_type, document_name, status, uploaded_at, created_at'
const PRIVATE_LISTING_REQUIREMENT_SELECT_VARIANTS = [
  PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS,
  PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS_LEGACY,
  PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS_MIN,
]
const PRIVATE_LISTING_DOCUMENT_SELECT_VARIANTS = [
  PRIVATE_LISTING_DOCUMENT_SELECT_FIELDS,
  PRIVATE_LISTING_DOCUMENT_SELECT_FIELDS_LEGACY,
  PRIVATE_LISTING_DOCUMENT_SELECT_FIELDS_MIN,
]
const PRIVATE_LISTING_SELECT_VARIANT_CACHE = new Map()
const PRIVATE_LISTING_SELECT_FAILURE_CACHE = new Map()

function getSelectFailureCacheKey(tableName = '') {
  return normalizeText(tableName).toLowerCase()
}

function setSelectFallbackState(tableName = '', state = {}) {
  const key = getSelectFailureCacheKey(tableName)
  if (!key) return
  const previous = PRIVATE_LISTING_SELECT_FAILURE_CACHE.get(key) || {}
  if (previous?.reason === state?.reason) return
  PRIVATE_LISTING_SELECT_FAILURE_CACHE.set(key, { ...state, updatedAt: Date.now() })
}

function getSelectFallbackState(tableName = '') {
  const key = getSelectFailureCacheKey(tableName)
  if (!key) return null
  return PRIVATE_LISTING_SELECT_FAILURE_CACHE.get(key) || null
}

function querySummary(error = {}) {
  if (!error?.message) return {}
  const message = normalizeText(error.message).toLowerCase()
  const columns = []
  const match = message.match(/column\s+"([^"]+)"/g)
  if (Array.isArray(match)) {
    for (const entry of match) {
      const normalized = normalizeText(entry.replace(/column\s+"([^"]+)"/i, '$1'))
      if (normalized) columns.push(normalized)
    }
  }
  const quotedMatches = message.match(/'([a-z0-9_]+)'/g)
  if (Array.isArray(quotedMatches)) {
    for (const entry of quotedMatches) {
      const normalized = normalizeText(entry.replace(/'/g, ''))
      if (normalized && !columns.includes(normalized)) columns.push(normalized)
    }
  }
  return {
    code: normalizeText(error.code),
    message: normalizeText(error.message),
    details: normalizeText(error.details),
    columns,
  }
}

async function runSelectWithFallback(buildQuery, selectVariants, tableName = '') {
  const failureState = getSelectFallbackState(tableName)
  if (failureState?.reason === 'missingTable') {
    return { missingTable: true, error: failureState.error || null }
  }
  if (failureState?.reason === 'schemaIncompatible') {
    return { schemaIncompatible: true, error: failureState.error || null }
  }

  let lastError = null
  let allErrorsWereColumnMissing = true
  const unique = []
  for (const candidate of Array.isArray(selectVariants) ? selectVariants : []) {
    const normalized = normalizeText(candidate)
    if (normalized && !unique.includes(normalized)) unique.push(normalized)
  }

  const tableKey = normalizeText(tableName).toLowerCase()
  const cachedVariant = tableKey ? normalizeText(PRIVATE_LISTING_SELECT_VARIANT_CACHE.get(tableKey) || '') : ''
  const orderedVariants = []

  if (cachedVariant && unique.includes(cachedVariant)) orderedVariants.push(cachedVariant)
  for (const candidate of unique) {
    if (candidate && candidate !== cachedVariant && !orderedVariants.includes(candidate)) {
      orderedVariants.push(candidate)
    }
  }

  for (const selectFields of orderedVariants) {
    const query = await buildQuery(selectFields)
    if (!query?.error) {
      if (tableKey && cachedVariant !== selectFields) PRIVATE_LISTING_SELECT_VARIANT_CACHE.set(tableKey, selectFields)
      return { data: query.data || [] }
    }
    lastError = query.error
    if (isMissingTableError(query.error, tableName)) {
      rememberMissingTable(tableName)
      setSelectFallbackState(tableName, { reason: 'missingTable', error: query.error })
      return { missingTable: true, error: query.error }
    }
    if (!isMissingColumnError(query.error)) {
      allErrorsWereColumnMissing = false
      return { error: query.error }
    }
  }
  if (allErrorsWereColumnMissing) {
    const summary = querySummary(lastError)
    setSelectFallbackState(tableName, {
      reason: 'schemaIncompatible',
      error: lastError,
      columns: summary.columns || [],
      message: summary.message,
    })
    return { schemaIncompatible: true, error: lastError || null }
  }
  return { error: lastError || null }
}

function normalizeRequirementRows(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  return list
    .map((row) => ({
      id: row?.id || null,
      private_listing_id: normalizeText(row?.private_listing_id || row?.privateListingId || ''),
      requirement_key: normalizeText(row?.requirement_key || row?.key || ''),
      requirement_name: normalizeText(row?.requirement_name || row?.name || row?.label || ''),
      requirement_description: normalizeText(row?.requirement_description || ''),
      requirement_group: normalizeText(row?.requirement_group || 'compliance'),
      applies_to: normalizeText(row?.applies_to || 'seller'),
      document_visibility: normalizeText(row?.document_visibility || row?.visibility || 'seller_visible'),
      status: normalizeText(row?.status || 'required'),
      is_required: row?.is_required !== false,
      generated_from: row?.generated_from && typeof row.generated_from === 'object' ? row.generated_from : {},
      created_at: row?.created_at || null,
      updated_at: row?.updated_at || row?.created_at || null,
    }))
    .filter((row) => row.private_listing_id && row.requirement_key)
}

function normalizeDocumentRows(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  return list
    .map((row) => ({
      id: row?.id || null,
      private_listing_id: normalizeText(row?.private_listing_id || row?.privateListingId || ''),
      requirement_id: normalizeText(row?.requirement_id || ''),
      document_type: normalizeText(row?.document_type || row?.documentType || ''),
      document_name: normalizeText(row?.document_name || row?.file_name || ''),
      storage_path: normalizeText(row?.storage_path || ''),
      file_url: normalizeText(row?.file_url || ''),
      uploaded_by: normalizeText(row?.uploaded_by || ''),
      status: normalizeText(row?.status || 'uploaded'),
      visibility: normalizeText(row?.visibility || row?.document_visibility || 'seller_visible'),
      uploaded_at: normalizeText(row?.uploaded_at || ''),
      created_at: row?.created_at || null,
      updated_at: row?.updated_at || row?.created_at || null,
    }))
    .filter((row) => row.private_listing_id)
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

function mapSellerClientPortalPayload(payload) {
  const listingRow = payload?.listing && typeof payload.listing === 'object' ? payload.listing : null
  const onboardingRow = payload?.onboarding && typeof payload.onboarding === 'object' ? payload.onboarding : null
  if (!listingRow?.id || !onboardingRow?.private_listing_id) return null
  const onboardingMap = new Map([[String(onboardingRow.private_listing_id), onboardingRow]])
  const requirements = normalizeRequirementRows(Array.isArray(payload?.requirements) ? payload.requirements : [])
  const documents = normalizeDocumentRows(Array.isArray(payload?.documents) ? payload.documents : [])
  return {
    onboarding: onboardingRow,
    listing: mapPrivateListingRow(
      listingRow,
      onboardingMap,
      new Map([[String(listingRow.id), requirements]]),
      new Map([[String(listingRow.id), documents]]),
    ),
  }
}

async function fetchSellerClientPortalPayloadByToken(client, token) {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) return null
  const rpc = await client.rpc('bridge_private_listing_seller_portal_payload', {
    p_token: normalizedToken,
  })
  if (rpc.error) {
    if (isMissingRpcError(rpc.error, 'bridge_private_listing_seller_portal_payload')) return null
    throw rpc.error
  }
  return mapSellerClientPortalPayload(rpc.data)
}

function getSellerClientPortalEmail(listing = {}, onboarding = {}, formData = {}) {
  const onboardingFormData = onboarding?.form_data && typeof onboarding.form_data === 'object' ? onboarding.form_data : {}
  const listingFormData =
    listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
      ? listing.sellerOnboarding.formData
      : {}
  return normalizeText(
    formData.sellerEmail ||
      formData.email ||
      formData.contactEmail ||
      onboardingFormData.sellerEmail ||
      onboardingFormData.email ||
      onboardingFormData.contactEmail ||
      listingFormData.sellerEmail ||
      listingFormData.email ||
      listingFormData.contactEmail ||
      listing?.seller?.email,
  ).toLowerCase()
}

function buildSellerClientPortalContextPayload({ listing = {}, onboarding = {}, formData = {}, status = 'active' } = {}) {
  const token = normalizeText(onboarding?.token || listing?.sellerOnboarding?.token)
  const listingId = normalizeText(listing?.id)
  if (!token || !listingId) return null

  const sellerLeadId = normalizeUuid(listing?.sellerLeadId || listing?.seller_lead_id) ||
    normalizeUuid(listing?.originatingCrmLeadId || listing?.originating_crm_lead_id)

  return {
    organisation_id: normalizeUuid(listing?.organisationId || listing?.organisation_id),
    client_email: getSellerClientPortalEmail(listing, onboarding, formData) || null,
    client_contact_id: null,
    context_type: 'selling',
    transaction_id: null,
    seller_lead_id: sellerLeadId,
    listing_id: listingId,
    mandate_packet_id: null,
    seller_workspace_token: token,
    status: normalizeNullableText(status) || 'active',
    updated_at: new Date().toISOString(),
  }
}

async function ensureSellerClientPortalContext(client, { listing = {}, onboarding = {}, formData = {}, status = 'active' } = {}) {
  const payload = buildSellerClientPortalContextPayload({ listing, onboarding, formData, status })
  if (!payload) return null

  const existing = await client
    .from('client_portal_contexts')
    .select('id')
    .eq('seller_workspace_token', payload.seller_workspace_token)
    .maybeSingle()
  if (existing.error) throw existing.error

  const mutation = existing.data?.id
    ? client
        .from('client_portal_contexts')
        .update(payload)
        .eq('id', existing.data.id)
        .select('id')
        .maybeSingle()
    : client
        .from('client_portal_contexts')
        .insert(payload)
        .select('id')
        .maybeSingle()

  const result = await mutation
  if (result.error) throw result.error
  return result.data || null
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
  const ids = normalizeUuidList(listingIds)
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
  if (hasMissingTableCache('private_listing_document_requirements')) return new Map()
  const reqState = getSelectFallbackState('private_listing_document_requirements')
  if (reqState?.reason === 'schemaIncompatible') return new Map()
  const ids = normalizeUuidList(listingIds)
  if (!ids.length) return new Map()
  const query = await runSelectWithFallback(
    (selectFields) => client
      .from('private_listing_document_requirements')
      .select(selectFields)
      .in('private_listing_id', ids)
      .order('created_at', { ascending: true }),
    PRIVATE_LISTING_REQUIREMENT_SELECT_VARIANTS,
    'private_listing_document_requirements',
  )
  if (query.missingTable) {
    rememberMissingTable('private_listing_document_requirements')
    return new Map()
  }
  if (query.schemaIncompatible) return new Map()
  if (query.error) throw query.error

  const rows = normalizeRequirementRows(query.data)
  const map = new Map()
  for (const row of rows) {
    const listingId = String(row.private_listing_id || '')
    if (!listingId) continue
    const existing = map.get(listingId) || []
    existing.push(row)
    map.set(listingId, existing)
  }
  return map
}

async function fetchDocumentRowsForListings(client, listingIds = []) {
  if (hasMissingTableCache('private_listing_documents')) return new Map()
  const docState = getSelectFallbackState('private_listing_documents')
  if (docState?.reason === 'schemaIncompatible') return new Map()
  const ids = normalizeUuidList(listingIds)
  if (!ids.length) return new Map()
  const query = await runSelectWithFallback(
    (selectFields) => client
      .from('private_listing_documents')
      .select(selectFields)
      .in('private_listing_id', ids)
      .order('uploaded_at', { ascending: false }),
    PRIVATE_LISTING_DOCUMENT_SELECT_VARIANTS,
    'private_listing_documents',
  )
  if (query.missingTable) {
    rememberMissingTable('private_listing_documents')
    return new Map()
  }
  if (query.schemaIncompatible) return new Map()
  if (query.error) throw query.error

  const rows = normalizeDocumentRows(query.data)
  const map = new Map()
  for (const row of rows) {
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

export async function createPrivateListing(payload = {}, options = {}) {
  const client = requireClient()
  const user = await getCurrentUser(client)
  const includeRequirementsAndDocuments = options?.includeRequirementsAndDocuments !== false
  const skipRequirementSync = options?.syncRequirements === false

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
        includeRequirementsAndDocuments ? fetchRequirementRowsForListings(client, [existingQuery.data.id]) : Promise.resolve(new Map()),
        includeRequirementsAndDocuments ? fetchDocumentRowsForListings(client, [existingQuery.data.id]) : Promise.resolve(new Map()),
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
    includeRequirementsAndDocuments ? fetchRequirementRowsForListings(client, [insert.data.id]) : Promise.resolve(new Map()),
    includeRequirementsAndDocuments ? fetchDocumentRowsForListings(client, [insert.data.id]) : Promise.resolve(new Map()),
  ])
  const listing = mapPrivateListingRow(insert.data, onboardingMap, requirementsMap, documentsMap)

  const requirementSync = (skipRequirementSync || !includeRequirementsAndDocuments)
    ? null
    : await syncPrivateListingRequirements(listing.id, {
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

export async function updatePrivateListing(listingId, payload = {}, options = {}) {
  const client = requireClient()
  const normalizedId = normalizeText(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const includeRequirementsAndDocuments = options?.includeRequirementsAndDocuments !== false

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
    includeRequirementsAndDocuments ? fetchRequirementRowsForListings(client, [normalizedId]) : Promise.resolve(new Map()),
    includeRequirementsAndDocuments ? fetchDocumentRowsForListings(client, [normalizedId]) : Promise.resolve(new Map()),
  ])
  return mapPrivateListingRow(updateQuery.data, onboardingMap, requirementsMap, documentsMap)
}

export async function getPrivateListing(listingId, options = {}) {
  return getPrivateListingById(listingId, options)
}

async function getPrivateListingById(listingId, { includeRequirementsAndDocuments = true } = {}) {
  const client = requireClient()
  const normalizedId = normalizeUuid(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const query = await client.from('private_listings').select('*').eq('id', normalizedId).maybeSingle()
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listings')) return null
    throw query.error
  }
  if (!query.data) return null
  const [onboardingMap, requirementsMap, documentsMap] = await Promise.all([
    fetchOnboardingRowsForListings(client, [query.data.id]),
    includeRequirementsAndDocuments ? fetchRequirementRowsForListings(client, [query.data.id]) : Promise.resolve(new Map()),
    includeRequirementsAndDocuments ? fetchDocumentRowsForListings(client, [query.data.id]) : Promise.resolve(new Map()),
  ])
  return mapPrivateListingRow(query.data, onboardingMap, requirementsMap, documentsMap)
}

export async function getOrganisationPrivateListings(organisationId, options = {}) {
  const includeRequirementsAndDocuments = options?.includeRequirementsAndDocuments !== false
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
    includeRequirementsAndDocuments ? fetchRequirementRowsForListings(client, listingIds) : Promise.resolve(new Map()),
    includeRequirementsAndDocuments ? fetchDocumentRowsForListings(client, listingIds) : Promise.resolve(new Map()),
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
  if (hasMissingTableCache('private_listing_activity')) return null
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
    if (isMissingTableError(insert.error, 'private_listing_activity')) {
      rememberMissingTable('private_listing_activity')
      return null
    }
    throw insert.error
  }
  return insert.data
}

export async function getPrivateListingActivity(listingId) {
  const client = requireClient()
  if (hasMissingTableCache('private_listing_activity')) return []
  const normalizedId = normalizeUuid(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const query = await client
    .from('private_listing_activity')
    .select('id, private_listing_id, activity_type, activity_title, activity_description, performed_by, visibility, metadata, created_at')
    .eq('private_listing_id', normalizedId)
    .order('created_at', { ascending: false })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listing_activity')) {
      rememberMissingTable('private_listing_activity')
      return []
    }
    throw query.error
  }
  return query.data || []
}

export async function getPrivateListingDocumentRequirements(listingId) {
  const client = requireClient()
  if (hasMissingTableCache('private_listing_document_requirements')) return []
  const reqState = getSelectFallbackState('private_listing_document_requirements')
  if (reqState?.reason === 'schemaIncompatible') return []
  const normalizedId = normalizeUuid(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const query = await runSelectWithFallback(
    (selectFields) => client
      .from('private_listing_document_requirements')
      .select(selectFields)
      .eq('private_listing_id', normalizedId)
      .order('created_at', { ascending: true }),
    PRIVATE_LISTING_REQUIREMENT_SELECT_VARIANTS,
    'private_listing_document_requirements',
  )
  if (query.missingTable) {
    rememberMissingTable('private_listing_document_requirements')
    return []
  }
  if (query.schemaIncompatible) return []
  if (query.error) {
    if (!isMissingColumnError(query.error)) throw query.error
    return []
  }
  return normalizeRequirementRows(query.data)
}

export async function getPrivateListingDocuments(listingId) {
  const client = requireClient()
  if (hasMissingTableCache('private_listing_documents')) return []
  const docState = getSelectFallbackState('private_listing_documents')
  if (docState?.reason === 'schemaIncompatible') return []
  const normalizedId = normalizeUuid(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const query = await runSelectWithFallback(
    (selectFields) => client
      .from('private_listing_documents')
      .select(selectFields)
      .eq('private_listing_id', normalizedId)
      .order('uploaded_at', { ascending: false }),
    PRIVATE_LISTING_DOCUMENT_SELECT_VARIANTS,
    'private_listing_documents',
  )
  if (query.missingTable) {
    rememberMissingTable('private_listing_documents')
    return []
  }
  if (query.schemaIncompatible) return []
  if (query.error) {
    if (!isMissingColumnError(query.error)) throw query.error
    return []
  }
  return normalizeDocumentRows(query.data)
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

function stripUnsupportedLeadSyncColumns(payload = {}, error = null) {
  const nextPayload = { ...(payload || {}) }
  const summary = querySummary(error)
  const message = normalizeText(error?.message).toLowerCase()
  const candidateColumns = [
    'seller_onboarding_status',
    'seller_onboarding_token',
    'listing_id',
    'mandate_packet_id',
  ]
  let removedAny = false

  for (const columnName of candidateColumns) {
    if (!(columnName in nextPayload)) continue
    const mentionedInSummary = Array.isArray(summary.columns) && summary.columns.includes(columnName)
    const missingColumn =
      mentionedInSummary ||
      isMissingColumnError(error, columnName) ||
      (message.includes(columnName) && message.includes('column'))
    if (!missingColumn) continue
    delete nextPayload[columnName]
    removedAny = true
  }

  if (!removedAny && isMissingColumnError(error)) {
    for (const columnName of candidateColumns) {
      delete nextPayload[columnName]
    }
    removedAny = true
  }

  return removedAny ? nextPayload : null
}

async function updateLeadRowsWithFallback(client, buildScopedQuery, payload = {}, options = {}) {
  const label = normalizeText(options?.label || 'unknown')
  let nextPayload = { ...(payload || {}) }

  while (true) {
    const result = await buildScopedQuery(client.from('leads'))
      .update(nextPayload)
      .select('lead_id')
      .maybeSingle()

    if (!result.error) {
      return { matched: Boolean(result.data), payload: nextPayload }
    }

    const trimmedPayload = stripUnsupportedLeadSyncColumns(nextPayload, result.error)
    if (
      trimmedPayload &&
      Object.keys(trimmedPayload).length &&
      JSON.stringify(trimmedPayload) !== JSON.stringify(nextPayload)
    ) {
      nextPayload = trimmedPayload
      continue
    }

    if (!isMissingTableError(result.error, 'leads')) {
      console.warn('[Private Listings] seller workflow lead sync failed', {
        mode: label,
        error: result.error,
      })
    }
    return { matched: false, error: result.error, payload: nextPayload }
  }
}

async function syncLeadWorkflowState(
  client,
  {
    organisationId = '',
    leadIds = [],
    onboardingToken = '',
    listingId = '',
    payload = {},
  } = {},
) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(normalizedOrganisationId)) return false

  const normalizedLeadIds = Array.from(new Set(
    (Array.isArray(leadIds) ? leadIds : [])
      .map((value) => normalizeUuid(normalizeText(value).replace(/^lead_/i, '')))
      .filter(Boolean),
  ))
  const normalizedToken = normalizeText(onboardingToken)
  const normalizedListingId = normalizeText(listingId)

  for (const leadId of normalizedLeadIds) {
    const result = await updateLeadRowsWithFallback(
      client,
      (query) => query.eq('organisation_id', normalizedOrganisationId).eq('lead_id', leadId),
      payload,
      { label: `lead_id:${leadId}` },
    )
    if (result.matched) return true
  }

  if (normalizedToken) {
    const result = await updateLeadRowsWithFallback(
      client,
      (query) => query.eq('organisation_id', normalizedOrganisationId).eq('seller_onboarding_token', normalizedToken),
      payload,
      { label: `seller_onboarding_token:${normalizedToken}` },
    )
    if (result.matched) return true
  }

  if (normalizedListingId) {
    const result = await updateLeadRowsWithFallback(
      client,
      (query) => query.eq('organisation_id', normalizedOrganisationId).eq('listing_id', normalizedListingId),
      payload,
      { label: `listing_id:${normalizedListingId}` },
    )
    if (result.matched) return true
  }

  return false
}

export async function syncPrivateListingRequirements(listingOrId, { emitActivity = true, reason = 'system' } = {}) {
  const client = requireClient()
  const listing =
    typeof listingOrId === 'object' && listingOrId
      ? listingOrId
      : await getPrivateListing(listingOrId)

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
    const runUpsert = await runSelectWithFallback(
      (selectFields) => client
        .from('private_listing_document_requirements')
        .upsert(payload, { onConflict: 'private_listing_id,requirement_key' })
        .select(selectFields),
      PRIVATE_LISTING_REQUIREMENT_SELECT_VARIANTS,
      'private_listing_document_requirements',
    )
    if (runUpsert.missingTable) {
      if (!emitActivity) return {
        listing: hydrateListingWithRequirementData(listing, [], []),
        requirementProfile: null,
        requirements: [],
        readinessSummary: getListingReadinessSummary({
          ...listing,
          documentRequirements: [],
          documents: [],
        }),
      }
    }
    if (runUpsert.error && !isMissingColumnError(runUpsert.error) && !isMissingTableError(runUpsert.error, 'private_listing_document_requirements')) {
      throw runUpsert.error
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
  const listing = await getPrivateListing(listingId, { includeRequirementsAndDocuments: false })
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
      const errorSummary = buildSupabaseErrorSummary(upsert.error)
      throw new Error(
        `Seller onboarding table is unavailable to this API context. ` +
        `Run sql/20260509_private_listing_foundation.sql on the same Supabase project as this app and reload schema. ` +
        `(${errorSummary})`,
      )
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
      includeRequirementsAndDocuments: false,
    })
  }

  const leadOrganisationId = normalizeText(listing?.organisationId)
  const leadIdsToSync = Array.from(new Set([
    normalizeText(listing?.sellerLeadId),
    normalizeText(listing?.originatingCrmLeadId),
  ].filter(Boolean)))
  const sentAtIso = new Date().toISOString()
  await syncLeadWorkflowState(client, {
    organisationId: leadOrganisationId,
    leadIds: leadIdsToSync,
    onboardingToken: token,
    listingId: listing.id,
    payload: {
      stage: 'Onboarding Sent',
      status: 'Onboarding Sent',
      seller_onboarding_status: 'sent',
      seller_onboarding_token: normalizeNullableText(token),
      listing_id: listing.id,
      updated_at: sentAtIso,
    },
  }).catch(() => false)

  return {
    onboarding: upsert.data,
    token,
    link: buildSellerOnboardingLink(token),
    expiresAt,
  }
}

export async function getSellerOnboardingByToken(token, options = {}) {
  const includeRequirementsAndDocuments = options?.includeRequirementsAndDocuments !== false
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Onboarding token is required.')

  const portalPayload = await fetchSellerClientPortalPayloadByToken(client, normalizedToken)
  if (portalPayload?.listing) return portalPayload

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
  const listing = await getPrivateListingById(query.data.private_listing_id, {
    includeRequirementsAndDocuments,
  })
  return {
    onboarding: query.data,
    listing,
  }
}

export async function submitSellerOnboarding(token, payload = {}) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Onboarding token is required.')

  const rpc = await client.rpc('bridge_complete_private_listing_seller_onboarding', {
    p_token: normalizedToken,
    p_form_data: payload.formData && typeof payload.formData === 'object' ? payload.formData : {},
    p_seller_type: normalizeNullableText(payload.sellerType),
    p_ownership_structure: normalizeNullableText(payload.ownershipStructure),
    p_marital_regime: normalizeNullableText(payload.maritalRegime),
  })
  const useClientFallback =
    rpc.error &&
    (isMissingRpcError(rpc.error, 'bridge_complete_private_listing_seller_onboarding') ||
      isMissingPrivateListingActivityError(rpc.error))
  if (rpc.error && !useClientFallback) {
    throw rpc.error
  }
  if (!rpc.error) {
    const rpcContext = mapSellerClientPortalPayload(rpc.data)
    if (!rpcContext?.listing) {
      throw new Error('Seller onboarding link is invalid or inactive.')
    }
    await ensureSellerClientPortalContext(client, {
      listing: rpcContext.listing,
      onboarding: rpcContext.onboarding,
      formData: payload.formData,
    }).catch((contextError) => {
      console.warn('[Private Listings] seller client portal context sync skipped after onboarding submit', contextError)
      return null
    })
    return rpcContext
  }
  if (isMissingPrivateListingActivityError(rpc.error)) {
    console.warn('[Private Listings] seller onboarding RPC activity table missing; using client fallback', rpc.error)
  }

  const context = await getSellerOnboardingByToken(token, { includeRequirementsAndDocuments: false })
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

  const fallbackListing = {
    ...context.listing,
    listingStatus:
      context.listing.listingStatus === 'seller_lead' || context.listing.listingStatus === 'onboarding_sent'
        ? 'onboarding_completed'
        : context.listing.listingStatus,
    sellerType: sellerTypeFromPayload || context.listing.sellerType,
    sellerOnboardingStatus: 'completed',
    sellerOnboarding: {
      ...(context.listing.sellerOnboarding || {}),
      status: 'completed',
      submittedAt: nowIso,
      completedAt: nowIso,
      currentStep: Number(nextFormData.currentStep || 3),
      formData: nextFormData,
    },
  }

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
    includeRequirementsAndDocuments: false,
  }).catch((transitionError) => {
    console.warn('[Private Listings] listing status transition skipped after seller onboarding submit', transitionError)
    return null
  })

  void syncPrivateListingRequirements(transitionResult?.listing?.id || context.listing.id, {
    emitActivity: true,
    reason: 'onboarding_completed',
  }).catch((requirementsError) => {
    console.error('[Private Listings] seller requirements sync failed after onboarding submit', requirementsError)
  })
  const leadOrganisationId = normalizeText(context.listing?.organisationId)
  const rawLeadIds = [
    normalizeText(context.listing?.sellerLeadId),
    normalizeText(context.listing?.originatingCrmLeadId),
  ]
  const listingIdForLeadSync = normalizeText(context.listing?.id)
  const leadTokenForLeadSync = normalizeText(context.onboarding?.token || context.listing?.sellerOnboarding?.token)
  const leadIdsToSync = new Set(rawLeadIds.filter(Boolean))
  for (const rawLeadId of rawLeadIds) {
    if (isUuidLike(rawLeadId)) continue
    const normalizedLeadId = normalizeUuid(rawLeadId)
    if (normalizedLeadId) leadIdsToSync.add(normalizedLeadId)
  }

  const buildLeadSyncPayload = () => ({
    stage: 'Onboarding Completed',
    status: 'Onboarding Completed',
    seller_onboarding_status: 'completed',
    seller_onboarding_token: normalizeNullableText(context.onboarding?.token || context.listing?.sellerOnboarding?.token || ''),
    listing_id: listingIdForLeadSync || null,
    updated_at: nowIso,
  })
  await syncLeadWorkflowState(client, {
    organisationId: leadOrganisationId,
    leadIds: Array.from(leadIdsToSync),
    onboardingToken: leadTokenForLeadSync,
    listingId: listingIdForLeadSync,
    payload: buildLeadSyncPayload(),
  }).catch(() => false)

  const listingForContext = transitionResult?.listing || fallbackListing
  await ensureSellerClientPortalContext(client, {
    listing: listingForContext,
    onboarding: updateOnboarding.data,
    formData: nextFormData,
  }).catch((contextError) => {
    console.warn('[Private Listings] seller client portal context sync skipped after onboarding fallback submit', contextError)
    return null
  })

  return {
    onboarding: updateOnboarding.data,
    listing: listingForContext,
  }
}

export async function updateSellerOnboardingProgress(token, payload = {}) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Onboarding token is required.')

  const rpc = await client.rpc('bridge_update_private_listing_seller_onboarding_progress', {
    p_token: normalizedToken,
    p_status: normalizeStatus(payload.status || 'in_progress', SELLER_ONBOARDING_STATUSES, 'in_progress'),
    p_form_data: {
      ...(payload.formData && typeof payload.formData === 'object' ? payload.formData : {}),
      ...(payload.currentStep !== undefined ? { currentStep: Number(payload.currentStep || 0) } : {}),
    },
    p_seller_type: normalizeNullableText(payload.sellerType),
    p_ownership_structure: normalizeNullableText(payload.ownershipStructure),
    p_marital_regime: normalizeNullableText(payload.maritalRegime),
  })
  if (rpc.error && !isMissingRpcError(rpc.error, 'bridge_update_private_listing_seller_onboarding_progress')) {
    throw rpc.error
  }
  if (!rpc.error) {
    const rpcContext = mapSellerClientPortalPayload(rpc.data)
    if (!rpcContext?.listing) {
      throw new Error('Seller onboarding link is invalid or inactive.')
    }
    return rpcContext
  }

  const context = await getSellerOnboardingByToken(token, { includeRequirementsAndDocuments: false })
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
    await updatePrivateListing(
      context.listing.id,
      {
        sellerOnboardingStatus: 'in_progress',
        listingStatus: context.listing.listingStatus === 'seller_lead' ? 'onboarding_sent' : context.listing.listingStatus,
      },
      { includeRequirementsAndDocuments: false },
    ).catch(() => {})
  }

  return {
    onboarding: updateQuery.data,
    listing: await getPrivateListing(context.listing.id, { includeRequirementsAndDocuments: false }),
  }
}

export async function validatePrivateListingTransition(listingId, targetStatus, options = {}) {
  const includeRequirementsAndDocuments = options?.includeRequirementsAndDocuments !== false
  const listing = await getPrivateListing(listingId, { includeRequirementsAndDocuments })
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

  const query = await runSelectWithFallback(
    (selectFields) => client
      .from('private_listing_document_requirements')
      .update(patch)
      .eq('id', normalizedRequirementId)
      .select(selectFields)
      .single(),
    PRIVATE_LISTING_REQUIREMENT_SELECT_VARIANTS,
    'private_listing_document_requirements',
  )
  if (query.error && !isMissingColumnError(query.error) && !isMissingTableError(query.error, 'private_listing_document_requirements')) {
    throw query.error
  }
  const rows = normalizeRequirementRows(Array.isArray(query.data) ? query.data : query.data ? [query.data] : [])
  return rows[0] || null
}

export async function uploadSellerClientPortalDocument({
  token,
  file,
  requirementKey = '',
  documentType = '',
  category = 'Seller Document',
} = {}) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Seller client portal token is required.')
  if (!file) throw new Error('A file is required.')

  const context = await getSellerOnboardingByToken(normalizedToken, { includeRequirementsAndDocuments: true })
  const listing = context?.listing || null
  if (!listing?.id) throw new Error('Seller client portal link is invalid or inactive.')

  const normalizedRequirementKey = normalizeText(requirementKey)
  const requiredDocuments = Array.isArray(listing.documentRequirements) ? listing.documentRequirements : []
  const matchedRequirement = normalizedRequirementKey
    ? requiredDocuments.find((item) => normalizeKey(item?.requirement_key || item?.key) === normalizeKey(normalizedRequirementKey)) || null
    : null
  const normalizedDocumentType =
    normalizeText(documentType) ||
    normalizeText(matchedRequirement?.requirement_key || matchedRequirement?.key) ||
    normalizeText(category) ||
    'seller_document'

  const safeOriginalName = normalizeText(file.name || 'seller-document')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 140) || 'seller-document'
  const timestamp = Date.now()
  const filePath = `seller-portal/${listing.id}/${timestamp}-${safeOriginalName}`

  await uploadToPrivateListingDocumentsBucket(client, filePath, file, {
    upsert: false,
    contentType: file.type || undefined,
  })

  const rpc = await client.rpc('bridge_upload_private_listing_seller_document', {
    p_token: normalizedToken,
    p_requirement_key: normalizedRequirementKey || null,
    p_document_name: file.name || safeOriginalName,
    p_storage_path: filePath,
    p_file_url: null,
    p_document_type: normalizedDocumentType,
  })

  if (rpc.error && !isMissingRpcError(rpc.error, 'bridge_upload_private_listing_seller_document')) {
    throw rpc.error
  }

  let documentRow = null
  if (!rpc.error) {
    documentRow = rpc.data?.document && typeof rpc.data.document === 'object'
      ? normalizeDocumentRows([rpc.data.document])[0] || null
      : null
  }

  if (!documentRow) {
    const insertPayload = {
      private_listing_id: listing.id,
      requirement_id: matchedRequirement?.id || null,
      document_type: normalizedDocumentType,
      document_name: file.name || safeOriginalName,
      storage_path: filePath,
      file_url: null,
      uploaded_by: null,
      status: 'uploaded',
      visibility: 'seller_visible',
      uploaded_at: new Date().toISOString(),
    }
    const inserted = await runSelectWithFallback(
      (selectFields) => client
        .from('private_listing_documents')
        .insert(insertPayload)
        .select(selectFields)
        .single(),
      PRIVATE_LISTING_DOCUMENT_SELECT_VARIANTS,
      'private_listing_documents',
    )
    if (inserted.error && !isMissingColumnError(inserted.error) && !isMissingTableError(inserted.error, 'private_listing_documents')) {
      throw inserted.error
    }
    documentRow = normalizeDocumentRows(inserted.data ? [inserted.data] : [insertPayload])[0] || null

    if (matchedRequirement?.id) {
      await updatePrivateListingRequirementStatus(matchedRequirement.id, 'uploaded').catch(() => null)
    }
  }

  return {
    id: documentRow?.id || filePath,
    name: documentRow?.document_name || file.name || safeOriginalName,
    document_name: documentRow?.document_name || file.name || safeOriginalName,
    document_type: documentRow?.document_type || normalizedDocumentType,
    category: category || 'Seller Document',
    status: documentRow?.status || 'uploaded',
    file_path: documentRow?.storage_path || filePath,
    storage_path: documentRow?.storage_path || filePath,
    visibility: documentRow?.visibility || 'seller_visible',
    created_at: documentRow?.created_at || documentRow?.uploaded_at || new Date().toISOString(),
    uploaded_at: documentRow?.uploaded_at || new Date().toISOString(),
    url: await createPrivateListingDocumentSignedUrl(client, documentRow?.storage_path || filePath),
    privateListingId: listing.id,
    requirementId: documentRow?.requirement_id || matchedRequirement?.id || null,
    requirementKey: normalizedRequirementKey || matchedRequirement?.requirement_key || null,
  }
}

export async function createSellerClientPortalDocumentSignedUrl({
  token,
  filePath,
  expiresInSeconds = 60,
} = {}) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  const normalizedFilePath = normalizeText(filePath)
  if (!normalizedToken) throw new Error('Seller client portal token is required.')
  if (!normalizedFilePath) throw new Error('Document path is required.')

  const context = await getSellerOnboardingByToken(normalizedToken, { includeRequirementsAndDocuments: false })
  if (!context?.listing?.id) throw new Error('Seller client portal link is invalid or inactive.')
  const listingPathPrefix = `seller-portal/${context.listing.id}/`
  if (!normalizedFilePath.startsWith(listingPathPrefix)) {
    throw new Error('This document is not available in this client portal.')
  }

  const signedUrl = await createPrivateListingDocumentSignedUrl(client, normalizedFilePath, expiresInSeconds)
  if (!signedUrl) throw new Error('Unable to open this document right now.')
  return signedUrl
}

export async function transitionPrivateListingStatus(listingId, targetStatus, options = {}) {
  const client = requireClient()
  const user = await getCurrentUser(client)
  const validation = await validatePrivateListingTransition(listingId, targetStatus, options)
  const metadata = options?.metadata && typeof options.metadata === 'object' ? options.metadata : {}
  const transitionBlockers = [...validation.blockers]
  const includeRequirementsAndDocuments = options?.includeRequirementsAndDocuments !== false

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
  }, { includeRequirementsAndDocuments })

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
