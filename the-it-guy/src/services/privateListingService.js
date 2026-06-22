import { MOCK_DATA_ENABLED } from '../lib/mockData'
import { buildSellerClientPortalLink, buildSellerOnboardingLink, generateSellerOnboardingToken } from '../lib/agentListingStorage'
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
import { syncCanonicalToPrivateListingRequirements } from './documents/canonicalDocumentAdapterService'
import { linkUploadedDocumentToRequirement } from './documents/canonicalDocumentLifecycleService'
import { resolveRequirements } from './documents/canonicalDocumentResolverService'
import { canAdvanceWorkflowStage } from './documents/canonicalWorkflowGateService'
import {
  calculateSellerFactReadiness,
  buildCanonicalSellerOnboardingPayload,
  buildSellerResolverInputFromFacts,
  validateSellerOnboardingFacts,
} from './documents/sellerOnboardingFactTransformer'
import { buildSellerOnboardingPublicationDraft, mergePublicationDraft } from './sellerListingPublicationMapper'
import { areSellerJourneyDocumentsSubmitted, buildSellerJourneyProgressPatch } from './sellerJourneyService.js'

const LISTING_STATUSES = PRIVATE_LISTING_LIFECYCLE.STATUSES

const LISTING_VISIBILITY = ['internal', 'active_market', 'archived']
const SELLER_ONBOARDING_STATUSES = ['not_started', 'sent', 'in_progress', 'completed', 'rejected']
const MANDATE_STATUSES = ['not_started', 'ready', 'generated', 'sent', 'viewed', 'signed', 'rejected', 'expired']
const DELETED_LISTING_STATUSES = new Set(['withdrawn', 'deleted', 'archived'])
const DELETED_LISTING_VISIBILITIES = new Set(['archived', 'deleted'])
const CANONICAL_ONBOARDING_RESOLVER_FLAG = 'VITE_CANONICAL_ONBOARDING_RESOLVER_ENABLED'
const SELLER_PORTAL_ACCESS_STORAGE_PREFIX = 'bridge:seller-portal-access:'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function getSellerPortalAccessStorageKey(token = '') {
  const normalizedToken = normalizeText(token)
  return normalizedToken ? `${SELLER_PORTAL_ACCESS_STORAGE_PREFIX}${normalizedToken}` : ''
}

export function getStoredSellerPortalAccessToken(token = '') {
  if (typeof window === 'undefined' || !window.localStorage) return ''
  const storageKey = getSellerPortalAccessStorageKey(token)
  if (!storageKey) return ''

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
    const accessToken = normalizeText(parsed?.accessToken)
    const expiresAt = normalizeText(parsed?.expiresAt)
    if (!accessToken) return ''
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(storageKey)
      return ''
    }
    return accessToken
  } catch {
    window.localStorage.removeItem(storageKey)
    return ''
  }
}

export function storeSellerPortalAccessToken(token = '', session = {}) {
  if (typeof window === 'undefined' || !window.localStorage) return ''
  const storageKey = getSellerPortalAccessStorageKey(token)
  const accessToken = normalizeText(session?.accessToken)
  if (!storageKey || !accessToken) return ''

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      accessToken,
      expiresAt: normalizeText(session?.expiresAt),
    }))
  } catch {
    return ''
  }

  return accessToken
}

export function clearSellerPortalAccessToken(token = '') {
  if (typeof window === 'undefined' || !window.localStorage) return
  const storageKey = getSellerPortalAccessStorageKey(token)
  if (!storageKey) return
  window.localStorage.removeItem(storageKey)
}

function buildSellerPortalAuthRequiredError(portalAuth = {}) {
  const passwordSet = Boolean(portalAuth?.passwordSet)
  const error = new Error(passwordSet ? 'Enter your seller portal password.' : 'Set a password to open your seller portal.')
  error.code = 'seller_portal_auth_required'
  error.portalAuth = portalAuth && typeof portalAuth === 'object' ? portalAuth : {}
  return error
}

