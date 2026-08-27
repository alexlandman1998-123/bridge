import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const scriptSource = fs.readFileSync('scripts/document-request-phase10-release-readiness.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase10-release-readiness.md', 'utf8')
const evidenceTemplate = JSON.parse(fs.readFileSync('docs/document-request-phase10-environment-evidence.template.json', 'utf8'))

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
assert.match(scriptSource, /ENVIRONMENT_EVIDENCE_CONTRACT/, 'Phase 10 should define a stable target-environment evidence contract.')
assert.match(scriptSource, /professional_visibility_migration_applied/, 'Phase 10 should require migration evidence.')
assert.match(scriptSource, /document_requests_rls_verified/, 'Phase 10 should require RLS evidence.')
assert.match(scriptSource, /agent_upload_on_behalf_linked/, 'Phase 10 should require agent upload-on-behalf evidence.')
assert.match(scriptSource, /coveredAudienceCount === 8/, 'Phase 10 should require all eight Phase 7 audiences.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 10 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 10 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.insert\(/, 'Phase 10 report should not insert data.')
assert.doesNotMatch(scriptSource, /\.update\(/, 'Phase 10 report should not update data.')
assert.doesNotMatch(scriptSource, /\.upsert\(/, 'Phase 10 report should not upsert data.')

assert.match(docs, /Release Readiness/, 'Phase 10 docs should name the phase.')
assert.match(docs, /production activation/i, 'Phase 10 docs should explain production activation gating.')
assert.match(docs, /managed warnings/i, 'Phase 10 docs should explain managed warnings.')
assert.match(docs, /environment evidence/i, 'Phase 10 docs should explain target-environment evidence.')
assert.equal(evidenceTemplate.contract, 'document_request_phase10_environment_evidence_v1')
assert.equal(Object.keys(evidenceTemplate.checks).length, 6)

const outputPath = 'output/document-request-phase10-release-readiness.test.json'
execFileSync('node', ['scripts/document-request-phase10-release-readiness.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase10_release_readiness')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'implementation_ready_environment_validation_required')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.hardBlockers.length, 0)
assert.equal(report.gate.productionActivationReady, false)
assert.equal(report.gate.internalPilotReady, false)
assert.equal(report.gate.mayProceedToPhase11, true)
assert.equal(report.releaseRecommendation, 'implementation_ready_environment_validation_required')
assert.equal(report.version, 'document_request_release_readiness_v2')
assert.equal(report.phaseSummaries.length, 10)
assert.ok(report.warningSummary.total > 0, 'Phase 10 should surface managed warnings from earlier gates.')
assert.equal(report.warningSummary.unmanaged, 0, 'Phase 10 should not allow unmanaged warnings.')
assert.ok(
  report.pendingActivationItems.some((item) => item.code === 'seller_portal_request_link_permission_guard'),
  'Phase 10 should carry the seller portal request-link permission guard.',
)
assert.equal(report.activationEvidence.provided, false)
assert.equal(report.activationEvidence.valid, false)
assert.ok(
  report.pendingActivationItems.some((item) => item.code === 'target_environment_evidence_required'),
  'Phase 10 should keep pilot activation closed without target-environment evidence.',
)
assert.equal(report.smokeSummary.coveredAudienceCount, 8)
assert.equal(report.smokeSummary.missingAudienceSmokeCount, 0)

const evidenceDirectory = fs.mkdtempSync('output/document-request-phase10-evidence-')
const evidencePath = `${evidenceDirectory}/verified.json`
const verifiedEvidence = {
  ...evidenceTemplate,
  projectRef: 'redacted-staging-project',
  observedAt: new Date().toISOString(),
  checks: Object.fromEntries(Object.keys(evidenceTemplate.checks).map((key) => [key, true])),
}
fs.writeFileSync(evidencePath, `${JSON.stringify(verifiedEvidence, null, 2)}\n`)
const verifiedOutputPath = `${evidenceDirectory}/report.json`
execFileSync('node', [
  'scripts/document-request-phase10-release-readiness.mjs',
  `--environment-evidence=${evidencePath}`,
  '--require-environment-evidence',
  `--output=${verifiedOutputPath}`,
], { stdio: 'pipe' })
const verifiedReport = JSON.parse(fs.readFileSync(verifiedOutputPath, 'utf8'))
assert.equal(verifiedReport.activationEvidence.valid, true)
assert.equal(verifiedReport.gate.internalPilotReady, true)
assert.equal(verifiedReport.gate.productionActivationReady, false)
assert.equal(verifiedReport.releaseRecommendation, 'environment_verified_managed_warnings_remain')

const missingRequiredEvidence = spawnSync('node', [
  'scripts/document-request-phase10-release-readiness.mjs',
  '--require-environment-evidence',
  `--output=${evidenceDirectory}/missing-report.json`,
], { encoding: 'utf8' })
assert.notEqual(missingRequiredEvidence.status, 0, 'Required environment evidence should fail closed when absent.')
fs.rmSync(evidenceDirectory, { recursive: true, force: true })
assert.ok(
  report.pendingActivationItems.some((item) => item.code === 'legacy_request_fallback_retained'),
  'Phase 10 should carry the legacy request fallback warning.',
)

console.log('document request phase 10 release readiness tests passed')
