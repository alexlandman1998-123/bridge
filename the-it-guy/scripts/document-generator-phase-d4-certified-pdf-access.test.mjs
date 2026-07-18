import assert from 'node:assert/strict'
import fs from 'node:fs'

const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180013_certified_pdf_access_d4.sql', 'utf8')

assert.match(api, /export async function requestPersistedPdfAccess/)
assert.match(api, /bridge_authorize_persisted_pdf_access_d4/)
assert.match(api, /createSignedUrl\(authorization\.path, 15 \* 60/)
assert.match(api, /D4_SIGNED_URL_CREATE_FAILED/)
assert.match(workspace, /refreshCertifiedPdfAccess/)
assert.match(workspace, /transaction_pdf_persisted/)
assert.match(workspace, /Preparing PDF…/)
assert.match(migration, /bridge_authorize_persisted_pdf_access_d4/)
assert.match(migration, /D4_CERTIFIED_PDF_UNAVAILABLE/)
assert.match(migration, /D4_CERTIFIED_PDF_LINK_MISMATCH/)
assert.match(migration, /certified_pdf_access_authorized/)
assert.match(migration, /p_purpose text default 'preview'/)

console.log('Document generator Phase D4 certified PDF access contract passed.')
