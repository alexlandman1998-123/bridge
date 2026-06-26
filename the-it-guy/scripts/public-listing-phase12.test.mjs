import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), message || `Expected ${marker}`)
}

const readinessService = read('server/services/publicListingReadinessService.js')
const mediaScript = read('scripts/attach-public-listing-media.mjs')
const readinessTest = read('server/tests/publicListingReadinessService.test.js')
const auditDoc = read('docs/audits/arch9-buy-listing-bridge-phase-1-audit.md')
const packageJson = JSON.parse(read('package.json'))

for (const marker of [
  'createPublicListingMediaAttachmentPlan',
  'normalizePublicListingMediaUrls',
  'ready_to_attach',
  'all image URLs already exist',
]) {
  includes(readinessService, marker, `Readiness service should include Phase 12 marker ${marker}`)
}

for (const marker of [
  '--image-url=',
  '--caption=',
  '--apply',
  'listing_media',
  'postAttachLaunchPlan',
  'publish:public-listing',
]) {
  includes(mediaScript, marker, `Media attachment script should include Phase 12 marker ${marker}`)
}

includes(readinessTest, 'createPublicListingMediaAttachmentPlan', 'Readiness tests should cover Phase 12 media plans')
includes(auditDoc, 'Phase 12 Implementation', 'Audit doc should record Phase 12')

assert.equal(
  packageJson.scripts['attach:public-listing-media'],
  'node scripts/attach-public-listing-media.mjs',
  'package.json should expose the Phase 12 media attachment script',
)
assert.equal(
  packageJson.scripts['test:public-listing-phase12'],
  'node scripts/public-listing-phase12.test.mjs',
  'package.json should expose the Phase 12 public listing test',
)

console.log('public listing Phase 12 tests passed')
