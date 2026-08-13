import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const scriptSource = fs.readFileSync('scripts/document-request-phase17-legacy-cleanup-guard.mjs', 'utf8')
const cleanupSource = fs.readFileSync('scripts/document-request-canonical-phase17-legacy-key-cleanup.mjs', 'utf8')
const portalVerifierSource = fs.readFileSync('scripts/document-request-canonical-phase14-portal-verification.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase17-legacy-cleanup-guard.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase17-legacy-cleanup-guard'],
  'node scripts/document-request-phase17-legacy-cleanup-guard.test.mjs',
  'package.json should expose the Phase 17 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase17-legacy-cleanup-guard'],
  'node scripts/document-request-phase17-legacy-cleanup-guard.mjs',
  'package.json should expose the Phase 17 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase17-legacy-cleanup-guard'],
  'npm run verify:document-request-phase16-automation-handoff && npm run test:document-request-phase17-legacy-cleanup-guard && npm run report:document-request-phase17-legacy-cleanup-guard',
  'package.json should expose the Phase 17 verification command.',
)

assert.match(scriptSource, /document_request_phase17_legacy_cleanup_guard/, 'Phase 17 guard script should carry a stable marker.')
assert.match(scriptSource, /document-request-canonical-phase17-legacy-key-cleanup\.mjs/, 'Phase 17 should inspect the guarded cleanup script.')
assert.match(scriptSource, /document-request-canonical-phase14-portal-verification\.mjs/, 'Phase 17 should inspect the portal verifier.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 17 guard should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 17 guard should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 17 guard should not query database tables.')
assert.doesNotMatch(scriptSource, /\.(insert|upsert|update|delete)\(/, 'Phase 17 guard should not mutate data.')
assert.doesNotMatch(scriptSource, /documentGenerator|generateDocument|legalDocument/, 'Phase 17 guard should not touch the document generator.')
assert.match(docs, /Legacy Cleanup Guard/, 'Phase 17 docs should name the phase.')
assert.match(docs, /document generator/i, 'Phase 17 docs should state generator work is out of scope.')

assert.match(cleanupSource, /document_request_phase17_legacy_key_cleanup/, 'Underlying cleanup should carry its phase marker.')
assert.match(cleanupSource, /--commit/, 'Underlying cleanup should support explicit commit mode.')
assert.match(cleanupSource, /--confirm-legacy-cleanup/, 'Underlying cleanup writes should require confirmation.')
assert.match(cleanupSource, /options\.commit\s*!==\s*true/, 'Underlying cleanup should default to dry-run.')
assert.match(cleanupSource, /PRESERVED_REQUIRED_DOCUMENT_STATUSES/, 'Underlying cleanup should guard uploaded/reviewed rows.')
assert.match(cleanupSource, /is_required:\s*false/, 'Underlying cleanup should remove required state.')
assert.match(cleanupSource, /enabled:\s*false/, 'Underlying cleanup should disable rows.')
assert.match(cleanupSource, /status:\s*'not_required'/, 'Underlying cleanup should mark rows not required.')
assert.match(cleanupSource, /visibility_scope:\s*'internal'/, 'Underlying cleanup should hide rows from portals.')
assert.match(cleanupSource, /deletesRows:\s*false/, 'Underlying cleanup should preserve rows.')
assert.doesNotMatch(
  cleanupSource,
  /\.from\('document_requests'\)[\s\S]{0,180}\.(insert|upsert|update|delete)\(/,
  'Underlying cleanup must not write client-facing document_requests rows.',
)

assert.match(portalVerifierSource, /function isActiveRequiredRow/, 'Portal verifier should distinguish active rows.')
assert.match(portalVerifierSource, /\.filter\(isActiveRequiredRow\)/, 'Portal verifier should count only active non-canonical rows.')
assert.match(portalVerifierSource, /status !== 'not_required'/, 'Portal verifier should exclude not-required cleanup rows.')

const outputPath = 'output/document-request-phase17-legacy-cleanup-guard.test.json'
execFileSync('node', ['scripts/document-request-phase17-legacy-cleanup-guard.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase17_legacy_cleanup_guard')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'legacy_cleanup_guard_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.warnings.length, 0)
assert.equal(report.gate.mayProceedToPhase18, true)
assert.equal(report.gate.productionActivationReady, true)
assert.equal(report.readiness.legacyCleanupGuardReady, true)
assert.equal(report.readiness.controlledCleanupDryRunReady, true)
assert.equal(report.readiness.liveCleanupExecuted, false)
assert.equal(report.readiness.commitExecuted, false)
assert.equal(report.readiness.preservesUploadedOrReviewedRows, true)
assert.equal(report.readiness.deletesRows, false)
assert.equal(report.readiness.writesDocumentRequests, false)
assert.equal(report.phase16Readiness.automationHandoffReady, true)
assert.equal(report.cleanupControls.defaultsDryRun, true)
assert.equal(report.cleanupControls.requiresConfirmLegacyCleanup, true)
assert.equal(report.cleanupControls.preservedStatusesGuarded, true)
assert.equal(report.cleanupControls.disableHideOnlyStrategy, true)
assert.equal(report.cleanupControls.preservesRowsInsteadOfDeleting, true)
assert.equal(report.cleanupControls.noDocumentRequestWrites, true)
assert.equal(report.portalVerifierControls.hasActiveRequiredRowFilter, true)
assert.equal(report.portalVerifierControls.inactiveRowsDoNotCountAsNonCanonical, true)

console.log('document request phase 17 legacy cleanup guard tests passed')
