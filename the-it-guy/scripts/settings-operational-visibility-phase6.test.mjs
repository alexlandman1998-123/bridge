import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [app, navigation, page, service, settingsApi, phase5] = await Promise.all([
  read('../src/App.jsx'),
  read('../src/pages/settings/settingsNavigation.js'),
  read('../src/pages/settings/SettingsActivityPage.jsx'),
  read('../src/services/settingsActivityService.js'),
  read('../src/lib/settingsApi.js'),
  read('./settings-release-readiness-phase5.test.mjs'),
])

assert.match(app, /const SettingsActivityPage = lazy/)
assert.match(app, /path="activity"[\s\S]*capability="manage_workspace_settings"[\s\S]*<SettingsActivityPage \/>/)
assert.match(navigation, /to: '\/settings\/activity'[\s\S]*permission: PERMISSIONS\.manageWorkspaceSettings/)

assert.match(service, /canManageOrganisationSettings/)
assert.match(service, /\.from\('security_audit_events'\)/)
assert.match(service, /\.from\('organization_events'\)/)
assert.match(service, /listWorkspaceBillingActivity/)
assert.match(service, /\.from\('profiles'\)[\s\S]*\.in\('id', actorIds\)/)
assert.match(service, /hasAtomicOwnershipEvent[\s\S]*organisation_ownership_transferred/, 'atomic ownership events should prevent duplicate client audit rows')
assert.match(service, /sort\(\(left, right\) => new Date\(right\.createdAt/)

assert.match(page, /title="Settings activity"/)
assert.match(page, /Events come directly from workspace audit, organisation event, and billing event records/)
assert.match(page, /value=\{category\}[\s\S]*setCategory/)
assert.match(page, /onClick=\{handleRefresh\}/)
assert.doesNotMatch(page, /AUDIT_ROWS|Settings viewed|Profile sync/, 'the activity page must not contain fabricated audit events')
assert.doesNotMatch(page, /<button[^>]*disabled[^={>]*>/, 'activity controls must not be permanently disabled')

assert.match(settingsApi, /recordAccountSettingsAudit[\s\S]*account_profile_updated/)
assert.match(settingsApi, /account_password_changed/)
assert.doesNotMatch(settingsApi, /account_password_changed[\s\S]{0,200}password/, 'password audit metadata must never include the password')
assert.match(phase5, /SETTINGS_NAV_GROUPS/, 'the Phase 5 route integrity gate should automatically cover Activity')

console.log('settings operational visibility phase 6 checks passed')
