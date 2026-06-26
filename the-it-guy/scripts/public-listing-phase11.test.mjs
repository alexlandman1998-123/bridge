import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), message || `Expected ${marker}`)
}

const readinessService = read('server/services/publicListingReadinessService.js')
const candidateScript = read('scripts/report-public-listing-candidates.mjs')
const readinessTest = read('server/tests/publicListingReadinessService.test.js')
const auditDoc = read('docs/audits/arch9-buy-listing-bridge-phase-1-audit.md')
const packageJson = JSON.parse(read('package.json'))

for (const marker of [
  'createPublicListingLaunchCandidateReport',
  'getLaunchCandidateScore',
  'ready_to_apply',
  'needs_media',
  'needs_publish_state',
  'blocked_lifecycle',
]) {
  includes(readinessService, marker, `Readiness service should include Phase 11 marker ${marker}`)
}

for (const marker of [
  'Arch9 Buy Launch Candidates',
  '--markdown',
  '--limit=',
  'createPublicListingLaunchCandidateReport',
  'fetchPublicListingReadinessRows',
]) {
  includes(candidateScript, marker, `Candidate report script should include Phase 11 marker ${marker}`)
}

includes(readinessTest, 'createPublicListingLaunchCandidateReport', 'Readiness tests should cover Phase 11 candidate ranking')
includes(auditDoc, 'Phase 11 Implementation', 'Audit doc should record Phase 11')

assert.equal(
  packageJson.scripts['report:public-listing-candidates'],
  'node scripts/report-public-listing-candidates.mjs',
  'package.json should expose the Phase 11 candidate report',
)
assert.equal(
  packageJson.scripts['test:public-listing-phase11'],
  'node scripts/public-listing-phase11.test.mjs',
  'package.json should expose the Phase 11 public listing test',
)

console.log('public listing Phase 11 tests passed')
