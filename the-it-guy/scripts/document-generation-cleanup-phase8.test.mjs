import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase8-quick-add-listing-contract.mjs', import.meta.url), 'utf8')
const quickAddTestSource = readFileSync(new URL('./quick-add-listing-bypass.test.mjs', import.meta.url), 'utf8')
const listingsPageSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase8'],
  'node scripts/document-generation-cleanup-phase8-quick-add-listing-contract.mjs',
  'package.json should expose the Phase 8 Quick Add listing cleanup command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase8'],
  'node scripts/document-generation-cleanup-phase8.test.mjs',
  'package.json should expose the Phase 8 Quick Add listing cleanup contract test',
)

for (const marker of [
  "if (normalized === 'signed_uploaded') return 'signed_external_pending_upload'",
  'signed: false',
  'function resolveQuickListingStatus(form)',
  "return 'listing_review'",
  'function canQuickListingActivateWithMandateStatus()',
  'Manual mandate evidence upload outstanding',
]) {
  assert.match(listingsPageSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Listings page should include ${marker}`)
}
for (const marker of [
  "if \\(normalized === 'signed_uploaded'\\) return 'signed_external_pending_upload'",
  'signed: false',
  'resolveQuickListingStatus',
  'sellerUpdatePayload\\.listingStatus',
  'Manual mandate evidence upload outstanding',
]) {
  assert.ok(quickAddTestSource.includes(marker), `Quick Add test should include ${marker}`)
}
for (const legacyMarker of [
  "mandateStatus === 'signed_uploaded' ? 'signed_external_pending_upload' : mandateStatus",
  "sellerUpdatePayload.listingStatus = 'active'",
]) {
  assert.equal(quickAddTestSource.includes(legacyMarker), false, `Quick Add test should not require ${legacyMarker}`)
}

for (const marker of [
  'document_generation_cleanup_phase8_quick_add_listing_contract_v1',
  'document_generation_cleanup_phase0_freeze_v1',
  'verify:document-generation:cleanup-phase0',
  'DOCUMENT_GENERATION_CLEANUP_PHASE8_RESOLVED',
  'DOCUMENT_GENERATION_CLEANUP_PHASE8_HOLD',
  'phase8_document_generation_baseline_not_frozen',
  'phase8_quick_add_old_transition_blocker_still_present',
  'quick_add_listing_old_signed_uploaded_transition',
  'quick_add_listing_local_active_promotion',
  'quick_add_listing_contract',
  'test:quick-add-listing-bypass',
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'quick_add_listing_contract',
  'legacy_cleanup_complete',
  'phaseDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 8 cleanup should include ${marker}`)
}

assert.match(source, /phase:\s*'8'/, 'Phase 8 cleanup should report itself as Phase 8')
assert.match(source, /mutatedData:\s*false/, 'Phase 8 cleanup must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 8 cleanup should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 8 cleanup should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 8 cleanup should fail closed when the baseline changes')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 8 cleanup should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 8 cleanup should not mutate application data')

console.log('document generation cleanup phase 8 tests passed')
