import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase3-manual-listing-copy.mjs', import.meta.url), 'utf8')
const listingsPageSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase3'],
  'node scripts/document-generation-cleanup-phase3-manual-listing-copy.mjs',
  'package.json should expose the Phase 3 manual listing copy cleanup command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase3'],
  'node scripts/document-generation-cleanup-phase3.test.mjs',
  'package.json should expose the Phase 3 manual listing copy cleanup contract test',
)

assert.match(listingsPageSource, /Signed manually, upload later/, 'Quick Add listing should expose signed-manually user copy.')
assert.match(listingsPageSource, /value: 'signed_external_pending_upload'/, 'Quick Add listing should keep the canonical signed_external_pending_upload status value.')

for (const marker of [
  'document_generation_cleanup_phase3_manual_listing_copy_contract_v1',
  'document_generation_cleanup_phase0_freeze_v1',
  'verify:document-generation:cleanup-phase0',
  'DOCUMENT_GENERATION_CLEANUP_PHASE3_RESOLVED',
  'DOCUMENT_GENERATION_CLEANUP_PHASE3_HOLD',
  'phase3_document_generation_baseline_not_frozen',
  'phase3_manual_listing_signed_copy_missing',
  'phase3_manual_listing_status_value_missing',
  'phase3_manual_listing_signed_copy_blocker_still_present',
  'Listing page manual intervention coverage is missing "Signed manually, upload later"',
  'test:agency-rls-manual-audit',
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'manual_listing_quick_add_copy',
  'legacy_cleanup_complete',
  'phaseDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 3 cleanup should include ${marker}`)
}

assert.match(source, /phase:\s*'3'/, 'Phase 3 cleanup should report itself as Phase 3')
assert.match(source, /mutatedData:\s*false/, 'Phase 3 cleanup must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 3 cleanup should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 3 cleanup should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 3 cleanup should fail closed when the baseline changes')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 3 cleanup should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 3 cleanup should not mutate application data')

console.log('document generation cleanup phase 3 tests passed')
