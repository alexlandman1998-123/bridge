import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-readiness-phase5'],
  'node scripts/mandate-template-readiness-phase5.test.mjs',
  'package.json should expose the mandate template readiness Phase 5 contract.',
)

const settingsSource = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')

for (const token of [
  'classifyMandateVariantTemplateReadiness',
  'compareMandateVariantTemplatesForReadiness',
  'buildMandateVariantCoverageRows',
  'liveMandateVariantCount',
  'mandateVariantCoverageRows',
  'variants are live and routable',
  'Needs setup',
  'Draft',
  'Missing',
  'This route can be selected during mandate generation.',
]) {
  assert.ok(settingsSource.includes(token), `Settings template editor should include ${token}.`)
}

for (const token of [
  "key: 'live'",
  "key: 'needs_setup'",
  "key: 'draft'",
  "key: 'missing'",
  "routable: true",
  "routable: false",
]) {
  assert.ok(settingsSource.includes(token), `Variant readiness classifier should include ${token}.`)
}

const liveIndex = settingsSource.indexOf('live: 0')
const setupIndex = settingsSource.indexOf('needs_setup: 1')
const draftIndex = settingsSource.indexOf('draft: 2')
const missingIndex = settingsSource.indexOf('missing: 3')
assert.ok(liveIndex > -1 && setupIndex > liveIndex && draftIndex > setupIndex && missingIndex > draftIndex)

assert.ok(
  settingsSource.includes('missingMandateVariantOptions.length') &&
    settingsSource.includes('before they can be reviewed and published'),
  'Variant pack panel should warn when route templates are missing.',
)

console.log('Mandate template readiness Phase 5 contract passed.')
