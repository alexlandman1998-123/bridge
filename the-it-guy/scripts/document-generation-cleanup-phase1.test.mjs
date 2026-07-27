import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('./document-generation-cleanup-phase1-inventory.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts['verify:document-generation:cleanup-phase1'],
  'node scripts/document-generation-cleanup-phase1-inventory.mjs',
  'package.json should expose the Phase 1 legacy inventory command',
)
assert.equal(
  packageJson.scripts['test:document-generation-cleanup-phase1'],
  'node scripts/document-generation-cleanup-phase1.test.mjs',
  'package.json should expose the Phase 1 legacy inventory contract test',
)

for (const marker of [
  'document_generation_cleanup_phase1_legacy_inventory_v1',
  'document_generation_cleanup_phase0_freeze_v1',
  'verify:document-generation:cleanup-phase0',
  'DOCUMENT_GENERATION_LEGACY_SMOKE_INVENTORY_CAPTURED',
  'DOCUMENT_GENERATION_LEGACY_SMOKE_INVENTORY_HOLD',
  'phase1_document_generation_baseline_not_frozen',
  'seller_annexure_a',
  'seller_mandate',
  'seller_otp_document_context',
  'signed_otp_attorney_instruction',
  'legacy_cleanup_complete',
  'inventoryDigest',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 1 inventory should include ${marker}`)
}

assert.match(source, /phase:\s*'1'/, 'Phase 1 inventory should report itself as Phase 1')
assert.match(source, /mutatedData:\s*false/, 'Phase 1 inventory must be explicitly read-only')
assert.match(source, /databaseRollbackRequired:\s*false/, 'Phase 1 inventory should document no database rollback requirement')
assert.match(source, /templateRollbackRequired:\s*false/, 'Phase 1 inventory should document no template rollback requirement')
assert.match(source, /process\.exitCode = 1/, 'Phase 1 inventory should fail closed when the baseline changes')

assert.doesNotMatch(source, /writeFileSync|renameSync|createClient/, 'Phase 1 inventory should not write files or create a Supabase client')
assert.doesNotMatch(source, /\.from\(|\.insert\(|\.upsert\(|\.delete\(/, 'Phase 1 inventory should not mutate application data')

console.log('document generation cleanup phase 1 tests passed')
