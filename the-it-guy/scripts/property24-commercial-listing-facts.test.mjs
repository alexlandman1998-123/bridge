import assert from 'node:assert/strict'
import { buildCommercialListingCanonicalFacts } from '../server/property24/commercialListingFacts.js'

const industrial = buildCommercialListingCanonicalFacts({
  listing: {
    listing_type: 'lease',
    listing_category: 'industrial',
    listing_status: 'active',
    operating_costs: 12500,
    lease_term_months: 36,
  },
  property: {
    property_type: 'industrial',
    warehouse_area_m2: 2400,
    yard_size_m2: 1800,
    power_supply: 'Three phase 500A',
    loading_bays: 4,
    crane_capacity: '10 ton',
  },
})

assert.equal(industrial.category, 'industrial')
assert.equal(industrial.listingType, 'Rental')
assert.equal(industrial.status, 'Active')
assert.equal(industrial.measurements.warehouseOrFactoryArea, 2400)
assert.equal(industrial.features.craneCapacity, '10 ton')
assert.equal(industrial.terms.leaseTermMonths, 36)
assert.equal(industrial.readyForFutureCategoryMapper, true)
assert.equal(industrial.readiness.complete, true)

const agricultural = buildCommercialListingCanonicalFacts({
  listing: { listing_type: 'sale', listing_category: 'agricultural', listing_status: 'active' },
  property: { property_type: 'farm', farm_size_ha: 310, water_supply: 'Two boreholes', agricultural_use: 'Citrus farming' },
})
assert.equal(agricultural.category, 'agricultural')
assert.equal(agricultural.measurements.farmSize, 310)
assert.equal(agricultural.features.waterSupplyOrRights, 'Two boreholes')
assert.equal(agricultural.features.agriculturalUse, 'Citrus farming')
assert.equal(agricultural.readyForFutureCategoryMapper, true)

const missingIndustrial = buildCommercialListingCanonicalFacts({
  listing: { listing_type: 'lease', listing_category: 'industrial', listing_status: 'active' },
  property: { property_type: 'industrial', warehouse_area_m2: 900, yard_size_m2: 600, power_supply: '250A' },
})
assert.deepEqual(missingIndustrial.missingCategoryFacts, ['loadingAccess'])
assert.equal(missingIndustrial.readyForFutureCategoryMapper, false)

console.log('Property24 commercial listing facts passed')
