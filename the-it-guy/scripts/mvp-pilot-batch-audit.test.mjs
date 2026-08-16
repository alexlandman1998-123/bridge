import assert from 'node:assert/strict'
import { auditMvpPilotBatch } from '../src/core/transactions/mvpPilotBatchAudit.js'

const baseTransaction = {
  transactionId: 'tx-pilot-audit-1',
  acceptedOfferId: 'offer-pilot-audit-1',
  idempotencyKey: 'pilot-audit-key-1',
  participantBootstrapComplete: true,
  documentBootstrapComplete: true,
  workflowBootstrapComplete: true,
  conversionConfirmed: true,
  healthAudited: true,
  notificationDeliveryReviewed: true,
}

assert.equal(auditMvpPilotBatch([baseTransaction]).passed, true)
assert.equal(auditMvpPilotBatch([baseTransaction]).creationLineage[0].mode, 'accepted_offer')

const missingReview = auditMvpPilotBatch([{ ...baseTransaction, notificationDeliveryReviewed: false }])
assert.equal(missingReview.passed, false)
assert.equal(missingReview.issues.includes('notification_delivery_not_reviewed:tx-pilot-audit-1'), true)

const missingConversion = auditMvpPilotBatch([{ ...baseTransaction, conversionConfirmed: false }])
assert.equal(missingConversion.issues.includes('accepted_offer_conversion_unconfirmed:tx-pilot-audit-1'), true)

const missingLineage = auditMvpPilotBatch([{ ...baseTransaction, acceptedOfferId: '' }])
assert.equal(missingLineage.issues.includes('accepted_offer_id_missing:tx-pilot-audit-1'), true)
assert.equal(missingLineage.issues.includes('accepted_offer_lineage_required:tx-pilot-audit-1'), true)

const forgedLineage = auditMvpPilotBatch([{
  ...baseTransaction,
  acceptedOfferId: '',
  creationLineage: { mode: 'accepted_offer', confirmed: true, auditVisible: true },
}])
assert.equal(forgedLineage.issues.includes('accepted_offer_id_missing:tx-pilot-audit-1'), true)
assert.equal(forgedLineage.issues.includes('accepted_offer_lineage_required:tx-pilot-audit-1'), true)

const overrideLineage = auditMvpPilotBatch([{
  ...baseTransaction,
  acceptedOfferId: '',
  transactionCreationOverride: {
    reason: 'Principal approved a manual override outside normal offer conversion.',
    actorId: 'principal-1',
    actorRole: 'principal',
    authorised: true,
  },
}])
assert.equal(overrideLineage.issues.includes('manual_override_not_allowed_in_pilot:tx-pilot-audit-1'), true)

console.log('mvp-pilot-batch-audit: passed')