export function isSellerPortalAuthRequiredError(error = null) {
  return Boolean(error?.code === 'seller_portal_auth_required' || error?.portalAuth?.authRequired)
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeCompatibilityKey(value) {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function isTruthyFlag(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalizeKey(value))
}

function isCanonicalOnboardingResolverEnabled(options = {}) {
  if (typeof options.enabled === 'boolean') return options.enabled
  if (typeof options.force === 'boolean' && options.force) return true
  return isTruthyFlag(import.meta.env?.[CANONICAL_ONBOARDING_RESOLVER_FLAG])
}

const RAW_SELLER_ONBOARDING_KEYS = new Set([
  'sellerFirstName',
  'sellerSurname',
  'email',
  'phone',
  'idNumber',
  'residentialAddress',
  'sellerTaxNumber',
  'vatRegistered',
  'vatNumber',
  'ownershipType',
  'sellerLegalType',
  'maritalStatus',
  'maritalRegime',
  'spouseName',
  'spouseIdNumber',
  'companyName',
  'companyRegistrationNumber',
  'companyDirectors',
  'companyDirectorName',
  'companyDirectorEmail',
  'companyDirectorPhone',
  'trustName',
  'trustRegistrationNumber',
  'trustees',
  'trustBeneficiaries',
  'trusteeName',
  'trusteeEmail',
  'trusteePhone',
  'executorName',
  'executorEmail',
  'executorPhone',
  'powerOfAttorneyName',
  'powerOfAttorneyPrincipalName',
  'powerOfAttorneyAuthorityDetails',
  'multipleOwners',
  'owners',
  'propertyCategory',
  'propertyStructureType',
  'propertyType',
  'canonicalPropertyType',
  'propertyAddress',
  'propertyAddressDetails',
  'addressDetails',
  'address',
  'propertyAddressLine1',
  'propertyAddressLine2',
  'suburb',
  'city',
  'province',
  'postalCode',
  'municipality',
  'schemeName',
  'estateName',
  'estateComplexName',
  'schemeManagingAgentName',
  'hoaContactName',
  'erfSize',
  'floorSize',
  'ratesTaxes',
  'levies',
  'monthlyWaterSpend',
  'monthlyElectricitySpend',
  'askingPrice',
  'mandateType',
  'sellingTimeline',
  'sellingReason',
  'occupancyStatus',
  'leaseExists',
  'leaseExpiryDate',
  'tenantName',
  'tenantContactDetails',
  'existingBond',
  'bondBank',
  'bondAccountReference',
  'gasInstallation',
  'solarInstallation',
  'boreholeInstallation',
  'recentAlterations',
].map((key) => normalizeCompatibilityKey(key)))

function getCanonicalFactsCandidate(source = {}) {
  if (!isPlainObject(source)) return null
  const candidates = [
    source.canonicalSellerFacts,
    source.canonicalFacts,
    source.canonical_seller_facts,
    source.canonical_facts,
    source.canonicalSellerFactsJson,
    source.canonical_facts_json,
    source.canonicalFactJson,
    source.canonical_fact_json,
    source.sellerCanonicalFacts,
    source.seller_canonical_facts,
    source.canonical_seller_facts_json,
    source.sellerCanonicalFactsJson,
    source.seller_canonical_facts_json,
  ]
  return candidates.find((candidate) => isPlainObject(candidate)) || null
}

function getCanonicalReadinessCandidate(source = {}) {
  if (!isPlainObject(source)) return null
  const candidates = [
    source.canonicalSellerFactReadiness,
    source.canonicalFactReadiness,
    source.canonical_seller_fact_readiness,
    source.canonical_fact_readiness,
    source.canonicalFactReadinessJson,
    source.canonical_fact_readiness_json,
    source.sellerCanonicalFactReadiness,
    source.seller_canonical_fact_readiness,
    source.canonical_seller_fact_readiness_json,
    source.sellerCanonicalFactReadinessJson,
    source.seller_canonical_fact_readiness_json,
  ]
  return candidates.find((candidate) => isPlainObject(candidate)) || null
}

function hasRawSellerOnboardingFields(formData = {}) {
  if (!isPlainObject(formData)) return false
  return Object.keys(formData).some((key) => RAW_SELLER_ONBOARDING_KEYS.has(normalizeCompatibilityKey(key)))
}

function getCanonicalSellerPayloadFromFormData(formData = {}, listing = {}, options = {}) {
  const form = isPlainObject(formData) ? formData : {}
  const currentListing = isPlainObject(listing) ? listing : {}

  if (hasRawSellerOnboardingFields(form)) {
    const built = buildCanonicalSellerOnboardingPayload(form, currentListing, {
      contextType: options.contextType || 'private_listing',
      contextId: options.contextId || currentListing.id || null,
      listingId: options.listingId || currentListing.id || null,
      source: options.source || 'seller_onboarding',
      draft: Boolean(options.draft),
    })
    return {
      facts: built.canonicalSellerFacts,
      readiness: built.canonicalSellerFactReadiness,
    }
  }

  const embeddedFacts = getCanonicalFactsCandidate(form) || getCanonicalFactsCandidate(currentListing)
  if (embeddedFacts) {
    const embeddedReadiness = getCanonicalReadinessCandidate(form) || getCanonicalReadinessCandidate(currentListing)
    if (embeddedReadiness) return { facts: embeddedFacts, readiness: embeddedReadiness }

    const validation = validateSellerOnboardingFacts(embeddedFacts, { draft: Boolean(options.draft) })
    const recalculatedReadiness = calculateSellerFactReadiness(embeddedFacts)
    return {
      facts: embeddedFacts,
      readiness: {
        ...recalculatedReadiness,
        validation,
        factsVersion: embeddedFacts.context?.facts_version || 'seller_onboarding_facts_v1',
        generatedAt: new Date().toISOString(),
      },
    }
  }

  return { facts: null, readiness: null }
}

async function persistCanonicalSellerFactPayload(client, { listingId = '', onboardingId = '', formData = {}, listing = {}, draft = false, source = 'seller_onboarding' } = {}) {
  const { facts, readiness } = getCanonicalSellerPayloadFromFormData(formData, listing, {
    contextType: 'private_listing',
    contextId: listingId || listing?.id || null,
    listingId: listingId || listing?.id || null,
    source,
    draft,
  })
  if (!facts) return { skipped: true, reason: 'canonical_seller_facts_missing' }

  const nowIso = new Date().toISOString()
  const updates = []
  if (onboardingId) {
    updates.push(
      client
        .from('private_listing_seller_onboarding')
        .update({
          canonical_facts_json: facts,
          canonical_fact_readiness_json: readiness || {},
          canonical_facts_updated_at: nowIso,
        })
        .eq('id', onboardingId),
    )
  }
  if (listingId) {
    updates.push(
      client
        .from('private_listings')
        .update({
          seller_canonical_facts_json: facts,
          seller_canonical_fact_readiness_json: readiness || {},
          seller_canonical_facts_updated_at: nowIso,
        })
        .eq('id', listingId),
    )
  }

  const results = await Promise.all(updates)
  const blockingError = results.find((result) => {
    const error = result?.error
    return error && !isMissingColumnError(error, 'canonical_facts_json') &&
      !isMissingColumnError(error, 'canonical_fact_readiness_json') &&
      !isMissingColumnError(error, 'canonical_facts_updated_at') &&
      !isMissingColumnError(error, 'seller_canonical_facts_json') &&
      !isMissingColumnError(error, 'seller_canonical_fact_readiness_json') &&
      !isMissingColumnError(error, 'seller_canonical_facts_updated_at')
  })?.error
  if (blockingError) throw blockingError
  return {
    skipped: false,
    persisted: results.filter((result) => !result?.error).length,
    missingColumns: results.filter((result) => result?.error).map((result) => result.error?.message).filter(Boolean),
  }
}

function isDeletedPrivateListingRow(row = {}) {
  const status = normalizeKey(row.listing_status || row.listingStatus || row.status || row.lifecycleStatus)
  const visibility = normalizeKey(row.listing_visibility || row.listingVisibility)
  return Boolean(
    row.deleted_at ||
      row.deletedAt ||
      row.is_deleted ||
      row.isDeleted ||
      DELETED_LISTING_STATUSES.has(status) ||
      DELETED_LISTING_VISIBILITIES.has(visibility),
  )
}

function applyVisiblePrivateListingFilters(queryBuilder) {
  return queryBuilder
    .neq('listing_status', 'withdrawn')
    .neq('listing_visibility', 'archived')
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function normalizeStorageSafeName(value = '', fallback = 'asset') {
  const normalized = normalizeText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || fallback
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

function isSellerVisibleExternalLinkStatus(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  return normalized === 'live' || normalized === 'published'
}

function normalizeExternalUrl(value = '') {
  const url = normalizeText(value)
  if (!url) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url
  if (url.startsWith('www.') || url.includes('.')) return `https://${url}`
  return url
}

function normalizeListingExternalLinks(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.url || item?.listing_url || item?.platform)
    .map((item, index) => {
      const status = normalizeText(item.status || 'Draft') || 'Draft'
      return {
        id: normalizeText(item.id || item.key || `external-link-${index + 1}`),
        listing_id: normalizeText(item.listing_id || item.listingId),
        listingId: normalizeText(item.listingId || item.listing_id),
        platform: normalizeText(item.platform || item.platform_name || 'Other') || 'Other',
        url: normalizeExternalUrl(item.url || item.listing_url || item.listingUrl),
        status,
        publishedAt: item.publishedAt || item.published_at || '',
        lastCheckedAt: item.lastCheckedAt || item.last_checked_at || '',
        notes: normalizeText(item.notes),
        visibleToSeller: item.visibleToSeller === undefined && item.visible_to_seller === undefined
          ? isSellerVisibleExternalLinkStatus(status)
          : Boolean(item.visibleToSeller ?? item.visible_to_seller),
      }
    })
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeMediaItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.url || item?.signedUrl || item?.publicUrl)
    .map((item, index) => ({
      id: normalizeText(item.id || item.path || `media-${index + 1}`),
      name: normalizeText(item.name || item.fileName || `Image ${index + 1}`),
      url: normalizeText(item.url || item.signedUrl || item.publicUrl),
      path: normalizeText(item.path),
      bucket: normalizeText(item.bucket),
      signedUrl: normalizeText(item.signedUrl),
      publicUrl: normalizeText(item.publicUrl),
      contentType: normalizeText(item.contentType),
      size: Number(item.size || 0) || 0,
      label: normalizeText(item.label),
    }))
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

export async function uploadPrivateListingMediaAsset(file, { listingId = '', type = 'gallery' } = {}) {
  const client = requireClient()
  const selectedFile = typeof File !== 'undefined' && file instanceof File ? file : null
  const normalizedListingId = normalizeUuid(listingId)
  if (!selectedFile) throw new Error('Select a valid file before uploading.')
  if (!normalizedListingId) throw new Error('Listing id is required.')

  const safeType = normalizeStorageSafeName(type || 'gallery', 'gallery')
  const safeName = normalizeStorageSafeName(selectedFile.name || 'listing-image', 'listing-image')
  const objectPath = `private-listings/${normalizedListingId}/${safeType}/${Date.now()}-${safeName}`
  const uploadedBucket = await uploadToPrivateListingDocumentsBucket(client, objectPath, selectedFile, {
    upsert: true,
    cacheControl: '3600',
    contentType: selectedFile.type || 'application/octet-stream',
  })
  const signedUrl = await createPrivateListingDocumentSignedUrl(client, objectPath, 60 * 60 * 24 * 30)
  const { data: publicUrlData } = client.storage.from(uploadedBucket).getPublicUrl(objectPath)
  const publicUrl = normalizeText(publicUrlData?.publicUrl)

  return {
    bucket: uploadedBucket,
    path: objectPath,
    fileName: selectedFile.name,
    contentType: selectedFile.type || '',
    size: selectedFile.size || 0,
    url: signedUrl || publicUrl || '',
    signedUrl: signedUrl || '',
    publicUrl: publicUrl || '',
  }
}

const PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS =
  'id, private_listing_id, requirement_key, requirement_name, requirement_description, requirement_group, applies_to, document_visibility, status, is_required, generated_from, canonical_requirement_instance_id, created_at, updated_at'
const PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS_LEGACY =
  'id, private_listing_id, requirement_key, status, is_required, created_at, updated_at'
const PRIVATE_LISTING_REQUIREMENT_SELECT_FIELDS_MIN =
  'id, private_listing_id, requirement_key, status, is_required, created_at, updated_at'
const PRIVATE_LISTING_DOCUMENT_SELECT_FIELDS =
  'id, private_listing_id, requirement_id, document_type, category, document_name, storage_path, file_url, uploaded_by, status, visibility, canonical_requirement_instance_id, pending_transaction_promotion, promoted_transaction_id, promoted_document_id, uploaded_at, created_at, updated_at'
const PRIVATE_LISTING_DOCUMENT_SELECT_FIELDS_LEGACY =
  'id, private_listing_id, requirement_id, document_type, document_name, status, pending_transaction_promotion, promoted_transaction_id, promoted_document_id, uploaded_at, created_at'
const PRIVATE_LISTING_DOCUMENT_SELECT_FIELDS_MIN =
  'id, private_listing_id, requirement_id, document_type, document_name, status, pending_transaction_promotion, promoted_transaction_id, promoted_document_id, uploaded_at, created_at'
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
      canonical_requirement_instance_id: normalizeText(row?.canonical_requirement_instance_id || ''),
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
      category: normalizeText(row?.category || row?.document_category || ''),
      document_name: normalizeText(row?.document_name || row?.file_name || ''),
      file_name: normalizeText(row?.document_name || row?.file_name || ''),
      storage_path: normalizeText(row?.storage_path || ''),
      file_url: normalizeText(row?.file_url || ''),
      fileUrl: normalizeText(row?.file_url || ''),
      uploaded_by: normalizeText(row?.uploaded_by || ''),
      status: normalizeText(row?.status || 'uploaded'),
      visibility: normalizeText(row?.visibility || row?.document_visibility || 'seller_visible'),
      canonical_requirement_instance_id: normalizeText(row?.canonical_requirement_instance_id || ''),
      pending_transaction_promotion: Boolean(row?.pending_transaction_promotion),
      promoted_transaction_id: normalizeText(row?.promoted_transaction_id || ''),
      promoted_document_id: normalizeText(row?.promoted_document_id || ''),
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

const PRIVATE_LISTING_PORTAL_COLUMNS = [
  'property24_listing_url',
  'property24_reference',
  'property24_status',
  'private_property_listing_url',
  'private_property_reference',
  'private_property_status',
  'bridge_listing_status',
  'bridge_listing_public_url',
  'listing_preview_description',
  'internal_listing_notes',
]

function hasMissingPrivateListingPortalColumn(error) {
  return PRIVATE_LISTING_PORTAL_COLUMNS.some((column) => isMissingColumnError(error, column))
}

function stripUnsupportedPortalColumns(payload = {}) {
  const next = { ...(payload || {}) }
  for (const column of PRIVATE_LISTING_PORTAL_COLUMNS) {
    delete next[column]
  }
  return next
}

const PRIVATE_LISTING_LOCATION_COLUMNS = [
  'formatted_address',
  'street_address',
  'country',
  'latitude',
  'longitude',
  'google_place_id',
]

function hasMissingPrivateListingLocationColumn(error) {
  return PRIVATE_LISTING_LOCATION_COLUMNS.some((column) => isMissingColumnError(error, column))
}

function stripUnsupportedLocationColumns(payload = {}) {
  const next = { ...(payload || {}) }
  for (const column of PRIVATE_LISTING_LOCATION_COLUMNS) {
    delete next[column]
  }
  return next
}

function extractQuickAddMandateDates(value = '') {
  const mandateLine = String(value || '')
    .split('\n')
    .map((line) => normalizeText(line))
    .find((line) => line.toLowerCase().startsWith('mandate:'))
  if (!mandateLine) return { startDate: '', endDate: '' }

  const rangePart = mandateLine.split('·').map((part) => normalizeText(part))[2] || ''
  const [startRaw = '', endRaw = ''] = rangePart.split('→').map((part) => normalizeText(part))
  return {
    startDate: startRaw === '-' ? '' : startRaw,
    endDate: endRaw === '-' ? '' : endRaw,
  }
}

function isMandateDocumentRow(row = {}) {
  const searchable = [
    row?.document_type,
    row?.category,
    row?.document_name,
  ].map((value) => normalizeKey(value)).join(' ')
  return searchable.includes('mandate')
}

function getPrivateListingDocumentMatchKey(document = {}) {
  return normalizeCompatibilityKey(
    document?.requirement_key ||
      document?.requirementKey ||
      document?.document_type ||
      document?.documentType ||
      document?.category ||
      document?.document_name ||
      document?.documentName ||
      document?.fileName ||
      '',
  )
}

const PRIVATE_LISTING_DOCUMENT_MATCH_ALIASES = {
  signed_mandate: ['mandate', 'mandate_signature', 'signed_mandate'],
  id_document: ['id_document', 'identity', 'identity_document', 'identity_documents', 'passport', 'seller_id'],
  proof_of_address: ['proof_of_address', 'residential_address', 'residence', 'address'],
  title_deed_reference: ['title_deed_reference', 'title_deed_copy', 'title_deed', 'deed'],
  title_deed_copy: ['title_deed_reference', 'title_deed_copy', 'title_deed', 'deed'],
  rates_account: ['rates_account', 'rates'],
  property_condition_disclosure: ['property_condition_disclosure', 'condition_disclosure', 'disclosure', 'defects'],
  solar_compliance_documents: ['solar_compliance_documents', 'solar_compliance', 'solar'],
}

function getPrivateListingDocumentMatchAliases(key = '') {
  const normalized = normalizeCompatibilityKey(key)
  if (!normalized) return []
  return PRIVATE_LISTING_DOCUMENT_MATCH_ALIASES[normalized] || [normalized]
}

function privateListingDocumentKeysOverlap(left = '', right = '') {
  const leftAliases = getPrivateListingDocumentMatchAliases(left)
  const rightAliases = getPrivateListingDocumentMatchAliases(right)
  if (!leftAliases.length || !rightAliases.length) return false
  return leftAliases.some((leftAlias) =>
    rightAliases.some((rightAlias) =>
      leftAlias === rightAlias ||
      leftAlias.includes(rightAlias) ||
      rightAlias.includes(leftAlias),
    ),
  )
}

function documentMatchesRequirementRow(document = {}, requirement = {}) {
  const requirementId = normalizeText(requirement?.id || requirement?.requirement_id)
  const documentRequirementId = normalizeText(document?.requirement_id || document?.requirementId)
  if (requirementId && documentRequirementId && requirementId === documentRequirementId) return true

  const requirementKey = normalizeCompatibilityKey(requirement?.requirement_key || requirement?.key)
  if (!requirementKey) return false
  const documentKey = getPrivateListingDocumentMatchKey(document)
  return documentKey === requirementKey || privateListingDocumentKeysOverlap(documentKey, requirementKey)
}

function resolveDocumentUploadForRequirement(requirement = {}, documents = []) {
  const rows = Array.isArray(documents) ? documents : []
  return rows.find((document) => documentMatchesRequirementRow(document, requirement)) || null
}

function mergeRequirementUploadState(requirement = {}, upload = null) {
  if (!upload) return requirement
  const uploadStatus = normalizeText(upload?.status || 'uploaded')
  const uploadedAt = upload?.uploaded_at || upload?.uploadedAt || upload?.created_at || upload?.createdAt || null
  const filePath = normalizeText(upload?.storage_path || upload?.file_path || upload?.storagePath || upload?.path)
  const url = normalizeText(upload?.url || upload?.fileUrl || upload?.file_url || upload?.signedUrl)
  return {
    ...requirement,
    status: ['required', 'missing', 'requested', ''].includes(normalizeKey(requirement?.status)) ? uploadStatus : requirement.status,
    uploaded_document_id: upload.id || requirement?.uploaded_document_id || null,
    uploadedDocumentId: upload.id || requirement?.uploadedDocumentId || null,
    uploaded_document: upload,
    uploadedDocument: upload,
    uploaded_at: uploadedAt || requirement?.uploaded_at || null,
    uploadedAt: uploadedAt || requirement?.uploadedAt || null,
    file_name: upload?.file_name || upload?.document_name || requirement?.file_name || '',
    fileName: upload?.fileName || upload?.file_name || upload?.document_name || requirement?.fileName || '',
    file_path: filePath || requirement?.file_path || '',
    filePath: filePath || requirement?.filePath || '',
    url: url || requirement?.url || '',
    fileUrl: url || requirement?.fileUrl || '',
  }
}

function resolvePrivateListingDocumentRequirements(mappedListing = {}, requirementRows = [], documentRows = []) {
  const existingRequirements = Array.isArray(requirementRows) ? requirementRows : []
  const sourceRequirements = existingRequirements.length
    ? existingRequirements
    : syncSellerDocumentRequirementsFromEngine(mappedListing, []).upsertRows

  return sourceRequirements.map((requirement) =>
    mergeRequirementUploadState(requirement, resolveDocumentUploadForRequirement(requirement, documentRows)),
  )
}

async function enrichPrivateListingDocumentRows(client, rows = []) {
  const normalizedRows = normalizeDocumentRows(rows)
  return Promise.all(
    normalizedRows.map(async (row) => {
      const signedUrl = row.storage_path ? await createPrivateListingDocumentSignedUrl(client, row.storage_path) : ''
      const resolvedUrl = signedUrl || row.file_url || ''
      return {
        ...row,
        fileName: row.file_name || row.document_name,
        fileUrl: resolvedUrl,
        signedUrl,
        url: resolvedUrl,
      }
    }),
  )
}

const PRIVATE_LISTING_DOCUMENT_INSERT_OPTIONAL_COLUMNS = [
  'category',
  'file_url',
  'uploaded_by',
  'visibility',
  'canonical_requirement_instance_id',
  'requirement_id',
  'storage_path',
]

function getMissingPrivateListingDocumentInsertColumn(error = {}, payload = {}) {
  for (const columnName of PRIVATE_LISTING_DOCUMENT_INSERT_OPTIONAL_COLUMNS) {
    if (columnName in payload && isMissingColumnError(error, columnName)) return columnName
  }
  const summary = querySummary(error)
  return (summary.columns || []).find((columnName) => columnName in payload) || ''
}

async function insertPrivateListingDocumentRow(client, payload = {}) {
  let nextPayload = { ...(payload || {}) }
  const removedColumns = new Set()

  while (true) {
    const inserted = await client
      .from('private_listing_documents')
      .insert(nextPayload)

    if (!inserted.error) {
      return { data: nextPayload, error: null, removedColumns: [...removedColumns] }
    }

    const missingColumn = getMissingPrivateListingDocumentInsertColumn(inserted.error, nextPayload)
    if (!missingColumn) return { data: null, error: inserted.error, removedColumns: [...removedColumns] }

    delete nextPayload[missingColumn]
    removedColumns.add(missingColumn)
  }
}

function mapPrivateListingRow(row, onboardingByListingId = null, requirementsByListingId = null, documentsByListingId = null, externalLinksByListingId = null) {
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
  const onboardingFormData = onboarding?.form_data && typeof onboarding.form_data === 'object' ? onboarding.form_data : {}
  const canonicalSellerFacts =
    row.seller_canonical_facts_json && typeof row.seller_canonical_facts_json === 'object'
      ? row.seller_canonical_facts_json
      : onboarding?.canonical_facts_json && typeof onboarding.canonical_facts_json === 'object'
        ? onboarding.canonical_facts_json
        : onboardingFormData.canonicalSellerFacts && typeof onboardingFormData.canonicalSellerFacts === 'object'
          ? onboardingFormData.canonicalSellerFacts
          : {}
  const canonicalSellerFactReadiness =
    row.seller_canonical_fact_readiness_json && typeof row.seller_canonical_fact_readiness_json === 'object'
      ? row.seller_canonical_fact_readiness_json
      : onboarding?.canonical_fact_readiness_json && typeof onboarding.canonical_fact_readiness_json === 'object'
        ? onboarding.canonical_fact_readiness_json
        : onboardingFormData.canonicalSellerFactReadiness && typeof onboardingFormData.canonicalSellerFactReadiness === 'object'
          ? onboardingFormData.canonicalSellerFactReadiness
          : {}
  const portalBranding = onboardingFormData.portalBranding && typeof onboardingFormData.portalBranding === 'object'
    ? onboardingFormData.portalBranding
    : {}
  const imageGallery = normalizeMediaItems(onboardingFormData.imageGallery)
  const coverImageId = normalizeText(onboardingFormData.coverImageId) || normalizeText(imageGallery[0]?.id)
  const coverImage = imageGallery.find((item) => normalizeText(item.id) === coverImageId) || imageGallery[0] || null
  const floorplans = normalizeMediaItems(onboardingFormData.floorplans)
  const onboardingDescription = normalizeText(onboardingFormData.propertyNotes)
  const listingPreviewDescription = normalizeText(row.listing_preview_description || onboardingFormData.listingPreviewDescription)
  const onboardingNotes = normalizeText(onboardingFormData.internalNotes)
  const onboardingFeatures = Array.isArray(onboardingFormData.features)
    ? onboardingFormData.features.map((item) => normalizeText(item)).filter(Boolean)
    : []
  const distributionExternalLinks = externalLinksByListingId ? externalLinksByListingId.get(String(row.id || '')) || [] : []
  const externalListingLinks = normalizeListingExternalLinks(
    distributionExternalLinks.length
      ? distributionExternalLinks
      : row.external_links ||
        row.listing_external_links ||
        onboardingFormData.externalListingLinks ||
        onboardingFormData.externalLinks ||
        [],
  )
  const property24ExternalLink = externalListingLinks.find((link) => normalizeKey(link.platform).includes('property24')) || null
  const privatePropertyExternalLink = externalListingLinks.find((link) => normalizeKey(link.platform).includes('private')) || null
  const quickAddMandateDates = extractQuickAddMandateDates(row.internal_listing_notes || row.description)
  const primaryMandateDocument = documentRows.find((documentRow) => isMandateDocumentRow(documentRow)) || null
  const mandateSignedDate = pickFirstText(
    onboardingFormData.mandateSignedDate,
    primaryMandateDocument?.uploaded_at,
  )
  const mandateStartDate = pickFirstText(
    onboardingFormData.listingDate,
    quickAddMandateDates.startDate,
  )
  const mandateEndDate = pickFirstText(
    onboardingFormData.expiryDate,
    quickAddMandateDates.endDate,
  )
  const mandateDocumentUrl = pickFirstText(
    primaryMandateDocument?.url,
    primaryMandateDocument?.fileUrl,
    primaryMandateDocument?.file_url,
  )
  const commissionTerms = {
    commission_type: pickFirstText(onboardingFormData.commissionType, onboardingFormData.commissionStructure),
    commission_structure: pickFirstText(onboardingFormData.commissionStructure, onboardingFormData.commissionType),
    commission_percentage: pickFirstText(
      onboardingFormData.commissionPercentage,
      onboardingFormData.commissionPercent,
      onboardingFormData.commission_percentage,
      onboardingFormData.commission_percent,
      onboardingFormData.mandateCommissionPercentage,
      onboardingFormData.mandateCommissionPercent,
    ),
    commission_amount: pickFirstText(
      onboardingFormData.commissionAmount,
      onboardingFormData.commission_amount,
      onboardingFormData.mandateCommissionAmount,
    ),
    vat_handling: pickFirstText(onboardingFormData.vatHandling),
    payment_responsibility: pickFirstText(onboardingFormData.paymentResponsibility),
    mandate_terms: pickFirstText(onboardingFormData.mandateTerms, onboardingFormData.mandateCommissionTerms),
    commission_notes: pickFirstText(onboardingFormData.commissionNotes),
    commission_split: pickFirstText(
      onboardingFormData.agencyCommissionStructureName,
      onboardingFormData.agency_commission_structure_name,
      onboardingFormData.commissionStructureName,
    ),
    commission_split_id: pickFirstText(
      onboardingFormData.agencyCommissionStructureId,
      onboardingFormData.agency_commission_structure_id,
      onboardingFormData.commissionStructureId,
    ),
    updated_at: pickFirstText(onboardingFormData.commissionUpdatedAt),
    updated_by: pickFirstText(onboardingFormData.commissionUpdatedBy),
    source: pickFirstText(onboardingFormData.commissionSource),
  }

  const mapped = {
    id: row.id,
    organisationId: row.organisation_id || null,
    branchId: row.branch_id || null,
    assignedAgentId: row.assigned_agent_id || null,
    assignedAgentEmail: normalizeText(row.assigned_agent_email).toLowerCase(),
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
    formattedAddress: row.formatted_address || '',
    streetAddress: row.street_address || row.address_line_1 || '',
    addressLine2: row.address_line_2 || '',
    suburb: row.suburb || '',
    city: row.city || '',
    province: row.province || '',
    country: row.country || 'South Africa',
    postalCode: row.postal_code || '',
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    googlePlaceId: row.google_place_id || '',
    sellerType: row.seller_type || '',
    financeContext: row.finance_context || '',
    mandateType: row.mandate_type || 'sole',
    mandateStatus: normalizeStatus(row.mandate_status, MANDATE_STATUSES, 'not_started'),
    mandatePacketId: row.mandate_packet_id || null,
    sellerOnboardingStatus: onboardingStatus,
    isActive: Boolean(row.is_active),
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    agencyOrganisation: pickFirstText(portalBranding.organisationName, portalBranding.agencyName, row.agency_organisation),
    organisationName: pickFirstText(portalBranding.organisationName, portalBranding.agencyName),
    agencyName: pickFirstText(portalBranding.agencyName, portalBranding.organisationName),
    agencyLogoUrl: pickFirstText(portalBranding.logoDarkUrl, portalBranding.logoDark, portalBranding.logoUrl),
    agencyLogoDarkUrl: pickFirstText(portalBranding.logoDarkUrl, portalBranding.logoDark),
    agencyLogoLightUrl: pickFirstText(portalBranding.logoLightUrl, portalBranding.logoLight, portalBranding.logoUrl),
    organisationLogoUrl: pickFirstText(portalBranding.logoDarkUrl, portalBranding.logoDark, portalBranding.logoUrl),
    organisationLogoDarkUrl: pickFirstText(portalBranding.logoDarkUrl, portalBranding.logoDark),
    branding: {
      ...portalBranding,
      organisationName: pickFirstText(portalBranding.organisationName, portalBranding.agencyName),
      agencyName: pickFirstText(portalBranding.agencyName, portalBranding.organisationName),
      logoUrl: pickFirstText(portalBranding.logoDarkUrl, portalBranding.logoDark, portalBranding.logoUrl),
      logoDarkUrl: pickFirstText(portalBranding.logoDarkUrl, portalBranding.logoDark),
      logoLightUrl: pickFirstText(portalBranding.logoLightUrl, portalBranding.logoLight, portalBranding.logoUrl),
    },
    property24ListingUrl: row.property24_listing_url || onboardingFormData.property24ListingUrl || '',
    property24Reference: row.property24_reference || onboardingFormData.property24Reference || '',
    property24Status: row.property24_status || onboardingFormData.property24Status || 'not_published',
    privatePropertyListingUrl: row.private_property_listing_url || onboardingFormData.privatePropertyListingUrl || '',
    privatePropertyReference: row.private_property_reference || onboardingFormData.privatePropertyReference || '',
    privatePropertyStatus: row.private_property_status || onboardingFormData.privatePropertyStatus || 'not_published',
    bridgeListingStatus: row.bridge_listing_status || onboardingFormData.bridgeListingStatus || 'not_published',
    bridgeListingPublicUrl: row.bridge_listing_public_url || onboardingFormData.bridgeListingPublicUrl || '',
    externalLinks: externalListingLinks,
    listingExternalLinks: externalListingLinks,
    listingPreviewDescription,
    internalListingNotes: row.internal_listing_notes || onboardingNotes,
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
    bedrooms: normalizeNumber(onboardingFormData.bedrooms) ?? 0,
    bathrooms: normalizeNumber(onboardingFormData.bathrooms) ?? 0,
    garages: normalizeNumber(onboardingFormData.garages) ?? 0,
    coveredParking: normalizeNumber(onboardingFormData.parkingCovered) ?? 0,
    openParking: normalizeNumber(onboardingFormData.parkingOpen) ?? 0,
    erfSize: normalizeNumber(onboardingFormData.erfSize) ?? 0,
    floorSize: normalizeNumber(onboardingFormData.floorSize) ?? 0,
    marketing: {
      mediaUrl: coverImage?.url || '',
      imageGallery,
      coverImageId,
      floorplans,
      description: onboardingDescription,
      features: onboardingFeatures.join(', '),
      notes: onboardingNotes,
      status: listingStatus,
      source: row.listing_source || '',
      externalLinks: externalListingLinks,
      listingExternalLinks: externalListingLinks,
    },
    propertyDetails: {
      headline: row.title || '',
      propertyType: row.property_type || '',
      listingStatus,
      addressLine1: row.address_line_1 || '',
      suburb: row.suburb || '',
      city: row.city || '',
      province: row.province || '',
      bedrooms: normalizeNumber(onboardingFormData.bedrooms) ?? 0,
      bathrooms: normalizeNumber(onboardingFormData.bathrooms) ?? 0,
      garages: normalizeNumber(onboardingFormData.garages) ?? 0,
      coveredParking: normalizeNumber(onboardingFormData.parkingCovered) ?? 0,
      openParking: normalizeNumber(onboardingFormData.parkingOpen) ?? 0,
      erfSize: normalizeNumber(onboardingFormData.erfSize) ?? 0,
      floorSize: normalizeNumber(onboardingFormData.floorSize) ?? 0,
      price: normalizeNumber(onboardingFormData.askingPrice) ?? (Number(row.asking_price || 0) || 0),
      levies: normalizeNumber(onboardingFormData.levies) ?? 0,
      leviesNotApplicable: Boolean(onboardingFormData.leviesNotApplicable),
      ratesTaxes: normalizeNumber(onboardingFormData.ratesTaxes) ?? 0,
      ratesTaxesNotApplicable: Boolean(onboardingFormData.ratesTaxesNotApplicable),
      saleType: onboardingFormData.saleType || 'For Sale',
      vatApplicable: onboardingFormData.vatApplicable || 'no',
      offersFrom: normalizeNumber(onboardingFormData.offersFrom) ?? 0,
      selectedFeatures: onboardingFeatures,
      description: onboardingDescription,
      listingPreviewDescription,
      notes: onboardingNotes,
      coverImageId,
      floorplans,
      mandateSignedDate,
      listingDate: mandateStartDate,
      expiryDate: mandateEndDate,
      property24ListingUrl: row.property24_listing_url || onboardingFormData.property24ListingUrl || property24ExternalLink?.url || '',
      property24Reference: row.property24_reference || onboardingFormData.property24Reference || '',
      property24Status: row.property24_status || onboardingFormData.property24Status || property24ExternalLink?.status || 'not_published',
      privatePropertyListingUrl: row.private_property_listing_url || onboardingFormData.privatePropertyListingUrl || privatePropertyExternalLink?.url || '',
      privatePropertyReference: row.private_property_reference || onboardingFormData.privatePropertyReference || '',
      privatePropertyStatus: row.private_property_status || onboardingFormData.privatePropertyStatus || privatePropertyExternalLink?.status || 'not_published',
      bridgeListingStatus: row.bridge_listing_status || onboardingFormData.bridgeListingStatus || 'not_published',
      bridgeListingPublicUrl: row.bridge_listing_public_url || onboardingFormData.bridgeListingPublicUrl || '',
      externalLinks: externalListingLinks,
      listingExternalLinks: externalListingLinks,
    },
    documentRequirements: requirementRows,
    documents: documentRows,
    mandateSignedDate,
    mandateStartDate: mandateStartDate || null,
    mandateEndDate: mandateEndDate || null,
    signedMandateUrl: mandateDocumentUrl,
    mandateSignedUrl: mandateDocumentUrl,
    mandateUrl: mandateDocumentUrl,
    mandate: {
      type: row.mandate_type || onboardingFormData.mandateType || 'sole',
      status: normalizeStatus(row.mandate_status, MANDATE_STATUSES, 'not_started'),
      packetId: row.mandate_packet_id || null,
      signedAt: mandateSignedDate || null,
      startDate: mandateStartDate || null,
      endDate: mandateEndDate || null,
      signedUrl: mandateDocumentUrl,
      documentUrl: mandateDocumentUrl,
      updatedAt: primaryMandateDocument?.uploaded_at || row.updated_at || row.created_at || null,
    },
    commission: commissionTerms,
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
          sentAt: onboarding.created_at || null,
          createdAt: onboarding.created_at || null,
          updatedAt: onboarding.updated_at || onboarding.created_at || null,
          submittedAt: onboarding.submitted_at || null,
          completedAt: onboarding.submitted_at || null,
          currentStep: Number(onboarding?.form_data?.currentStep || 0),
          formData: onboarding.form_data || {},
          canonicalFacts: canonicalSellerFacts,
          canonicalFactReadiness: canonicalSellerFactReadiness,
        }
      : {
          token: '',
          link: '',
          status: onboardingStatus,
          sentAt: null,
          createdAt: null,
          updatedAt: null,
          submittedAt: null,
          completedAt: null,
          currentStep: 0,
          formData: {},
          canonicalFacts: canonicalSellerFacts,
          canonicalFactReadiness: canonicalSellerFactReadiness,
        },
    sellerCanonicalFacts: canonicalSellerFacts,
    sellerCanonicalFactReadiness: canonicalSellerFactReadiness,
  }

  const resolvedDocumentRequirements = resolvePrivateListingDocumentRequirements(mapped, requirementRows, documentRows)
  const mappedWithDocumentState = {
    ...mapped,
    documentRequirements: resolvedDocumentRequirements,
    requiredDocuments: resolvedDocumentRequirements.map((requirement) => ({
      ...requirement,
      key: requirement.requirement_key || requirement.key,
      label: requirement.requirement_name || requirement.label,
    })),
  }

  return {
    ...mappedWithDocumentState,
    readinessSummary: getListingReadinessSummary(mappedWithDocumentState),
  }
}

function mapPrivateListingSummaryRow(row = {}) {
  const canonicalSellerFacts =
    row?.seller_canonical_facts_json && typeof row.seller_canonical_facts_json === 'object'
      ? row.seller_canonical_facts_json
      : {}
  const listingStatus = mapLegacyListingStatusToCanonicalStatus(row.listing_status || row.status)
  const addressLine1 = row.address_line_1 || ''
  const addressLine2 = row.address_line_2 || ''

  return {
    id: row.id,
    organisationId: row.organisation_id || null,
    branchId: row.branch_id || null,
    assignedAgentId: row.assigned_agent_id || null,
    assignedAgentEmail: normalizeText(row.assigned_agent_email).toLowerCase(),
    sellerLeadId: row.seller_lead_id || null,
    sellerProfileId: row.seller_profile_id || null,
    propertyProfileId: row.property_profile_id || null,
    listingReference: row.listing_reference || '',
    listingStatus,
    listingVisibility: normalizeStatus(row.listing_visibility, LISTING_VISIBILITY, 'internal'),
    listingSource: normalizeListingSource(row.listing_source || row.stock_source || row.listing_category, { fallback: 'private_listing' }),
    propertyCategory: normalizePropertyCategory(row.property_category || row.property_type, { fallback: 'residential' }),
    propertyStructureType: normalizePropertyStructureType(row.property_structure_type || row.ownership_structure || row.property_type, { fallback: 'other' }),
    propertyType: row.property_type || '',
    listingCategory: row.listing_category || 'private_sale',
    title: row.title || '',
    description: '',
    askingPrice: Number(row.asking_price || 0) || 0,
    estimatedValue: Number(row.estimated_value || 0) || 0,
    addressLine1,
    addressLine2,
    suburb: row.suburb || '',
    city: row.city || '',
    province: row.province || '',
    postalCode: row.postal_code || '',
    sellerType: row.seller_type || '',
    financeContext: row.finance_context || '',
    mandateType: row.mandate_type || 'sole',
    mandateStatus: normalizeStatus(row.mandate_status, MANDATE_STATUSES, 'not_started'),
    mandatePacketId: row.mandate_packet_id || null,
    sellerOnboardingStatus: normalizeStatus(row.seller_onboarding_status, SELLER_ONBOARDING_STATUSES, 'not_started'),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
    listingTitle: row.title || row.address_line_1 || 'Untitled listing',
    propertyAddress: [addressLine1, addressLine2].filter(Boolean).join(', '),
    status: listingStatus,
    listingStatusLegacy: listingStatus,
    lifecycleStatus: listingStatus,
    lifecycleStatusLabel: getPrivateListingStatusLabel(listingStatus),
    lifecycleStatusDescription: getPrivateListingStatusDescription(listingStatus),
    lifecycleStatusGroup: getPrivateListingStatusGroup(listingStatus),
    lifecycleNextAction: getPrivateListingLifecycleNextAction({ ...row, listingStatus }),
    property24ListingUrl: row.property24_listing_url || '',
    property24Reference: row.property24_reference || '',
    property24Status: row.property24_status || 'not_published',
    privatePropertyListingUrl: row.private_property_listing_url || '',
    privatePropertyReference: row.private_property_reference || '',
    privatePropertyStatus: row.private_property_status || 'not_published',
    bridgeListingStatus: row.bridge_listing_status || 'not_published',
    bridgeListingPublicUrl: row.bridge_listing_public_url || '',
    documents: [],
    documentRequirements: [],
    requirements: [],
    requirementsByType: {},
    property24StatusRows: [],
    listingPreviewDescription: row.listing_preview_description || '',
    internalListingNotes: row.internal_listing_notes || '',
    activeDeal: null,
    seller: {
      name: '',
      email: '',
      phone: '',
    },
    sellerOnboarding: {
      status: normalizeStatus(row.seller_onboarding_status, SELLER_ONBOARDING_STATUSES, 'not_started'),
      canonicalFacts: canonicalSellerFacts,
      canonicalFactReadiness: row.seller_canonical_fact_readiness_json && typeof row.seller_canonical_fact_readiness_json === 'object'
        ? row.seller_canonical_fact_readiness_json
        : {},
      formData: {},
    },
    sellerCanonicalFacts: canonicalSellerFacts,
    sellerCanonicalFactReadiness:
      row.seller_canonical_fact_readiness_json && typeof row.seller_canonical_fact_readiness_json === 'object'
        ? row.seller_canonical_fact_readiness_json
        : {},
    completeness: {
      isDraft: false,
      hasMandate: ['signed', 'approved', 'verified', 'completed'].includes(normalizeKey(row.mandate_status)),
      hasSellerDocs: false,
      hasSellerOnboarding: false,
    },
    readinessSummary: {
      isDraft: false,
      hasMandate: ['signed', 'approved', 'verified', 'completed'].includes(normalizeKey(row.mandate_status)),
      hasSellerDocs: false,
      hasSellerOnboarding: false,
      missing: [],
    },
  }
}

async function fetchOrganisationBrandingSnapshot(client, organisationId) {
  const normalizedOrganisationId = normalizeUuid(organisationId)
  if (!client || !normalizedOrganisationId) return null

  try {
    const [organisationResult, settingsResult] = await Promise.all([
      client
        .from('organisations')
        .select('id, name, display_name, logo_url')
        .eq('id', normalizedOrganisationId)
        .maybeSingle(),
      client
        .from('organisation_settings')
        .select('settings_json')
        .eq('organisation_id', normalizedOrganisationId)
        .maybeSingle(),
    ])

    const organisation = organisationResult.error ? null : organisationResult.data
    const settings = settingsResult.error ? null : settingsResult.data?.settings_json
    const onboarding = settings?.agencyOnboarding && typeof settings.agencyOnboarding === 'object'
      ? settings.agencyOnboarding
      : {}
    const agencyInformation = onboarding?.agencyInformation && typeof onboarding.agencyInformation === 'object'
      ? onboarding.agencyInformation
      : {}
    const branding = onboarding?.branding && typeof onboarding.branding === 'object'
      ? onboarding.branding
      : {}
    const organisationName = pickFirstText(
      agencyInformation.tradingName,
      agencyInformation.agencyName,
      organisation?.display_name,
      organisation?.name,
    )
    const logoLightUrl = pickFirstText(branding.logoLight, branding.logoLightUrl, branding.logoUrl, organisation?.logo_url)
    const logoDarkUrl = pickFirstText(branding.logoDark, branding.logoDarkUrl, branding.logoHighContrastUrl, branding.logoLight, branding.logoLightUrl, organisation?.logo_url)
    const logoUrl = pickFirstText(logoDarkUrl, logoLightUrl)

    if (!organisationName && !logoUrl) return null
    return {
      organisationId: normalizedOrganisationId,
      organisationName,
      agencyName: organisationName,
      logoUrl,
      logoDarkUrl,
      logoLightUrl,
      logoDark: logoDarkUrl,
      logoLight: logoLightUrl,
      primaryColour: pickFirstText(branding?.brandColours?.primary, '#274C69'),
      secondaryColour: pickFirstText(branding?.brandColours?.secondary, '#10273A'),
    }
  } catch (error) {
    console.warn('[Private Listings] organisation branding snapshot unavailable for seller onboarding.', {
      organisationId: normalizedOrganisationId,
      error,
    })
    return null
  }
}

function attachBrandingToListing(listing = null, branding = null) {
  if (!listing || !branding) return listing
  const mergedBranding = {
    ...(listing.branding || {}),
    ...branding,
    organisationName: pickFirstText(branding.organisationName, branding.agencyName, listing.organisationName, listing.agencyName),
    agencyName: pickFirstText(branding.agencyName, branding.organisationName, listing.agencyName, listing.organisationName),
    logoUrl: pickFirstText(branding.logoDarkUrl, branding.logoDark, branding.logoUrl, listing.branding?.logoUrl),
    logoDarkUrl: pickFirstText(branding.logoDarkUrl, branding.logoDark, listing.branding?.logoDarkUrl),
    logoLightUrl: pickFirstText(branding.logoLightUrl, branding.logoLight, branding.logoUrl, listing.branding?.logoLightUrl),
  }
  return {
    ...listing,
    agencyOrganisation: pickFirstText(mergedBranding.organisationName, listing.agencyOrganisation),
    organisationName: pickFirstText(mergedBranding.organisationName, listing.organisationName),
    agencyName: pickFirstText(mergedBranding.agencyName, listing.agencyName),
    agencyLogoUrl: pickFirstText(mergedBranding.logoDarkUrl, mergedBranding.logoUrl, listing.agencyLogoUrl),
    agencyLogoDarkUrl: pickFirstText(mergedBranding.logoDarkUrl, listing.agencyLogoDarkUrl),
    agencyLogoLightUrl: pickFirstText(mergedBranding.logoLightUrl, listing.agencyLogoLightUrl),
    organisationLogoUrl: pickFirstText(mergedBranding.logoDarkUrl, mergedBranding.logoUrl, listing.organisationLogoUrl),
    organisationLogoDarkUrl: pickFirstText(mergedBranding.logoDarkUrl, listing.organisationLogoDarkUrl),
    branding: mergedBranding,
  }
}

function mapSellerClientPortalPayload(payload) {
  const listingRow = payload?.listing && typeof payload.listing === 'object' ? payload.listing : null
  const onboardingRow = payload?.onboarding && typeof payload.onboarding === 'object' ? payload.onboarding : null
  if (!listingRow?.id || !onboardingRow?.private_listing_id) return null
  const payloadExternalLinks = normalizeListingExternalLinks(
    payload?.externalListingLinks ||
      payload?.external_listing_links ||
      payload?.externalLinks ||
      payload?.external_links ||
      listingRow.external_links ||
      listingRow.listing_external_links ||
      [],
  )
  const listingForMap = {
    ...listingRow,
    external_links: payloadExternalLinks.length ? payloadExternalLinks : listingRow.external_links,
    listing_external_links: payloadExternalLinks.length ? payloadExternalLinks : listingRow.listing_external_links,
  }
  const onboardingMap = new Map([[String(onboardingRow.private_listing_id), onboardingRow]])
  const requirements = normalizeRequirementRows(Array.isArray(payload?.requirements) ? payload.requirements : [])
  const documents = normalizeDocumentRows(Array.isArray(payload?.documents) ? payload.documents : [])
  const appointments = Array.isArray(payload?.appointments) ? payload.appointments : []
  const mandatePacket = payload?.mandatePacket && typeof payload.mandatePacket === 'object'
    ? payload.mandatePacket
    : payload?.mandate_packet && typeof payload.mandate_packet === 'object'
      ? payload.mandate_packet
      : null
  return {
    onboarding: onboardingRow,
    appointments,
    mandatePacket,
    listing: mapPrivateListingRow(
      listingForMap,
      onboardingMap,
      new Map([[String(listingForMap.id), requirements]]),
      new Map([[String(listingForMap.id), documents]]),
    ),
  }
}

async function fetchSellerClientPortalPayloadByToken(client, token, options = {}) {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) return null
  const accessToken = normalizeText(options.accessToken)
  const requirePortalAccess = Boolean(options.requirePortalAccess)
  const rpcArgs = requirePortalAccess || accessToken
    ? {
        p_token: normalizedToken,
        p_access_token: accessToken || null,
        p_require_access: requirePortalAccess,
      }
    : {
        p_token: normalizedToken,
      }
  const rpc = await client.rpc('bridge_private_listing_seller_portal_payload', rpcArgs)
  if (rpc.error) {
    if (isMissingRpcError(rpc.error, 'bridge_private_listing_seller_portal_payload')) return null
    throw rpc.error
  }
  if (rpc.data?.authRequired) {
    return { portalAuth: rpc.data }
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
    mandate_packet_id: normalizeUuid(listing?.mandatePacketId || listing?.mandate_packet_id) || null,
    seller_workspace_token: token,
    status: normalizeNullableText(status) || 'active',
    updated_at: new Date().toISOString(),
  }
}

