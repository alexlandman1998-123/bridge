import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const layout = await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8')
const landing = await readFile(new URL('../src/pages/settings/SettingsLanding.jsx', import.meta.url), 'utf8')
const account = await readFile(new URL('../src/pages/settings/SettingsAccountPage.jsx', import.meta.url), 'utf8')
const legalTemplates = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const documentPacketsApi = await readFile(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
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

assert.ok(
  layout.indexOf("label: 'Legal Templates'") < layout.indexOf("label: 'Preferred Partners'"),
  'Settings sidebar should list Legal Templates before Preferred Partners.',
)

assert.ok(
  landing.indexOf("title: 'Legal Templates'") < landing.indexOf("title: 'Preferred Partners'"),
  'Settings home should list Legal Templates before Preferred Partners.',
)

assert.match(
  layout,
  /!canManage && \[[^\]]*'\/settings\/legal-templates'[\s\S]*\.includes\(item\.to\)/,
  'Settings sidebar should hide Legal Templates from non-management users.',
)

assert.match(
  landing,
  /!canManage && \[[^\]]*'Legal Templates'[\s\S]*\.includes\(card\.title\)/,
  'Settings home should hide Legal Templates from non-management users.',
)

assert.match(
  landing,
  /Manage mandate, OTP and legal document defaults\.[\s\S]*Manage legal templates/,
  'Settings home should explain Legal Templates in principal-friendly document terms.',
)

assert.match(
  legalTemplates,
  /title = 'Legal Templates'[\s\S]*Manage mandate, OTP and legal document templates/,
  'Legal templates page should use principal-friendly title and description copy.',
)

assert.match(
  documentPacketsApi,
  /TEMPLATE_SELECT_PLAN_CACHE_KEY[\s\S]*sessionStorage[\s\S]*rememberDocumentPacketTemplateSelectPlanIndex\(Math\.min\(planIndex \+ 1/,
  'Legal template loading should cache schema-compatible select plans after missing-column fallbacks.',
)

assert.match(
  app,
  /path="legal-templates"[\s\S]*<OrganisationSettingsManageRoute>[\s\S]*<SettingsSigningTemplatesPage \/>[\s\S]*<\/OrganisationSettingsManageRoute>/,
  'Settings legal templates route should require organisation settings management authority.',
)

assert.match(
  app,
  /path="signing-templates"[\s\S]*<OrganisationSettingsManageRoute>[\s\S]*<SettingsSigningTemplatesPage \/>[\s\S]*<\/OrganisationSettingsManageRoute>/,
  'Legacy signing templates route should require organisation settings management authority.',
)

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
  app,
  /const isSettingsRoute = location\.pathname === '\/settings' \|\| location\.pathname\.startsWith\('\/settings\/'\)[\s\S]*\? '\/settings'[\s\S]*: isBondRoute/,
  'Settings route transitions should keep the settings shell mounted instead of re-keying the entire outlet.',
)

assert.match(
  packageJson,
  /"test:settings-experience-refactor": "node scripts\/settings-experience-refactor\.test\.mjs"/,
  'package.json should expose the settings experience refactor test.',
)

console.log('settings-experience-refactor tests passed')
