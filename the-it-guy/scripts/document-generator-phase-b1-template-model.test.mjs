import assert from 'node:assert/strict'
import fs from 'node:fs'

const model = fs.readFileSync('src/core/documents/canonicalTemplateDefinition.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const packetService = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180003_canonical_editable_template_definition_b1.sql', 'utf8')

for (const field of ['name', 'documentType', 'organisationId', 'version', 'sections', 'mergeFields', 'defaultSignerRoles', 'branding', 'status']) {
  assert.match(model, new RegExp(field))
  assert.match(migration, new RegExp(field))
}

assert.match(model, /buildCanonicalTemplateDefinition/)
assert.match(model, /validateCanonicalTemplateDefinition/)
assert.match(api, /canonical_definition: buildCanonicalTemplateDefinition/)
assert.match(api, /syncCanonicalDocumentPacketTemplateDefinition/)
assert.match(api, /definition_schema_version/)
assert.match(api, /definition_json/)
assert.match(packetService, /canonical_definition\?\.sections/)
assert.match(migration, /trg_sync_template_definition_b1/)
assert.match(migration, /trg_sync_template_section_definition_b1/)
assert.match(migration, /document_packet_template_versions/)
assert.match(migration, /where t\.packet_type in \('mandate', 'otp', 'addendum'\)/)

console.log('Document generator Phase B1 canonical editable template model contract passed.')
