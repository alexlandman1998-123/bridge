import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

let cachedRuntimeEnv = null

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 60
const SOURCE_PAGE_SIZE = 120
const AGENCY_INTAKE_PRICE_TOLERANCE = 300000
const PUBLIC_LISTING_FIELDS = [
  'id',
  'organisation_id',
  'assigned_agent_id',
  'listing_reference',
  'listing_status',
  'listing_visibility',
  'bridge_listing_status',
  'bridge_listing_public_url',
  'title',
  'address_line_1',
  'suburb',
  'city',
  'province',
  'property_type',
  'asking_price',
  'created_at',
  'updated_at',
].join(', ')

const PUBLICATION_FIELDS = [
  'listing_id',
  'title',
  'address',
  'suburb',
  'province',
  'property_type',
  'listing_type',
  'asking_price',
  'bedrooms',
  'bathrooms',
  'garages',
  'parking_bays',
  'floor_size',
  'erf_size',
  'rates_taxes',
  'levies',
  'description',
  'features',
  'amenities',
  'status',
  'created_at',
  'updated_at',
].join(', ')

const MEDIA_FIELDS = [
  'listing_id',
  'media_type',
  'file_url',
  'caption',
  'sort_order',
  'is_cover',
].join(', ')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeToken(value = '') {
  return normalizeLower(value).replace(/[\s-]+/g, '_')
}

function isMissingRelationError(error) {
  const message = normalizeLower(error?.message)
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache')
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || normalizeText(value) === '') return null
  return toNumber(value)
}

function toInteger(value) {
  const numeric = toNumber(value)
  return numeric === null ? null : Math.max(0, Math.round(numeric))
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return normalizeArray(parsed)
    } catch {
      return value.split(',').map(normalizeText).filter(Boolean)
    }
  }
  return []
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function normalizeMediaUrl(item = {}) {
  return pickFirstText(item.url, item.fileUrl, item.file_url, item.publicUrl, item.public_url, item.signedUrl, item.signed_url)
}

function normalizeMediaCandidates(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const url = normalizeMediaUrl(item)
      if (!url) return null
      return {
        id: normalizeText(item.id || item.path || item.filePath || item.file_path || `media-${index + 1}`),
        listing_id: normalizeText(item.listing_id || item.listingId),
        media_type: normalizeText(item.media_type || item.mediaType || 'image') || 'image',
        file_url: url,
        caption: normalizeText(item.caption || item.label || item.name),
        sort_order: Number(item.sort_order ?? item.sortOrder ?? index) || 0,
        is_cover: Boolean(item.is_cover ?? item.isCover),
      }
    })
    .filter(Boolean)
}

