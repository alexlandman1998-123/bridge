import { createListingSlug } from './publicListingsService.js'

export const PUBLIC_LISTING_SITE_ORIGIN = 'https://www.arch9.co.za'
export const EXCLUDED_PUBLIC_LISTING_STATUSES = new Set(['sold', 'withdrawn', 'transaction_created'])

export function normalizePublicListingText(value = '') {
  return String(value || '').trim()
}

export function normalizePublicListingKey(value = '') {
  return normalizePublicListingText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

export function toPublicListingNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function normalizePublicListingArray(value) {
  if (Array.isArray(value)) return value.map(normalizePublicListingText).filter(Boolean)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return normalizePublicListingArray(parsed)
    } catch {
      return value.split(',').map(normalizePublicListingText).filter(Boolean)
    }
  }
  return []
}

export function mergePublicListingValue(...values) {
  return values.map(normalizePublicListingText).find(Boolean) || null
}

export function getPublicListingCoverImage(media = []) {
  return media
    .filter((item) => normalizePublicListingKey(item.media_type) === 'image' && normalizePublicListingText(item.file_url))
    .sort((left, right) => {
      if (Boolean(left.is_cover) !== Boolean(right.is_cover)) return left.is_cover ? -1 : 1
      return Number(left.sort_order || 0) - Number(right.sort_order || 0)
    })[0] || null
}

export function buildPublicListingPublicationPayload(listing = {}, publication = {}) {
  const title = mergePublicListingValue(publication.title, listing.title)
  const askingPrice = toPublicListingNumber(publication.asking_price ?? listing.asking_price)
  const description = mergePublicListingValue(publication.description, listing.description)

  return {
    listing_id: listing.id,
    title,
    address: mergePublicListingValue(publication.address, listing.address_line_1, listing.formatted_address, listing.street_address),
    suburb: mergePublicListingValue(publication.suburb, listing.suburb),
    province: mergePublicListingValue(publication.province, listing.province),
    property_type: mergePublicListingValue(publication.property_type, listing.property_type),
    listing_type: normalizePublicListingText(publication.listing_type) === 'Rental' ? 'Rental' : 'Sale',
    asking_price: askingPrice,
    bedrooms: toPublicListingNumber(publication.bedrooms),
    bathrooms: toPublicListingNumber(publication.bathrooms),
    garages: toPublicListingNumber(publication.garages),
    parking_bays: toPublicListingNumber(publication.parking_bays),
    floor_size: toPublicListingNumber(publication.floor_size),
    erf_size: toPublicListingNumber(publication.erf_size),
    rates_taxes: toPublicListingNumber(publication.rates_taxes),
    levies: toPublicListingNumber(publication.levies),
    description,
    features: normalizePublicListingArray(publication.features),
    amenities: normalizePublicListingArray(publication.amenities),
    status: 'Published',
  }
}

export function getPublicListingReadinessBlockers({ listing = {}, publication = {}, media = [] } = {}) {
  const payload = buildPublicListingPublicationPayload(listing, publication)
  const blockers = []
  const listingStatus = normalizePublicListingKey(listing.listing_status)
  if (EXCLUDED_PUBLIC_LISTING_STATUSES.has(listingStatus)) blockers.push(`listing_status=${listing.listing_status}`)
  if (normalizePublicListingKey(listing.bridge_listing_status) !== 'published') blockers.push('bridge_listing_status is not published')
  if (normalizePublicListingKey(listing.listing_visibility) !== 'active_market') blockers.push('listing_visibility is not active_market')
  if (normalizePublicListingKey(publication.status) !== 'published') blockers.push('publication status is not Published')
  if (!payload.title) blockers.push('missing title')
  if (!payload.asking_price || payload.asking_price <= 0) blockers.push('missing asking price')
  if (!payload.description) blockers.push('missing public description')
  if (!payload.suburb && !listing.city) blockers.push('missing suburb or city')
  if (!getPublicListingCoverImage(media)) blockers.push('missing listing_media image')
  return blockers
}

export function getPublicListingBackfillBlockers({ listing = {}, publication = {}, media = [] } = {}) {
  return getPublicListingReadinessBlockers({ listing, publication: { ...publication, status: 'Published' }, media })
}

export function buildPublicListingUrl(listing = {}, publication = {}, host = PUBLIC_LISTING_SITE_ORIGIN) {
  const slug = createListingSlug({ listing, publication })
  return `${String(host || PUBLIC_LISTING_SITE_ORIGIN).replace(/\/+$/g, '')}/buy/${slug}`
}

