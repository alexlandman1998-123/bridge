import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSyndicationFacts } from '../src/services/syndicationFactsService.js'

const rentalFacts = buildSyndicationFacts({
  listing: {
    propertyDetails: {
      propertySubtype: 'Office',
      listingType: 'Rental',
      rentalPricePeriod: 'PerM2',
      availableFrom: '2026-10-01',
      floorSize: 250,
    },
    sellerOnboarding: {
      formData: {
        propertySubtype: 'Office',
        listingType: 'Rental',
        rentalPricePeriod: 'PerM2',
        availableFrom: '2026-10-01',
      },
    },
  },
})

assert.equal(rentalFacts.propertySubtype, 'Office')
assert.equal(rentalFacts.listingPurpose, 'Rental')
assert.equal(rentalFacts.rentalPricePeriod, 'PerM2')
assert.equal(rentalFacts.availableFrom, '2026-10-01')
assert.equal(rentalFacts.floorArea, 250)

const saleFacts = buildSyndicationFacts({
  listing: {
    propertyDetails: {
      listingType: 'Sale',
      pricePresentation: 'OffersFrom',
      offersFrom: 110000,
    },
  },
})

assert.equal(saleFacts.pricePresentation, 'OffersFrom')
assert.equal(saleFacts.offersFromPrice, 110000)

const source = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
for (const expected of [
  'function ListingTermsFields',
  'Rental Period',
  'Price Presentation',
  'Available From',
  'propertySubtype',
  'rentalPricePeriod',
  'pricePresentation',
  'availableFrom',
  'furnished',
]) {
  assert.ok(source.includes(expected), `Expected Phase 3 listing editor contract: ${expected}`)
}
assert.equal((source.match(/<ListingTermsFields draft=\{marketingDraft\} onChange=\{updateMarketingDraft\} \/>/g) || []).length, 2)

console.log('Syndication listing UI phase 3 contract passed')
