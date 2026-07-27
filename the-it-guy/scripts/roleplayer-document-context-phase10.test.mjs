import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./roleplayer-document-context-phase10-release-receipt.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['receipt:roleplayer-document-context'],
  'node scripts/roleplayer-document-context-phase10-release-receipt.mjs',
  'package.json should expose the Phase 10 release receipt command',
)
assert.equal(
  packageJson.scripts['test:roleplayer-document-context-phase10'],
  'node scripts/roleplayer-document-context-phase10.test.mjs',
  'package.json should expose the Phase 10 release receipt contract test',
)

for (const marker of [
  'roleplayer_document_context_release_receipt_v1',
  'roleplayer_document_context_launch_lock_v1',
  'roleplayer-document-context-phase9-launch-lock.mjs',
  'DEMO_RELEASE_RECEIPTED',
  'RECEIPT_BLOCKED',
  'phase9_launch_lock_not_locked',
  'sourceLaunchLockDigest',
  'receiptDigest',
  'operatorCommands',
  'rollbackPosture',
  'receiptUse',
  'demo_release_clearance',
  'roleplayer-document-context-phase10-release-receipt.json',
  'roleplayer-document-context-phase10-summary.md',
  'roleplayer-document-context-phase10-manifest.json',
]) {
  assert.match(source, new RegExp(marker), `Phase 10 release receipt should include ${marker}`)
}

assert.match(source, /phase:\s*'10'/, 'release receipt should report itself as Phase 10')
assert.match(source, /private-evidence/, 'release receipt should write only under private-evidence')
assert.match(source, /mutatedData:\s*false/, 'release receipt must be explicitly read-only')
assert.match(source, /locked !== true/, 'release receipt must require a locked Phase 9 launch lock')
assert.match(source, /document rendering files change after receipt/, 'release receipt should explain invalidation after renderer changes')
assert.match(source, /process\.exitCode = 1/, 'release receipt should fail the process when launch lock is blocked')

assert.doesNotMatch(source, /createClient/, 'release receipt should not create a Supabase client directly')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'release receipt should not mutate application data')

console.log('roleplayer document context phase 10 tests passed')
