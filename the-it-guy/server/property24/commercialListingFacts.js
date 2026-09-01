import { evaluateProperty24ListingCategoryModel } from './listingCategoryModel.js'
import { evaluateCommercialListingReadiness } from '../../src/modules/commercial/commercialListingReadiness.js'

export const PROPERTY24_COMMERCIAL_LISTING_FACTS_VERSION = 'arch9_property24_commercial_listing_facts_v1'

function text(value = '') {
  return String(value || '').trim()
}

function propertyTypeIdForCategory(category) {
  return ({ commercial: 11, industrial: 12, agricultural: 10, land_development: 8 })[category] || null
}

function listingType(listing = {}) {
  return text(listing.listing_type).toLowerCase() === 'lease' ? 'Rental' : 'Sale'
}

function property24Status(listing = {}) {
  const status = text(listing.listing_status).toLowerCase()
  if (status === 'leased') return 'Rented'
  if (status === 'sold') return 'Sold'
  if (['under_offer', 'under_negotiation', 'heads_of_terms'].includes(status)) return 'Pending'
  if (['archived', 'expired'].includes(status)) return 'Expired'
  return status === 'draft' ? 'NewListing' : 'Active'
}

export function buildCommercialListingCanonicalFacts({ listing = {}, property = {} } = {}) {
  const readiness = evaluateCommercialListingReadiness({ listing, property })
  const { category, facts } = readiness
  const type = listingType(listing)
  const status = property24Status(listing)
  const measurements = {
    grossLettableArea: facts.grossLettableArea,
    officeArea: facts.officeArea,
    warehouseOrFactoryArea: facts.warehouseOrFactoryArea,
    yardSize: facts.yardSize,
    farmSize: facts.farmSize,
    erfSize: facts.erfSize,
  }
  const features = {
    zoning: facts.zoning,
    parking: facts.parking,
    powerSupply: facts.powerSupply,
    loadingAccess: facts.loadingAccess,
    craneCapacity: facts.craneCapacity,
    waterSupplyOrRights: facts.waterSupplyOrRights,
    agriculturalUse: facts.agriculturalUse,
    developmentRights: facts.developmentRights,
    subdivisionStatus: facts.subdivisionStatus,
  }
  const terms = {
    operatingCosts: facts.operatingCosts,
    ratesAndTaxes: facts.ratesAndTaxes,
    leaseTermMonths: facts.leaseTermMonths,
    depositAmount: facts.depositAmount,
    utilityPolicy: facts.utilityPolicy,
  }
  const categoryModel = evaluateProperty24ListingCategoryModel({
    category,
    listingType: type,
    status,
    propertyTypeId: propertyTypeIdForCategory(category),
  })
  const fieldValues = { ...measurements, ...features }
  const missingMeasurements = categoryModel.requiredMeasurements.filter((field) => !fieldValues[field])
  const missingCategoryFacts = Array.from(new Set([...readiness.missingFacts, ...missingMeasurements]))

  return {
    version: PROPERTY24_COMMERCIAL_LISTING_FACTS_VERSION,
    category,
    listingType: type,
    status,
    propertyTypeId: propertyTypeIdForCategory(category),
    measurements,
    features,
    terms,
    categoryModel,
    readiness,
    missingCategoryFacts,
    readyForFutureCategoryMapper: categoryModel.blockers.length === 0 && missingCategoryFacts.length === 0,
  }
}
