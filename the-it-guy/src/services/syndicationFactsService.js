export const SYNDICATION_FACTS_VERSION = 'arch9_listing_syndication_facts_v1'

export const SYNDICATION_PRICE_PRESENTATIONS = Object.freeze(['Standard', 'Poa', 'Negotiable', 'OffersFrom'])
export const SYNDICATION_RENTAL_PRICE_PERIODS = Object.freeze(['PerMonth', 'PerWeek', 'PerDay', 'PerM2', 'PerYear'])
export const SYNDICATION_AREA_UNITS = Object.freeze(['SquareMetres', 'SquareFeet', 'Hectares', 'Acres'])

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function number(value) {
  if (value === null || value === undefined || text(value) === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function enumValue(value, allowed, fallback = null) {
  const normalized = key(value)
  const matched = allowed.find((candidate) => key(candidate) === normalized)
  return matched || fallback
}

function purpose(value) {
  return ['rental', 'rent', 'to_rent', 'lease', 'letting'].includes(key(value)) ? 'Rental' : 'Sale'
}

function pricePresentation(value) {
  const normalized = key(value)
  const aliases = {
    standard: 'Standard',
    poa: 'Poa',
    price_on_application: 'Poa',
    negotiable: 'Negotiable',
    offers_from: 'OffersFrom',
    offersfrom: 'OffersFrom',
  }
  return aliases[normalized] || 'Standard'
}

function rentalPricePeriod(value) {
  const normalized = key(value)
  const aliases = {
    per_month: 'PerMonth', monthly: 'PerMonth', month: 'PerMonth', permonth: 'PerMonth',
    per_week: 'PerWeek', weekly: 'PerWeek', week: 'PerWeek', perweek: 'PerWeek',
    per_day: 'PerDay', daily: 'PerDay', day: 'PerDay', perday: 'PerDay',
    per_m2: 'PerM2', perm2: 'PerM2', per_square_metre: 'PerM2', per_square_meter: 'PerM2',
    annual: 'PerYear', annually: 'PerYear', yearly: 'PerYear', year: 'PerYear', per_year: 'PerYear', peryear: 'PerYear',
  }
  return aliases[normalized] || 'PerMonth'
}

function areaUnit(value, fallback = 'SquareMetres') {
  const normalized = key(value)
  const aliases = {
    square_metres: 'SquareMetres', square_meters: 'SquareMetres', sqm: 'SquareMetres', m2: 'SquareMetres',
    square_feet: 'SquareFeet', sqft: 'SquareFeet',
    hectares: 'Hectares', hectare: 'Hectares', ha: 'Hectares',
    acres: 'Acres', acre: 'Acres',
  }
  return aliases[normalized] || fallback
}

function date(value) {
  const raw = text(value)
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function normalizePrivacy(value = {}) {
  const source = object(value)
  return {
    hideStreetName: Boolean(source.hideStreetName ?? source.hide_street_name),
    hideStreetNumber: Boolean(source.hideStreetNumber ?? source.hide_street_number ?? source.hideStreetNo ?? source.hide_street_no),
    hideComplexName: Boolean(source.hideComplexName ?? source.hide_complex_name),
    hideUnitNumber: Boolean(source.hideUnitNumber ?? source.hide_unit_number ?? source.hideUnitNo ?? source.hide_unit_no),
  }
}

function normalizeFeatureValues(value = {}) {
  const source = object(value)
  return Object.fromEntries(
    Object.entries(source)
      .map(([name, featureValue]) => [key(name), featureValue])
      .filter(([name]) => Boolean(name)),
  )
}

export function buildSyndicationFacts({ listing = {}, publication = {}, facts = {} } = {}) {
  const source = object(facts)
  const canonical = object(listing.seller_canonical_facts_json || listing.sellerCanonicalFacts)
  const property = object(canonical.property)
  const rentalInfo = object(canonical.rentalInfo || canonical.rental_info)
  // Phase 3 keeps new listing terms in the established onboarding payload until
  // the facts migration is applied. Read both shapes so adapters have one model.
  const onboarding = object(listing.sellerOnboarding?.formData || listing.seller_onboarding?.form_data)
  const propertyDetails = object(listing.propertyDetails || listing.property_details)
  const listingPurpose = purpose(firstText(source.listingPurpose, source.listing_purpose, propertyDetails.listingType, onboarding.listingType, publication.listing_type, publication.listingType, listing.listing_type, listing.listingType))
  const presentation = pricePresentation(firstText(source.pricePresentation, source.price_presentation, propertyDetails.pricePresentation, onboarding.pricePresentation, publication.price_presentation, publication.pricePresentation, property.pricePresentation))
  const offersFromPrice = number(firstText(source.offersFromPrice, source.offers_from_price, propertyDetails.offersFrom, onboarding.offersFrom, publication.offers_from_price, publication.offersFromPrice, property.offersFrom))
  const featureValues = normalizeFeatureValues(firstText(source.featureValues) ? source.featureValues : source.feature_values || publication.feature_values || publication.featureValues || {})

  return {
    version: SYNDICATION_FACTS_VERSION,
    propertyCategory: firstText(source.propertyCategory, source.property_category, propertyDetails.propertyCategory, onboarding.propertyCategory, listing.property_category, listing.propertyCategory, publication.property_category, publication.propertyCategory) || null,
    propertySubtype: firstText(source.propertySubtype, source.property_subtype, propertyDetails.propertySubtype, onboarding.propertySubtype, listing.property_type, listing.propertyType, publication.property_type, publication.propertyType) || null,
    listingPurpose,
    mandateType: firstText(source.mandateType, source.mandate_type, rentalInfo.rentalMandateType, rentalInfo.rental_mandate_type, listing.mandate_type, listing.mandateType) || null,
    pricePresentation: presentation,
    offersFromPrice: presentation === 'OffersFrom' ? offersFromPrice : null,
    rentalPricePeriod: listingPurpose === 'Rental'
      ? rentalPricePeriod(firstText(source.rentalPricePeriod, source.rental_price_period, rentalInfo.rentalPriceFrequency, rentalInfo.rental_price_frequency, propertyDetails.rentalPricePeriod, onboarding.rentalPricePeriod, publication.rental_price_type, publication.rentalPriceType, listing.rental_price_type, listing.rentalPriceType))
      : null,
    availableFrom: date(firstText(source.availableFrom, source.available_from, propertyDetails.availableFrom, onboarding.availableFrom, publication.available_from, publication.availableFrom, listing.available_from, listing.availableFrom)),
    floorArea: number(firstText(source.floorArea, source.floor_area, propertyDetails.floorSize, onboarding.floorSize, publication.floor_size, publication.floorSize, listing.floor_size, listing.floorSize, property.floorSize)),
    floorAreaUnit: areaUnit(firstText(source.floorAreaUnit, source.floor_area_unit, propertyDetails.floorAreaUnit, onboarding.floorAreaUnit, publication.floor_area_unit, publication.floorAreaUnit), 'SquareMetres'),
    landArea: number(firstText(source.landArea, source.land_area, propertyDetails.erfSize, onboarding.erfSize, publication.erf_size, publication.erfSize, listing.erf_size, listing.erfSize, property.erfSize)),
    landAreaUnit: areaUnit(firstText(source.landAreaUnit, source.land_area_unit, propertyDetails.landAreaUnit, onboarding.landAreaUnit, publication.land_area_unit, publication.landAreaUnit), 'SquareMetres'),
    ratesTaxesAmount: number(firstText(source.ratesTaxesAmount, source.rates_taxes_amount, propertyDetails.ratesTaxes, onboarding.ratesTaxes, publication.rates_taxes, publication.ratesTaxes, listing.rates_taxes, listing.ratesTaxes, property.ratesTaxes)),
    leviesAmount: number(firstText(source.leviesAmount, source.levies_amount, propertyDetails.levies, onboarding.levies, publication.levies, listing.levies, property.levies)),
    addressPrivacy: normalizePrivacy(source.addressPrivacy || source.address_privacy || publication.address_privacy || publication.addressPrivacy || listing.address_privacy || listing.addressPrivacy),
    featureValues,
  }
}

export function buildSyndicationFactsRow(listingId, input = {}) {
  const normalizedListingId = text(listingId)
  if (!normalizedListingId) throw new Error('Listing id is required.')
  const facts = buildSyndicationFacts(input)
  return {
    listing_id: normalizedListingId,
    property_category: facts.propertyCategory,
    property_subtype: facts.propertySubtype,
    listing_purpose: facts.listingPurpose,
    mandate_type: facts.mandateType,
    price_presentation: facts.pricePresentation,
    offers_from_price: facts.offersFromPrice,
    rental_price_period: facts.rentalPricePeriod,
    available_from: facts.availableFrom,
    floor_area: facts.floorArea,
    floor_area_unit: facts.floorAreaUnit,
    land_area: facts.landArea,
    land_area_unit: facts.landAreaUnit,
    rates_taxes_amount: facts.ratesTaxesAmount,
    levies_amount: facts.leviesAmount,
    address_privacy: facts.addressPrivacy,
    feature_values: facts.featureValues,
  }
}

export function buildSyndicationAgentAssignments(listingId, agentIds = []) {
  const normalizedListingId = text(listingId)
  if (!normalizedListingId) throw new Error('Listing id is required.')
  const values = Array.isArray(agentIds) ? agentIds : String(agentIds || '').split(',')
  const uniqueAgentIds = [...new Set(values.map(text).filter(Boolean))]
  return uniqueAgentIds.map((agentId, index) => ({
    listing_id: normalizedListingId,
    agent_id: agentId,
    position: index + 1,
  }))
}

export function mapSyndicationFactsRow(row = {}) {
  return buildSyndicationFacts({
    facts: {
      propertyCategory: row.property_category,
      propertySubtype: row.property_subtype,
      listingPurpose: row.listing_purpose,
      mandateType: row.mandate_type,
      pricePresentation: row.price_presentation,
      offersFromPrice: row.offers_from_price,
      rentalPricePeriod: row.rental_price_period,
      availableFrom: row.available_from,
      floorArea: row.floor_area,
      floorAreaUnit: row.floor_area_unit,
      landArea: row.land_area,
      landAreaUnit: row.land_area_unit,
      ratesTaxesAmount: row.rates_taxes_amount,
      leviesAmount: row.levies_amount,
      addressPrivacy: row.address_privacy,
      featureValues: row.feature_values,
    },
  })
}
