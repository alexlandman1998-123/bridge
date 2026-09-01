export const COMMERCIAL_LISTING_READINESS_VERSION = 'arch9_commercial_listing_readiness_v1'

function text(value = '') {
  return String(value || '').trim()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function resolveCommercialListingCategory(listing = {}, property = {}) {
  const value = text(listing.listing_category || property.property_type)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
  if (['industrial', 'warehouse', 'factory', 'logistics', 'distribution_centre'].includes(value)) return 'industrial'
  if (['agricultural', 'farm', 'smallholding', 'agricultural_land'].includes(value)) return 'agricultural'
  if (['development_land', 'land', 'vacant_land', 'vacant_stand', 'plot'].includes(value)) return 'land_development'
  return 'commercial'
}

function valueForFacts(listing = {}, property = {}) {
  return {
    grossLettableArea: number(property.gla_m2),
    officeArea: number(property.office_area_m2),
    warehouseOrFactoryArea: number(property.warehouse_area_m2),
    yardSize: number(property.yard_size_m2),
    farmSize: number(property.farm_size_ha),
    erfSize: number(property.land_size_m2),
    zoning: text(property.zoning),
    parking: text(property.parking_ratio),
    powerSupply: text(property.power_supply),
    loadingAccess: Boolean(property.loading_bays || property.truck_access),
    craneCapacity: text(property.crane_capacity),
    waterSupplyOrRights: text(property.water_supply || property.water_rights),
    agriculturalUse: text(property.agricultural_use || property.crop_type || property.livestock_capacity),
    developmentRights: text(property.development_rights || property.bulk),
    subdivisionStatus: text(property.subdivision_status),
    operatingCosts: number(listing.operating_costs),
    ratesAndTaxes: number(listing.rates_and_taxes),
    leaseTermMonths: number(listing.lease_term_months),
    depositAmount: number(listing.deposit_amount),
    utilityPolicy: text(listing.utility_policy),
  }
}

const REQUIRED_FACTS = Object.freeze({
  commercial: ['grossLettableArea', 'zoning', 'parking', 'listingTerms'],
  industrial: ['warehouseOrFactoryArea', 'yardSize', 'powerSupply', 'loadingAccess'],
  agricultural: ['farmSize', 'waterSupplyOrRights', 'agriculturalUse'],
  land_development: ['erfSize', 'zoning', 'developmentRights'],
})

function hasListingTerms(facts = {}, listing = {}) {
  const intent = text(listing.listing_type).toLowerCase()
  if (intent === 'lease' || intent === 'rental') {
    return Boolean(facts.operatingCosts || facts.ratesAndTaxes || facts.leaseTermMonths || facts.depositAmount || facts.utilityPolicy)
  }
  return Boolean(facts.ratesAndTaxes || number(listing.pricing))
}

export function evaluateCommercialListingReadiness({ listing = {}, property = {} } = {}) {
  const category = resolveCommercialListingCategory(listing, property)
  const facts = valueForFacts(listing, property)
  const requiredFacts = REQUIRED_FACTS[category] || REQUIRED_FACTS.commercial
  const missingFacts = requiredFacts.filter((name) => name === 'listingTerms'
    ? !hasListingTerms(facts, listing)
    : !facts[name])

  return {
    version: COMMERCIAL_LISTING_READINESS_VERSION,
    category,
    facts,
    requiredFacts,
    missingFacts,
    complete: missingFacts.length === 0,
  }
}
