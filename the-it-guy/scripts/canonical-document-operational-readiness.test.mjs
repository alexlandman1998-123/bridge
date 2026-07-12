import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'scripts/canonical-document-operational-readiness.mjs'), 'utf8')

assert.equal(
  packageJson.scripts['verify:canonical-documents:operational'],
  'node scripts/canonical-document-operational-readiness.mjs',
  'package.json should expose the Phase 7 canonical document operational gate',
)

assert.equal(
  packageJson.scripts['test:canonical-document-operational-readiness'],
  'node scripts/canonical-document-operational-readiness.test.mjs',
  'package.json should expose the Phase 7 operational gate contract test',
)

assert.match(source, /phase:\s*'7'/, 'operational gate should report itself as Phase 7')
assert.match(source, /canonical-document-real-staging-dry-run\.mjs/, 'operational gate should run the real-staging parity verifier')
assert.match(source, /canonical-document-browser-actor-readiness\.mjs/, 'operational gate should run the browser actor readiness verifier')
assert.match(source, /canonical-document-browser-staging-smoke\.mjs/, 'operational gate should run the browser smoke only after prerequisites pass')
assert.match(source, /--skip-parity/, 'operational gate should not duplicate the parity gate inside browser smoke')
assert.match(source, /--skip-actor-readiness/, 'operational gate should not duplicate the actor gate inside browser smoke')
assert.match(source, /blockedStage/, 'operational report should identify the blocked stage')
assert.match(source, /actor_readiness/, 'operational report should stop explicitly at actor readiness when permissions block the smoke')
assert.match(source, /CANONICAL_OPERATIONAL_SKIP_BROWSER_SMOKE/, 'operational gate should expose an explicit browser-smoke skip for preflight-only checks')
assert.match(source, /mutatedData:\s*false/, 'operational gate should explicitly report that it does not mutate staging data')
assert.match(source, /READY_FOR_BROWSER_SMOKE/, 'operational gate should distinguish preflight-ready from fully operational')
assert.match(source, /OPERATIONAL/, 'operational gate should report full operational success only after browser smoke passes')

assert.doesNotMatch(source, /createClient/, 'operational gate should not create a Supabase client directly')
assert.doesNotMatch(source, /bootstrap_attorney_firm_admin_membership/, 'operational gate should not bootstrap permissions directly')
assert.doesNotMatch(source, /\.insert\(/, 'operational gate should not insert staging data')
assert.doesNotMatch(source, /\.update\(/, 'operational gate should not update staging data')
assert.doesNotMatch(source, /\.upsert\(/, 'operational gate should not upsert staging data')
assert.doesNotMatch(source, /\.delete\(/, 'operational gate should not delete staging data')

console.log('canonical-document-operational-readiness tests passed')
