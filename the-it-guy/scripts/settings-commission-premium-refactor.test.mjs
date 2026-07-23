import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  commissionPage: await readFile(new URL('../src/pages/settings/SettingsCommissionStructuresPage.jsx', import.meta.url), 'utf8'),
  navigation: await readFile(new URL('../src/pages/settings/settingsNavigation.js', import.meta.url), 'utf8'),
  roles: await readFile(new URL('../src/lib/roles.js', import.meta.url), 'utf8'),
  app: await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  reports: await readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

for (const token of [
  'Organisation</span>',
  '<span>Commission</span>',
  'Manage how your agency pays its people',
  'Commission Overview',
  'Agency Default Split',
  'Agents Assigned',
  'Referral Rules',
  'Overview',
  'Commission Levels',
  'Business Rules',
  'Overrides',
  'Templates',
  'Quick Actions',
  'Create Level',
  'Add Referral Rule',
  'Assign Agents',
  'View Reports',
  'Agent Assignments',
  'Agent Lookup',
  'Rule Preview',
  'Search Agent',
  'Save Override',
  'SplitBar',
  'Commission Health',
  'Last Updated',
  'CommissionModal',
  'Save Level',
  'Save Template',
]) {
  assert(files.commissionPage.includes(token), `commission page should include premium workspace marker: ${token}`)
}

for (const token of [
  'KpiCard',
  'CommissionOverviewDashboard',
  'CommissionLevelsWorkspace',
  'BusinessRulesWorkspace',
  'ReferralRulesWorkspace',
  'SimplifiedOverridesWorkflow',
  'TemplatesWorkspace',
  'OverrideEditor',
  'TemplateEditor',
  'LevelEditor',
  'variant="drawer"',
]) {
  assert(files.commissionPage.includes(token), `commission page should include requested finance workspace component: ${token}`)
}

for (const removedToken of [
  'SettingsPageHeader',
  'SettingsSectionCard',
  'settingsActionRowClass',
  'settingsGridClass',
  'settingsTableClass',
  'CommissionOverviewCards',
  'AgentSplitLevelsCard',
  'TargetsWorkspace',
  'TargetEditor',
  'CommissionSummaryPanel',
  "setActiveTab('targets')",
  "openModal('target')",
]) {
  assert(!files.commissionPage.includes(removedToken), `commission page should not retain old long-form marker: ${removedToken}`)
}

for (const token of [
  "key: 'agency'",
  "label: 'Organisation'",
  "to: '/agency/commission'",
  "label: 'Commission'",
  "label: 'Branding'",
  "label: 'Roles & Permissions'",
  "label: 'Activity'",
]) {
  assert(files.roles.includes(token), `agent navigation should expose Commission under Organisation: ${token}`)
}

assert.doesNotMatch(files.navigation, /to: '\/settings\/commission'/, 'settings navigation should not advertise Commission as a setting')
assert.match(files.app, /path="\/agency\/commission"[\s\S]*<SettingsCommissionStructuresPage \/>/)
assert.match(files.app, /path="commission"[\s\S]*<Navigate to="\/agency\/commission" replace \/>/)
assert.match(files.app, /path="commission-structures"[\s\S]*<Navigate to="\/agency\/commission" replace \/>/)
assert.match(files.reports, /PerformanceTargetsPanel/)
assert.match(files.reports, /updateCommissionTarget\(/)
assert.match(files.reports, /value: 'performance', label: 'Performance'/)
assert.match(files.packageJson, /"test:settings-commission-premium-refactor": "node scripts\/settings-commission-premium-refactor\.test\.mjs"/)

console.log('Organisation commission IA refactor contract passed.')
