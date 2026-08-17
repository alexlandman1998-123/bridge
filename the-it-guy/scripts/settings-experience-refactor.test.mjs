import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const sidebar = await readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
const layout = await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8')
const landing = await readFile(new URL('../src/pages/settings/SettingsLanding.jsx', import.meta.url), 'utf8')
const navigation = await readFile(new URL('../src/pages/settings/settingsNavigation.js', import.meta.url), 'utf8')
const premiumSaaS = await readFile(new URL('../src/styles/premiumSaaS.css', import.meta.url), 'utf8')
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

await access(new URL('../src/pages/settings/SettingsLanding.jsx', import.meta.url))

assert.doesNotMatch(
  sidebar,
  /buildVisibleSettingsGroups|settingsChildren|withSettingsChildren|canManageOrganisationSettings/,
  'Global sidebar should not build or inject settings submenu items.',
)

assert.match(
  sidebar,
  /\{ key: 'settings', label: 'Settings', to: '\/settings' \}/,
  'Global sidebar should keep Settings as a single destination item.',
)

assert.doesNotMatch(
  navigation,
  /label: 'Overview'/,
  'Settings navigation should not expose a dedicated Overview item.',
)

for (const group of ['YOUR ACCOUNT', 'ORGANISATION', 'PLATFORM MANAGEMENT']) {
  assert.match(navigation + landing, new RegExp(group), `Settings dashboard should include ${group}.`)
}

for (const route of ['/settings/profile', '/settings/security', '/settings/organisation', '/settings/branding', '/settings/roles', '/settings/activity', '/settings/billing']) {
  assert.match(navigation + app, new RegExp(route.replaceAll('/', '\\/')), `Settings route ${route} should be wired into the workspace.`)
}

assert.match(
  app,
  /path="overview" element=\{<Navigate to="\/settings" replace \/>/,
  'Legacy /settings/overview should redirect to the settings dashboard.',
)

assert.match(
  app,
  /path="roles"[\s\S]*<PermissionGate capability="manage_users">[\s\S]*<SettingsUsersPage \/>/,
  'Roles & Permissions should have a clean /settings/roles route guarded by manage_users.',
)

assert.match(
  app,
  /path="legal-templates\/\*"[\s\S]*<Navigate to="\/settings" replace \/>/,
  'Hidden settings legal templates URLs should redirect back to Settings.',
)

assert.match(
  layout,
  /function SettingsSidebar[\s\S]*buildVisibleSettingsGroups[\s\S]*settings-workspace-nav[\s\S]*<Outlet \/>/,
  'SettingsLayout should own the permission-aware internal navigation and persistent content outlet.',
)

assert.match(
  landing,
  /<h1>Settings<\/h1>[\s\S]*settings-dashboard-card[\s\S]*settings-dashboard-chip/,
  'Settings dashboard should render a minimal Settings header and grouped navigation cards with status chips.',
)

assert.match(
  navigation,
  /PERMISSIONS\.manageWorkspaceSettings[\s\S]*PERMISSIONS\.manageUsers[\s\S]*PERMISSIONS\.manageBilling/,
  'Settings navigation should remain permission-driven.',
)

assert.match(
  premiumSaaS,
  /\.settings-workspace[\s\S]*grid-template-columns: 280px minmax\(0, 1fr\)[\s\S]*\.settings-workspace-mobile-nav[\s\S]*\.settings-dashboard-card-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  'Settings workspace styling should provide desktop nav, mobile nav, and dashboard card grid.',
)

assert.match(
  packageJson,
  /"test:settings-experience-refactor": "node scripts\/settings-experience-refactor\.test\.mjs"/,
  'package.json should expose the settings experience refactor test.',
)

console.log('settings-experience-refactor tests passed')
