import assert from 'node:assert/strict'
import { buildCommercialCanonicalAudit } from '../src/modules/commercial/commercialCanonicalAudit.js'

const audit = buildCommercialCanonicalAudit({
  properties: [
    {
      id: 'industrial-property',
      property_type: 'industrial',
      warehouse_area_m2: 1600,
      yard_size_m2: 900,
      power_supply: 'Three-phase 500A',
      truck_access: true,
    },
    {
      id: 'farm-property',
      property_type: 'farm',
      farm_size_ha: 85,
      water_supply: 'Two boreholes',
      agricultural_use: 'Macadamias',
    },
  ],
  listings: [
    {
      id: 'industrial-listing',
      property_id: 'industrial-property',
      listing_category: 'industrial',
      listing_type: 'lease',
      metadata_json: {
        commercial_attributes: { power_supply: 'Three-phase 500A', truck_access: true },
        lease_terms: { operating_costs: 25 },
      },
      operating_costs: 25,
    },
    {
      id: 'farm-listing',
      property_id: 'farm-property',
      listing_category: 'agricultural',
      listing_type: 'sale',
      pricing: 12000000,
      metadata_json: {},
    },
  ],
})

assert.equal(audit.status, 'needs_review')
assert.equal(audit.summary.listingCount, 2)
assert.equal(audit.summary.canonicalCount, 1)
assert.equal(audit.summary.duplicateCount, 3)
assert.equal(audit.findings[0].status, 'needs_review')
assert.deepEqual(audit.findings[0].duplicateListingTerms, ['operating_costs'])
assert.deepEqual(audit.findings[0].duplicatePropertyFacts.sort(), ['power_supply', 'truck_access'])
assert.equal(audit.findings[1].status, 'canonical')
assert.equal(audit.property24Publishing, 'still_blocked_pending_verified_non_residential_schema')

console.log('Property24 commercial canonical audit passed')
