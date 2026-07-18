import assert from 'node:assert/strict'
import fs from 'node:fs'

const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const page = fs.readFileSync('src/pages/LegalDocumentWorkspacePage.jsx', 'utf8')
const service = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180009_editable_render_freeze_c4.sql', 'utf8')

assert.match(api, /export async function freezeEditableDocumentRevisionForRender/)
assert.match(api, /export async function completeEditableDocumentRenderFreeze/)
assert.match(workspace, /source: 'generation'/)
assert.match(workspace, /freezeEditableDocumentRevisionForRender/)
assert.match(workspace, /completeEditableDocumentRenderFreeze/)
assert.match(workspace, /renderFreeze/)
assert.match(page, /generationContext\.editableRenderFreeze = renderFreeze/)
assert.match(service, /editableRenderFreeze/)
assert.match(service, /editableSourceFingerprint/)
assert.match(migration, /bridge_freeze_editable_revision_for_render_c4/)
assert.match(migration, /bridge_complete_editable_render_freeze_c4/)
assert.match(migration, /render_content_fingerprint/)
assert.match(migration, /render_source_version_id/)
assert.match(migration, /editable_revision_frozen_for_render/)
assert.match(migration, /editable_revision_rendered/)
assert.match(migration, /STALE_EDITABLE_DOCUMENT_REVISION/)

console.log('Document generator Phase C4 render freeze contract passed.')