function buildSellerPortalDocumentsEmailPayload({ listing = {}, onboarding = {}, formData = {} } = {}) {
  const token = normalizeText(onboarding?.token || listing?.sellerOnboarding?.token || listing?.seller_onboarding_token)
  const portalLink = buildSellerClientPortalLink(token)
  const to = getSellerClientPortalEmail(listing, onboarding, formData)
  if (!to || !portalLink) return null

  const propertyTitle = normalizeText(
    listing?.propertyAddress ||
      listing?.address ||
      listing?.addressLine1 ||
      listing?.address_line_1 ||
      listing?.title ||
      listing?.listingTitle ||
      'your property',
  )

  return {
    type: 'seller_onboarding_link',
    emailKind: 'portal_documents',
    to,
    organisationId: normalizeText(listing?.organisationId || listing?.organisation_id),
    leadId: normalizeText(listing?.sellerLeadId || listing?.seller_lead_id || listing?.originatingCrmLeadId || listing?.originating_crm_lead_id),
    listingId: normalizeText(listing?.id || listing?.listingId || listing?.listing_id),
    sellerName: normalizeText(
      formData?.sellerFirstName && formData?.sellerSurname
        ? `${formData.sellerFirstName} ${formData.sellerSurname}`
        : listing?.seller?.name || listing?.sellerName || 'Seller',
    ),
    propertyTitle,
    propertyType: normalizeText(listing?.propertyType || listing?.property_type),
    onboardingLink: portalLink,
    transactionReference: normalizeText(listing?.listingReference || listing?.listing_reference),
    agentName: normalizeText(listing?.assignedAgentName || listing?.assignedAgent || listing?.agentName || 'Your agent'),
    organisationName: normalizeText(listing?.agencyOrganisation || listing?.organisationName || listing?.agencyName || 'Bridge'),
    supportEmail: normalizeText(listing?.assignedAgentEmail || listing?.agentEmail || ''),
  }
}

