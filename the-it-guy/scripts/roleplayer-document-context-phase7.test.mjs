import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./roleplayer-document-context-phase7-release-authority.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:roleplayer-document-context:release-authority'],
  'node scripts/roleplayer-document-context-phase7-release-authority.mjs',
  'package.json should expose the Phase 7 release authority check',
)
assert.equal(
  packageJson.scripts['test:roleplayer-document-context-phase7'],
  'node scripts/roleplayer-document-context-phase7.test.mjs',
  'package.json should expose the Phase 7 release-authority contract test',
)

for (const marker of [
  'roleplayer_document_context_release_authority_v1',
  'roleplayer_document_context_phase6_evidence_v1',
  'READY_FOR_DEMO_RELEASE',
  'RELEASE_HOLD',
  'phase6_evidence_digest_mismatch',
  'phase6_evidence_not_release_ready',
  'phase5_operational_readiness_invalid',
  'phase4_build_verification_skipped',
  'phase6_privacy_marker_missing',
  'phase6_evidence_stale',
  'authorityDigest',
  'ROLEPLAYER_CONTEXT_RELEASE_MAX_EVIDENCE_AGE_MINUTES',
]) {
  assert.match(source, new RegExp(marker), `Phase 7 release authority should include ${marker}`)
}

assert.match(source, /phase:\s*'7'/, 'release authority should report itself as Phase 7')
assert.match(source, /mutatedData:\s*false/, 'release authority must be explicitly read-only')
assert.match(source, /readyForRelease !== true/, 'release authority must require Phase 6 release readiness')
assert.match(source, /skippedBuild === true/, 'release authority must reject evidence that skipped production build')
assert.match(source, /sellerNames'[\s\S]*sellerIdNumbers'[\s\S]*signatures'[\s\S]*documentHtml'[\s\S]*generatedPdfFiles'/, 'release authority should require privacy omission markers')
assert.match(source, /process\.exitCode = 1/, 'release authority should fail the process when evidence is not authorized')

assert.doesNotMatch(source, /createClient/, 'release authority should not create a Supabase client directly')
assert.doesNotMatch(source, /writeFileSync|renameSync|\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'release authority should not mutate files or application data')

console.log('roleplayer document context phase 7 tests passed')
