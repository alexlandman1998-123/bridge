import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const rolesSource = readFileSync(new URL('../src/lib/roles.js', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
const mattersSource = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('../src/pages/settings/SettingsLanding.jsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const permissionsSource = readFileSync(new URL('../src/auth/permissions/permissionRegistry.js', import.meta.url), 'utf8')
const attorneyNavSource = rolesSource.slice(
  rolesSource.indexOf('attorney: ['),
  rolesSource.indexOf('bond_originator: ['),
)
const transactionsNavItemSource = attorneyNavSource.slice(
  attorneyNavSource.indexOf("key: 'attorney_matters'"),
  attorneyNavSource.indexOf("key: 'attorney_workflow_board'"),
)

assert.match(attorneyNavSource, /label:\s*'Transactions'/, 'Attorney primary nav should expose Transactions')
assert.match(attorneyNavSource, /to:\s*'\/attorney\/transactions\/active'/, 'Attorney Transactions nav should target active transactions')
assert.doesNotMatch(attorneyNavSource, /Registered Matters|Archived Matters|All Matters/, 'Matter storage views should not be sidebar menu labels')
assert.doesNotMatch(transactionsNavItemSource, /children:\s*\[/, 'Attorney Transactions should not render a cluttered submenu')

assert.match(sidebarSource, /Firm Administration/, 'Attorney secondary section should be labelled Firm Administration')
assert.match(sidebarSource, /role === 'attorney'\s*\?\s*\[\{ key: 'settings', label: 'Settings', to: '\/settings' \}\]/, 'Attorney sidebar secondary items should collapse to Settings only')

for (const tab of ['Active', 'Registered', 'Archived']) {
  assert.match(mattersSource, new RegExp(`label:\\s*'${tab}'`), `Transactions workspace should include ${tab} tab`)
}
assert.match(mattersSource, /Attorney Transaction OS/, 'Transactions workspace should carry the new operating-system framing')
assert.match(mattersSource, /Visible Transactions/, 'Transactions workspace summary should use transaction language')

assert.match(appSource, /path="\/attorney\/transactions"/, 'Attorney transactions route should exist')
assert.match(appSource, /path="\/attorney\/transactions\/:matterType"/, 'Attorney transactions tab route should exist')
assert.match(permissionsSource, /prefix:\s*'\/attorney\/transactions'/, 'Attorney transactions route should be permission protected')

assert.match(settingsSource, /title:\s*'Organizations'/, 'Organizations should remain available from Settings')
assert.match(settingsSource, /title:\s*'Audit Logs'/, 'Audit Logs should be available from Settings')

console.log('attorney navigation refactor contract passed')
