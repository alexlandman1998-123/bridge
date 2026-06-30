import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const layout = await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8')
const landing = await readFile(new URL('../src/pages/settings/SettingsLanding.jsx', import.meta.url), 'utf8')
const account = await readFile(new URL('../src/pages/settings/SettingsAccountPage.jsx', import.meta.url), 'utf8')
const ui = await readFile(new URL('../src/pages/settings/settingsUi.jsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

for (const group of ['Account', 'Organisation', 'Platform', 'System']) {
  assert.match(layout, new RegExp(`label: '${group}'`), `Settings sidebar should include ${group} navigation group.`)
}

for (const route of ['/settings/profile', '/settings/security', '/settings/notifications', '/settings/preferences', '/settings/integrations', '/settings/audit-log']) {
  assert.match(layout + landing + app, new RegExp(route.replaceAll('/', '\\/')), `Settings route ${route} should be wired into the workspace.`)
}

assert.match(
  landing,
  /Profile Summary|Profile Card|Settings categories|Quick actions|Manage your account, organisation and platform preferences\./,
  'Settings home should include a summary, category cards and quick actions.',
)

for (const title of ['Profile', 'Organisation', 'Security', 'Notifications', 'Preferences', 'Integrations', 'Preferred Partners', 'Legal Templates', 'Workflow Rules', 'Communication Templates', 'Audit Log']) {
  assert.match(landing, new RegExp(title), `Settings home missing category: ${title}`)
}

for (const section of ['Personal Information', 'Employment', 'Preferences', 'Danger Zone', 'Two-factor authentication', 'Active Sessions', 'Login History']) {
  assert.match(account, new RegExp(section), `Settings account workspace missing section: ${section}`)
}

assert.match(
  ui,
  /function SettingsStickySaveBar/,
  'Settings should use a sticky save bar for unsaved changes.',
)

assert.match(
  account,
  /hasUnsavedChanges/,
  'Account settings should detect unsaved changes before showing the sticky save bar.',
)

assert.match(
  packageJson,
  /"test:settings-experience-refactor": "node scripts\/settings-experience-refactor\.test\.mjs"/,
  'package.json should expose the settings experience refactor test.',
)

console.log('settings-experience-refactor tests passed')
