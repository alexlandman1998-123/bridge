import assert from 'node:assert/strict'
import { buildSyndicationChannelPreflight } from '../server/services/syndicationChannelPreflightService.js'

const residentialRental = buildSyndicationChannelPreflight({
  listing: {
    id: 'rental-1',
    property_type: 'House',
    asking_price: 18500,
    sellerOnboarding: { formData: { listingType: 'Rental', rentalPricePeriod: 'PerWeek', availableFrom: '2026-10-01' } },
  },
  publication: { title: 'Family rental', description: 'A complete rental listing.', bedrooms: 3, bathrooms: 2 },
})

assert.equal(residentialRental.channels.privateProperty.status, 'ready')
assert.equal(residentialRental.channels.privateProperty.mappedOutcome.listingType, 'ToLet')
assert.equal(residentialRental.channels.privateProperty.mappedOutcome.rentalPricePeriod, 'PerWeek')
assert.equal(residentialRental.channels.property24.status, 'ready')
assert.equal(residentialRental.channels.property24.mappedOutcome.rentalPricePeriod, 'PerWeek')
assert.equal(residentialRental.overall.status, 'ready')
assert.equal(residentialRental.rollout.enabled, false)
assert.equal(residentialRental.overall.legacyPublishPathPreserved, true)

const commercialSale = buildSyndicationChannelPreflight({
  listing: {
    id: 'commercial-house', property_category: 'commercial', property_type: 'House', asking_price: 2049000,
    seller_canonical_facts_json: { property: { specialistFacts: {
      grossLettableArea: '220', zoning: 'Residential', parking: '12 bays', listingTerms: 'Sale as is',
    } } },
    sellerOnboarding: { formData: { featureFacts: { solar_panels: true } } },
  },
  publication: { title: 'Commercial opportunity', description: 'Registered residential with no business rights.' },
})
assert.equal(commercialSale.channels.property24.status, 'ready')
assert.deepEqual(commercialSale.channels.property24.blockers, [])
assert.equal(commercialSale.channels.property24.mappedOutcome.category, 'commercial')
assert.equal(commercialSale.channels.property24.featureDelivery.find((item) => item.key === 'solar_panels').field, 'propertyFeatures.sustainabilityInfo.solarPanels')

const incompleteCommercialSale = buildSyndicationChannelPreflight({
  listing: { property_category: 'commercial', property_type: 'House', asking_price: 2049000,
    seller_canonical_facts_json: { parkingCount: '12' } },
  publication: { title: 'Commercial opportunity', description: 'Registered residential with no business rights.' },
})
assert.equal(incompleteCommercialSale.channels.property24.blockers.includes('property24_commercial_gross_lettable_area_required'), false)
assert.ok(incompleteCommercialSale.channels.property24.blockers.includes('property24_commercial_zoning_required'))
assert.equal(incompleteCommercialSale.channels.property24.blockers.includes('property24_commercial_parking_required'), false)
assert.equal(incompleteCommercialSale.channels.property24.blockers.includes('property24_commercial_mapping_not_verified'), false)

const featureReview = buildSyndicationChannelPreflight({
  listing: {
    id: 'feature-review', property_type: 'House', asking_price: 2000000,
    sellerOnboarding: { formData: { featureFacts: { solar_panels: true, lapa: true, deck: true, study: true, studies: 2 } } },
  },
  publication: { title: 'Family home', description: 'A complete description.', bedrooms: 3, bathrooms: 2 },
})
const delivery = (channel, key) => featureReview.channels[channel].featureDelivery.find((item) => item.key === key)
assert.deepEqual(delivery('property24', 'solar_panels'), {
  key: 'solar_panels', label: 'Solar panels', value: 'Yes', delivery: 'native', field: 'propertyFeatures.sustainabilityInfo.solarPanels',
})
assert.equal(delivery('property24', 'lapa').field, 'featureTags.SpecialFeature.Lapa')
assert.equal(delivery('property24', 'deck').delivery, 'description_only')
assert.equal(delivery('property24', 'study').delivery, 'description_only')
assert.equal(delivery('property24', 'studies').delivery, 'native')
assert.equal(delivery('privateProperty', 'study').field, 'Study')
assert.equal(delivery('privateProperty', 'solar_panels').delivery, 'description_only')
assert.equal(delivery('privateProperty', 'studies').delivery, 'description_only', 'A count cannot be represented fully by PP Study Yes/No')
const roofReview = buildSyndicationChannelPreflight({
  listing: { property_type: 'House', sellerOnboarding: { formData: { featureFacts: { roof_type: 'Tiles', kitchen: true } } } },
  publication: { title: 'Home', description: 'A complete home description.', bedrooms: 3, bathrooms: 2 },
})
assert.equal(roofReview.channels.property24.featureDelivery.find((item) => item.key === 'roof_type').field, 'tags.Tile')
assert.equal(roofReview.channels.property24.featureDelivery.find((item) => item.key === 'kitchen').field, 'featureTags.Kitchen')

