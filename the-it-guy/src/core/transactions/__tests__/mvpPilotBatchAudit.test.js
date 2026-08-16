import assert from 'node:assert/strict'
import { auditMvpPilotBatch } from '../mvpPilotBatchAudit.js'
const transaction = {
  transactionId: 'tx-1',
  acceptedOfferId: 'offer-1',
  idempotencyKey: 'key-1',
  participantBootstrapComplete: true,
  documentBootstrapComplete: true,
  workflowBootstrapComplete: true,
  conversionConfirmed: true,
  healthAudited: true,
  notificationDeliveryReviewed: true,
}
assert.equal(auditMvpPilotBatch([transaction]).passed, true)
assert.equal(auditMvpPilotBatch([transaction]).creationLineage[0].mode, 'accepted_offer')
assert.ok(auditMvpPilotBatch([transaction, { ...transaction, transactionId: 'tx-2' }]).issues.some((item) => item.startsWith('duplicate_idempotency_key:')))
console.log('mvp pilot batch audit tests passed')
