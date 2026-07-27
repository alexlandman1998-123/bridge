import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./roleplayer-document-context-operational-readiness.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:roleplayer-document-context:operational'],
  'node scripts/roleplayer-document-context-operational-readiness.mjs',
  'package.json should expose the Phase 5 roleplayer document context operational readiness gate',
)
assert.equal(
  packageJson.scripts['test:roleplayer-document-context-phase5'],
  'node scripts/roleplayer-document-context-phase5.test.mjs',
  'package.json should expose the Phase 5 operational-readiness contract test',
)

assert.match(source, /roleplayer_document_context_operational_readiness_v1/, 'operational readiness should report a stable contract version')
assert.match(source, /phase:\s*'5'/, 'operational readiness should report itself as Phase 5')
assert.match(source, /roleplayer-document-context-operational-readiness/, 'operational readiness should report a stable scope')
assert.match(source, /verify-roleplayer-document-context\.mjs/, 'operational readiness should run the Phase 4 release gate')
assert.match(source, /--fail-fast/, 'operational readiness should use fail-fast release-gate execution')
assert.match(source, /--skip-build/, 'operational readiness should expose a fast preflight mode')
assert.match(source, /ROLEPLAYER_CONTEXT_OPERATIONAL_SKIP_BUILD/, 'operational readiness should expose an environment-controlled build skip')
assert.match(source, /READY_FOR_BUILD_VERIFICATION/, 'operational readiness should distinguish preflight from full sign-off')
assert.match(source, /OPERATIONAL/, 'operational readiness should report full operational success only after build verification')
assert.match(source, /blockedStage:\s*null/, 'operational readiness should include blocked-stage reporting')
assert.match(source, /releaseGate\.blockingReasons/, 'operational readiness should point blockers at the release-gate summary')
assert.match(source, /mutatedData:\s*false/, 'operational readiness must be explicitly read-only')
assert.match(source, /process\.exitCode = 1/, 'operational readiness should fail the process when the release gate fails')

assert.doesNotMatch(source, /createClient/, 'operational readiness should not create a Supabase client directly')
assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(/, 'operational readiness should not mutate application data')

console.log('roleplayer document context phase 5 tests passed')
