import assert from 'node:assert/strict'
import fs from 'node:fs'

const listingsPage = fs.readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const listingDetailPage = fs.readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

for (const marker of [
  'openArch9BuyWorkspace',
  '?tab=listing',
  'getArch9BuyActionLabel',
  'Fix Media',
  'Complete Data',
]) {
  assert.match(listingsPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Listings page should include Phase 7 marker ${marker}`)
}

for (const marker of [
  'useLocation',
  'getSellerWorkspaceTabFromSearch',
  'location.search',
  'openSellerWorkspaceSection(tab.key)',
  '?tab=',
]) {
  assert.match(listingDetailPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Listing detail should include Phase 7 marker ${marker}`)
}

assert.equal(
  packageJson.scripts['test:public-listing-phase7'],
  'node scripts/public-listing-phase7.test.mjs',
  'package.json should expose the Phase 7 public listing test',
)

console.log('public listing Phase 7 tests passed')
