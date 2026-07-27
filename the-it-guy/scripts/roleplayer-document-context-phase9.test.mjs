import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./roleplayer-document-context-phase9-launch-lock.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:roleplayer-document-context:launch-lock'],
  'node scripts/roleplayer-document-context-phase9-launch-lock.mjs',
  'package.json should expose the Phase 9 launch lock verifier',
)
assert.equal(
  packageJson.scripts['test:roleplayer-document-context-phase9'],
  'node scripts/roleplayer-document-context-phase9.test.mjs',
  'package.json should expose the Phase 9 launch lock contract test',
)

for (const marker of [
  'roleplayer_document_context_launch_lock_v1',
  'roleplayer_document_context_launch_handoff_v1',
  'roleplayer_document_context_release_authority_v1',
  'LAUNCH_LOCKED',
  'LAUNCH_HOLD',
  'phase8_handoff_digest_mismatch',
  'phase8_handoff_digest_invalid',
  'phase7_authority_invalid',
  'phase8_authority_binding_invalid',
  'phase8_evidence_binding_invalid',
  'phase8_demo_readiness_incomplete',
  'phase8_operator_command_missing',
  'phase8_rollback_posture_invalid',
  'phase8_handoff_stale',
  'ROLEPLAYER_CONTEXT_LAUNCH_LOCK_MAX_HANDOFF_AGE_MINUTES',
  'lockDigest',
]) {
  assert.match(source, new RegExp(marker), `Phase 9 launch lock should include ${marker}`)
}

assert.match(source, /phase:\s*'9'/, 'launch lock should report itself as Phase 9')
assert.match(source, /mutatedData:\s*false/, 'launch lock must be explicitly read-only')
assert.match(source, /authorized !== true/, 'launch lock must require Phase 7 authorization')
assert.match(source, /handoff\.sourceAuthorityDigest !== authority\.authorityDigest/, 'launch lock must bind handoff to authority digest')
assert.match(source, /handoff\.sourceEvidenceSha256 !== authority\.sourceEvidenceSha256/, 'launch lock must bind handoff to evidence digest')
assert.match(source, /databaseRollbackRequired !== false/, 'launch lock must validate database rollback posture')
assert.match(source, /templateRollbackRequired !== false/, 'launch lock must validate template rollback posture')
assert.match(source, /process\.exitCode = 1/, 'launch lock should fail the process when handoff evidence is not locked')

assert.doesNotMatch(source, /createClient/, 'launch lock should not create a Supabase client directly')
assert.doesNotMatch(source, /writeFileSync|renameSync|\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'launch lock should not mutate files or application data')

console.log('roleplayer document context phase 9 tests passed')
