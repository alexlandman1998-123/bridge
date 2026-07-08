import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const agentsSource = fs.readFileSync(path.join(root, 'src/pages/Agents.jsx'), 'utf8')
const commissionServiceSource = fs.readFileSync(path.join(root, 'src/services/commissionService.js'), 'utf8')
const migrationSource = fs.readFileSync(path.join(root, '../supabase/migrations/202607080001_commission_targets_period_metric_phase1.sql'), 'utf8')

function sourceBlock(source, startToken, endToken) {
  const start = source.indexOf(startToken)
  assert.notEqual(start, -1, `missing source token: ${startToken}`)
  const end = source.indexOf(endToken, start + startToken.length)
  assert.notEqual(end, -1, `missing end token after ${startToken}: ${endToken}`)
  return source.slice(start, end)
}

assert.equal(
  packageJson.scripts['test:agent-commission-phase5'],
  'node scripts/agent-commission-structure-phase5.test.mjs',
  'package script should expose the agent commission phase 5 regression',
)

assert.match(
  agentsSource,
  /import \{[^}]*buildAgentCommissionSummary[^}]*getAgentCommissionSummary[^}]*updateCommissionTarget[^}]*\} from '\.\.\/services\/commissionService'/s,
  'agent workspace should import read and write commission summary helpers',
)

const summaryComponent = sourceBlock(
  agentsSource,
  'function AgentCommissionStructureSummary',
  'function PrincipalAgentTabShell',
)
for (const label of ['Listing Commission', 'Sales Commission Split', 'Commission to Company Target']) {
  assert.ok(summaryComponent.includes(label), `summary card should include ${label}`)
}
for (const period of ['monthly', 'quarterly', 'yearly']) {
  assert.ok(summaryComponent.includes(period), `summary card should expose ${period} target period`)
}

const modalBlock = sourceBlock(
  agentsSource,
  "{modalMode === 'commission' ? (",
  ") : modalMode === 'permissions' ? (",
)
for (const label of ['Company Target Period', 'Commission to Company Target', 'monthly', 'quarterly', 'yearly']) {
  assert.ok(modalBlock.includes(label), `commission modal should include ${label}`)
}
assert.match(
  modalBlock,
  /disabled=\{!canManageSettings \|\| commissionSaving \|\| !commissionTargetUserId\}/,
  'target controls should avoid saving unlinked agent targets',
)

const saveHandler = sourceBlock(
  agentsSource,
  'async function handleSaveCommissionAssignment()',
  'async function handleSavePermissionsAssignment()',
)
assert.ok(saveHandler.includes("targetType: 'agent'"), 'save handler should persist an agent-scoped target')
assert.ok(saveHandler.includes("targetMetric: 'company_commission'"), 'save handler should persist company contribution targets')
assert.ok(saveHandler.includes('period: commissionForm.companyTargetPeriod'), 'save handler should persist the selected target period')
assert.ok(saveHandler.includes('startMonth: getCommissionTargetPeriodStart'), 'save handler should align target start month to the period')
assert.ok(saveHandler.includes('getAgentCommissionSummary'), 'save handler should refresh the summary after saving')
assert.ok(saveHandler.includes('parsedTargetAmount > 0 && !commissionTargetUserId'), 'save handler should validate target identity before saving')

const modalFooter = sourceBlock(
  agentsSource,
  'modalMode === \'commission\' ? (',
  ') : modalMode === \'permissions\' ? (',
)
assert.ok(modalFooter.includes('commissionSummaryLoading'), 'save button should wait for saved commission summary hydration')

for (const token of [
  "export const COMMISSION_TARGET_PERIODS = ['monthly', 'quarterly', 'yearly']",
  "export const COMMISSION_TARGET_METRICS = ['company_commission', 'agent_commission', 'gross_commission']",
  'const TARGET_SELECT_FIELDS_WITH_METRIC',
  "targetMetric: 'company_commission'",
]) {
  assert.ok(commissionServiceSource.includes(token), `commission service should preserve ${token}`)
}
assert.match(
  commissionServiceSource,
  /const resolvedUserId = normalizeText\(explicitUserId \|\| \(explicitEmail \? '' : context\.userId\)\)/,
  'agent commission summary should not fall back to the principal when an explicit agent email is supplied',
)

for (const token of [
  'target_metric',
  "'monthly', 'quarterly', 'yearly'",
  "'company_commission', 'agent_commission', 'gross_commission'",
  'commission_targets_active_agent_metric_unique',
]) {
  assert.ok(migrationSource.includes(token), `commission target migration should preserve ${token}`)
}

console.log('agent commission structure phase 5 checks passed')
