import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const rolesSource = readFileSync(new URL('../src/lib/roles.js', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
const mattersSource = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
const matterWorkspaceServiceSource = readFileSync(new URL('../src/services/attorneyMatterWorkspace.js', import.meta.url), 'utf8')
const settingsLayoutSource = readFileSync(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const headerSource = readFileSync(new URL('../src/components/HeaderBar.jsx', import.meta.url), 'utf8')
const permissionsSource = readFileSync(new URL('../src/auth/permissions/permissionRegistry.js', import.meta.url), 'utf8')
const navigationPermissionsSource = readFileSync(new URL('../src/auth/permissions/navigationPermissions.js', import.meta.url), 'utf8')
const attorneyNavSource = rolesSource.slice(
  rolesSource.indexOf('attorney: ['),
  rolesSource.indexOf('bond_originator: ['),
)
const transactionsNavItemSource = attorneyNavSource.slice(
  attorneyNavSource.indexOf("key: 'attorney_matters'"),
  attorneyNavSource.indexOf("key: 'attorney_pipeline'"),
)
const pipelineNavItemSource = attorneyNavSource.slice(
  attorneyNavSource.indexOf("key: 'attorney_pipeline'"),
  attorneyNavSource.indexOf("key: 'attorney_workflow_board'"),
)

assert.match(attorneyNavSource, /label:\s*'Matters'/, 'Attorney primary nav should expose Matters')
assert.match(attorneyNavSource, /label:\s*'All Matters'/, 'Attorney Matters nav should include All Matters')
assert.match(attorneyNavSource, /label:\s*'Transfer Matters'/, 'Attorney Matters nav should include Transfer Matters')
assert.match(attorneyNavSource, /label:\s*'Bond Matters'/, 'Attorney Matters nav should include Bond Matters')
assert.match(attorneyNavSource, /label:\s*'Cancellation Matters'/, 'Attorney Matters nav should include Cancellation Matters')
assert.match(attorneyNavSource, /label:\s*'Pipeline'/, 'Attorney primary nav should expose Pipeline')
assert.match(attorneyNavSource, /label:\s*'Incoming Matters'/, 'Attorney Pipeline nav should include Incoming Matters')
assert.match(attorneyNavSource, /label:\s*'Firm'/, 'Attorney primary nav should expose Firm')
assert.match(attorneyNavSource, /label:\s*'Branches'/, 'Attorney Firm nav should include Branches')
assert.match(attorneyNavSource, /label:\s*'Users'/, 'Attorney Firm nav should include Users')
assert.match(attorneyNavSource, /label:\s*'Finance'/, 'Attorney Firm nav should include Finance')
assert.doesNotMatch(attorneyNavSource, /key:\s*'documents'/, 'Attorney primary nav should not expose the redundant Documents page')
assert.doesNotMatch(attorneyNavSource, /key:\s*'team_departments'/, 'Attorney primary nav should not expose the old Team users page')
assert.doesNotMatch(transactionsNavItemSource, /activeMatch:\s*\[[\s\S]*?['"]\/attorney\/matters['"]/, 'Attorney Matters nav should not broadly match incoming matter routes')
assert.doesNotMatch(transactionsNavItemSource, /activeMatch:\s*\[[\s\S]*?['"]\/attorney\/transactions['"]/, 'Attorney Matters nav should not broadly match incoming transaction routes')
assert.match(pipelineNavItemSource, /['"]\/attorney\/matters\/active['"]/, 'Attorney Pipeline should own the Incoming Matters route')
assert.match(transactionsNavItemSource, /children:\s*\[/, 'Attorney Matters should render a matter-type submenu')
assert.match(pipelineNavItemSource, /children:\s*\[/, 'Attorney Pipeline should render an incoming matters submenu')

assert.match(sidebarSource, /attorney_firm:\s*Building2/, 'Attorney Firm nav should have a sidebar icon')
assert.doesNotMatch(sidebarSource, /Firm Administration/, 'Attorney sidebar should not keep the old Firm Administration section label')
assert.match(sidebarSource, /role === 'attorney'\s*\?\s*\[\{ key: 'settings', label: 'Settings', to: '\/settings' \}\]/, 'Attorney sidebar secondary items should collapse to Settings only')

for (const copy of ['All Matters', 'Active Matters', 'Quick Filters', 'Matter Reference', 'Next Action', 'Assigned To']) {
  assert.match(mattersSource, new RegExp(copy), `Matter workspace should include ${copy}`)
}
for (const copy of ['Transfer Matters', 'Bond Matters', 'Cancellation Matters', 'lockedMatterType']) {
  assert.match(matterWorkspaceServiceSource, new RegExp(copy), `Matter workspace service should define ${copy}`)
}
assert.match(mattersSource, /view=\{workspace\.view\}/, 'Matter workspace header should receive route-specific view metadata')
assert.match(mattersSource, /itemLabel=\{workspace\.view\?\.itemLabel/, 'Matter workspace pagination should use route-specific item labels')
assert.match(matterWorkspaceServiceSource, /summary:\s*buildSummary\(viewRows/, 'Matter workspace summary should be scoped to the active route view')
assert.match(matterWorkspaceServiceSource, /kpis:\s*buildKpis\(viewRows/, 'Matter workspace KPIs should be scoped to the active route view')
assert.doesNotMatch(mattersSource, /Attorney Matter OS/, 'Matter workspace should remove the old hero framing')
assert.match(mattersSource, /itg:attorney-matters-search/, 'Matter workspace should listen to the top-right header search')

for (const serviceContract of ['getAttorneyMatterWorkspace', 'buildAttorneyMatterWorkspace', 'calculateMatterHealth', 'quickFilters', 'pagination']) {
  assert.match(matterWorkspaceServiceSource, new RegExp(serviceContract), `Matter workspace service should expose ${serviceContract}`)
}
for (const field of ['matterId', 'reference', 'matterType', 'property', 'buyer', 'seller', 'development', 'unit', 'stage', 'nextAction', 'expectedDue', 'health', 'assignedAttorney', 'status', 'lastActivity', 'priority']) {
  assert.match(matterWorkspaceServiceSource, new RegExp(field), `Matter workspace rows should include ${field}`)
}

assert.match(appSource, /path="\/attorney\/transactions"/, 'Attorney transactions route should exist')
assert.match(appSource, /path="\/attorney\/transactions\/:matterType"/, 'Attorney transactions tab route should exist')
assert.match(appSource, /Navigate to="\/attorney\/matters\/all"/, 'Attorney matters base route should open All Matters')
assert.match(appSource, /AttorneyFirmPage/, 'Attorney users route should render the firm administration workspace')
assert.match(headerSource, /pathname === '\/users'\) return ''/, 'Users route should not render the old top-left Users title')
assert.match(permissionsSource, /prefix:\s*'\/attorney\/transactions'/, 'Attorney transactions route should be permission protected')
assert.match(navigationPermissionsSource, /attorney_firm_users:\s*PERMISSIONS\.manageAttorneyTeam/, 'Attorney Firm users nav should be permission protected')
assert.match(permissionsSource, /prefix:\s*'\/users'/, 'Attorney firm users route should be permission protected')

assert.match(sidebarSource, /label: 'Organizations'/, 'Organizations should remain available from the sidebar')
assert.match(settingsLayoutSource, /label:\s*'Organisation'/, 'Organisation settings should remain available from Settings')
assert.match(appSource, /SettingsAuditLogPage/, 'Audit Logs should be available from Settings routes')

console.log('attorney navigation refactor contract passed')