export function createPublicListingLaunchPlan({ listing = {}, publication = {}, media = [], host = PUBLIC_LISTING_SITE_ORIGIN } = {}) {
  const payload = buildPublicListingPublicationPayload(listing, publication)
  const publicUrl = buildPublicListingUrl(listing, payload, host)
  const blockers = getPublicListingBackfillBlockers({ listing, publication, media })
  const imageCount = (media || []).filter((item) => normalizePublicListingKey(item.media_type) === 'image' && normalizePublicListingText(item.file_url)).length
  const currentBlockers = getPublicListingReadinessBlockers({ listing, publication, media })
  const canApply = blockers.length === 0

  return {
    listingId: normalizePublicListingText(listing.id),
    title: payload.title || normalizePublicListingText(listing.title) || 'Untitled listing',
    mode: canApply ? 'ready_to_publish' : 'blocked',
    canApply,
    publicUrl,
    publicationPayload: canApply ? payload : null,
    listingPatch: canApply
      ? {
          bridge_listing_public_url: publicUrl,
          bridge_listing_status: 'published',
          listing_visibility: 'active_market',
        }
      : null,
    summary: {
      listingStatus: normalizePublicListingText(listing.listing_status),
      listingVisibility: normalizePublicListingText(listing.listing_visibility),
      bridgeListingStatus: normalizePublicListingText(listing.bridge_listing_status),
      publicationStatus: normalizePublicListingText(publication.status),
      mediaCount: (media || []).length,
      imageCount,
      currentBlockers,
      launchBlockers: blockers,
    },
  }
}

function getLaunchCandidateAction(blocker = '') {
  if (blocker.startsWith('listing_status=')) return 'Move this listing back to an active listing lifecycle before publishing.'
  if (blocker === 'bridge_listing_status is not published') return 'Mark the Arch9 Buy publishing status as published from Listing Site Data.'
  if (blocker === 'listing_visibility is not active_market') return 'Set listing visibility to active market.'
  if (blocker === 'missing title') return 'Add a public listing title.'
  if (blocker === 'missing asking price') return 'Add an asking price.'
  if (blocker === 'missing public description') return 'Add public-facing listing copy.'
  if (blocker === 'missing suburb or city') return 'Add at least a suburb or city.'
  if (blocker === 'missing listing_media image') return 'Upload and select at least one listing image.'
  return blocker
}

function getLaunchCandidateType(plan = {}) {
  const blockers = plan.summary?.launchBlockers || []
  if (plan.canApply) return 'ready_to_apply'
  if (blockers.some((blocker) => blocker.startsWith('listing_status='))) return 'blocked_lifecycle'
  if (blockers.includes('missing listing_media image')) return 'needs_media'
  if (blockers.some((blocker) => blocker.startsWith('missing '))) return 'needs_data'
  if (blockers.includes('bridge_listing_status is not published') || blockers.includes('listing_visibility is not active_market')) return 'needs_publish_state'
  return 'blocked'
}

function getLaunchCandidateScore(plan = {}) {
  const blockers = plan.summary?.launchBlockers || []
  if (plan.canApply) return 100
  let score = 100 - blockers.length * 18
  if (blockers.some((blocker) => blocker.startsWith('listing_status='))) score -= 45
  if (blockers.includes('missing listing_media image')) score -= 18
  if (blockers.includes('missing public description')) score -= 8
  if (blockers.includes('missing asking price')) score -= 10
  if (plan.summary?.imageCount > 0) score += 8
  if (normalizePublicListingKey(plan.summary?.listingVisibility) === 'active_market') score += 5
  if (normalizePublicListingKey(plan.summary?.bridgeListingStatus) === 'published') score += 5
  return Math.max(0, Math.min(100, score))
}

