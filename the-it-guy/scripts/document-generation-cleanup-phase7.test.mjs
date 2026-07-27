import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase7-lead-ingestion-review-contract.mjs', import.meta.url), 'utf8')
const leadReviewTestSource = readFileSync(new URL('./lead-ingestion-review.test.mjs', import.meta.url), 'utf8')
const rolesSource = readFileSync(new URL('../src/lib/roles.js', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase7'],
  'node scripts/document-generation-cleanup-phase7-lead-ingestion-review-contract.mjs',
  'package.json should expose the Phase 7 lead-ingestion-review cleanup command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase7'],
  'node scripts/document-generation-cleanup-phase7.test.mjs',
  'package.json should expose the Phase 7 lead-ingestion-review cleanup contract test',
)

for (const marker of [
  "key: 'pipeline_enquiries'",
  "to: '/pipeline/enquiries'",
]) {
  assert.match(rolesSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Roles nav should include ${marker}`)
}
assert.match(sidebarSource, /pipeline_enquiries: ClipboardList/, 'Sidebar icon map should include pipeline_enquiries')
assert.match(leadReviewTestSource, /key: 'pipeline_enquiries'/, 'Lead ingestion review test should assert current enquiry nav key')
assert.doesNotMatch(leadReviewTestSource, /key: 'enquiries'/, 'Lead ingestion review test should not require the old enquiry nav key')

for (const marker of [
  'document_generation_cleanup_phase7_lead_ingestion_review_contract_v1',
  'document_generation_cleanup_phase0_freeze_v1',
  'verify:document-generation:cleanup-phase0',
  'DOCUMENT_GENERATION_CLEANUP_PHASE7_RESOLVED',
  'DOCUMENT_GENERATION_CLEANUP_PHASE7_HOLD',
  'phase7_document_generation_baseline_not_frozen',
  'phase7_lead_review_legacy_nav_key_blocker_still_present',
  'lead_ingestion_review_legacy_enquiries_nav_key',
  'lead_ingestion_review_contract',
  'test:lead-ingestion-review',
  "key: 'pipeline_enquiries'",
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'lead_ingestion_review_navigation_contract',
  'legacy_cleanup_complete',
  'phaseDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 7 cleanup should include ${marker}`)
}

assert.match(source, /phase:\s*'7'/, 'Phase 7 cleanup should report itself as Phase 7')
assert.match(source, /mutatedData:\s*false/, 'Phase 7 cleanup must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 7 cleanup should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 7 cleanup should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 7 cleanup should fail closed when the baseline changes')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 7 cleanup should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 7 cleanup should not mutate application data')

console.log('document generation cleanup phase 7 tests passed')
