import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), message || `Expected ${marker}`)
}

const readinessService = read('server/services/publicListingReadinessService.js')
const publishScript = read('scripts/publish-public-listing.mjs')
const readinessTest = read('server/tests/publicListingReadinessService.test.js')
const packageJson = JSON.parse(read('package.json'))

for (const marker of [
  'createPublicListingLaunchPlan',
  'publicationPayload',
  'listingPatch',
  'ready_to_publish',
  'launchBlockers',
]) {
  includes(readinessService, marker, `Readiness service should include Phase 9 launch-plan marker ${marker}`)
}

for (const marker of [
  '--listing-id=',
  'dry-run',
  '--apply',
  '--verify',
  'verifyPublicListing',
  'listing_publication_data',
  'private_listings',
]) {
  includes(publishScript, marker, `Publisher script should include Phase 9 marker ${marker}`)
}

includes(readinessTest, 'createPublicListingLaunchPlan', 'Readiness tests should cover launch plan creation')
includes(readinessTest, 'https://legacy-app.example.test/buy/old-listing', 'Readiness tests should guard canonical public URLs')

assert.equal(
  packageJson.scripts['publish:public-listing'],
  'node scripts/publish-public-listing.mjs',
  'package.json should expose the single-listing public publisher',
)
assert.equal(
  packageJson.scripts['test:public-listing-phase9'],
  'node scripts/public-listing-phase9.test.mjs',
  'package.json should expose the Phase 9 public listing test',
)

console.log('public listing Phase 9 tests passed')
