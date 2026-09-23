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
