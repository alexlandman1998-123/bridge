import assert from 'node:assert/strict'
import fs from 'node:fs'

const core = fs.readFileSync('src/core/documents/appliedEnvelopeSignerSession.js', 'utf8')
const resolver = fs.readFileSync('../supabase/functions/resolve-signer-token/index.ts', 'utf8')
const portal = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180018_controlled_applied_envelope_signer_session_f1.sql', 'utf8')

assert.match(core, /assessAppliedEnvelopeSignerSession/)
assert.match(resolver, /bridge_open_applied_envelope_signer_session_f1/)
assert.match(resolver, /F1_SESSION_NOT_AUTHORIZED/)
assert.match(resolver, /sessionBinding/)
assert.match(portal, /Certified document/)
assert.match(portal, /Exact delivered PDF verified/)
assert.match(migration, /document_signer_sessions/)
assert.match(migration, /status='delivered'/)
assert.match(migration, /transaction_pdf_persisted/)
assert.match(migration, /controlled_signer_session_opened/)
assert.match(migration, /F1_SCOPED_FIELD_MISMATCH/)

console.log('Document generator Phase F1 controlled signer-session contract passed.')
