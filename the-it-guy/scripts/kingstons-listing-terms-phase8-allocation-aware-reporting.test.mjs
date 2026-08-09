import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const agencyPipeline = read('src/pages/agency/AgencyPipelinePage.jsx')
const allocationService = read('src/services/privateListingAttorneyAllocationService.js')

assert.match(
  allocationService,
  /export async function listPrivateListingTransferAttorneyAllocations/,
  'Phase 8 should expose a bulk transfer-attorney allocation reader.',
)
assert.match(
  allocationService,
  /\.from\('private_listing_role_players'\)/,
  'The bulk reader should verify against the existing private listing role-player table.',
)
assert.match(
  allocationService,
  /\.in\('private_listing_id', listingIds\)/,
  'The bulk reader should only query the loaded Kingstons listing IDs.',
)
assert.match(
  agencyPipeline,
  /listPrivateListingTransferAttorneyAllocations/,
  'The Kingstons principal report should hydrate allocations from the bulk reader.',
)
assert.match(
  agencyPipeline,
  /kingstonsPrincipalAttorneyAllocationsState/,
  'The page should keep scoped principal allocation hydration state.',
)
assert.match(
  agencyPipeline,
  /kingstonsPrincipalLinkedListingIds/,
  'The page should derive the exact linked listing IDs that need aggregate allocation checks.',
)
assert.match(
  agencyPipeline,
  /allocationByListingId/,
  'The aggregate exception model should consume real allocation rows by listing ID.',
)
assert.match(
  agencyPipeline,
  /checkedListingIds/,
  'The aggregate report should distinguish checked listings from still-loading listings.',
)
assert.match(
  agencyPipeline,
  /Checking transfer-attorney allocations across loaded Kingstons listings/,
  'The principal card should show allocation verification progress.',
)

console.log('Kingstons listing terms Phase 8 allocation-aware reporting checks passed.')
