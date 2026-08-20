import { normalizeProperty24ListingText, toProperty24Integer } from './property24ListingMapper.js'

export function resolveArch9Property24Status({ isOnPortal = false, externalStatus = '' } = {}) {
  const status = normalizeProperty24ListingText(externalStatus).toLowerCase()
  if (status === 'removed') return 'removed'
  if (status === 'paused') return 'paused'
  if (status === 'failed') return 'draft'
  return isOnPortal ? 'published' : 'draft'
}

function normalizeReasons(reasons) {
  return Array.isArray(reasons) ? reasons : []
}

function isSchemaCacheColumnError(error = {}, columnNames = []) {
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return error.code === '42703' ||
    error.code === 'PGRST204' ||
    columnNames.some((column) => message.includes(column.toLowerCase()) && (
      message.includes('schema cache') ||
      message.includes('could not find') ||
      message.includes('does not exist')
    ))
}

async function upsertProperty24ListingSync(client, syncPayload) {
  const { data, error } = await client
    .from('property24_listing_syncs')
    .upsert(syncPayload, { onConflict: 'private_listing_id,environment' })
    .select('*')
    .single()

  if (error && isSchemaCacheColumnError(error, ['last_payload_hash', 'last_image_payload_hash'])) {
    const {
      last_payload_hash: _lastPayloadHash,
      last_image_payload_hash: _lastImagePayloadHash,
      ...fallbackPayload
    } = syncPayload
    const fallback = await client
      .from('property24_listing_syncs')
      .upsert(fallbackPayload, { onConflict: 'private_listing_id,environment' })
      .select('*')
      .single()
    if (fallback.error) throw fallback.error
    return {
      data: fallback.data,
      warning: {
        code: 'property24_listing_sync_hash_columns_missing',
        message: 'property24_listing_syncs hash columns are not available; sync record was written without payload hashes.',
      },
    }
  }

  if (error) throw error
  return { data, warning: null }
}

export async function recordProperty24ListingSync({
  client,
  listingId,
  agencyId,
  listingNumber,
  environment = 'exdev',
  isOnPortal = false,
  reasons = [],
  externalStatus = '',
  responseSummary = {},
  payloadSummary = {},
  payloadHash = '',
  imagePayloadHash = '',
  property24ListingUrl = '',
  allowPublishWithoutMandate = false,
  publishWithoutMandateReason = 'Property24 syndication accepted before mandate evidence was uploaded.',
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const privateListingId = normalizeProperty24ListingText(listingId)
  const property24AgencyId = toProperty24Integer(agencyId)
  const property24ListingNumber = toProperty24Integer(listingNumber)
  const property24Environment = normalizeProperty24ListingText(environment) || 'exdev'
  const now = new Date().toISOString()
  const syncStatus = normalizeProperty24ListingText(externalStatus) || (isOnPortal ? 'on_portal' : 'submitted')

  if (!privateListingId) throw new Error('listingId is required.')
  if (!property24AgencyId) throw new Error('agencyId is required.')
  if (!property24ListingNumber) throw new Error('listingNumber is required.')

  const syncPayload = {
    private_listing_id: privateListingId,
    environment: property24Environment,
    agency_id: property24AgencyId,
    listing_number: property24ListingNumber,
    external_status: syncStatus,
    is_on_portal: Boolean(isOnPortal),
    last_successful_sync_at: now,
    last_checked_at: now,
    last_error: null,
    last_reasons: normalizeReasons(reasons),
    last_response_summary: responseSummary && typeof responseSummary === 'object' ? responseSummary : {},
    last_payload_summary: payloadSummary && typeof payloadSummary === 'object' ? payloadSummary : {},
    ...(normalizeProperty24ListingText(payloadHash) ? { last_payload_hash: normalizeProperty24ListingText(payloadHash) } : {}),
    ...(normalizeProperty24ListingText(imagePayloadHash) ? { last_image_payload_hash: normalizeProperty24ListingText(imagePayloadHash) } : {}),
  }

  const { data: sync, warning: syncWarning } = await upsertProperty24ListingSync(client, syncPayload)

  const nextProperty24Status = resolveArch9Property24Status({ isOnPortal, externalStatus: syncStatus })
  const allowProperty24MandateOverride = nextProperty24Status === 'published' && allowPublishWithoutMandate
  const listingPatch = {
    property24_reference: String(property24ListingNumber),
    ...(normalizeProperty24ListingText(property24ListingUrl) ? { property24_listing_url: normalizeProperty24ListingText(property24ListingUrl) } : {}),
  }

  const { data: listing, error: listingError } = await client
    .from('private_listings')
    .update(listingPatch)
    .eq('id', privateListingId)
    .select('id, property24_reference, property24_status, property24_listing_url, updated_at')
    .single()

  if (listingError) throw listingError

  let statusListing = listing
  let statusUpdateWarning = null
  const { data: statusData, error: statusError } = await client
    .from('private_listings')
    .update({
      property24_status: nextProperty24Status,
      ...(allowProperty24MandateOverride
        ? {
            property24_publish_without_mandate: true,
            property24_publish_without_mandate_reason: normalizeProperty24ListingText(publishWithoutMandateReason),
          }
        : {}),
    })
    .eq('id', privateListingId)
    .select('id, property24_reference, property24_status, property24_listing_url, property24_publish_without_mandate, property24_publish_without_mandate_reason, property24_publish_without_mandate_at, updated_at')
    .single()

  if (statusError) {
    statusUpdateWarning = {
      message: statusError.message,
      code: statusError.code || null,
      details: statusError.details || null,
    }
  } else {
    statusListing = statusData
  }

  let externalLink = null
  let externalLinkWarning = null
  const normalizedProperty24ListingUrl = normalizeProperty24ListingText(property24ListingUrl)
  if (normalizedProperty24ListingUrl) {
    const { data: linkData, error: linkError } = await client
      .from('listing_external_links')
      .upsert({
        listing_id: privateListingId,
        platform: 'Property24',
        url: normalizedProperty24ListingUrl,
        status: nextProperty24Status === 'published' ? 'Published' : nextProperty24Status,
        published_at: nextProperty24Status === 'published' ? now : null,
        last_checked_at: now,
        notes: 'Managed by Property24 syndication.',
        visible_to_seller: nextProperty24Status === 'published',
      }, { onConflict: 'listing_id,platform' })
      .select('id, listing_id, platform, url, status, published_at, last_checked_at, visible_to_seller')
      .single()

    if (linkError) {
      externalLinkWarning = {
        message: linkError.message,
        code: linkError.code || null,
        details: linkError.details || null,
      }
    } else {
      externalLink = linkData
    }
  }

  return {
    sync,
    listing: statusListing,
    syncWarning,
    statusUpdateWarning,
    externalLink,
    externalLinkWarning,
  }
}
