import assert from 'node:assert/strict'
import fs from 'node:fs'

const core = fs.readFileSync('src/core/documents/appliedEnvelopeDispatch.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180017_applied_envelope_dispatch_e4.sql', 'utf8')

assert.match(core, /assessAppliedEnvelopeDispatch/)
assert.match(api, /authorizeAppliedEnvelopeDispatch/)
assert.match(api, /completeAppliedEnvelopeDispatch/)
assert.match(api, /dispatchAlreadyDelivered/)
assert.match(workspace, /completeAppliedEnvelopeDispatch/)
assert.match(workspace, /deduplicated: true/)
assert.match(migration, /document_signing_dispatches/)
assert.match(migration, /bridge_authorize_applied_envelope_dispatch_e4/)
assert.match(migration, /E4_APPLIED_LAYOUT_FIELD_MISMATCH/)
assert.match(migration, /E4_DELIVERY_EVIDENCE_REQUIRED/)
assert.match(migration, /signing_dispatch_delivered/)

console.log('Document generator Phase E4 applied-envelope dispatch contract passed.')
