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
  "label: 'Overview'",
  "label: 'Levels'",
  "label: 'Agents'",
  "label: 'Rules'",
  'Agency Default',
  'Used by {totalAgents || 0} agent',
  'Referral Rules',
  'Commission Levels',
  'Overrides',
  'AgentsWorkspace',
  'AgentCard',
  'AgentAvatar',
  'AgentCommissionDrawer',
  'Edit Split',
  'Commission Level',
  'Override Split',
  'Effective Date',
  'Save Changes',
  'Create Level',
  'Templates',
  'Rule Preview',
  'Search agents',
  'SplitBar',
  'CommissionModal',
  'Save Level',
  'Save Template',
]) {
  assert(files.commissionPage.includes(token), `commission page should include premium workspace marker: ${token}`)
}

for (const token of [
  'OverviewMetric',
  'CommissionOverviewDashboard',
  'CommissionLevelsWorkspace',
  'BusinessRulesWorkspace',
  'ReferralRulesWorkspace',
  'TemplatesWorkspace',
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
  'CommissionPageHeader',
  'CommissionOverviewCards',
  'AgentSplitLevelsCard',
  'AgentAssignmentsTable',
  'TargetsWorkspace',
  'TargetEditor',
  'CommissionSummaryPanel',
  'KpiCard',
  'Monthly Commission',
  'Monthly Forecast',
  'Remaining Target',
  'Forecast Percentage',
  'Commission Overview',
  'Manage how your agency pays its people',
  'A complete snapshot',
  'Quick Actions',
  'Last Updated',
  'Agent Lookup',
  'Search Agent',
  'View Reports',
  "setActiveTab('targets')",
  "openModal('target')",
  "setActiveTab('business_rules')",
  "openModal('override')",
]) {
  assert(!files.commissionPage.includes(removedToken), `commission page should not retain old long-form marker: ${removedToken}`)
}

for (const token of [
  "key: 'agency'",
  "label: 'Organisation'",
  "to: '/agency/commission'",
  "label: 'Commission'",
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
