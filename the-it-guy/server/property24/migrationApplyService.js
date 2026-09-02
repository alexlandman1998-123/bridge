import crypto from 'node:crypto'
import { mapProperty24ListingStatus } from './migrationMappingService.js'

export const PROPERTY24_MIGRATION_APPLY_VERSION = 'property24_migration_apply_v1'

const ACTIVE_STATUSES = new Set(['active', 'newlisting'])
const CLOSED_STATUSES = new Set(['sold', 'rented', 'withdrawn', 'inactive', 'expired', 'deleted'])

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s_-]+/g, '')
}

function integer(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))]
}

function stableUuid(value) {
  const bytes = crypto.createHash('sha256').update(text(value)).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function compact(source = {}) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined))
}

function unwrapCollection(payload, keys = ['listings', 'agents', 'items', 'data', 'results']) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  for (const name of keys) {
    if (Array.isArray(payload[name])) return payload[name]
  }
  return []
}

function listingNumber(row = {}) {
  return integer(row.listingNumber ?? row.ListingNumber ?? row.number ?? row.id)
}

function agentId(row = {}) {
  return integer(row.agentId ?? row.AgentId ?? row.id)
}

function portalState(payload) {
  if (typeof payload === 'boolean') return payload
  if (!payload || typeof payload !== 'object') return null
  const value = payload.isOnPortal ?? payload.IsOnPortal ?? payload.onPortal ?? payload.result ?? payload.data
  return typeof value === 'boolean' ? value : null
}

function sourceListingType(plan = {}) {
  return text(plan.publicationData?.listingType || plan.privateListing?.sellerCanonicalFacts?.property24Import?.listingType || 'Sale')
}

function sourceListingVisibility(plan = {}) {
  return text(plan.privateListing?.sellerCanonicalFacts?.property24Import?.raw?.ListingVisibility || 'Public')
}

function liveAgentStatus(status) {
  return key(status) === 'active' ? 'active' : 'inactive'
}

function requireResult(result, label) {
  if (result?.error) throw new Error(`${label}: ${result.error.message || result.error}`)
  return result?.data
}

function normalizeExistingListing(row = {}) {
  return {
    ...row,
    id: text(row.id),
    listing_reference: text(row.listing_reference),
    property24_reference: text(row.property24_reference),
  }
}

function assertMappingPlan(mappingPlan = {}) {
  const blockers = []
  const context = mappingPlan.context || {}
  if (!['READY', 'READY_WITH_RESOLUTION_REQUIRED'].includes(mappingPlan.status)) {
    blockers.push({ code: 'mapping_plan_not_ready', message: `Mapping plan status is ${mappingPlan.status || 'missing'}.` })
  }
  if (!isUuid(context.organisationId)) blockers.push({ code: 'organisation_id_invalid', message: 'A valid Arch9 organisation UUID is required.' })
  if (!['exdev', 'production'].includes(key(context.environment))) blockers.push({ code: 'environment_invalid', message: 'Environment must be exdev or production.' })
  if (!integer(context.agencyId)) blockers.push({ code: 'agency_id_invalid', message: 'A positive Property24 agency ID is required.' })
  if (!Array.isArray(mappingPlan.agentPlans) || !mappingPlan.agentPlans.length) blockers.push({ code: 'agent_plans_missing', message: 'The mapping plan contains no agents.' })
  if (!Array.isArray(mappingPlan.listingPlans) || !mappingPlan.listingPlans.length) blockers.push({ code: 'listing_plans_missing', message: 'The mapping plan contains no listings.' })
  return blockers
}

