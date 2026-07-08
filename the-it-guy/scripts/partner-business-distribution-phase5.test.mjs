import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const agentsSource = read('src/pages/Agents.jsx')
const agentPerformanceDataSource = read('src/modules/agency/agents/agentPerformanceDataService.js')
const apiSource = read('src/lib/api.js')

for (const token of [
  'function flattenTransactionRolePlayers',
  'function getNestedTransactionRolePlayers',
  'function getRolePlayerDedupKey',
  'const transactionRows = Array.isArray(transactions) ? transactions : []',
  'transactionRolePlayers: flattenTransactionRolePlayers(transactionRows)',
]) {
  assert.ok(agentPerformanceDataSource.includes(token), `agent performance source should preserve ${token}`)
}

for (const token of [
  'function getRolePlayersForAgentDeals',
  'const transactionIds = new Set',
  'transactionIds.has(getRolePlayerTransactionId(row))',
  'rolePlayers: getRolePlayersForAgentDeals(transactions, rolePlayers)',
  'function computeAgentWorkspaceData({ transactions, transactionRolePlayers = []',
  'partnerBusinessDistribution: buildAgentPartnerBusinessDistribution({ deals: agent.deals }, transactionRolePlayers)',
  'transactionRolePlayers: performanceSources.transactionRolePlayers',
  'transactionRolePlayers: Array.isArray(performanceSources.transactionRolePlayers) ? performanceSources.transactionRolePlayers : []',
]) {
  assert.ok(agentsSource.includes(token), `agent module should preserve phase 5 role-player scoping with ${token}`)
}

for (const token of [
  'partner_relationship_id',
  'phone_number',
  'status, assignment_status',
  'activation_trigger',
  'removed_at',
  "isMissingColumnError(query.error, 'assignment_status')",
  "isMissingColumnError(query.error, 'removed_at')",
]) {
  assert.ok(apiSource.includes(token), `transaction summary role-player query should preserve ${token}`)
}

assert.ok(
  !agentPerformanceDataSource.includes('transactionRolePlayers: []'),
  'agent performance data source should no longer return an always-empty transactionRolePlayers array',
)

console.log('partner business distribution phase 5 agent role-player enrichment checks passed')
