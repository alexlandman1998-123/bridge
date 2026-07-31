import { supabase } from '../lib/supabaseClient'
import {
  normalizeListingSource,
  normalizePropertyCategory,
  normalizePropertyStructureType,
} from '../lib/propertyTaxonomy'

const DELETED_LISTING_STATUSES = new Set(['deleted', 'archived', 'withdrawn'])
const DELETED_LISTING_VISIBILITIES = new Set(['deleted', 'archived'])
const LISTING_VISIBILITY = ['internal', 'agent_visible', 'seller_visible', 'public']
const MANDATE_STATUSES = ['not_started', 'draft', 'sent', 'signed', 'expired', 'cancelled']
const SELLER_ONBOARDING_STATUSES = ['not_started', 'invited', 'in_progress', 'submitted', 'completed', 'cancelled']

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase client is not configured.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeStatusKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
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
  for (const value of entries) {
    const normalized = normalizeUuid(value)
    if (normalized) valid.add(normalized)
  }
  return [...valid]
}

function normalizeStatus(value, allowed, fallback) {
  const normalized = normalizeText(value).toLowerCase()
  return allowed.includes(normalized) ? normalized : fallback
}

function isMissingTableError(error, tableName = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const status = Number(String(error.status || error.statusCode || 0))
  const text = String(error.message || '').toLowerCase()
  const tableNameHint = normalizeText(tableName).toLowerCase()
  return (
    code === '42p01' ||
    code === 'pgrst205' ||
    code === 'not_found' ||
    status === 404 ||
    text.includes('schema cache') ||
    text.includes('could not find the table') ||
    text.includes('relation does not exist') ||
    Boolean(tableNameHint && text.includes(tableNameHint) && (
      text.includes('does not exist') ||
      text.includes('not found') ||
      text.includes('could not find') ||
      text.includes('schema cache')
    ))
  )
}

