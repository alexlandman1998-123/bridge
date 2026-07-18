import assert from 'node:assert/strict'
import fs from 'node:fs'

const core = fs.readFileSync('src/core/documents/signingFieldLayout.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180014_signature_field_layout_foundation_e1.sql', 'utf8')

assert.match(core, /createSigningFieldBlock/)
assert.match(core, /assertSigningFieldLayout/)
assert.match(api, /fetchSigningFieldLayout/)
assert.match(api, /saveSigningFieldLayout/)
assert.match(workspace, /Add signature/)
assert.match(workspace, /Add initials/)
assert.match(workspace, /Save block layout/)
assert.match(migration, /document_signing_field_layouts/)
assert.match(migration, /bridge_save_signing_field_layout_e1/)
assert.match(migration, /E1_SIGNING_LAYOUT_STALE/)
assert.match(migration, /signing_field_layout_saved/)

console.log('Document generator Phase E1 signature-field layout contract passed.')
