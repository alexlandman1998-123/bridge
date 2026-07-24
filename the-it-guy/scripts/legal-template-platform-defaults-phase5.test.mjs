import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const adminData = await readFile(new URL('../../apps/admin/src/lib/adminData.js', import.meta.url), 'utf8')
const adminApp = await readFile(new URL('../../apps/admin/src/App.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:legal-template-platform-defaults-phase5'],
  'node scripts/legal-template-platform-defaults-phase5.test.mjs',
  'package.json should expose the Phase 5 platform-default customise contract.',
)

for (const token of [
  'customisePlatformDefaultTemplate',
  'isPlatformDefaultLegalTemplate',
  'withoutPlatformApprovalMetadata',
  'Platform default templates are immutable. Create an organisation draft before editing.',
  'Only the Ultron OTP and mandate platform defaults can be customised through this workflow.',
  'Platform default has no structured sections to copy.',
  'customised_from_platform_default',
  "platform_default_customisation_phase: 'phase5'",
  'clone_parent_template_id',
  'source_template_id',
  'copied_from_platform_default',
  'sections_snapshot_json: sectionSnapshot(sections)',
  'placeholder_keys: uniquePlaceholderKeys(sections)',
  "builder.in('module_type', ['residential', 'agency'])",
]) {
  assert.ok(adminData.includes(token), `admin data layer should enforce Phase 5 customise semantics: ${token}`)
}

assert.ok(
  adminData.match(/status:\s*'draft'[\s\S]*?is_default:\s*false[\s\S]*?is_active:\s*false/),
  'Customised platform defaults should start as inactive, non-default drafts.',
)

for (const token of [
  'customisePlatformDefaultTemplate',
  'selectedTemplateIsPlatformDefault',
  'Create Organisation Draft',
  'Ultron platform defaults are locked.',
  'disabled={selectedTemplateIsPlatformDefault || isSaving}',
  'await handleCustomisePlatformDefault()',
]) {
  assert.ok(adminApp.includes(token), `admin UI should expose the clone-only platform default workflow: ${token}`)
}

console.log('Legal template platform defaults Phase 5 contract passed.')
