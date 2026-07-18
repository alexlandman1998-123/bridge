import assert from 'node:assert/strict'
import fs from 'node:fs'

const draft = fs.readFileSync('src/core/documents/transactionDocumentDraft.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const settings = fs.readFileSync('src/pages/settings/SettingsSigningTemplatesPage.jsx', 'utf8')
const workspace = fs.readFileSync('src/pages/LegalDocumentWorkspacePage.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180006_editable_transaction_document_draft_c1.sql', 'utf8')

assert.match(draft, /buildEditableTransactionDocumentDraft/)
assert.match(draft, /templateRevision/)
assert.match(draft, /sourceTemplateSectionKey/)
assert.match(draft, /buildEditableDraftSectionManifest/)
assert.match(api, /export async function createEditableDocumentDraftFromTemplate/)
assert.match(api, /bridge_create_editable_document_draft_c1/)
assert.match(api, /Publish the template before creating a transaction document/)
assert.match(settings, /createEditableDocumentDraftFromTemplate/)
assert.match(workspace, /createEditableDocumentDraftFromTemplate/)
assert.match(migration, /editable_content_json/)
assert.match(migration, /source_template_revision_id/)
assert.match(migration, /bridge_create_editable_document_draft_c1/)
assert.match(migration, /editable_draft_created/)
assert.match(migration, /createdFromPublishedTemplate/)
assert.match(migration, /bridge_create_document_packet_version_i1/)

console.log('Document generator Phase C1 editable transaction draft contract passed.')
