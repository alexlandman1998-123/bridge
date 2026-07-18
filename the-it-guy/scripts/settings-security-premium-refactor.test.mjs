import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const account = await readFile(new URL('../src/pages/settings/SettingsAccountPage.jsx', import.meta.url), 'utf8')
const layout = await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8')

for (const token of ['id="security-new-password"', 'id="security-confirm-password"', 'Change password', 'changePassword({ password: passwordForm.password })']) {
  assert.ok(account.includes(token), `functional security should include: ${token}`)
}

for (const removed of ['Two-factor authentication', 'Enable MFA', 'Active sessions', 'Log out other sessions', 'Connected devices', 'Login history']) {
  assert.doesNotMatch(account, new RegExp(removed, 'i'), `decorative security control should be removed: ${removed}`)
}

assert.match(layout, /to: '\/settings\/security'/, 'security should remain in settings navigation')
assert.match(account, /!showSecurity \? \(/, 'security should not participate in the profile sticky save bar')

console.log('Settings security functional-core contract passed.')
