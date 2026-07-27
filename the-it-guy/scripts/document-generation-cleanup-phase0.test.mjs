import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase0-freeze.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase0'],
  'node scripts/document-generation-cleanup-phase0-freeze.mjs',
  'package.json should expose the Phase 0 document generation freeze command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase0'],
  'node scripts/document-generation-cleanup-phase0.test.mjs',
  'package.json should expose the Phase 0 document generation freeze contract test',
)

for (const marker of [
  'document_generation_cleanup_phase0_freeze_v1',
  'roleplayer_document_context_release_gate_v1',
  'roleplayer_document_context_source_drift_guard_v1',
  'scripts/verify-roleplayer-document-context.mjs',
  'scripts/roleplayer-document-context-phase12-source-drift-guard.mjs',
  'test:otp-phase2-staging-acceptance',
  'test:otp-phase3-launch-hardening',
  'test:signed-otp-transfer-instruction-phase4',
  'DOCUMENT_GENERATION_BASELINE_FROZEN',
  'DOCUMENT_GENERATION_BASELINE_HOLD',
  'phase0_release_gate_failed',
  'phase0_source_drift_guard_failed',
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'lead_listing_legacy_smoke_cleanup',
  'otpGuardPassedSteps',
  'freezeDigest',
]) {
  assert.match(source, new RegExp(marker), `Phase 0 freeze should include ${marker}`)
}

assert.match(source, /phase:\s*'0'/, 'Phase 0 freeze should report itself as Phase 0')
assert.match(source, /mutatedData:\s*false/, 'Phase 0 freeze must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 0 freeze should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 0 freeze should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 0 freeze should fail closed when a guard fails')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 0 freeze should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 0 freeze should not mutate application data')

console.log('document generation cleanup phase 0 tests passed')