function extractFormDataMediaRows(formData = {}, listing = {}) {
  const source = formData && typeof formData === 'object' ? formData : {}
  const gallery = normalizeMediaCandidates(
    source.imageGallery ||
      source.image_gallery ||
      source.galleryImages ||
      source.gallery_images ||
      source.images ||
      source.photos ||
      source.marketing?.imageGallery ||
      source.marketing?.image_gallery ||
      source.marketing?.galleryImages ||
      source.marketing?.gallery_images ||
      [],
  )
  const coverImageId = normalizeText(source.coverImageId || source.cover_image_id)
  const listingId = normalizeText(listing.id || listing.listing_id)
  const directCoverUrl = pickFirstText(
    source.heroImageUrl,
    source.hero_image_url,
    source.coverImageUrl,
    source.cover_image_url,
    source.primaryImageUrl,
    source.primary_image_url,
    source.mainImageUrl,
    source.main_image_url,
    source.imageUrl,
    source.image_url,
    source.marketing?.mediaUrl,
    source.marketing?.media_url,
  )
  const rows = gallery.map((item, index) => ({
    ...item,
    listing_id: item.listing_id || listingId,
    is_cover: item.is_cover || (coverImageId ? normalizeText(item.id) === coverImageId : index === 0),
  }))
  if (directCoverUrl && !rows.some((item) => item.file_url === directCoverUrl)) {
    rows.unshift({
      listing_id: listingId,
      media_type: 'image',
      file_url: directCoverUrl,
      caption: 'Property image',
      sort_order: -1,
      is_cover: true,
    })
  }
  return rows
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=')
        if (separatorIndex === -1) return [line, '']
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

function getRuntimeEnv() {
  if (cachedRuntimeEnv) return cachedRuntimeEnv
  const rootEnvPath = new URL('../../.env', import.meta.url)
  const stagingEnvPath = new URL('../../.env.staging.local', import.meta.url)
  const processEnvSource = globalThis?.process?.env || {}
  const processEnv = Object.fromEntries(Object.entries(processEnvSource).map(([key, value]) => [key, normalizeText(value)]))
  const merged = {
    ...parseEnvFile(rootEnvPath),
    ...parseEnvFile(stagingEnvPath),
    ...processEnv,
  }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  cachedRuntimeEnv = merged
  return cachedRuntimeEnv
}

function createPublicListingClient() {
  const env = getRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('Public listing backend is not configured.')
    error.code = 'public_listing_backend_unconfigured'
    error.status = 503
    throw error
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

export function createListingSlug({ publication = {}, listing = {} } = {}) {
  const base = [
    publication.title,
    publication.suburb || listing.suburb,
    publication.province || listing.province,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')

  const id = normalizeText(listing.id || publication.listing_id)
  const suffix = id ? id.replace(/-/g, '').slice(0, 8).toLowerCase() : ''
  return [base || 'listing', suffix].filter(Boolean).join('-')
}

function getCoverImage(media = []) {
  const images = media
    .filter((item) => normalizeLower(item.media_type) === 'image' && normalizeText(item.file_url))
    .sort((a, b) => {
      if (Boolean(a.is_cover) !== Boolean(b.is_cover)) return a.is_cover ? -1 : 1
      return Number(a.sort_order || 0) - Number(b.sort_order || 0)
    })
  return images[0] || null
}

export function isPublicListingEligible({ listing = {}, publication = {}, media = [] } = {}) {
  const publicationStatus = normalizeLower(publication.status)
  const bridgeStatus = normalizeLower(listing.bridge_listing_status)
  const visibility = normalizeLower(listing.listing_visibility)
  const listingStatus = normalizeToken(listing.listing_status)
  const title = normalizeText(publication.title || listing.title)
  const price = toNumber(publication.asking_price ?? listing.asking_price)
  const coverImage = getCoverImage(media)

  return Boolean(
    publicationStatus === 'published' &&
      bridgeStatus === 'published' &&
      visibility === 'active_market' &&
      listingStatus !== 'withdrawn' &&
      listingStatus !== 'sold' &&
      listingStatus !== 'transaction_created' &&
      title &&
      price !== null &&
      price > 0 &&
      coverImage,
  )
}

function isAgencyIntakeListingEligible({ listing = {} } = {}) {
  const visibility = normalizeLower(listing.listing_visibility)
  const listingStatus = normalizeToken(listing.listing_status)
  const title = normalizeText(listing.title || listing.listing_reference || listing.address_line_1)
  const price = toNumber(listing.asking_price)

  return Boolean(
    visibility === 'active_market' &&
      !['archived', 'withdrawn', 'sold', 'transaction_created'].includes(listingStatus) &&
      title &&
      price !== null &&
      price > 0,
  )
}

function createAgencyIntakePublication(listing = {}, publication = {}) {
  return {
    listing_id: listing.id,
    title: normalizeText(listing.title || listing.listing_reference || publication.title || listing.address_line_1),
    address: normalizeText(listing.address_line_1 || publication.address),
    suburb: normalizeText(listing.suburb || publication.suburb),
    province: normalizeText(listing.province || publication.province),
    property_type: normalizeText(listing.property_type || publication.property_type),
    listing_type: normalizeText(publication.listing_type || 'Sale'),
    asking_price: listing.asking_price ?? publication.asking_price,
    bedrooms: publication.bedrooms ?? listing.bedrooms,
    bathrooms: publication.bathrooms ?? listing.bathrooms,
    garages: publication.garages ?? listing.garages,
    parking_bays: publication.parking_bays ?? listing.parking_bays,
    floor_size: publication.floor_size ?? listing.floor_size,
    erf_size: publication.erf_size ?? listing.erf_size,
    rates_taxes: publication.rates_taxes ?? listing.rates_taxes,
    levies: publication.levies ?? listing.levies,
    description: normalizeText(publication.description || listing.description),
    features: publication.features ?? listing.features,
    amenities: publication.amenities ?? listing.amenities,
    status: normalizeText(publication.status || listing.bridge_listing_status || listing.listing_status),
    created_at: publication.created_at || listing.created_at,
    updated_at: publication.updated_at || listing.updated_at,
  }
}

export function mapPublicListingContract({ listing = {}, publication = {}, media = [], host = 'https://www.arch9.co.za' } = {}) {
  const coverImage = getCoverImage(media)
  const imageRows = media
    .filter((item) => normalizeLower(item.media_type) === 'image' && normalizeText(item.file_url))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
  const floorPlans = media
    .filter((item) => normalizeLower(item.media_type) === 'floor_plan' && normalizeText(item.file_url))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
  const videos = media.filter((item) => ['video', 'virtual_tour'].includes(normalizeLower(item.media_type)) && normalizeText(item.file_url))
  const slug = createListingSlug({ listing, publication })
  const publicUrl = `${host.replace(/\/+$/g, '')}/buy/${slug}`
  const agencySlug = normalizeText(listing.agency_public_intake_slug)
  const enquiryUrl = agencySlug
    ? `${host.replace(/\/+$/g, '')}/intake/${encodeURIComponent(agencySlug)}?intent=buy&listing=${encodeURIComponent(slug)}&listingId=${encodeURIComponent(listing.id)}`
    : ''

  return {
    id: listing.id,
    slug,
    title: normalizeText(publication.title || listing.title),
    listingType: normalizeText(publication.listing_type || 'Sale'),
    propertyType: normalizeText(publication.property_type || listing.property_type),
    suburb: normalizeText(publication.suburb || listing.suburb),
    city: normalizeText(listing.city),
    province: normalizeText(publication.province || listing.province),
    askingPrice: toNumber(publication.asking_price ?? listing.asking_price),
    bedrooms: toInteger(publication.bedrooms),
    bathrooms: toNumber(publication.bathrooms),
    garages: toInteger(publication.garages),
    parkingBays: toInteger(publication.parking_bays),
    floorSize: toNumber(publication.floor_size),
    erfSize: toNumber(publication.erf_size),
    ratesTaxes: toNumber(publication.rates_taxes),
    levies: toNumber(publication.levies),
    description: normalizeText(publication.description),
    features: normalizeArray(publication.features),
    amenities: normalizeArray(publication.amenities),
    coverImageUrl: normalizeText(coverImage?.file_url),
    galleryImages: imageRows.map((item) => ({
      url: normalizeText(item.file_url),
      caption: normalizeText(item.caption),
      isCover: Boolean(item.is_cover),
      sortOrder: Number(item.sort_order || 0),
    })),
    floorPlans: floorPlans.map((item) => ({
      url: normalizeText(item.file_url),
      caption: normalizeText(item.caption),
      sortOrder: Number(item.sort_order || 0),
    })),
    videos: videos.map((item) => ({
      type: normalizeLower(item.media_type),
      url: normalizeText(item.file_url),
      caption: normalizeText(item.caption),
    })),
    agencyName: normalizeText(listing.agency_public_name),
    agencySlug,
    enquiryUrl,
    agentName: '',
    publishedAt: publication.updated_at || publication.created_at || listing.updated_at || listing.created_at || null,
    publicUrl,
  }
}

function groupByListingId(rows = []) {
  return rows.reduce((map, row) => {
    const listingId = normalizeText(row.listing_id)
    if (!listingId) return map
    if (!map.has(listingId)) map.set(listingId, [])
    map.get(listingId).push(row)
    return map
  }, new Map())
}

function groupOnboardingByListingId(rows = []) {
  return rows.reduce((map, row) => {
    const listingId = normalizeText(row.private_listing_id || row.privateListingId)
    if (!listingId || map.has(listingId)) return map
    map.set(listingId, row)
    return map
  }, new Map())
}

function normalizeLimit(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.round(numeric)))
}

function normalizeOffset(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.round(numeric))
}

