import {
  PROPERTY24_LISTING_CATEGORIES,
  resolveProperty24ListingCategory,
} from './listingCategoryContract.js'

export const PROPERTY24_LISTING_CATEGORY_MODEL_VERSION = 'arch9_property24_listing_category_model_v1'

const SALE_LIFECYCLE = Object.freeze(['NewListing', 'Active', 'Pending', 'Sold', 'Withdrawn', 'Expired', 'Cancelled', 'BackOnMarket'])
const RENTAL_LIFECYCLE = Object.freeze(['NewListing', 'Active', 'Pending', 'Rented', 'Withdrawn', 'Expired', 'Cancelled', 'BackOnMarket'])

export const PROPERTY24_LISTING_CATEGORY_MODELS = Object.freeze({
  [PROPERTY24_LISTING_CATEGORIES.RESIDENTIAL]: {
    property24TypeIds: [4, 5, 6],
    transactionTypes: ['Sale', 'Rental'],
    pricingModes: { Sale: ['fixed_price', 'poa'], Rental: ['rental_rate'] },
    lifecycle: { Sale: SALE_LIFECYCLE, Rental: RENTAL_LIFECYCLE },
    requiredMeasurements: { 4: ['floorSize'], 5: ['floorSize'], 6: ['floorSize'] },
    supportedFeatures: ['bedrooms', 'bathrooms', 'garages', 'openParking', 'garden', 'pool', 'flatlet', 'petsAllowed', 'furnishedStatus'],
    payloadModel: 'residential_v1',
  },
  [PROPERTY24_LISTING_CATEGORIES.COMMERCIAL]: {
    property24TypeIds: [11],
    transactionTypes: ['Sale', 'Rental'],
    pricingModes: { Sale: ['fixed_price', 'poa'], Rental: ['rental_rate'] },
    lifecycle: { Sale: SALE_LIFECYCLE, Rental: RENTAL_LIFECYCLE },
    requiredMeasurements: { 11: ['grossLettableArea'] },
    supportedFeatures: ['zoning', 'parking', 'leaseTermsOrSaleTerms'],
    payloadModel: 'commercial_pending_property24_schema',
  },
  [PROPERTY24_LISTING_CATEGORIES.INDUSTRIAL]: {
    property24TypeIds: [12],
    transactionTypes: ['Sale', 'Rental'],
    pricingModes: { Sale: ['fixed_price', 'poa'], Rental: ['rental_rate'] },
    lifecycle: { Sale: SALE_LIFECYCLE, Rental: RENTAL_LIFECYCLE },
    requiredMeasurements: { 12: ['warehouseOrFactoryArea', 'yardSize'] },
    supportedFeatures: ['powerSupply', 'loadingAccess'],
    payloadModel: 'industrial_pending_property24_schema',
  },
  [PROPERTY24_LISTING_CATEGORIES.AGRICULTURAL]: {
    property24TypeIds: [10],
    transactionTypes: ['Sale', 'Rental'],
    pricingModes: { Sale: ['fixed_price', 'poa'], Rental: ['rental_rate'] },
    lifecycle: { Sale: SALE_LIFECYCLE, Rental: RENTAL_LIFECYCLE },
    requiredMeasurements: { 10: ['farmSize'] },
    supportedFeatures: ['waterSupplyOrRights', 'agriculturalUse'],
    payloadModel: 'agricultural_pending_property24_schema',
  },
  [PROPERTY24_LISTING_CATEGORIES.LAND_DEVELOPMENT]: {
    property24TypeIds: [8],
    transactionTypes: ['Sale'],
    pricingModes: { Sale: ['fixed_price', 'poa'] },
    lifecycle: { Sale: SALE_LIFECYCLE },
    requiredMeasurements: { 8: ['erfSize'] },
    supportedFeatures: ['zoning', 'developmentRights'],
    payloadModel: 'land_development_pending_property24_schema',
  },
  [PROPERTY24_LISTING_CATEGORIES.UNKNOWN]: {
    property24TypeIds: [],
    transactionTypes: [],
    pricingModes: {},
    lifecycle: {},
    requiredMeasurements: {},
    supportedFeatures: [],
    payloadModel: 'unclassified',
  },
})

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function integer(value) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export function getProperty24ListingCategoryModel(category) {
  return PROPERTY24_LISTING_CATEGORY_MODELS[category] || PROPERTY24_LISTING_CATEGORY_MODELS[PROPERTY24_LISTING_CATEGORIES.UNKNOWN]
}

export function evaluateProperty24ListingCategoryModel({
  listing = {},
  publication = {},
  category = '',
  listingType = '',
  status = '',
  propertyTypeId = null,
  isPOA = false,
} = {}) {
  const resolvedCategory = category || resolveProperty24ListingCategory(listing, publication)
  const model = getProperty24ListingCategoryModel(resolvedCategory)
  const normalizedListingType = text(listingType)
  const normalizedStatus = text(status)
  const normalizedPropertyTypeId = integer(propertyTypeId)
  const blockers = []

  if (normalizedListingType && model.transactionTypes.length && !model.transactionTypes.includes(normalizedListingType)) {
    blockers.push(`property24_${resolvedCategory}_${key(normalizedListingType)}_not_supported`)
  }
  if (normalizedPropertyTypeId && model.property24TypeIds.length && !model.property24TypeIds.includes(normalizedPropertyTypeId)) {
    blockers.push(`property24_${resolvedCategory}_property_type_mismatch`)
  }
  if (normalizedStatus && normalizedListingType && model.lifecycle[normalizedListingType] && !model.lifecycle[normalizedListingType].includes(normalizedStatus)) {
    blockers.push(`property24_${key(normalizedListingType)}_status_${key(normalizedStatus)}_not_allowed`)
  }

  const pricingMode = isPOA ? 'poa' : normalizedListingType === 'Rental' ? 'rental_rate' : 'fixed_price'
  const allowedPricingModes = model.pricingModes[normalizedListingType] || []
  if (pricingMode && allowedPricingModes.length && !allowedPricingModes.includes(pricingMode)) {
    blockers.push(`property24_${resolvedCategory}_${pricingMode}_not_supported`)
  }

  return {
    version: PROPERTY24_LISTING_CATEGORY_MODEL_VERSION,
    category: resolvedCategory,
    payloadModel: model.payloadModel,
    property24TypeIds: model.property24TypeIds,
    listingType: normalizedListingType || null,
    status: normalizedStatus || null,
    pricingMode,
    allowedLifecycle: model.lifecycle[normalizedListingType] || [],
    requiredMeasurements: normalizedPropertyTypeId ? model.requiredMeasurements[normalizedPropertyTypeId] || [] : [],
    supportedFeatures: model.supportedFeatures,
    blockers,
  }
}
