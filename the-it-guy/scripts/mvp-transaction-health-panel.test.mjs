import assert from 'node:assert/strict'
import { buildMvpTransactionHealthPanel } from '../src/core/transactions/mvpTransactionHealthPanel.js'

const blocked = buildMvpTransactionHealthPanel({
  truth: {
    transactionId: 'tx-health-1',
    stage: { key: 'FIN', label: 'Finance', rank: 2 },
    readiness: { status: 'blocked' },
    nextAction: { label: 'Upload proof of funds.', ownerRole: 'buyer' },
    gates: [
      { key: 'onboarding', label: 'Onboarding', satisfied: true, blockers: [] },
      { key: 'otp', label: 'OTP execution', satisfied: true, blockers: [] },
      { key: 'finance', label: 'Finance readiness', satisfied: false, blockers: [{ key: 'finance:proof', reason: 'Proof of funds is required.', ownerRole: 'buyer' }] },
      { key: 'transfer', label: 'Transfer readiness', satisfied: false, blockers: [] },
    ],
    blockers: [{ key: 'finance:proof', type: 'finance', reason: 'Proof of funds is required.', ownerRole: 'buyer' }],
  },
  transaction: { testDataProtection: { isTestData: true, marker: 'TEST — DO NOT ACTION', externalDeliveryAllowed: false } },
  participantRoster: { summary: { assigned: 3, required: 4 } },
  documentRoster: { summary: { complete: 2, required: 4, outstanding: 2 } },
})

assert.equal(blocked.status.key, 'blocked')
assert.equal(blocked.currentGate.key, 'finance')
assert.equal(blocked.currentGate.satisfied, false)
assert.equal(blocked.summary.participantsAssigned, 3)
assert.equal(blocked.summary.documentsComplete, 2)
assert.equal(blocked.attention[0].ownerRole, 'buyer')
assert.equal(blocked.testData.isTestData, true)

const ready = buildMvpTransactionHealthPanel({
  truth: {
    stage: { key: 'OTP', label: 'OTP / Onboarding', rank: 1 },
    readiness: { status: 'ready' },
    gates: [{ key: 'otp', label: 'OTP execution', satisfied: true, blockers: [] }],
    blockers: [],
  },
})
assert.equal(ready.status.key, 'ready')
assert.equal(ready.summary.attentionCount, 0)

console.log('mvp-transaction-health-panel: passed')
