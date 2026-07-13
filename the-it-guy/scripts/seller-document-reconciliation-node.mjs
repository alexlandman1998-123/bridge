import { isSupabaseConfigured, supabase } from '../src/lib/supabaseClient.js'
import {
  buildSellerDocumentRequirementReconciliationReport,
  summarizeSellerDocumentRequirementReconciliationReport,
} from '../src/services/sellerDocumentRequirementsService.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeUuidList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map(normalizeText)
    .filter(Boolean))]
}

function isMissingTableError(error = null, tableName = '') {
  const message = normalizeText(error?.message || error).toLowerCase()
  const code = normalizeText(error?.code)
  return code === '42P01' || (tableName && message.includes(tableName.toLowerCase()) && message.includes('does not exist'))
}

function isDeletedPrivateListingRow(row = {}) {
  const status = normalizeText(row.listing_status || row.status).toLowerCase()
  const visibility = normalizeText(row.listing_visibility || row.visibility).toLowerCase()
  return ['withdrawn', 'deleted', 'archived'].includes(status) || ['archived', 'deleted'].includes(visibility)
}

function getOnboardingFormData(row = {}, onboarding = null) {
  if (isPlainObject(onboarding?.form_data)) return onboarding.form_data
  if (isPlainObject(onboarding?.formData)) return onboarding.formData
  if (isPlainObject(row?.seller_onboarding_form_data)) return row.seller_onboarding_form_data
  if (isPlainObject(row?.sellerOnboardingFormData)) return row.sellerOnboardingFormData
  const canonicalFacts = isPlainObject(row?.seller_canonical_facts_json) ? row.seller_canonical_facts_json : {}
  if (isPlainObject(canonicalFacts?.formData)) return canonicalFacts.formData
  if (isPlainObject(canonicalFacts?.raw)) return canonicalFacts.raw
  return canonicalFacts
}

function mapListingRow(row = {}, onboardingMap = new Map(), requirementsMap = new Map()) {
  const listingId = normalizeText(row.id)
  const onboarding = onboardingMap.get(listingId) || null
  const canonicalFacts = isPlainObject(row?.seller_canonical_facts_json) ? row.seller_canonical_facts_json : {}
  const formData = getOnboardingFormData(row, onboarding)
  const sellerOnboardingStatus = normalizeText(onboarding?.status || row.seller_onboarding_status || row.sellerOnboardingStatus)

  return {
    ...row,
    id: listingId,
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    sellerLeadId: normalizeText(row.seller_lead_id || row.sellerLeadId || row.originating_crm_lead_id || row.originatingCrmLeadId),
    title: normalizeText(row.title || row.listing_reference || row.address_line_1 || listingId),
    listingStatus: normalizeText(row.listing_status || row.listingStatus || row.status),
    listing_status: normalizeText(row.listing_status || row.listingStatus || row.status),
    sellerOnboardingStatus,
    seller_onboarding_status: sellerOnboardingStatus,
    sellerType: normalizeText(row.seller_type || row.sellerType || formData?.sellerType),
    seller_type: normalizeText(row.seller_type || row.sellerType || formData?.sellerType),
    propertyStructureType: normalizeText(row.property_structure_type || row.propertyStructureType || formData?.propertyStructureType),
    property_structure_type: normalizeText(row.property_structure_type || row.propertyStructureType || formData?.propertyStructureType),
    propertyCategory: normalizeText(row.property_category || row.propertyCategory || formData?.propertyCategory),
    propertyType: normalizeText(row.property_type || row.propertyType || formData?.propertyType),
    occupancyStatus: normalizeText(row.occupancy_status || row.occupancyStatus || formData?.occupancyStatus),
    sellerOnboarding: {
      status: sellerOnboardingStatus,
      formData,
      canonicalFacts,
      submittedAt: onboarding?.submitted_at || null,
      updatedAt: onboarding?.updated_at || onboarding?.created_at || null,
    },
    sellerCanonicalFacts: canonicalFacts,
    documentRequirements: requirementsMap.get(listingId) || [],
  }
}

