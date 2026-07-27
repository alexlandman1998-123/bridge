import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase6-lead-ingestion-contract.mjs', import.meta.url), 'utf8')
const leadIngestionTestSource = readFileSync(new URL('./lead-ingestion.test.mjs', import.meta.url), 'utf8')
const leadPageSource = readFileSync(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase6'],
  'node scripts/document-generation-cleanup-phase6-lead-ingestion-contract.mjs',
  'package.json should expose the Phase 6 lead-ingestion cleanup command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase6'],
  'node scripts/document-generation-cleanup-phase6.test.mjs',
  'package.json should expose the Phase 6 lead-ingestion cleanup contract test',
)

for (const marker of [
  'OwnershipCard',
  'buildSellerLeadMandateWorkspacePath',
  'DOCUMENT_START_ENTRY_POINTS\\.sellerLeadMandate',
]) {
  assert.ok(leadIngestionTestSource.includes(marker), `Lead ingestion test should include ${marker}`)
}

for (const marker of [
  'OwnershipCard',
  'buildSellerLeadMandateWorkspacePath',
  'DOCUMENT_START_ENTRY_POINTS.sellerLeadMandate',
]) {
  assert.match(leadPageSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Lead page should include ${marker}`)
}

assert.doesNotMatch(leadIngestionTestSource, /SellerOwnershipSummaryCard/, 'Lead ingestion test should not require the removed seller ownership component name')

for (const marker of [
  'document_generation_cleanup_phase6_lead_ingestion_contract_v1',
  'document_generation_cleanup_phase0_freeze_v1',
  'verify:document-generation:cleanup-phase0',
  'DOCUMENT_GENERATION_CLEANUP_PHASE6_RESOLVED',
  'DOCUMENT_GENERATION_CLEANUP_PHASE6_HOLD',
  'phase6_document_generation_baseline_not_frozen',
  'phase6_legacy_seller_ownership_marker_still_present',
  'lead_ingestion_seller_workspace_legacy_card',
  'lead_ingestion_seller_mandate_route_builder',
  'test:lead-ingestion',
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'lead_ingestion_contract',
  'legacy_cleanup_complete',
  'phaseDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 6 cleanup should include ${marker}`)
}

assert.match(source, /phase:\s*'6'/, 'Phase 6 cleanup should report itself as Phase 6')
assert.match(source, /mutatedData:\s*false/, 'Phase 6 cleanup must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 6 cleanup should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 6 cleanup should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 6 cleanup should fail closed when the baseline changes')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 6 cleanup should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 6 cleanup should not mutate application data')

console.log('document generation cleanup phase 6 tests passed')
