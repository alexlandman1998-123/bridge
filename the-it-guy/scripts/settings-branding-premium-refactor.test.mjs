import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  organisationPage: await readFile(new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url), 'utf8'),
  settingsApi: await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8'),
  layout: await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8'),
  app: await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

for (const token of [
  'Settings</span>',
  "Manage your agency's visual identity across Arch9, client portals and communications.",
  'BrandHero',
  'Brand Assets',
  'Last Updated',
  'Assets Configured',
  'Brand Health',
  'Preview Brand',
  'Upload Assets',
  'BrandAssetTile',
  'Replace',
  'Delete',
  'Upload progress',
  'Maximum 10MB',
  'Brand Colours',
  'Primary',
  'Secondary',
  'Accent',
  'Neutral',
  'Copy HEX',
  'Typography',
  'Primary Font',
  'Button Style',
  'Email & Portal Preview',
  'Portal',
  'Email',
  'PDF',
  'App Icons',
  'Favicon',
  'Portal Icon',
  'Mobile Icon',
  'Browser Tile',
  'Generated from Icon Logo',
  'Public Branding',
  'Website',
  'Facebook',
  'LinkedIn',
  'Instagram',
  'Support Email',
  'Brand Preview',
  'Branding updated successfully.',
  'Unsaved Branding Changes',
  'BRANDING_UNSAVED_PROMPT',
]) {
  assert(files.organisationPage.includes(token), `branding page should retain premium brand workspace marker: ${token}`)
}

for (const token of [
  'validateBrandAssetFile',
  'BRAND_ASSET_MAX_BYTES = 10 * 1024 * 1024',
  'BRAND_ASSET_TARGETS',
  'assetHistory',
  'rollbackBrandAsset',
  'updatePublicBrandField',
  'updateBrandingNestedField',
  'BrandPreviewPanel',
  'BrandPreviewSurface',
  'SettingsStickySaveBar',
  'saveLabel="Save Branding"',
]) {
  assert(files.organisationPage.includes(token), `branding page should include requested brand manager behavior: ${token}`)
}

for (const removedToken of [
  'Choose File',
  'organisation-logo-preview-frame',
  'agency-logo-preview',
  '<SettingsSectionCard',
]) {
  assert(!files.organisationPage.includes(removedToken), `branding page should not retain old upload-form marker: ${removedToken}`)
}

for (const token of [
  'const ORGANISATION_LOGO_MAX_BYTES = 10 * 1024 * 1024',
  'faviconBucket',
  'portalIconBucket',
  'mobileIconBucket',
  'browserTileBucket',
  'favicon: faviconUrl',
  'portalIcon: portalIconUrl',
  'mobileIcon: mobileIconUrl',
  'browserTile: browserTileUrl',
]) {
  assert(files.settingsApi.includes(token), `settings API should hydrate new brand asset fields: ${token}`)
}

assert(files.layout.includes("label: 'Branding'"), 'settings inner navigation should keep Branding in the workspace group')
assert(files.layout.includes('lg:grid-cols-[220px_minmax(0,1fr)]'), 'settings layout should keep inner settings navigation beside content')
assert.match(files.app, /path="branding"[\s\S]*<SettingsOrganisationPage section="branding" \/>/)
assert.match(files.packageJson, /"test:settings-branding-premium-refactor": "node scripts\/settings-branding-premium-refactor\.test\.mjs"/)

console.log('Settings branding premium refactor contract passed.')