export async function fetchProperty24MigrationLiveSnapshot({ property24, mappingPlan, fromDate } = {}) {
  if (!property24) throw new Error('A Property24 client is required.')
  const context = mappingPlan?.context || {}
  const plans = Array.isArray(mappingPlan?.listingPlans) ? mappingPlan.listingPlans : []
  const agentPlans = Array.isArray(mappingPlan?.agentPlans) ? mappingPlan.agentPlans : []
  const effectiveFromDate = text(fromDate) || new Date(Date.now() - 6 * 24 * 60 * 60 * 1_000).toISOString()
  const [agentResponse, reconciliationResponse, updateResponse, ...portalResponses] = await Promise.all([
    property24.fetchAgencyAgents(context.agencyId),
    property24.fetchListingReconciliation({ agencyId: context.agencyId }),
    property24.fetchListingUpdates(effectiveFromDate),
    ...plans.map((plan) => property24.checkListingOnPortal(plan.listingNumber)),
  ])
  const agentRows = unwrapCollection(agentResponse.data)
  const reconciliationRows = unwrapCollection(reconciliationResponse.data)
  const updateRows = unwrapCollection(updateResponse.data)
  const blockers = []
  const agents = agentPlans.map((plan) => {
    const id = integer(plan.property24AgentId)
    const row = agentRows.find((candidate) => agentId(candidate) === id) || null
    if (!row) blockers.push({ code: 'property24_agent_missing', agentId: id, message: `Property24 agent ${id} is missing from agency ${context.agencyId}.` })
    const expectedSource = text(plan.sourceReference)
    const actualSource = text(row?.sourceReference ?? row?.SourceReference)
    if (row && expectedSource && actualSource !== expectedSource) {
      blockers.push({ code: 'property24_agent_identity_mismatch', agentId: id, message: `Property24 agent ${id} no longer has source reference ${expectedSource}.` })
    }
    return {
      agentId: id,
      sourceReference: actualSource || expectedSource,
      status: text(row?.status ?? row?.Status),
      firstName: text(row?.firstname ?? row?.Firstname ?? plan.agentDraft?.firstName),
      lastName: text(row?.lastname ?? row?.Lastname ?? plan.agentDraft?.lastName),
      email: text(row?.emailAddress ?? row?.EmailAddress ?? plan.agentDraft?.email),
      mobile: text(row?.mobileNumber ?? row?.MobileNumber ?? plan.agentDraft?.mobile),
      row,
    }
  })
  const listings = plans.map((plan, index) => {
    const number = integer(plan.listingNumber)
    const reconciliation = reconciliationRows.find((row) => listingNumber(row) === number) || null
    const update = updateRows.find((row) => listingNumber(row) === number) || null
    const exportedStatus = text(plan.sourceStatus ?? plan.privateListing?.sellerCanonicalFacts?.property24Import?.sourceStatus)
    const isOnPortal = portalState(portalResponses[index]?.data)
    const liveStatus = text(update?.currentStatus ?? update?.CurrentStatus ?? reconciliation?.status ?? reconciliation?.Status)
    const portalStateFallback = !liveStatus && isOnPortal === false && ACTIVE_STATUSES.has(key(exportedStatus))
    const status = text(liveStatus || (portalStateFallback ? 'Withdrawn' : exportedStatus))
    if (!status) blockers.push({ code: 'property24_listing_status_missing', listingNumber: number, message: `Property24 did not return a current or exported status for listing ${number}.` })
    if (isOnPortal === null) blockers.push({ code: 'property24_portal_state_missing', listingNumber: number, message: `Property24 did not return portal state for listing ${number}.` })
    if (ACTIVE_STATUSES.has(key(status)) && isOnPortal === false) blockers.push({ code: 'property24_active_listing_off_portal', listingNumber: number, message: `Listing ${number} is ${status} but reports off portal.` })
    if (CLOSED_STATUSES.has(key(status)) && isOnPortal === true) blockers.push({ code: 'property24_closed_listing_on_portal', listingNumber: number, message: `Listing ${number} is ${status} but still reports on portal.` })
    return {
      listingNumber: number,
      listingType: sourceListingType(plan),
      status,
      isOnPortal,
      reasonType: text(update?.reasonType ?? update?.ReasonType) || null,
      comment: text(update?.comment ?? update?.Comment) || null,
      source: update ? 'updates' : reconciliation ? 'reconciliation' : portalStateFallback ? 'portal_state_fallback' : exportedStatus ? 'export' : 'missing',
      httpStatus: {
        reconciliation: reconciliationResponse.status,
        updates: updateResponse.status,
        portal: portalResponses[index]?.status || null,
      },
    }
  })
  return {
    agencyId: integer(context.agencyId),
    environment: key(context.environment),
    fromDate: effectiveFromDate,
    agents,
    listings,
    blockers,
  }
}

