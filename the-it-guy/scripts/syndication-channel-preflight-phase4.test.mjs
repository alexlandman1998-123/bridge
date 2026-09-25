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
assert.ok(offersFromLand.channels.property24.blockers.includes('property24_land_mapping_not_verified'))
assert.ok(offersFromLand.channels.property24.blockers.includes('property24_price_presentation_not_verified'))

const invalidOffer = buildSyndicationChannelPreflight({
  listing: { property_type: 'House', asking_price: 100000, propertyDetails: { listingType: 'Sale', pricePresentation: 'OffersFrom', offersFrom: 120000 } },
  publication: { title: 'House', description: 'A complete description.', bedrooms: 3, bathrooms: 2 },
})
assert.ok(invalidOffer.shared.blockers.includes('offers_from_price_must_not_exceed_price'))
assert.equal(invalidOffer.overall.status, 'blocked')

console.log('Syndication channel preflight phase 4 contract passed')