function hasFilterValue(value) {
  return value !== null && value !== undefined && normalizeText(value) !== ''
}

function applyCaseInsensitiveExactFilter(query, field, value) {
  if (!hasFilterValue(value)) return query
  return query.ilike(field, normalizeText(value))
}

function applyPublicationFilters(query, filters = {}) {
  let nextQuery = query
  nextQuery = applyCaseInsensitiveExactFilter(nextQuery, 'listing_type', filters.listingType)
  nextQuery = applyCaseInsensitiveExactFilter(nextQuery, 'property_type', filters.propertyType)
  nextQuery = applyCaseInsensitiveExactFilter(nextQuery, 'suburb', filters.suburb)
  nextQuery = applyCaseInsensitiveExactFilter(nextQuery, 'province', filters.province)

  const minPrice = toOptionalNumber(filters.minPrice)
  const maxPrice = toOptionalNumber(filters.maxPrice)
  const bedrooms = toOptionalNumber(filters.bedrooms)
  const bathrooms = toOptionalNumber(filters.bathrooms)
  if (minPrice !== null) nextQuery = nextQuery.gte('asking_price', minPrice)
  if (maxPrice !== null) nextQuery = nextQuery.lte('asking_price', maxPrice)
  if (bedrooms !== null) nextQuery = nextQuery.gte('bedrooms', bedrooms)
  if (bathrooms !== null) nextQuery = nextQuery.gte('bathrooms', bathrooms)
  return nextQuery
}