export function createPublicListingLaunchCandidateReport({ listings = [], publications = [], media = [], host = PUBLIC_LISTING_SITE_ORIGIN, limit = 20 } = {}) {
  const publicationsByListingId = new Map((publications || []).map((row) => [normalizePublicListingText(row.listing_id), row]))
  const mediaByListingId = groupByListingId(media)
  const normalizedLimit = Math.max(1, Math.min(100, Number.isFinite(Number(limit)) ? Math.round(Number(limit)) : 20))
  const candidates = (listings || []).map((listing) => {
    const listingId = normalizePublicListingText(listing.id)
    const publication = publicationsByListingId.get(listingId) || {}
    const listingMedia = mediaByListingId.get(listingId) || []
    const plan = createPublicListingLaunchPlan({ listing, publication, media: listingMedia, host })
    const candidateType = getLaunchCandidateType(plan)
    const launchBlockers = plan.summary.launchBlockers || []
    const currentBlockers = plan.summary.currentBlockers || []
    return {
      listingId,
      title: plan.title,
      candidateType,
      score: getLaunchCandidateScore(plan),
      canApply: plan.canApply,
      publicUrl: plan.publicUrl,
      listingStatus: plan.summary.listingStatus,
      listingVisibility: plan.summary.listingVisibility,
      bridgeListingStatus: plan.summary.bridgeListingStatus,
      publicationStatus: plan.summary.publicationStatus,
      mediaCount: plan.summary.mediaCount,
      imageCount: plan.summary.imageCount,
      currentBlockers,
      launchBlockers,
      actionItems: launchBlockers.map(getLaunchCandidateAction),
      command: `npm run publish:public-listing -- --listing-id=${listingId}`,
    }
  })

  candidates.sort((left, right) => {
    if (left.canApply !== right.canApply) return left.canApply ? -1 : 1
    if (right.score !== left.score) return right.score - left.score
    if (right.imageCount !== left.imageCount) return right.imageCount - left.imageCount
    return left.title.localeCompare(right.title)
  })

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalListings: candidates.length,
      readyToApply: candidates.filter((candidate) => candidate.candidateType === 'ready_to_apply').length,
      needsMedia: candidates.filter((candidate) => candidate.candidateType === 'needs_media').length,
      needsData: candidates.filter((candidate) => candidate.candidateType === 'needs_data').length,
      needsPublishState: candidates.filter((candidate) => candidate.candidateType === 'needs_publish_state').length,
      blockedLifecycle: candidates.filter((candidate) => candidate.candidateType === 'blocked_lifecycle').length,
    },
    candidates: candidates.slice(0, normalizedLimit),
  }
}

