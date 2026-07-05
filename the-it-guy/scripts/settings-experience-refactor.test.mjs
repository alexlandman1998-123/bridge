import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const layout = await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8')
const account = await readFile(new URL('../src/pages/settings/SettingsAccountPage.jsx', import.meta.url), 'utf8')
const legalTemplates = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const documentPacketsApi = await readFile(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
const ui = await readFile(new URL('../src/pages/settings/settingsUi.jsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

let landingExists = true
try {
  await access(new URL('../src/pages/settings/SettingsLanding.jsx', import.meta.url))
} catch {
  landingExists = false
}

assert.equal(landingExists, false, 'Settings launcher landing page should be removed.')

for (const group of ['PERSONAL', 'COMPANY', 'TRANSACTIONS', 'PLATFORM', 'SUPPORT']) {
  assert.match(layout, new RegExp(`label: '${group}'`), `Settings sidebar should include ${group} navigation group.`)
}

for (const route of ['/settings/profile', '/settings/security', '/settings/notifications', '/settings/organisation', '/settings/branding', '/settings/users', '/settings/commission-structures', '/settings/signing-templates', '/settings/legal-templates', '/settings/lead-capture', '/settings/integrations', '/settings/api', '/settings/billing', '/settings/help']) {
  assert.match(layout + app, new RegExp(route.replaceAll('/', '\\/')), `Settings route ${route} should be wired into the workspace.`)
}

assert.match(
  app,
  /<Route index element=\{<Navigate to="profile" replace \/>\} \/>/,
  'Settings index route should open Profile by default.',
)

assert.doesNotMatch(app, /SettingsLanding/, 'SettingsLanding should not be imported or routed.')
assert.doesNotMatch(layout + account + app, /Settings categories|Manage your account, organisation and platform preferences\./, 'Settings launcher copy and category cards should not remain.')

assert.ok(
  layout.indexOf("label: 'Document Builder'") < layout.indexOf("label: 'Documents'"),
  'Settings sidebar should list Document Builder before Documents.',
)

assert.match(
  layout,
  /placeholder="Search settings\.\.\."/,
  'Settings search should use the workspace placeholder.',
)

for (const keyword of ['fields', 'templates', 'api keys', 'logo colours colors brand', 'billing subscription invoices', 'permissions']) {
  assert.match(layout, new RegExp(keyword), `Settings search keywords should include ${keyword}.`)
}

assert.match(
  layout,
  /function AccountSummary[\s\S]*Profile Complete[\s\S]*Edit Profile/,
  'Settings layout should render the compact account summary.',
)

assert.match(
  layout,
  /requiresManage: true[\s\S]*canShowSettingsItem[\s\S]*item\.requiresManage && !canManage/,
  'Settings sidebar should hide management-only sections from non-management users.',
)

assert.match(
  app,
  /path="branding"[\s\S]*<SettingsOrganisationPage section="branding" \/>/,
  'Branding should be a deep-linkable settings workspace.',
)

assert.match(
  legalTemplates,
  /title = 'Document Builder'[\s\S]*Create, preview, send, and manage the documents your agency uses every day\./,
  'Document Builder page should keep the simplified title and description copy.',
)

assert.match(
  legalTemplates,
  /DEFAULT_ALLOWED_PACKET_TYPES[\s\S]*stableAllowedPacketTypes[\s\S]*useEffect\(\(\) => \{[\s\S]*loadTemplatesAndRegistry[\s\S]*\}, \[defaultPacketType, loadTemplatesAndRegistry, resolvedWorkspaceType, role, workspaceMembershipRole\]\)/,
  'Legal template loading should use a stable packet-type dependency so normal renders do not restart the library load.',
)

assert.match(
  legalTemplates,
  /const \{ role, currentMembership, currentWorkspace, workspaceType \} = useWorkspace\(\)[\s\S]*workspaceMembershipRole[\s\S]*if \(workspaceMembershipRole\) \{[\s\S]*setMembershipRole\(workspaceMembershipRole\)[\s\S]*\} else \{[\s\S]*fetchOrganisationSettings\(\)/,
  'Legal template loading should use the already-resolved workspace membership role before falling back to organisation settings.',
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

for (const section of ['Profile Photo', 'Personal Information', 'Surname', 'Bio', 'Employment', 'Preferences', 'Danger Zone', 'Two-factor authentication', 'Active Sessions', 'Login History']) {
  assert.match(account, new RegExp(section), `Settings account workspace missing section: ${section}`)
}

assert.match(
  ui,
  /function SettingsSectionCard[\s\S]*border-t border/,
  'Settings sections should use dividers instead of launcher-style cards.',
)

assert.match(
  ui,
  /function SettingsStickySaveBar[\s\S]*disabled=\{!dirty \|\| saving\}[\s\S]*Save Changes/,
  'Settings should use a sticky bottom-right Save Changes control that only enables when data changes.',
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