async function fetchListingRows({ organisationId = '', listingIds = [], limit = 100 } = {}) {
  const maxRows = Math.max(1, Math.min(Number(limit || 100) || 100, 500))
  const ids = normalizeUuidList(listingIds).slice(0, maxRows)
  let query = supabase.from('private_listings').select('*')
  if (ids.length) query = query.in('id', ids)
  else query = query.eq('organisation_id', normalizeText(organisationId))
  const result = await query.order('updated_at', { ascending: false }).limit(maxRows)
  if (result.error) {
    if (isMissingTableError(result.error, 'private_listings')) return []
    throw result.error
  }
  return (Array.isArray(result.data) ? result.data : []).filter((row) => !isDeletedPrivateListingRow(row))
}

async function fetchOnboardingRows(listingIds = []) {
  const ids = normalizeUuidList(listingIds)
  if (!ids.length) return new Map()
  const result = await supabase
    .from('private_listing_seller_onboarding')
    .select('id, private_listing_id, form_data, status, submitted_at, created_at, updated_at')
    .in('private_listing_id', ids)
    .order('created_at', { ascending: false })
  if (result.error) {
    if (isMissingTableError(result.error, 'private_listing_seller_onboarding')) return new Map()
    throw result.error
  }
  const map = new Map()
  for (const row of result.data || []) {
    const listingId = normalizeText(row.private_listing_id)
    if (listingId && !map.has(listingId)) map.set(listingId, row)
  }
  return map
}

async function fetchRequirementRows(listingIds = []) {
  const ids = normalizeUuidList(listingIds)
  if (!ids.length) return new Map()
  const result = await supabase
    .from('private_listing_document_requirements')
    .select('*')
    .in('private_listing_id', ids)
    .order('created_at', { ascending: true })
  if (result.error) {
    if (isMissingTableError(result.error, 'private_listing_document_requirements')) return new Map()
    throw result.error
  }
  const map = new Map()
  for (const row of result.data || []) {
    const listingId = normalizeText(row.private_listing_id)
    if (!listingId) continue
    const rows = map.get(listingId) || []
    rows.push(row)
    map.set(listingId, rows)
  }
  return map
}

export async function runNodeSellerDocumentRequirementReconciliation({
  organisationId = '',
  listingIds = [],
  limit = 100,
  dryRun = true,
} = {}) {
  if (dryRun === false) {
    throw new Error('The Node seller document reconciliation runner is dry-run only.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
  const normalizedListingIds = normalizeUuidList(listingIds)
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!normalizedOrganisationId && !normalizedListingIds.length) {
    throw new Error('Provide organisationId or listingIds before reconciling seller document requirements.')
  }

  const listingRows = await fetchListingRows({
    organisationId: normalizedOrganisationId,
    listingIds: normalizedListingIds,
    limit,
  })
  const foundListingIds = listingRows.map((row) => normalizeText(row.id)).filter(Boolean)
  const [onboardingMap, requirementsMap] = await Promise.all([
    fetchOnboardingRows(foundListingIds),
    fetchRequirementRows(foundListingIds),
  ])
  const listings = listingRows.map((row) => mapListingRow(row, onboardingMap, requirementsMap))
  const loadErrors = normalizedListingIds
    .filter((listingId) => !foundListingIds.includes(listingId))
    .map((listingId) => ({
      listingId,
      status: 'load_failed',
      errorMessage: 'Listing could not be loaded.',
    }))
  const report = buildSellerDocumentRequirementReconciliationReport(listings, { dryRun: true })
  if (loadErrors.length) {
    report.actionQueues.manualReview.push(...loadErrors)
    report.summary.loadFailed = loadErrors.length
  }

  return {
    ...report,
    mode: 'dry-run',
    recommendation: report.summary.syncable
      ? 'Run again with dryRun: false after reviewing the syncable queue.'
      : 'No seller document requirement reconciliation needed.',
    summaryText: summarizeSellerDocumentRequirementReconciliationReport(report),
  }
}
