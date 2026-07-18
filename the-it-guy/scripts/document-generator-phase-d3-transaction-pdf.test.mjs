import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessTransactionPdfPersistence } from '../src/core/documents/transactionPdfPersistence.js'

assert.equal(typeof assessTransactionPdfPersistence, 'function')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180012_durable_transaction_pdf_link_d3.sql', 'utf8')

assert.match(api, /export async function persistGeneratedPdfToTransaction/)
assert.match(api, /renderedBucketHint/)
assert.match(workspace, /await persistGeneratedPdfToTransaction/)
assert.match(migration, /bridge_persist_transaction_pdf_d3/)
assert.match(migration, /transaction_pdf_persisted = true/)
assert.match(migration, /legal_packet_version_id = v_version\.id/)
assert.match(migration, /visibility_scope = 'shared'/)
assert.match(migration, /generated_legal_pdf_packet_access_d3/)
assert.match(migration, /bridge_can_access_legal_packet_h2\(d\.legal_packet_id\)/)
assert.match(migration, /D3_PERSISTED_PDF_LINK_IMMUTABLE/)
assert.match(migration, /transaction_pdf_persisted/)

console.log('Document generator Phase D3 durable transaction PDF contract passed.')
