import assert from 'node:assert/strict'
import fs from 'node:fs'

const core = fs.readFileSync('src/core/documents/signerFieldMapping.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180016_apply_signing_layout_to_envelope_e3.sql', 'utf8')

assert.match(core, /assessSignerFieldMapping/)
assert.match(core, /E3_REQUIRED_SIGNATURE_MISSING/)
assert.match(api, /applySigningFieldLayout/)
assert.match(api, /bridge_apply_signing_field_layout_e3/)
assert.match(workspace, /Apply layout to signers/)
assert.match(workspace, /handleApplySigningLayout/)
assert.match(migration, /placement_verified/)
assert.match(migration, /E3_SIGNER_FIELD_MAPPING_INCOMPLETE/)
assert.match(migration, /insert into public\.document_signing_fields/)
assert.match(migration, /signing_field_layout_applied/)
assert.match(migration, /status='signing_prep'/)

console.log('Document generator Phase E3 signer-to-field mapping contract passed.')
