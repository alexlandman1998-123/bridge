import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const register = fs.readFileSync('docs/document-trust-phase0-legacy-retirement.md', 'utf8')
const script = fs.readFileSync('scripts/document-trust-phase0-legacy-retirement.mjs', 'utf8')

assert.equal(
  packageJson.scripts['test:document-trust-phase0'],
  'node scripts/document-trust-phase0-legacy-retirement.test.mjs',
)
assert.equal(
  packageJson.scripts['report:document-trust-phase0'],
  'node scripts/document-trust-phase0-legacy-retirement.mjs',
)
assert.equal(
  packageJson.scripts['verify:document-trust-phase0'],
  'npm run test:document-trust-phase0 && npm run report:document-trust-phase0',
)
assert.match(register, /## Authoritative lifecycle/)
assert.match(register, /## Retirement register/)
assert.match(register, /## Freeze rules/)
assert.match(register, /document_requirement_instances\.id/)
assert.match(register, /documents\.canonical_requirement_instance_id/)
assert.match(register, /transaction_required_documents/)
assert.match(register, /private_listing_documents/)
assert.match(register, /document_requests/)
assert.match(script, /document_trust_phase0_legacy_retirement/)
assert.match(script, /mutatedData:\s*false/)
assert.doesNotMatch(script, /createClient/)
assert.doesNotMatch(script, /\.from\(/)

const outputPath = 'output/document-trust-phase0-legacy-retirement.test.json'
execFileSync('node', ['scripts/document-trust-phase0-legacy-retirement.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_trust_phase0_legacy_retirement')
assert.equal(report.mutatedData, false)
assert.equal(report.connectsToSupabase, false)
assert.equal(report.gate.status, 'legacy_retirement_register_locked')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.mayProceedToPhase1, true)
assert.ok(report.registeredPaths.every((entry) => entry.ok))

console.log('document trust Phase 0 legacy-retirement tests passed')
