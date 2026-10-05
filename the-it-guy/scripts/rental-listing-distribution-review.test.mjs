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
const channelCard = readFileSync('src/components/listings/ListingSyndicationChannelCard.jsx', 'utf8')
assert.match(channelCard, /Needs attention/)
assert.match(createPage, /arch9_internal/)
assert.deepEqual(normalizeRentalDistributionChannels(['arch9_internal']), [], 'Internal storage is not an external publishing destination')
assert.match(createPage, /key: 'syndication'/)
assert.match(createPage, /key: 'marketing'/)
assert.match(createPage, /key: 'review'/)
assert.match(detailPage, /Selected distribution/)

console.log('Rental listing distribution review checks passed')

// Exercise the real atomic rental save against local Postgres, including RLS and rollback.
await import('../src/services/rentals/__tests__/rentalListingPersistence.test.mjs')

await import('../src/services/rentals/__tests__/rentalListingExpiry.test.mjs')

await import('../src/services/rentals/__tests__/rentalListingInventory.test.mjs')
