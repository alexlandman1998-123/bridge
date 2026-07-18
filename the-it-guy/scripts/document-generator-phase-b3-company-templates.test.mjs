import assert from 'node:assert/strict'
import fs from 'node:fs'

const clone = fs.readFileSync('src/core/documents/organisationTemplateClone.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const settings = fs.readFileSync('src/pages/settings/SettingsSigningTemplatesPage.jsx', 'utf8')
const canonical = fs.readFileSync('src/core/documents/canonicalTemplateDefinition.js', 'utf8')

assert.match(api, /export async function cloneDocumentPacketTemplate/)
assert.match(api, /buildOrganisationTemplateCloneInput/)
assert.match(clone, /company_template_variant: true/)
assert.match(clone, /clone_parent_template_id/)
assert.match(clone, /source_template_id/)
assert.match(clone, /templateFormat: 'structured'/)
assert.match(clone, /templateStatus: 'draft'/)
assert.match(clone, /templateStoragePath: null/)
assert.match(clone, /definition\.sections\.map/)
assert.match(settings, /handleCreateEditableCopy\(\{ source: 'duplicate' \}\)/)
assert.match(settings, /'Duplicate'/)
assert.match(settings, /function moveSection/)
assert.match(settings, /moveSection\(index, -1\)/)
assert.match(settings, /moveSection\(index, 1\)/)
assert.match(settings, /custom: true/)
assert.match(canonical, /custom: Boolean/)

console.log('Document generator Phase B3 company template cloning contract passed.')