export function createSupabaseProperty24MigrationRepository(supabase) {
  if (!supabase?.from) throw new Error('A Supabase client is required.')
  return {
    async inspect({ organisationId, environment, agencyId, listingPlans }) {
      const numbers = listingPlans.map((plan) => integer(plan.listingNumber))
      const references = unique(listingPlans.map((plan) => text(plan.sourceReference || plan.privateListing?.listingReference)))
      const property24References = numbers.map(String)
      const [organisation, branch, byListingReference, byProperty24Reference, syncs, agentMappings, bucket] = await Promise.all([
        supabase.from('organisations').select('id,name,display_name').eq('id', organisationId).maybeSingle(),
        supabase.from('organisation_branches').select('id,name,is_active').eq('organisation_id', organisationId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('private_listings').select('*').eq('organisation_id', organisationId).in('listing_reference', references),
        supabase.from('private_listings').select('*').eq('organisation_id', organisationId).in('property24_reference', property24References),
        supabase.from('property24_listing_syncs').select('*').eq('environment', environment).eq('agency_id', agencyId).in('listing_number', numbers),
        supabase.from('property24_agent_mappings').select('*').eq('organisation_id', organisationId).eq('environment', environment).eq('agency_id', agencyId),
        supabase.storage.getBucket('listing-media'),
      ])
      const organisationRow = requireResult(organisation, 'Organisation lookup failed')
      if (!organisationRow?.id) throw new Error(`Arch9 organisation ${organisationId} was not found.`)
      const branchRow = requireResult(branch, 'Branch lookup failed') || null
      const syncRows = requireResult(syncs, 'Property24 listing sync lookup failed') || []
      const syncListingIds = unique(syncRows.map((row) => text(row.private_listing_id)))
      const bySyncId = syncListingIds.length
        ? requireResult(await supabase.from('private_listings').select('*').in('id', syncListingIds), 'Synced listing lookup failed') || []
        : []
      const listings = [...new Map([
        ...(requireResult(byListingReference, 'Listing reference lookup failed') || []),
        ...(requireResult(byProperty24Reference, 'Property24 reference lookup failed') || []),
        ...bySyncId,
      ].map((row) => [row.id, normalizeExistingListing(row)])).values()]
      const mappingRows = requireResult(agentMappings, 'Property24 agent mapping lookup failed') || []
      const listingIds = listings.map((row) => row.id)
      const mediaRows = listingIds.length
        ? requireResult(await supabase.from('listing_media').select('*').in('listing_id', listingIds), 'Existing listing media lookup failed') || []
        : []
      if (bucket.error || !bucket.data) throw new Error('Storage bucket listing-media is unavailable.')
      if (!bucket.data.public) throw new Error('Storage bucket listing-media must be public.')
      return { organisation: organisationRow, branch: branchRow, listings, syncs: syncRows, agentMappings: mappingRows, media: mediaRows, bucket: bucket.data }
    },

    async saveAgent(operation) {
      const query = operation.existingId
        ? supabase.from('property24_agent_mappings').update(operation.row).eq('id', operation.existingId)
        : supabase.from('property24_agent_mappings').insert(operation.row)
      const result = await query.select('*').single()
      return requireResult(result, `Agent ${operation.property24AgentId} mapping write failed`)
    },

    async saveListing(operation) {
      const query = operation.exists
        ? supabase.from('private_listings').update(operation.privateListingRow).eq('id', operation.listingId)
        : supabase.from('private_listings').insert({ id: operation.listingId, ...operation.privateListingRow })
      return requireResult(await query.select('*').single(), `Listing ${operation.listingNumber} write failed`)
    },

    async savePublication(operation) {
      return requireResult(await supabase.from('listing_publication_data')
        .upsert(operation.publicationRow, { onConflict: 'listing_id' }).select('*').single(), `Listing ${operation.listingNumber} publication write failed`)
    },

    async saveSync(operation) {
      return requireResult(await supabase.from('property24_listing_syncs')
        .upsert(operation.syncRow, { onConflict: 'private_listing_id,environment' }).select('*').single(), `Listing ${operation.listingNumber} sync write failed`)
    },

    async saveMedia(operation) {
      const existing = requireResult(await supabase.from('listing_media').select('*').eq('listing_id', operation.listingId), `Listing ${operation.listingNumber} media lookup failed`) || []
      const saved = []
      for (const row of operation.mediaRows) {
        const match = existing.find((candidate) => (
          (row.storage_path && candidate.storage_path === row.storage_path) || candidate.file_url === row.file_url
        ))
        const result = match
          ? await supabase.from('listing_media').update(row).eq('id', match.id).select('*').single()
          : await supabase.from('listing_media').insert(row).select('*').single()
        saved.push(requireResult(result, `Listing ${operation.listingNumber} media write failed`))
      }
      if (operation.staleMediaIds.length) {
        requireResult(await supabase.from('listing_media').delete().in('id', operation.staleMediaIds).select('id'), `Listing ${operation.listingNumber} stale media cleanup failed`)
      }
      return { saved, removedStaleMediaIds: operation.staleMediaIds }
    },

    async verify({ organisationId, environment, agencyId, listingNumbers, listingIds, property24AgentIds }) {
      const [listings, publications, syncs, media, agents] = await Promise.all([
        supabase.from('private_listings').select('*').eq('organisation_id', organisationId).in('id', listingIds),
        supabase.from('listing_publication_data').select('*').in('listing_id', listingIds),
        supabase.from('property24_listing_syncs').select('*').eq('environment', environment).eq('agency_id', agencyId).in('listing_number', listingNumbers),
        supabase.from('listing_media').select('*').in('listing_id', listingIds).order('sort_order', { ascending: true }),
        supabase.from('property24_agent_mappings').select('*').eq('organisation_id', organisationId).eq('environment', environment).eq('agency_id', agencyId).in('property24_agent_id', property24AgentIds),
      ])
      return {
        listings: requireResult(listings, 'Listing verification failed') || [],
        publications: requireResult(publications, 'Publication verification failed') || [],
        syncs: requireResult(syncs, 'Sync verification failed') || [],
        media: requireResult(media, 'Media verification failed') || [],
        agents: requireResult(agents, 'Agent verification failed') || [],
      }
    },
  }
}

function resolveListingIdentity(plan, target, idFactory, blockers) {
  const number = integer(plan.listingNumber)
  const sourceReference = text(plan.sourceReference || plan.privateListing?.listingReference)
  const syncIds = target.syncs.filter((row) => integer(row.listing_number) === number).map((row) => text(row.private_listing_id))
  const listingIds = target.listings.filter((row) => (
    row.property24_reference === String(number) || row.listing_reference === sourceReference || syncIds.includes(row.id)
  )).map((row) => row.id)
  const candidates = unique([...syncIds, ...listingIds])
  if (candidates.length > 1) {
    blockers.push({ code: 'listing_identity_collision', listingNumber: number, message: `Listing ${number} resolves to multiple Arch9 records: ${candidates.join(', ')}.` })
  }
  const id = candidates[0] || idFactory(plan.identityKey || `property24-listing-${number}`)
  const existing = target.listings.find((row) => row.id === id) || null
  return { id, existing }
}

function privateListingRow(plan, live, identity, target, generatedAt) {
  const source = plan.privateListing || {}
  const publication = plan.publicationData || {}
  const status = mapProperty24ListingStatus(live.status, sourceListingType(plan), sourceListingVisibility(plan))
  const existing = identity.existing || {}
  const mappedAgentId = text(plan.agentRelationships?.[0]?.arch9UserId || source.assignedAgentId)
  const assignedAgentId = isUuid(mappedAgentId) ? mappedAgentId : existing.assigned_agent_id || null
  const canonical = {
    ...(existing.seller_canonical_facts_json && typeof existing.seller_canonical_facts_json === 'object' ? existing.seller_canonical_facts_json : {}),
    ...(source.sellerCanonicalFacts || {}),
    property24Import: {
      ...(source.sellerCanonicalFacts?.property24Import || {}),
      sourceStatus: live.status,
      semanticStatus: status.semanticStatus,
      isOnPortal: live.isOnPortal,
      lastReconciledAt: generatedAt,
      updateReasonType: live.reasonType,
      updateComment: live.comment,
    },
  }
  return compact({
    organisation_id: source.organisationId,
    branch_id: source.branchId || existing.branch_id || target.branch?.id || null,
    assigned_agent_id: assignedAgentId,
    listing_reference: source.listingReference,
    listing_status: status.listingStatus,
    listing_visibility: status.listingVisibility,
    property_category: source.propertyCategory,
    listing_source: source.listingSource,
    stock_source: 'property24_migration_import',
    property_structure_type: source.propertyStructureType,
    property_type: source.propertyType,
    listing_category: source.listingCategory,
    title: source.title,
    description: source.description,
    asking_price: source.askingPrice,
    estimated_value: source.askingPrice,
    address_line_1: source.addressLine1,
    address_line_2: source.addressLine2,
    formatted_address: source.formattedAddress,
    street_address: source.streetAddress,
    suburb: source.suburb,
    city: source.city,
    province: source.province,
    country: source.country,
    latitude: source.latitude,
    longitude: source.longitude,
    mandate_status: status.mandateStatus,
    seller_onboarding_status: source.sellerOnboardingStatus || 'not_started',
    is_active: status.isActive,
    property24_reference: String(plan.listingNumber),
    property24_status: status.property24Status,
    internal_listing_notes: source.internalListingNotes,
    seller_canonical_facts_json: canonical,
    seller_canonical_fact_readiness_json: {
      imported: true,
      source: 'property24_migration_import',
      external_agent_relationships_preserved: true,
      arch9_agent_resolved: Boolean(assignedAgentId),
      media_rehosted: true,
    },
    seller_canonical_facts_updated_at: generatedAt,
    bedrooms: publication.bedrooms,
    bathrooms: publication.bathrooms,
    erf_size_sqm: publication.erfSize,
    floor_size_sqm: publication.floorSize,
    levy_amount: publication.levies,
    rates_amount: publication.ratesTaxes,
  })
}

function publicationRow(plan, live, listingId) {
  const source = plan.publicationData || {}
  const status = mapProperty24ListingStatus(live.status, sourceListingType(plan), sourceListingVisibility(plan))
  return {
    listing_id: listingId,
    title: source.title,
    address: source.address,
    suburb: source.suburb,
    province: source.province,
    property_type: source.propertyType,
    listing_type: source.listingType,
    asking_price: source.askingPrice,
    bedrooms: source.bedrooms,
    bathrooms: source.bathrooms,
    garages: source.garages,
    parking_bays: source.parkingBays,
    floor_size: source.floorSize,
    erf_size: source.erfSize,
    rates_taxes: source.ratesTaxes,
    levies: source.levies,
    description: source.description,
    features: Array.isArray(source.features) ? source.features : [],
    amenities: Array.isArray(source.amenities) ? source.amenities : [],
    status: status.publicationStatus,
  }
}

function syncRow(plan, live, listingId, context, generatedAt) {
  const status = mapProperty24ListingStatus(live.status, sourceListingType(plan), sourceListingVisibility(plan))
  return {
    private_listing_id: listingId,
    environment: context.environment,
    agency_id: context.agencyId,
    listing_number: integer(plan.listingNumber),
    external_status: status.syncExternalStatus,
    is_on_portal: Boolean(live.isOnPortal),
    last_successful_sync_at: generatedAt,
    last_checked_at: generatedAt,
    last_error: null,
    last_reasons: live.reasonType ? [{ reasonType: live.reasonType, comment: live.comment }] : [],
    last_response_summary: {
      currentStatus: live.status,
      isOnPortal: live.isOnPortal,
      source: live.source,
      reasonType: live.reasonType,
      comment: live.comment,
    },
    last_payload_summary: {
      importVersion: PROPERTY24_MIGRATION_APPLY_VERSION,
      mappingFingerprint: plan.mappingFingerprint,
      listingType: sourceListingType(plan),
      sourceReference: plan.sourceReference,
    },
  }
}

function mediaRowsForListing(imageManifest, listingNumberValue, listingId) {
  const manifest = (imageManifest?.listings || []).find((entry) => integer(entry.listingNumber) === integer(listingNumberValue))
  if (!manifest) return []
  return (manifest.media || []).filter((item) => ['uploaded', 'reused'].includes(item.status)).map((item) => compact({
    listing_id: listingId,
    media_type: 'image',
    file_url: item.publicUrl,
    caption: item.caption,
    sort_order: item.sortOrder,
    is_cover: item.isCover,
    storage_bucket: item.storageBucket,
    storage_path: item.storagePath,
    content_type: item.contentType,
    byte_size: item.byteLength,
    width: item.width,
    height: item.height,
    checksum: item.sha256,
    processing_status: 'ready',
  }))
}

export function buildProperty24MigrationApplyPlan({
  mappingPlan = {},
  liveSnapshot = {},
  target = {},
  imageManifest = null,
  requireCompleteImages = false,
  generatedAt = new Date().toISOString(),
  idFactory = stableUuid,
} = {}) {
  const blockers = [...assertMappingPlan(mappingPlan), ...(liveSnapshot.blockers || [])]
  const warnings = []
  const context = {
    organisationId: text(mappingPlan.context?.organisationId),
    environment: key(mappingPlan.context?.environment),
    agencyId: integer(mappingPlan.context?.agencyId),
  }
  if (!target.organisation?.id) blockers.push({ code: 'arch9_organisation_missing', message: `Arch9 organisation ${context.organisationId} was not found.` })
  if (requireCompleteImages && imageManifest?.status !== 'COMPLETE') blockers.push({ code: 'image_import_incomplete', message: `Image import status must be COMPLETE before database apply; received ${imageManifest?.status || 'missing'}.` })
  if (requireCompleteImages && imageManifest?.summary?.completedImageCount !== mappingPlan.summary?.imageRelationshipCount) {
    blockers.push({ code: 'image_count_mismatch', message: 'Completed image count does not match the mapping plan.' })
  }
  const liveAgents = new Map((liveSnapshot.agents || []).map((agent) => [integer(agent.agentId), agent]))
  const liveListings = new Map((liveSnapshot.listings || []).map((listing) => [integer(listing.listingNumber), listing]))
  const agentOperations = (mappingPlan.agentPlans || []).map((plan) => {
    const id = integer(plan.property24AgentId)
    const live = liveAgents.get(id) || {}
    const existingRows = (target.agentMappings || []).filter((row) => integer(row.property24_agent_id) === id)
    if (existingRows.length > 1) blockers.push({ code: 'agent_mapping_collision', agentId: id, message: `Property24 agent ${id} has multiple Arch9 mapping rows.` })
    const existing = existingRows[0] || null
    const arch9UserId = text(existing?.arch9_user_id || plan.arch9UserId)
    if (!isUuid(arch9UserId)) warnings.push({ code: 'arch9_agent_unresolved', agentId: id, message: `Property24 agent ${id} is retained as an external agent without an Arch9 login.` })
    return {
      property24AgentId: id,
      existingId: existing?.id || null,
      action: existing ? 'update' : 'create',
      row: {
        ...plan.mappingRow,
        organisation_id: context.organisationId,
        environment: context.environment,
        agency_id: context.agencyId,
        arch9_user_id: isUuid(arch9UserId) ? arch9UserId : null,
        source_reference: live.sourceReference || plan.sourceReference,
        email_snapshot: live.email || plan.mappingRow?.email_snapshot || null,
        first_name_snapshot: live.firstName || plan.mappingRow?.first_name_snapshot || null,
        last_name_snapshot: live.lastName || plan.mappingRow?.last_name_snapshot || null,
        mobile_snapshot: live.mobile || plan.mappingRow?.mobile_snapshot || null,
        status: liveAgentStatus(live.status),
        last_seen_at: generatedAt,
      },
    }
  })
  const listingOperations = (mappingPlan.listingPlans || []).map((plan) => {
    const number = integer(plan.listingNumber)
    const live = liveListings.get(number)
    if (!live) blockers.push({ code: 'live_listing_missing', listingNumber: number, message: `No live Property24 snapshot is available for ${number}.` })
    const identity = resolveListingIdentity(plan, target, idFactory, blockers)
    const mediaRows = mediaRowsForListing(imageManifest, number, identity.id)
    const canonicalPaths = new Set(mediaRows.map((row) => text(row.storage_path)).filter(Boolean))
    const canonicalUrls = new Set(mediaRows.map((row) => text(row.file_url)).filter(Boolean))
    const staleMediaIds = requireCompleteImages
      ? (target.media || []).filter((row) => (
          row.listing_id === identity.id &&
          key(row.media_type) === 'image' &&
          !canonicalPaths.has(text(row.storage_path)) &&
          !canonicalUrls.has(text(row.file_url))
        )).map((row) => row.id)
      : []
    if (requireCompleteImages && mediaRows.length !== (plan.mediaPlan?.images?.length || 0)) {
      blockers.push({ code: 'listing_media_count_mismatch', listingNumber: number, message: `Listing ${number} does not have all mapped images ready.` })
    }
    return {
      listingNumber: number,
      listingId: identity.id,
      exists: Boolean(identity.existing),
      action: identity.existing ? 'update' : 'create',
      privateListingRow: live ? privateListingRow(plan, live, identity, target, generatedAt) : {},
      publicationRow: live ? publicationRow(plan, live, identity.id) : {},
      syncRow: live ? syncRow(plan, live, identity.id, context, generatedAt) : {},
      mediaRows,
      staleMediaIds,
      live,
    }
  })
  return {
    version: PROPERTY24_MIGRATION_APPLY_VERSION,
    phase: 'property24-migration-import-phase4-apply-reconcile',
    generatedAt,
    status: blockers.length ? 'BLOCKED' : 'READY',
    context,
    blockers,
    warnings,
    listingIds: Object.fromEntries(listingOperations.flatMap((operation) => [
      [String(operation.listingNumber), operation.listingId],
      [`property24:${context.environment}:${context.agencyId}:listing:${operation.listingNumber}`, operation.listingId],
    ])),
    agentOperations,
    listingOperations,
    summary: {
      agentCount: agentOperations.length,
      unresolvedArch9AgentCount: warnings.filter((warning) => warning.code === 'arch9_agent_unresolved').length,
      listingCount: listingOperations.length,
      createListingCount: listingOperations.filter((operation) => operation.action === 'create').length,
      updateListingCount: listingOperations.filter((operation) => operation.action === 'update').length,
      mediaRowCount: listingOperations.reduce((count, operation) => count + operation.mediaRows.length, 0),
      staleMediaRowCount: listingOperations.reduce((count, operation) => count + operation.staleMediaIds.length, 0),
    },
  }
}

function verificationSummary(verification, plan) {
  const expectedListingIds = new Set(plan.listingOperations.map((operation) => operation.listingId))
  const expectedNumbers = new Set(plan.listingOperations.map((operation) => operation.listingNumber))
  const mediaExpected = plan.listingOperations.reduce((count, operation) => count + operation.mediaRows.length, 0)
  const expectedPaths = new Set(plan.listingOperations.flatMap((operation) => operation.mediaRows.map((row) => row.storage_path)))
  const importedMedia = verification.media.filter((row) => expectedListingIds.has(row.listing_id) && expectedPaths.has(row.storage_path))
  const unexpectedImages = verification.media.filter((row) => expectedListingIds.has(row.listing_id) && key(row.media_type) === 'image' && !expectedPaths.has(row.storage_path))
  const checks = {
    agents: verification.agents.length === plan.agentOperations.length,
    listings: verification.listings.length === expectedListingIds.size,
    publications: verification.publications.length === expectedListingIds.size,
    syncs: verification.syncs.filter((row) => expectedNumbers.has(integer(row.listing_number))).length === expectedNumbers.size,
    media: importedMedia.length === mediaExpected && unexpectedImages.length === 0,
  }
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    importedMediaCount: importedMedia.length,
    expectedMediaCount: mediaExpected,
    unexpectedImageCount: unexpectedImages.length,
  }
}