function applyAgencyListingFilters(query, filters = {}) {
  let nextQuery = query
  nextQuery = applyCaseInsensitiveExactFilter(nextQuery, 'property_type', filters.propertyType)
  nextQuery = applyCaseInsensitiveExactFilter(nextQuery, 'suburb', filters.suburb)
  nextQuery = applyCaseInsensitiveExactFilter(nextQuery, 'city', filters.city)
  nextQuery = applyCaseInsensitiveExactFilter(nextQuery, 'province', filters.province)

  const minPrice = toOptionalNumber(filters.minPrice)
  const maxPrice = toOptionalNumber(filters.maxPrice)
  if (minPrice !== null) nextQuery = nextQuery.gte('asking_price', minPrice)
  if (maxPrice !== null) nextQuery = nextQuery.lte('asking_price', maxPrice)
  return nextQuery
}

function requiresFullPublicScan(options = {}) {
  return Boolean(options.slug || hasFilterValue(options.q) || hasFilterValue(options.city))
}

function requiresFullAgencyScan(options = {}) {
  return Boolean(
    options.slug ||
      hasFilterValue(options.q) ||
      hasFilterValue(options.listingType) ||
      hasFilterValue(options.bedrooms) ||
      hasFilterValue(options.bathrooms)
  )
}

async function resolveAgencyScope(client, agencySlug = '') {
  const normalizedSlug = normalizeText(agencySlug).toLowerCase()
  if (!normalizedSlug) return null
  const result = await client
    .from('agency_public_intake_links')
    .select('organisation_id, slug')
    .eq('slug', normalizedSlug)
    .eq('status', 'active')
    .is('disabled_at', null)
    .maybeSingle()
  if (result.error) {
    if (isMissingRelationError(result.error)) return null
    throw result.error
  }
  return result.data || null
}

