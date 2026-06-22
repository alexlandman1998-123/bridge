import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const commandCenterSource = readFileSync(new URL('../src/pages/CommandCenterPage.jsx', import.meta.url), 'utf8')
const mobileUiSource = readFileSync(new URL('../src/components/mission-control/MissionControlMobileUi.jsx', import.meta.url), 'utf8')
const clientApiSource = readFileSync(new URL('../src/services/hqMissionControlApi.js', import.meta.url), 'utf8')
const mobileModelSource = readFileSync(new URL('../src/services/missionControlSnapshotModel.js', import.meta.url), 'utf8')
const serverServiceSource = readFileSync(new URL('../server/services/adminMobileDashboardService.js', import.meta.url), 'utf8')
const serverApiSource = readFileSync(new URL('../server/services/adminMobileDashboardApi.js', import.meta.url), 'utf8')
const routeSource = readFileSync(new URL('../api/admin/mobile-dashboard.js', import.meta.url), 'utf8')
const viteSource = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

assert.match(clientApiSource, /fetch\('\/api\/admin\/mobile-dashboard'/, 'Client should fetch the admin mobile dashboard endpoint')
assert.match(viteSource, /\/api\/admin\/mobile-dashboard/, 'Vite dev middleware should expose the admin mobile endpoint')
assert.match(routeSource, /createAdminMobileDashboardResponse/, 'Node API route should delegate to the admin mobile dashboard response builder')
assert.match(serverApiSource, /Admin mobile dashboard only supports GET/, 'Endpoint should be GET-only')

for (const key of [
  'greetingName',
  'networkHealth',
  'kpis',
  'attentionRequired',
  'transactionDistribution',
  'averageRegistrationTime',
  'trends',
  'recentActivity',
]) {
  assert.match(serverServiceSource, new RegExp(`${key}:|${key},`), `Server response should include ${key}`)
  assert.match(mobileModelSource, new RegExp(`${key}:|${key},`), `Mobile model should normalize ${key}`)
}

for (const label of [
  'Good morning',
  'Across the Arch9 ecosystem',
  'Network Health',
  'Key Performance',
  'Attention Required',
  'Transaction Distribution',
  'Avg. Registration Time',
  'Performance Trends',
  'Recent Activity',
]) {
  assert.match(`${commandCenterSource}\n${mobileUiSource}`, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Mobile UI should render ${label}`)
}

for (const label of ['Dashboard', 'Ecosystem', 'Alerts', 'Search', 'More']) {
  assert.match(mobileUiSource, new RegExp(`label:\\s*'${label}'`), `Bottom nav should include ${label}`)
}

assert.doesNotMatch(mobileUiSource, /label:\s*'Roleplayers'/, 'Bottom nav should not use Roleplayers')
assert.doesNotMatch(mobileUiSource, /label:\s*'Growth'/, 'Bottom nav should not use Growth')
assert.doesNotMatch(mobileUiSource, /label:\s*'HQ'/, 'Bottom nav should not use HQ')

for (const key of ['stalledTransactions', 'inactiveOrganisations', 'failedInvites', 'integrationIssues']) {
  assert.match(serverServiceSource, new RegExp(key), `Attention required should include ${key}`)
}

for (const table of ['platform_revenue_events', 'organisation_activity_events', 'platform_integration_events', 'platform_activity_events']) {
  assert.match(serverServiceSource, new RegExp(table), `Server service should read ${table}`)
}

assert.match(serverServiceSource, /score -= Math\.min\(stalledTransactions \* 2, 30\)/, 'Network health should penalize stalled transactions')
assert.match(serverServiceSource, /score -= Math\.min\(integrationIssues \* 3, 25\)/, 'Network health should penalize integration issues')
assert.match(serverServiceSource, /score -= Math\.min\(failedInvites, 15\)/, 'Network health should penalize failed invites')
assert.match(serverServiceSource, /score -= Math\.min\(inactiveOrganisations, 20\)/, 'Network health should penalize inactive organisations')

console.log('admin mobile dashboard refactor contract passed')
