import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const [app, layout, landing, account, organisation, commercial, commercialNavigation, clientPortal] = await Promise.all([
  read('../src/App.jsx'),
  read('../src/pages/settings/SettingsLayout.jsx'),
  read('../src/pages/settings/SettingsLanding.jsx'),
  read('../src/pages/settings/SettingsAccountPage.jsx'),
  read('../src/pages/settings/SettingsOrganisationPage.jsx'),
  read('../src/modules/commercial/pages/CommercialSettingsPage.jsx'),
  read('../src/modules/commercial/commercialNavigation.js'),
  read('../src/pages/ClientPortal.jsx'),
])

const removedRoutes = ['notifications', 'preferences', 'danger-zone', 'integrations', 'api', 'audit-log', 'help']
for (const route of removedRoutes) {
  assert.doesNotMatch(app, new RegExp(`path=["']${route}["']`), `/${route} should not remain a registered settings route`)
  assert.doesNotMatch(layout, new RegExp(`/settings/${route}`), `/${route} should not remain in settings navigation`)
  assert.doesNotMatch(landing, new RegExp(`/settings/${route}`), `/${route} should not remain on the settings landing page`)
}

for (const route of ['profile', 'security', 'organisation', 'branding', 'commission', 'users', 'billing', 'lead-capture']) {
  assert.match(`${app}\n${layout}\n${landing}`, new RegExp(`/settings/${route}|path=["']${route}["']`), `/${route} should remain available`)
}

for (const decorativeControl of [
  'View public profile',
  'Enable MFA',
  'Log out other sessions',
  'Connected devices',
  'Login history',
  'Delete account',
  'Notification Summary',
  'Regional Defaults',
]) {
  assert.doesNotMatch(account, new RegExp(decorativeControl, 'i'), `${decorativeControl} should not remain in account settings`)
}

assert.match(account, /updateAccountSettings\(form\)/, 'profile save should remain connected to the account settings service')
assert.match(account, /changePassword\(/, 'password change should remain connected to Supabase Auth')
assert.match(account, /Managed by your organisation/, 'job title should be display-only until owner-managed titles are implemented')
assert.doesNotMatch(account, /id="profile-title"/, 'job title should not remain a self-editable text field')
assert.doesNotMatch(organisation, /\/settings\/help/, 'organisation settings should not link to the removed placeholder help page')
assert.match(commercial, />Commercial Tools</, 'commercial link hub should be labelled as tools')
assert.match(commercialNavigation, /label: 'Tools'/, 'commercial navigation should describe the link hub accurately')
assert.doesNotMatch(clientPortal, /key: 'settings', label: 'Settings'/, 'client portal should not advertise an informational settings tab')
assert.match(clientPortal, /endsWith\('\/settings'\)\) return 'overview'/, 'legacy client settings links should fall back to overview')

console.log('settings functional core phase 1 checks passed')
