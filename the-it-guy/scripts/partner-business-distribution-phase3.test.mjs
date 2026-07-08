import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const agentsSource = read('src/pages/Agents.jsx')
const agentPerformanceDataSource = read('src/modules/agency/agents/agentPerformanceDataService.js')

for (const token of [
  "import { buildPartnerBusinessDistribution } from '../services/partnerBusinessDistributionService'",
  'function buildAgentPartnerBusinessDistribution',
  'const transactions = Array.isArray(agent?.deals) ? agent.deals : []',
  'rolePlayers: getRolePlayersForAgentDeals(transactions, rolePlayers)',
  'transactionRolePlayers: []',
  'partnerBusinessDistribution: buildAgentPartnerBusinessDistribution({ deals: agent.deals }, transactionRolePlayers)',
  'transactionRolePlayers = []',
  'const partnerBusinessDistribution = useMemo',
  'buildAgentPartnerBusinessDistribution(agent',
  '...(workspaceSnapshot?.rolePlayers || [])',
  'transactionRolePlayers: performanceSources.transactionRolePlayers || []',
]) {
  assert.ok(agentsSource.includes(token), `agent module phase 3 should preserve ${token}`)
}

assert.ok(
  agentPerformanceDataSource.includes('transactionRolePlayers: flattenTransactionRolePlayers(transactionRows)'),
  'agent performance data source should expose a transactionRolePlayers contract for the agent dashboard',
)

console.log('partner business distribution phase 3 agent module checks passed')
