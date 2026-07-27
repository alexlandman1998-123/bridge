import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase9-final-closure.mjs', import.meta.url), 'utf8')
const listingFollowupsTestSource = readFileSync(new URL('./listing-workspace-followups.test.mjs', import.meta.url), 'utf8')
const listingDetailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const listingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase9'],
  'node scripts/document-generation-cleanup-phase9-final-closure.mjs',
  'package.json should expose the Phase 9 final cleanup command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase9'],
  'node scripts/document-generation-cleanup-phase9.test.mjs',
  'package.json should expose the Phase 9 final cleanup contract test',
)

for (const marker of [
  'Manual intervention actions',
  'handleSellerDocumentUpload',
  'sellerProfile.sections.map',
  'Complete skipped Quick Add fields without restarting seller onboarding.',
]) {
  assert.match(listingDetailSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Listing detail should include ${marker}`)
}
for (const marker of [
  'buildListingFollowUpQueue',
  'card.followUpQueue.slice(0, 3)',
  'item.reminderLabel',
]) {
  assert.match(listingsSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Listings page should include ${marker}`)
}
assert.match(listingFollowupsTestSource, /Manual intervention actions/, 'Listing follow-up test should assert the current manual intervention surface')
assert.doesNotMatch(listingFollowupsTestSource, /const followUpActions = useMemo/, 'Listing follow-up test should not require the removed local followUpActions model')

for (const marker of [
  'document_generation_cleanup_phase9_final_closure_v1',
  'document_generation_cleanup_phase0_freeze_v1',
  'verify:document-generation:cleanup-phase0',
  'DOCUMENT_GENERATION_CLEANUP_PHASE9_COMPLETE',
  'DOCUMENT_GENERATION_CLEANUP_PHASE9_HOLD',
  'phase9_document_generation_baseline_not_frozen',
  'phase9_legacy_followup_actions_marker_still_present',
  'listing_workspace_legacy_followup_model',
  'test:agency-rls-manual-audit',
  'test:lead-ingestion',
  'test:lead-ingestion-review',
  'test:quick-add-listing-bypass',
  'test:listing-workspace-followups',
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'listing_workspace_followup_contract',
  'legacy_cleanup_complete',
  'remainingLegacyBlockerCount: 0',
  'phaseDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 9 cleanup should include ${marker}`)
}

assert.match(source, /phase:\s*'9'/, 'Phase 9 cleanup should report itself as Phase 9')
assert.match(source, /mutatedData:\s*false/, 'Phase 9 cleanup must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 9 cleanup should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 9 cleanup should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 9 cleanup should fail closed when the baseline changes')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 9 cleanup should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 9 cleanup should not mutate application data')

console.log('document generation cleanup phase 9 tests passed')
