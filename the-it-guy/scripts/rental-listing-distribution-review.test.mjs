import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildRentalCanonicalFacts,
  buildRentalPublicationDraft,
  normalizeRentalDistributionChannels,
  RENTAL_DISTRIBUTION_CHANNELS,
} from '../src/services/rentals/rentalListingDraftModel.js'

const selectedChannels = normalizeRentalDistributionChannels([
  'property24',
  'private_property',
  'website',
  'property24',
])

assert.deepEqual(selectedChannels, ['property24', 'private_property', 'agency_website'])

const form = {
  propertyType: 'Apartment',
  propertyAddress: '10 Example Street',
  monthlyRent: '12000',
  rentalPriceFrequency: 'monthly',
  selectedSyndicationChannels: selectedChannels,
}

assert.deepEqual(buildRentalCanonicalFacts(form).distribution.selectedChannels, selectedChannels)
assert.deepEqual(buildRentalPublicationDraft(form).selectedSyndicationChannels, selectedChannels)

const createPage = readFileSync('src/pages/rentals/RentalListingCreatePage.jsx', 'utf8')
const detailPage = readFileSync('src/pages/rentals/RentalListingDetailPage.jsx', 'utf8')

assert.match(createPage, /Distribution/)
assert.deepEqual(RENTAL_DISTRIBUTION_CHANNELS.map((channel) => channel.label), ['Property24', 'Private Property', 'Agency Website'])
assert.match(createPage, /Needs attention/)
assert.match(createPage, /key: 'syndication'/)
assert.match(createPage, /Step 5 of 6/)
assert.match(createPage, /Step 6 of 6/)
assert.match(detailPage, /Selected distribution/)

console.log('Rental listing distribution review checks passed')
