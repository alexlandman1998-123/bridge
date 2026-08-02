import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const apiSource = readFileSync('src/lib/api.js', 'utf8')
const adminRecalculationSource = readFileSync(
  'src/services/documents/documentRequestCanonicalAdminRecalculationService.js',
  'utf8',
)

assert.match(
  apiSource,
  /runCanonicalDocumentRequestRecalculationBatch/,
  'API should import the Phase 8 canonical recalculation batch service.',
)
assert.match(
  apiSource,
  /export async function runCanonicalDocumentRequestRequirementRecalculation/,
  'API should expose a Phase 8 admin recalculation function.',
)
assert.match(
  apiSource,
  /syncTransaction:\s*syncTransactionCanonicalDocumentRequestRequirements/,
  'Phase 8 API recalculation should reuse the Phase 7 single-transaction sync path.',
)
assert.match(
  adminRecalculationSource,
  /document_request_phase8_admin_recalculation_v1/,
  'Phase 8 recalculation should have a stable source/version marker.',
)
assert.match(
  adminRecalculationSource,
  /commit !== true/,
  'Phase 8 recalculation should default to dry-run unless commit is explicit.',
)
assert.match(
  adminRecalculationSource,
  /limited to \$\{maxTransactions\} transactions per run/,
  'Phase 8 recalculation should guard large batches.',
)
assert.match(
  adminRecalculationSource,
  /reason: 'sync_failed'/,
  'Phase 8 recalculation should isolate and report per-transaction sync failures.',
)

console.log('document request canonical phase 8 API contract tests passed')
