import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const settingsApi = await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')
const packageJsonSource = await readFile(new URL('../package.json', import.meta.url), 'utf8')
const packageJson = JSON.parse(packageJsonSource)

for (const token of [
  "from './clientBrandTheme.js'",
  'resolveClientBrandTheme',
  'getClientBrandReadiness',
  'buildPublishedClientBrandingTheme',
  'buildOrganisationClientBrandingPayload',
  'syncOrganisationClientBranding',
  "settingsSourcePath: 'organisation_settings.settings_json.agencyOnboarding.branding'",
  "syncedBy: 'settings_branding_phase4'",
  ".from('organisation_branding')",
  'theme_json: theme',
  'published_at: nowIso',
  'compatibilityMode: true',
  'Canonical branding synced using the foundation organisation_branding schema.',
  'isMissingAnyColumnError',
]) {
  assert(settingsApi.includes(token), `settings API should publish canonical client branding marker: ${token}`)
}

for (const token of [
  'logo_icon_url',
  'hero_image_url',
  'primary_color',
  'secondary_color',
  'accent_color',
  'neutral_color',
  'suggested_primary_color',
  'suggested_accent_color',
  'logo_light_bucket',
  'logo_light_path',
  'logo_dark_bucket',
  'logo_dark_path',
  'logo_icon_bucket',
  'logo_icon_path',
  'hero_image_bucket',
  'hero_image_path',
]) {
  assert(settingsApi.includes(token), `canonical branding payload should include Phase 1 column: ${token}`)
}

const settingsWriteIndex = settingsApi.indexOf(".from('organisation_settings')")
const brandingSyncIndex = settingsApi.indexOf('const brandingSync = await syncOrganisationClientBranding')
assert(settingsWriteIndex >= 0, 'saveAgencyOnboardingDraft should still write organisation_settings')
assert(brandingSyncIndex > settingsWriteIndex, 'canonical branding sync should run after the legacy settings save succeeds')
assert(settingsApi.includes('brandingSync,'), 'saveAgencyOnboardingDraft should return branding sync status')
assert.equal(
  packageJson.scripts?.['test:client-branding-settings-phase4'],
  'node scripts/client-branding-settings-phase4.test.mjs',
  'package scripts should expose the Phase 4 settings branding sync test',
)

console.log('Client branding settings Phase 4 contract passed.')
