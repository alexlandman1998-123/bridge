import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const removedDecorativePages = [
  'src/pages/settings/SettingsAuditLogPage.jsx',
  'src/pages/settings/SettingsIntegrationsPage.jsx',
  'src/pages/settings/SettingsSupportPage.jsx',
]
for (const page of removedDecorativePages) {
  await assert.rejects(access(new URL(page, root)), `${page} should be removed, not merely hidden`)
}

const [app, navigation, account, organisation, commission, users, billing, leadCapture, settingsApi] = await Promise.all([
  read('src/App.jsx'),
  read('src/pages/settings/settingsNavigation.js'),
  read('src/pages/settings/SettingsAccountPage.jsx'),
  read('src/pages/settings/SettingsOrganisationPage.jsx'),
  read('src/pages/settings/SettingsCommissionStructuresPage.jsx'),
  read('src/pages/settings/SettingsUsersPage.jsx'),
  read('src/pages/settings/SettingsBillingPage.jsx'),
  read('src/pages/settings/SettingsLeadCapturePage.jsx'),
  read('src/lib/settingsApi.js'),
])

for (const removedRoute of ['integrations', 'api', 'audit-log', 'help']) {
  assert.doesNotMatch(app, new RegExp(`path=["']${removedRoute}["']`), `${removedRoute} must not be routable`)
  assert.doesNotMatch(navigation, new RegExp(`/settings/${removedRoute}`), `${removedRoute} must not be advertised`)
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
const { SETTINGS_NAV_GROUPS } = await vite.ssrLoadModule('/src/pages/settings/settingsNavigation.js')
for (const item of SETTINGS_NAV_GROUPS.flatMap((group) => group.items)) {
  const childPath = item.to.replace('/settings/', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(app, new RegExp(`path=["']${childPath}["']`), `${item.to} must be backed by a registered route`)
  assert.ok(item.description, `${item.to} must describe a real functional area`)
}
await vite.close()

const functionalContracts = [
  [account, ['updateAccountSettings(', 'changePassword('], 'account'],
  [organisation, ['updateOrganisationSettings(', 'handleSave'], 'organisation'],
  [commission, ['createCommissionLevel(', 'saveOrganisationCommissionStructure(', 'assignUserCommissionLevel('], 'commission'],
  [users, ['updateOrganisationUserRole(', 'updateOrganisationUserJobTitle(', 'transferOrganisationOwnership(', 'deactivateOrganisationUser('], 'users'],
  [billing, ['requestWorkspacePlanChange(', 'cancelWorkspacePlanChange('], 'billing'],
  [leadCapture, ['ensureDefaultLeadCaptureAliases(', 'repairLeadCaptureReviewItem(', 'linkLeadCaptureReviewItem('], 'lead capture'],
]
for (const [source, markers, area] of functionalContracts) {
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${area} settings must remain connected to ${marker}`)
  }
}

for (const service of [
  'updateAccountSettings',
  'changePassword',
  'updateOrganisationSettings',
  'updateOrganisationUserRole',
  'updateOrganisationUserJobTitle',
  'transferOrganisationOwnership',
  'deactivateOrganisationUser',
  'listBillingInvoices',
]) {
  assert.match(settingsApi, new RegExp(`export async function ${service}\\b`), `${service} must remain an exported settings service`)
}

assert.match(users, /title="Deactivate this user\?"/)
assert.match(users, /confirming=\{deactivatingUser\}/)
assert.match(users, /!isCurrentUser[\s\S]*userRow\.role !== 'owner'/)
assert.match(users, /setSavingRoleUserId\(userRowId\)[\s\S]*setMessage\('User role updated\.'\)/)
assert.doesNotMatch(users, /onClick=\{\(\) => handleDeactivate\(userRow\.id\)\}/, 'deactivation must not fire directly from the table')

console.log('settings release readiness phase 5 checks passed')
