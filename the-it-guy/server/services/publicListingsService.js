import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

let cachedRuntimeEnv = null

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 60
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

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
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
    agencyName: '',
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

  const minPrice = toNumber(filters.minPrice)
  const maxPrice = toNumber(filters.maxPrice)
  const bedrooms = toNumber(filters.bedrooms)
  const bathrooms = toNumber(filters.bathrooms)
  if (minPrice !== null && Number(item.askingPrice || 0) < minPrice) return false
  if (maxPrice !== null && Number(item.askingPrice || 0) > maxPrice) return false
  if (bedrooms !== null && Number(item.bedrooms || 0) < bedrooms) return false
  if (bathrooms !== null && Number(item.bathrooms || 0) < bathrooms) return false

  return true
}

export async function getPublicListings(options = {}) {
  const client = options.client || createPublicListingClient()
  const host = normalizeText(options.host) || 'https://www.arch9.co.za'
  const limit = normalizeLimit(options.limit)
  const offset = normalizeOffset(options.offset)

  const publicationResult = await client
    .from('listing_publication_data')
    .select(PUBLICATION_FIELDS)
    .eq('status', 'Published')
    .order('updated_at', { ascending: false })
    .limit(500)

  if (publicationResult.error) throw publicationResult.error

  const publications = Array.isArray(publicationResult.data) ? publicationResult.data : []
  const listingIds = publications.map((row) => normalizeText(row.listing_id)).filter(Boolean)
  if (!listingIds.length) {
    return { items: [], count: 0, limit, offset, generatedAt: new Date().toISOString() }
  }

  const listingsResult = await client
    .from('private_listings')
    .select(PUBLIC_LISTING_FIELDS)
    .in('id', listingIds)
    .eq('bridge_listing_status', 'published')
    .eq('listing_visibility', 'active_market')

  if (listingsResult.error) throw listingsResult.error

  const listingsById = new Map((listingsResult.data || []).map((row) => [normalizeText(row.id), row]))
  const mediaResult = await client
    .from('listing_media')
    .select(MEDIA_FIELDS)
    .in('listing_id', listingIds)
    .order('sort_order', { ascending: true })

  if (mediaResult.error) throw mediaResult.error

  const mediaByListingId = groupByListingId(mediaResult.data || [])
  const items = publications
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
    const listing = items.find((item) => item.slug === slug || item.id === slug)
    return { listing: listing || null, generatedAt: new Date().toISOString() }
  }

  return {
    items: items.slice(offset, offset + limit),
    count: items.length,
    limit,
    offset,
    generatedAt: new Date().toISOString(),
  }
}