async function notifySellerPortalDocumentsReady(client, { listing = {}, onboarding = {}, formData = {} } = {}) {
  const payload = buildSellerPortalDocumentsEmailPayload({ listing, onboarding, formData })
  if (!payload) return { skipped: true, reason: 'email_or_portal_link_missing' }

  const { data, error } = await client.functions.invoke('send-email', { body: payload })
  if (error || data?.error) {
    throw new Error(error?.message || data?.error || 'Seller portal email could not be sent.')
  }

  return data || { ok: true }
}

export async function getSellerPortalAccessState(token) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Seller portal token is required.')

  const { data, error } = await client.rpc('bridge_private_listing_seller_portal_access_state', {
    p_token: normalizedToken,
  })
  if (error) throw error
  return data || { valid: false, reason: 'unavailable' }
}

export async function setSellerPortalPassword({ token, password } = {}) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Seller portal token is required.')

  const { data, error } = await client.rpc('bridge_set_private_listing_seller_portal_password', {
    p_token: normalizedToken,
    p_password: password || '',
  })
  if (error) throw error
  const accessToken = storeSellerPortalAccessToken(normalizedToken, data)
  return { ...(data || {}), accessToken }
}

export async function verifySellerPortalPassword({ token, password } = {}) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Seller portal token is required.')

  const { data, error } = await client.rpc('bridge_verify_private_listing_seller_portal_password', {
    p_token: normalizedToken,
    p_password: password || '',
  })
  if (error) throw error
  const accessToken = storeSellerPortalAccessToken(normalizedToken, data)
  return { ...(data || {}), accessToken }
}

export async function resetSellerPortalPassword(token) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Seller portal token is required.')

  const { data, error } = await client.rpc('bridge_reset_private_listing_seller_portal_password', {
    p_token: normalizedToken,
  })
  if (error) throw error
  clearSellerPortalAccessToken(normalizedToken)
  return data || { ok: true, passwordSet: false, passwordRequired: true }
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
  const timestamp = new Date().toISOString().replace(/[.:TZ-]/g, '').slice(0, 12)
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

  const rows = await enrichPrivateListingDocumentRows(client, query.data)
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

