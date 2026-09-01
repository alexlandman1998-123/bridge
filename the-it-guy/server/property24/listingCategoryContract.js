export const PROPERTY24_LISTING_CATEGORY_CONTRACT_VERSION = 'arch9_property24_listing_category_contract_v1'

export const PROPERTY24_LISTING_CATEGORIES = Object.freeze({
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
  AGRICULTURAL: 'agricultural',
  LAND_DEVELOPMENT: 'land_development',
  UNKNOWN: 'unknown',
})

const CATEGORY_ALIASES = Object.freeze({
  [PROPERTY24_LISTING_CATEGORIES.RESIDENTIAL]: [
    'residential', 'private_sale', 'private_rental', 'sale', 'rental',
    'residential_sale', 'residential_rental', 'house', 'home', 'apartment',
    'flat', 'townhouse', 'cluster', 'duplex',
  ],
  [PROPERTY24_LISTING_CATEGORIES.COMMERCIAL]: [
    'commercial', 'commercial_property', 'office', 'retail', 'shop', 'business',
  ],
  [PROPERTY24_LISTING_CATEGORIES.INDUSTRIAL]: [
    'industrial', 'industrial_property', 'warehouse', 'factory', 'distribution',
  ],
  [PROPERTY24_LISTING_CATEGORIES.AGRICULTURAL]: [
    'agricultural', 'agriculture', 'farm', 'smallholding', 'small_holding',
    'agricultural_holding',
  ],
  [PROPERTY24_LISTING_CATEGORIES.LAND_DEVELOPMENT]: [
    'land_development', 'development', 'land', 'vacant_land', 'plot', 'stand',
  ],
})

export const PROPERTY24_LISTING_CATEGORY_FIELD_MATRIX = Object.freeze({
  [PROPERTY24_LISTING_CATEGORIES.RESIDENTIAL]: {
    publishingStatus: 'supported',
    transactionTypes: ['Sale', 'Rental'],
    verifiedProperty24Fields: [
      'agencyId', 'contactAgentIds', 'listingType', 'status', 'price', 'expiryDate',
      'description', 'photos', 'propertyInfo.suburbId', 'propertyInfo.propertyTypeId',
      'propertyFeatures',
    ],
    recommendedFields: ['descriptionHeader', 'propertyInfo.floorArea', 'propertyInfo.streetName', 'bedrooms', 'bathrooms'],
    requiredArch9FieldsBeforePublish: [],
  },
  [PROPERTY24_LISTING_CATEGORIES.COMMERCIAL]: {
    publishingStatus: 'blocked_pending_property24_contract',
    transactionTypes: ['Sale', 'Rental'],
    verifiedProperty24Fields: [],
    requiredArch9FieldsBeforePublish: ['grossLettableArea', 'zoning', 'parking', 'leaseTermsOrSaleTerms'],
  },
  [PROPERTY24_LISTING_CATEGORIES.INDUSTRIAL]: {
    publishingStatus: 'blocked_pending_property24_contract',
    transactionTypes: ['Sale', 'Rental'],
    verifiedProperty24Fields: [],
    requiredArch9FieldsBeforePublish: ['warehouseOrFactoryArea', 'yardSize', 'powerSupply', 'loadingAccess'],
  },
  [PROPERTY24_LISTING_CATEGORIES.AGRICULTURAL]: {
    publishingStatus: 'blocked_pending_property24_contract',
    transactionTypes: ['Sale', 'Rental'],
    verifiedProperty24Fields: [],
    requiredArch9FieldsBeforePublish: ['farmSize', 'waterSupplyOrRights', 'agriculturalUse'],
  },
  [PROPERTY24_LISTING_CATEGORIES.LAND_DEVELOPMENT]: {
    publishingStatus: 'blocked_pending_property24_contract',
    transactionTypes: ['Sale'],
    verifiedProperty24Fields: [],
    requiredArch9FieldsBeforePublish: ['erfSize', 'zoning', 'developmentRights'],
  },
  [PROPERTY24_LISTING_CATEGORIES.UNKNOWN]: {
    publishingStatus: 'blocked_pending_category_classification',
    transactionTypes: [],
    verifiedProperty24Fields: [],
    requiredArch9FieldsBeforePublish: [],
  },
})

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

export function resolveProperty24ListingCategory(listing = {}, publication = {}) {
  const groups = [
    [
    listing.property_category, listing.propertyCategory,
    publication.property_category, publication.propertyCategory,
    ],
    [
      listing.property_type, listing.propertyType,
      publication.property_type, publication.propertyType,
    ],
    [
    listing.listing_category, listing.listingCategory,
    publication.listing_category, publication.listingCategory,
    ],
  ]

  for (const group of groups) {
    const values = group.map(key).filter(Boolean)
    for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
      if (values.some((value) => aliases.includes(value))) return category
    }
  }
  return PROPERTY24_LISTING_CATEGORIES.UNKNOWN
}

export function getProperty24ListingCategoryContract(category) {
  return PROPERTY24_LISTING_CATEGORY_FIELD_MATRIX[category] || PROPERTY24_LISTING_CATEGORY_FIELD_MATRIX[PROPERTY24_LISTING_CATEGORIES.UNKNOWN]
}

export function evaluateProperty24ListingCategoryContract({ listing = {}, publication = {}, listingType = '' } = {}) {
  const category = resolveProperty24ListingCategory(listing, publication)
  const contract = getProperty24ListingCategoryContract(category)
  const normalizedListingType = firstText(listingType)
  const blockers = []

  if (contract.publishingStatus !== 'supported') {
    blockers.push(category === PROPERTY24_LISTING_CATEGORIES.UNKNOWN
      ? 'property24_listing_category_unclassified'
      : `property24_${category}_mapping_not_verified`)
  }
  if (normalizedListingType && contract.transactionTypes.length && !contract.transactionTypes.includes(normalizedListingType)) {
    blockers.push(`property24_${category}_${key(normalizedListingType)}_not_supported`)
  }

  return {
    version: PROPERTY24_LISTING_CATEGORY_CONTRACT_VERSION,
    category,
    listingType: normalizedListingType || null,
    publishingStatus: contract.publishingStatus,
    verifiedProperty24Fields: contract.verifiedProperty24Fields,
    recommendedFields: contract.recommendedFields || [],
    requiredArch9FieldsBeforePublish: contract.requiredArch9FieldsBeforePublish,
    blockers,
  }
}
