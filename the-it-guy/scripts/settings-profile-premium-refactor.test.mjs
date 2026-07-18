import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const account = await readFile(new URL('../src/pages/settings/SettingsAccountPage.jsx', import.meta.url), 'utf8')
const layout = await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

for (const token of ['Upload photo', 'Personal information', 'First name', 'Surname', 'Phone number', 'Bio', 'Profile completeness']) {
  assert.match(account, new RegExp(token), `functional profile should include: ${token}`)
}

for (const removed of ['View public profile', 'Employment information', 'Regional Defaults', 'Danger Zone', 'Delete account']) {
  assert.doesNotMatch(account, new RegExp(removed, 'i'), `decorative profile control should be removed: ${removed}`)
}

assert.match(account, /Managed by your organisation/, 'job title should be displayed as organisation-managed')
assert.doesNotMatch(account, /id="profile-title"/, 'job title should not be self-editable')
assert.match(layout, /to: '\/settings\/profile'/, 'profile should remain in settings navigation')
assert.doesNotMatch(app, /path="danger-zone"/, 'danger zone route should be removed')

console.log('Settings profile functional-core contract passed.')
