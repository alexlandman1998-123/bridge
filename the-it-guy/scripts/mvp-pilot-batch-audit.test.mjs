import assert from 'node:assert/strict'
import { auditMvpPilotBatch } from '../src/core/transactions/mvpPilotBatchAudit.js'

const baseTransaction = {
  transactionId: 'tx-pilot-audit-1',
  idempotencyKey: 'pilot-audit-key-1',
  participantBootstrapComplete: true,
  documentBootstrapComplete: true,
  workflowBootstrapComplete: true,
  conversionConfirmed: true,
  healthAudited: true,
  notificationDeliveryReviewed: true,
}

assert.equal(auditMvpPilotBatch([baseTransaction]).passed, true)

const missingReview = auditMvpPilotBatch([{ ...baseTransaction, notificationDeliveryReviewed: false }])
assert.equal(missingReview.passed, false)
assert.equal(missingReview.issues.includes('notification_delivery_not_reviewed:tx-pilot-audit-1'), true)

const missingConversion = auditMvpPilotBatch([{ ...baseTransaction, conversionConfirmed: false }])
assert.equal(missingConversion.issues.includes('accepted_offer_conversion_unconfirmed:tx-pilot-audit-1'), true)

console.log('mvp-pilot-batch-audit: passed')
