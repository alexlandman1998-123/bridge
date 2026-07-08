import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  organisationPage: await readFile(new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url), 'utf8'),
  layout: await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8'),
  settingsUi: await readFile(new URL('../src/pages/settings/settingsUi.jsx', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

for (const token of [
  'Settings</span>',
  'Manage your agency information, branding, permissions and operational defaults.',
  'OrganisationPageHeader',
  'Organisation settings updated successfully.',
  'ORGANISATION_UNSAVED_PROMPT',
  'beforeunload',
  "document.addEventListener('click', handleDocumentClick, true)",
  'Organisation Overview',
  'Agency Information',
  'Contact Information',
  'Address',
  'Address Lookup',
  'Principal Information',
  'Owner',
  'Branding',
  'Primary Logo',
  'Dark Logo',
  'Icon Logo',
  'Primary Colour',
  'Secondary Colour',
  'Permissions & Visibility',
  'Operational Defaults',
  'Default Timezone',
  'Branches',
  'Manage Branches',
  'View Public Profile',
  'Live branding preview',
]) {
  assert(files.organisationPage.includes(token), `organisation page should retain premium organisation UI marker: ${token}`)
}

for (const token of [
  'BrandUploadTile',
  'onDragOver',
  'onDrop',
  'Supported: PNG, SVG, JPG, WebP. Recommended max size: 10MB.',
  'AddressAutocomplete',
  'updateOrganisationAddress',
  'VerificationBadge',
  'SettingsStickySaveBar',
  'message="Unsaved Changes"',
  'discardLabel="Discard"',
  "saveLabel={showBrandingOnly ? 'Save Branding' : 'Save Organisation'}",
]) {
  assert(files.organisationPage.includes(token), `organisation page should include requested UX behavior: ${token}`)
}

for (const removedToken of [
  '<SettingsSectionCard',
  'type="checkbox"',
  'Add Branch',
  'createAgencyBranchDraft',
  'settingsActionRowClass',
  'settingsGridClass',
]) {
  assert(!files.organisationPage.includes(removedToken), `organisation page should not retain old long-form marker: ${removedToken}`)
}

for (const token of [
  "label: 'WORKSPACE'",
  "label: 'Organisation'",
  "label: 'Branding'",
  'lg:grid-cols-[220px_minmax(0,1fr)]',
]) {
  assert(files.layout.includes(token), `settings layout should keep the inner navigation beside content: ${token}`)
}

assert(!files.layout.includes('SettingsSearch'), 'settings layout should not reintroduce the large search bar')

for (const token of [
  'if (!dirty) return null',
  'message = \'You have unsaved changes\'',
  'discardLabel = \'Discard changes\'',
  'saveLabel = \'Save changes\'',
]) {
  assert(files.settingsUi.includes(token), `sticky save bar should keep dirty-only configurable behavior: ${token}`)
}

assert.match(files.packageJson, /"test:settings-organisation-premium-refactor": "node scripts\/settings-organisation-premium-refactor\.test\.mjs"/)

console.log('Settings organisation premium refactor contract passed.')
