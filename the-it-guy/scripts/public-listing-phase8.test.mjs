import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), message || `Expected ${marker}`)
}

const listingDetailPage = read('src/pages/AgentListingDetail.jsx')
const publicListingsService = read('server/services/publicListingsService.js')
const viteConfig = read('vite.config.js')
const publicListingsTest = read('server/tests/publicListingsService.test.js')
const packageJson = JSON.parse(read('package.json'))

for (const marker of [
  'ARCH9_PUBLIC_LISTINGS_API_PATH',
  'getPublicListingSlugFromUrl',
  'verifyArch9PublicListing',
  'Check Live',
  'Confirmed live on Arch9 Buy.',
  'Listing published and confirmed live on Arch9 Buy.',
]) {
  includes(listingDetailPage, marker, `Listing detail should include Phase 8 live verification marker ${marker}`)
}

includes(publicListingsService, "const publicUrl = `${host.replace(/\\/+$/g, '')}/buy/${slug}`", 'Public listing contract should always return the canonical public URL')
includes(publicListingsTest, 'https://legacy-app.example.test/buy/old-listing', 'Public listing test should guard against stale stored public URLs')
includes(viteConfig, "server.middlewares.use('/api/public/listings'", 'Vite dev server should expose the public listings API')

assert.equal(
  packageJson.scripts['test:public-listing-phase8'],
  'node scripts/public-listing-phase8.test.mjs',
  'package.json should expose the Phase 8 public listing test',
)

console.log('public listing Phase 8 tests passed')
