import assert from 'node:assert/strict'
import {
  PROPERTY24_LISTING_CATEGORIES,
  evaluateProperty24ListingCategoryContract,
  resolveProperty24ListingCategory,
} from '../server/property24/listingCategoryContract.js'
import {
  createProperty24ListingPlan,
  evaluateProperty24CommercialSaleFacts,
  resolveProperty24CategoryPropertyTypeId,
} from '../server/services/property24ListingMapper.js'

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
  listingType: 'Sale',
})
assert.deepEqual(commercial.blockers, [])
assert.equal(commercial.publishingStatus, 'supported')
assert.ok(commercial.documentedProperty24Fields.includes('commercialInfo.grossLettableAreaSqm'))
assert.deepEqual(commercial.verifiedProperty24Fields, [])
const commercialRental = evaluateProperty24ListingCategoryContract({ listing: { property_category: 'commercial' }, listingType: 'Rental' })
assert.deepEqual(commercialRental.blockers, [])

const vacantLand = evaluateProperty24ListingCategoryContract({
  listing: { property_type: 'vacant land' },
  listingType: 'Rental',
})
assert.deepEqual(vacantLand.blockers, [])
assert.deepEqual(evaluateProperty24ListingCategoryContract({ listing: { property_type: 'vacant land' }, listingType: 'Sale' }).blockers, [])
assert.equal(resolveProperty24ListingCategory({ property_type: 'development' }), PROPERTY24_LISTING_CATEGORIES.UNKNOWN)

const plan = createProperty24ListingPlan({
  listing: {
    id: 'commercial-listing',
    listing_reference: 'COMM-001',
    listing_status: 'active',
    property_category: 'commercial',
    property_type: 'House',
    asking_price: 40000,
    seller_canonical_facts_json: { property: { specialistFacts: {
      grossLettableArea: '125', zoning: 'Residential', parking: '4 bays', listingTerms: 'Sale as is',
    } } },
  },
  publication: {
    listing_type: 'Sale',
    property_type: 'House',
    description: 'Prime commercial office space.',
  },
  media: [{ media_type: 'image', bytes: 'base64-image-data' }],
  agentMapping: { property24AgentId: 77959, sourceReference: 'ARCH9-COMMERCIAL-001' },
  catalogMapping: { suburbId: 12345 },
  options: { agencyId: 39837, environment: 'production', expiryDate: '2026-12-31' },
})

assert.equal(plan.canPreview, true)
assert.equal(plan.canSubmit, true)
assert.equal(plan.summary.propertyTypeId, 11)
assert.equal(plan.previewPayload.propertyInfo.propertyTypeId, 11)
assert.equal(plan.previewPayload.commercialInfo.grossLettableAreaSqm, 125)
assert.deepEqual(plan.technicalBlockers, [])
assert.equal(plan.dataBlockers.includes('property24_commercial_property_type_mismatch'), false)
assert.equal(plan.summary.categoryContract.category, PROPERTY24_LISTING_CATEGORIES.COMMERCIAL)
assert.equal(plan.summary.categoryContract.publishingStatus, 'supported')
assert.equal(resolveProperty24CategoryPropertyTypeId(12, 'commercial'), 12, 'An explicit specialist mismatch must remain visible')

const incomplete = createProperty24ListingPlan({
  listing: { property_category: 'commercial', property_type: 'House', asking_price: 2000000 },
  publication: { listing_type: 'Sale', description: 'Commercial opportunity.' },
  options: { agencyId: 39837, environment: 'production', expiryDate: '2026-12-31' },
})
assert.equal(incomplete.summary.propertyTypeId, 11)
assert.equal(incomplete.dataBlockers.includes('property24_commercial_gross_lettable_area_required'), false)
assert.equal(incomplete.dataBlockers.includes('property24_commercial_zoning_required'), false)
assert.equal(incomplete.dataBlockers.includes('property24_commercial_parking_required'), false)
assert.deepEqual(evaluateProperty24CommercialSaleFacts({
  listing: { seller_canonical_facts_json: { property: { specialistFacts: { zoning: 'Residential' } } } },
  publication: { parking_bays: 12 },
}).blockers, ['property24_commercial_sale_terms_required'])
const saleWithoutGla = createProperty24ListingPlan({
  listing: { property_category: 'commercial', property_type: 'House', asking_price: 2000000,
    seller_canonical_facts_json: { property: { specialistFacts: { zoning: 'Residential', parking: '4 bays' } } } },
  publication: { listing_type: 'Sale', description: 'Residential zoning, no business rights.' },
  media: [{ media_type: 'image', bytes: 'base64-image-data' }],
  agentMapping: { property24AgentId: 539393 },
  catalogMapping: { suburbId: 309 },
  options: { agencyId: 39837, environment: 'production', expiryDate: '2026-12-31' },
})
assert.equal(saleWithoutGla.canPreview, true)
assert.equal(saleWithoutGla.canSubmit, true)
assert.equal(saleWithoutGla.previewPayload.propertyInfo.propertyTypeId, 11)
assert.equal(saleWithoutGla.previewPayload.commercialInfo, undefined)
assert.ok(evaluateProperty24CommercialSaleFacts({
  listing: { asking_price: 2000000, seller_canonical_facts_json: { property: { specialistFacts: {
    grossLettableArea: '125.5', zoning: 'Residential', parking: '4 bays',
  } } } },
}).blockers.includes('property24_commercial_gross_lettable_area_whole_sqm_required'))


