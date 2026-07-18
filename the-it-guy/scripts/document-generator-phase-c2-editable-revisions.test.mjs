import assert from 'node:assert/strict'
import fs from 'node:fs'

const revision = fs.readFileSync('src/core/documents/editableDocumentRevision.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180007_editable_document_revision_save_c2.sql', 'utf8')

assert.match(revision, /buildEditableDocumentRevision/)
assert.match(revision, /buildEditableRevisionManifest/)
assert.match(revision, /EDITABLE_DOCUMENT_DUPLICATE_SECTION/)
assert.match(api, /export async function saveEditableDocumentDraftRevision/)
assert.match(api, /STALE_EDITABLE_DOCUMENT_REVISION/)
assert.match(api, /p_expected_edit_sequence/)
assert.match(workspace, /saveEditableDocumentDraftRevision/)
assert.match(workspace, /expectedEditSequence: editableVersion\.edit_sequence/)
assert.match(workspace, /editableVersion\?\.editable_content_json/)
assert.match(workspace, /const editableVersion = useMemo/)
assert.match(migration, /bridge_save_editable_document_revision_c2/)
assert.match(migration, /A newer document revision already exists/)
assert.match(migration, /edit_status = 'superseded'/)
assert.match(migration, /edit_sequence = v_next_sequence/)
assert.match(migration, /draft_edited/)

console.log('Document generator Phase C2 editable revision contract passed.')
