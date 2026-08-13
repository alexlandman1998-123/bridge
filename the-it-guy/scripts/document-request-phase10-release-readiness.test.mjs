import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const scriptSource = fs.readFileSync('scripts/document-request-phase10-release-readiness.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase10-release-readiness.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase10-release-readiness'],
  'node scripts/document-request-phase10-release-readiness.test.mjs',
  'package.json should expose the Phase 10 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase10-release-readiness'],
  'node scripts/document-request-phase10-release-readiness.mjs',
  'package.json should expose the Phase 10 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase10-release-readiness'],
  'npm run verify:document-request-phase9-upload-linking && npm run test:document-request-phase10-release-readiness && npm run report:document-request-phase10-release-readiness',
  'package.json should expose the Phase 10 verification command.',
)

assert.match(scriptSource, /document_request_phase10_release_readiness/, 'Phase 10 script should carry a stable marker.')
assert.match(scriptSource, /PHASE_REPORTS/, 'Phase 10 should aggregate prior phase reports.')
assert.match(scriptSource, /document-request-phase9-upload-linking\.json/, 'Phase 10 should include Phase 9 evidence.')
assert.match(scriptSource, /MANAGED_WARNING_CODES/, 'Phase 10 should make managed warnings explicit.')
assert.match(scriptSource, /legacy_request_fallback_retained/, 'Phase 10 should track the Phase 8 fallback warning.')
assert.match(scriptSource, /seller_portal_request_link_permission_guard/, 'Phase 10 should track the Phase 9 permission guard warning.')
assert.match(scriptSource, /pendingActivationItems/, 'Phase 10 should expose remaining activation items.')
assert.match(scriptSource, /productionActivationReady/, 'Phase 10 should include a production activation decision.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 10 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 10 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.insert\(/, 'Phase 10 report should not insert data.')
assert.doesNotMatch(scriptSource, /\.update\(/, 'Phase 10 report should not update data.')
assert.doesNotMatch(scriptSource, /\.upsert\(/, 'Phase 10 report should not upsert data.')

assert.match(docs, /Release Readiness/, 'Phase 10 docs should name the phase.')
assert.match(docs, /production activation/i, 'Phase 10 docs should explain production activation gating.')
assert.match(docs, /managed warnings/i, 'Phase 10 docs should explain managed warnings.')

const outputPath = 'output/document-request-phase10-release-readiness.test.json'
execFileSync('node', ['scripts/document-request-phase10-release-readiness.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase10_release_readiness')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'release_readiness_mapped_with_warnings')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.hardBlockers.length, 0)
assert.equal(report.gate.productionActivationReady, false)
assert.equal(report.gate.mayProceedToPhase11, true)
assert.equal(report.releaseRecommendation, 'ready_for_internal_pilot_not_production_activation')
assert.equal(report.phaseSummaries.length, 10)
assert.ok(report.warningSummary.total > 0, 'Phase 10 should surface managed warnings from earlier gates.')
assert.equal(report.warningSummary.unmanaged, 0, 'Phase 10 should not allow unmanaged warnings.')
assert.ok(
  report.pendingActivationItems.some((item) => item.code === 'seller_portal_request_link_permission_guard'),
  'Phase 10 should carry the seller portal request-link permission guard.',
)
assert.ok(
  report.pendingActivationItems.some((item) => item.code === 'legacy_request_fallback_retained'),
  'Phase 10 should carry the legacy request fallback warning.',
)

console.log('document request phase 10 release readiness tests passed')
