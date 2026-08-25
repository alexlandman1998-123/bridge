import { createPrivatePropertyListingPlan } from './privatePropertyListingMapper.js'
import { normalizePrivatePropertyText } from './privatePropertyClient.js'
import {
  createPrivatePropertyRentalListingPlan,
  isPrivatePropertyRentalListing,
} from './privatePropertyRentalListingAdapter.js'

export function normalizePrivatePropertyPreviewText(value = '') {
  return normalizePrivatePropertyText(value)
}

function isMissingRelationError(error) {
  const message = normalizePrivatePropertyPreviewText(error?.message).toLowerCase()
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache')
}

async function fetchRequiredSingle(client, table, column, value) {
  const normalizedValue = normalizePrivatePropertyPreviewText(value)
  if (!normalizedValue) throw new Error(`${column} is required for ${table}.`)
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq(column, normalizedValue)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(`No ${table} row found for ${column}=${normalizedValue}.`)
  return data
}

async function fetchOptionalSingle(client, table, column, value, { orderBy = 'updated_at' } = {}) {
  const normalizedValue = normalizePrivatePropertyPreviewText(value)
  if (!normalizedValue) return null
  const query = client
    .from(table)
    .select('*')
    .eq(column, normalizedValue)
    .order(orderBy, { ascending: false })
    .limit(1)

  const { data, error } = await query.maybeSingle()
  if (error && isMissingRelationError(error)) return null
  if (error) throw error
  return data || null
}

async function fetchRows(client, table, column, value, { orderBy = 'sort_order', ascending = true } = {}) {
  const normalizedValue = normalizePrivatePropertyPreviewText(value)
  if (!normalizedValue) return []
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq(column, normalizedValue)
    .order(orderBy, { ascending })

  if (error && isMissingRelationError(error)) return []
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function fetchArch9ListingForPrivatePropertyPreview({ client, listingId } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizePrivatePropertyPreviewText(listingId)
  if (!normalizedListingId) throw new Error('--listing-id is required.')

  const listing = await fetchRequiredSingle(client, 'private_listings', 'id', normalizedListingId)
  const [publication, media, existingSync] = await Promise.all([
    fetchOptionalSingle(client, 'listing_publication_data', 'listing_id', normalizedListingId),
    fetchRows(client, 'listing_media', 'listing_id', normalizedListingId),
    fetchOptionalSingle(client, 'private_property_listing_syncs', 'private_listing_id', normalizedListingId),
  ])

  return {
    listing,
    publication: publication || {},
    media,
    existingSync: existingSync || {},
  }
}

export async function fetchRecentArch9ListingsForPrivatePropertyPreview({ client, limit = 10 } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 25))
  const { data, error } = await client
    .from('private_listings')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(safeLimit)

  if (error) throw error
  return (Array.isArray(data) ? data : []).map((listing) => ({
    id: normalizePrivatePropertyPreviewText(listing.id),
    listingReference: normalizePrivatePropertyPreviewText(listing.listing_reference || listing.listingReference),
    title: normalizePrivatePropertyPreviewText(listing.title),
    suburb: normalizePrivatePropertyPreviewText(listing.suburb),
    city: normalizePrivatePropertyPreviewText(listing.city),
    province: normalizePrivatePropertyPreviewText(listing.province),
    propertyType: normalizePrivatePropertyPreviewText(listing.property_type || listing.propertyType),
    askingPrice: listing.asking_price ?? listing.askingPrice ?? null,
    listingStatus: normalizePrivatePropertyPreviewText(listing.listing_status || listing.listingStatus),
    updatedAt: normalizePrivatePropertyPreviewText(listing.updated_at || listing.updatedAt),
  }))
}

