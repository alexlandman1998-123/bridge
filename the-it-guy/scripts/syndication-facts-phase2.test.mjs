import assert from 'node:assert/strict'
import {
  SYNDICATION_FACTS_VERSION,
  buildSyndicationAgentAssignments,
  buildSyndicationFacts,
  buildSyndicationFactsRow,
  mapSyndicationFactsRow,
} from '../src/services/syndicationFactsService.js'

const rentalFacts = buildSyndicationFacts({
  listing: {
    property_category: 'residential',
    property_type: 'Townhouse',
    mandate_type: 'rental',
    seller_canonical_facts_json: { property: { ratesTaxes: 1200, levies: 950 } },
  },
  publication: {
    listing_type: 'Rental',
    rental_price_type: 'weekly',
    floor_size: 123,
    erf_size: 450,
  },
  facts: {
    availableFrom: '2026-10-01T12:00:00+02:00',
    addressPrivacy: { hideStreetName: true },
    featureValues: { Fibre: true, pets_allowed: false },
  },
})

assert.equal(rentalFacts.version, SYNDICATION_FACTS_VERSION)
assert.equal(rentalFacts.listingPurpose, 'Rental')
assert.equal(rentalFacts.rentalPricePeriod, 'PerWeek')
assert.equal(rentalFacts.pricePresentation, 'Standard')
assert.equal(rentalFacts.floorArea, 123)
assert.equal(rentalFacts.floorAreaUnit, 'SquareMetres')
assert.equal(rentalFacts.landArea, 450)
assert.equal(rentalFacts.ratesTaxesAmount, 1200)
assert.equal(rentalFacts.leviesAmount, 950)
assert.equal(rentalFacts.availableFrom, '2026-10-01')
assert.deepEqual(rentalFacts.addressPrivacy, {
  hideStreetName: true,
  hideStreetNumber: false,
  hideComplexName: false,
  hideUnitNumber: false,
})
assert.deepEqual(rentalFacts.featureValues, { fibre: true, pets_allowed: false })

const saleFacts = buildSyndicationFacts({
  listing: { property_category: 'land', property_type: 'Vacant Land' },
  publication: { listing_type: 'Sale', asking_price: 450000, erf_size: 1000 },
  facts: { pricePresentation: 'offers from', offersFromPrice: 350000, landAreaUnit: 'hectares' },
})
assert.equal(saleFacts.listingPurpose, 'Sale')
assert.equal(saleFacts.pricePresentation, 'OffersFrom')
assert.equal(saleFacts.offersFromPrice, 350000)
assert.equal(saleFacts.rentalPricePeriod, null)
assert.equal(saleFacts.landAreaUnit, 'Hectares')

const row = buildSyndicationFactsRow('listing-1', { facts: saleFacts })
assert.equal(row.listing_id, 'listing-1')
assert.equal(row.price_presentation, 'OffersFrom')
assert.equal(row.offers_from_price, 350000)
assert.deepEqual(mapSyndicationFactsRow(row), saleFacts)

assert.deepEqual(buildSyndicationAgentAssignments('listing-1', ['agent-1', 'agent-2', 'agent-1']), [
  { listing_id: 'listing-1', agent_id: 'agent-1', position: 1 },
  { listing_id: 'listing-1', agent_id: 'agent-2', position: 2 },
])
assert.throws(() => buildSyndicationFactsRow('', {}), /Listing id is required/)

console.log('Syndication facts phase 2 contract passed')
