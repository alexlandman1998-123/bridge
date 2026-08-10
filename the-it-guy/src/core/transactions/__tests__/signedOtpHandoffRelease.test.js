import assert from 'node:assert/strict'
import {
  SIGNED_OTP_HANDOFF_RELEASE_VERSION,
  buildSignedOtpHandoffReleaseDecision,
} from '../signedOtpHandoffRelease.js'

const originatorReleased = buildSignedOtpHandoffReleaseDecision({
  transaction: {
    id: 'tx-bond-released',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
  financeType: 'bond',
  financeManagedBy: 'bond_originator',
  originatorManagedFinance: true,
  bondOriginatorActivation: {
    activated: true,
    roleplayer: {
      roleType: 'bond_originator',
    },
  },
  attorneyActivation: [
    { roleType: 'transfer_attorney' },
    { roleType: 'bond_attorney' },
  ],
  mandateAllocationPromotion: {
    updatedCount: 1,
  },
  stageResult: {
    advanced: true,
  },
  nextAction: 'Finance workflow triggered from signed OTP. Begin finance processing.',
  releasedAt: '2026-08-05T12:00:00.000Z',
})

assert.equal(originatorReleased.version, SIGNED_OTP_HANDOFF_RELEASE_VERSION)
assert.equal(originatorReleased.status, 'finance_and_transfer_handoff_released')
assert.equal(originatorReleased.workflow, 'finance')
assert.deepEqual(originatorReleased.releasedLanes, ['transfer_attorney', 'bond_attorney', 'bond_originator'])
assert.deepEqual(originatorReleased.gatedLanes, [])
assert.equal(originatorReleased.notification.title, 'Finance handoff ready')
assert.deepEqual(originatorReleased.notification.roleTypes, ['bond_originator', 'developer', 'agent', 'attorney'])
assert.equal(originatorReleased.notification.notificationType, 'lane_handoff')
assert.equal(originatorReleased.event.type, 'signed_otp_handoff_release_decision')
assert.equal(originatorReleased.event.data.mandateAllocationPromoted, true)
assert.equal(originatorReleased.event.data.stageAdvanced, true)

const originatorBlocked = buildSignedOtpHandoffReleaseDecision({
  transaction: {
    id: 'tx-bond-blocked',
    finance_type: 'hybrid',
    finance_managed_by: 'bond_originator',
  },
  bondOriginatorActivation: {
    activated: false,
    reason: 'no_selected_bond_originator',
  },
  nextAction: 'Finance workflow triggered from signed OTP. Begin finance processing.',
})

assert.equal(originatorBlocked.status, 'finance_handoff_blocked_originator_missing')
assert.deepEqual(originatorBlocked.gatedLanes, ['bond_originator'])
assert.deepEqual(originatorBlocked.notification.roleTypes, ['agent', 'developer', 'attorney'])
assert.equal(originatorBlocked.notification.title, 'Finance handoff blocked')
assert.equal(originatorBlocked.notification.notificationType, 'readiness_updated')

const buyerManagedBond = buildSignedOtpHandoffReleaseDecision({
  transaction: {
    id: 'tx-buyer-managed-bond',
    finance_type: 'bond',
    finance_managed_by: 'client',
  },
  financeManagedBy: 'client',
})

assert.equal(buyerManagedBond.status, 'transfer_handoff_released_buyer_managed_finance')
assert.equal(buyerManagedBond.workflow, 'attorney')
assert.deepEqual(buyerManagedBond.releasedLanes, ['transfer_attorney'])
assert.deepEqual(buyerManagedBond.notification.roleTypes, ['attorney', 'developer', 'agent'])

const cashTransfer = buildSignedOtpHandoffReleaseDecision({
  transaction: {
    id: 'tx-cash-transfer',
    finance_type: 'cash',
  },
})

assert.equal(cashTransfer.status, 'transfer_handoff_released')
assert.equal(cashTransfer.workflow, 'attorney')
assert.deepEqual(cashTransfer.gatedLanes, [])

console.log('signed OTP handoff release tests passed')
