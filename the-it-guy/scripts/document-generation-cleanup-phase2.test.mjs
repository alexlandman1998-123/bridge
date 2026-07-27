import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase2-lead-assignment.mjs', import.meta.url), 'utf8')
const leadPageSource = readFileSync(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase2'],
  'node scripts/document-generation-cleanup-phase2-lead-assignment.mjs',
  'package.json should expose the Phase 2 lead assignment cleanup command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase2'],
  'node scripts/document-generation-cleanup-phase2.test.mjs',
  'package.json should expose the Phase 2 lead assignment cleanup contract test',
)

assert.match(leadPageSource, /Manage Assignment/, 'Lead workspace should expose Manage Assignment copy for manual reassignment.')

for (const marker of [
  'document_generation_cleanup_phase2_lead_assignment_ui_contract_v1',
  'document_generation_cleanup_phase0_freeze_v1',
  'verify:document-generation:cleanup-phase0',
  'DOCUMENT_GENERATION_CLEANUP_PHASE2_RESOLVED',
  'DOCUMENT_GENERATION_CLEANUP_PHASE2_HOLD',
  'phase2_document_generation_baseline_not_frozen',
  'phase2_lead_assignment_ui_marker_missing',
  'phase2_lead_assignment_blocker_still_present',
  'test:agency-rls-manual-audit',
  'Lead page manual intervention coverage is missing "Manage Assignment"',
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'legacy_cleanup_complete',
  'lead_assignment_ui_copy',
  'phaseDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 2 cleanup should include ${marker}`)
}

assert.match(source, /phase:\s*'2'/, 'Phase 2 cleanup should report itself as Phase 2')
assert.match(source, /mutatedData:\s*false/, 'Phase 2 cleanup must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 2 cleanup should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 2 cleanup should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 2 cleanup should fail closed when the baseline changes')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 2 cleanup should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 2 cleanup should not mutate application data')

console.log('document generation cleanup phase 2 tests passed')
