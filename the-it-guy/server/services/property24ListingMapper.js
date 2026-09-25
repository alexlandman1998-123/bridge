import { evaluateProperty24ListingCategoryContract } from '../property24/listingCategoryContract.js'
import { evaluateProperty24ListingCategoryModel } from '../property24/listingCategoryModel.js'
import {
  appendPortalDescriptionFeatures,
  normalizeListingPortalFeatures,
  resolveListingAddressVisibility,
} from './listingPortalFeatureNormalizer.js'
import {
  PROPERTY24_PHASE2_PROPERTY_TYPES,
  resolveProperty24Phase2PropertyTypeId,
} from '../property24/propertyTypeCatalogue.js'

export const DEFAULT_PROPERTY24_COUNTRY_ID = 1

export const DEFAULT_PROPERTY24_PROPERTY_TYPE_MAPPINGS = PROPERTY24_PHASE2_PROPERTY_TYPES

const RESIDENTIAL_DWELLING_PROPERTY_TYPE_IDS = new Set([4, 5, 6])

// These v55 Tag values explicitly support association with a listing. Tags
// marked feature-description-only in the contract need a FeatureType context.
export const RESIDENTIAL_LISTING_TAGS = Object.freeze({
  new_development: 'NewDevelopment',
  security_estate: 'SecurityEstate',
  pantry: 'Pantry',
  scullery: 'Scullery',
  laundry: 'Laundry',
  patio: 'Patio',
  built_in_braai: 'Built_inBraai',
  jacuzzi: 'Jacuzzi',
  tennis_court: 'TennisCourt',
  alarm: 'AlarmSystem',
  intercom: 'Intercom',
  electric_fence: 'Electricfencing',
  air_conditioning: 'AirConditioningUnit',
  mountain_view: 'MountainView',
})

// These tags are explicitly feature-description tags in v55, so they belong
// in Listing.featureTags with a matching FeatureType, never Listing.tags.
export const RESIDENTIAL_FEATURE_TAGS = Object.freeze({
  built_in_cupboards: ['Closet', 'Built_inCupboards'],
  walk_in_closet: ['Closet', 'Walk_in_closet'],
  guest_toilet: ['Bathroom', 'GuestToilet'],
  irrigation_system: ['Garden', 'Irrigationsystem'],
  clubhouse: ['SpecialFeature', 'Clubhouse'],
  lapa: ['SpecialFeature', 'Lapa'],
  squash_court: ['SpecialFeature', 'SquashCourt'],
})

export const RESIDENTIAL_FEATURE_TYPES = Object.freeze({
  family_tv_room: 'FamilyTVRoom',
  kitchen: 'Kitchen',
  entrance_hall: 'EntranceHall',
})

export const RESIDENTIAL_ROOF_TAGS = Object.freeze({ Tiles: 'Tile', Slate: 'Slate', Thatch: 'Thatch' })

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

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === false) return value
  const key = normalizeProperty24ListingKey(value)
  if (['yes', 'true', '1'].includes(key)) return true
  if (['no', 'false', '0'].includes(key)) return false
  return fallback
}

function hasFeature(source = {}, aliases = []) {
  const normalizedAliases = new Set((Array.isArray(aliases) ? aliases : [aliases]).map(normalizeProperty24ListingKey).filter(Boolean))
  const features = Array.isArray(source.features) ? source.features : []
  return features.some((feature) => {
    const value = typeof feature === 'string'
      ? feature
      : firstText(feature.key, feature.value, feature.label, feature.name, feature.type)
    return normalizedAliases.has(normalizeProperty24ListingKey(value))
  })
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
  if (['reduced_price', 'reducedprice'].includes(key)) return 'ReducedPrice'
  if (['sold', 'registered', 'completed'].includes(key)) return 'Sold'
  if (['rented', 'let', 'leased'].includes(key)) return 'Rented'
  if (['pending', 'under_offer', 'offer_accepted', 'transaction_created'].includes(key)) return 'Pending'
  if (['withdrawn', 'paused', 'removed'].includes(key)) return 'Withdrawn'
  if (['expired'].includes(key)) return 'Expired'
  if (['cancelled', 'canceled'].includes(key)) return 'Cancelled'
  if (['back_on_market'].includes(key)) return 'BackOnMarket'
  return isNew ? 'NewListing' : 'Active'
}