async function fetchExternalLinkRowsForListings(client, listingIds = []) {
  const ids = normalizeUuidList(listingIds)
  if (!ids.length || hasMissingTableCache('listing_external_links')) return new Map()
  const query = await client
    .from('listing_external_links')
    .select('id, listing_id, platform, url, status, published_at, last_checked_at, notes, visible_to_seller, created_at, updated_at')
    .in('listing_id', ids)
    .order('created_at', { ascending: true })
  if (query.error) {
    if (isMissingTableError(query.error, 'listing_external_links') || isMissingColumnError(query.error)) {
      rememberMissingTable('listing_external_links')
      return new Map()
    }
    throw query.error
  }
  const map = new Map()
  for (const row of normalizeListingExternalLinks(query.data || [])) {
    const listingId = normalizeText(row.listing_id || row.listingId)
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
    branch_id: normalizeUuid(payload.branchId || payload.branch_id),
    assigned_agent_id: normalizeUuid(payload.assignedAgentId),
    assigned_agent_email: normalizeText(payload.assignedAgentEmail).toLowerCase() || null,
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
    formatted_address: normalizeNullableText(payload.formattedAddress),
    street_address: normalizeNullableText(payload.streetAddress || payload.addressLine1 || payload.propertyAddress),
    address_line_2: normalizeNullableText(payload.addressLine2),
    suburb: normalizeNullableText(payload.suburb),
    city: normalizeNullableText(payload.city),
    province: normalizeNullableText(payload.province),
    country: normalizeNullableText(payload.country) || 'South Africa',
    postal_code: normalizeNullableText(payload.postalCode),
    latitude: normalizeNumber(payload.latitude),
    longitude: normalizeNumber(payload.longitude),
    google_place_id: normalizeNullableText(payload.googlePlaceId || payload.placeId),
    seller_type: normalizeNullableText(payload.sellerType),
    finance_context: normalizeNullableText(payload.financeContext),
    mandate_type: normalizeNullableText(payload.mandateType) || 'sole',
    mandate_status: normalizeStatus(payload.mandateStatus, MANDATE_STATUSES, 'not_started'),
    seller_onboarding_status: normalizeStatus(payload.sellerOnboardingStatus, SELLER_ONBOARDING_STATUSES, 'not_started'),
    is_active: payload.isActive === undefined ? false : Boolean(payload.isActive),
    created_by: normalizeUuid(payload.createdBy || userId),
    property24_listing_url: normalizeNullableText(payload.property24ListingUrl),
    property24_reference: normalizeNullableText(payload.property24Reference),
    property24_status: normalizeNullableText(payload.property24Status) || 'not_published',
    private_property_listing_url: normalizeNullableText(payload.privatePropertyListingUrl),
    private_property_reference: normalizeNullableText(payload.privatePropertyReference),
    private_property_status: normalizeNullableText(payload.privatePropertyStatus) || 'not_published',
    bridge_listing_status: normalizeNullableText(payload.bridgeListingStatus) || 'not_published',
    bridge_listing_public_url: normalizeNullableText(payload.bridgeListingPublicUrl),
    listing_preview_description: normalizeNullableText(payload.listingPreviewDescription),
    internal_listing_notes: normalizeNullableText(payload.internalListingNotes),
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
      .neq('listing_visibility', 'archived')
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
    isMissingColumnError(insert.error, 'branch_id') ||
    isMissingColumnError(insert.error, 'property_category') ||
    isMissingColumnError(insert.error, 'listing_source') ||
    isMissingColumnError(insert.error, 'property_structure_type') ||
    isMissingColumnError(insert.error, 'assigned_agent_email') ||
    hasMissingPrivateListingLocationColumn(insert.error) ||
    hasMissingPrivateListingPortalColumn(insert.error)
  )) {
    const fallbackPayload = { ...listingPayload }
    if (isMissingColumnError(insert.error, 'assigned_agent_email')) delete fallbackPayload.assigned_agent_email
    const shouldStripBranchId = isMissingColumnError(insert.error, 'branch_id')
    insert = await client
      .from('private_listings')
      .insert(stripUnsupportedLocationColumns(stripUnsupportedPortalColumns(stripUnsupportedTaxonomyColumns(Object.fromEntries(Object.entries(fallbackPayload).filter(([key]) => !shouldStripBranchId || key !== 'branch_id'))))))
      .select('*')
      .single()
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
    activityType: normalizeKey(payload.origin || payload.source) === 'quick_add' ? 'quick_add_listing_created' : 'seller_lead_created',
    activityTitle: normalizeKey(payload.origin || payload.source) === 'quick_add' ? 'Listing created via Quick Add' : 'Seller lead captured',
    activityDescription: normalizeKey(payload.origin || payload.source) === 'quick_add' ? 'Private listing created from quick capture.' : 'Private listing intake shell created.',
    performedBy: user.id,
    visibility: 'internal',
    metadata: {
      origin: normalizeText(payload.origin || payload.source || 'manual'),
      source: normalizeText(payload.source || 'manual'),
      originatingCrmLeadId: listingWithRequirements.originatingCrmLeadId,
      sellerLeadId: listingWithRequirements.sellerLeadId,
      assignedAgentId: normalizeText(payload.assignedAgentId),
      mandateStatus: normalizeText(payload.mandateStatus),
      completeness: payload.completeness || null,
      missingFollowUpItems: Array.isArray(payload.completeness?.missingItems) ? payload.completeness.missingItems : [],
      canonicalStructure: Array.isArray(payload.canonicalStructure)
        ? payload.canonicalStructure
        : normalizeKey(payload.origin || payload.source) === 'quick_add'
          ? ['listing', 'property', 'seller_party', 'mandate', 'commission_terms', 'agent_assignment', 'documents', 'private_listing_activity']
          : null,
    },
  }).catch(() => {})

  void import('./suggestionGenerationService')
    .then(({ queueListingSuggestionGeneration }) => queueListingSuggestionGeneration(listingWithRequirements))
    .catch((generationError) => console.warn('[privateListingService] listing suggestion generation skipped', generationError))

  return { listing: listingWithRequirements, existing: false }
}

