import assert from 'node:assert/strict'
import {
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES,
  ATTORNEY_INCOMING_WAITING_ON,
  buildAttorneyIncomingMatterContract,
  normalizeAttorneyIncomingInstructionStatus,
  shouldShowInAttorneyIncomingQueue,
} from '../attorneyIncomingMatterContract.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const transferAssignment = {
  assignment_type: 'transfer',
  attorney_role: 'transfer_attorney',
  assignment_status: 'active',
  status: 'active',
}

test('status aliases normalize to canonical incoming instruction states', () => {
  assert.equal(
    normalizeAttorneyIncomingInstructionStatus('buyer onboarding completed'),
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
  )
  assert.equal(
    normalizeAttorneyIncomingInstructionStatus('ready-for-instruction'),
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
  )
})

test('pre-submit transfer assignments are not in the default incoming queue', () => {
  const contract = buildAttorneyIncomingMatterContract({
    assignment: {
      ...transferAssignment,
      instruction_status: 'new_instruction',
    },
    transaction: {
      onboarding_status: 'awaiting_client_onboarding',
    },
  })

  assert.equal(contract.status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding)
  assert.equal(contract.visibleInIncomingQueue, false)
  assert.equal(contract.visibleInPreIncoming, true)
  assert.deepEqual(contract.waitingOn, [ATTORNEY_INCOMING_WAITING_ON.buyerOnboarding])
})

test('buyer onboarding submission enters incoming as awaiting signed OTP', () => {
  const contract = buildAttorneyIncomingMatterContract({
    assignment: {
      ...transferAssignment,
      instruction_status: 'new_instruction',
    },
    transaction: {
      onboarding_status: 'awaiting_signed_otp',
      onboarding_completed_at: '2026-07-09T08:00:00.000Z',
    },
  })

  assert.equal(contract.status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp)
  assert.equal(contract.visibleInIncomingQueue, true)
  assert.deepEqual(contract.waitingOn, [ATTORNEY_INCOMING_WAITING_ON.signedOtp])
})

test('awaiting signed OTP can also surface document blockers', () => {
  const contract = buildAttorneyIncomingMatterContract({
    assignment: transferAssignment,
    transaction: {
      onboarding_status: 'awaiting_signed_otp',
      external_onboarding_submitted_at: '2026-07-09T08:00:00.000Z',
    },
    documentRequests: [
      { id: 'req-fica', title: 'FICA', status: 'requested' },
    ],
  })

  assert.equal(contract.status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp)
  assert.equal(contract.visibleInIncomingQueue, true)
  assert.deepEqual(contract.waitingOn, [
    ATTORNEY_INCOMING_WAITING_ON.signedOtp,
    ATTORNEY_INCOMING_WAITING_ON.documents,
  ])
})

test('signed OTP with no open documents is ready for attorney acceptance', () => {
  const contract = buildAttorneyIncomingMatterContract({
    assignment: transferAssignment,
    transaction: {
      onboarding_status: 'signed_otp_received',
      current_main_stage: 'ATTY',
    },
  })

  assert.equal(contract.status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance)
  assert.equal(contract.visibleInIncomingQueue, true)
  assert.deepEqual(contract.waitingOn, [ATTORNEY_INCOMING_WAITING_ON.attorneyAcceptance])
})

test('signed OTP with open documents waits on documents before acceptance', () => {
  const contract = buildAttorneyIncomingMatterContract({
    assignment: transferAssignment,
    transaction: {
      onboarding_status: 'signed_otp_received',
    },
    documentRequests: [
      { id: 'req-proof', title: 'Proof of address', status: 'rejected' },
    ],
  })

  assert.equal(contract.status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments)
  assert.equal(contract.visibleInIncomingQueue, true)
  assert.deepEqual(contract.waitingOn, [ATTORNEY_INCOMING_WAITING_ON.documents])
})

test('accepted instructions leave incoming and become active matters', () => {
  const contract = buildAttorneyIncomingMatterContract({
    assignment: {
      ...transferAssignment,
      instruction_status: 'accepted',
    },
    transaction: {
      onboarding_status: 'awaiting_signed_otp',
    },
  })

  assert.equal(contract.status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted)
  assert.equal(contract.visibleInIncomingQueue, false)
  assert.equal(contract.visibleInActiveMatters, true)
  assert.equal(contract.leavesIncomingQueue, true)
})

test('bond and cancellation instructions enter the incoming queue without transfer OTP gating', () => {
  assert.equal(
    shouldShowInAttorneyIncomingQueue({
      assignment: {
        assignment_type: 'bond',
        attorney_role: 'bond_attorney',
        assignment_status: 'active',
      },
      transaction: {
        onboarding_status: 'awaiting_signed_otp',
      },
    }),
    true,
  )

  const cancellationContract = buildAttorneyIncomingMatterContract({
    assignment: {
      assignment_type: 'cancellation',
      attorney_role: 'cancellation_attorney',
      instruction_status: 'new_instruction',
      assignment_status: 'pending',
    },
    transaction: {
      onboarding_status: 'awaiting_client_onboarding',
    },
  })

  assert.equal(cancellationContract.status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance)
  assert.equal(cancellationContract.visibleInIncomingQueue, true)
  assert.deepEqual(cancellationContract.waitingOn, [ATTORNEY_INCOMING_WAITING_ON.attorneyAcceptance])
})

test('transfer instructions remain gated by buyer onboarding and signed OTP', () => {
  assert.equal(
    shouldShowInAttorneyIncomingQueue({
      assignment: {
        ...transferAssignment,
        instruction_status: 'new_instruction',
      },
      transaction: {
        onboarding_status: 'awaiting_client_onboarding',
      },
    }),
    false,
  )
})

console.log('attorneyIncomingMatterContract tests passed')