export function resolveProperty24PropertyTypeId(value, mappings = DEFAULT_PROPERTY24_PROPERTY_TYPE_MAPPINGS) {
  if (mappings === DEFAULT_PROPERTY24_PROPERTY_TYPE_MAPPINGS) return resolveProperty24Phase2PropertyTypeId(value)
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
  const canonicalFacts = listing.seller_canonical_facts_json || listing.sellerCanonicalFacts || {}
  return toProperty24Integer(
    catalogMapping.suburbId ||
      catalogMapping.suburb_id ||
      catalogMapping.property24SuburbId ||
      catalogMapping.property24_suburb_id ||
      options.suburbId ||
      listing.property24_suburb_id ||
      listing.property24SuburbId ||
      canonicalFacts.property24SuburbId ||
      canonicalFacts.property24_suburb_id ||
      publication.property24_suburb_id ||
      publication.property24SuburbId,
  )
}

function resolveExpiryDate(listing = {}, publication = {}, options = {}) {
  const canonicalFacts = listing.seller_canonical_facts_json || listing.sellerCanonicalFacts || {}
  const property24Import = canonicalFacts.property24Import || canonicalFacts.property24_import || {}
  const raw = firstText(
    options.expiryDate,
    publication.property24ExpiryDate,
    publication.property24_expiry_date,
    listing.property24ExpiryDate,
    listing.property24_expiry_date,
    publication.expiryDate,
    publication.expiry_date,
    listing.expiryDate,
    listing.expiry_date,
    listing.mandateEndDate,
    listing.mandate_end_date,
    listing.propertyDetails?.expiryDate,
    listing.propertyDetails?.mandateEndDate,
    property24Import.expiryDate,
    property24Import.expiry_date,
  )
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function isFutureProperty24ExpiryDate(value = '') {
  const expiry = new Date(value)
  if (Number.isNaN(expiry.getTime())) return false
  const tomorrow = new Date()
  tomorrow.setHours(24, 0, 0, 0)
  return expiry.getTime() >= tomorrow.getTime()
}

function resolvePrice(listing = {}, publication = {}, options = {}) {
  return firstNumber(publication.asking_price, publication.askingPrice, listing.asking_price, listing.askingPrice, options.price)
}

function resolvePoa(listing = {}, publication = {}, options = {}) {
  return normalizeBoolean(options.isPOA ?? options.isPoa ?? publication.isPOA ?? publication.is_poa ?? listing.isPOA ?? listing.is_poa, false) ||
    hasFeature(publication, ['price_on_application', 'poa', 'is_poa']) ||
    hasFeature(listing, ['price_on_application', 'poa', 'is_poa'])
}

function resolveDescription(listing = {}, publication = {}) {
  const description = firstText(
    publication.description,
    publication.public_description,
    listing.listing_preview_description,
    listing.listingPreviewDescription,
    listing.description,
  )
  const features = normalizeListingPortalFeatures({ listing, publication })
  return appendPortalDescriptionFeatures(description, [
    ...(features.staffQuarters ? ['staff accommodation'] : []),
    ...(features.fibre ? ['fibre connectivity'] : []),
    ...features.additionalLabels,
  ])
}

function resolveSpecialistFacts(listing = {}, publication = {}, options = {}) {
  const listingCanonicalFacts = asObject(listing.seller_canonical_facts_json || listing.sellerCanonicalFacts)
  const publicationCanonicalFacts = asObject(publication.seller_canonical_facts_json || publication.sellerCanonicalFacts)
  const candidates = [
    options.specialistFacts,
    options.specialist_facts,
    publication.specialistFacts,
    publication.specialist_facts,
    publicationCanonicalFacts.specialistFacts,
    publicationCanonicalFacts.property?.specialistFacts,
    listing.specialistFacts,
    listing.specialist_facts,
    listingCanonicalFacts.specialistFacts,
    listingCanonicalFacts.property?.specialistFacts,
  ]
  return candidates.reduce((facts, candidate) => ({ ...facts, ...asObject(candidate) }), {})
}

function resolveSpecialistProperty24Description(description = '', facts = {}, category = '') {
  const detailsByCategory = {
    commercial: [
      ['Gross lettable area', facts.grossLettableArea ? `${facts.grossLettableArea} m²` : ''],
      ['Zoning', facts.zoning],
      ['Parking', facts.parking],
      ['Listing terms', facts.listingTerms],
    ],
    industrial: [
      ['Warehouse / factory area', facts.warehouseOrFactoryArea ? `${facts.warehouseOrFactoryArea} m²` : ''],
      ['Yard size', facts.yardSize ? `${facts.yardSize} m²` : ''],
      ['Power supply', facts.powerSupply],
      ['Loading access', facts.loadingAccess === true ? 'Yes' : facts.loadingAccess === false ? 'No' : ''],
    ],
    agricultural: [
      ['Farm size', facts.farmSize ? `${facts.farmSize} ha` : ''],
      ['Water supply / rights', facts.waterSupplyOrRights],
      ['Agricultural use', facts.agriculturalUse],
    ],
    land: [
      ['Erf / land size', facts.erfSize ? `${facts.erfSize} m²` : ''],
      ['Zoning', facts.zoning],
    ],
  }
  const entries = (detailsByCategory[category] || [])
    .map(([label, value]) => [label, normalizeProperty24ListingText(value)])
    .filter(([, value]) => value)
    .filter(([label, value]) => !String(description).toLowerCase().includes(`${label}: ${value}`.toLowerCase()))
  if (!entries.length) return description
  const suffix = entries.map(([label, value]) => `${label}: ${value}`).join('. ')
  const prefix = description && !/[.!?]$/.test(description) ? `${description}.` : description
  return `${prefix}${prefix ? ' ' : ''}${suffix}.`
}

function specialistParkingCount(value) {
  const direct = toProperty24Number(value)
  if (direct !== null) return direct
  const match = normalizeProperty24ListingText(value).match(/\d+(?:\.\d+)?/)
  return match ? toProperty24Number(match[0]) : null
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

function splitProperty24StreetAddress(value = '') {
  const line = normalizeProperty24ListingText(value).split(',')[0].trim()
  if (!line) return { streetNumber: '', streetName: '' }
  const match = line.match(/^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(.+)$/)
  return match
    ? { streetNumber: match[1], streetName: match[2].trim() }
    : { streetNumber: '', streetName: line }
}

function mappedBooleanFacts(facts, mapping) {
  return Object.fromEntries(Object.entries(mapping)
    .filter(([, key]) => typeof facts[key] === 'boolean')
    .map(([portalKey, key]) => [portalKey, facts[key]]))
}

function mappedCountFact(facts, key) {
  const value = toProperty24Integer(facts[key])
  return value === null ? undefined : value
}

function buildPropertyFeatures(listing = {}, publication = {}, { category = '' } = {}) {
  const normalized = normalizeListingPortalFeatures({ listing, publication })
  const facts = normalized.featureFacts
  const specialistFacts = resolveSpecialistFacts(listing, publication)
  const bedrooms = normalized.bedrooms
  const bathrooms = normalized.bathrooms
  const garages = normalized.garages ?? 0
  const parkingBays = normalized.parkingBays ?? (category === 'commercial' ? specialistParkingCount(specialistFacts.parking) : null)
  const parkingSpaces = toProperty24Integer(parkingBays)
  const sustainabilityInfo = mappedBooleanFacts(facts, {
    solarPanels: 'solar_panels', solarGeyser: 'solar_geyser', gasGeyser: 'gas_geyser',
    waterTank: 'water_tank', borehole: 'borehole', backupBatteryOrInverter: 'inverter_battery',
  })
  const internetAccess = mappedBooleanFacts(facts, {
    adsl: 'internet_adsl', dialUp: 'internet_dial_up', fixedWiMax: 'internet_fixed_wimax',
    isdn: 'internet_isdn', satellite: 'internet_satellite', vdsl: 'internet_vdsl',
  })
  if (typeof normalized.fibre === 'boolean') internetAccess.fibre = normalized.fibre
  const outsideArea = mappedBooleanFacts(facts, { balcony: 'balcony', courtyard: 'courtyard', roofArea: 'roof_area' })
  const outsideAreas = mappedCountFact(facts, 'outside_areas')
  if (outsideAreas !== undefined) outsideArea.outsideAreas = outsideAreas
  const kitchens = mappedBooleanFacts(facts, {
    dishwasher: 'kitchen_dishwasher', cleaningService: 'kitchen_cleaning_service',
    sink: 'kitchen_sink', coffeeMachine: 'kitchen_coffee_machine',
  })
  const kitchenCount = mappedCountFact(facts, 'kitchens')
  if (kitchenCount !== undefined) kitchens.kitchens = kitchenCount
  const publicTransport = mappedBooleanFacts(facts, {
    nearbyBusService: 'nearby_bus', nearbyMinibusTaxiService: 'nearby_minibus_taxi', nearbyTrainService: 'nearby_train',
  })
  const parking = mappedBooleanFacts(facts, {
    secureParking: 'secure_parking', onStreetParking: 'street_parking',
    shadeNetCoveredParking: 'covered_parking', undergroundParking: 'underground_parking',
    visitorsParking: 'visitors_parking', tandemParking: 'tandem_parking',
    singleParking: 'single_parking', doubleParking: 'double_parking', tripleParking: 'triple_parking',
  })
  if (parkingSpaces !== null) parking.parkingSpaces = parkingSpaces
  if (Number.isFinite(facts.carports)) parking.carport = facts.carports > 0

  return {
    ...(bedrooms !== null ? { bedrooms } : {}),
    ...(bathrooms !== null ? { bathrooms: { bathrooms } } : {}),
    garages,
    ...(Object.keys(parking).length ? { parking } : {}),
    ...(mappedCountFact(facts, 'studies') !== undefined ? { studies: mappedCountFact(facts, 'studies') } : {}),
    ...(mappedCountFact(facts, 'storeys') !== undefined ? { numberOfFloors: mappedCountFact(facts, 'storeys') } : {}),
    ...(Object.keys(kitchens).length ? { kitchens } : {}),
    ...(mappedCountFact(facts, 'outbuildings_area') !== undefined ? { outBuildingsSize: mappedCountFact(facts, 'outbuildings_area') } : {}),
    ...Object.fromEntries([
      ['receptionRooms', 'reception_rooms'], ['domesticRooms', 'domestic_rooms'],
      ['domesticBathrooms', 'domestic_bathrooms'], ['outsideToilets', 'outside_toilets'],
    ].flatMap(([portalKey, key]) => {
      const value = mappedCountFact(facts, key)
      return value === undefined ? [] : [[portalKey, value]]
    })),
    ...mappedBooleanFacts(facts, { secondHouse: 'second_house', hasStandaloneBuilding: 'standalone_building' }),
    ...(Object.keys(sustainabilityInfo).length ? { sustainabilityInfo } : {}),
    ...(Object.keys(internetAccess).length ? { internetAccess } : {}),
    ...(Object.keys(outsideArea).length ? { outsideArea } : {}),
    ...(Object.keys(publicTransport).length ? { publicTransport } : {}),
    ...(typeof facts.generator === 'boolean' ? { hasGenerator: facts.generator } : {}),
    ...(typeof facts.backup_water === 'boolean' ? { hasBackupWater: facts.backup_water } : {}),
    ...(typeof facts.wheelchair_accessible === 'boolean' ? { isWheelchairAccessible: facts.wheelchair_accessible } : {}),
    garden: normalized.garden ?? false,
    pool: normalized.pool ?? false,
    flatlet: normalized.flatlet ?? false,
    petsAllowed: normalized.featureFacts.pet_friendly === true ? 'Yes' : normalized.featureFacts.pet_friendly === false ? 'No' : firstText(publication.petsAllowed, publication.pets_allowed, listing.petsAllowed, listing.pets_allowed) || (normalized.petFriendly === true ? 'Yes' : normalized.petFriendly === false ? 'No' : 'DontKnow'),
    furnishedStatus: firstText(publication.furnishedStatus, publication.furnished_status, listing.furnishedStatus, listing.furnished_status) || 'No',
  }
}

export function buildProperty24CategoryPayload({ listing = {}, publication = {}, category = '', propertyTypeId = null, options = {} } = {}) {
  const facts = resolveSpecialistFacts(listing, publication, options)
  const propertyInfo = {}

  if (category === 'commercial') {
    const floorArea = buildArea(facts.grossLettableArea)
    if (floorArea) propertyInfo.floorArea = floorArea
  }
  if (category === 'industrial') {
    const floorArea = buildArea(facts.warehouseOrFactoryArea)
    const erf = buildArea(facts.yardSize)
    if (floorArea) propertyInfo.floorArea = floorArea
    if (erf) propertyInfo.erf = erf
  }
  if (category === 'agricultural') {
    const farmSizeHectares = toProperty24Number(facts.farmSize)
    // The v55 area object is square metres. Arch9 captures farms in hectares,
    // so convert explicitly rather than mislabelling the unit.
    const erf = farmSizeHectares === null ? undefined : buildArea(farmSizeHectares * 10_000)
    if (erf) propertyInfo.erf = erf
  }
  if (category === 'land') {
    const erf = buildArea(facts.erfSize)
    if (erf) propertyInfo.erf = erf
    const zoneType = normalizeProperty24ListingText(facts.zoning)
    if (zoneType) propertyInfo.zoneType = zoneType
  }

  return {
    category,
    propertyTypeId,
    specialistFacts: facts,
    propertyInfo,
    description: resolveSpecialistProperty24Description('', facts, category),
  }
}

function buildPropertyInfo({ listing, publication, suburbId, propertyTypeId, category, options }) {
  const canonicalFacts = listing.seller_canonical_facts_json || listing.sellerCanonicalFacts || {}
  const categoryPayload = buildProperty24CategoryPayload({ listing, publication, category, propertyTypeId, options })
  const combinedStreetAddress = firstText(
    publication.streetAddress,
    publication.street_address,
    publication.address,
    listing.streetAddress,
    listing.street_address,
    listing.address_line_1,
    listing.addressLine1,
    listing.formatted_address,
    listing.formattedAddress,
  )
  const inferredStreetAddress = splitProperty24StreetAddress(combinedStreetAddress)
  const erf = buildArea(firstNumber(publication.erf_size, publication.erfSize, listing.erfSize, listing.propertyDetails?.erfSize)) || categoryPayload.propertyInfo.erf
  const floorArea = buildArea(firstNumber(publication.floor_size, publication.floorSize, listing.floorSize, listing.propertyDetails?.floorSize)) || categoryPayload.propertyInfo.floorArea
  const municipalRatesAndTaxes = buildFee(firstNumber(publication.rates_taxes, publication.ratesTaxes, listing.ratesTaxes, listing.propertyDetails?.ratesTaxes))
  const monthlyLevy = buildFee(firstNumber(publication.levies, listing.levies, listing.propertyDetails?.levies))
  const addressVisibility = resolveListingAddressVisibility(
    publication.exactAddressVisibility,
    publication.exact_address_visibility,
    listing.exactAddressVisibility,
    listing.exact_address_visibility,
    publication.showLocation,
    publication.show_location,
    listing.showLocation,
    listing.show_location,
    canonicalFacts.property24ShowLocation,
  )

  return {
    showLocation: addressVisibility === 'show_exact_address',
    suburbId,
    streetNumber: firstText(publication.streetNumber, publication.street_number, listing.streetNumber, listing.street_number, inferredStreetAddress.streetNumber),
    streetName: firstText(publication.streetName, publication.street_name, listing.streetName, listing.street_name, inferredStreetAddress.streetName),
    sourceReference: firstText(listing.listing_reference, listing.listingReference, listing.id),
    ...(erf ? { erf } : {}),
    ...(floorArea ? { floorArea } : {}),
    ...(municipalRatesAndTaxes ? { municipalRatesAndTaxes } : {}),
    ...(monthlyLevy ? { monthlyLevy } : {}),
    ...(categoryPayload.propertyInfo.zoneType ? { zoneType: categoryPayload.propertyInfo.zoneType } : {}),
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
  // The agency must come from the organisation's saved Property24 connection
  // (or the existing portal sync for an update). Never select another agency
  // by falling back to a platform-wide default.
  const agencyId = toProperty24Integer(options.agencyId || existingSync.agencyId || existingSync.agency_id)
  const listingNumber = toProperty24Integer(existingSync.listingNumber || existingSync.listing_number || options.listingNumber)
  const isNew = !listingNumber
  const listingType = resolveProperty24ListingType(firstText(publication.listing_type, publication.listingType, listing.listing_type, listing.listingType))
  const categoryContract = evaluateProperty24ListingCategoryContract({ listing, publication, listingType })
  const status = resolveProperty24Status(firstText(options.status, listing.listing_status, listing.listingStatus, publication.status), { isNew })
  const price = resolvePrice(listing, publication, options)
  const isPOA = resolvePoa(listing, publication, options)
  const expiryDate = resolveExpiryDate(listing, publication, options)
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
  const categoryPayload = buildProperty24CategoryPayload({
    listing,
    publication,
    category: categoryContract.category,
    propertyTypeId,
    options,
  })
  const description = resolveSpecialistProperty24Description(
    resolveDescription(listing, publication),
    categoryPayload.specialistFacts,
    categoryContract.category,
  )
  const suburbId = resolveSuburbId(catalogMapping, listing, publication, options)
  const { property24AgentId, sourceReference } = resolveAgentMapping(agentMapping, listing, options)
  const mediaRows = normalizeMediaRows(media)
  const imageRows = mediaRows.filter((item) => item.mediaType === 'image')
  const includePhotos = isNew || options.photosChanged !== false
  const requirePhotoBytes = options.requirePhotoBytes !== false
  const photos = buildPhotos(mediaRows, { includePhotos })
  const previewPhotos = buildPreviewPhotos(mediaRows, { includePhotos })
  const expectedPhotoPayloadCount = options.expectedPhotoPayloadCount === null || options.expectedPhotoPayloadCount === undefined
    ? imageRows.length
    : Math.max(0, toProperty24Integer(options.expectedPhotoPayloadCount) || 0)
  const propertyFeatures = buildPropertyFeatures(listing, publication, { category: categoryContract.category })
  const featureFacts = normalizeListingPortalFeatures({ listing, publication }).featureFacts
  const tags = categoryContract.category === 'residential'
    ? Object.entries(RESIDENTIAL_LISTING_TAGS)
      .filter(([key]) => featureFacts[key] === true && (key !== 'new_development' || [4, 6].includes(propertyTypeId)))
      .map(([, tag]) => tag)
      .concat(RESIDENTIAL_ROOF_TAGS[featureFacts.roof_type] || [])
    : []
  const featureTags = categoryContract.category === 'residential'
    ? Object.entries(RESIDENTIAL_FEATURE_TAGS)
      .filter(([key]) => featureFacts[key] === true)
      .map(([, [featureType, tag]]) => ({ featureType, tags: [tag] }))
      .concat(Object.entries(RESIDENTIAL_FEATURE_TYPES)
        .filter(([key]) => featureFacts[key] === true)
        .map(([, featureType]) => ({ featureType })))
    : []
  const propertyInfo = buildPropertyInfo({ listing, publication, suburbId, propertyTypeId, category: categoryContract.category, options })
  const categoryModel = evaluateProperty24ListingCategoryModel({
    listing,
    publication,
    category: categoryContract.category,
    listingType,
    status,
    propertyTypeId,
    isPOA,
  })
  const sandboxPayloadTestMode = normalizeBoolean(options.sandboxPayloadTestMode, false) &&
    normalizeProperty24ListingKey(options.environment) !== 'production'

  const dataBlockers = []
  const technicalBlockers = []
  const qualityWarnings = []

  dataBlockers.push(...categoryContract.blockers)
  dataBlockers.push(...categoryModel.blockers)
  if (isNew && status === 'ReducedPrice') dataBlockers.push('reduced_price_status_requires_existing_listing')

  if (!agencyId) dataBlockers.push('missing_property24_agency_id')
  if (!property24AgentId) {
    if (sandboxPayloadTestMode) technicalBlockers.push('sandbox_property24_agent_id_required_before_submit')
    else dataBlockers.push('missing_property24_agent_id')
  }
  // Property24 receives the numeric contactAgentIds. This reference is useful
  // for our local mapping but is not a Property24 submission requirement.
  if (!sourceReference) qualityWarnings.push('missing_agent_source_reference')
  if (!description) dataBlockers.push('missing_description')
  if (!expiryDate) dataBlockers.push('missing_expiry_date')
  if (expiryDate && !isFutureProperty24ExpiryDate(expiryDate)) dataBlockers.push('property24_expiry_date_must_be_future')
  if (!suburbId) dataBlockers.push('missing_property24_suburb_id')
  if (!propertyTypeId) dataBlockers.push('missing_property24_property_type_id')
  if (!price && !isPOA) dataBlockers.push('missing_price_or_poa')
  if (!imageRows.length && isNew) dataBlockers.push('missing_listing_image')

  // These improve an advert but are not Property24 submission requirements.
  // Keep them visible without preventing normal listing management.
  if (categoryContract.category === 'residential') {
    if (!descriptionHeader) qualityWarnings.push('missing_marketing_title')
    if (RESIDENTIAL_DWELLING_PROPERTY_TYPE_IDS.has(propertyTypeId)) {
      if (!propertyInfo.floorArea?.size) qualityWarnings.push('missing_floor_size')
      if (!propertyFeatures.bedrooms) qualityWarnings.push('missing_bedrooms')
      if (!propertyFeatures.bathrooms?.bathrooms) qualityWarnings.push('missing_bathrooms')
    }
  }
  if (!propertyFeatures.petsAllowed) dataBlockers.push('missing_pets_allowed_value')
  if (!propertyFeatures.furnishedStatus) dataBlockers.push('missing_furnished_status_value')
  if (propertyFeatures.garages === null || propertyFeatures.garages === undefined) dataBlockers.push('missing_garages_value')
  if (propertyFeatures.garden === null || propertyFeatures.garden === undefined) dataBlockers.push('missing_garden_value')
  if (propertyFeatures.pool === null || propertyFeatures.pool === undefined) dataBlockers.push('missing_pool_value')
  if (propertyFeatures.flatlet === null || propertyFeatures.flatlet === undefined) dataBlockers.push('missing_flatlet_value')

  // The byte loader deliberately limits the Property24 submission batch (20
  // images by default). Compare against that selected batch, not every image
  // in the Arch9 gallery, otherwise any gallery larger than the cap can never
  // become submit-ready even when every selected image loaded successfully.
  if (requirePhotoBytes && includePhotos && imageRows.length && photos.length !== expectedPhotoPayloadCount) {
    technicalBlockers.push('listing_image_bytes_not_loaded_for_property24_submit')
  }

  const canPreview = dataBlockers.length === 0
  const canSubmit = canPreview && technicalBlockers.length === 0
  const basePayload = canPreview
    ? {
        agencyId,
        contactAgentIds: property24AgentId ? [property24AgentId] : [],
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
        ...(tags.length ? { tags } : {}),
        ...(featureTags.length ? { featureTags } : {}),
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
    qualityWarnings,
    summary: {
      agencyId,
      contactAgentIds: property24AgentId ? [property24AgentId] : [],
      agentSourceReference: sourceReference,
      sandboxPayloadTestMode,
      agentMappingRequiredBeforeSubmit: Boolean(sandboxPayloadTestMode && !property24AgentId),
      listingNumber: listingNumber || null,
      listingType,
      categoryContract,
      categoryModel,
      categoryPayload: {
        category: categoryPayload.category,
        mappedPropertyInfo: categoryPayload.propertyInfo,
        specialistFactKeys: Object.keys(categoryPayload.specialistFacts).filter((key) => normalizeProperty24ListingText(categoryPayload.specialistFacts[key])),
      },
      status,
      price: price || 0,
      isPOA,
      expiryDate,
      propertyTypeId,
      suburbId,
      imageCount: imageRows.length,
      expectedPhotoPayloadCount,
      photoPayloadCount: photos ? photos.length : null,
      descriptionPresent: Boolean(description),
    },
    previewPayload: basePayload,
    payload,
  }
}
