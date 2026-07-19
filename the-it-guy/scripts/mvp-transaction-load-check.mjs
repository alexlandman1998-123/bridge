import assert from 'node:assert/strict'
import { runMvpTransactionScenario } from '../src/core/transactions/mvpScenarioSimulation.js'
import { auditMvpTransactionIntegrity } from '../src/core/transactions/mvpTransactionIntegrityAudit.js'

const templates = [
  ['resale', 'cash', 'individual', 'individual', 'freehold'],
  ['private_sale', 'bond', 'company', 'trust', 'sectional_title'],
  ['resale', 'hybrid', 'trust', 'company', 'estate_hoa'],
  ['development_sale', 'cash', 'company', 'developer', 'sectional_title'],
]

const startedAt = Date.now()
const idempotencyKeys = new Set()
const summaries = { cash: 0, bond: 0, hybrid: 0, individual: 0, company: 0, trust: 0, development_sale: 0 }

for (let index = 1; index <= 100; index += 1) {
  const [transactionType, financeType, buyerEntityType, sellerEntityType, propertyTenure] = templates[(index - 1) % templates.length]
  const result = runMvpTransactionScenario({
    id: `load-${index}`,
    transactionType,
    financeType,
    buyerEntityType,
    sellerEntityType,
    propertyTenure,
    organisationId: 'mvp-load-org',
    listingId: `mvp-load-listing-${index}`,
    leadId: `mvp-load-lead-${index}`,
    acceptedOfferId: `mvp-load-offer-${index}`,
  })
  assert.equal(result.command.launchScope.supported, true, `transaction ${index}`)
  assert.equal(idempotencyKeys.has(result.command.idempotencyKey), false, `duplicate key ${index}`)
  assert.ok(result.participants.participants.length >= 2, `participants ${index}`)
  assert.ok(result.documents.requirements.length >= 4, `documents ${index}`)
  assert.ok(result.workflow.lanes.length >= 3, `workflow ${index}`)
  assert.deepEqual(auditMvpTransactionIntegrity(result).issues, [], `integrity ${index}`)
  idempotencyKeys.add(result.command.idempotencyKey)
  summaries[financeType] += 1
  summaries[buyerEntityType] += 1
  if (transactionType === 'development_sale') summaries.development_sale += 1
}

console.log(JSON.stringify({
  version: 'arch9_mvp_100_transaction_capacity_check_v1',
  passed: true,
  transactionCount: 100,
  uniqueIdempotencyKeys: idempotencyKeys.size,
  durationMs: Date.now() - startedAt,
  coverage: summaries,
}, null, 2))
