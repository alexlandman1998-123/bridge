import assert from 'node:assert/strict'
import { buildMvpTransactionAuditRecovery } from '../src/core/transactions/mvpTransactionAuditRecovery.js'

const audit = buildMvpTransactionAuditRecovery({
  transaction: { id: 'tx-audit-1' },
  health: {
    currentGate: { key: 'finance', label: 'Finance readiness', satisfied: false, blockerCount: 1 },
    testData: { isTestData: true },
  },
  participantRoster: { summary: { unassigned: 1 } },
  documentRoster: { summary: { outstanding: 2 } },
  warnings: ['transaction_required_documents unavailable'],
  notificationOutbox: [{ id: 'event-1', status: 'failed', channel: 'email', metadata: {} }],
})

assert.equal(audit.status, 'action_required')
assert.equal(audit.summary.blocking, 2)
assert.equal(audit.actions.some((item) => item.actionKey === 'prepare_notification_retry'), false, 'test transactions must not expose external notification retries')
assert.equal(audit.issues.some((item) => item.key === 'test_data_protected'), true)

const productionAudit = buildMvpTransactionAuditRecovery({
  transaction: { id: 'tx-audit-2' },
  health: { currentGate: { key: 'otp', label: 'OTP execution', satisfied: true, blockerCount: 0 }, testData: { isTestData: false } },
  notificationOutbox: [{ id: 'event-2', status: 'failed', channel: 'email', metadata: {} }],
})
assert.equal(productionAudit.actions.some((item) => item.actionKey === 'prepare_notification_retry'), true)

const suppressedEventAudit = buildMvpTransactionAuditRecovery({
  transaction: { id: 'tx-audit-3' },
  health: { testData: { isTestData: false } },
  notificationOutbox: [{ id: 'event-3', status: 'failed', channel: 'email', metadata: { notificationSuppressed: true } }],
})
assert.equal(suppressedEventAudit.actions.some((item) => item.actionKey === 'prepare_notification_retry'), false)

const preparedNotificationAudit = buildMvpTransactionAuditRecovery({
  transaction: { id: 'tx-audit-4', accepted_offer_id: 'offer-audit-4', creation_idempotency_key: 'key-audit-4' },
  health: {
    creation: { acceptedOfferId: 'offer-audit-4', idempotencyKey: 'key-audit-4', confirmed: true },
    testData: { isTestData: false },
  },
  notificationOutbox: [{ id: 'event-4', status: 'prepared', handoffRequired: true }],
})
assert.equal(preparedNotificationAudit.status, 'review_required')
assert.equal(preparedNotificationAudit.actions.some((item) => item.key === 'review_notification_delivery'), true)

const unconfirmedCreationAudit = buildMvpTransactionAuditRecovery({
  transaction: { id: 'tx-audit-5', accepted_offer_id: 'offer-audit-5' },
  health: { creation: { acceptedOfferId: 'offer-audit-5', confirmed: false } },
})
assert.equal(unconfirmedCreationAudit.status, 'action_required')
assert.equal(unconfirmedCreationAudit.issues.some((item) => item.key === 'creation:unconfirmed'), true)

console.log('mvp-transaction-audit-recovery: passed')
