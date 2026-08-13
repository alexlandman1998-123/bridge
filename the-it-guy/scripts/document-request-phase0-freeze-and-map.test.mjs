import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const source = fs.readFileSync('scripts/document-request-phase0-freeze-and-map.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase0-freeze-and-map.md', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(
  packageJson.scripts['test:document-request-phase0-freeze-and-map'],
  'node scripts/document-request-phase0-freeze-and-map.test.mjs',
  'package.json should expose the Phase 0 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase0-freeze-and-map'],
  'node scripts/document-request-phase0-freeze-and-map.mjs',
  'package.json should expose the Phase 0 read-only report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase0-freeze-and-map'],
  'npm run test:document-request-phase0-freeze-and-map && npm run report:document-request-phase0-freeze-and-map',
  'package.json should expose the Phase 0 verification command.',
)

assert.match(source, /document_request_phase0_freeze_and_map/, 'Phase 0 script should carry a stable phase marker.')
assert.match(source, /mutatedData:\s*false/, 'Phase 0 report should explicitly state that no data was mutated.')
assert.match(source, /commit:\s*false/, 'Phase 0 report should explicitly state that commit mode is unavailable.')
assert.match(source, /createTransactionDocumentRequests/, 'Phase 0 should map the shared request-container API.')
assert.match(source, /requestAttorneyWorkflowLaneDocument/, 'Phase 0 should map attorney lane request divergence.')
assert.match(source, /property_acquisition_record/, 'Phase 0 should freeze the acquisition-record key for review.')
assert.match(source, /capital_improvement_records/, 'Phase 0 should freeze the capital-improvement key for review.')
assert.match(source, /BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION/, 'Phase 0 should map bond document rules.')
assert.match(source, /deriveOnboardingConfiguration/, 'Phase 0 should map buyer onboarding requirement generation.')
assert.match(source, /buildDocumentCenter/, 'Phase 0 should map client portal document projection.')
assert.doesNotMatch(source, /createClient/, 'Phase 0 should not connect to Supabase.')
assert.doesNotMatch(source, /\.from\(/, 'Phase 0 should not query or mutate database tables.')
assert.doesNotMatch(
  source,
  /\.from\([\s\S]{0,240}\.(insert|upsert|update|delete)\(/,
  'Phase 0 should not perform direct database writes.',
)

assert.match(docs, /Phase 0: Freeze And Map/, 'Phase 0 docs should identify the phase.')
assert.match(docs, /No runtime behaviour changes/, 'Phase 0 docs should state the freeze boundary.')
assert.match(docs, /property_acquisition_record/, 'Phase 0 docs should call out acquisition records.')
assert.match(docs, /capital_improvement_records/, 'Phase 0 docs should call out improvement records.')
assert.match(docs, /bond originator/i, 'Phase 0 docs should include bond-originator request coverage.')
assert.match(docs, /attorney/i, 'Phase 0 docs should include attorney request coverage.')

const outputPath = 'output/document-request-phase0-freeze-and-map.test.json'
execFileSync('node', ['scripts/document-request-phase0-freeze-and-map.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase0_freeze_and_map')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.scope.buyer, true)
assert.equal(report.scope.seller, true)
assert.equal(report.scope.attorney, true)
assert.equal(report.scope.bondOriginator, true)
assert.ok(report.surfaces.length >= 15, 'Phase 0 should inventory all document-request surfaces.')
assert.equal(report.gate.missingFiles.length, 0, 'Phase 0 mapped files should exist.')
assert.ok(report.canonicalPolicy.requirementCount >= 50, 'Phase 0 should summarize the canonical policy matrix.')
assert.ok(
  report.deferredOrSuspiciousKeys.some((item) => item.key === 'property_acquisition_record' && item.currentlyPresentInSource),
  'Phase 0 should detect the acquisition-record source key.',
)
assert.ok(
  report.deferredOrSuspiciousKeys.some((item) => item.key === 'capital_improvement_records' && item.currentlyPresentInSource),
  'Phase 0 should detect the capital-improvement source key.',
)

console.log('document request phase 0 freeze and map tests passed')
