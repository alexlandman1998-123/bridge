import assert from 'node:assert/strict'
import fs from 'node:fs'

const core = fs.readFileSync('src/core/documents/signingFieldLayout.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180015_visual_pdf_field_placement_e2.sql', 'utf8')

assert.match(core, /E2_FIELD_COLLISION/)
assert.match(api, /saveSigningFieldPlacement/)
assert.match(api, /bridge_save_signing_field_placement_e2/)
assert.match(workspace, /PdfSigningFieldCanvas/)
assert.match(workspace, /onPointerDown/)
assert.match(workspace, /cursor-se-resize/)
assert.match(workspace, /pdfjsLib\.getDocument/)
assert.match(workspace, /Positions snap to a 4-point grid/)
assert.match(migration, /placement_verified = true/)
assert.match(migration, /E2_FIELD_PAGE_OUT_OF_RANGE/)
assert.match(migration, /E2_SIGNING_FIELD_COLLISION/)
assert.match(migration, /signing_field_placement_verified/)

console.log('Document generator Phase E2 visual PDF field placement contract passed.')
