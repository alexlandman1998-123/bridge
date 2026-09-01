import assert from 'node:assert/strict'
import { PROPERTY24_LISTING_CATEGORIES } from '../server/property24/listingCategoryContract.js'
import { evaluateProperty24ListingCategoryModel } from '../server/property24/listingCategoryModel.js'
import { createProperty24ListingPlan } from '../server/services/property24ListingMapper.js'

const commercial = evaluateProperty24ListingCategoryModel({
  listing: { property_type: 'office' },
  listingType: 'Rental',
  status: 'Active',
  propertyTypeId: 11,
})
assert.equal(commercial.category, PROPERTY24_LISTING_CATEGORIES.COMMERCIAL)
assert.equal(commercial.payloadModel, 'commercial_pending_property24_schema')
assert.deepEqual(commercial.requiredMeasurements, ['grossLettableArea'])
assert.ok(commercial.allowedLifecycle.includes('Rented'))
assert.deepEqual(commercial.blockers, [])

const rentalSold = evaluateProperty24ListingCategoryModel({
  listing: { property_type: 'apartment' },
  listingType: 'Rental',
  status: 'Sold',
  propertyTypeId: 5,
})
assert.ok(rentalSold.blockers.includes('property24_rental_status_sold_not_allowed'))

const agriculturalMismatch = evaluateProperty24ListingCategoryModel({
  listing: { property_type: 'farm' },
  listingType: 'Sale',
  status: 'Active',
  propertyTypeId: 11,
})
assert.ok(agriculturalMismatch.blockers.includes('property24_agricultural_property_type_mismatch'))

const invalidLifecyclePlan = createProperty24ListingPlan({
  listing: {
    id: 'rental-listing',
    listing_reference: 'RENT-001',
    listing_status: 'sold',
    property_type: 'apartment',
    asking_price: 22000,
  },
  publication: {
    title: 'Ready rental apartment',
    listing_type: 'Rental',
    property_type: 'Apartment',
    description: 'A complete residential rental listing.',
    floor_size: 82,
    bedrooms: 2,
    bathrooms: 1,
    garages: 0,
  },
  media: [{ media_type: 'image', bytes: 'base64-image-data' }],
  agentMapping: { property24AgentId: 77959, sourceReference: 'ARCH9-RENT-001' },
  catalogMapping: { suburbId: 12345 },
  options: { expiryDate: '2026-12-31' },
})
assert.equal(invalidLifecyclePlan.canPreview, false)
assert.ok(invalidLifecyclePlan.dataBlockers.includes('property24_rental_status_sold_not_allowed'))
assert.equal(invalidLifecyclePlan.summary.categoryModel.payloadModel, 'residential_v1')

console.log('Property24 listing category model passed')
