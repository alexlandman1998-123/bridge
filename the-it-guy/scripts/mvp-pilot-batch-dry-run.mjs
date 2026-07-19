import assert from 'node:assert/strict'
import { runMvpTransactionScenario } from '../src/core/transactions/mvpScenarioSimulation.js'
import { auditMvpPilotBatch } from '../src/core/transactions/mvpPilotBatchAudit.js'

const templates = [
  ['resale', 'cash', 'individual', 'individual'],
  ['private_sale', 'bond', 'company', 'trust'],
  ['resale', 'hybrid', 'trust', 'company'],
  ['development_sale', 'cash', 'company', 'developer'],
]
const transactions = Array.from({ length: 10 }, (_, index) => {
  const [transactionType, financeType, buyerEntityType, sellerEntityType] = templates[index % templates.length]
  const result = runMvpTransactionScenario({ id: `pilot-batch-${index + 1}`, transactionType, financeType, buyerEntityType, sellerEntityType, propertyTenure: 'sectional_title' })
  return {
    transactionId: result.truth.transactionId,
    idempotencyKey: result.command.idempotencyKey,
    participantBootstrapComplete: result.participants.participants.length >= 2,
    documentBootstrapComplete: result.documents.requirements.length >= 4,
    workflowBootstrapComplete: result.workflow.lanes.length >= 3,
  }
})
const report = auditMvpPilotBatch(transactions)
assert.equal(report.passed, true)
console.log(JSON.stringify({ version: 'arch9_mvp_pilot_batch_dry_run_v1', passed: true, report }, null, 2))
