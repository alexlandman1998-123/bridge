export const DEFAULT_PROPERTY24_AGENCY_ID = 31382
export const DEFAULT_PROPERTY24_COUNTRY_ID = 1

export const DEFAULT_PROPERTY24_PROPERTY_TYPE_MAPPINGS = [
  { id: 4, description: 'House', aliases: ['house', 'home', 'freehold', 'freehold_house'] },
  { id: 5, description: 'Apartment / Flat', aliases: ['apartment', 'flat', 'unit', 'sectional_title', 'sectional_title_apartment'] },
  { id: 6, description: 'Townhouse', aliases: ['townhouse', 'town_house', 'duplex', 'cluster'] },
  { id: 8, description: 'Vacant Land / Plot', aliases: ['vacant_land', 'plot', 'land', 'stand'] },
  { id: 10, description: 'Farm', aliases: ['farm', 'smallholding', 'agricultural_holding'] },
  { id: 11, description: 'Commercial Property', aliases: ['commercial', 'commercial_property', 'office', 'retail', 'shop'] },
  { id: 12, description: 'Industrial Property', aliases: ['industrial', 'industrial_property', 'warehouse', 'factory'] },
]

export function normalizeProperty24ListingText(value = '') {
  return String(value || '').trim()
}

export function normalizeProperty24ListingKey(value = '') {
  return normalizeProperty24ListingText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function toProperty24Number(value) {
  if (value === null || value === undefined || normalizeProperty24ListingText(value) === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function toProperty24Integer(value) {
  const numeric = toProperty24Number(value)
  return numeric === null ? null : Math.max(0, Math.round(numeric))
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeProperty24ListingText(value)
    if (text) return text
  }
  return ''
}

function firstNumber(...values) {
  for (const value of values) {
    const numeric = toProperty24Number(value)
    if (numeric !== null) return numeric
  }
  return null
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === false) return value
  const key = normalizeProperty24ListingKey(value)
  if (['yes', 'true', '1'].includes(key)) return true
  if (['no', 'false', '0'].includes(key)) return false
  return fallback
}

function normalizeMediaRows(media = []) {
  return (Array.isArray(media) ? media : [])
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const mediaType = normalizeProperty24ListingKey(item.media_type || item.mediaType || 'image')
      const sourceUrl = firstText(item.file_url, item.fileUrl, item.url, item.publicUrl, item.public_url, item.signedUrl, item.signed_url)
      const bytes = firstText(item.bytes, item.base64Bytes, item.base64, item.base64_bytes)
      if (!sourceUrl && !bytes) return null
      return {
        mediaType,
        sourceUrl,
        bytes,
        mimeContentType: firstText(item.mimeContentType, item.mime_content_type, item.contentType, item.content_type) || guessMimeContentType(sourceUrl),
        caption: firstText(item.caption, item.label, item.name),
        isCover: Boolean(item.is_cover ?? item.isCover),
        sortOrder: Number(item.sort_order ?? item.sortOrder ?? index) || 0,
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.isCover !== right.isCover) return left.isCover ? -1 : 1
      return left.sortOrder - right.sortOrder
    })
}

function guessMimeContentType(url = '') {
  const lower = normalizeProperty24ListingText(url).toLowerCase()
  if (lower.includes('.png')) return 'image/png'
  if (lower.includes('.webp')) return 'image/webp'
  if (lower.includes('.gif')) return 'image/gif'
  return 'image/jpeg'
}

export function resolveProperty24ListingType(value = '') {
  const key = normalizeProperty24ListingKey(value)
  if (['rental', 'rent', 'to_rent', 'lease', 'letting'].includes(key)) return 'Rental'
  return 'Sale'
}

export function resolveProperty24Status(value = '', { isNew = true } = {}) {
  const key = normalizeProperty24ListingKey(value)
  if (['sold', 'registered', 'completed'].includes(key)) return 'Sold'
  if (['pending', 'under_offer', 'offer_accepted', 'transaction_created'].includes(key)) return 'Pending'
  if (['withdrawn', 'paused', 'removed'].includes(key)) return 'Withdrawn'
  if (['expired'].includes(key)) return 'Expired'
  if (['cancelled', 'canceled'].includes(key)) return 'Cancelled'
  if (['back_on_market'].includes(key)) return 'BackOnMarket'
  return isNew ? 'NewListing' : 'Active'
}

