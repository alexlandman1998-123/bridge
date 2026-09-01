import assert from 'node:assert/strict'
import {
  PROPERTY24_LISTING_CATEGORIES,
  evaluateProperty24ListingCategoryContract,
  resolveProperty24ListingCategory,
} from '../server/property24/listingCategoryContract.js'
import { createProperty24ListingPlan } from '../server/services/property24ListingMapper.js'

assert.equal(resolveProperty24ListingCategory({ property_type: 'House' }), PROPERTY24_LISTING_CATEGORIES.RESIDENTIAL)
assert.equal(resolveProperty24ListingCategory({ property_type: 'Warehouse' }), PROPERTY24_LISTING_CATEGORIES.INDUSTRIAL)
assert.equal(resolveProperty24ListingCategory({ property_type: 'Farm' }), PROPERTY24_LISTING_CATEGORIES.AGRICULTURAL)
assert.equal(resolveProperty24ListingCategory({ property_category: 'commercial' }), PROPERTY24_LISTING_CATEGORIES.COMMERCIAL)
assert.equal(
  resolveProperty24ListingCategory({ listing_category: 'private_sale', property_type: 'office' }),
  PROPERTY24_LISTING_CATEGORIES.COMMERCIAL,
)

const commercial = evaluateProperty24ListingCategoryContract({
  listing: { property_category: 'commercial' },
  listingType: 'Rental',
})
assert.deepEqual(commercial.blockers, ['property24_commercial_mapping_not_verified'])
assert.equal(commercial.publishingStatus, 'blocked_pending_property24_contract')

const saleOnlyLand = evaluateProperty24ListingCategoryContract({
  listing: { property_type: 'vacant land' },
  listingType: 'Rental',
})
assert.ok(saleOnlyLand.blockers.includes('property24_land_development_mapping_not_verified'))
assert.ok(saleOnlyLand.blockers.includes('property24_land_development_rental_not_supported'))

const plan = createProperty24ListingPlan({
  listing: {
    id: 'commercial-listing',
    listing_reference: 'COMM-001',
    listing_status: 'active',
    property_category: 'commercial',
    property_type: 'office',
    asking_price: 40000,
  },
  publication: {
    listing_type: 'Rental',
    property_type: 'Commercial Property',
    description: 'Prime commercial office space.',
  },
  media: [{ media_type: 'image', bytes: 'base64-image-data' }],
  agentMapping: { property24AgentId: 77959, sourceReference: 'ARCH9-COMMERCIAL-001' },
  catalogMapping: { suburbId: 12345 },
  options: { expiryDate: '2026-12-31' },
})

assert.equal(plan.canPreview, false)
assert.equal(plan.canSubmit, false)
assert.ok(plan.dataBlockers.includes('property24_commercial_mapping_not_verified'))
assert.equal(plan.summary.categoryContract.category, PROPERTY24_LISTING_CATEGORIES.COMMERCIAL)
assert.equal(plan.summary.categoryContract.publishingStatus, 'blocked_pending_property24_contract')

console.log('Property24 listing category contract passed')
