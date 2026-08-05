import assert from 'node:assert/strict'
import { buildAttorneyHandoffRepairQueueCandidate } from '../attorneyHandoffRepairQueue.js'

const missingTransfer = buildAttorneyHandoffRepairQueueCandidate({
  transaction: {
    id: 'tx-missing-transfer',
    onboarding_status: 'awaiting_signed_otp',
  },
  onboarding: {
    id: 'onboarding-missing-transfer',
  },
  completionHook: {
    onboardingStatus: 'awaiting_signed_otp',
    nextAction: 'Upload signed OTP.',
  },
})

assert.equal(missingTransfer.required, true)
assert.equal(missingTransfer.status, 'queued')
assert.equal(missingTransfer.queueKey, 'attorney_handoff_repair')
assert.equal(missingTransfer.priority, 'high')
assert.equal(missingTransfer.reasons.some((item) => item.key === 'transfer_attorney_missing'), true)
assert.equal(missingTransfer.event.type, 'attorney_handoff_repair_queue_candidate')

const coveredTransfer = buildAttorneyHandoffRepairQueueCandidate({
  transaction: {
    id: 'tx-covered-transfer',
    assigned_attorney_email: 'transfer@example.test',
    onboarding_status: 'awaiting_signed_otp',
  },
  completionHook: {
    onboardingStatus: 'awaiting_signed_otp',
  },
})

assert.equal(coveredTransfer.required, false)
assert.equal(coveredTransfer.status, 'monitor')
assert.deepEqual(coveredTransfer.coveredRoles, ['transfer_attorney'])
assert.equal(coveredTransfer.reasons.map((item) => item.key).includes('awaiting_signed_otp'), true)
assert.equal(coveredTransfer.event, null)

const cancellationMissing = buildAttorneyHandoffRepairQueueCandidate({
  transaction: {
    id: 'tx-cancellation-missing',
    assigned_attorney_email: 'transfer@example.test',
    seller_has_existing_bond: true,
    onboarding_status: 'signed_otp_received',
  },
})

assert.equal(cancellationMissing.required, true)
assert.deepEqual(cancellationMissing.requiredRoles, ['transfer_attorney', 'cancellation_attorney'])
assert.equal(cancellationMissing.reasons.some((item) => item.key === 'cancellation_attorney_missing'), true)

const selectedTransferRoleplayer = buildAttorneyHandoffRepairQueueCandidate({
  transaction: {
    id: 'tx-roleplayer-transfer',
    onboarding_status: 'signed_otp_received',
  },
  rolePlayers: [
    {
      roleType: 'transfer_attorney',
      assignmentStatus: 'selected',
      partnerName: 'Selected Transfer Attorneys',
      emailAddress: 'transfer@example.test',
    },
  ],
})

assert.equal(selectedTransferRoleplayer.required, false)
assert.equal(selectedTransferRoleplayer.status, 'covered')

const declinedTransfer = buildAttorneyHandoffRepairQueueCandidate({
  transaction: {
    id: 'tx-declined-transfer',
    onboarding_status: 'signed_otp_received',
  },
  rolePlayers: [
    {
      role_type: 'transfer_attorney',
      assignment_status: 'declined',
      partner_name: 'Declined Transfer Attorneys',
      email_address: 'declined@example.test',
    },
  ],
})

assert.equal(declinedTransfer.required, true)
assert.equal(declinedTransfer.reasons.some((item) => item.key === 'transfer_attorney_declined_or_removed'), true)

console.log('attorney handoff repair queue tests passed')
