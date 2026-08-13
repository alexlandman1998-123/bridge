import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const scriptSource = fs.readFileSync('scripts/document-request-phase16-automation-handoff.mjs', 'utf8')
const automationSource = fs.readFileSync('scripts/document-request-canonical-phase16-automation.mjs', 'utf8')
const cronSource = fs.readFileSync('api/cron/document-request-canonical-automation.js', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase16-automation-handoff.md', 'utf8')
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))

assert.equal(
  packageJson.scripts['test:document-request-phase16-automation-handoff'],
  'node scripts/document-request-phase16-automation-handoff.test.mjs',
  'package.json should expose the Phase 16 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase16-automation-handoff'],
  'node scripts/document-request-phase16-automation-handoff.mjs',
  'package.json should expose the Phase 16 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase16-automation-handoff'],
  'npm run verify:document-request-phase15-operational-preflight && npm run test:document-request-phase16-automation-handoff && npm run report:document-request-phase16-automation-handoff',
  'package.json should expose the Phase 16 verification command.',
)

assert.match(scriptSource, /document_request_phase16_automation_handoff/, 'Phase 16 script should carry a stable marker.')
assert.match(scriptSource, /document-request-canonical-phase16-automation\.mjs/, 'Phase 16 should inspect the guarded automation script.')
assert.match(scriptSource, /document-request-canonical-automation\.js/, 'Phase 16 should inspect the cron endpoint.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 16 handoff should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 16 handoff should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 16 handoff should not query database tables.')
assert.doesNotMatch(scriptSource, /\.(insert|upsert|update|delete)\(/, 'Phase 16 handoff should not mutate data.')
assert.doesNotMatch(scriptSource, /documentGenerator|generateDocument|legalDocument/, 'Phase 16 handoff should not touch the document generator.')
assert.match(docs, /Automation Handoff/, 'Phase 16 docs should name the phase.')
assert.match(docs, /document generator/i, 'Phase 16 docs should state generator work is out of scope.')

assert.match(automationSource, /document_request_phase16_automation/, 'Underlying automation should carry its phase marker.')
assert.match(automationSource, /document-request-canonical-phase15-operational-rollout\.mjs/, 'Underlying automation should reuse Phase 15 rollout.')
assert.match(automationSource, /--commit/, 'Underlying automation should support explicit commit mode.')
assert.match(automationSource, /--confirm-automation/, 'Underlying automation writes should require confirmation.')
assert.match(automationSource, /const dryRun = options\.commit !== true/, 'Underlying automation should default to dry-run.')
assert.match(automationSource, /legacy_non_canonical_keys_present/, 'Underlying automation should block legacy keys by default.')
assert.match(automationSource, /--allow-legacy-keys/, 'Underlying automation should require explicit legacy override.')
assert.match(automationSource, /process\.exitCode\s*=\s*2/, 'Underlying automation should fail blocked commits distinctly.')
assert.doesNotMatch(
  automationSource,
  /\.from\('document_requests'\)[\s\S]{0,180}\.(insert|upsert|update|delete)\(/,
  'Underlying automation must not write client-facing document_requests rows directly.',
)

assert.match(cronSource, /CRON_SECRET/, 'Cron endpoint should require CRON_SECRET authorization.')
assert.match(cronSource, /DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT/, 'Cron endpoint should only write when commit env is enabled.')
assert.match(cronSource, /DOCUMENT_REQUEST_CANONICAL_AUTOMATION_ALLOW_LEGACY_KEYS/, 'Cron endpoint should require explicit legacy override.')
assert.match(cronSource, /sanitizeReport/, 'Cron endpoint should return sanitized reports.')
assert.doesNotMatch(cronSource, /seller_workspace_token|portal_token|access_token/i, 'Cron endpoint should not expose raw portal tokens.')
assert.ok(
  Array.isArray(vercel.crons) &&
    vercel.crons.filter((job) => job.path === '/api/cron/document-request-canonical-automation').length === 1,
  'Document request automation cron should be registered exactly once.',
)

const outputPath = 'output/document-request-phase16-automation-handoff.test.json'
execFileSync('node', ['scripts/document-request-phase16-automation-handoff.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase16_automation_handoff')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'automation_handoff_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.warnings.length, 0)
assert.equal(report.gate.mayProceedToPhase17, true)
assert.equal(report.gate.productionActivationReady, true)
assert.equal(report.readiness.automationHandoffReady, true)
assert.equal(report.readiness.cronCompatibleDryRunReady, true)
assert.equal(report.readiness.liveAutomationExecuted, false)
assert.equal(report.readiness.commitExecuted, false)
assert.equal(report.phase15Readiness.controlledDryRunReady, true)
assert.equal(report.automationControls.defaultsDryRun, true)
assert.equal(report.automationControls.requiresConfirmAutomation, true)
assert.equal(report.automationControls.blocksLegacyKeysByDefault, true)
assert.equal(report.automationControls.doesNotWriteDocumentRequestsDirectly, true)
assert.equal(report.cronControls.requiresCronSecret, true)
assert.equal(report.cronControls.defaultsToDryRun, true)
assert.equal(report.cronControls.responseSanitized, true)
assert.equal(report.cronControls.noRawPortalTokenLeak, true)
assert.equal(report.schedulingControls.scheduled, true)
assert.equal(report.schedulingControls.scheduleMatches, true)

console.log('document request phase 16 automation handoff tests passed')
