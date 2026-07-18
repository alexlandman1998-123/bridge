import assert from 'node:assert/strict'
import fs from 'node:fs'

const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180008_editable_document_autosave_restore_c3.sql', 'utf8')

assert.match(api, /export async function restoreEditableDocumentDraftRevision/)
assert.match(api, /bridge_restore_editable_document_revision_c3/)
assert.match(workspace, /const \[editableDirty, setEditableDirty\]/)
assert.match(workspace, /const \[draftSaveState, setDraftSaveState\]/)
assert.match(workspace, /window\.setTimeout\(\(\) =>/)
assert.match(workspace, /source: 'autosave'/)
assert.match(workspace, /1500/)
assert.match(workspace, /beforeunload/)
assert.match(workspace, /handleWorkspaceClose/)
assert.match(workspace, /handleRestoreEditableVersion/)
assert.match(workspace, /Restore as new draft/)
assert.match(workspace, /Reload required/)
assert.match(migration, /bridge_restore_editable_document_revision_c3/)
assert.match(migration, /bridge_save_editable_document_revision_c2/)
assert.match(migration, /editable_revision_restored/)
assert.match(migration, /restoredFromVersionId/)

console.log('Document generator Phase C3 draft continuity contract passed.')