export async function updatePrivateListing(listingId, payload = {}, options = {}) {
  const client = requireClient()
  const normalizedId = normalizeText(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')
  const includeRequirementsAndDocuments = options?.includeRequirementsAndDocuments !== false

  const patch = {}
  if (payload.assignedAgentId !== undefined) patch.assigned_agent_id = normalizeUuid(payload.assignedAgentId)
  if (payload.assignedAgentEmail !== undefined) patch.assigned_agent_email = normalizeText(payload.assignedAgentEmail).toLowerCase() || null
  if (payload.sellerLeadId !== undefined) patch.seller_lead_id = normalizeLeadLink(payload.sellerLeadId)
  if (payload.originatingCrmLeadId !== undefined) patch.originating_crm_lead_id = normalizeLeadLink(payload.originatingCrmLeadId)
  if (payload.sellerProfileId !== undefined) patch.seller_profile_id = normalizeUuid(payload.sellerProfileId)
  if (payload.sellerCanonicalFacts !== undefined) {
    patch.seller_canonical_facts_json = payload.sellerCanonicalFacts && typeof payload.sellerCanonicalFacts === 'object'
      ? payload.sellerCanonicalFacts
      : null
  }
  if (payload.sellerCanonicalFactReadiness !== undefined) {
    patch.seller_canonical_fact_readiness_json = payload.sellerCanonicalFactReadiness && typeof payload.sellerCanonicalFactReadiness === 'object'
      ? payload.sellerCanonicalFactReadiness
      : {}
  }
  if (payload.sellerCanonicalFactsUpdatedAt !== undefined) {
    patch.seller_canonical_facts_updated_at = payload.sellerCanonicalFactsUpdatedAt || null
  }
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
  if (payload.formattedAddress !== undefined) patch.formatted_address = normalizeNullableText(payload.formattedAddress)
  if (payload.streetAddress !== undefined) patch.street_address = normalizeNullableText(payload.streetAddress)
  if (payload.addressLine2 !== undefined) patch.address_line_2 = normalizeNullableText(payload.addressLine2)
  if (payload.suburb !== undefined) patch.suburb = normalizeNullableText(payload.suburb)
  if (payload.city !== undefined) patch.city = normalizeNullableText(payload.city)
  if (payload.province !== undefined) patch.province = normalizeNullableText(payload.province)
  if (payload.country !== undefined) patch.country = normalizeNullableText(payload.country) || 'South Africa'
  if (payload.postalCode !== undefined) patch.postal_code = normalizeNullableText(payload.postalCode)
  if (payload.latitude !== undefined) patch.latitude = normalizeNumber(payload.latitude)
  if (payload.longitude !== undefined) patch.longitude = normalizeNumber(payload.longitude)
  if (payload.googlePlaceId !== undefined || payload.placeId !== undefined) patch.google_place_id = normalizeNullableText(payload.googlePlaceId || payload.placeId)
  if (payload.sellerType !== undefined) patch.seller_type = normalizeNullableText(payload.sellerType)
  if (payload.financeContext !== undefined) patch.finance_context = normalizeNullableText(payload.financeContext)
  if (payload.mandateType !== undefined) patch.mandate_type = normalizeNullableText(payload.mandateType)
  if (payload.mandateStatus !== undefined) patch.mandate_status = normalizeStatus(payload.mandateStatus, MANDATE_STATUSES, 'not_started')
  if (payload.sellerOnboardingStatus !== undefined) {
    patch.seller_onboarding_status = normalizeStatus(payload.sellerOnboardingStatus, SELLER_ONBOARDING_STATUSES, 'not_started')
  }
  if (payload.isActive !== undefined) patch.is_active = Boolean(payload.isActive)
  if (payload.property24ListingUrl !== undefined) patch.property24_listing_url = normalizeNullableText(payload.property24ListingUrl)
  if (payload.property24Reference !== undefined) patch.property24_reference = normalizeNullableText(payload.property24Reference)
  if (payload.property24Status !== undefined) patch.property24_status = normalizeNullableText(payload.property24Status) || 'not_published'
  if (payload.privatePropertyListingUrl !== undefined) patch.private_property_listing_url = normalizeNullableText(payload.privatePropertyListingUrl)
  if (payload.privatePropertyReference !== undefined) patch.private_property_reference = normalizeNullableText(payload.privatePropertyReference)
  if (payload.privatePropertyStatus !== undefined) patch.private_property_status = normalizeNullableText(payload.privatePropertyStatus) || 'not_published'
  if (payload.bridgeListingStatus !== undefined) patch.bridge_listing_status = normalizeNullableText(payload.bridgeListingStatus) || 'not_published'
  if (payload.bridgeListingPublicUrl !== undefined) patch.bridge_listing_public_url = normalizeNullableText(payload.bridgeListingPublicUrl)
  if (payload.listingPreviewDescription !== undefined) patch.listing_preview_description = normalizeNullableText(payload.listingPreviewDescription)
  if (payload.internalListingNotes !== undefined) patch.internal_listing_notes = normalizeNullableText(payload.internalListingNotes)

  let updateQuery = await client.from('private_listings').update(patch).eq('id', normalizedId).select('*').single()
  if (updateQuery.error && (
    isMissingColumnError(updateQuery.error, 'property_category') ||
    isMissingColumnError(updateQuery.error, 'listing_source') ||
    isMissingColumnError(updateQuery.error, 'property_structure_type') ||
    isMissingColumnError(updateQuery.error, 'assigned_agent_email') ||
    isMissingColumnError(updateQuery.error, 'seller_canonical_facts_json') ||
    isMissingColumnError(updateQuery.error, 'seller_canonical_fact_readiness_json') ||
    isMissingColumnError(updateQuery.error, 'seller_canonical_facts_updated_at') ||
    hasMissingPrivateListingLocationColumn(updateQuery.error) ||
    hasMissingPrivateListingPortalColumn(updateQuery.error)
  )) {
    const compatiblePatch = { ...patch }
    if (isMissingColumnError(updateQuery.error, 'assigned_agent_email')) delete compatiblePatch.assigned_agent_email
    delete compatiblePatch.seller_canonical_facts_json
    delete compatiblePatch.seller_canonical_fact_readiness_json
    delete compatiblePatch.seller_canonical_facts_updated_at
    updateQuery = await client
      .from('private_listings')
      .update(stripUnsupportedLocationColumns(stripUnsupportedPortalColumns(stripUnsupportedTaxonomyColumns(compatiblePatch))))
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
  const updatedListing = mapPrivateListingRow(updateQuery.data, onboardingMap, requirementsMap, documentsMap)
  const importantFields = [
    'askingPrice',
    'asking_price',
    'suburb',
    'bedrooms',
    'bathrooms',
    'listingStatus',
    'listing_status',
    'propertyType',
    'property_type',
    'propertyCategory',
    'property_category',
    'city',
    'province',
  ]
  if (importantFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) {
    void import('./suggestionGenerationService')
      .then(({ queueListingSuggestionGeneration }) => queueListingSuggestionGeneration(updatedListing, { force: true }))
      .catch((generationError) => console.warn('[privateListingService] listing suggestion regeneration skipped', generationError))
  }
  return updatedListing
}

export async function deletePrivateListing(listingId, { organisationId = null } = {}) {
  const client = requireClient()
  const normalizedId = normalizeUuid(listingId)
  const normalizedOrgId = normalizeUuid(organisationId)
  if (!normalizedId) throw new Error('Listing id is required.')

  let hardDeleteError = null
  let hardDeleteQuery = client
    .from('private_listings')
    .delete()
    .eq('id', normalizedId)

  if (normalizedOrgId) {
    hardDeleteQuery = hardDeleteQuery.eq('organisation_id', normalizedOrgId)
  }

  const result = await hardDeleteQuery
    .select('id, organisation_id, seller_lead_id, originating_crm_lead_id, listing_reference, title')
    .maybeSingle()

  if (result.error) {
    if (isMissingTableError(result.error, 'private_listings')) {
      throw new Error('Private listings table is unavailable in this Supabase project.')
    }
    hardDeleteError = result.error
  }

  if (result.data?.id) {
    return {
      deleted: true,
      mode: 'hard',
      listing: result.data,
    }
  }

  const softDeletePayload = {
    listing_status: 'withdrawn',
    listing_visibility: 'archived',
    is_active: false,
  }
  let softDeleteQuery = client
    .from('private_listings')
    .update(softDeletePayload)
    .eq('id', normalizedId)

  if (normalizedOrgId) {
    softDeleteQuery = softDeleteQuery.eq('organisation_id', normalizedOrgId)
  }

  const softDelete = await softDeleteQuery
    .select('id, organisation_id, seller_lead_id, originating_crm_lead_id, listing_reference, title, listing_status, listing_visibility')
    .maybeSingle()

  if (softDelete.error) {
    if (isMissingTableError(softDelete.error, 'private_listings')) {
      throw new Error('Private listings table is unavailable in this Supabase project.')
    }
    throw softDelete.error
  }

  if (!softDelete.data?.id) {
    const message = hardDeleteError?.message
      ? `Could not delete listing. ${hardDeleteError.message}`
      : 'Could not delete listing. It may already be removed or you may not have permission.'
    throw new Error(message)
  }

  return {
    deleted: true,
    mode: 'soft',
    listing: softDelete.data,
  }
}

export async function updatePrivateListingOnboardingFormData(listingId, formData = {}, options = {}) {
  const client = requireClient()
  const normalizedId = normalizeUuid(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')

  const existing = await client
    .from('private_listing_seller_onboarding')
    .select('id, private_listing_id, token, status, seller_type, ownership_structure, marital_regime, form_data, submitted_at')
    .eq('private_listing_id', normalizedId)
    .maybeSingle()
  if (existing.error) {
    if (isMissingTableError(existing.error, 'private_listing_seller_onboarding')) return null
    throw existing.error
  }
  if (!existing.data?.id) {
    const inserted = await client
      .from('private_listing_seller_onboarding')
      .insert({
        private_listing_id: normalizedId,
        token: generateSellerOnboardingToken(),
        form_data: formData && typeof formData === 'object' ? formData : {},
        status: normalizeStatus(options.status || 'completed', SELLER_ONBOARDING_STATUSES, 'completed'),
        submitted_at: new Date().toISOString(),
        seller_type: normalizeNullableText(options.sellerType || formData?.sellerType || formData?.ownershipType),
        ownership_structure: normalizeNullableText(options.ownershipStructure || formData?.ownershipType),
        marital_regime: normalizeNullableText(options.maritalRegime || formData?.maritalRegime || formData?.marriageRegime),
      })
      .select('*')
      .single()
    if (inserted.error) throw inserted.error
    await persistCanonicalSellerFactPayload(client, {
      listingId: normalizedId,
      onboardingId: inserted.data?.id,
      formData,
      listing: { id: normalizedId },
      draft: normalizeStatus(options.status || 'completed', SELLER_ONBOARDING_STATUSES, 'completed') !== 'completed',
    }).catch((factError) => {
      console.warn('[Private Listings] canonical seller facts persistence skipped after onboarding form insert', factError)
      return null
    })
    return inserted.data
  }

  const existingFormData = existing.data.form_data && typeof existing.data.form_data === 'object' ? existing.data.form_data : {}
  const nextFormData = {
    ...existingFormData,
    ...(formData && typeof formData === 'object' ? formData : {}),
  }
  const nextStatus = normalizeStatus(options.status || existing.data.status || 'completed', SELLER_ONBOARDING_STATUSES, 'completed')
  const update = await client
    .from('private_listing_seller_onboarding')
    .update({
      form_data: nextFormData,
      status: nextStatus,
      submitted_at: existing.data.submitted_at || (nextStatus === 'completed' ? new Date().toISOString() : null),
      seller_type: normalizeNullableText(options.sellerType || existing.data.seller_type || nextFormData.sellerType || nextFormData.ownershipType),
      ownership_structure: normalizeNullableText(options.ownershipStructure || existing.data.ownership_structure || nextFormData.ownershipType),
      marital_regime: normalizeNullableText(options.maritalRegime || existing.data.marital_regime || nextFormData.maritalRegime || nextFormData.marriageRegime),
    })
    .eq('id', existing.data.id)
    .select('*')
    .single()
  if (update.error) throw update.error
  await persistCanonicalSellerFactPayload(client, {
    listingId: normalizedId,
    onboardingId: update.data?.id,
    formData: nextFormData,
    listing: { id: normalizedId },
    draft: nextStatus !== 'completed',
  }).catch((factError) => {
    console.warn('[Private Listings] canonical seller facts persistence skipped after onboarding form update', factError)
    return null
  })
  return update.data
}

export async function syncPrivateListingDistributionData(listingId, payload = {}) {
  const client = requireClient()
  const normalizedId = normalizeUuid(listingId)
  if (!normalizedId) throw new Error('Listing id is required.')

  const publicationData = payload.publicationData && typeof payload.publicationData === 'object'
    ? payload.publicationData
    : {}
  const media = payload.media && typeof payload.media === 'object' ? payload.media : {}
  const externalLinks = normalizeListingExternalLinks(payload.externalLinks)
  const galleryImages = normalizeMediaItems(media.galleryImages)
  const floorplans = normalizeMediaItems(media.floorplans)
  const videoLink = normalizeText(media.videoLink)
  const virtualTourLink = normalizeText(media.virtualTourLink)

  const publicationPayload = {
    listing_id: normalizedId,
    title: normalizeNullableText(publicationData.title),
    address: normalizeNullableText(publicationData.address),
    suburb: normalizeNullableText(publicationData.suburb),
    province: normalizeNullableText(publicationData.province),
    property_type: normalizeNullableText(publicationData.propertyType),
    listing_type: normalizeText(publicationData.listingType) === 'Rental' ? 'Rental' : 'Sale',
    asking_price: normalizeNumber(publicationData.askingPrice),
    bedrooms: normalizeNumber(publicationData.bedrooms),
    bathrooms: normalizeNumber(publicationData.bathrooms),
    garages: normalizeNumber(publicationData.garages),
    parking_bays: normalizeNumber(publicationData.parkingBays),
    floor_size: normalizeNumber(publicationData.floorSize),
    erf_size: normalizeNumber(publicationData.erfSize),
    rates_taxes: normalizeNumber(publicationData.ratesTaxes),
    levies: normalizeNumber(publicationData.levies),
    description: normalizeNullableText(publicationData.description),
    features: Array.isArray(publicationData.features) ? publicationData.features : [],
    amenities: Array.isArray(publicationData.amenities) ? publicationData.amenities : [],
    status: ['Draft', 'Ready', 'Published', 'Archived'].includes(normalizeText(publicationData.status))
      ? normalizeText(publicationData.status)
      : 'Draft',
  }

  const mediaRows = [
    ...galleryImages.map((item, index) => ({
      listing_id: normalizedId,
      media_type: 'image',
      file_url: normalizeText(item.url || item.signedUrl || item.publicUrl),
      caption: normalizeNullableText(item.label || item.name),
      sort_order: index,
      is_cover: normalizeText(item.id) === normalizeText(media.coverImageId) || (!media.coverImageId && index === 0),
    })),
    ...floorplans.map((item, index) => ({
      listing_id: normalizedId,
      media_type: 'floor_plan',
      file_url: normalizeText(item.url || item.signedUrl || item.publicUrl),
      caption: normalizeNullableText(item.label || item.name),
      sort_order: index,
      is_cover: false,
    })),
    ...(videoLink ? [{
      listing_id: normalizedId,
      media_type: 'video',
      file_url: videoLink,
      caption: 'Video link',
      sort_order: galleryImages.length + floorplans.length,
      is_cover: false,
    }] : []),
    ...(virtualTourLink ? [{
      listing_id: normalizedId,
      media_type: 'virtual_tour',
      file_url: virtualTourLink,
      caption: 'Virtual tour link',
      sort_order: galleryImages.length + floorplans.length + (videoLink ? 1 : 0),
      is_cover: false,
    }] : []),
  ].filter((item) => item.file_url)

  const externalLinkRows = externalLinks
    .filter((item) => item.url)
    .map((item) => ({
      listing_id: normalizedId,
      platform: item.platform || 'Other',
      url: item.url,
      status: item.status || 'Draft',
      published_at: item.publishedAt || null,
      last_checked_at: item.lastCheckedAt || null,
      notes: normalizeNullableText(item.notes),
      visible_to_seller: item.visibleToSeller,
    }))

  const publication = await client
    .from('listing_publication_data')
    .upsert(publicationPayload, { onConflict: 'listing_id' })
    .select('*')
    .single()
  if (publication.error) {
    if (isMissingTableError(publication.error, 'listing_publication_data')) return { skipped: true, reason: 'distribution_tables_missing' }
    throw publication.error
  }

  const deleteMedia = await client.from('listing_media').delete().eq('listing_id', normalizedId)
  if (deleteMedia.error) {
    if (isMissingTableError(deleteMedia.error, 'listing_media')) return { skipped: true, reason: 'distribution_tables_missing' }
    throw deleteMedia.error
  }
  if (mediaRows.length) {
    const insertMedia = await client.from('listing_media').insert(mediaRows)
    if (insertMedia.error) throw insertMedia.error
  }

  const deleteLinks = await client.from('listing_external_links').delete().eq('listing_id', normalizedId)
  if (deleteLinks.error) {
    if (isMissingTableError(deleteLinks.error, 'listing_external_links')) return { skipped: true, reason: 'distribution_tables_missing' }
    throw deleteLinks.error
  }
  if (externalLinkRows.length) {
    const insertLinks = await client.from('listing_external_links').insert(externalLinkRows)
    if (insertLinks.error) throw insertLinks.error
  }

  return {
    skipped: false,
    publication: publication.data,
    mediaCount: mediaRows.length,
    externalLinkCount: externalLinkRows.length,
  }
}

function mapPublicationRowToDraft(row = {}) {
  return {
    title: row.title,
    address: row.address,
    suburb: row.suburb,
    province: row.province,
    propertyType: row.property_type,
    listingType: row.listing_type,
    askingPrice: row.asking_price,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    garages: row.garages,
    parkingBays: row.parking_bays,
    floorSize: row.floor_size,
    erfSize: row.erf_size,
    ratesTaxes: row.rates_taxes,
    levies: row.levies,
    description: row.description,
    features: Array.isArray(row.features) ? row.features : [],
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    status: row.status,
  }
}

function mapPublicationDraftToRow(listingId, draft = {}) {
  return {
    listing_id: listingId,
    title: normalizeNullableText(draft.title),
    address: normalizeNullableText(draft.address),
    suburb: normalizeNullableText(draft.suburb),
    province: normalizeNullableText(draft.province),
    property_type: normalizeNullableText(draft.propertyType),
    listing_type: normalizeText(draft.listingType) === 'Rental' ? 'Rental' : 'Sale',
    asking_price: normalizeNumber(draft.askingPrice),
    bedrooms: normalizeNumber(draft.bedrooms),
    bathrooms: normalizeNumber(draft.bathrooms),
    garages: normalizeNumber(draft.garages),
    parking_bays: normalizeNumber(draft.parkingBays),
    floor_size: normalizeNumber(draft.floorSize),
    erf_size: normalizeNumber(draft.erfSize),
    rates_taxes: normalizeNumber(draft.ratesTaxes),
    levies: normalizeNumber(draft.levies),
    description: normalizeNullableText(draft.description),
    features: Array.isArray(draft.features) ? draft.features : [],
    amenities: Array.isArray(draft.amenities) ? draft.amenities : [],
    status: ['Draft', 'Ready', 'Published', 'Archived'].includes(normalizeText(draft.status))
      ? normalizeText(draft.status)
      : 'Draft',
  }
}

async function syncSellerOnboardingPublicationDraft(client, { listing = {}, formData = {} } = {}) {
  const listingId = normalizeUuid(listing?.id)
  if (!listingId) return { skipped: true, reason: 'listing_id_missing' }
  const { facts } = getCanonicalSellerPayloadFromFormData(formData, listing, {
    contextType: 'private_listing',
    contextId: listingId,
    listingId,
    source: 'seller_onboarding',
  })
  const draft = buildSellerOnboardingPublicationDraft({
    listing,
    formData,
    canonicalFacts: facts || listing?.sellerCanonicalFacts || listing?.canonicalFacts || {},
  })

  const existing = await client
    .from('listing_publication_data')
    .select('title, address, suburb, province, property_type, listing_type, asking_price, bedrooms, bathrooms, garages, parking_bays, floor_size, erf_size, rates_taxes, levies, description, features, amenities, status')
    .eq('listing_id', listingId)
    .maybeSingle()
  if (existing.error && !isMissingTableError(existing.error, 'listing_publication_data')) throw existing.error
  if (isMissingTableError(existing.error, 'listing_publication_data')) return { skipped: true, reason: 'distribution_tables_missing' }

  const merged = mergePublicationDraft(mapPublicationRowToDraft(existing.data || {}), draft)
  const upsert = await client
    .from('listing_publication_data')
    .upsert(mapPublicationDraftToRow(listingId, merged), { onConflict: 'listing_id' })
    .select('*')
    .single()
  if (upsert.error) {
    if (isMissingTableError(upsert.error, 'listing_publication_data')) return { skipped: true, reason: 'distribution_tables_missing' }
    throw upsert.error
  }
  return { skipped: false, publication: upsert.data }
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
  if (!query.data || isDeletedPrivateListingRow(query.data)) return null
  const [onboardingMap, requirementsMap, documentsMap, externalLinksMap] = await Promise.all([
    fetchOnboardingRowsForListings(client, [query.data.id]),
    includeRequirementsAndDocuments ? fetchRequirementRowsForListings(client, [query.data.id]) : Promise.resolve(new Map()),
    includeRequirementsAndDocuments ? fetchDocumentRowsForListings(client, [query.data.id]) : Promise.resolve(new Map()),
    fetchExternalLinkRowsForListings(client, [query.data.id]),
  ])
  return mapPrivateListingRow(query.data, onboardingMap, requirementsMap, documentsMap, externalLinksMap)
}

export async function getOrganisationPrivateListings(organisationId, options = {}) {
  const includeRequirementsAndDocuments = options?.includeRequirementsAndDocuments !== false
  const client = requireClient()
  const normalizedOrgId = normalizeUuid(organisationId)
  if (!normalizedOrgId) throw new Error('Organisation id is required.')
  const query = await applyVisiblePrivateListingFilters(
    client
      .from('private_listings')
      .select('*')
      .eq('organisation_id', normalizedOrgId),
  ).order('updated_at', { ascending: false })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listings')) return []
    throw query.error
  }
  const rows = (Array.isArray(query.data) ? query.data : []).filter((row) => !isDeletedPrivateListingRow(row))
  const listingIds = rows.map((row) => row.id)
  const [onboardingMap, requirementsMap, documentsMap, externalLinksMap] = await Promise.all([
    fetchOnboardingRowsForListings(client, listingIds),
    includeRequirementsAndDocuments ? fetchRequirementRowsForListings(client, listingIds) : Promise.resolve(new Map()),
    includeRequirementsAndDocuments ? fetchDocumentRowsForListings(client, listingIds) : Promise.resolve(new Map()),
    fetchExternalLinkRowsForListings(client, listingIds),
  ])
  return rows.map((row) => mapPrivateListingRow(row, onboardingMap, requirementsMap, documentsMap, externalLinksMap)).filter(Boolean)
}

export async function getAgentPrivateListings(
  agentId,
  {
    organisationId = null,
    includeAllOrganisationListings = false,
    assignedAgentEmail = '',
    assignedAgentIds = [],
  } = {},
) {
  const client = requireClient()
  const normalizedAgentId = normalizeUuid(agentId)
  const normalizedOrgId = normalizeUuid(organisationId)
  const normalizedAgentEmail = normalizeText(assignedAgentEmail).toLowerCase()
  const normalizedAgentIds = normalizeUuidList([normalizedAgentId, ...assignedAgentIds])
  if (!includeAllOrganisationListings && !normalizedAgentIds.length && !normalizedAgentEmail) return []
  const queryBuilder = applyVisiblePrivateListingFilters(client.from('private_listings').select('*'))

  if (normalizedOrgId) {
    queryBuilder.eq('organisation_id', normalizedOrgId)
  }
  if (!includeAllOrganisationListings) {
    if (normalizedAgentIds.length > 1) {
      queryBuilder.in('assigned_agent_id', normalizedAgentIds)
    } else if (normalizedAgentIds.length === 1) {
      queryBuilder.eq('assigned_agent_id', normalizedAgentIds[0])
    } else {
      queryBuilder.eq('assigned_agent_email', normalizedAgentEmail)
    }
  }

  const query = await queryBuilder.order('updated_at', { ascending: false })
  if (query.error) {
    if (isMissingColumnError(query.error, 'assigned_agent_email') && !normalizedAgentIds.length) {
      return []
    }
    if (isMissingColumnError(query.error, 'assigned_agent_email') && normalizedOrgId && normalizedAgentIds.length) {
      const retryQuery = await applyVisiblePrivateListingFilters(client.from('private_listings').select('*'))
        .eq('organisation_id', normalizedOrgId)
        .order('updated_at', { ascending: false })
      if (normalizedAgentIds.length > 1) {
        retryQuery.in('assigned_agent_id', normalizedAgentIds)
      } else {
        retryQuery.eq('assigned_agent_id', normalizedAgentIds[0])
      }
      if (retryQuery.error) {
        if (isMissingTableError(retryQuery.error, 'private_listings')) return []
        throw retryQuery.error
      }
      const retryRows = (Array.isArray(retryQuery.data) ? retryQuery.data : []).filter((row) => !isDeletedPrivateListingRow(row))
      const retryListingIds = retryRows.map((row) => row.id)
      const [retryOnboardingMap, retryRequirementsMap, retryDocumentsMap, retryExternalLinksMap] = await Promise.all([
        fetchOnboardingRowsForListings(client, retryListingIds),
        fetchRequirementRowsForListings(client, retryListingIds),
        fetchDocumentRowsForListings(client, retryListingIds),
        fetchExternalLinkRowsForListings(client, retryListingIds),
      ])
      return retryRows.map((row) => mapPrivateListingRow(row, retryOnboardingMap, retryRequirementsMap, retryDocumentsMap, retryExternalLinksMap)).filter(Boolean)
    }
    if (isMissingTableError(query.error, 'private_listings')) return []
    throw query.error
  }
  const rows = (Array.isArray(query.data) ? query.data : []).filter((row) => !isDeletedPrivateListingRow(row))
  const listingIds = rows.map((row) => row.id)
  const [onboardingMap, requirementsMap, documentsMap, externalLinksMap] = await Promise.all([
    fetchOnboardingRowsForListings(client, listingIds),
    fetchRequirementRowsForListings(client, listingIds),
    fetchDocumentRowsForListings(client, listingIds),
    fetchExternalLinkRowsForListings(client, listingIds),
  ])
  return rows.map((row) => mapPrivateListingRow(row, onboardingMap, requirementsMap, documentsMap, externalLinksMap)).filter(Boolean)
}

export async function getAgentPrivateListingSummaries(
  agentId,
  {
    organisationId = null,
    includeAllOrganisationListings = false,
    assignedAgentEmail = '',
  } = {},
) {
  const client = requireClient()
  const normalizedAgentId = normalizeUuid(agentId)
  const normalizedOrgId = normalizeUuid(organisationId)
  const normalizedAgentEmail = normalizeText(assignedAgentEmail).toLowerCase()
  if (!includeAllOrganisationListings && !normalizedAgentId && !normalizedAgentEmail) return []

  const queryBuilder = applyVisiblePrivateListingFilters(
    client
      .from('private_listings')
      .select('id, listing_reference, listing_status, listing_visibility, seller_onboarding_status, mandate_status, mandate_packet_id, asking_price, estimated_value, title, address_line_1, address_line_2, formatted_address, street_address, suburb, city, province, country, postal_code, latitude, longitude, google_place_id, seller_type, finance_context, mandate_type, property_category, property_type, property_structure_type, listing_category, listing_source, stock_source, seller_canonical_facts_json, seller_canonical_fact_readiness_json, seller_lead_id, seller_profile_id, property_profile_id, organisation_id, branch_id, assigned_agent_id, created_at, updated_at'),
  )

  if (normalizedOrgId) {
    queryBuilder.eq('organisation_id', normalizedOrgId)
  }
  if (!includeAllOrganisationListings) {
    if (normalizedAgentId && normalizedAgentEmail) {
      const escapedEmail = String(normalizedAgentEmail).replace(/"/g, '\\"')
      queryBuilder.or(`assigned_agent_id.eq.${normalizedAgentId},assigned_agent_email.eq."${escapedEmail}"`)
    } else if (normalizedAgentId) {
      queryBuilder.eq('assigned_agent_id', normalizedAgentId)
    } else {
      queryBuilder.eq('assigned_agent_email', normalizedAgentEmail)
    }
  }

  const query = await queryBuilder.order('updated_at', { ascending: false })
  if (query.error) {
    if (isMissingTableError(query.error, 'private_listings')) return []
    throw query.error
  }
  const rows = (Array.isArray(query.data) ? query.data : []).filter((row) => !isDeletedPrivateListingRow(row))
  return rows.map((row) => mapPrivateListingSummaryRow(row)).filter(Boolean)
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
  return enrichPrivateListingDocumentRows(client, query.data)
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

async function listSellerJourneyLeadCandidates(
  client,
  {
    organisationId = '',
    leadIds = [],
    onboardingToken = '',
    listingId = '',
  } = {},
) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(normalizedOrganisationId)) return []

  const rows = []
  const seen = new Set()
  const addRows = (items = []) => {
    for (const row of Array.isArray(items) ? items : []) {
      const key = normalizeText(row?.lead_id)
      if (!key || seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
  }

  const normalizedLeadIds = Array.from(new Set(
    (Array.isArray(leadIds) ? leadIds : [])
      .map((value) => normalizeUuid(normalizeText(value).replace(/^lead_/i, '')))
      .filter(Boolean),
  ))

  for (const leadId of normalizedLeadIds) {
    const result = await client
      .from('leads')
      .select('lead_id, organisation_id, lead_category, stage, status')
      .eq('organisation_id', normalizedOrganisationId)
      .eq('lead_id', leadId)
      .maybeSingle()
    if (!result.error && result.data) addRows([result.data])
  }

  const normalizedToken = normalizeText(onboardingToken)
  if (normalizedToken) {
    const tokenResult = await client
      .from('leads')
      .select('lead_id, organisation_id, lead_category, stage, status')
      .eq('organisation_id', normalizedOrganisationId)
      .eq('seller_onboarding_token', normalizedToken)
    if (!tokenResult.error) addRows(tokenResult.data)
  }

  const normalizedListingId = normalizeText(listingId)
  if (normalizedListingId) {
    const listingResult = await client
      .from('leads')
      .select('lead_id, organisation_id, lead_category, stage, status')
      .eq('organisation_id', normalizedOrganisationId)
      .eq('listing_id', normalizedListingId)
    if (!listingResult.error) addRows(listingResult.data)
  }

  return rows
}

async function syncSellerJourneyLeadStage(
  client,
  {
    organisationId = '',
    leadIds = [],
    onboardingToken = '',
    listingId = '',
    targetStage = '',
    targetStatus = '',
    extraPayload = {},
  } = {},
) {
  const candidates = await listSellerJourneyLeadCandidates(client, {
    organisationId,
    leadIds,
    onboardingToken,
    listingId,
  })
  if (!candidates.length) return false

  let synced = false
  for (const lead of candidates) {
    const patch = buildSellerJourneyProgressPatch({
      lead,
      targetStage,
      targetStatus,
    })
    if (!patch) continue
    const result = await updateLeadRowsWithFallback(
      client,
      (query) => query.eq('organisation_id', normalizeText(organisationId)).eq('lead_id', normalizeText(lead?.lead_id)),
      {
        stage: patch.stage,
        status: patch.status,
        updated_at: new Date().toISOString(),
        ...(extraPayload && typeof extraPayload === 'object' ? extraPayload : {}),
      },
      { label: `seller_journey:${normalizeText(lead?.lead_id)}` },
    )
    if (result.matched) synced = true
  }
  return synced
}

async function syncSellerJourneyLeadStageFromListing(
  client,
  {
    organisationId = '',
    leadIds = [],
    onboardingToken = '',
    listingId = '',
    listing = null,
  } = {},
) {
  const lifecycle = mapLegacyListingStatusToCanonicalStatus(
    listing?.listingStatus || listing?.listing_status || listing?.status || listing?.lifecycleStatus || listing?.lifecycle_status,
  )
  const documentsSubmitted = areSellerJourneyDocumentsSubmitted({
    listing: listing || {},
    documents: Array.isArray(listing?.documents) ? listing.documents : [],
  })

  let targetStage = ''
  let targetStatus = ''
  if (lifecycle === 'onboarding_sent') {
    targetStage = 'Seller Onboarding Sent'
    targetStatus = 'Sent'
  } else if (['onboarding_completed', 'listing_review', 'mandate_ready'].includes(lifecycle)) {
    targetStage = 'Seller Onboarding Submitted'
    targetStatus = 'Submitted'
  } else if (lifecycle === 'mandate_sent') {
    targetStage = 'Mandate Sent'
    targetStatus = 'Sent'
  } else if (lifecycle === 'mandate_signed') {
    targetStage = 'Mandate Signed'
    targetStatus = 'Signed'
  } else if (['active', 'under_offer', 'transaction_created', 'sold'].includes(lifecycle)) {
    targetStage = documentsSubmitted ? 'All Documents Submitted' : 'Listing Live'
    targetStatus = documentsSubmitted ? 'Submitted' : 'Live'
  }

  if (!targetStage) return false

  return syncSellerJourneyLeadStage(client, {
    organisationId,
    leadIds,
    onboardingToken,
    listingId,
    targetStage,
    targetStatus,
    extraPayload: {
      listing_id: normalizeText(listing?.id || listingId) || null,
    },
  })
}

async function syncSellerJourneyLeadStageForListingId(
  client,
  {
    listingId = '',
    organisationId = '',
    leadIds = [],
    onboardingToken = '',
  } = {},
) {
  const normalizedListingId = normalizeUuid(listingId)
  if (!normalizedListingId) return false

  const listing = await getPrivateListing(normalizedListingId, { includeRequirementsAndDocuments: true }).catch(() => null)
  if (!listing) return false

  const linkedLeadIds = [
    listing?.sellerLeadId,
    listing?.seller_lead_id,
    listing?.originatingCrmLeadId,
    listing?.originating_crm_lead_id,
    listing?.leadId,
    listing?.lead_id,
  ].map(normalizeText).filter(Boolean)

  const sellerJourneyLeadIds = Array.from(new Set([
    ...linkedLeadIds,
    ...(Array.isArray(leadIds) ? leadIds.map(normalizeText).filter(Boolean) : []),
  ]))

  return syncSellerJourneyLeadStageFromListing(client, {
    organisationId: normalizeText(organisationId || listing?.organisationId),
    leadIds: sellerJourneyLeadIds,
    onboardingToken: normalizeText(onboardingToken || listing?.sellerOnboarding?.token || listing?.seller_onboarding_token),
    listingId: normalizedListingId,
    listing,
  })
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
  const existingFormData = existingQuery.data?.form_data && typeof existingQuery.data.form_data === 'object'
    ? existingQuery.data.form_data
    : {}
  const portalBranding = await fetchOrganisationBrandingSnapshot(client, listing.organisationId)
  const payload = {
    private_listing_id: listing.id,
    token,
    token_expires_at: expiresAt,
    seller_type: normalizeNullableText(sellerType || listing.sellerType),
    ownership_structure: normalizeNullableText(ownershipStructure),
    marital_regime: normalizeNullableText(maritalRegime),
    form_data: {
      ...existingFormData,
      ...(portalBranding ? { portalBranding } : {}),
    },
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
  void syncSellerJourneyLeadStage(client, {
    organisationId: leadOrganisationId,
    leadIds: leadIdsToSync,
    onboardingToken: token,
    listingId: listing.id,
    targetStage: 'Seller Onboarding Sent',
    targetStatus: 'Sent',
    extraPayload: {
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

  const portalPayload = await fetchSellerClientPortalPayloadByToken(client, normalizedToken, {
    accessToken: options?.sellerPortalAccessToken,
    requirePortalAccess: options?.requirePortalAccess === true,
  })
  if (portalPayload?.portalAuth?.authRequired) {
    throw buildSellerPortalAuthRequiredError(portalPayload.portalAuth)
  }
  if (portalPayload?.listing) {
    const branding = await fetchOrganisationBrandingSnapshot(client, portalPayload.listing.organisationId)
    return {
      ...portalPayload,
      listing: attachBrandingToListing(portalPayload.listing, branding),
    }
  }

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
  const branding = await fetchOrganisationBrandingSnapshot(client, listing?.organisationId)
  return {
    onboarding: query.data,
    listing: attachBrandingToListing(listing, branding),
  }
}

async function maybeResolveCanonicalSellerRequirements({ listing, formData, client = supabase, reason = 'seller_onboarding_progress', force = false } = {}) {
  if (!isCanonicalOnboardingResolverEnabled({ force })) {
    return {
      skipped: true,
      reason: 'canonical_onboarding_resolver_disabled',
      flag: CANONICAL_ONBOARDING_RESOLVER_FLAG,
    }
  }

  const { facts } = getCanonicalSellerPayloadFromFormData(formData, listing, {
    contextType: 'private_listing',
    contextId: normalizeText(listing?.id),
    listingId: normalizeText(listing?.id),
    source: reason,
  })
  if (!facts) {
    return { skipped: true, reason: 'canonical_seller_facts_missing' }
  }

  const listingId = normalizeText(listing?.id || facts?.context?.listing_id || facts?.context?.id)
  if (!listingId) {
    return { skipped: true, reason: 'listing_id_missing' }
  }

  const resolverInput = buildSellerResolverInputFromFacts(facts, {
    contextType: 'private_listing',
    contextId: listingId,
    listingId,
    options: {
      regenerate: true,
      sourceSystem: 'seller_onboarding',
      resolverVersion: facts?.context?.facts_version || 'seller_onboarding_facts_v1',
      metadata: {
        reason,
      },
    },
  })

  const resolution = await resolveRequirements(resolverInput, { client })
  await syncCanonicalToPrivateListingRequirements({
    contextId: listingId,
    listingId,
    client,
  }).catch((adapterError) => {
    console.warn('[Private Listings] canonical seller requirement legacy projection skipped', adapterError)
    return null
  })
  return resolution
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
    await notifySellerPortalDocumentsReady(client, {
      listing: rpcContext.listing,
      onboarding: rpcContext.onboarding,
      formData: payload.formData,
    }).catch((portalEmailError) => {
      console.warn('[Private Listings] seller portal email skipped after onboarding submit', portalEmailError)
      return null
    })
    await persistCanonicalSellerFactPayload(client, {
      listingId: rpcContext.listing.id,
      onboardingId: rpcContext.onboarding?.id,
      formData: payload.formData,
      listing: rpcContext.listing,
      draft: false,
    }).catch((factError) => {
      console.warn('[Private Listings] canonical seller facts persistence skipped after onboarding submit', factError)
      return null
    })
    await syncSellerOnboardingPublicationDraft(client, {
      listing: rpcContext.listing,
      formData: payload.formData,
    }).catch((publicationError) => {
      console.warn('[Private Listings] seller onboarding publication draft sync skipped after onboarding submit', publicationError)
      return null
    })
    void maybeResolveCanonicalSellerRequirements({
      listing: rpcContext.listing,
      formData: payload.formData,
      client,
      reason: 'seller_onboarding_completed',
    }).catch((canonicalError) => {
      console.warn('[Private Listings] canonical seller requirement resolution skipped after onboarding submit', canonicalError)
    })
    const leadOrganisationId = normalizeText(rpcContext.listing?.organisationId)
    const rawLeadIds = [
      normalizeText(rpcContext.listing?.sellerLeadId),
      normalizeText(rpcContext.listing?.originatingCrmLeadId),
    ]
    const listingIdForLeadSync = normalizeText(rpcContext.listing?.id)
    const leadTokenForLeadSync = normalizeText(rpcContext.onboarding?.token || rpcContext.listing?.sellerOnboarding?.token)
    const leadIdsToSync = new Set(rawLeadIds.filter(Boolean))
    for (const rawLeadId of rawLeadIds) {
      if (isUuidLike(rawLeadId)) continue
      const normalizedLeadId = normalizeUuid(rawLeadId)
      if (normalizedLeadId) leadIdsToSync.add(normalizedLeadId)
    }

    await syncSellerJourneyLeadStage(client, {
      organisationId: leadOrganisationId,
      leadIds: Array.from(leadIdsToSync),
      onboardingToken: leadTokenForLeadSync,
      listingId: listingIdForLeadSync,
      targetStage: 'Seller Onboarding Submitted',
      targetStatus: 'Submitted',
      extraPayload: {
        seller_onboarding_status: 'completed',
        seller_onboarding_token: normalizeNullableText(rpcContext.onboarding?.token || rpcContext.listing?.sellerOnboarding?.token || ''),
        listing_id: listingIdForLeadSync || null,
        updated_at: new Date().toISOString(),
      },
    }).catch(() => false)
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

  await syncSellerJourneyLeadStage(client, {
    organisationId: leadOrganisationId,
    leadIds: Array.from(leadIdsToSync),
    onboardingToken: leadTokenForLeadSync,
    listingId: listingIdForLeadSync,
    targetStage: 'Seller Onboarding Submitted',
    targetStatus: 'Submitted',
    extraPayload: {
      seller_onboarding_status: 'completed',
      seller_onboarding_token: normalizeNullableText(context.onboarding?.token || context.listing?.sellerOnboarding?.token || ''),
      listing_id: listingIdForLeadSync || null,
      updated_at: nowIso,
    },
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
  await notifySellerPortalDocumentsReady(client, {
    listing: listingForContext,
    onboarding: updateOnboarding.data,
    formData: nextFormData,
  }).catch((portalEmailError) => {
    console.warn('[Private Listings] seller portal email skipped after onboarding fallback submit', portalEmailError)
    return null
  })
  await persistCanonicalSellerFactPayload(client, {
    listingId: listingForContext?.id || context.listing.id,
    onboardingId: updateOnboarding.data?.id,
    formData: nextFormData,
    listing: listingForContext,
    draft: false,
  }).catch((factError) => {
    console.warn('[Private Listings] canonical seller facts persistence skipped after onboarding fallback submit', factError)
    return null
  })
  await syncSellerOnboardingPublicationDraft(client, {
    listing: listingForContext,
    formData: nextFormData,
  }).catch((publicationError) => {
    console.warn('[Private Listings] seller onboarding publication draft sync skipped after onboarding fallback submit', publicationError)
    return null
  })
  void maybeResolveCanonicalSellerRequirements({
    listing: listingForContext,
    formData: nextFormData,
    client,
    reason: 'seller_onboarding_completed',
  }).catch((canonicalError) => {
    console.warn('[Private Listings] canonical seller requirement resolution skipped after onboarding fallback submit', canonicalError)
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
    await persistCanonicalSellerFactPayload(client, {
      listingId: rpcContext.listing.id,
      onboardingId: rpcContext.onboarding?.id,
      formData: payload.formData,
      listing: rpcContext.listing,
      draft: true,
    }).catch((factError) => {
      console.warn('[Private Listings] canonical seller facts persistence skipped after onboarding progress update', factError)
      return null
    })
    void maybeResolveCanonicalSellerRequirements({
      listing: rpcContext.listing,
      formData: payload.formData,
      client,
      reason: 'seller_onboarding_progress',
    }).catch((canonicalError) => {
      console.warn('[Private Listings] canonical seller requirement resolution skipped after onboarding progress update', canonicalError)
    })
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

  const refreshedListing = await getPrivateListing(context.listing.id, { includeRequirementsAndDocuments: false })
  await persistCanonicalSellerFactPayload(client, {
    listingId: refreshedListing?.id || context.listing.id,
    onboardingId: updateQuery.data?.id,
    formData: nextFormData,
    listing: refreshedListing || context.listing,
    draft: true,
  }).catch((factError) => {
    console.warn('[Private Listings] canonical seller facts persistence skipped after onboarding fallback progress update', factError)
    return null
  })
  void maybeResolveCanonicalSellerRequirements({
    listing: refreshedListing || context.listing,
    formData: nextFormData,
    client,
    reason: 'seller_onboarding_progress',
  }).catch((canonicalError) => {
    console.warn('[Private Listings] canonical seller requirement resolution skipped after onboarding fallback progress update', canonicalError)
  })

  return {
    onboarding: updateQuery.data,
    listing: refreshedListing,
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
  const canonicalGate = await canAdvanceWorkflowStage({
    contextType: 'private_listing',
    contextId: listing.id,
    targetStage: targetStatus,
    actorRole: options?.actorRole || 'agent',
    actorUserId: options?.actorUserId || options?.performedBy || null,
    client: supabase,
    override: Boolean(options?.allowOverride),
  }).catch((error) => ({
    allowed: true,
    can_advance: true,
    skipped: true,
    reason: null,
    warning: null,
    error: error?.message || 'canonical_gate_evaluation_failed',
  }))
  const canonicalBlockers = canonicalGate?.allowed === false
    ? [canonicalGate.reason || 'Canonical document readiness is blocking this listing stage.']
    : []

  return {
    listing,
    ...evaluation,
    canonicalGate,
    allowed: evaluation.allowed && canonicalBlockers.length === 0,
    blockers: [...(evaluation.blockers || []), ...canonicalBlockers],
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
  const requirement = rows[0] || null

  if (requirement?.private_listing_id) {
    await syncSellerJourneyLeadStageForListingId(client, {
      listingId: requirement.private_listing_id,
    }).catch((error) => {
      console.warn('[Private Listings] non-blocking seller journey lead sync skipped after requirement update', error)
      return false
    })
  }

  return requirement
}

export async function uploadSellerClientPortalDocument({
  token,
  accessToken = '',
  file,
  requirementKey = '',
  requirementInstanceId = '',
  documentType = '',
  category = 'Seller Document',
} = {}) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) throw new Error('Seller client portal token is required.')
  if (!file) throw new Error('A file is required.')

  const context = await getSellerOnboardingByToken(normalizedToken, {
    includeRequirementsAndDocuments: true,
    requirePortalAccess: true,
    sellerPortalAccessToken: accessToken || getStoredSellerPortalAccessToken(normalizedToken),
  })
  const listing = context?.listing || null
  if (!listing?.id) throw new Error('Seller client portal link is invalid or inactive.')

  const normalizedRequirementKey = normalizeText(requirementKey)
  const canonicalRequirementInstanceId = normalizeUuid(requirementInstanceId)
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
    p_canonical_requirement_instance_id: canonicalRequirementInstanceId || null,
    p_category: category || 'Seller Document',
    p_access_token: accessToken || getStoredSellerPortalAccessToken(normalizedToken) || null,
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
  const promotedSharedDocument = rpc.data?.shared_document && typeof rpc.data.shared_document === 'object'
    ? rpc.data.shared_document
    : null
  const pendingTransactionPromotion = Boolean(rpc.data?.pending_transaction_promotion)
  const promotedTransactionId = normalizeText(rpc.data?.transaction_id || '')

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
      ...(canonicalRequirementInstanceId ? { canonical_requirement_instance_id: canonicalRequirementInstanceId } : {}),
    }
    const inserted = await insertPrivateListingDocumentRow(client, insertPayload)
    if (inserted.error && !isMissingColumnError(inserted.error) && !isMissingTableError(inserted.error, 'private_listing_documents')) {
      throw inserted.error
    }
    documentRow = normalizeDocumentRows(inserted.data ? [{ ...insertPayload, ...inserted.data }] : [insertPayload])[0] || null

    if (matchedRequirement?.id) {
      await updatePrivateListingRequirementStatus(matchedRequirement.id, 'uploaded').catch(() => null)
    }
  }

  if (canonicalRequirementInstanceId) {
    await linkUploadedDocumentToRequirement({
      requirementInstanceId: canonicalRequirementInstanceId,
      documentId: documentRow?.id || null,
      documentTable: 'private_listing_documents',
      contextType: 'private_listing',
      contextId: listing.id,
      actorRole: 'seller',
      metadata: {
        private_listing_document_id: documentRow?.id || null,
        requirement_key: normalizedRequirementKey || matchedRequirement?.requirement_key || null,
        storage_path: documentRow?.storage_path || filePath,
        uploaded_at: documentRow?.uploaded_at || new Date().toISOString(),
        source_system: 'seller_client_portal_upload',
      },
      client,
      force: true,
    }).catch((linkError) => {
      console.warn('[Private Listings] canonical seller upload link skipped', linkError)
      return null
    })
  }

  await syncSellerJourneyLeadStageForListingId(client, {
    listingId: listing.id,
    organisationId: normalizeText(listing?.organisationId),
    onboardingToken: normalizedToken,
  }).catch((error) => {
    console.warn('[Private Listings] non-blocking seller journey lead sync skipped after seller portal upload', error)
    return false
  })

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
    canonicalRequirementInstanceId: canonicalRequirementInstanceId || null,
    pendingTransactionPromotion,
    transactionId: promotedTransactionId || null,
    sharedDocumentId: promotedSharedDocument?.id || documentRow?.promoted_document_id || null,
    promotedDocumentId: promotedSharedDocument?.id || documentRow?.promoted_document_id || null,
    sharedDocument: promotedSharedDocument,
  }
}

export async function uploadPrivateListingDocument(listingId, file, {
  documentType = 'listing_document',
  documentCategory = '',
  documentName = '',
  visibility = 'internal',
  status = 'uploaded',
} = {}) {
  const client = requireClient()
  const user = await getCurrentUser(client).catch(() => null)
  const normalizedListingId = normalizeUuid(listingId)
  if (!normalizedListingId) throw new Error('Listing id is required.')
  if (!file) throw new Error('A file is required.')

  const safeOriginalName = normalizeText(documentName || file.name || 'listing-document')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 140) || 'listing-document'
  const filePath = `private-listings/${normalizedListingId}/documents/${Date.now()}-${safeOriginalName}`

  await uploadToPrivateListingDocumentsBucket(client, filePath, file, {
    upsert: false,
    contentType: file.type || undefined,
  })

  const insertPayload = {
    private_listing_id: normalizedListingId,
    requirement_id: null,
    document_type: normalizeText(documentType) || 'listing_document',
    category: normalizeText(documentCategory || documentType) || 'Other',
    document_name: documentName || file.name || safeOriginalName,
    storage_path: filePath,
    file_url: null,
    uploaded_by: user?.id || null,
    status: normalizeText(status) || 'uploaded',
    visibility: normalizeText(visibility) || 'internal',
    uploaded_at: new Date().toISOString(),
  }

  const inserted = await insertPrivateListingDocumentRow(client, insertPayload)
  if (inserted.error && !isMissingColumnError(inserted.error) && !isMissingTableError(inserted.error, 'private_listing_documents')) {
    throw inserted.error
  }
  const documentRow = normalizeDocumentRows(inserted.data ? [{ ...insertPayload, ...inserted.data }] : [insertPayload])[0] || null

  await createPrivateListingActivity({
    privateListingId: normalizedListingId,
    activityType: 'listing_document_uploaded',
    activityTitle: 'Listing document uploaded',
    activityDescription: `${insertPayload.document_name} uploaded.`,
    performedBy: user?.id || null,
    visibility: 'internal',
    metadata: {
      documentType: insertPayload.document_type,
      documentCategory: insertPayload.category,
      documentName: insertPayload.document_name,
      storagePath: filePath,
      source: 'quick_add',
    },
  }).catch(() => null)

  await syncSellerJourneyLeadStageForListingId(client, {
    listingId: normalizedListingId,
  }).catch((error) => {
    console.warn('[Private Listings] non-blocking seller journey lead sync skipped after listing document upload', error)
    return false
  })

  return {
    id: documentRow?.id || filePath,
    document_name: documentRow?.document_name || insertPayload.document_name,
    document_type: documentRow?.document_type || insertPayload.document_type,
    category: documentRow?.category || insertPayload.category,
    status: documentRow?.status || insertPayload.status,
    storage_path: documentRow?.storage_path || filePath,
    uploaded_at: documentRow?.uploaded_at || insertPayload.uploaded_at,
    url: await createPrivateListingDocumentSignedUrl(client, documentRow?.storage_path || filePath),
    privateListingId: normalizedListingId,
  }
}

export async function createSellerClientPortalDocumentSignedUrl({
  token,
  accessToken = '',
  filePath,
  expiresInSeconds = 60,
} = {}) {
  const client = requireClient()
  const normalizedToken = normalizeText(token)
  const normalizedFilePath = normalizeText(filePath)
  if (!normalizedToken) throw new Error('Seller client portal token is required.')
  if (!normalizedFilePath) throw new Error('Document path is required.')

  const context = await getSellerOnboardingByToken(normalizedToken, {
    includeRequirementsAndDocuments: false,
    requirePortalAccess: true,
    sellerPortalAccessToken: accessToken || getStoredSellerPortalAccessToken(normalizedToken),
  })
  if (!context?.listing?.id) throw new Error('Seller client portal link is invalid or inactive.')
  const listingPathPrefix = `seller-portal/${context.listing.id}/`
  if (!normalizedFilePath.startsWith(listingPathPrefix)) {
    throw new Error('This document is not available in this client portal.')
  }

  const signedUrl = await createPrivateListingDocumentSignedUrl(client, normalizedFilePath, expiresInSeconds)
  if (!signedUrl) throw new Error('Unable to open this document right now.')
  return signedUrl
}

export async function createPrivateListingDocumentDownloadUrl({
  listingId,
  filePath,
  expiresInSeconds = 60,
} = {}) {
  const client = requireClient()
  const normalizedListingId = normalizeUuid(listingId)
  const normalizedFilePath = normalizeText(filePath)
  if (!normalizedListingId) throw new Error('Listing id is required.')
  if (!normalizedFilePath) throw new Error('Document path is required.')

  await getPrivateListing(normalizedListingId, { includeRequirementsAndDocuments: false })
  const allowedPrefixes = [
    `seller-portal/${normalizedListingId}/`,
    `private-listings/${normalizedListingId}/`,
  ]
  if (!allowedPrefixes.some((prefix) => normalizedFilePath.startsWith(prefix))) {
    throw new Error('This document is not linked to the selected listing.')
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

  if (validation.targetStatus === 'mandate_sent') {
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

  const sellerJourneyLeadIds = Array.from(new Set([
    normalizeText(updatedListing?.sellerLeadId),
    normalizeText(updatedListing?.originatingCrmLeadId),
    normalizeText(validation.listing?.sellerLeadId),
    normalizeText(validation.listing?.originatingCrmLeadId),
  ].filter(Boolean)))
  await syncSellerJourneyLeadStageFromListing(client, {
    organisationId: normalizeText(updatedListing?.organisationId || validation.listing?.organisationId),
    leadIds: sellerJourneyLeadIds,
    onboardingToken: normalizeText(updatedListing?.sellerOnboarding?.token || updatedListing?.seller_onboarding_token),
    listingId: normalizeText(updatedListing?.id || validation.listing?.id),
    listing: updatedListing,
  }).catch((error) => {
    console.warn('[Private Listings] non-blocking seller journey lead sync skipped after listing transition', error)
    return false
  })

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
