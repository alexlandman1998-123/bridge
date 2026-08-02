import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const apiSource = readFileSync('src/lib/api.js', 'utf8')
const transactionSyncSource = readFileSync(
  'src/services/documents/documentRequestCanonicalTransactionSyncService.js',
  'utf8',
)

assert.match(
  apiSource,
  /syncCanonicalRequiredDocumentsForTransactionContext/,
  'API should import the Phase 7 canonical transaction sync service.',
)
assert.match(
  apiSource,
  /export async function syncTransactionCanonicalDocumentRequestRequirements/,
  'API should expose an explicit canonical document request requirement sync function.',
)
assert.match(
  apiSource,
  /document_request_phase7_required_document_sync/,
  'API sync should log a Phase 7 source marker when writing.',
)
assert.match(
  apiSource,
  /options\.dryRun === true/,
  'API sync should pass dry-run explicitly and skip write logging during dry runs.',
)
assert.match(
  transactionSyncSource,
  /insufficient_transaction_facts/,
  'Transaction sync service should skip when buyer and seller structure facts are unavailable.',
)
assert.match(
  transactionSyncSource,
  /sellerKnown: derived\.coverage\.sellerKnown/,
  'Transaction sync service should derive audience from known seller structure facts.',
)

console.log('document request canonical phase 7 API contract tests passed')
