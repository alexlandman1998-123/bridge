import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  commissionPage: await readFile(new URL('../src/pages/settings/SettingsCommissionStructuresPage.jsx', import.meta.url), 'utf8'),
  layout: await readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8'),
  app: await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

for (const token of [
  'Settings</span>',
  '<span>Commission</span>',
  'Configure commission structures, agent splits, referral rules and company performance targets.',
  'Commission Overview',
  'Listing Commission',
  'Agency Default Split',
  'Monthly Target',
  'Projected',
  'Referral Rules',
  'Overview',
  'Commission Levels',
  'Targets',
  'Overrides',
  'Templates',
  'Commission Categories',
  'Quick Actions',
  'Create Commission Level',
  'Edit Referral Rules',
  'Assign Agents',
  'Update Target',
  'Existing Levels',
  'New Commission Level',
  'Agent Assignments',
  'Target Forecast',
  'Company Metrics',
  'Rule Preview',
  'Same Branch',
  'Search Agent',
  'Add Override',
  'Commission Calculator',
  'Gross Commission',
  'Agent',
  'Agency',
  'SplitBar',
  'Commission Health',
  'Audit Trail',
  'CommissionModal',
  'Cancel',
  'Save Level',
  'Save Target',
  'Save Template',
  'Save Override',
]) {
  assert(files.commissionPage.includes(token), `commission page should include premium workspace marker: ${token}`)
}

for (const token of [
  'KpiCard',
  'CommissionOverviewDashboard',
  'CommissionLevelsWorkspace',
  'TargetsWorkspace',
  'ReferralRulesWorkspace',
  'OverridesWorkspace',
  'TemplatesWorkspace',
  'CommissionSummaryPanel',
  'OverrideEditor',
  'TargetEditor',
  'TemplateEditor',
  'LevelEditor',
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
]) {
  assert(!files.commissionPage.includes(removedToken), `commission page should not retain old long-form marker: ${removedToken}`)
}

for (const token of [
  "to: '/settings/commission'",
  "label: 'Commission'",
  'lg:grid-cols-[220px_minmax(0,1fr)]',
]) {
  assert(files.layout.includes(token), `settings layout should keep Commission in the inner settings navigation: ${token}`)
}

assert.match(files.app, /path="commission"[\s\S]*<SettingsCommissionStructuresPage \/>/)
assert.match(files.app, /path="commission-structures"[\s\S]*<SettingsCommissionStructuresPage \/>/)
assert.match(files.packageJson, /"test:settings-commission-premium-refactor": "node scripts\/settings-commission-premium-refactor\.test\.mjs"/)

console.log('Settings commission premium refactor contract passed.')
