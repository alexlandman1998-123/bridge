import {
  escapePrivatePropertyXml,
  normalizePrivatePropertyText,
} from './privatePropertyClient.js'

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
  if (['commercial', 'commercial_property', 'office', 'offices', 'retail', 'industrial', 'warehouse', 'factory', 'shop'].includes(key)) return 'Commercial'
  if (['farm', 'farms', 'smallholding', 'small_holding', 'farm_with_house', 'farm_land', 'agricultural_holding', 'commercial_farm', 'game_farm'].includes(key)) return 'Farms'
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

function resolveDescription(listing = {}, publication = {}) {
  return firstText(
    publication.description,
    publication.public_description,
    listing.listing_preview_description,
    listing.listingPreviewDescription,
    listing.description,
  )
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

function resolveAvailableFrom(listing = {}, publication = {}, options = {}) {
  return toDateOnly(firstText(options.availableFrom, publication.available_from, publication.availableFrom, listing.available_from, listing.availableFrom))
}

function resolveAddress(listing = {}, publication = {}, options = {}) {
  return {
    streetName: firstText(options.streetName, publication.streetName, publication.street_name, listing.streetName, listing.street_name, listing.street_address, listing.address_line_1, listing.addressLine1),
    streetNumber: firstText(options.streetNumber, publication.streetNumber, publication.street_number, listing.streetNumber, listing.street_number),
    complexName: firstText(options.complexName, publication.complexName, publication.complex_name, listing.complexName, listing.complex_name),
    unitNumber: firstText(options.unitNumber, publication.unitNumber, publication.unit_number, listing.unitNumber, listing.unit_number),
    suburb: firstText(options.suburb, publication.suburb, listing.suburb),
    suburbId: toPositiveInteger(firstText(options.suburbId, publication.private_property_suburb_id, publication.privatePropertySuburbId, publication.suburb_id, listing.private_property_suburb_id, listing.privatePropertySuburbId, listing.suburb_id)),
    town: firstText(options.town, publication.town, publication.city, listing.town, listing.city),
    province: resolvePrivatePropertyProvince(firstText(options.province, publication.province, listing.province)),
    hideStreetName: normalizeBoolean(options.hideStreetName ?? publication.hide_street_name ?? publication.hideStreetName ?? listing.hide_street_name ?? listing.hideStreetName, true),
    hideStreetNo: normalizeBoolean(options.hideStreetNo ?? publication.hide_street_no ?? publication.hideStreetNo ?? listing.hide_street_no ?? listing.hideStreetNo, true),
    hideComplexName: normalizeBoolean(options.hideComplexName ?? publication.hide_complex_name ?? publication.hideComplexName ?? listing.hide_complex_name ?? listing.hideComplexName, true),
    hideUnitNo: normalizeBoolean(options.hideUnitNo ?? publication.hide_unit_no ?? publication.hideUnitNo ?? listing.hide_unit_no ?? listing.hideUnitNo, true),
  }
}

function addAttribute(attributes, attributeType, value) {
  const text = normalizePrivatePropertyText(value)
  if (!text) return
  attributes.push({ attributeType, value: text })
}

function yesNo(value, fallback = '') {
  if (value === null || value === undefined || normalizePrivatePropertyText(value) === '') return fallback
  return normalizeBoolean(value, false) ? 'Yes' : 'No'
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

  if (category === 'Residential') {
    addAttribute(attributes, 'Bedrooms', firstNumber(publication.bedrooms, listing.bedrooms, listing.propertyDetails?.bedrooms))
    addAttribute(attributes, 'Bathrooms', firstNumber(publication.bathrooms, listing.bathrooms, listing.propertyDetails?.bathrooms))
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

  addAttribute(attributes, 'FloorArea', firstNumber(publication.floor_size, publication.floorSize, listing.floor_size, listing.floorSize, listing.propertyDetails?.floorSize))
  addAttribute(attributes, 'LandArea', firstNumber(publication.erf_size, publication.erfSize, publication.land_size, publication.landSize, listing.erf_size, listing.erfSize, listing.land_size, listing.landSize, listing.propertyDetails?.erfSize))
  addAttribute(attributes, 'Garages', firstNumber(publication.garages, listing.garages, listing.propertyDetails?.garages))
  addAttribute(attributes, 'Parking', firstNumber(publication.parking_bays, publication.parkingBays, listing.parking_bays, listing.parkingBays))
  addAttribute(attributes, 'Rates', firstNumber(publication.rates_taxes, publication.ratesTaxes, listing.rates_taxes, listing.ratesTaxes))
  addAttribute(attributes, 'Levies', firstNumber(publication.levies, listing.levies))
  addAttribute(attributes, 'Pool', yesNo(publication.pool ?? listing.pool))
  addAttribute(attributes, 'Garden', yesNo(publication.garden ?? listing.garden))
  addAttribute(attributes, 'PetsAllowed', yesNo(publication.pets_allowed ?? publication.petsAllowed ?? listing.pets_allowed ?? listing.petsAllowed))
  addAttribute(attributes, 'Furnished', yesNo(publication.furnished ?? publication.furnishedStatus ?? listing.furnished ?? listing.furnishedStatus))

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
  const category = resolvePrivatePropertyCategory(firstText(options.category, publication.category, publication.property_category, publication.property_type, publication.propertyType, listing.category, listing.property_category, listing.property_type, listing.propertyType))
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
  const description = resolveDescription(listing, publication)
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
      soleMandateExclusiveDays: soleMandateExclusiveDays || null,
      descriptionPresent: Boolean(description),
    },
    payload,
    listingXml,
  }
}
