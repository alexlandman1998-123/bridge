import assert from 'node:assert/strict'
import fs from 'node:fs'

const versioning = fs.readFileSync('src/core/documents/templateVersioning.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const settings = fs.readFileSync('src/pages/settings/SettingsSigningTemplatesPage.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180005_immutable_template_revisioning_b4.sql', 'utf8')

assert.match(versioning, /buildTemplateRevisionInput/)
assert.match(versioning, /revisionRootTemplateId/)
assert.match(versioning, /revisionParentTemplateId/)
assert.match(versioning, /templateStatus: 'draft'/)
assert.match(api, /export async function createDocumentPacketTemplateRevision/)
assert.match(api, /export async function publishDocumentPacketTemplateRevision/)
assert.match(api, /export async function archiveDocumentPacketTemplate/)
assert.match(api, /PUBLISHED_TEMPLATE_IMMUTABLE/)
assert.match(settings, /createDocumentPacketTemplateRevision/)
assert.match(settings, /publishDocumentPacketTemplateRevision/)
assert.match(settings, /handleArchiveSelectedTemplate/)
assert.match(migration, /template_revision_id/)
assert.match(migration, /template_definition_snapshot_json/)
assert.match(migration, /bridge_capture_packet_template_revision_b4/)
assert.match(migration, /bridge_guard_published_template_revision_b4/)
assert.match(migration, /bridge_guard_published_template_sections_b4/)
assert.match(migration, /bridge_publish_template_revision_b4/)
assert.match(migration, /superseded_by_template_id/)

console.log('Document generator Phase B4 immutable template versioning contract passed.')
