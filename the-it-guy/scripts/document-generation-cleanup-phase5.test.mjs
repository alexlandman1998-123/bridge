import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase5-listing-detail-actions.mjs', import.meta.url), 'utf8')
const listingDetailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase5'],
  'node scripts/document-generation-cleanup-phase5-listing-detail-actions.mjs',
  'package.json should expose the Phase 5 listing-detail cleanup command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase5'],
  'node scripts/document-generation-cleanup-phase5.test.mjs',
  'package.json should expose the Phase 5 listing-detail cleanup contract test',
)

for (const marker of [
  'Manual intervention actions',
  'Add seller contact',
  'Add seller ID / registration number',
  'Add seller FICA',
  'Open Mandate',
  'Generate Mandate',
  'Upload signed mandate',
  'Signed manually',
  'Confirm commission',
  'Add photos',
  'Add external listing link',
  'Seller onboarding link copied. Add seller contact details before sending it directly.',
]) {
  assert.match(listingDetailSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Listing detail should include ${marker}`)
}

for (const marker of [
  'document_generation_cleanup_phase5_listing_detail_actions_contract_v1',
  'document_generation_cleanup_phase0_freeze_v1',
  'verify:document-generation:cleanup-phase0',
  'DOCUMENT_GENERATION_CLEANUP_PHASE5_RESOLVED',
  'DOCUMENT_GENERATION_CLEANUP_PHASE5_HOLD',
  'phase5_document_generation_baseline_not_frozen',
  'phase5_listing_detail_identity_blocker_still_present',
  'agency_rls_listing_detail_identity_copy',
  'test:agency-rls-manual-audit',
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'listing_detail_manual_intervention_actions',
  'legacy_cleanup_complete',
  'phaseDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 5 cleanup should include ${marker}`)
}

assert.match(source, /phase:\s*'5'/, 'Phase 5 cleanup should report itself as Phase 5')
assert.match(source, /mutatedData:\s*false/, 'Phase 5 cleanup must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 5 cleanup should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 5 cleanup should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 5 cleanup should fail closed when the baseline changes')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 5 cleanup should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 5 cleanup should not mutate application data')

console.log('document generation cleanup phase 5 tests passed')
