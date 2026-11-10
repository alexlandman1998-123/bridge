// Complete detail reads remain the default. The desktop overview can defer
// section-only data while preserving its existing summaries and access rules.
import { isMissingColumnError, isMissingTableError, isPermissionDeniedError, requireClient, isMissingSchemaError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { DEFAULT_DEVELOPMENT_PROFILE, normalizeDevelopmentProfile } from './profileNormalization.js'
import { refreshDevelopmentMedia } from '../../lib/developmentMediaStorage.js'
import { getAttorneyMockDevelopmentDetail } from '../../core/transactions/attorneyMockData'
import { fetchDashboardOverview } from '../reporting/portfolioReadApi.js'
import { fetchUnitsBase, hydrateUnitRows } from './unitReadApi.js'
import { fetchTransactionsListSummary } from '../transactions/summaryReadApi.js'
import { selectCurrentDevelopmentTransactionRows } from '../../core/developments/developmentTransactionVisibility.js'
import { fetchDocumentRequirements, fetchTransactionRequiredDocumentsByTransactionIds, buildRequiredChecklistFromRows, buildDocumentChecklist } from '../documents/requirementReadModel.js'
import { ensureDevelopmentSettings, fetchDevelopmentAttorneyConfig, fetchDevelopmentBondConfig } from './configurationApi.js'
import { fetchDevelopmentFinancials, fetchDevelopmentDocuments, fetchDevelopmentMarketingAccess, fetchDevelopmentMarketingActivity, fetchDevelopmentMarketingEvents, fetchDevelopmentVisualAnalytics } from './readApi.js'
import { byUnitNumber, latestTimestamp } from '../../core/transactions/legacyReadModel.js'
import { getSummaryStats } from '../../core/transactions/stageConfig'
import { getListingLiveChannels } from '../../services/listings/listingMarketingChannelPresentation.js'

export async function fetchDevelopmentProfile(client, developmentId, { strictMedia = true } = {}) {
  let profileQuery = await client
    .from('development_profiles')
    .select(
      'development_id, revision, code, location, suburb, city, province, country, address, formatted_address, street_address, postal_code, latitude, longitude, google_place_id, description, status, developer_company, launch_date, expected_completion_date, plans, site_plans, image_links, supporting_documents, seller_details, marketing_content',
    )
    .eq('development_id', developmentId)
    .maybeSingle()

  if (profileQuery.error && isMissingColumnError(profileQuery.error, 'seller_details')) {
    profileQuery = await client
      .from('development_profiles')
      .select(
        'development_id, revision, code, location, suburb, city, province, country, address, formatted_address, street_address, postal_code, latitude, longitude, google_place_id, description, status, developer_company, launch_date, expected_completion_date, plans, site_plans, image_links, supporting_documents, marketing_content',
      )
      .eq('development_id', developmentId)
      .maybeSingle()
  }

  if (
    profileQuery.error &&
    (isMissingColumnError(profileQuery.error, 'marketing_content') ||
      isMissingColumnError(profileQuery.error, 'formatted_address') ||
      isMissingColumnError(profileQuery.error, 'street_address') ||
      isMissingColumnError(profileQuery.error, 'postal_code') ||
      isMissingColumnError(profileQuery.error, 'latitude') ||
      isMissingColumnError(profileQuery.error, 'longitude') ||
      isMissingColumnError(profileQuery.error, 'google_place_id'))
  ) {
    profileQuery = await client
      .from('development_profiles')
      .select(
        'development_id, revision, code, location, suburb, city, province, country, address, description, status, developer_company, launch_date, expected_completion_date, plans, site_plans, image_links, supporting_documents',
      )
      .eq('development_id', developmentId)
      .maybeSingle()
  }

  if (profileQuery.error && isMissingColumnError(profileQuery.error, 'code')) {
    profileQuery = await client
      .from('development_profiles')
      .select(
        'development_id, revision, location, address, description, status, plans, site_plans, image_links, supporting_documents',
      )
      .eq('development_id', developmentId)
      .maybeSingle()
  }

  const { data, error } = profileQuery

  if (error) {
    if (isMissingTableError(error, 'development_profiles') || isPermissionDeniedError(error)) {
      return { ...DEFAULT_DEVELOPMENT_PROFILE }
    }

    throw error
  }

  if (!data) {
    return { ...DEFAULT_DEVELOPMENT_PROFILE }
  }

  const [profile] = await refreshDevelopmentMedia(client, [data], { strict: strictMedia })
  return normalizeDevelopmentProfile(profile)
}

export async function fetchDevelopmentDetail(developmentId, { deferOptionalData = false } = {}) {
  const mockDetail = getAttorneyMockDevelopmentDetail(developmentId)
  if (mockDetail) {
    return mockDetail
  }

  const client = requireClient()

  let developmentQuery = await client
    .from('developments')
    .select(
      'id, organisation_id, name, planned_units, code, location, address, formatted_address, street_address, suburb, city, province, country, postal_code, latitude, longitude, google_place_id, description, status, developer_company, total_units_expected, launch_date, expected_completion_date, assigned_attorney_id, handover_enabled, snag_tracking_enabled, alterations_enabled, onboarding_enabled',
    )
    .eq('id', developmentId)
    .maybeSingle()

  if (
    developmentQuery.error &&
    (isMissingColumnError(developmentQuery.error, 'code') ||
      isMissingColumnError(developmentQuery.error, 'address') ||
      isMissingColumnError(developmentQuery.error, 'formatted_address') ||
      isMissingColumnError(developmentQuery.error, 'street_address') ||
      isMissingColumnError(developmentQuery.error, 'postal_code') ||
      isMissingColumnError(developmentQuery.error, 'latitude') ||
      isMissingColumnError(developmentQuery.error, 'longitude') ||
      isMissingColumnError(developmentQuery.error, 'google_place_id') ||
      isMissingColumnError(developmentQuery.error, 'organisation_id'))
  ) {
    developmentQuery = await client
      .from('developments')
      .select('id, name, planned_units')
      .eq('id', developmentId)
      .maybeSingle()
  }

  let { data: development, error: developmentError } = developmentQuery

  if (developmentError) {
    throw developmentError
  }

  if (!development) {
    // Some role combinations can read a development through the portfolio
    // summary but are not granted a direct row select. Use that already
    // authorised summary as a narrow fallback rather than presenting a false
    // "not found" result for an accessible workspace.
    const overview = await fetchDashboardOverview({ includeSecondaryData: false })
    const summary = (overview.developmentSummaries || []).find((item) => String(item?.id || '') === String(developmentId || ''))
    if (!summary) return null
    development = {
      id: summary.id,
      organisation_id: null,
      name: summary.name || 'Untitled development',
      planned_units: summary.totalUnits || 0,
      total_units_expected: summary.totalUnits || 0,
      location: summary.location || null,
      status: summary.phase || null,
      developer_company: summary.developerCompany || null,
    }
  }

  // The detail page used to wait for each independent resource in turn. On a
  // production connection that created a visibly long blank loading state.
  // Start the requested independent reads together. Section-only datasets can
  // be deferred by the desktop page; other callers retain the complete read.
  const [
    units,
    currentTransactionRows,
    requirements,
    settings,
    profile,
    financials,
    documents,
    marketingAccess,
    marketingActivity,
    marketingEventsResult,
    visualAnalytics,
    productCatalogue,
    structureNodes,
    attorneyConfig,
    bondConfig,
  ] = await Promise.all([
    fetchUnitsBase(client, developmentId),
    fetchTransactionsListSummary({ developmentId, activeTransactionsOnly: true })
      .then(selectCurrentDevelopmentTransactionRows),
    fetchDocumentRequirements(client, developmentId),
    ensureDevelopmentSettings(client, developmentId, { createIfMissing: false }),
    fetchDevelopmentProfile(client, developmentId),
    deferOptionalData ? undefined : fetchDevelopmentFinancials(developmentId),
    deferOptionalData ? undefined : fetchDevelopmentDocuments(developmentId),
    deferOptionalData ? undefined : fetchDevelopmentMarketingAccess(developmentId),
    deferOptionalData ? undefined : fetchDevelopmentMarketingActivity(developmentId),
    deferOptionalData ? undefined : fetchDevelopmentMarketingEvents(developmentId, development.organisation_id)
      .then(events => ({ events, error: '' }))
      .catch(error => ({ events: undefined, error: error.message || 'Development events could not be loaded.' })),
    deferOptionalData ? undefined : fetchDevelopmentVisualAnalytics(developmentId),
    deferOptionalData ? undefined : fetchDevelopmentProductCatalogue(client, developmentId),
    deferOptionalData ? undefined : fetchDevelopmentStructureNodes(client, developmentId),
    fetchDevelopmentAttorneyConfig(developmentId),
    fetchDevelopmentBondConfig(developmentId),
  ])
  const [rows, linkedListings] = await Promise.all([
    hydrateUnitRows(client, units),
    fetchDevelopmentLinkedListings(client, { development, units }),
  ])
  const alterations = deferOptionalData ? undefined : await fetchDevelopmentAlterations(client, developmentId)

  const transactionIds = [...new Set(currentTransactionRows.map((row) => row.transaction?.id).filter(Boolean))]
  let docsByTransactionId = {}
  let transactionRequirementsByTransactionId = {}

  try {
    transactionRequirementsByTransactionId = await fetchTransactionRequiredDocumentsByTransactionIds(
      client,
      transactionIds,
    )
  } catch (error) {
    if (!isPermissionDeniedError(error) && !isMissingSchemaError(error)) {
      throw error
    }
  }

  if (transactionIds.length) {
    const { data: docs, error: docsError } = await client
      .from('documents')
      .select('id, transaction_id, name, category')
      .in('transaction_id', transactionIds)

    if (docsError) {
      if (!isPermissionDeniedError(docsError) && !isMissingSchemaError(docsError)) {
        throw docsError
      }
    } else {
      docsByTransactionId = docs.reduce((accumulator, doc) => {
        if (!accumulator[doc.transaction_id]) {
          accumulator[doc.transaction_id] = []
        }

        accumulator[doc.transaction_id].push(doc)
        return accumulator
      }, {})
    }
  }

  const rowsWithDocumentSummary = rows.map((row) => {
    const transactionId = row.transaction?.id
    const documents = transactionId ? docsByTransactionId[transactionId] || [] : []
    const transactionRequirements = transactionId ? transactionRequirementsByTransactionId[transactionId] || [] : []
    const completion = transactionRequirements.length
      ? buildRequiredChecklistFromRows(transactionRequirements, documents)
      : buildDocumentChecklist(requirements, documents)

    return {
      ...row,
      documentSummary: completion.summary,
    }
  })

  const transactionRowsWithDocumentSummary = currentTransactionRows.map((row) => {
    const transactionId = row.transaction?.id
    const transactionDocuments = transactionId ? docsByTransactionId[transactionId] || [] : []
    const transactionRequirements = transactionId ? transactionRequirementsByTransactionId[transactionId] || [] : []
    const completion = transactionRequirements.length
      ? buildRequiredChecklistFromRows(transactionRequirements, transactionDocuments)
      : buildDocumentChecklist(requirements, transactionDocuments)

    return {
      ...row,
      documentSummary: completion.summary,
    }
  })

  return {
    development,
    profile,
    financials,
    documents,
    marketingAccess,
    marketingActivity,
    marketingEvents: marketingEventsResult?.events,
    marketingEventsError: marketingEventsResult?.error,
    visualAnalytics,
    productCatalogue,
    structureNodes,
    attorneyConfig,
    bondConfig,
    rows: rowsWithDocumentSummary.sort(byUnitNumber),
    transactionRows: transactionRowsWithDocumentSummary.sort(
      (left, right) => new Date(latestTimestamp(right) || 0) - new Date(latestTimestamp(left) || 0),
    ),
    stats: getSummaryStats(rowsWithDocumentSummary),
    settings,
    alterations,
    listings: linkedListings,
  }
}

export function readJsonLikeObject(value) {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

export function getDevelopmentListingLinkSignals(row = {}) {
  const propertyDetails = row.property_details && typeof row.property_details === 'object' ? row.property_details : {}
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const internalNotesJson = readJsonLikeObject(row.internal_listing_notes) || {}
  return {
    developmentId: normalizeTextValue(
      row.development_id ||
        row.developmentId ||
        row.source_development_id ||
        row.sourceDevelopmentId ||
        propertyDetails.development_id ||
        propertyDetails.developmentId ||
        metadata.development_id ||
        metadata.developmentId ||
        internalNotesJson.development_id ||
        internalNotesJson.developmentId,
    ),
    unitId: normalizeTextValue(
      row.unit_id ||
        row.unitId ||
        row.source_unit_id ||
        row.sourceUnitId ||
        propertyDetails.unit_id ||
        propertyDetails.unitId ||
        metadata.unit_id ||
        metadata.unitId ||
        internalNotesJson.unit_id ||
        internalNotesJson.unitId,
    ),
    unitNumber: normalizeTextValue(
      row.unit_number ||
        row.unitNumber ||
        propertyDetails.unit_number ||
        propertyDetails.unitNumber ||
        metadata.unit_number ||
        metadata.unitNumber ||
        internalNotesJson.unit_number ||
        internalNotesJson.unitNumber,
    ),
  }
}

export function privateListingMatchesDevelopment(row = {}, { development = {}, units = [] } = {}) {
  const developmentId = normalizeTextValue(development?.id)
  if (!developmentId) return false

  const linkSignals = getDevelopmentListingLinkSignals(row)
  if (linkSignals.developmentId && linkSignals.developmentId === developmentId) return true

  const unitIds = new Set((units || []).map((unit) => normalizeTextValue(unit?.id)).filter(Boolean))
  if (linkSignals.unitId && unitIds.has(linkSignals.unitId)) return true

  const source = normalizeTextValue(row.listing_source || row.stock_source || row.source || row.origin).toLowerCase()
  const isDevelopmentListing = source.includes('development') || source.includes('developer_unit')
  if (!isDevelopmentListing) return false

  const unitNumbers = new Set(
    (units || [])
      .map((unit) => normalizeTextValue(unit?.unit_number || unit?.unitNumber))
      .filter(Boolean)
      .map((value) => value.toLowerCase()),
  )
  if (linkSignals.unitNumber && unitNumbers.has(linkSignals.unitNumber.toLowerCase())) return true

  const developmentName = normalizeTextValue(development?.name).toLowerCase()
  const searchableText = [
    row.title,
    row.description,
    row.address_line_1,
    row.address_line_2,
    row.suburb,
    row.city,
    row.internal_listing_notes,
  ].map((value) => normalizeTextValue(value).toLowerCase()).join(' ')

  return Boolean(developmentName && searchableText.includes(developmentName))
}

export function mapDevelopmentLinkedListing(row = {}, publication = {}, media = {}, organisation = {}) {
  const property = row.property_details && typeof row.property_details === 'object' ? row.property_details : {}
  const fact = key => {
    const value = [media[key], publication[key], row[key], property[key]].find(item => item != null && item !== '')
    return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
  }
  const images = Array.isArray(media.image_gallery) ? media.image_gallery : []
  const cover = images.find(image => image.id === media.cover_image_id) || images[0]

  const linkSignals = getDevelopmentListingLinkSignals(row)
  const title = normalizeTextValue(row.title || row.listing_title || row.address_line_1) || 'Development listing'
  const location = [row.address_line_1, row.suburb, row.city].map(normalizeTextValue).filter(Boolean).join(', ')
  const source = normalizeTextValue(row.listing_source || row.stock_source || row.source || row.origin || 'private_listing')
  const portalSignals = [
    row.property24_listing_url || row.property24_reference || row.property24_status,
    row.private_property_listing_url || row.private_property_reference || row.private_property_status,
    row.bridge_listing_public_url || row.bridge_listing_status,
  ].filter(Boolean).length
  const platforms = [
    row.property24_listing_url || row.property24_reference || row.property24_status ? 'Property24' : '',
    row.private_property_listing_url || row.private_property_reference || row.private_property_status ? 'Private Property' : '',
    row.bridge_listing_public_url || row.bridge_listing_status ? 'Arch9' : '',
  ].filter(Boolean)

  return {
    id: normalizeTextValue(row.id),
    organisationId: normalizeTextValue(row.organisation_id),
    assignedAgentId: normalizeTextValue(row.assigned_agent_id || row.assigned_user_id),
    assignedAgentAvatarUrl: normalizeTextValue(row.assigned_agent_avatar_url),
    bedrooms: fact('bedrooms'),
    bathrooms: fact('bathrooms'),
    garages: fact('garages'),
    marketStartDate: normalizeTextValue(media.listing_date || row.listing_date || row.listingDate || row.first_published_at || row.published_at || property.listingDate),
    liveChannels: getListingLiveChannels(row),
    title,
    location: location || 'Location pending',
    price: Number(row.asking_price || row.estimated_value || 0) || 0,
    status: normalizeTextValue(row.listing_status || row.status || 'draft') || 'draft',
    visibility: normalizeTextValue(row.listing_visibility || row.visibility || 'internal') || 'internal',
    source,
    sourceLabel: source.replace(/_/g, ' ') || 'private listing',
    agencyName: normalizeTextValue(organisation.name || row.agency_organisation || row.agency_name || row.organisation_name) || 'Agency / direct team',
    assignedAgent: normalizeTextValue(row.assigned_agent_name || row.assigned_agent || row.assigned_agent_email) || 'Agent pending',
    assignedAgentEmail: normalizeTextValue(row.assigned_agent_email),
    unitId: linkSignals.unitId,
    unitNumber: linkSignals.unitNumber,
    portalSignals,
    platforms,
    coverImageUrl: normalizeTextValue(
      cover?.url || cover?.fileUrl || (typeof cover === 'string' ? cover : '') || row.hero_image_url || row.heroImageUrl || row.cover_image_url || row.coverImageUrl || row.image_url || row.imageUrl || row.primary_image_url || row.primaryImageUrl,
    ),
    updatedAt: row.updated_at || row.created_at || null,
  }
}

export async function loadDevelopmentListingCoverImages(client, listingIds) {
  const { getPrivateListingCoverImageUrls } = await import('../../services/listings/listingCoverReadService.js')
  return getPrivateListingCoverImageUrls(listingIds, { client })
}

export async function fetchDevelopmentLinkedListings(client, { development = {}, units = [] } = {}) {
  const developmentId = normalizeTextValue(development?.id)
  if (!developmentId) return []

  const rows = []
  let legacy = false
  for (let offset = 0; ; offset += 1000) {
    let builder = client.from('private_listings').select('*').order('updated_at', { ascending: false }).order('id')
    if (!legacy) builder = builder.eq('development_id', developmentId)
    const query = await builder.range(offset, offset + 999)
    if (query.error && !legacy && isMissingColumnError(query.error, 'development_id')) {
      legacy = true
      offset = -1000
      continue
    }
    if (query.error) {
      if (isMissingTableError(query.error, 'private_listings') || isPermissionDeniedError(query.error) || isMissingSchemaError(query.error)) return []
      throw query.error
    }
    rows.push(...(query.data || []))
    if ((query.data || []).length < 1000) break
  }
  const linked = rows.filter(row => {
    const status = String(row.listing_status || row.status || 'draft').toLowerCase()
    return (row.is_active !== false || ['seller_lead', 'draft', 'listing_review'].includes(status)) && !['archived', 'deleted'].includes(status) && privateListingMatchesDevelopment(row, { development, units })
  })
  const publications = new Map(), media = new Map(), organisations = new Map()
  for (let offset = 0; offset < linked.length; offset += 100) {
    const chunk = linked.slice(offset, offset + 100)
    const ids = chunk.map(row => row.id)
    const orgIds = [...new Set(chunk.map(row => row.organisation_id).filter(Boolean))]
    const results = await Promise.allSettled([
      client.from('listing_publication_data').select('listing_id,bedrooms,bathrooms,garages').in('listing_id', ids),
      client.from('private_listing_seller_onboarding').select('private_listing_id,image_gallery:form_data->imageGallery,cover_image_id:form_data->>coverImageId,listing_date:form_data->>listingDate,bedrooms:form_data->>bedrooms,bathrooms:form_data->>bathrooms,garages:form_data->>garages').in('private_listing_id', ids),
      orgIds.length ? client.from('organisations').select('id,name').in('id', orgIds) : Promise.resolve({ data: [] }),
    ])
    // Optional display facts must not hide a listing when its related record is inaccessible.
    if (results[0].status === 'fulfilled' && !results[0].value.error) (results[0].value.data || []).forEach(row => publications.set(row.listing_id, row))
    if (results[1].status === 'fulfilled' && !results[1].value.error) (results[1].value.data || []).forEach(row => media.set(row.private_listing_id, row))
    if (results[2].status === 'fulfilled' && !results[2].value.error) (results[2].value.data || []).forEach(row => organisations.set(row.id, row))
  }
  let coverUrls = {}
  if (linked.length) {
    try { coverUrls = await loadDevelopmentListingCoverImages(client, linked.map(row => row.id)) }
    catch { /* Optional cover reads must not hide otherwise accessible listings. */ }
  }
  return linked.map(row => ({
    ...mapDevelopmentLinkedListing(row, publications.get(row.id), media.get(row.id), organisations.get(row.organisation_id)),
    ...(coverUrls[row.id] ? { coverImageUrl: coverUrls[row.id] } : {}),
  }))
}

export async function fetchDevelopmentStructureNodes(client, developmentId) {
  const { data, error } = await client
    .from('development_structure_nodes')
    .select('id, development_id, parent_id, node_type, label, code, sort_order')
    .eq('development_id', developmentId)
    .order('sort_order')
    .order('label')

  if (error) {
    if (isMissingTableError(error, 'development_structure_nodes') || isMissingSchemaError(error) || isPermissionDeniedError(error)) return []
    throw error
  }
  return (data || []).map((node) => ({
    id: node.id,
    developmentId: node.development_id,
    parentId: node.parent_id || '',
    nodeType: node.node_type,
    label: node.label,
    code: node.code || '',
    sortOrder: node.sort_order || 0,
  }))
}

export async function fetchDevelopmentProductCatalogue(client, developmentId) {
  const queries = await Promise.all([
    client.from('development_unit_types').select('id, development_id, code, name, description, bedrooms, bathrooms, parking_count, internal_size_sqm, external_size_sqm, vat_applicable, no_transfer_duty, is_active, sort_order').eq('development_id', developmentId).order('sort_order').order('name'),
    client.from('development_floorplans').select('id, development_id, unit_type_id, code, name, document_id, file_url, thumbnail_url, internal_size_sqm, external_size_sqm, metadata, is_active, sort_order').eq('development_id', developmentId).order('sort_order').order('name'),
    client.from('development_price_books').select('id, development_id, name, currency_code, effective_from, effective_to, status, is_default').eq('development_id', developmentId).order('is_default', { ascending: false }).order('created_at', { ascending: false }),
    client.from('development_unit_prices').select('id, development_id, price_book_id, unit_type_id, floorplan_id, unit_id, list_price, price_from, price_to, reservation_fee, is_active').eq('development_id', developmentId).eq('is_active', true),
  ])

  const error = queries.find((query) => query.error)?.error
  if (error) {
    if (
      isMissingTableError(error, 'development_unit_types') ||
      isMissingTableError(error, 'development_floorplans') ||
      isMissingTableError(error, 'development_price_books') ||
      isMissingTableError(error, 'development_unit_prices') ||
      isMissingSchemaError(error) ||
      isPermissionDeniedError(error)
    ) return null
    throw error
  }

  const [unitTypes, floorplans, priceBooks, prices] = queries.map((query) => query.data || [])
  const viewingFloorplans = await refreshDevelopmentMedia(client, floorplans)
  return {
    unitTypes: unitTypes.map((row) => ({
      id: row.id, code: row.code || '', name: row.name || '', description: row.description || '', bedrooms: row.bedrooms ?? '', bathrooms: row.bathrooms ?? '', parkingCount: row.parking_count ?? '', internalSizeSqm: row.internal_size_sqm ?? '', externalSizeSqm: row.external_size_sqm ?? '', vatApplicable: row.vat_applicable, noTransferDuty: Boolean(row.no_transfer_duty), isActive: row.is_active !== false, sortOrder: row.sort_order || 0,
    })),
    floorplans: viewingFloorplans.map((row) => ({ id: row.id, metadata: row.metadata || {}, storeys: row.metadata?.storeys ?? '', unitTypeId: row.unit_type_id || '', code: row.code || '', name: row.name || '', documentId: row.document_id || '', fileUrl: row.file_url || '', thumbnailUrl: row.thumbnail_url || '', internalSizeSqm: row.internal_size_sqm ?? '', externalSizeSqm: row.external_size_sqm ?? '', isActive: row.is_active !== false, sortOrder: row.sort_order || 0 })),
    priceBooks: priceBooks.map((row) => ({ id: row.id, name: row.name || '', currencyCode: row.currency_code || 'ZAR', effectiveFrom: row.effective_from || '', effectiveTo: row.effective_to || '', status: row.status || 'draft', isDefault: Boolean(row.is_default) })),
    prices: prices.map((row) => ({ id: row.id, priceBookId: row.price_book_id, unitTypeId: row.unit_type_id || '', floorplanId: row.floorplan_id || '', unitId: row.unit_id || '', listPrice: row.list_price ?? '', priceFrom: row.price_from ?? '', priceTo: row.price_to ?? '', reservationFee: row.reservation_fee ?? '' })),
  }
}

// Shared by the complete read and the on-demand financial section.
export async function fetchDevelopmentAlterations(client, developmentId) {
  let alterations = []

  let alterationsQuery = await client
    .from('alteration_requests')
    .select(
      'id, development_id, unit_id, transaction_id, buyer_id, title, amount_inc_vat, charge_treatment, status, created_at, updated_at',
    )
    .eq('development_id', developmentId)
    .order('created_at', { ascending: false })

  if (alterationsQuery.error && isMissingColumnError(alterationsQuery.error, 'charge_treatment')) {
    alterationsQuery = await client
      .from('alteration_requests')
      .select(
        'id, development_id, unit_id, transaction_id, buyer_id, title, amount_inc_vat, status, created_at, updated_at',
      )
      .eq('development_id', developmentId)
      .order('created_at', { ascending: false })
  }

  if (alterationsQuery.error) {
    if (
      !isMissingTableError(alterationsQuery.error, 'alteration_requests') &&
      !isPermissionDeniedError(alterationsQuery.error)
    ) {
      throw alterationsQuery.error
    }
  } else {
    alterations = alterationsQuery.data || []
  }

  return alterations
}