export function resolveProperty24PropertyTypeId(value, mappings = DEFAULT_PROPERTY24_PROPERTY_TYPE_MAPPINGS) {
  const explicit = toProperty24Integer(value)
  if (explicit) return explicit
  const key = normalizeProperty24ListingKey(value)
  if (!key) return null
  for (const mapping of mappings || []) {
    const descriptionKey = normalizeProperty24ListingKey(mapping.description)
    const aliases = Array.isArray(mapping.aliases) ? mapping.aliases : []
    const aliasKeys = aliases.map(normalizeProperty24ListingKey)
    if (descriptionKey === key || aliasKeys.includes(key)) return toProperty24Integer(mapping.id)
  }
  return null
}

function resolveAgentMapping(agentMapping = {}, listing = {}, options = {}) {
  const property24AgentId = toProperty24Integer(
    agentMapping.property24AgentId ||
      agentMapping.property24_agent_id ||
      agentMapping.agentId ||
      agentMapping.id ||
      options.property24AgentId,
  )
  const sourceReference = firstText(
    agentMapping.sourceReference,
    agentMapping.source_reference,
    options.agentSourceReference,
    listing.assigned_agent_source_reference,
    listing.assignedAgentSourceReference,
  )
  return { property24AgentId, sourceReference }
}

function resolveSuburbId(catalogMapping = {}, listing = {}, publication = {}, options = {}) {
  return toProperty24Integer(
    catalogMapping.suburbId ||
      catalogMapping.suburb_id ||
      catalogMapping.property24SuburbId ||
      catalogMapping.property24_suburb_id ||
      options.suburbId ||
      listing.property24_suburb_id ||
      listing.property24SuburbId ||
      publication.property24_suburb_id ||
      publication.property24SuburbId,
  )
}

