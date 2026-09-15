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

const listingEditorSource = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const availabilityServiceSource = await readFile(new URL('../src/services/syndicationChannelAvailabilityService.js', import.meta.url), 'utf8')
const availabilityApiSource = await readFile(new URL('../api/listings/syndication-availability.js', import.meta.url), 'utf8')

assert.match(listingEditorSource, /getSyndicationChannelAvailability/, 'loads organisation channel availability before enabling portal choices')
assert.match(listingEditorSource, /disabled=\{isLocked \|\| !channelAvailable \|\| portal\.availabilityLoading\}/, 'prevents selecting an unavailable external channel')
assert.match(listingEditorSource, /Not connected for this organisation/, 'explains why an external channel cannot be selected')
assert.match(listingEditorSource, /Channel connected — listing details complete/, 'does not present field completion as a final external publishing guarantee')
assert.match(listingEditorSource, /Arch9 Platform/, 'names the internal destination clearly')
assert.match(listingEditorSource, /Internal only — not published to external portals/, 'explains that Arch9 Platform does not syndicate externally')
assert.match(availabilityServiceSource, /syndication-availability/, 'uses the guarded availability endpoint')
assert.match(availabilityApiSource, /fetchOrganisationProperty24Connection[\s\S]*environment: 'production'/, 'checks the production Property24 account')
assert.match(availabilityApiSource, /resolvePrivatePropertyAgencyConfig[\s\S]*environment: 'production'/, 'checks the production Private Property account')
assert.match(availabilityApiSource, /website_sites[\s\S]*website_domains/, 'requires a live website and active domain')

console.log('Syndication listing UI phase 3 contract passed')