export function normalizePublicListingMediaUrls(value = '') {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  return values
    .map((item) => normalizePublicListingText(item))
    .filter(Boolean)
    .map((item) => {
      try {
        const parsed = new URL(item)
        if (!['http:', 'https:'].includes(parsed.protocol)) return ''
        return parsed.toString()
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

export function createPublicListingMediaAttachmentPlan({ listing = {}, existingMedia = [], imageUrls = [], caption = 'Listing image' } = {}) {
  const listingId = normalizePublicListingText(listing.id)
  const urls = normalizePublicListingMediaUrls(imageUrls)
  const existingImageUrls = new Set((existingMedia || []).map((item) => normalizePublicListingText(item.file_url)).filter(Boolean))
  const duplicateUrls = urls.filter((url) => existingImageUrls.has(url))
  const newUrls = urls.filter((url, index) => !existingImageUrls.has(url) && urls.indexOf(url) === index)
  const existingMaxSort = (existingMedia || []).reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), -1)
  const hasExistingCover = (existingMedia || []).some((item) => normalizePublicListingKey(item.media_type) === 'image' && Boolean(item.is_cover))
  const rows = newUrls.map((url, index) => ({
    listing_id: listingId,
    media_type: 'image',
    file_url: url,
    caption: normalizePublicListingText(caption) || 'Listing image',
    sort_order: existingMaxSort + index + 1,
    is_cover: !hasExistingCover && index === 0,
  }))
  const blockers = []
  if (!listingId) blockers.push('missing listing id')
  if (!urls.length) blockers.push('missing valid image URL')
  if (!rows.length && duplicateUrls.length) blockers.push('all image URLs already exist')

  return {
    listingId,
    canApply: blockers.length === 0,
    mode: blockers.length ? 'blocked' : 'ready_to_attach',
    rows,
    summary: {
      requestedUrls: urls.length,
      newUrls: newUrls.length,
      duplicateUrls: duplicateUrls.length,
      existingMedia: (existingMedia || []).length,
      willSetCover: rows.some((row) => row.is_cover),
      blockers,
    },
  }
}

function groupByListingId(rows = []) {
  return rows.reduce((map, row) => {
    const listingId = normalizePublicListingText(row.listing_id)
    if (!listingId) return map
    if (!map.has(listingId)) map.set(listingId, [])
    map.get(listingId).push(row)
    return map
  }, new Map())
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1
}

export function summarizePublicListingReadiness({ listings = [], publications = [], media = [], host = PUBLIC_LISTING_SITE_ORIGIN } = {}) {
  const publicationsByListingId = new Map((publications || []).map((row) => [normalizePublicListingText(row.listing_id), row]))
  const mediaByListingId = groupByListingId(media)
  const blockerCounts = {}
  const eligible = []
  const blocked = []
  const backfillable = []
  const needsPublicationSave = []
  const needsMedia = []
  const blockedLifecycle = []

  for (const listing of listings || []) {
    const publication = publicationsByListingId.get(normalizePublicListingText(listing.id)) || {}
    const listingMedia = mediaByListingId.get(normalizePublicListingText(listing.id)) || []
    const payload = buildPublicListingPublicationPayload(listing, publication)
    const blockers = getPublicListingReadinessBlockers({ listing, publication, media: listingMedia })
    const backfillBlockers = getPublicListingBackfillBlockers({ listing, publication, media: listingMedia })
    const row = {
      id: listing.id,
      title: payload.title || normalizePublicListingText(listing.title) || 'Untitled listing',
      listingStatus: normalizePublicListingText(listing.listing_status),
      listingVisibility: normalizePublicListingText(listing.listing_visibility),
      bridgeListingStatus: normalizePublicListingText(listing.bridge_listing_status),
      publicationStatus: normalizePublicListingText(publication.status),
      mediaCount: listingMedia.length,
      imageCount: listingMedia.filter((item) => normalizePublicListingKey(item.media_type) === 'image' && normalizePublicListingText(item.file_url)).length,
      publicUrl: buildPublicListingUrl(listing, payload, host),
      blockers,
      backfillBlockers,
    }

    if (blockers.length) {
      blocked.push(row)
      for (const blocker of blockers) increment(blockerCounts, blocker)
    } else {
      eligible.push(row)
    }

    if (!backfillBlockers.length && normalizePublicListingKey(publication.status) !== 'published') {
      backfillable.push(row)
    }
    if (blockers.includes('publication status is not Published')) {
      needsPublicationSave.push(row)
    }
    if (blockers.includes('missing listing_media image')) {
      needsMedia.push(row)
    }
    if (EXCLUDED_PUBLIC_LISTING_STATUSES.has(normalizePublicListingKey(listing.listing_status))) {
      blockedLifecycle.push(row)
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalListings: listings.length,
      activeMarket: listings.filter((listing) => normalizePublicListingKey(listing.listing_visibility) === 'active_market').length,
      bridgePublished: listings.filter((listing) => normalizePublicListingKey(listing.bridge_listing_status) === 'published').length,
      publicationRows: publications.length,
      publicationPublished: publications.filter((publication) => normalizePublicListingKey(publication.status) === 'published').length,
      mediaRows: media.length,
      eligible: eligible.length,
      blocked: blocked.length,
      backfillable: backfillable.length,
    },
    blockerCounts,
    actionQueues: {
      eligible: eligible.slice(0, 25),
      backfillable: backfillable.slice(0, 25),
      needsPublicationSave: needsPublicationSave.slice(0, 25),
      needsMedia: needsMedia.slice(0, 25),
      blockedLifecycle: blockedLifecycle.slice(0, 25),
    },
  }
}

export async function fetchPublicListingReadinessRows(client) {
  const listingQuery = await client
    .from('private_listings')
    .select([
      'id',
      'listing_status',
      'listing_visibility',
      'bridge_listing_status',
      'bridge_listing_public_url',
      'title',
      'description',
      'address_line_1',
      'formatted_address',
      'street_address',
      'suburb',
      'city',
      'province',
      'property_type',
      'asking_price',
      'created_at',
      'updated_at',
    ].join(', '))
    .order('updated_at', { ascending: false })

  if (listingQuery.error) throw listingQuery.error
  const listings = listingQuery.data || []
  const listingIds = listings.map((listing) => listing.id).filter(Boolean)
  if (!listingIds.length) return { listings, publications: [], media: [] }

  const publicationQuery = await client
    .from('listing_publication_data')
    .select('*')
    .in('listing_id', listingIds)
  if (publicationQuery.error) throw publicationQuery.error

  const mediaQuery = await client
    .from('listing_media')
    .select('listing_id, media_type, file_url, caption, sort_order, is_cover')
    .in('listing_id', listingIds)
  if (mediaQuery.error) throw mediaQuery.error

  return {
    listings,
    publications: publicationQuery.data || [],
    media: mediaQuery.data || [],
  }
}

export async function getPublicListingReadinessReport({ client, fetchImpl = globalThis.fetch, liveApiUrl = 'https://app.arch9.co.za/api/public/listings?limit=3', host = PUBLIC_LISTING_SITE_ORIGIN } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const rows = await fetchPublicListingReadinessRows(client)
  const report = summarizePublicListingReadiness({ ...rows, host })

  if (liveApiUrl && fetchImpl) {
    try {
      const response = await fetchImpl(liveApiUrl)
      const payload = await response.json().catch(() => null)
      report.liveApi = {
        url: liveApiUrl,
        ok: response.ok,
        status: response.status,
        count: typeof payload?.count === 'number' ? payload.count : null,
        itemCount: Array.isArray(payload?.items) ? payload.items.length : null,
        generatedAt: payload?.generatedAt || null,
      }
    } catch (error) {
      report.liveApi = {
        url: liveApiUrl,
        ok: false,
        status: null,
        error: error?.message || 'Live API check failed.',
      }
    }
  }

  return report
}
