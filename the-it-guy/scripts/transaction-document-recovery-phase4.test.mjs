import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260918195906_transaction_document_recovery_review_queue.sql', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')

assert.match(migration, /bridge_get_transaction_document_recovery_review/)
assert.match(migration, /documentsMissingStorage/)
assert.match(migration, /orphanStorageObjects/)
assert.match(migration, /automaticDeletion', false/)
assert.match(migration, /bridge_repair_transaction_document_link/)
assert.match(migration, /Document does not belong to this transaction/)
assert.match(migration, /must be re-uploaded/)
assert.match(migration, /revoke all on function public\.bridge_repair_transaction_document_link/)
assert.match(api, /export async function getTransactionDocumentRecoveryReview/)
assert.match(api, /export async function repairTransactionDocumentCanonicalLink/)
console.log('transaction document recovery phase 4 tests passed')