function resolveExpiryDate(listing = {}, publication = {}, options = {}) {
  const raw = firstText(
    options.expiryDate,
    publication.expiryDate,
    publication.expiry_date,
    listing.expiryDate,
    listing.expiry_date,
    listing.mandateEndDate,
    listing.mandate_end_date,
    listing.propertyDetails?.expiryDate,
    listing.propertyDetails?.mandateEndDate,
  )
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function resolvePrice(listing = {}, publication = {}, options = {}) {
  return firstNumber(publication.asking_price, publication.askingPrice, listing.asking_price, listing.askingPrice, options.price)
}

function resolvePoa(listing = {}, publication = {}, options = {}) {
  return normalizeBoolean(options.isPOA ?? options.isPoa ?? publication.isPOA ?? publication.is_poa ?? listing.isPOA ?? listing.is_poa, false)
}

function resolveDescription(listing = {}, publication = {}) {
  return firstText(
    publication.description,
    publication.public_description,
    listing.listing_preview_description,
    listing.listingPreviewDescription,
    listing.description,
  )
}

function resolveDescriptionHeader(listing = {}, publication = {}) {
  return firstText(publication.title, publication.headline, listing.title, listing.listingTitle)
}

function buildArea(size) {
  const numeric = toProperty24Number(size)
  return numeric === null ? undefined : { size: numeric, areaUnit: 'SquareMetres' }
}

function buildFee(amount) {
  const numeric = toProperty24Number(amount)
  return numeric === null ? undefined : { amount: numeric, unit: 'TotalPrice' }
}

function buildPropertyFeatures(listing = {}, publication = {}) {
  const bedrooms = firstNumber(publication.bedrooms, listing.bedrooms, listing.propertyDetails?.bedrooms)
  const bathrooms = firstNumber(publication.bathrooms, listing.bathrooms, listing.propertyDetails?.bathrooms)
  const garages = firstNumber(publication.garages, listing.garages, listing.propertyDetails?.garages) ?? 0
  const parkingBays = firstNumber(publication.parking_bays, publication.parkingBays, listing.parkingBays, listing.propertyDetails?.parkingBays)

  return {
    ...(bedrooms !== null ? { bedrooms } : {}),
    ...(bathrooms !== null ? { bathrooms: { bathrooms } } : {}),
    garages,
    ...(parkingBays !== null ? { parking: { open: parkingBays } } : {}),
    garden: normalizeBoolean(publication.garden ?? listing.garden ?? listing.propertyDetails?.garden, false),
    pool: normalizeBoolean(publication.pool ?? listing.pool ?? listing.propertyDetails?.pool, false),
    flatlet: normalizeBoolean(publication.flatlet ?? listing.flatlet ?? listing.propertyDetails?.flatlet, false),
    petsAllowed: firstText(publication.petsAllowed, publication.pets_allowed, listing.petsAllowed, listing.pets_allowed) || 'DontKnow',
    furnishedStatus: firstText(publication.furnishedStatus, publication.furnished_status, listing.furnishedStatus, listing.furnished_status) || 'No',
  }
}

function buildPropertyInfo({ listing, publication, suburbId, propertyTypeId }) {
  const erf = buildArea(firstNumber(publication.erf_size, publication.erfSize, listing.erfSize, listing.propertyDetails?.erfSize))
  const floorArea = buildArea(firstNumber(publication.floor_size, publication.floorSize, listing.floorSize, listing.propertyDetails?.floorSize))
  const municipalRatesAndTaxes = buildFee(firstNumber(publication.rates_taxes, publication.ratesTaxes, listing.ratesTaxes, listing.propertyDetails?.ratesTaxes))
  const monthlyLevy = buildFee(firstNumber(publication.levies, listing.levies, listing.propertyDetails?.levies))

  return {
    showLocation: normalizeBoolean(publication.showLocation ?? listing.showLocation ?? listing.show_location, false),
    suburbId,
    streetNumber: firstText(publication.streetNumber, publication.street_number, listing.streetNumber, listing.street_number),
    streetName: firstText(publication.streetName, publication.street_name, listing.streetName, listing.street_name, listing.address_line_1, listing.addressLine1),
    sourceReference: firstText(listing.listing_reference, listing.listingReference, listing.id),
    ...(erf ? { erf } : {}),
    ...(floorArea ? { floorArea } : {}),
    ...(municipalRatesAndTaxes ? { municipalRatesAndTaxes } : {}),
    ...(monthlyLevy ? { monthlyLevy } : {}),
    propertyTypeId,
  }
}

function buildPhotos(mediaRows = [], { includePhotos = true } = {}) {
  if (!includePhotos) return null
  const images = mediaRows.filter((item) => item.mediaType === 'image' || item.mediaType === 'floor_plan')
  return images
    .filter((item) => item.bytes)
    .map((item) => ({
      bytes: item.bytes,
      mimeContentType: item.mimeContentType,
      caption: item.caption || null,
      isFloorPlan: item.mediaType === 'floor_plan',
    }))
}

function buildPreviewPhotos(mediaRows = [], { includePhotos = true } = {}) {
  if (!includePhotos) return null
  return mediaRows
    .filter((item) => item.mediaType === 'image' || item.mediaType === 'floor_plan')
    .map((item) => ({
      sourceUrl: item.sourceUrl || null,
      mimeContentType: item.mimeContentType,
      caption: item.caption || null,
      isFloorPlan: item.mediaType === 'floor_plan',
      bytesLoaded: Boolean(item.bytes),
    }))
}

export function createProperty24ListingPlan({
  listing = {},
  publication = {},
  media = [],
  agentMapping = {},
  catalogMapping = {},
  propertyTypeMappings = DEFAULT_PROPERTY24_PROPERTY_TYPE_MAPPINGS,
  existingSync = {},
  options = {},
} = {}) {
  const agencyId = toProperty24Integer(options.agencyId || existingSync.agencyId || existingSync.agency_id || DEFAULT_PROPERTY24_AGENCY_ID)
  const listingNumber = toProperty24Integer(existingSync.listingNumber || existingSync.listing_number || options.listingNumber)
  const isNew = !listingNumber
  const listingType = resolveProperty24ListingType(firstText(publication.listing_type, publication.listingType, listing.listing_type, listing.listingType))
  const status = resolveProperty24Status(firstText(options.status, listing.listing_status, listing.listingStatus, publication.status), { isNew })
  const price = resolvePrice(listing, publication, options)
  const isPOA = resolvePoa(listing, publication, options)
  const expiryDate = resolveExpiryDate(listing, publication, options)
  const description = resolveDescription(listing, publication)
  const descriptionHeader = resolveDescriptionHeader(listing, publication)
  const propertyTypeValue = firstText(
    catalogMapping.propertyTypeId,
    catalogMapping.property_type_id,
    publication.property_type,
    publication.propertyType,
    listing.property_type,
    listing.propertyType,
  )
  const propertyTypeId = resolveProperty24PropertyTypeId(propertyTypeValue, propertyTypeMappings)
  const suburbId = resolveSuburbId(catalogMapping, listing, publication, options)
  const { property24AgentId, sourceReference } = resolveAgentMapping(agentMapping, listing, options)
  const mediaRows = normalizeMediaRows(media)
  const imageRows = mediaRows.filter((item) => item.mediaType === 'image')
  const includePhotos = isNew || options.photosChanged !== false
  const photos = buildPhotos(mediaRows, { includePhotos })
  const previewPhotos = buildPreviewPhotos(mediaRows, { includePhotos })
  const propertyFeatures = buildPropertyFeatures(listing, publication)
  const propertyInfo = buildPropertyInfo({ listing, publication, suburbId, propertyTypeId })

  const dataBlockers = []
  const technicalBlockers = []

  if (!agencyId) dataBlockers.push('missing_property24_agency_id')
  if (!property24AgentId) dataBlockers.push('missing_property24_agent_id')
  if (!sourceReference) dataBlockers.push('missing_agent_source_reference')
  if (!description) dataBlockers.push('missing_description')
  if (!expiryDate) dataBlockers.push('missing_expiry_date')
  if (!suburbId) dataBlockers.push('missing_property24_suburb_id')
  if (!propertyTypeId) dataBlockers.push('missing_property24_property_type_id')
  if (!price && !isPOA) dataBlockers.push('missing_price_or_poa')
  if (!imageRows.length && isNew) dataBlockers.push('missing_listing_image')
  if (!propertyFeatures.petsAllowed) dataBlockers.push('missing_pets_allowed_value')
  if (!propertyFeatures.furnishedStatus) dataBlockers.push('missing_furnished_status_value')
  if (propertyFeatures.garages === null || propertyFeatures.garages === undefined) dataBlockers.push('missing_garages_value')
  if (propertyFeatures.garden === null || propertyFeatures.garden === undefined) dataBlockers.push('missing_garden_value')
  if (propertyFeatures.pool === null || propertyFeatures.pool === undefined) dataBlockers.push('missing_pool_value')
  if (propertyFeatures.flatlet === null || propertyFeatures.flatlet === undefined) dataBlockers.push('missing_flatlet_value')

  if (includePhotos && imageRows.length && photos.length !== imageRows.length) {
    technicalBlockers.push('listing_image_bytes_not_loaded_for_property24_submit')
  }

  const canPreview = dataBlockers.length === 0
  const canSubmit = canPreview && technicalBlockers.length === 0
  const basePayload = canPreview
    ? {
        agencyId,
        contactAgentIds: [property24AgentId],
        ...(listingNumber ? { listingNumber } : {}),
        listingType,
        status,
        price: price || 0,
        isPOA,
        listingVisibility: 'Public',
        expiryDate,
        description,
        ...(descriptionHeader ? { descriptionHeader } : {}),
        photos: previewPhotos,
        propertyInfo,
        propertyFeatures,
      }
    : null
  const payload = canSubmit
    ? {
        ...basePayload,
        photos,
      }
    : null

  return {
    canPreview,
    canSubmit,
    dataBlockers,
    technicalBlockers,
    summary: {
      agencyId,
      contactAgentIds: property24AgentId ? [property24AgentId] : [],
      agentSourceReference: sourceReference,
      listingNumber: listingNumber || null,
      listingType,
      status,
      price: price || 0,
      isPOA,
      expiryDate,
      propertyTypeId,
      suburbId,
      imageCount: imageRows.length,
      photoPayloadCount: photos ? photos.length : null,
      descriptionPresent: Boolean(description),
    },
    previewPayload: basePayload,
    payload,
  }
}
