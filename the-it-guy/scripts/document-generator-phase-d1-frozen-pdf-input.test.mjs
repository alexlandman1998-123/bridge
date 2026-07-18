import assert from 'node:assert/strict'
import fs from 'node:fs'

const frozen = fs.readFileSync('src/core/documents/frozenEditableRenderInput.js', 'utf8')
const service = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180010_deterministic_frozen_pdf_input_d1.sql', 'utf8')

assert.match(frozen, /resolveFrozenEditableRenderInput/)
assert.match(frozen, /applyFrozenEditableRenderInput/)
assert.match(frozen, /FROZEN_EDITABLE_RENDER_INPUT_INVALID/)
assert.match(frozen, /manifestContent !== editableContent/)
assert.match(service, /context = applyFrozenEditableRenderInput\(context\)/)
assert.match(service, /frozenInputContract:.*'d1-v1'/)
assert.match(service, /editableSourceFingerprint/)
assert.match(api, /export async function verifyFrozenEditableRenderOutput/)
assert.match(api, /FROZEN_RENDER_PROVENANCE_MISMATCH/)
assert.match(workspace, /verifyFrozenEditableRenderOutput/)
assert.match(migration, /bridge_verify_frozen_render_output_d1/)
assert.match(migration, /render_input_verified = true/)
assert.match(migration, /frozen_render_output_verified/)
assert.match(migration, /FROZEN_RENDER_PROVENANCE_MISMATCH/)

console.log('Document generator Phase D1 deterministic frozen PDF input contract passed.')