for (const listingType of ['Sale', 'Rental']) {
  const contract = evaluateProperty24ListingCategoryContract({ listing: { property_category: 'agricultural' }, listingType })
  assert.deepEqual(contract.blockers, [])
  assert.ok(contract.documentedProperty24Fields.includes('propertyInfo.erf'))
  for (const propertyType of ['House', 'Farm with house', 'Small Holding', 'Farm Land', 'Game Farm', 10]) {
    assert.equal(resolveProperty24CategoryPropertyTypeId(propertyType, 'agricultural'), 10)
    for (const updating of [false, true]) {
      const farmPlan = createProperty24ListingPlan({
        listing: { id: 'farm', property_category: 'agricultural', property_type: propertyType, listing_status: 'active', seller_canonical_facts_json: { property: { specialistFacts: { farmSize: 2.5, waterSupplyOrRights: 'Borehole', agriculturalUse: 'Grazing' } } } },
        publication: { listing_type: listingType, property_type: propertyType, asking_price: 25000, description: 'Farm with a dwelling', rental_price_frequency: 'monthly' },
        media: updating ? [] : [{ media_type: 'image', bytes: 'test-image' }],
        agentMapping: { property24AgentId: 77 }, catalogMapping: { suburbId: 309 },
        existingSync: updating ? { listingNumber: 123456 } : {},
        options: { agencyId: 39837, environment: 'production', expiryDate: '2027-12-31', photosChanged: !updating },
      })
      assert.equal(farmPlan.canSubmit, true, JSON.stringify(farmPlan.dataBlockers))
      assert.equal(farmPlan.previewPayload.propertyInfo.propertyTypeId, 10)
      assert.deepEqual(farmPlan.previewPayload.propertyInfo.erf, { size: 25000, areaUnit: 'SquareMetres' })
      assert.equal(farmPlan.previewPayload.status, updating ? 'Active' : 'NewListing')
      if (updating) assert.equal(farmPlan.previewPayload.photos, null)
    }
  }
}
assert.equal(resolveProperty24CategoryPropertyTypeId(11, 'agricultural'), 11)

console.log('Property24 listing category contract passed')

// v55 does not require an internal mandate, zoning, parking or floor-size checklist.
for (const [category, type, id] of [['residential', 'House', 4], ['commercial', 'Office', 11], ['industrial', 'Warehouse', 12], ['retail', 'Shop', 11], ['mixed_use', 'Mixed Use', 11], ['agricultural', 'Farm', 10], ['vacant_land', 'Vacant Land', 8]]) {
  for (const listingType of ['Sale', 'Rental']) {
    const plan = createProperty24ListingPlan({
      listing: { id: 'minimal', property_category: category, property_type: type, asking_price: 25000, listing_status: 'active' },
      publication: { listing_type: listingType, description: 'Available property.', asking_price: 25000, rental_price_frequency: 'monthly' },
      media: [{ media_type: 'image', bytes: 'test-image' }], agentMapping: { property24AgentId: 77 }, catalogMapping: { suburbId: 309 },
      options: { agencyId: 39837, expiryDate: '2027-01-08', environment: 'production' },
    })
    assert.equal(plan.canSubmit, true, `${category} ${listingType}: ${JSON.stringify(plan.dataBlockers)}`)
    assert.equal(plan.previewPayload.propertyInfo.propertyTypeId, id)
  }
}
