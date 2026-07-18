import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const account = await readFile(new URL('../src/pages/settings/SettingsAccountPage.jsx', import.meta.url), 'utf8')
const layout = await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8')
const landing = await readFile(new URL('../src/pages/settings/SettingsLanding.jsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

for (const source of [account, layout, landing, app]) {
  assert.doesNotMatch(source, /\/settings\/notifications|path="notifications"|Email Notifications|Notification Summary|Quiet Hours/, 'decorative notification settings should not be reachable')
}

console.log('Settings notifications removal contract passed.')
