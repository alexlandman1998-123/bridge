import assert from 'node:assert/strict'
import fs from 'node:fs'

const assurance = fs.readFileSync('src/core/documents/nativeStarterTemplateAssurance.js', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180004_native_legal_starter_templates_b2.sql', 'utf8')

for (const starter of ['mandate_default_v1', 'otp_default_v1', 'addendum_default_v1']) {
  assert.match(migration, new RegExp(starter))
  assert.match(assurance, new RegExp(starter))
}
for (const feature of ['structured', 'default_signer_roles', 'inherit_organisation_branding', 'signature_zone', 'condition_json']) {
  assert.match(migration, new RegExp(feature))
}

assert.match(migration, /template_storage_path = null/)
assert.match(migration, /template_storage_bucket = null/)
assert.doesNotMatch(migration, /\.docx/i)
assert.match(migration, /B2 native starter validation failed/)
assert.match(assurance, /FILLER_COPY_PATTERN/)
assert.match(assurance, /MINIMUM_SECTION_COUNTS/)
assert.match(assurance, /inheritOrganisationBranding/)

console.log('Document generator Phase B2 native starter template contract passed.')
