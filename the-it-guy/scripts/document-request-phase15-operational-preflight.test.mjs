import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const scriptSource = fs.readFileSync('scripts/document-request-phase15-operational-preflight.mjs', 'utf8')
const rolloutSource = fs.readFileSync('scripts/document-request-canonical-phase15-operational-rollout.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase15-operational-preflight.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase15-operational-preflight'],
  'node scripts/document-request-phase15-operational-preflight.test.mjs',
  'package.json should expose the Phase 15 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase15-operational-preflight'],
  'node scripts/document-request-phase15-operational-preflight.mjs',
  'package.json should expose the Phase 15 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase15-operational-preflight'],
  'npm run verify:document-request-phase14-cross-workspace-parity && npm run test:document-request-phase15-operational-preflight && npm run report:document-request-phase15-operational-preflight',
  'package.json should expose the Phase 15 verification command.',
)

assert.match(scriptSource, /document_request_phase15_operational_preflight/, 'Phase 15 script should carry a stable marker.')
assert.match(scriptSource, /document-request-canonical-phase15-operational-rollout\.mjs/, 'Phase 15 should inspect the guarded rollout script.')
assert.match(scriptSource, /document-request-canonical-phase14-portal-verification\.mjs/, 'Phase 15 should require portal postcheck evidence.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 15 preflight should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 15 preflight should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 15 preflight should not query database tables.')
assert.doesNotMatch(scriptSource, /\.(insert|upsert|update|delete)\(/, 'Phase 15 preflight should not mutate data.')
assert.doesNotMatch(scriptSource, /documentGenerator|generateDocument|legalDocument/, 'Phase 15 preflight should not touch the document generator.')
assert.match(docs, /Operational Preflight/, 'Phase 15 docs should name the phase.')
assert.match(docs, /document generator/i, 'Phase 15 docs should state generator work is out of scope.')

assert.match(rolloutSource, /--commit/, 'Underlying rollout should support explicit commit mode.')
assert.match(rolloutSource, /--confirm-operational-rollout/, 'Underlying rollout writes should require confirmation.')
assert.match(rolloutSource, /options\.dryRun\s*=\s*options\.commit\s*!==\s*true/, 'Underlying rollout should default to dry-run.')
assert.match(rolloutSource, /dryRun:\s*!options\.commit/, 'Underlying rollout should pass dryRun until commit is explicit.')
assert.match(rolloutSource, /MAX_OPERATIONAL_ROLLOUT_TRANSACTIONS\s*=\s*25/, 'Underlying rollout should cap default rollout size.')
assert.match(rolloutSource, /preservedRowsChanged/, 'Underlying rollout should audit preserved upload/review rows.')
assert.match(rolloutSource, /documentRequestsDelta/, 'Underlying rollout should audit document request row deltas.')
assert.doesNotMatch(
  rolloutSource,
  /\.from\('document_requests'\)[\s\S]{0,180}\.(insert|upsert|update|delete)\(/,
  'Underlying rollout must not write client-facing document_requests rows.',
)

const outputPath = 'output/document-request-phase15-operational-preflight.test.json'
execFileSync('node', ['scripts/document-request-phase15-operational-preflight.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase15_operational_preflight')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'operational_preflight_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.warnings.length, 0)
assert.equal(report.gate.mayProceedToPhase16, true)
assert.equal(report.gate.productionActivationReady, true)
assert.equal(report.readiness.localPreflightReady, true)
assert.equal(report.readiness.controlledDryRunReady, true)
assert.equal(report.readiness.liveRolloutExecuted, false)
assert.equal(report.readiness.commitExecuted, false)
assert.equal(report.readiness.documentRequestsWriteDebt, false)
assert.equal(report.rolloutControls.defaultsDryRun, true)
assert.equal(report.rolloutControls.confirmationFlag, true)
assert.equal(report.rolloutControls.runsPortalPostcheck, true)
assert.equal(report.rolloutControls.noDocumentRequestWrites, true)
assert.equal(report.rolloutControls.noRawPortalTokenLeak, true)

for (const summary of report.phaseSummaries) {
  assert.equal(summary.present, true, `${summary.key} report should exist.`)
  assert.equal(summary.phaseMatches, true, `${summary.key} phase should match.`)
  assert.equal(summary.mutatedData, false, `${summary.key} should be read-only.`)
  assert.equal(summary.failedCount, 0, `${summary.key} should not have failures.`)
}

console.log('document request phase 15 operational preflight tests passed')
