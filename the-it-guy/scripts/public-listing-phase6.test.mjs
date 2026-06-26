import assert from 'node:assert/strict'
import fs from 'node:fs'

const listingsPage = fs.readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const privateListingService = fs.readFileSync(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

for (const marker of [
  'getArch9BuyReadiness',
  'arch9BuyFilterOptions',
  "publicStatus: 'all'",
  'Arch9 Buy',
  'card.arch9BuyStatusLabel',
  'card.publicationStatusLabel',
]) {
  assert.match(listingsPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Agent listings page should include ${marker}`)
}

for (const marker of [
  'fetchPublicationRowsForListings',
  'listingPublicationData',
  'publicationStatus',
  'listing_publication_data',
]) {
  assert.match(privateListingService, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Private listing service should include ${marker}`)
}

assert.equal(
  packageJson.scripts['test:public-listing-phase6'],
  'node scripts/public-listing-phase6.test.mjs',
  'package.json should expose the Phase 6 public listing test',
)

console.log('public listing Phase 6 tests passed')
