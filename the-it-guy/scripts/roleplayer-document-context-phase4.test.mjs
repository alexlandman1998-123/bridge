import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const releaseGateSource = readFileSync(new URL('./verify-roleplayer-document-context.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:roleplayer-document-context'],
  'node scripts/verify-roleplayer-document-context.mjs',
  'package.json should expose the Phase 4 roleplayer context release gate',
)
assert.equal(
  packageJson.scripts['test:roleplayer-document-context-phase4'],
  'node scripts/roleplayer-document-context-phase4.test.mjs',
  'package.json should expose the Phase 4 release-gate contract test',
)

for (const requiredCommand of [
  'test:seller-annexure-a-demo-freeze',
  'test:roleplayer-document-context-phase1',
  'test:roleplayer-document-context-phase2',
  'test:roleplayer-document-context-phase3',
  'cross-module-document-consistency-phase4.test.mjs',
  'document-start-phase3.test.mjs',
  'mandate-attorney-allocation-phase1.test.mjs',
  'seller-document-source-of-truth.test.mjs',
  'client-portal-document-centre-phase4.test.mjs',
  'canonical-document-adapters.test.mjs',
  "args: ['run', 'build']",
]) {
  assert.match(releaseGateSource, new RegExp(requiredCommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `release gate should run ${requiredCommand}`)
}

assert.match(releaseGateSource, /roleplayer_document_context_release_gate_v1/, 'release gate should report a stable contract version')
assert.match(releaseGateSource, /phase:\s*'4'/, 'release gate should report itself as Phase 4')
assert.match(releaseGateSource, /mutatedData:\s*false/, 'release gate must be explicitly read-only')
assert.match(releaseGateSource, /--skip-build/, 'release gate should expose an explicit build skip for fast preflight checks')
assert.match(releaseGateSource, /--fail-fast/, 'release gate should expose fail-fast mode for quick local diagnosis')
assert.match(releaseGateSource, /process\.exitCode = 1/, 'release gate should fail the process when any guard fails')
assert.doesNotMatch(releaseGateSource, /createClient/, 'release gate should not create a Supabase client directly')
assert.doesNotMatch(releaseGateSource, /\.(insert|update|upsert|delete)\(/, 'release gate should not mutate application data')

console.log('roleplayer document context phase 4 tests passed')