export async function executeProperty24MigrationApply({
  repository,
  property24,
  mappingPlan,
  imageManifest = null,
  apply = false,
  fromDate = '',
  generatedAt = new Date().toISOString(),
  idFactory,
} = {}) {
  if (!repository?.inspect) throw new Error('A Property24 migration repository is required.')
  const context = mappingPlan?.context || {}
  const liveSnapshot = await fetchProperty24MigrationLiveSnapshot({ property24, mappingPlan, fromDate })
  let target
  try {
    target = await repository.inspect({
      organisationId: context.organisationId,
      environment: key(context.environment),
      agencyId: integer(context.agencyId),
      listingPlans: mappingPlan.listingPlans || [],
      agentPlans: mappingPlan.agentPlans || [],
    })
  } catch (error) {
    return {
      version: PROPERTY24_MIGRATION_APPLY_VERSION,
      phase: 'property24-migration-import-phase4-apply-reconcile',
      status: 'BLOCKED',
      mode: apply ? 'apply' : 'dry-run',
      generatedAt,
      blockers: [{ code: 'arch9_preflight_failed', message: error.message }],
      liveSnapshot,
      safety: { property24WritesPerformed: false, databaseWritesPerformed: false, storageWritesPerformed: false },
    }
  }
  const plan = buildProperty24MigrationApplyPlan({
    mappingPlan,
    liveSnapshot,
    target,
    imageManifest,
    requireCompleteImages: apply,
    generatedAt,
    idFactory,
  })
  if (!apply || plan.status === 'BLOCKED') {
    return {
      ...plan,
      status: plan.status === 'BLOCKED' ? 'BLOCKED' : 'DRY_RUN_READY',
      mode: 'dry-run',
      liveSnapshot,
      safety: { property24WritesPerformed: false, databaseWritesPerformed: false, storageWritesPerformed: false },
    }
  }
  const completed = []
  let currentStep = 'agent_mappings'
  try {
    for (const operation of plan.agentOperations) {
      await repository.saveAgent(operation)
      completed.push({ step: 'agent_mapping', agentId: operation.property24AgentId, action: operation.action })
    }
    for (const operation of plan.listingOperations) {
      currentStep = `listing_${operation.listingNumber}`
      await repository.saveListing(operation)
      await repository.savePublication(operation)
      await repository.saveSync(operation)
      await repository.saveMedia(operation)
      completed.push({
        step: 'listing_import',
        listingNumber: operation.listingNumber,
        listingId: operation.listingId,
        action: operation.action,
        property24Status: operation.live.status,
        isOnPortal: operation.live.isOnPortal,
        mediaCount: operation.mediaRows.length,
        staleMediaRemoved: operation.staleMediaIds.length,
      })
    }
    currentStep = 'verification'
    const verification = await repository.verify({
      organisationId: plan.context.organisationId,
      environment: plan.context.environment,
      agencyId: plan.context.agencyId,
      listingNumbers: plan.listingOperations.map((operation) => operation.listingNumber),
      listingIds: plan.listingOperations.map((operation) => operation.listingId),
      property24AgentIds: plan.agentOperations.map((operation) => operation.property24AgentId),
    })
    const summary = verificationSummary(verification, plan)
    if (!summary.passed) throw new Error(`Post-apply verification failed: ${JSON.stringify(summary.checks)}.`)
    return {
      ...plan,
      status: 'COMPLETE',
      mode: 'apply',
      liveSnapshot,
      completed,
      verification: { summary, ...verification },
      safety: { property24WritesPerformed: false, databaseWritesPerformed: true, storageWritesPerformed: false },
    }
  } catch (error) {
    return {
      ...plan,
      status: completed.length ? 'PARTIAL_FAILURE' : 'BLOCKED',
      mode: 'apply',
      liveSnapshot,
      completed,
      error: { step: currentStep, name: error.name || 'Error', message: error.message },
      safety: { property24WritesPerformed: false, databaseWritesPerformed: completed.length > 0, storageWritesPerformed: false },
    }
  }
}
