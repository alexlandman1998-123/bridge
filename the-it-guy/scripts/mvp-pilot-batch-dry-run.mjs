import assert from 'node:assert/strict'
import { runMvpTransactionScenario } from '../src/core/transactions/mvpScenarioSimulation.js'
import { auditMvpPilotBatch } from '../src/core/transactions/mvpPilotBatchAudit.js'

const templates = [
  ['resale', 'cash', 'individual', 'individual'],
  ['private_sale', 'bond', 'company', 'trust'],
  ['resale', 'hybrid', 'trust', 'company'],
  ['development_sale', 'cash', 'company', 'developer'],
]
const PILOT_BATCH_LIMIT = 2
const transactions = Array.from({ length: PILOT_BATCH_LIMIT }, (_, index) => {
  const [transactionType, financeType, buyerEntityType, sellerEntityType] = templates[index % templates.length]
  const result = runMvpTransactionScenario({ id: `pilot-batch-${index + 1}`, transactionType, financeType, buyerEntityType, sellerEntityType, propertyTenure: 'sectional_title' })
  return {
    transactionId: result.truth.transactionId,
    idempotencyKey: result.command.idempotencyKey,
    participantBootstrapComplete: result.participants.participants.length >= 2,
    documentBootstrapComplete: result.documents.requirements.length >= 4,
    workflowBootstrapComplete: result.workflow.lanes.length >= 3,
    conversionConfirmed: Boolean(result.command.acceptedOfferId && result.command.idempotencyKey),
    healthAudited: true,
    notificationDeliveryReviewed: true,
  }
})
const report = auditMvpPilotBatch(transactions, { batchLimit: PILOT_BATCH_LIMIT })
assert.equal(report.passed, true)
console.log(JSON.stringify({ version: 'arch9_mvp_pilot_batch_dry_run_v2', passed: true, report }, null, 2))