function isDeletedPrivateListingRow(row = {}) {
  const status = normalizeStatusKey(row.listing_status || row.listingStatus || row.status || row.lifecycleStatus)
  const visibility = normalizeStatusKey(row.listing_visibility || row.listingVisibility)
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

function pickFirstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function getPrivateListingCommissionTerms(formData = {}) {
  const onboardingFormData = formData && typeof formData === 'object' ? formData : {}
  return {
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
}

function mapLegacyListingStatusToCanonicalStatus(value = '') {
  const normalized = normalizeStatusKey(value)
  if (['active', 'live', 'listed', 'published'].includes(normalized)) return 'active'
  if (['draft', 'new'].includes(normalized)) return 'draft'
  if (['mandate_pending', 'pending_mandate', 'mandate_sent'].includes(normalized)) return 'mandate_pending'
  if (['offer_received', 'offer', 'under_offer'].includes(normalized)) return 'offer_received'
  if (['sold', 'closed', 'registered'].includes(normalized)) return 'sold'
  if (['withdrawn', 'cancelled', 'canceled'].includes(normalized)) return 'withdrawn'
  return normalized || 'draft'
}

function getPrivateListingStatusLabel(status = '') {
  const normalized = mapLegacyListingStatusToCanonicalStatus(status)
  return {
    draft: 'Draft',
    mandate_pending: 'Mandate Pending',
    active: 'Active',
    offer_received: 'Offer Received',
    sold: 'Sold',
    withdrawn: 'Withdrawn',
  }[normalized] || 'Draft'
}

function getPrivateListingStatusGroup(status = '') {
  const normalized = mapLegacyListingStatusToCanonicalStatus(status)
  if (['sold', 'withdrawn'].includes(normalized)) return 'closed'
  if (['active', 'offer_received'].includes(normalized)) return 'active'
  return 'setup'
}

function getPrivateListingStatusDescription(status = '') {
  const normalized = mapLegacyListingStatusToCanonicalStatus(status)
  if (normalized === 'active') return 'Listing is live or ready for buyer activity.'
  if (normalized === 'offer_received') return 'Listing has active offer activity.'
  if (normalized === 'sold') return 'Listing has converted or closed.'
  if (normalized === 'withdrawn') return 'Listing is no longer active.'
  if (normalized === 'mandate_pending') return 'Mandate setup is in progress.'
  return 'Listing setup is in progress.'
}

function getPrivateListingLifecycleNextAction(row = {}) {
  const status = mapLegacyListingStatusToCanonicalStatus(row.listingStatus || row.listing_status || row.status)
  if (status === 'draft') return 'Complete listing setup'
  if (status === 'mandate_pending') return 'Complete mandate'
  if (status === 'active') return 'Manage buyer activity'
  if (status === 'offer_received') return 'Review offer'
  return ''
}

function mapPrivateListingSummaryRow(row = {}, onboardingCommissionByListingId = null) {
  const onboardingCommissionRow = onboardingCommissionByListingId
    ? onboardingCommissionByListingId.get(String(row?.id || '')) || null
    : null
  const commissionTerms = getPrivateListingCommissionTerms(onboardingCommissionRow?.form_data)
  const canonicalSellerFacts =
    row?.seller_canonical_facts_json && typeof row.seller_canonical_facts_json === 'object'
      ? row.seller_canonical_facts_json
      : {}
  const canonicalPropertyFacts = canonicalSellerFacts.property && typeof canonicalSellerFacts.property === 'object'
    ? canonicalSellerFacts.property
    : {}
  const listingStatus = mapLegacyListingStatusToCanonicalStatus(row.listing_status || row.status)
  const addressLine1 = row.address_line_1 || ''
  const addressLine2 = row.address_line_2 || ''
  const unitNumber = pickFirstText(canonicalPropertyFacts.unitNumber, canonicalPropertyFacts.unit_number, canonicalSellerFacts.unitNumber, canonicalSellerFacts.unit_number, canonicalSellerFacts.property_unit_number)
  const sectionNumber = pickFirstText(canonicalPropertyFacts.sectionNumber, canonicalPropertyFacts.section_number, canonicalSellerFacts.sectionNumber, canonicalSellerFacts.section_number, canonicalSellerFacts.property_section_number)
  const complexName = pickFirstText(canonicalPropertyFacts.complexName, canonicalPropertyFacts.complex_name, canonicalPropertyFacts.schemeName, canonicalPropertyFacts.scheme_name, canonicalSellerFacts.complexName, canonicalSellerFacts.complex_name, canonicalSellerFacts.property_complex_name)
  const estateName = pickFirstText(canonicalPropertyFacts.estateName, canonicalPropertyFacts.estate_name, canonicalSellerFacts.estateName, canonicalSellerFacts.estate_name, canonicalSellerFacts.property_estate_name)
  const sectionalTitleNumber = pickFirstText(canonicalPropertyFacts.sectionalTitleNumber, canonicalPropertyFacts.sectional_title_number, canonicalPropertyFacts.sectionalTitleScheme, canonicalSellerFacts.sectionalTitleNumber, canonicalSellerFacts.sectional_title_number)

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
    askingPrice: Number(row.asking_price || 0) || 0,
    estimatedValue: Number(row.estimated_value || 0) || 0,
    addressLine1,
    addressLine2,
    suburb: row.suburb || '',
    city: row.city || '',
    province: row.province || '',
    postalCode: row.postal_code || '',
    unitNumber,
    unit_number: unitNumber,
    sectionNumber,
    section_number: sectionNumber,
    complexName,
    complex_name: complexName,
    estateName,
    estate_name: estateName,
    sectionalTitleNumber,
    sectional_title_number: sectionalTitleNumber,
    sectionalTitleScheme: sectionalTitleNumber,
    sellerType: row.seller_type || '',
    financeContext: row.finance_context || '',
    mandateType: row.mandate_type || 'sole',
    mandateStatus: normalizeStatus(row.mandate_status, MANDATE_STATUSES, 'not_started'),
    mandatePacketId: row.mandate_packet_id || null,
    sellerOnboardingStatus: normalizeStatus(row.seller_onboarding_status, SELLER_ONBOARDING_STATUSES, 'not_started'),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    listingTitle: row.title || row.address_line_1 || 'Untitled listing',
    propertyAddress: [addressLine1, addressLine2].filter(Boolean).join(', '),
    status: listingStatus,
    listingStatusLegacy: listingStatus,
    lifecycleStatus: listingStatus,
    lifecycleStatusLabel: getPrivateListingStatusLabel(listingStatus),
    lifecycleStatusDescription: getPrivateListingStatusDescription(listingStatus),
    lifecycleStatusGroup: getPrivateListingStatusGroup(listingStatus),
    lifecycleNextAction: getPrivateListingLifecycleNextAction({ ...row, listingStatus }),
    documents: [],
    documentRequirements: [],
    requirements: [],
    requirementsByType: {},
    activeDeal: null,
    commission: commissionTerms,
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
  }
}

async function fetchOnboardingCommissionRowsForListings(client, listingIds = []) {
  const ids = normalizeUuidList(listingIds)
  if (!ids.length) return new Map()
  const query = await client
    .from('private_listing_seller_onboarding')
    .select('private_listing_id, form_data')
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

export async function getAgentPrivateListingSummaries(
  agentId,
  {
    organisationId = null,
    includeAllOrganisationListings = false,
    assignedAgentEmail = '',
    assignedAgentIds = [],
    includeCommissionTerms = false,
  } = {},
) {
  const client = requireClient()
  const normalizedAgentId = normalizeUuid(agentId)
  const normalizedOrgId = normalizeUuid(organisationId)
  const normalizedAgentEmail = normalizeText(assignedAgentEmail).toLowerCase()
  const normalizedAgentIds = normalizeUuidList([normalizedAgentId, ...assignedAgentIds])
  if (!includeAllOrganisationListings && !normalizedAgentIds.length && !normalizedAgentEmail) return []

  const createSummaryQuery = ({ includeAssignedAgentEmail = true, includeIsActive = true } = {}) => {
    const selectColumns = [
      'id',
      'listing_reference',
      'listing_status',
      'listing_visibility',
      'seller_onboarding_status',
      'mandate_status',
      'mandate_packet_id',
      'asking_price',
      'estimated_value',
      'title',
      'address_line_1',
      'address_line_2',
      'suburb',
      'city',
      'province',
      'postal_code',
      'seller_type',
      'finance_context',
      'mandate_type',
      'property_category',
      'property_type',
      'property_structure_type',
      'listing_category',
      'listing_source',
      'stock_source',
      'seller_canonical_facts_json',
      'seller_canonical_fact_readiness_json',
      'seller_lead_id',
      'seller_profile_id',
      'property_profile_id',
      'organisation_id',
      'branch_id',
      'assigned_agent_id',
      ...(includeAssignedAgentEmail ? ['assigned_agent_email'] : []),
      ...(includeIsActive ? ['is_active'] : []),
      'created_at',
      'updated_at',
    ].join(', ')
    const queryBuilder = applyVisiblePrivateListingFilters(
      client
        .from('private_listings')
        .select(selectColumns),
    )

    if (normalizedOrgId) queryBuilder.eq('organisation_id', normalizedOrgId)
    if (!includeAllOrganisationListings) {
      const assignmentFilters = []
      if (normalizedAgentIds.length > 1) {
        assignmentFilters.push(`assigned_agent_id.in.(${normalizedAgentIds.join(',')})`)
      } else if (normalizedAgentIds.length === 1) {
        assignmentFilters.push(`assigned_agent_id.eq.${normalizedAgentIds[0]}`)
      }
      if (includeAssignedAgentEmail && normalizedAgentEmail) {
        const escapedEmail = String(normalizedAgentEmail).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        assignmentFilters.push(`assigned_agent_email.eq."${escapedEmail}"`)
      }

      if (assignmentFilters.length > 1) {
        queryBuilder.or(assignmentFilters.join(','))
      } else if (normalizedAgentIds.length > 1) {
        queryBuilder.in('assigned_agent_id', normalizedAgentIds)
      } else if (normalizedAgentIds.length === 1) {
        queryBuilder.eq('assigned_agent_id', normalizedAgentIds[0])
      } else if (includeAssignedAgentEmail && normalizedAgentEmail) {
        queryBuilder.eq('assigned_agent_email', normalizedAgentEmail)
      }
    }

    return queryBuilder.order('updated_at', { ascending: false })
  }

  let includeAssignedAgentEmail = true
  let includeIsActive = true
  let query = await createSummaryQuery({ includeAssignedAgentEmail, includeIsActive })
  while (query.error) {
    const errorText = `${query.error?.message || ''} ${query.error?.details || ''} ${query.error?.hint || ''}`.toLowerCase()

    if (includeAssignedAgentEmail && errorText.includes('assigned_agent_email')) {
      if (!includeAllOrganisationListings && !normalizedAgentIds.length) return []
      includeAssignedAgentEmail = false
      query = await createSummaryQuery({ includeAssignedAgentEmail, includeIsActive })
      continue
    }
    if (includeIsActive && errorText.includes('is_active')) {
      includeIsActive = false
      query = await createSummaryQuery({ includeAssignedAgentEmail, includeIsActive })
      continue
    }
    if (isMissingTableError(query.error, 'private_listings')) return []
    throw query.error
  }

  const rows = (Array.isArray(query.data) ? query.data : []).filter((row) => !isDeletedPrivateListingRow(row))
  const onboardingCommissionByListingId = includeCommissionTerms
    ? await fetchOnboardingCommissionRowsForListings(client, rows.map((row) => row.id))
    : null
  return rows.map((row) => mapPrivateListingSummaryRow(row, onboardingCommissionByListingId)).filter(Boolean)
}