async function loadAgencyPublicMetadata(client, organisationIds = []) {
  const ids = [...new Set(organisationIds.map(normalizeText).filter(Boolean))]
  if (!ids.length) return new Map()
  const [linksResult, organisationsResult] = await Promise.all([
    client
      .from('agency_public_intake_links')
      .select('organisation_id, slug')
      .in('organisation_id', ids)
      .eq('status', 'active')
      .is('disabled_at', null)
      .order('is_primary', { ascending: false })
      .order('updated_at', { ascending: false }),
    client
      .from('organisations')
      .select('id, name, display_name')
      .in('id', ids),
  ])
  if (linksResult.error && !isMissingRelationError(linksResult.error)) throw linksResult.error
  if (organisationsResult.error) throw organisationsResult.error

  const metadata = new Map()
  for (const org of organisationsResult.data || []) {
    const organisationId = normalizeText(org.id)
    metadata.set(organisationId, {
      organisationId,
      agencyName: normalizeText(org.display_name || org.name),
      agencySlug: '',
    })
  }
  for (const link of linksResult.error ? [] : linksResult.data || []) {
    const organisationId = normalizeText(link.organisation_id)
    if (!organisationId || metadata.get(organisationId)?.agencySlug) continue
    metadata.set(organisationId, {
      ...(metadata.get(organisationId) || { organisationId }),
      agencySlug: normalizeText(link.slug),
    })
  }
  return metadata
}

function matchesFilters(item = {}, filters = {}) {
  const q = normalizeLower(filters.q)
  if (q) {
    const haystack = [
      item.title,
      item.suburb,
      item.city,
      item.province,
      item.propertyType,
      item.description,
      ...(item.features || []),
      ...(item.amenities || []),
    ].join(' ').toLowerCase()
    if (!haystack.includes(q)) return false
  }

  for (const [key, field] of [
    ['listingType', 'listingType'],
    ['propertyType', 'propertyType'],
    ['suburb', 'suburb'],
    ['city', 'city'],
    ['province', 'province'],
  ]) {
    if (filters[key] && normalizeLower(item[field]) !== normalizeLower(filters[key])) return false
  }

  const minPrice = toOptionalNumber(filters.minPrice)
  const maxPrice = toOptionalNumber(filters.maxPrice)
  const bedrooms = toOptionalNumber(filters.bedrooms)
  const bathrooms = toOptionalNumber(filters.bathrooms)
  const askingPrice = toOptionalNumber(item.askingPrice)
  if (minPrice !== null && (askingPrice === null || askingPrice < minPrice)) return false
  if (maxPrice !== null && (askingPrice === null || askingPrice > maxPrice)) return false
  if (bedrooms !== null && Number(item.bedrooms || 0) < bedrooms) return false
  if (bathrooms !== null && Number(item.bathrooms || 0) < bathrooms) return false

  return true
}

function createAgencyIntakeFilterOptions(filters = {}) {
  const minPrice = toOptionalNumber(filters.minPrice)
  const maxPrice = toOptionalNumber(filters.maxPrice)

  return {
    ...filters,
    minPrice: minPrice === null ? filters.minPrice : Math.max(0, minPrice - AGENCY_INTAKE_PRICE_TOLERANCE),
    maxPrice: maxPrice === null ? filters.maxPrice : maxPrice + AGENCY_INTAKE_PRICE_TOLERANCE,
  }
}

