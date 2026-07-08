import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  accountPage: await readFile(new URL('../src/pages/settings/SettingsAccountPage.jsx', import.meta.url), 'utf8'),
  layout: await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

for (const token of [
  "sectionTitle={showSecurity ? 'Security' : showNotifications ? 'Notifications' : 'Profile'}",
  'Manage password, multi-factor authentication, sessions, and login activity.',
  'xl:grid-cols-[minmax(0,920px)_280px]',
  'Update your password for internal workspace access.',
  'id="security-new-password"',
  'id="security-confirm-password"',
  'Change password',
  'Two-factor authentication',
  'Status:',
  'Not enabled',
  'Enable MFA',
  'Active sessions',
  'Current browser session is active.',
  'Log out other sessions',
  'Connected devices',
  'Trusted device management is not configured yet.',
  'Login history',
  'No login history is available.',
  'Security health',
  'Recommendation',
  'Enable MFA to better protect this account.',
]) {
  assert(files.accountPage.includes(token), `security page should retain premium security UI marker: ${token}`)
}

for (const token of [
  "label: 'ACCOUNT'",
  "label: 'Security'",
  "label: 'Commission'",
  "to: '/settings/commission'",
  'lg:grid-cols-[220px_minmax(0,1fr)]',
  'Settings sections',
]) {
  assert(files.layout.includes(token), `settings layout should retain inner security navigation marker: ${token}`)
}

for (const removedToken of [
  'SettingsSearch',
  'AccountSummary',
  "label: 'Document Builder'",
  "label: 'Documents'",
  "label: 'Lead Capture'",
]) {
  assert(!files.layout.includes(removedToken), `settings layout should not reintroduce old settings chrome: ${removedToken}`)
}

assert(
  files.accountPage.includes('dirty={hasUnsavedChanges && (showProfile || showNotifications || showPreferences)}'),
  'security page should not participate in the global sticky save bar',
)
assert.match(files.packageJson, /"test:settings-security-premium-refactor": "node scripts\/settings-security-premium-refactor\.test\.mjs"/)

console.log('Settings security premium refactor contract passed.')
