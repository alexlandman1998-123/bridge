import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
const { PERMISSIONS } = await vite.ssrLoadModule('/src/auth/permissions/permissionRegistry.js')
const { SETTINGS_NAV_GROUPS, buildVisibleSettingsGroups } = await vite.ssrLoadModule('/src/pages/settings/settingsNavigation.js')

const allow = (...permissions) => {
  const grants = new Set(permissions)
  return (permission) => grants.has(permission)
}
const flatten = (groups) => groups.flatMap((group) => group.items.map((item) => item.to))

const attorneyOwnerRoutes = flatten(buildVisibleSettingsGroups({
  role: 'attorney',
  canManage: true,
  can: allow(PERMISSIONS.manageUsers, PERMISSIONS.manageBilling),
}))
assert.ok(attorneyOwnerRoutes.includes('/settings/users'), 'attorney owners should reach governed user settings')
assert.ok(attorneyOwnerRoutes.includes('/settings/billing'), 'attorney billing owners should reach billing settings')
assert.ok(!attorneyOwnerRoutes.includes('/settings/commission'), 'agency commission settings should not leak into attorney workspaces')

const bondRestrictedRoutes = flatten(buildVisibleSettingsGroups({ role: 'bond_originator', canManage: false, can: allow() }))
assert.ok(!bondRestrictedRoutes.includes('/settings/users'), 'users should be hidden without manage-users permission')
assert.ok(!bondRestrictedRoutes.includes('/settings/billing'), 'billing should be hidden without manage-billing permission')
assert.ok(!bondRestrictedRoutes.includes('/settings/organisation'), 'workspace management should be hidden without settings permission')
assert.ok(bondRestrictedRoutes.includes('/settings/profile'), 'personal settings should remain available')

for (const group of SETTINGS_NAV_GROUPS) {
  assert.ok(group.title && group.description, `${group.label} should have meaningful information architecture copy`)
  for (const item of group.items) {
    assert.ok(item.description, `${item.to} should explain its functional purpose`)
  }
}

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [app, layout, landing, navigation, ui] = await Promise.all([
  read('../src/App.jsx'),
  read('../src/pages/settings/SettingsLayout.jsx'),
  read('../src/pages/settings/SettingsLanding.jsx'),
  read('../src/pages/settings/settingsNavigation.js'),
  read('../src/pages/settings/settingsUi.jsx'),
])

for (const route of flatten(SETTINGS_NAV_GROUPS)) {
  const childPath = route.replace('/settings/', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(app, new RegExp(`path=["']${childPath}["']`), `${route} must resolve to a real settings route`)
}

assert.match(app, /path="users"[\s\S]*allowedRoles=\{\['developer', 'agent', 'attorney', 'bond_originator'\]\}[\s\S]*capability="manage_users"/)
assert.match(app, /path="billing"[\s\S]*allowedRoles=\{\['developer', 'agent', 'attorney', 'bond_originator'\]\}[\s\S]*capability="manage_billing"/)
assert.match(layout, /organisationMembershipRole \|\| workspaceRole/, 'settings shell should use the workspace membership already resolved by context')
assert.doesNotMatch(layout, /fetchOrganisationSettings/, 'settings shell should not issue a second membership lookup')
assert.match(layout, /aria-controls="mobile-settings-navigation"/)
assert.match(layout, /<h1[^>]*>\{workspaceName\}<\/h1>/)
assert.match(landing, /buildVisibleSettingsGroups/, 'landing and sidebar should share visibility rules')
assert.match(landing, /Every section below is connected to an active workspace function/)
assert.match(navigation, /permission: PERMISSIONS\.manageUsers/)
assert.match(navigation, /permission: PERMISSIONS\.manageBilling/)
assert.match(ui, /text-2xl[\s\S]*tracking-\[-0\.025em\]/, 'shared page headings should use the refined hierarchy')

await vite.close()
console.log('settings cross-module experience phase 4 checks passed')
