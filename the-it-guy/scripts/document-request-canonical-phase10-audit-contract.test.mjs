import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('scripts/document-request-canonical-phase10-wider-dry-run-audit.mjs', 'utf8')

assert.match(
  source,
  /document_request_phase10_wider_dry_run_audit/,
  'Phase 10 audit should expose a stable report phase marker.',
)
assert.match(
  source,
  /runCanonicalDocumentRequestRecalculationBatch/,
  'Phase 10 audit should use the Phase 8 recalculation batch path.',
)
assert.match(
  source,
  /syncCanonicalRequiredDocumentsForTransactionContext/,
  'Phase 10 audit should use the canonical transaction dry-run sync service.',
)
assert.match(source, /dryRun:\s*true/, 'Phase 10 audit must force dry-run mode.')
assert.match(source, /commit:\s*false/, 'Phase 10 audit report must state that commit is false.')
assert.match(source, /mutatedData:\s*false/, 'Phase 10 audit report must state that data was not mutated.')
assert.doesNotMatch(source, /\.upsert\(/, 'Phase 10 audit script must not upsert rows directly.')
assert.doesNotMatch(source, /\.insert\(/, 'Phase 10 audit script must not insert rows directly.')
assert.doesNotMatch(source, /\.update\(/, 'Phase 10 audit script must not update rows directly.')
assert.match(source, /seller_tax_number/, 'Phase 10 audit should verify the approved seller tax number policy.')
assert.match(
  source,
  /seller_bank_account_confirmation/,
  'Phase 10 audit should verify the approved seller bank confirmation policy.',
)

console.log('document request canonical phase 10 audit contract tests passed')
