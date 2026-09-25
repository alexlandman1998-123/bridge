import {
  escapePrivatePropertyXml,
  normalizePrivatePropertyText,
} from './privatePropertyClient.js'
import {
  appendPortalDescriptionFeatures,
  normalizeListingPortalFeatures,
  resolveListingAddressVisibility,
} from './listingPortalFeatureNormalizer.js'
import { buildListingAddressFingerprint } from './listingPortalAddressProtectionService.js'
import { resolveListingFeature } from '../../src/services/listings/listingFeatureCatalog.js'

export function normalizePrivatePropertyListingKey(value = '') {
  return normalizePrivatePropertyText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizePrivatePropertyText(value)
    if (text) return text
  }
  return ''
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || normalizePrivatePropertyText(value) === '') continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
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

function toPositiveInteger(value) {
  const numeric = firstNumber(value)
  return numeric && numeric > 0 ? Math.round(numeric) : null
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === false) return value
  const key = normalizePrivatePropertyListingKey(value)
  if (['yes', 'true', '1', 'y'].includes(key)) return true
  if (['no', 'false', '0', 'n'].includes(key)) return false
  return fallback
}

function hasFeature(source = {}, aliases = []) {
  const normalizedAliases = new Set((Array.isArray(aliases) ? aliases : [aliases]).map(normalizePrivatePropertyListingKey).filter(Boolean))
  const features = Array.isArray(source.features) ? source.features : []
  return features.some((feature) => {
    const value = typeof feature === 'string'
      ? feature
      : firstText(feature.key, feature.value, feature.label, feature.name, feature.type)
    return normalizedAliases.has(normalizePrivatePropertyListingKey(value))
  })
}

