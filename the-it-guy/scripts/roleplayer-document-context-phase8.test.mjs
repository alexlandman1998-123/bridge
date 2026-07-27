import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./roleplayer-document-context-phase8-launch-handoff.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['handoff:roleplayer-document-context'],
  'node scripts/roleplayer-document-context-phase8-launch-handoff.mjs',
  'package.json should expose the Phase 8 launch handoff command',
)
assert.equal(
  packageJson.scripts['test:roleplayer-document-context-phase8'],
  'node scripts/roleplayer-document-context-phase8.test.mjs',
  'package.json should expose the Phase 8 launch handoff contract test',
)

for (const marker of [
  'roleplayer_document_context_launch_handoff_v1',
  'roleplayer-document-context-phase7-release-authority.mjs',
  'READY_FOR_DEMO_HANDOFF',
  'HANDOFF_BLOCKED',
  'phase7_release_authority_not_authorized',
  'sourceAuthorityDigest',
  'handoffDigest',
  'operatorCommands',
  'rollbackPosture',
  'refreshEvidence',
  'verifyAuthority',
  'rerunOperationalGate',
  'fastPreflight',
  'roleplayer-document-context-phase8-handoff.json',
  'roleplayer-document-context-phase8-summary.md',
  'roleplayer-document-context-phase8-manifest.json',
]) {
  assert.match(source, new RegExp(marker), `Phase 8 launch handoff should include ${marker}`)
}

assert.match(source, /phase:\s*'8'/, 'launch handoff should report itself as Phase 8')
assert.match(source, /private-evidence/, 'launch handoff should write only under private-evidence')
assert.match(source, /mutatedData:\s*false/, 'launch handoff must be explicitly read-only')
assert.match(source, /authorized !== true/, 'launch handoff must require Phase 7 authorization')
assert.match(source, /mutatedApplicationData:\s*false/, 'launch handoff should document no application data mutation')
assert.match(source, /databaseRollbackRequired:\s*false/, 'launch handoff should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'launch handoff should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'launch handoff should fail the process when authority is blocked')

assert.doesNotMatch(source, /createClient/, 'launch handoff should not create a Supabase client directly')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'launch handoff should not mutate application data')

console.log('roleplayer document context phase 8 tests passed')