export async function getPublicListings(options = {}) {
  const client = options.client || createPublicListingClient()
  const host = normalizeText(options.host) || 'https://www.arch9.co.za'
  const limit = normalizeLimit(options.limit)
  const offset = normalizeOffset(options.offset)
  const agencySlug = normalizeText(options.agencySlug)
  const audience = normalizeToken(options.audience || options.surface)
  const agencyScope = await resolveAgencyScope(client, agencySlug)
  if (agencySlug && !agencyScope) {
    return options.slug
      ? { listing: null, generatedAt: new Date().toISOString() }
      : { items: [], count: 0, limit, offset, generatedAt: new Date().toISOString() }
  }
  const isAgencyIntakeAudience = Boolean(agencyScope?.organisation_id && ['agency_intake', 'buyer_intake', 'intake'].includes(audience))

  if (isAgencyIntakeAudience) {
    const filterOptions = createAgencyIntakeFilterOptions(options)
    const shouldScanAll = requiresFullAgencyScan(filterOptions)
    const requiredItems = offset + limit
    const agencyMetadata = await loadAgencyPublicMetadata(client, [agencyScope.organisation_id])
    const metadata = agencyMetadata.get(normalizeText(agencyScope.organisation_id)) || {}
    const items = []
    let totalCount = null
    let sourceOffset = 0
    let scannedAllSources = false

    while (true) {
      let listingsQuery = client
        .from('private_listings')
        .select(PUBLIC_LISTING_FIELDS, { count: 'exact' })
        .eq('organisation_id', agencyScope.organisation_id)
        .eq('listing_visibility', 'active_market')
        .not('listing_status', 'in', '(archived,withdrawn,sold,transaction_created)')

      listingsQuery = applyAgencyListingFilters(listingsQuery, filterOptions)

      const listingsResult = await listingsQuery
        .order('updated_at', { ascending: false })
        .range(sourceOffset, sourceOffset + SOURCE_PAGE_SIZE - 1)

      if (listingsResult.error) throw listingsResult.error
      if (totalCount === null && Number.isFinite(Number(listingsResult.count))) totalCount = Number(listingsResult.count)

      const listingRows = listingsResult.data || []
      const listingIds = listingRows.map((row) => normalizeText(row.id)).filter(Boolean)
      if (!listingRows.length) {
        scannedAllSources = true
        break
      }
      if (!listingIds.length) {
        if (listingRows.length < SOURCE_PAGE_SIZE) {
          scannedAllSources = true
          break
        }
        sourceOffset += SOURCE_PAGE_SIZE
        continue
      }

      const [publicationResult, mediaResult, onboardingResult] = await Promise.all([
        client
          .from('listing_publication_data')
          .select(PUBLICATION_FIELDS)
          .in('listing_id', listingIds)
          .order('updated_at', { ascending: false }),
        client
          .from('listing_media')
          .select(MEDIA_FIELDS)
          .in('listing_id', listingIds)
          .order('sort_order', { ascending: true }),
        client
          .from('private_listing_seller_onboarding')
          .select('private_listing_id, form_data, updated_at')
          .in('private_listing_id', listingIds)
          .order('updated_at', { ascending: false }),
      ])

      if (publicationResult.error) throw publicationResult.error
      if (mediaResult.error) throw mediaResult.error
      if (onboardingResult.error && !isMissingRelationError(onboardingResult.error)) throw onboardingResult.error

      const publicationsByListingId = new Map()
      for (const publication of publicationResult.data || []) {
        const listingId = normalizeText(publication.listing_id)
        if (listingId && !publicationsByListingId.has(listingId)) publicationsByListingId.set(listingId, publication)
      }
      const mediaByListingId = groupByListingId(mediaResult.data || [])
      const onboardingByListingId = groupOnboardingByListingId(onboardingResult.error ? [] : onboardingResult.data || [])
      const pageItems = listingRows
        .map((row) => {
          const listing = {
            ...row,
            agency_public_intake_slug: metadata.agencySlug || agencyScope.slug || agencySlug,
            agency_public_name: metadata.agencyName || '',
          }
          if (!isAgencyIntakeListingEligible({ listing })) return null
          const publication = createAgencyIntakePublication(listing, publicationsByListingId.get(normalizeText(listing.id)) || {})
          const onboarding = onboardingByListingId.get(normalizeText(listing.id)) || {}
          const onboardingMedia = extractFormDataMediaRows(onboarding.form_data, listing)
          const media = onboardingMedia.length ? onboardingMedia : mediaByListingId.get(normalizeText(listing.id)) || []
          return mapPublicListingContract({ listing, publication, media, host })
        })
        .filter(Boolean)
        .filter((item) => matchesFilters(item, filterOptions))

      const slug = normalizeText(options.slug)
      if (slug) {
        const listing = pageItems.find((item) => item.slug === slug || item.id === slug)
        if (listing) return { listing, generatedAt: new Date().toISOString() }
      } else {
        items.push(...pageItems)
        if (!shouldScanAll && items.length >= requiredItems) break
      }

      if (listingRows.length < SOURCE_PAGE_SIZE) {
        scannedAllSources = true
        break
      }
      sourceOffset += SOURCE_PAGE_SIZE
    }

    if (options.slug) return { listing: null, generatedAt: new Date().toISOString() }

    return {
      items: items.slice(offset, offset + limit),
      count: shouldScanAll || scannedAllSources || totalCount === null ? items.length : Math.max(totalCount, items.length),
      limit,
      offset,
      generatedAt: new Date().toISOString(),
    }
  }

  const shouldScanAll = requiresFullPublicScan(options) || Boolean(agencyScope?.organisation_id)
  const requiredItems = offset + limit
  const items = []
  let totalCount = null
  let sourceOffset = 0
  let scannedAllSources = false

  while (true) {
    let publicationQuery = client
      .from('listing_publication_data')
      .select(PUBLICATION_FIELDS, { count: 'exact' })
      .eq('status', 'Published')

    publicationQuery = applyPublicationFilters(publicationQuery, options)

    const publicationResult = await publicationQuery
      .order('updated_at', { ascending: false })
      .range(sourceOffset, sourceOffset + SOURCE_PAGE_SIZE - 1)

    if (publicationResult.error) throw publicationResult.error
    if (totalCount === null && Number.isFinite(Number(publicationResult.count))) totalCount = Number(publicationResult.count)

    const publications = Array.isArray(publicationResult.data) ? publicationResult.data : []
    const listingIds = publications.map((row) => normalizeText(row.listing_id)).filter(Boolean)
    if (!publications.length) {
      scannedAllSources = true
      break
    }
    if (!listingIds.length) {
      if (publications.length < SOURCE_PAGE_SIZE) {
        scannedAllSources = true
        break
      }
      sourceOffset += SOURCE_PAGE_SIZE
      continue
    }

    let listingsQuery = client
      .from('private_listings')
      .select(PUBLIC_LISTING_FIELDS)
      .in('id', listingIds)
      .eq('bridge_listing_status', 'published')
      .eq('listing_visibility', 'active_market')
      .not('listing_status', 'in', '(withdrawn,sold,transaction_created)')

    if (agencyScope?.organisation_id) {
      listingsQuery = listingsQuery.eq('organisation_id', agencyScope.organisation_id)
    }

    if (hasFilterValue(options.city)) {
      listingsQuery = applyCaseInsensitiveExactFilter(listingsQuery, 'city', options.city)
    }

    const listingsResult = await listingsQuery

    if (listingsResult.error) throw listingsResult.error

    const listingRows = listingsResult.data || []
    const agencyMetadata = await loadAgencyPublicMetadata(client, listingRows.map((row) => row.organisation_id))
    const listingsById = new Map(listingRows.map((row) => {
      const metadata = agencyMetadata.get(normalizeText(row.organisation_id)) || {}
      return [normalizeText(row.id), {
        ...row,
        agency_public_intake_slug: metadata.agencySlug || '',
        agency_public_name: metadata.agencyName || '',
      }]
    }))
    const mediaResult = await client
      .from('listing_media')
      .select(MEDIA_FIELDS)
      .in('listing_id', listingIds)
      .order('sort_order', { ascending: true })

    if (mediaResult.error) throw mediaResult.error

    const mediaByListingId = groupByListingId(mediaResult.data || [])
    const pageItems = publications
      .map((publication) => {
        const listing = listingsById.get(normalizeText(publication.listing_id))
        const media = mediaByListingId.get(normalizeText(publication.listing_id)) || []
        if (!listing || !isPublicListingEligible({ listing, publication, media })) return null
        return mapPublicListingContract({ listing, publication, media, host })
      })
      .filter(Boolean)
      .filter((item) => matchesFilters(item, options))

    const slug = normalizeText(options.slug)
    if (slug) {
      const listing = pageItems.find((item) => item.slug === slug || item.id === slug)
      if (listing) return { listing, generatedAt: new Date().toISOString() }
    } else {
      items.push(...pageItems)
      if (!shouldScanAll && items.length >= requiredItems) break
    }

    if (publications.length < SOURCE_PAGE_SIZE) {
      scannedAllSources = true
      break
    }
    sourceOffset += SOURCE_PAGE_SIZE
  }

  if (options.slug) return { listing: null, generatedAt: new Date().toISOString() }

  return {
    items: items.slice(offset, offset + limit),
    count: shouldScanAll || scannedAllSources || totalCount === null ? items.length : Math.max(totalCount, items.length),
    limit,
    offset,
    generatedAt: new Date().toISOString(),
  }
}