function toDateOnly(value = '') {
  const text = normalizePrivatePropertyText(value)
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function addDaysToDateOnly(dateOnly = '', days = 0) {
  const text = normalizePrivatePropertyText(dateOnly)
  if (!text) return ''
  const date = new Date(`${text}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function toPrivatePropertyDateTime(value = '') {
  const dateOnly = toDateOnly(value)
  return dateOnly ? `${dateOnly}T00:00:00` : ''
}

function normalizeDateTime(value = '') {
  const text = normalizePrivatePropertyText(value)
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?$/i.test(text)) {
    return text.length === 16 ? `${text}:00` : text
  }
  return toPrivatePropertyDateTime(text)
}

function normalizeMediaRows(media = []) {
  return (Array.isArray(media) ? media : [])
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const mediaType = normalizePrivatePropertyListingKey(item.media_type || item.mediaType || 'image')
      const sourceUrl = firstText(item.file_url, item.fileUrl, item.url, item.publicUrl, item.public_url, item.signedUrl, item.signed_url)
      if (!sourceUrl) return null
      return {
        mediaType,
        sourceUrl,
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

export function resolvePrivatePropertyListingType(value = '') {
  const key = normalizePrivatePropertyListingKey(value)
  if (['rental', 'rent', 'to_rent', 'lease', 'letting'].includes(key)) return 'Rental'
  return 'Sale'
}

export function resolvePrivatePropertyCategory(value = '') {
  const key = normalizePrivatePropertyListingKey(value)
  if (['commercial', 'commercial_property', 'office', 'offices', 'retail', 'industrial', 'warehouse', 'factory', 'shop', 'mixed_use'].includes(key)) return 'Commercial'
  if (['farm', 'farms', 'agricultural', 'agriculture', 'smallholding', 'small_holding', 'farm_with_house', 'farm_land', 'agricultural_holding', 'commercial_farm', 'game_farm'].includes(key)) return 'Farms'
  if (['land', 'vacant_land', 'plot', 'stand', 'residential_land', 'commercial_land'].includes(key)) return 'Land'
  return 'Residential'
}

export function resolvePrivatePropertyMandateType({ listingType = 'Sale', category = 'Residential', value = '', auction = false } = {}) {
  const key = normalizePrivatePropertyListingKey(value)
  if (auction || key.includes('auction')) return 'AuctionOnly'
  if (listingType === 'Rental') return key === 'house_share' || key === 'houseshare' ? 'HouseShare' : 'Rental'
  if (['sole', 'full', 'full_mandate', 'sole_mandate', 'exclusive'].includes(key)) return 'FullMandate'
  if (category === 'Farms' && key === 'auction_only') return 'AuctionOnly'
  return 'OpenMandate'
}

export function resolvePrivatePropertyRentalPriceType(value = '', { listingType = 'Sale', category = 'Residential' } = {}) {
  if (listingType !== 'Rental') return ''
  const key = normalizePrivatePropertyListingKey(value)
  const map = {
    per_month: 'PerMonth',
    permonth: 'PerMonth',
    month: 'PerMonth',
    monthly: 'PerMonth',
    per_week: 'PerWeek',
    perweek: 'PerWeek',
    week: 'PerWeek',
    weekly: 'PerWeek',
    per_day: 'PerDay',
    perday: 'PerDay',
    day: 'PerDay',
    daily: 'PerDay',
    per_m2: 'PerM2',
    perm2: 'PerM2',
    per_square_meter: 'PerM2',
    per_square_metre: 'PerM2',
    m2: 'PerM2',
  }
  if (map[key]) return map[key]
  return category === 'Commercial' || category === 'Land' ? 'PerMonth' : 'PerMonth'
}

export function resolvePrivatePropertyStatus({ listingType = 'Sale', value = '' } = {}) {
  const key = normalizePrivatePropertyListingKey(value)
  if (['sold', 'registered', 'completed'].includes(key)) return 'Sold'
  if (['pending', 'under_offer', 'offer_accepted', 'pending_offer'].includes(key)) return 'PendingOffer'
  if (['inactive', 'withdrawn', 'paused', 'removed', 'expired', 'cancelled', 'canceled'].includes(key)) return 'Inactive'
  return listingType === 'Rental' ? 'ToLet' : 'ForSale'
}

export function resolvePrivatePropertyProvince(value = '') {
  const key = normalizePrivatePropertyListingKey(value)
  const provinces = {
    gauteng: 'Gauteng',
    western_cape: 'WesternCape',
    kwa_zulu_natal: 'KwaZuluNatal',
    kwazulu_natal: 'KwaZuluNatal',
    kzn: 'KwaZuluNatal',
    eastern_cape: 'EasternCape',
    northern_cape: 'NorthernCape',
    free_state: 'FreeState',
    limpopo: 'Limpopo',
    north_west: 'NorthWest',
    mpumalanga: 'Mpumalanga',
  }
  return provinces[key] || normalizePrivatePropertyText(value)
}

function resolveAgentIds(agentMapping = {}, listing = {}, options = {}) {
  const raw = firstText(
    options.agentIds,
    options.agentId,
    agentMapping.agentIds,
    agentMapping.agentId,
    agentMapping.privatePropertyAgentId,
    agentMapping.private_property_agent_id,
    listing.private_property_agent_id,
    listing.privatePropertyAgentId,
    listing.assigned_agent_id,
    listing.assignedAgentId,
  )
  if (Array.isArray(raw)) return raw.map(normalizePrivatePropertyText).filter(Boolean)
  return normalizePrivatePropertyText(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolvePropertyId(listing = {}, publication = {}, options = {}) {
  return firstText(
    options.propertyId,
    publication.private_property_property_id,
    publication.privatePropertyPropertyId,
    publication.external_reference,
    publication.externalReference,
    listing.private_property_property_id,
    listing.privatePropertyPropertyId,
    listing.listing_reference,
    listing.listingReference,
    listing.id,
  )
}

function resolveDescription(listing = {}, publication = {}, category = 'Residential') {
  const description = firstText(
    publication.description,
    publication.public_description,
    listing.listing_preview_description,
    listing.listingPreviewDescription,
    listing.description,
  )
  const features = normalizeListingPortalFeatures({ listing, publication })
  return appendPortalDescriptionFeatures(description, [
    ...(features.fibre ? ['fibre connectivity'] : []),
    ...[
      ['flatlet', features.flatlet, 'Flatlet'],
      ['staff_quarters', features.staffQuarters, 'Staff quarters'],
      ['pool', features.pool, 'Pool'],
      ['garden', features.garden, 'Garden'],
      ['pet_friendly', features.petFriendly, 'Pet friendly'],
    ].filter(([key, value]) => value === true && !supportsPrivatePropertyFeature(key, category)).map(([, , label]) => label),
    ...features.additionalLabels.filter((label) => {
      const feature = resolveListingFeature(label.split(':')[0])
      return !feature || !PRIVATE_PROPERTY_FEATURE_ATTRIBUTES[feature.key] || !supportsPrivatePropertyFeature(feature.key, category)
    }),
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

function resolvePrivatePropertySpecialistCategory(listing = {}, publication = {}, options = {}) {
  const listingCanonicalFacts = asObject(listing.seller_canonical_facts_json || listing.sellerCanonicalFacts)
  const publicationCanonicalFacts = asObject(publication.seller_canonical_facts_json || publication.sellerCanonicalFacts)
  const value = firstText(
    options.propertyCategory,
    options.property_category,
    publication.property_category,
    publication.propertyCategory,
    listing.property_category,
    listing.propertyCategory,
    publicationCanonicalFacts.propertyCategory,
    publicationCanonicalFacts.property?.propertyCategory,
    listingCanonicalFacts.propertyCategory,
    listingCanonicalFacts.property?.propertyCategory,
  )
  const key = normalizePrivatePropertyListingKey(value)
  if (['industrial', 'warehouse', 'factory'].includes(key)) return 'industrial'
  if (['farm', 'farms', 'agricultural', 'agriculture', 'smallholding', 'small_holding', 'farm_with_house', 'farm_land', 'agricultural_holding', 'commercial_farm', 'game_farm'].includes(key)) return 'agricultural'
  if (['land', 'vacant_land', 'plot', 'stand', 'residential_land', 'commercial_land'].includes(key)) return 'land'
  if (['commercial', 'commercial_property', 'office', 'offices', 'retail', 'shop', 'mixed_use'].includes(key)) return 'commercial'
  return ''
}

function appendSpecialistDescription(description = '', facts = {}, specialistCategory = '') {
  const detailsByCategory = {
    commercial: [
      ['Zoning', facts.zoning],
      ['Listing terms', facts.listingTerms],
    ],
    industrial: [
      ['Power supply', facts.powerSupply],
      ['Loading access', facts.loadingAccess === true ? 'Yes' : facts.loadingAccess === false ? 'No' : ''],
    ],
    agricultural: [
      ['Water supply / rights', facts.waterSupplyOrRights],
      ['Agricultural use', facts.agriculturalUse],
    ],
    land: [
      ['Zoning', facts.zoning],
    ],
  }
  const entries = (detailsByCategory[specialistCategory] || [])
    .map(([label, value]) => [label, normalizePrivatePropertyText(value)])
    .filter(([, value]) => value)
    .filter(([label, value]) => !String(description).toLowerCase().includes(`${label}: ${value}`.toLowerCase()))
  if (!entries.length) return description
  const summary = entries.map(([label, value]) => `${label}: ${value}`).join('. ')
  const prefix = description && !/[.!?]$/.test(description) ? `${description}.` : description
  return `${prefix}${prefix ? ' ' : ''}${summary}.`
}

function resolveHeadline(listing = {}, publication = {}) {
  return firstText(publication.headline, publication.title, listing.title, listing.listingTitle).slice(0, 200)
}

function resolvePrice(listing = {}, publication = {}, options = {}) {
  return firstNumber(options.price, publication.asking_price, publication.askingPrice, listing.asking_price, listing.askingPrice)
}

function resolveFarmName(listing = {}, publication = {}, options = {}) {
  return firstText(
    options.farmName,
    publication.farm_name,
    publication.farmName,
    listing.farm_name,
    listing.farmName,
    listing.seller_canonical_facts_json?.farmName,
    listing.seller_canonical_facts_json?.farm?.name,
  )
}

function resolveListingDate(listing = {}, publication = {}, options = {}) {
  return toDateOnly(firstText(options.listingDate, publication.listing_date, publication.listingDate, listing.listing_date, listing.listingDate, listing.created_at, listing.createdAt)) || toDateOnly(new Date().toISOString())
}

function splitStreetAddress(address = '') {
  const text = normalizePrivatePropertyText(address)
  if (!text) return { streetNumber: '', streetName: '' }
  const line = text.split(',')[0].trim()
  const match = line.match(/^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(.+)$/)
  if (!match) return { streetNumber: '', streetName: line }
  return {
    streetNumber: match[1],
    streetName: match[2],
  }
}

function resolveAvailableFrom(listing = {}, publication = {}, options = {}) {
  return toDateOnly(firstText(options.availableFrom, publication.available_from, publication.availableFrom, listing.available_from, listing.availableFrom))
}

function resolveAddress(listing = {}, publication = {}, options = {}) {
  const explicitStreetName = firstText(options.streetName, publication.streetName, publication.street_name, listing.streetName, listing.street_name)
  const explicitStreetNumber = firstText(options.streetNumber, publication.streetNumber, publication.street_number, listing.streetNumber, listing.street_number)
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
  const inferredStreetAddress = splitStreetAddress(combinedStreetAddress)
  const requestedVisibility = firstText(
    options.exactAddressVisibility,
    options.exact_address_visibility,
    publication.exactAddressVisibility,
    publication.exact_address_visibility,
    listing.exactAddressVisibility,
    listing.exact_address_visibility,
  )
  const visibility = resolveListingAddressVisibility(
    requestedVisibility,
    publication.showLocation,
    publication.show_location,
    listing.showLocation,
    listing.show_location,
  )
  const showExactAddress = visibility === 'show_exact_address'
  const showComplexOnly = visibility === 'complex_only'

  return {
    streetName: firstText(explicitStreetName, inferredStreetAddress.streetName),
    streetNumber: firstText(explicitStreetNumber, inferredStreetAddress.streetNumber),
    complexName: firstText(options.complexName, publication.complexName, publication.complex_name, listing.complexName, listing.complex_name),
    unitNumber: firstText(options.unitNumber, publication.unitNumber, publication.unit_number, listing.unitNumber, listing.unit_number),
    suburb: firstText(options.suburb, publication.suburb, listing.suburb),
    suburbId: toPositiveInteger(firstText(options.suburbId, publication.private_property_suburb_id, publication.privatePropertySuburbId, publication.suburb_id, listing.private_property_suburb_id, listing.privatePropertySuburbId, listing.suburb_id)),
    town: firstText(options.town, publication.town, publication.city, listing.town, listing.city),
    province: resolvePrivatePropertyProvince(firstText(options.province, publication.province, listing.province)),
    hideStreetName: requestedVisibility ? !showExactAddress : normalizeBoolean(options.hideStreetName ?? publication.hide_street_name ?? publication.hideStreetName ?? listing.hide_street_name ?? listing.hideStreetName, true),
    hideStreetNo: requestedVisibility ? !showExactAddress : normalizeBoolean(options.hideStreetNo ?? publication.hide_street_no ?? publication.hideStreetNo ?? listing.hide_street_no ?? listing.hideStreetNo, true),
    hideComplexName: requestedVisibility ? !(showExactAddress || showComplexOnly) : normalizeBoolean(options.hideComplexName ?? publication.hide_complex_name ?? publication.hideComplexName ?? listing.hide_complex_name ?? listing.hideComplexName, true),
    hideUnitNo: requestedVisibility ? !showExactAddress : normalizeBoolean(options.hideUnitNo ?? publication.hide_unit_no ?? publication.hideUnitNo ?? listing.hide_unit_no ?? listing.hideUnitNo, true),
    visibility,
  }
}

function addAttribute(attributes, attributeType, value) {
  const text = normalizePrivatePropertyText(value)
  if (!text) return
  attributes.push({ attributeType, value: text })
}

function yesNo(value, fallback = '') {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value === null || value === undefined || normalizePrivatePropertyText(value) === '') return fallback
  return normalizeBoolean(value, false) ? 'Yes' : 'No'
}

// Agency Feed Service Rev 4.7, Appendix A. Spellings are feed identifiers.
export const PRIVATE_PROPERTY_FEATURE_ATTRIBUTES = Object.freeze({
  en_suite: 'EnSuite', lounges: 'Lounges', dining_areas: 'DiningAreas',
  carports: 'Carports', storeys: 'Storeys', roof_type: 'RoofType', finishes: 'Finishes',
  study: 'Study', staff_quarters: 'StaffQuarters', pool: 'Pool', flatlet: 'Flatlet',
  water_included: 'WaterIncluded', electricity_included: 'ElectrictyIncluded',
  satellite: 'Satelite', tv: 'TV', air_conditioning: 'Aircon', alarm: 'Alarm',
  scenic_view: 'ScenicView', sea_view: 'SeaView', walk_in_closet: 'WalkInCloset',
  built_in_cupboards: 'BuiltInCupboards', wheelchair_accessible: 'HandicapAvailable',
  balcony: 'Balcony', deck: 'Deck', access_gate: 'AccessGate',
  security_post: 'SecurityPost', tennis_court: 'TennisCourt', squash_court: 'SquashCourt',
  clubhouse: 'Clubhouse', gym: 'Gym', golf: 'Golf', jacuzzi: 'Jacuzzi',
  patio: 'Patio', storage: 'Storage', fence: 'Fence', laundry: 'Laundry',
  kitchen: 'Kitchen', lapa: 'Lapa', electric_fence: 'Electric Fencing',
  built_in_braai: 'Built-in-Braai', fireplace: 'Fireplace',
  garden_cottage: 'Garden Cottage', jetty_berth: 'Jetty Berth',
  scullery: 'Scullery', pantry: 'Pantry', guest_toilet: 'Guest Toilet',
  entrance_hall: 'Entrance hall', borehole: 'Borehole',
  irrigation_system: 'Irrigation System', paving: 'Paving',
  intercom: 'Intercom', family_tv_room: 'Family/TV Room', garden: 'Garden',
  pet_friendly: 'PetsAllowed',
})

export function supportsPrivatePropertyFeature(key, category) {
  if (key === 'borehole') return category === 'Farms'
  if (['roof_type', 'finishes', 'garden'].includes(key)) return category === 'Residential'
  return category === 'Residential' || category === 'Farms'
}

function resolveHomeType(value = '') {
  const key = normalizePrivatePropertyListingKey(value)
  const map = {
    apartment: 'Apartment',
    flat: 'Flat',
    sectional_title: 'Apartment',
    townhouse: 'Townhouse',
    town_house: 'Townhouse',
    duplex: 'Duplex',
    cluster: 'Cluster',
    simplex: 'Simplex',
    bachelor: 'Bachelor Apartment',
    bachelor_apartment: 'Bachelor Apartment',
    studio: 'Studio Apartment',
    studio_apartment: 'Studio Apartment',
    penthouse: 'Penthouse',
    loft: 'Loft',
    duet: 'Duet',
    garden_cottage: 'Garden Cottage',
    house: 'House',
    freehold: 'House',
  }
  return map[key] || firstText(value, 'House')
}

function resolveBusinessType(value = '') {
  const key = normalizePrivatePropertyListingKey(value)
  const map = {
    office: 'Offices',
    offices: 'Offices',
    commercial: 'Commercial',
    industrial: 'Industrial',
    retail: 'Retail',
    shop: 'Retail',
    hotel: 'Hotel',
    bed_and_breakfast: 'Bed And Breakfast',
  }
  return map[key] || 'Commercial'
}

function resolveLandType(value = '', category = 'Land') {
  const key = normalizePrivatePropertyListingKey(value)
  if (key === 'commercial_land' || category === 'Commercial') return 'Commercial Land'
  return key === 'land' ? 'Land' : 'Residential Land'
}

function resolveFarmType(value = '') {
  const key = normalizePrivatePropertyListingKey(value)
  const map = {
    small_holding: 'Small Holding',
    farm_with_house: 'Farm with house',
    farm_land: 'Farm Land',
    agricultural_holding: 'Agricultural Holding',
    commercial_farm: 'Commercial Farm',
    game_farm: 'Game Farm',
    farm: 'Farm',
  }
  return map[key] || 'Farm'
}

function parseJsonArray(value) {
  const text = normalizePrivatePropertyText(value)
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeShowdayEvents(value = []) {
  const source = Array.isArray(value) ? value : parseJsonArray(value)
  return source
    .map((event) => {
      if (!event || typeof event !== 'object') return null
      const startDate = normalizeDateTime(firstText(event.startDate, event.start_date, event.StartDate))
      const endDate = normalizeDateTime(firstText(event.endDate, event.end_date, event.EndDate))
      if (!startDate || !endDate) return null
      return {
        startDate,
        endDate,
        description: firstText(event.description, event.Description, 'Show day'),
        active: event.active === undefined || event.active === null ? true : normalizeBoolean(event.active, true),
      }
    })
    .filter(Boolean)
}

function buildAttributes({ listing = {}, publication = {}, category = 'Residential', options = {} } = {}) {
  const attributes = []
  const propertyType = firstText(publication.property_type, publication.propertyType, listing.property_type, listing.propertyType)
  const features = normalizeListingPortalFeatures({ listing, publication })
  const specialistFacts = resolveSpecialistFacts(listing, publication, options)
  const specialistCategory = resolvePrivatePropertySpecialistCategory(listing, publication, options)

  if (['Residential', 'Farms', 'Commercial'].includes(category)) {
    addAttribute(attributes, 'Bedrooms', features.bedrooms)
    addAttribute(attributes, 'Bathrooms', features.bathrooms)
  }
  if (category === 'Residential' || category === 'Farms') {
    addAttribute(attributes, 'HomeType', resolveHomeType(propertyType))
  }

  if (category === 'Commercial') {
    addAttribute(attributes, 'BusinessType', resolveBusinessType(propertyType))
  }

  if (category === 'Land') {
    addAttribute(attributes, 'LandType', resolveLandType(propertyType, category))
  }

  if (category === 'Farms') {
    addAttribute(attributes, 'FarmType', resolveFarmType(propertyType))
    addAttribute(attributes, 'FarmName', resolveFarmName(listing, publication, options))
  }

  addAttribute(attributes, 'FloorArea', firstNumber(
    publication.floor_size,
    publication.floorSize,
    listing.floor_size,
    listing.floorSize,
    listing.propertyDetails?.floorSize,
    specialistCategory === 'commercial' ? specialistFacts.grossLettableArea : null,
    specialistCategory === 'industrial' ? specialistFacts.warehouseOrFactoryArea : null,
  ))
  addAttribute(attributes, 'LandArea', firstNumber(
    publication.erf_size,
    publication.erfSize,
    publication.land_size,
    publication.landSize,
    listing.erf_size,
    listing.erfSize,
    listing.propertyDetails?.erfSize,
    specialistCategory === 'industrial' ? specialistFacts.yardSize : null,
    specialistCategory === 'agricultural' ? specialistFacts.farmSize : null,
    specialistCategory === 'land' ? specialistFacts.erfSize : null,
  ))
  if (category === 'Residential' || category === 'Farms') addAttribute(attributes, 'Garages', features.garages)
  if (category === 'Residential' || category === 'Commercial') addAttribute(attributes, 'Parking', firstNumber(features.parkingBays, specialistCategory === 'commercial' ? specialistFacts.parking : null))
  addAttribute(attributes, 'Rates', firstNumber(publication.rates_taxes, publication.ratesTaxes, listing.rates_taxes, listing.ratesTaxes))
  addAttribute(attributes, 'Levies', firstNumber(publication.levies, listing.levies))
  if (category === 'Residential' || category === 'Farms') {
    addAttribute(attributes, 'Furnished', yesNo(publication.furnished ?? publication.furnishedStatus ?? listing.furnished ?? listing.furnishedStatus))
    for (const [key, attribute] of Object.entries(PRIVATE_PROPERTY_FEATURE_ATTRIBUTES)) {
      if (!supportsPrivatePropertyFeature(key, category)) continue
      // P24 captures a count of studies; PP's Rev 4.7 Study attribute is
      // Yes/No. Derive presence only when the agent has not answered Study.
      const value = key === 'study' && features.featureFacts.study == null && Number.isFinite(features.featureFacts.studies)
        ? features.featureFacts.studies > 0
        : features.featureFacts[key]
      if (value !== null && value !== undefined) {
        addAttribute(attributes, attribute, typeof value === 'boolean' ? yesNo(value) : value)
      } else {
        const legacy = { flatlet: features.flatlet, staff_quarters: features.staffQuarters, pool: features.pool, garden: features.garden, pet_friendly: features.petFriendly }[key]
        if (legacy !== undefined) addAttribute(attributes, attribute, yesNo(legacy))
      }
    }
  }

  return attributes
}

function validateDescription(description = '') {
  const blockers = []
  if (/https?:\/\/|www\./i.test(description)) blockers.push('illegal_description_web_address')
  if (/(?:\+?\d[\s().-]*){9,}/.test(description)) blockers.push('illegal_description_phone_number')
  return blockers
}

export function buildPrivatePropertyListingXml(plan = {}) {
  const payload = plan.payload
  if (!payload) return ''
  const categoryXml = payload.categories.map((category) => `<Category>${escapePrivatePropertyXml(category)}</Category>`).join('')
  const photoUrlsXml = payload.photoUrls === null
    ? '<PhotoUrls xsi:nil="true" />'
    : `<PhotoUrls>${payload.photoUrls.map((url) => `<string>${escapePrivatePropertyXml(url)}</string>`).join('')}</PhotoUrls>`
  const rentalPriceTypeXml = payload.rentalPriceType
    ? `<RentalPriceType>${escapePrivatePropertyXml(payload.rentalPriceType)}</RentalPriceType>`
    : ''
  const attributesXml = payload.attributes.map((attribute) => [
    '<Attribute>',
    `<AttributeType>${escapePrivatePropertyXml(attribute.attributeType)}</AttributeType>`,
    `<Value>${escapePrivatePropertyXml(attribute.value)}</Value>`,
    '</Attribute>',
  ].join('')).join('')
  const showdayXml = payload.showdayEvents.length
    ? `<ShowdayEvents>${payload.showdayEvents.map((event) => [
        '<ShowdayEvent>',
        `<PropertyId>${escapePrivatePropertyXml(payload.propertyId)}</PropertyId>`,
        `<StartDate>${escapePrivatePropertyXml(event.startDate)}</StartDate>`,
        `<EndDate>${escapePrivatePropertyXml(event.endDate)}</EndDate>`,
        `<Description>${escapePrivatePropertyXml(event.description)}</Description>`,
        `<Active>${event.active ? 'true' : 'false'}</Active>`,
        '</ShowdayEvent>',
      ].join('')).join('')}</ShowdayEvents>`
    : '<ShowdayEvents />'

  return [
    '<ListingImport>',
    `<PropertyId>${escapePrivatePropertyXml(payload.propertyId)}</PropertyId>`,
    `<BranchId>${escapePrivatePropertyXml(payload.branchId)}</BranchId>`,
    `<Category>${categoryXml}</Category>`,
    `<MandateType>${escapePrivatePropertyXml(payload.mandateType)}</MandateType>`,
    `<StreetName>${escapePrivatePropertyXml(payload.address.streetName)}</StreetName>`,
    `<StreetNumber>${escapePrivatePropertyXml(payload.address.streetNumber)}</StreetNumber>`,
    `<ComplexName>${escapePrivatePropertyXml(payload.address.complexName)}</ComplexName>`,
    `<UnitNumber>${escapePrivatePropertyXml(payload.address.unitNumber)}</UnitNumber>`,
    `<Suburb>${payload.address.suburbId ? '' : escapePrivatePropertyXml(payload.address.suburb)}</Suburb>`,
    payload.address.suburbId ? `<SuburbId>${payload.address.suburbId}</SuburbId>` : '<SuburbId xsi:nil="true" />',
    `<Town>${payload.address.suburbId ? '' : escapePrivatePropertyXml(payload.address.town)}</Town>`,
    payload.address.suburbId ? '<Province xsi:nil="true" />' : `<Province>${escapePrivatePropertyXml(payload.address.province)}</Province>`,
    `<Headline>${escapePrivatePropertyXml(payload.headline)}</Headline>`,
    `<Description><![CDATA[${payload.description.replaceAll(']]>', ']]]]><![CDATA[>')}]]></Description>`,
    `<Price>${payload.price}</Price>`,
    `<Deposit>${payload.deposit || 0}</Deposit>`,
    rentalPriceTypeXml,
    `<ListingDate>${escapePrivatePropertyXml(toPrivatePropertyDateTime(payload.listingDate))}</ListingDate>`,
    `<ExpiryDate>${escapePrivatePropertyXml(toPrivatePropertyDateTime(payload.expiryDate))}</ExpiryDate>`,
    `<AvailableFrom>${escapePrivatePropertyXml(toPrivatePropertyDateTime(payload.availableFrom))}</AvailableFrom>`,
    `<AgentId>${escapePrivatePropertyXml(payload.agentIds.join(','))}</AgentId>`,
    photoUrlsXml,
    `<OwnerID>${escapePrivatePropertyXml(payload.ownerId)}</OwnerID>`,
    `<XCoordinate>${payload.xCoordinate ?? 0}</XCoordinate>`,
    `<YCoordinate>${payload.yCoordinate ?? 0}</YCoordinate>`,
    `<ListingType>${escapePrivatePropertyXml(payload.listingType)}</ListingType>`,
    `<PropertyStatus>${escapePrivatePropertyXml(payload.propertyStatus)}</PropertyStatus>`,
    showdayXml,
    `<Attributes>${attributesXml}</Attributes>`,
    `<HideStreetName>${payload.address.hideStreetName ? 'true' : 'false'}</HideStreetName>`,
    `<HideStreetNo>${payload.address.hideStreetNo ? 'true' : 'false'}</HideStreetNo>`,
    `<HideComplexName>${payload.address.hideComplexName ? 'true' : 'false'}</HideComplexName>`,
    `<HideUnitNumber>${payload.address.hideUnitNo ? 'true' : 'false'}</HideUnitNumber>`,
    payload.soleMandateExclusiveDays ? `<SoleMandateExclusiveDays>${payload.soleMandateExclusiveDays}</SoleMandateExclusiveDays>` : '<SoleMandateExclusiveDays xsi:nil="true" />',
    '</ListingImport>',
  ].join('')
}

export function createPrivatePropertyListingPlan({
  listing = {},
  publication = {},
  media = [],
  agentMapping = {},
  existingSync = {},
  options = {},
} = {}) {
  const listingType = resolvePrivatePropertyListingType(firstText(options.listingType, publication.listing_type, publication.listingType, listing.listing_type, listing.listingType))
  const category = resolvePrivatePropertyCategory(firstText(
    options.category,
    publication.category,
    publication.property_category,
    publication.propertyCategory,
    listing.category,
    listing.property_category,
    listing.propertyCategory,
    publication.property_type,
    publication.propertyType,
    listing.property_type,
    listing.propertyType,
  ))
  const mandateType = resolvePrivatePropertyMandateType({
    listingType,
    category,
    value: firstText(options.mandateType, publication.mandate_type, publication.mandateType, listing.mandate_type, listing.mandateType),
    auction: normalizeBoolean(options.auction ?? publication.auction ?? listing.auction, false) ||
      hasFeature(publication, ['on_auction', 'auction']) ||
      hasFeature(listing, ['on_auction', 'auction']),
  })
  const propertyStatus = resolvePrivatePropertyStatus({
    listingType,
    value: firstText(options.status, publication.status, listing.listing_status, listing.listingStatus),
  })
  const branchId = firstText(options.branchGuid, options.branchId, existingSync.branch_guid, existingSync.branchGuid, listing.private_property_branch_guid, listing.privatePropertyBranchGuid)
  const propertyId = resolvePropertyId(listing, publication, options)
  const agentIds = resolveAgentIds(agentMapping, listing, options)
  const price = resolvePrice(listing, publication, options)
  const deposit = listingType === 'Rental'
    ? firstNumber(options.deposit, publication.deposit, listing.deposit) ?? 0
    : firstNumber(options.deposit, publication.deposit, listing.deposit) ?? 0
  const rentalPriceType = resolvePrivatePropertyRentalPriceType(
    firstText(options.rentalPriceType, publication.rental_price_type, publication.rentalPriceType, listing.rental_price_type, listing.rentalPriceType),
    { listingType, category },
  )
  const specialistFacts = resolveSpecialistFacts(listing, publication, options)
  const specialistCategory = resolvePrivatePropertySpecialistCategory(listing, publication, options)
  const description = appendSpecialistDescription(resolveDescription(listing, publication, category), specialistFacts, specialistCategory)
  const headline = resolveHeadline(listing, publication)
  const listingDate = resolveListingDate(listing, publication, options)
  const availableFrom = resolveAvailableFrom(listing, publication, options) || listingDate
  const expiryDate = toDateOnly(firstText(options.expiryDate, publication.expiry_date, publication.expiryDate, listing.expiry_date, listing.expiryDate)) || addDaysToDateOnly(listingDate, 180)
  const address = resolveAddress(listing, publication, options)
  const attributes = buildAttributes({ listing, publication, category, options })
  const mediaRows = normalizeMediaRows(media)
  const imageRows = mediaRows.filter((item) => item.mediaType === 'image')
  const includePhotos = options.photosChanged !== false
  const photoUrls = includePhotos ? imageRows.map((item) => item.sourceUrl).slice(0, 256) : null
  const soleMandateExclusiveDays = toPositiveInteger(options.soleMandateExclusiveDays ?? publication.sole_mandate_exclusive_days ?? publication.soleMandateExclusiveDays ?? listing.sole_mandate_exclusive_days ?? listing.soleMandateExclusiveDays)

  const dataBlockers = []
  const technicalBlockers = []

  if (!branchId) dataBlockers.push('missing_private_property_branch_guid')
  if (!propertyId) dataBlockers.push('missing_property_id')
  if (!agentIds.length) dataBlockers.push('missing_private_property_agent_id')
  if (!description) dataBlockers.push('missing_description')
  if (price === null || price <= 0) dataBlockers.push('missing_or_invalid_price')
  if (!listingDate) dataBlockers.push('missing_listing_date')
  if (!address.streetName) dataBlockers.push('missing_street_name')
  if (!address.streetNumber) dataBlockers.push('missing_street_number')
  if (!address.suburbId && !address.suburb) dataBlockers.push('missing_suburb_or_suburb_id')
  if (!address.suburbId && !address.town) dataBlockers.push('missing_town_without_suburb_id')
  if (!address.suburbId && !address.province) dataBlockers.push('missing_province_without_suburb_id')
  if (includePhotos && imageRows.length < 3) dataBlockers.push('minimum_three_listing_image_urls_required')
  if (category === 'Residential') {
    if (!attributes.some((item) => item.attributeType === 'Bedrooms')) dataBlockers.push('missing_bedrooms_attribute')
    if (!attributes.some((item) => item.attributeType === 'Bathrooms')) dataBlockers.push('missing_bathrooms_attribute')
    if (!attributes.some((item) => item.attributeType === 'HomeType')) dataBlockers.push('missing_home_type_attribute')
  }
  if (category === 'Land' && !attributes.some((item) => item.attributeType === 'LandArea')) dataBlockers.push('missing_land_area_attribute')
  if (category === 'Commercial' && !attributes.some((item) => item.attributeType === 'BusinessType')) dataBlockers.push('missing_business_type_attribute')
  if (category === 'Farms' && !attributes.some((item) => item.attributeType === 'FarmType')) dataBlockers.push('missing_farm_type_attribute')
  if (soleMandateExclusiveDays && (listingType !== 'Sale' || mandateType !== 'FullMandate')) dataBlockers.push('exclusive_days_requires_sale_full_mandate')
  if (soleMandateExclusiveDays && (soleMandateExclusiveDays < 1 || soleMandateExclusiveDays > 92)) dataBlockers.push('exclusive_days_must_be_between_1_and_92')
  dataBlockers.push(...validateDescription(description))

  const payload = {
    propertyId,
    branchId,
    categories: [category],
    category,
    mandateType,
    listingType,
    propertyStatus,
    address,
    headline,
    description,
    price: price ?? 0,
    deposit,
    listingDate,
    expiryDate,
    availableFrom,
    agentIds,
    photoUrls,
    ownerId: firstText(options.ownerId, publication.owner_id, publication.ownerId, listing.owner_id, listing.ownerId),
    xCoordinate: firstNumber(options.xCoordinate, publication.x_coordinate, publication.xCoordinate, listing.x_coordinate, listing.xCoordinate),
    yCoordinate: firstNumber(options.yCoordinate, publication.y_coordinate, publication.yCoordinate, listing.y_coordinate, listing.yCoordinate),
    attributes,
    specialistFacts,
    specialistCategory: specialistCategory || null,
    rentalPriceType,
    showdayEvents: normalizeShowdayEvents(firstText(options.showdayEvents) ? options.showdayEvents : publication.showday_events || publication.showdayEvents || listing.showday_events || listing.showdayEvents || []),
    soleMandateExclusiveDays,
  }

  const canPreview = dataBlockers.length === 0 && technicalBlockers.length === 0
  const listingXml = canPreview ? buildPrivatePropertyListingXml({ payload }) : ''

  return {
    canPreview,
    canSubmit: false,
    dataBlockers,
    technicalBlockers,
    summary: {
      propertyId,
      branchId,
      agentIds,
      listingType,
      category,
      mandateType,
      propertyStatus,
      rentalPriceType,
      price: price ?? 0,
      listingDate,
      suburbId: address.suburbId || null,
      imageUrlCount: imageRows.length,
      photoUrlPayloadCount: photoUrls ? photoUrls.length : null,
      attributeCount: attributes.length,
      specialistCategory: specialistCategory || null,
      soleMandateExclusiveDays: soleMandateExclusiveDays || null,
      descriptionPresent: Boolean(description),
      addressFingerprint: buildListingAddressFingerprint({ listing, publication }),
    },
    payload,
    listingXml,
  }
}
