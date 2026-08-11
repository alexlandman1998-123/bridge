import assert from 'node:assert/strict'
import { buildTransactionHandoffHealth } from '../transactionHandoffHealth.js'

const acceptedNoTransaction = buildTransactionHandoffHealth({
  offer: {
    id: 'offer-1',
    status: 'accepted',
  },
})

assert.equal(acceptedNoTransaction.status, 'blocked')
assert.equal(
  acceptedNoTransaction.checks.find((check) => check.key === 'transaction_created')?.status,
  'blocked',
)
assert.match(acceptedNoTransaction.nextAction?.action || '', /Create Transaction/i)

const bondTransactionMissingHandoffs = buildTransactionHandoffHealth({
  offer: {
    id: 'offer-2',
    status: 'converted_to_transaction',
    transactionId: 'tx-2',
    financeType: 'bond',
  },
  transaction: {
    id: 'tx-2',
    finance_type: 'bond',
    onboarding_status: 'onboarding_sent',
  },
})

assert.equal(bondTransactionMissingHandoffs.status, 'attention')
assert.equal(
  bondTransactionMissingHandoffs.checks.find((check) => check.key === 'bond_originator_assigned')?.status,
  'attention',
)
assert.equal(
  bondTransactionMissingHandoffs.checks.find((check) => check.key === 'transfer_attorney_assigned')?.status,
  'attention',
)

const verificationOnlyTransaction = buildTransactionHandoffHealth({
  offer: {
    id: 'offer-verification',
    status: 'converted_to_transaction',
    transactionId: 'tx-verification',
    financeType: 'cash',
    conditions: {
      buyerVerificationSubmittedAt: '2026-08-10T20:00:00.000Z',
      buyerVerification: {
        status: 'submitted',
        formData: {
          first_name: 'Verify',
          last_name: 'Buyer',
          purchase_finance_type: 'cash',
        },
      },
      buyerOnboarding: {
        status: 'submitted',
        submittedAt: '2026-08-10T20:00:00.000Z',
      },
    },
  },
  transaction: {
    id: 'tx-verification',
    finance_type: 'cash',
  },
})

assert.equal(
  verificationOnlyTransaction.checks.find((check) => check.key === 'buyer_onboarding_sent')?.status,
  'complete',
)
assert.equal(
  verificationOnlyTransaction.checks.find((check) => check.key === 'buyer_onboarding_submitted')?.status,
  'complete',
)

const cashTransactionHealthyEnoughForHandoff = buildTransactionHandoffHealth({
  offer: {
    status: 'converted_to_transaction',
    transactionId: 'tx-3',
    financeType: 'cash',
  },
  transaction: {
    id: 'tx-3',
    finance_type: 'cash',
    onboarding_completed_at: '2026-08-01T10:00:00.000Z',
    assigned_attorney_email: 'transfer@example.test',
    legal_handoff_prepared_at: '2026-08-01T12:00:00.000Z',
  },
  onboarding: {
    id: 'onboarding-3',
    token: 'token-3',
    status: 'submitted',
  },
})

assert.equal(
  cashTransactionHealthyEnoughForHandoff.checks.find((check) => check.key === 'bond_originator_assigned')?.status,
  'not_applicable',
)
assert.equal(cashTransactionHealthyEnoughForHandoff.summary.attentionCount, 0)

console.log('transaction handoff health tests passed')
