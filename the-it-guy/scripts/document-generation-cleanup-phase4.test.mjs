import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase4-listing-followups.mjs', import.meta.url), 'utf8')
const listingsPageSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase4'],
  'node scripts/document-generation-cleanup-phase4-listing-followups.mjs',
  'package.json should expose the Phase 4 listing follow-up cleanup command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase4'],
  'node scripts/document-generation-cleanup-phase4.test.mjs',
  'package.json should expose the Phase 4 listing follow-up cleanup contract test',
)

for (const marker of [
  'Listing follow-ups',
  'card.followUpQueue.slice(0, 3)',
  'item.reminderLabel',
]) {
  assert.match(listingsPageSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Listing card render should include ${marker}`)
}

for (const marker of [
  'document_generation_cleanup_phase4_listing_followups_contract_v1',
  'document_generation_cleanup_phase0_freeze_v1',
  'verify:document-generation:cleanup-phase0',
  'DOCUMENT_GENERATION_CLEANUP_PHASE4_RESOLVED',
  'DOCUMENT_GENERATION_CLEANUP_PHASE4_HOLD',
  'phase4_document_generation_baseline_not_frozen',
  'phase4_listing_followups_blocker_still_present',
  'agency_rls_manual_listing_followups_copy',
  'manual_listing_oversight_removed_followup_copy',
  'manual_listing_reminders_due_label_binding',
  'test:manual-listing-oversight',
  'test:manual-listing-reminders',
  'test:agency-rls-manual-audit',
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'listing_card_followup_preview',
  'legacy_cleanup_complete',
  'phaseDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 4 cleanup should include ${marker}`)
}

assert.match(source, /phase:\s*'4'/, 'Phase 4 cleanup should report itself as Phase 4')
assert.match(source, /mutatedData:\s*false/, 'Phase 4 cleanup must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 4 cleanup should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 4 cleanup should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 4 cleanup should fail closed when the baseline changes')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 4 cleanup should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 4 cleanup should not mutate application data')

console.log('document generation cleanup phase 4 tests passed')
