import { normalizePrivatePropertyText } from './privatePropertyClient.js'

function normalizeJsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeStatusKey(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeExternalStatus(value = '', fallback = 'submitted') {
  const status = normalizeStatusKey(value)
  if (['submitted', 'active', 'inactive', 'failed', 'removed', 'paused', 'unknown'].includes(status)) return status
  return normalizeStatusKey(fallback) || 'submitted'
}

export function resolvePrivatePropertyExternalStatus({
  privatePropertyStatus = '',
  eventType = '',
  eventStatus = '',
  fallback = 'submitted',
} = {}) {
  const status = normalizeStatusKey(privatePropertyStatus)
  const type = normalizeStatusKey(eventType)
  const event = normalizeStatusKey(eventStatus)

  if (type.includes('error') || event.includes('error') || event.includes('failed')) return 'failed'
  if (['activated', 'active', 'for_sale', 'to_let', 'live', 'published'].includes(type) || ['active', 'for_sale', 'to_let'].includes(status) || event === 'active') return 'active'
  if (['deactivated', 'inactive'].includes(type) || status === 'inactive') return 'inactive'
  if (['removed', 'archived'].includes(type) || ['removed', 'archived'].includes(status)) return 'removed'
  if (['paused'].includes(type) || status === 'paused') return 'paused'
  if (status) return 'unknown'
  return normalizeExternalStatus(fallback)
}

export function resolveArch9PrivatePropertyStatus({ externalStatus = '', isOnPortal = false } = {}) {
  const status = normalizeStatusKey(externalStatus)
  if (status === 'removed') return 'removed'
  if (status === 'paused') return 'paused'
  if (status === 'active' || isOnPortal) return 'published'
  return 'draft'
}

export function summarizePrivatePropertySyncPayload(payloadSummary = {}) {
  const payload = normalizeJsonObject(payloadSummary)
  return {
    propertyId: normalizePrivatePropertyText(payload.propertyId),
    branchId: normalizePrivatePropertyText(payload.branchId),
    agentIds: normalizeJsonArray(payload.agentIds).map(normalizePrivatePropertyText).filter(Boolean),
    listingType: normalizePrivatePropertyText(payload.listingType),
    category: normalizePrivatePropertyText(payload.category),
    mandateType: normalizePrivatePropertyText(payload.mandateType),
    propertyStatus: normalizePrivatePropertyText(payload.propertyStatus),
    price: payload.price ?? null,
    listingDate: normalizePrivatePropertyText(payload.listingDate),
    suburbId: payload.suburbId ?? null,
    imageUrlCount: payload.imageUrlCount ?? null,
    photoUrlPayloadCount: payload.photoUrlPayloadCount ?? null,
    attributeCount: payload.attributeCount ?? null,
  }
}

function isRecoverableSyncTableError(error = {}) {
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return error.code === '42P01' || error.code === 'PGRST205' || message.includes('private_property_listing_syncs') && (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  )
}

function isPrivateListingStatusGuardError(error = {}) {
  const detail = normalizePrivatePropertyText(error.details)
  const message = normalizePrivatePropertyText(error.message)
  return error.code === 'P0001' && (
    detail === 'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED' ||
    message.toLowerCase().includes('canonical mandate')
  )
}

async function upsertExternalLink({ client, privateListingId, url, status, now } = {}) {
  const normalizedUrl = normalizePrivatePropertyText(url)
  if (!normalizedUrl) return { externalLink: null, externalLinkWarning: null }

  const { data, error } = await client
    .from('listing_external_links')
    .upsert({
      listing_id: privateListingId,
      platform: 'Private Property',
      url: normalizedUrl,
      status: status === 'published' ? 'Published' : status === 'removed' ? 'Removed' : 'Draft',
      published_at: status === 'published' ? now.slice(0, 10) : null,
      last_checked_at: now.slice(0, 10),
      notes: 'Managed by Private Property syndication.',
      visible_to_seller: status === 'published',
    }, { onConflict: 'listing_id,platform' })
    .select('id, listing_id, platform, url, status, published_at, last_checked_at, visible_to_seller')
    .single()

  if (error) {
    return {
      externalLink: null,
      externalLinkWarning: {
        message: error.message,
        code: error.code || null,
        details: error.details || null,
      },
    }
  }

  return { externalLink: data, externalLinkWarning: null }
}

export async function recordPrivatePropertyListingSync({
  client,
  listingId,
  propertyId,
  branchGuid,
  environment = 'sandbox',
  listingType = 'Sale',
  privatePropertyRef = '',
  privatePropertyStatus = '',
  externalStatus = '',
  isOnPortal = false,
  eventType = '',
  eventStatus = '',
  eventDescription = '',
  eventAt = '',
  continuationKey = '',
  suburbId = null,
  agentIds = [],
  responseSummary = {},
  payloadSummary = {},
  eventSummary = {},
  submittedAt = '',
  activatedAt = '',
  privatePropertyListingUrl = '',
  lastError = '',
} = {}) {
  if (!client) throw new Error('Supabase client is required.')

  const privateListingId = normalizePrivatePropertyText(listingId)
  const syncPropertyId = normalizePrivatePropertyText(propertyId)
  const syncBranchGuid = normalizePrivatePropertyText(branchGuid)
  const syncEnvironment = normalizePrivatePropertyText(environment) || 'sandbox'
  const syncListingType = normalizePrivatePropertyText(listingType) || 'Sale'
  const now = new Date().toISOString()
  const eventDerivedStatus = resolvePrivatePropertyExternalStatus({
    privatePropertyStatus,
    eventType,
    eventStatus,
    fallback: externalStatus || 'submitted',
  })
  const syncExternalStatus = normalizeExternalStatus(externalStatus, eventDerivedStatus)
  const portalStatus = Boolean(isOnPortal || syncExternalStatus === 'active')
  const arch9Status = resolveArch9PrivatePropertyStatus({ externalStatus: syncExternalStatus, isOnPortal: portalStatus })

  if (!privateListingId) throw new Error('listingId is required.')
  if (!syncPropertyId) throw new Error('propertyId is required.')
  if (!syncBranchGuid) throw new Error('branchGuid is required.')

  const syncPayload = {
    private_listing_id: privateListingId,
    environment: syncEnvironment,
    branch_guid: syncBranchGuid,
    property_id: syncPropertyId,
    listing_type: syncListingType,
    private_property_ref: normalizePrivatePropertyText(privatePropertyRef) || null,
    external_status: syncExternalStatus,
    is_on_portal: portalStatus,
    last_event_type: normalizePrivatePropertyText(eventType) || null,
    last_event_status: normalizePrivatePropertyText(eventStatus) || null,
    last_event_description: normalizePrivatePropertyText(eventDescription) || null,
    last_event_at: normalizePrivatePropertyText(eventAt) || null,
    continuation_key: normalizePrivatePropertyText(continuationKey) || null,
    suburb_id: Number(suburbId) || null,
    agent_ids: normalizeJsonArray(agentIds).map(normalizePrivatePropertyText).filter(Boolean),
    last_successful_sync_at: syncExternalStatus === 'failed' ? null : now,
    submitted_at: normalizePrivatePropertyText(submittedAt) || null,
    activated_at: normalizePrivatePropertyText(activatedAt) || (syncExternalStatus === 'active' ? now : null),
    last_checked_at: now,
    last_error: normalizePrivatePropertyText(lastError) || null,
    last_response_summary: normalizeJsonObject(responseSummary),
    last_payload_summary: summarizePrivatePropertySyncPayload(payloadSummary),
    last_event_summary: normalizeJsonObject(eventSummary),
  }

  const { data: sync, error: syncError } = await client
    .from('private_property_listing_syncs')
    .upsert(syncPayload, { onConflict: 'private_listing_id,environment' })
    .select('*')
    .single()

  if (syncError && isRecoverableSyncTableError(syncError)) {
    throw new Error('private_property_listing_syncs table is not available. Apply sql/20260824_private_property_listing_syncs.sql before recording sync state.')
  }
  if (syncError) throw syncError

  const listingPatch = {
    private_property_status: arch9Status,
    ...(normalizePrivatePropertyText(privatePropertyRef) ? { private_property_reference: normalizePrivatePropertyText(privatePropertyRef) } : {}),
    ...(normalizePrivatePropertyText(privatePropertyListingUrl) ? { private_property_listing_url: normalizePrivatePropertyText(privatePropertyListingUrl) } : {}),
  }
  const { data: listing, error: listingError } = await client
    .from('private_listings')
    .update(listingPatch)
    .eq('id', privateListingId)
    .select('id, private_property_reference, private_property_status, private_property_listing_url, updated_at')
    .single()

  if (listingError && !isPrivateListingStatusGuardError(listingError)) throw listingError
  const listingUpdateWarning = listingError ? {
    message: listingError.message,
    code: listingError.code || null,
    details: listingError.details || null,
  } : null

  const { externalLink, externalLinkWarning } = await upsertExternalLink({
    client,
    privateListingId,
    url: privatePropertyListingUrl,
    status: arch9Status,
    now,
  })

  return {
    sync,
    listing,
    listingUpdateWarning,
    externalLink,
    externalLinkWarning,
    arch9Status,
  }
}