export function createPrivatePropertyArch9ListingPreview({
  listing = {},
  publication = {},
  media = [],
  existingSync = {},
  agentMapping = {},
  options = {},
} = {}) {
  const plan = isPrivatePropertyRentalListing(listing, options)
    ? createPrivatePropertyRentalListingPlan({
      listing,
      publication,
      media,
      existingSync,
      agentMapping,
      options,
    })
    : createPrivatePropertyListingPlan({
      listing,
      publication,
      media,
      existingSync,
      agentMapping,
      options,
    })

  return {
    phase: 'private-property-listing-preview',
    generatedAt: new Date().toISOString(),
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
    },
    status: plan.canPreview ? 'PREVIEW_READY' : 'BLOCKED',
    canPreview: plan.canPreview,
    canSubmit: false,
    dataBlockers: plan.dataBlockers,
    technicalBlockers: plan.technicalBlockers,
    summary: plan.summary,
    payloadPreview: plan.payload,
    listingXml: plan.listingXml,
    nextStep: plan.canPreview
      ? 'Phase 4 can wrap this ListingImport XML in UpdateListing SOAP and submit it with --apply.'
      : 'Resolve the blockers, then run the Private Property preview again.',
  }
}

function images(count = 3, prefix = 'residential') {
  return Array.from({ length: count }, (_, index) => ({
    media_type: 'image',
    file_url: `https://cdn.arch9.co.za/private-property/${prefix}-${index + 1}.jpg`,
    caption: `Image ${index + 1}`,
    sort_order: index,
    is_cover: index === 0,
  }))
}

export function createPrivatePropertySandboxFixture(scenario = 'rental-residential') {
  const key = normalizePrivatePropertyPreviewText(scenario).toLowerCase()
  const baseListing = {
    id: `fixture-${key}`,
    listing_reference: `ARCH9-${key.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
    title: 'Arch9 Private Property Sandbox Listing',
    street_name: 'Sandbox Street',
    street_number: '10',
    suburb: 'Sandton',
    city: 'Sandton',
    province: 'Gauteng',
    asking_price: 2500000,
    listing_status: 'active',
    created_at: '2026-08-24T08:00:00.000Z',
  }
  const basePublication = {
    title: 'Arch9 Private Property Sandbox Listing',
    description: 'A controlled Arch9 sandbox listing for Private Property integration testing.',
    bedrooms: 3,
    bathrooms: 2,
    garages: 1,
    property_type: 'House',
    listing_type: 'Rental',
    asking_price: 18500,
    floor_size: 145,
    erf_size: 500,
    garden: true,
    pool: false,
    pets_allowed: true,
    furnished: false,
  }

  if (key === 'rental-commercial-m2') {
    return {
      listing: { ...baseListing, property_type: 'Commercial', asking_price: 220 },
      publication: { ...basePublication, listing_type: 'Rental', property_type: 'Commercial', asking_price: 220, floor_size: 320, bedrooms: null, bathrooms: null },
      media: images(3, key),
      options: { category: 'Commercial', mandateType: 'Rental' },
    }
  }

  if (key === 'sale-land') {
    return {
      listing: { ...baseListing, property_type: 'Land', asking_price: 1450000 },
      publication: { ...basePublication, listing_type: 'Sale', property_type: 'Residential Land', asking_price: 1450000, erf_size: 850, bedrooms: null, bathrooms: null },
      media: images(3, key),
      options: { category: 'Land', mandateType: 'OpenMandate' },
    }
  }

  if (key === 'sale-farm-auction') {
    return {
      listing: { ...baseListing, property_type: 'Farm', asking_price: 4500000, farm_name: 'Arch9 Test Farm' },
      publication: { ...basePublication, listing_type: 'Sale', property_type: 'Farm', asking_price: 4500000, farm_name: 'Arch9 Test Farm', erf_size: 120000, bedrooms: null, bathrooms: null },
      media: images(3, key),
      options: { category: 'Farms', mandateType: 'AuctionOnly', auction: true },
    }
  }

  if (key === 'sale-residential') {
    return {
      listing: { ...baseListing, property_type: 'House', asking_price: 2500000 },
      publication: { ...basePublication, listing_type: 'Sale', property_type: 'House', asking_price: 2500000 },
      media: images(3, key),
      options: { category: 'Residential', mandateType: 'OpenMandate' },
    }
  }

  return {
    listing: baseListing,
    publication: basePublication,
    media: images(3, key || 'rental-residential'),
    options: { category: 'Residential', mandateType: 'Rental' },
  }
}