const offersFromLand = buildSyndicationChannelPreflight({
  listing: {
    id: 'land-1',
    property_type: 'Land',
    asking_price: 150000,
    propertyDetails: { listingType: 'Sale', pricePresentation: 'OffersFrom', offersFrom: 110000, erfSize: 1200 },
  },
  publication: { title: 'Vacant land', description: 'A serviced vacant land listing.' },
})

assert.equal(offersFromLand.channels.privateProperty.status, 'ready')
assert.equal(offersFromLand.channels.privateProperty.mappedOutcome.pricePresentation, 'OffersFrom')
assert.equal(offersFromLand.channels.property24.status, 'blocked')
assert.equal(offersFromLand.channels.property24.blockers.includes('property24_land_mapping_not_verified'), false, 'Property24 now supports land mapping')
assert.ok(offersFromLand.channels.property24.blockers.includes('property24_price_presentation_not_verified'))

for (const propertyType of ['Vacant Land', 'vacant_land', 'Vacant Land / Plot', 'Stand', 'Residential Land']) {
  const landReview = buildSyndicationChannelPreflight({
    listing: { property_type: propertyType, asking_price: 2250000, propertyDetails: { erfSize: 215160 } },
    publication: { title: 'Dinokeng vacant land', description: 'Vacant bushveld land without a dwelling.' },
  })
  assert.equal(landReview.channels.privateProperty.status, 'ready', propertyType)

  const missingArea = buildSyndicationChannelPreflight({
    listing: { property_type: propertyType, asking_price: 2250000 },
    publication: { title: 'Vacant land', description: 'Land area is not yet recorded.' },
  })
  assert.ok(missingArea.channels.privateProperty.blockers.includes('private_property_land_area_required'), propertyType)
  assert.equal(missingArea.channels.privateProperty.blockers.includes('private_property_residential_bedrooms_and_bathrooms_required'), false, propertyType)
}

const explicitLandCategory = buildSyndicationChannelPreflight({
  listing: { property_category: 'Vacant Land', property_type: 'House', asking_price: 2250000, propertyDetails: { erfSize: 215160 } },
  publication: { title: 'Vacant land', description: 'The explicit specialist category takes precedence.' },
})
assert.equal(explicitLandCategory.channels.privateProperty.status, 'ready')

for (const rooms of [{}, { bedrooms: 3 }, { bathrooms: 2 }]) {
  const incompleteHome = buildSyndicationChannelPreflight({
    listing: { property_type: 'House', asking_price: 2250000 },
    publication: { title: 'Family home', description: 'A residential listing.', ...rooms },
  })
  assert.ok(incompleteHome.channels.privateProperty.blockers.includes('private_property_residential_bedrooms_and_bathrooms_required'))
}

for (const [propertyType, blocker] of [
  ['Smallholding', 'private_property_farm_type_required'],
  ['Warehouse', 'private_property_business_type_required'],
]) {
  const specialistReview = buildSyndicationChannelPreflight({
    listing: { property_category: propertyType, asking_price: 2250000 },
    publication: { title: 'Specialist property', description: 'Specialist details still need recording.' },
  })
  assert.ok(specialistReview.channels.privateProperty.blockers.includes(blocker))
  assert.equal(specialistReview.channels.privateProperty.blockers.includes('private_property_residential_bedrooms_and_bathrooms_required'), false)
}

const invalidOffer = buildSyndicationChannelPreflight({
  listing: { property_type: 'House', asking_price: 100000, propertyDetails: { listingType: 'Sale', pricePresentation: 'OffersFrom', offersFrom: 120000 } },
  publication: { title: 'House', description: 'A complete description.', bedrooms: 3, bathrooms: 2 },
})
assert.ok(invalidOffer.shared.blockers.includes('offers_from_price_must_not_exceed_price'))
assert.equal(invalidOffer.overall.status, 'blocked')

console.log('Syndication channel preflight phase 4 contract passed')
