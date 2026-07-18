import assert from 'node:assert/strict'
import fs from 'node:fs'

const core = fs.readFileSync('src/core/documents/finalTransactionPublication.js', 'utf8')
const dispatch = fs.readFileSync('../supabase/functions/dispatch-final-signed-document/index.ts', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180020_final_signed_transaction_publication_f3.sql', 'utf8')

assert.match(core, /assessFinalTransactionPublication/)
assert.match(dispatch, /bridge_publish_final_artifact_to_transaction_f3/)
assert.match(dispatch, /F3_TRANSACTION_PUBLICATION_FAILED/)
assert.match(dispatch, /transactionPublication/)
assert.match(dispatch, /transactionDocumentId/)
assert.match(migration, /legal_final_transaction_publications/)
assert.match(migration, /final_signed_transaction_published/)
assert.match(migration, /final_legal_packet_version_id/)
assert.match(migration, /final_signed_legal_pdf_access_f3/)
assert.match(migration, /visibility_scope='shared'/)
assert.match(migration, /is_client_visible=true/)
assert.match(migration, /file_bucket=v_evidence\.bucket/)
assert.match(migration, /F3_TRANSACTION_PUBLICATION_IMMUTABLE/)

console.log('Document generator Phase F3 final transaction-publication contract passed.')
