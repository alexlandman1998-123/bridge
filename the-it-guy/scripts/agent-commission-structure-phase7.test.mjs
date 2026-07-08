import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readWorkspace = (relativePath) => fs.readFileSync(path.join(root, '..', relativePath), 'utf8')

const packageJson = JSON.parse(read('package.json'))
const agentsSource = read('src/pages/Agents.jsx')
const commissionServiceSource = read('src/services/commissionService.js')
const principalDashboardSource = read('src/services/principalDashboardService.js')
const phase5Test = read('scripts/agent-commission-structure-phase5.test.mjs')
const phase6Test = read('scripts/agent-commission-structure-phase6.test.mjs')
const migrationSource = readWorkspace('supabase/migrations/202607080001_commission_targets_period_metric_phase1.sql')

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length
}

assert.equal(
  packageJson.scripts['test:agent-commission-phase7'],
  'node scripts/agent-commission-structure-phase7.test.mjs',
  'package script should expose the agent commission phase 7 rollout contract',
)
assert.equal(
  packageJson.scripts['test:agent-commission-structure'],
  'node src/services/__tests__/commissionService.test.js && node scripts/agent-commission-structure-phase5.test.mjs && node scripts/agent-commission-structure-phase6.test.mjs && node scripts/agent-commission-structure-phase7.test.mjs',
  'package script should expose one complete agent commission verification command',
)

for (const token of [
  'target_metric',
  "'monthly', 'quarterly', 'yearly'",
  "'company_commission', 'agent_commission', 'gross_commission'",
  'commission_targets_active_company_metric_unique',
  'commission_targets_active_agent_metric_unique',
]) {
  assert.ok(migrationSource.includes(token), `phase 1 migration should preserve ${token}`)
}

for (const token of [
  'COMMISSION_TARGET_PERIODS',
  'COMMISSION_TARGET_METRICS',
  'TARGET_SELECT_FIELDS_WITH_METRIC',
  'TARGET_SELECT_FIELDS_LEGACY',
  'targetSelectVariants',
  'buildAgentCommissionSummary',
  'getAgentCommissionSummary',
  'getAgentCompanyContributionTracker',
  'updateCommissionTarget',
  'buildClearQuery({ includeMetric: false })',
]) {
  assert.ok(commissionServiceSource.includes(token), `commission service should preserve ${token}`)
}

for (const token of [
  'target_metric',
  "company_commission",
  'activeCompanyTarget',
]) {
  assert.ok(principalDashboardSource.includes(token), `principal dashboard should preserve ${token}`)
}

assert.ok(
  agentsSource.includes("import { buildAgentCommissionSummary, getAgentCommissionSummary, updateCommissionTarget } from '../services/commissionService'"),
  'agent workspace should keep the commission summary/save imports together',
)
assert.equal(
  countMatches(agentsSource, /<AgentCommissionStructureSummary/g),
  2,
  'agent workspace should render the structured commission card in performance and settings tabs',
)
for (const token of [
  'Listing Commission',
  'Sales Commission Split',
  'Commission to Company Target',
  'Company Target Period',
  'Company Split',
  'commissionSummaryLoading',
  "targetMetric: 'company_commission'",
  'getCommissionTargetPeriodStart',
  'setRemoteCommissionSummary(refreshedSummary)',
]) {
  assert.ok(agentsSource.includes(token), `agent workspace should preserve ${token}`)
}

for (const token of [
  'Listing Commission',
  'Sales Commission Split',
  'Commission to Company Target',
  "targetMetric: 'company_commission'",
]) {
  assert.ok(phase5Test.includes(token), `phase 5 regression should preserve ${token}`)
}

for (const token of [
  'targetSelectVariants',
  'TARGET_SELECT_FIELDS_LEGACY',
  'buildClearQuery({ includeMetric: false })',
  'normalizeTarget(legacyResult.data, { targetMetric })',
]) {
  assert.ok(phase6Test.includes(token), `phase 6 regression should preserve ${token}`)
}

console.log('agent commission structure phase 7 rollout checks passed')
