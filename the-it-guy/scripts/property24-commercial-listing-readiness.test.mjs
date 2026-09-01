import assert from 'node:assert/strict'
import { evaluateCommercialListingReadiness } from '../src/modules/commercial/commercialListingReadiness.js'

const commercialLease = evaluateCommercialListingReadiness({
  listing: {
    listing_type: 'lease',
    listing_category: 'commercial',
    operating_costs: 95,
  },
  property: {
    property_type: 'office',
    gla_m2: 680,
    zoning: 'Business 4',
    parking_ratio: '4 bays / 100m²',
  },
})
assert.equal(commercialLease.complete, true)
assert.deepEqual(commercialLease.missingFacts, [])

const incompleteIndustrial = evaluateCommercialListingReadiness({
  listing: { listing_type: 'lease', listing_category: 'industrial' },
  property: {
    property_type: 'warehouse',
    warehouse_area_m2: 1200,
    yard_size_m2: 900,
    power_supply: 'Three-phase 250A',
  },
})
assert.equal(incompleteIndustrial.category, 'industrial')
assert.deepEqual(incompleteIndustrial.missingFacts, ['loadingAccess'])

const land = evaluateCommercialListingReadiness({
  listing: { listing_type: 'sale', listing_category: 'development_land', pricing: 9200000 },
  property: {
    property_type: 'development_land',
    land_size_m2: 42000,
    zoning: 'Mixed use',
    development_rights: 'Approved for 96 units',
  },
})
assert.equal(land.category, 'land_development')
assert.equal(land.complete, true)

console.log('Property24 commercial listing readiness passed')
