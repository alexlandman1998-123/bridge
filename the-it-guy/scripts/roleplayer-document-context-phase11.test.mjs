import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./roleplayer-document-context-phase11-receipt-verifier.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:roleplayer-document-context:receipt'],
  'node scripts/roleplayer-document-context-phase11-receipt-verifier.mjs',
  'package.json should expose the Phase 11 release receipt verifier',
)
assert.equal(
  packageJson.scripts['test:roleplayer-document-context-phase11'],
  'node scripts/roleplayer-document-context-phase11.test.mjs',
  'package.json should expose the Phase 11 release receipt verifier contract test',
)

for (const marker of [
  'roleplayer_document_context_release_receipt_verifier_v1',
  'roleplayer_document_context_release_receipt_v1',
  'roleplayer_document_context_launch_lock_v1',
  'RELEASE_RECEIPT_VERIFIED',
  'RELEASE_RECEIPT_HOLD',
  'phase10_receipt_file_digest_mismatch',
  'phase10_summary_digest_mismatch',
  'phase10_receipt_digest_invalid',
  'phase9_launch_lock_report_invalid',
  'phase10_launch_lock_binding_invalid',
  'phase10_source_chain_binding_invalid',
  'phase10_demo_readiness_incomplete',
  'phase10_operator_command_missing',
  'phase10_rollback_posture_invalid',
  'phase10_invalidation_policy_missing',
  'phase10_receipt_stale',
  'ROLEPLAYER_CONTEXT_RECEIPT_MAX_AGE_MINUTES',
  'verifierDigest',
]) {
  assert.match(source, new RegExp(marker), `Phase 11 receipt verifier should include ${marker}`)
}

assert.match(source, /phase:\s*'11'/, 'receipt verifier should report itself as Phase 11')
assert.match(source, /mutatedData:\s*false/, 'receipt verifier must be explicitly read-only')
assert.match(source, /receipt\.sourceLaunchLockDigest !== launchLock\.lockDigest/, 'receipt verifier must bind receipt to launch lock digest')
assert.match(source, /manifest\.sourceLaunchLockDigest !== receipt\.sourceLaunchLockDigest/, 'receipt verifier must bind manifest to receipt launch-lock digest')
assert.match(source, /receipt\.rollbackPosture\?\.databaseRollbackRequired !== false/, 'receipt verifier must validate database rollback posture')
assert.match(source, /receipt\.rollbackPosture\?\.templateRollbackRequired !== false/, 'receipt verifier must validate template rollback posture')
assert.match(source, /process\.exitCode = 1/, 'receipt verifier should fail the process when receipt evidence is not verified')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'receipt verifier should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'receipt verifier should not mutate application data')

console.log('roleplayer document context phase 11 tests passed')
