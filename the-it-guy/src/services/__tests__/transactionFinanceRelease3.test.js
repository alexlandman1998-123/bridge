import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const server = await createServer({ root: PROJECT_ROOT, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const financeService = await server.ssrLoadModule('/src/services/transactionFinanceService.js')
  const workspace = financeService.buildTransactionFinanceWorkspace({
    transaction: { finance_type: 'bond', finance_managed_by: 'bond_originator' },
    workflowData: {
      workflow: { currentStage: 'bank_review', status: 'active' },
      applications: [{ id: 'application-1', bankName: 'FNB', status: 'approved' }],
      quotes: [],
      decisions: [],
      bankOutcomes: [{
        id: 'outcome-1',
        bankName: 'FNB',
        outcome: 'approved',
        approvedAmount: 1250000,
        outcomeAt: '2026-07-22T08:00:00.000Z',
      }],
    },
  })

  assert.equal(workspace.bond.applications.length, 1)
  assert.equal(workspace.bond.bankOutcomes.length, 1)
  assert.equal(workspace.bond.bankOutcomes[0].outcome, 'approved')
  assert.equal(workspace.bond.bankOutcomes[0].approvedAmount, 1250000)
  console.log('transaction finance Release 3 tests passed')
} finally {
  await server.close()
}
