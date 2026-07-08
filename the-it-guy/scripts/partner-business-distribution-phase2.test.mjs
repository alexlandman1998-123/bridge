import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const principalDashboardSource = read('src/services/principalDashboardService.js')

for (const token of [
  "import { buildPartnerBusinessDistribution } from './partnerBusinessDistributionService'",
  'cash_amount',
  'bond_amount',
  'attorney, assigned_attorney_email',
  'bond_originator, assigned_bond_originator_email',
  "safeSelectByIds('transaction_role_players'",
  'partner_relationship_id',
  'snapshot_json',
  'getPartnerBusinessDistributionDate',
  'const partnerDistributionTransactions = transactions.filter',
  'const partnerBusinessDistribution = buildPartnerBusinessDistribution',
  'rolePlayers: transactionRolePlayers',
  'partnerBusinessDistribution,',
]) {
  assert.ok(principalDashboardSource.includes(token), `principal dashboard phase 2 should preserve ${token}`)
}

assert.ok(
  principalDashboardSource.includes('const partnerBusinessDistribution = buildPartnerBusinessDistribution()'),
  'empty principal dashboard payload should preserve the partner distribution shape',
)

console.log('partner business distribution phase 2 principal dashboard checks passed')
