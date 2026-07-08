import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  accountPage: await readFile(new URL('../src/pages/settings/SettingsAccountPage.jsx', import.meta.url), 'utf8'),
  layout: await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8'),
  settingsUi: await readFile(new URL('../src/pages/settings/settingsUi.jsx', import.meta.url), 'utf8'),
  settingsApi: await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8'),
  app: await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  migration: await readFile(new URL('../../supabase/migrations/202607080007_profile_settings_metadata.sql', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

for (const token of [
  'Settings</span>',
  'Manage your personal information and preferences.',
  'Profile completion',
  'Upload photo',
  'View public profile',
  'Personal information',
  'Employment information',
  'Complete your profile',
  'Open Help Centre',
  'profileCompletion.missing',
]) {
  assert(files.accountPage.includes(token), `profile page should retain premium profile UI marker: ${token}`)
}

for (const token of [
  "label: 'ACCOUNT'",
  "label: 'WORKSPACE'",
  "label: 'Commission'",
  "to: '/settings/commission'",
  "label: 'PLATFORM'",
  "label: 'ADVANCED'",
  "label: 'Danger Zone'",
  'lg:grid-cols-[220px_minmax(0,1fr)]',
]) {
  assert(files.layout.includes(token), `settings layout should retain grouped inner navigation marker: ${token}`)
}

for (const removedToken of [
  "label: 'Document Builder'",
  "label: 'Documents'",
  "label: 'Lead Capture'",
  'AccountSummary',
  'SettingsSearch',
]) {
  assert(!files.layout.includes(removedToken), `settings navigation should not include old operational item or heavy summary: ${removedToken}`)
}

for (const token of [
  'if (!dirty) return null',
  'You have unsaved changes',
  'Discard changes',
  'Save changes',
]) {
  assert(files.settingsUi.includes(token), `settings save bar should match dirty-only sticky behavior: ${token}`)
}

for (const token of [
  'bio: normalizeText(row?.bio)',
  'department: normalizeText(row?.department)',
  'office: normalizeText(row?.office)',
  'language: normalizeText(row?.language)',
  'theme: normalizeText(row?.theme)',
]) {
  assert(files.settingsApi.includes(token), `settings API should persist profile metadata field: ${token}`)
}

for (const token of [
  'add column if not exists bio text',
  'add column if not exists department text',
  'add column if not exists office text',
  "add column if not exists language text not null default 'en-ZA'",
  "add column if not exists theme text not null default 'system'",
]) {
  assert(files.migration.includes(token), `profile metadata migration should include: ${token}`)
}

assert(files.app.includes('path="danger-zone" element={<SettingsAccountPage section="danger" />}'), 'settings route should expose the advanced danger zone page')
assert.match(files.packageJson, /"test:settings-profile-premium-refactor": "node scripts\/settings-profile-premium-refactor\.test\.mjs"/)

console.log('Settings profile premium refactor contract passed.')
