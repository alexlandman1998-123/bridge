import assert from 'node:assert/strict'
import { buildBondFallbackQueueCandidate } from '../bondFallbackQueue.js'

const cash = buildBondFallbackQueueCandidate({
  transaction: {
    id: 'tx-cash',
    finance_type: 'cash',
    finance_managed_by: 'client',
  },
})

assert.equal(cash.required, false)
assert.equal(cash.status, 'not_bond_finance')
assert.equal(cash.event, null)

const missingOriginator = buildBondFallbackQueueCandidate({
  transaction: {
    id: 'tx-bond-missing',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
  onboarding: {
    id: 'onboarding-bond-missing',
  },
  completionHook: {
    onboardingStatus: 'awaiting_signed_otp',
    nextAction: 'Upload signed OTP.',
    completedAt: '2026-08-05T12:00:00.000Z',
  },
})

assert.equal(missingOriginator.required, true)
assert.equal(missingOriginator.status, 'queued')
assert.equal(missingOriginator.queueKey, 'bond_fallback')
assert.deepEqual(
  missingOriginator.reasons.map((item) => item.key),
  ['no_bond_originator_assignment', 'awaiting_signed_otp'],
)
assert.equal(missingOriginator.event.type, 'bond_fallback_queue_candidate')
assert.equal(missingOriginator.event.data.reasonKeys.includes('no_bond_originator_assignment'), true)

const buyerRequested = buildBondFallbackQueueCandidate({
  transaction: {
    id: 'tx-buyer-requested',
    finance_type: 'hybrid',
    finance_managed_by: 'bond_originator',
  },
  buyerBondOriginatorRequest: {
    status: 'requested',
  },
})

assert.equal(buyerRequested.required, true)
assert.equal(buyerRequested.priority, 'high')
assert.equal(buyerRequested.reasons.some((item) => item.key === 'buyer_requested_originator_pending'), true)

const assigned = buildBondFallbackQueueCandidate({
  transaction: {
    id: 'tx-assigned',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
    assigned_bond_originator_email: 'originator@example.test',
    bond_workspace_id: 'workspace-1',
  },
})

assert.equal(assigned.required, false)
assert.equal(assigned.status, 'covered')
assert.equal(assigned.assigned, true)

const selectedRoleplayer = buildBondFallbackQueueCandidate({
  transaction: {
    id: 'tx-roleplayer',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
  rolePlayers: [
    {
      role_type: 'bond_originator',
      status: 'selected',
    },
  ],
})

assert.equal(selectedRoleplayer.required, false)
assert.equal(selectedRoleplayer.status, 'covered')

console.log('bond fallback queue tests passed')
