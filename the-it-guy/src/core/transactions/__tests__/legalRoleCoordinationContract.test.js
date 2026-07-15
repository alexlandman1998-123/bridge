import assert from 'node:assert/strict'
import {
  LEGAL_ROLE_COORDINATION_ACTORS,
  LEGAL_ROLE_COORDINATION_DIMENSIONS,
  LEGAL_ROLE_COORDINATION_STATES,
  LEGAL_ROLE_TYPES,
  canTransitionLegalRoleCoordinationState,
  evaluateLegalRoleInviteAuthority,
  evaluateLegalRoleStaffAssignmentAuthority,
  getInitialLegalRoleCoordinationState,
  getLegalRoleAuthorityPolicy,
  getLegalRoleCoordinationStateDimension,
  isLegalRoleAppointmentAuthority,
  isLegalRoleFormalInstructor,
} from '../legalRoleCoordinationContract.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const S = LEGAL_ROLE_COORDINATION_STATES
const A = LEGAL_ROLE_COORDINATION_ACTORS
const R = LEGAL_ROLE_TYPES

test('appointment authority is separate for seller and bank-appointed roles', () => {
  assert.equal(isLegalRoleAppointmentAuthority(R.transferAttorney, A.seller), true)
  assert.equal(isLegalRoleAppointmentAuthority(R.transferAttorney, A.agent), false)
  assert.equal(isLegalRoleAppointmentAuthority(R.cancellationAttorney, A.existingBank), true)
  assert.equal(isLegalRoleAppointmentAuthority(R.cancellationAttorney, A.seller), false)
  assert.equal(isLegalRoleAppointmentAuthority(R.bondAttorney, A.newLendingBank), true)
  assert.equal(isLegalRoleAppointmentAuthority(R.bondAttorney, A.bondOriginator), false)
})

test('formal instruction authority follows the appointing party', () => {
  assert.equal(isLegalRoleFormalInstructor(R.transferAttorney, A.seller), true)
  assert.equal(isLegalRoleFormalInstructor(R.cancellationAttorney, A.existingBank), true)
  assert.equal(isLegalRoleFormalInstructor(R.bondAttorney, A.newLendingBank), true)
  assert.equal(isLegalRoleFormalInstructor(R.bondAttorney, A.transferAttorney), false)
})

test('bank-appointed roles begin by waiting for a bank appointment once triggered', () => {
  assert.equal(getInitialLegalRoleCoordinationState(R.transferAttorney), S.awaitingTrigger)
  assert.equal(getInitialLegalRoleCoordinationState(R.transferAttorney, { triggerSatisfied: true }), S.awaitingAppointment)
  assert.equal(getInitialLegalRoleCoordinationState(R.bondAttorney, { triggerSatisfied: true }), S.awaitingBankAppointment)
  assert.equal(getInitialLegalRoleCoordinationState(R.cancellationAttorney, { required: false }), S.notRequired)
})

test('state dimensions prevent invitation acceptance from implying legal instruction', () => {
  assert.equal(getLegalRoleCoordinationStateDimension(S.appointmentCaptured), LEGAL_ROLE_COORDINATION_DIMENSIONS.appointment)
  assert.equal(getLegalRoleCoordinationStateDimension(S.inviteAccepted), LEGAL_ROLE_COORDINATION_DIMENSIONS.platformInvitation)
  assert.equal(getLegalRoleCoordinationStateDimension(S.instructionConfirmed), LEGAL_ROLE_COORDINATION_DIMENSIONS.legalInstruction)
  assert.equal(getLegalRoleCoordinationStateDimension(S.active), LEGAL_ROLE_COORDINATION_DIMENSIONS.matter)
})

test('role transition matrices distinguish seller nomination from bank appointment', () => {
  assert.equal(canTransitionLegalRoleCoordinationState(R.transferAttorney, S.awaitingTrigger, S.awaitingAppointment), true)
  assert.equal(canTransitionLegalRoleCoordinationState(R.transferAttorney, S.awaitingTrigger, S.awaitingBankAppointment), false)
  assert.equal(canTransitionLegalRoleCoordinationState(R.bondAttorney, S.awaitingTrigger, S.awaitingBankAppointment), true)
  assert.equal(canTransitionLegalRoleCoordinationState(R.bondAttorney, S.awaitingBankAppointment, S.appointmentCaptured), true)
  assert.equal(canTransitionLegalRoleCoordinationState(R.bondAttorney, S.inviteAccepted, S.active), false)
  assert.equal(canTransitionLegalRoleCoordinationState(R.bondAttorney, S.inviteAccepted, S.instructionConfirmed), true)
})

test('accepted primary transfer attorney can invite a confirmed bank-appointed firm', () => {
  assert.deepEqual(
    evaluateLegalRoleInviteAuthority({
      targetRole: R.cancellationAttorney,
      actorRole: A.transferAttorney,
      appointmentEvidenceConfirmed: true,
      transferInstructionAccepted: true,
      isPrimaryTransferAttorney: true,
    }),
    { allowed: true, reason: 'primary_inviter' },
  )
})

test('transfer attorney cannot invite before accepting the transfer instruction', () => {
  assert.equal(
    evaluateLegalRoleInviteAuthority({
      targetRole: R.bondAttorney,
      actorRole: A.transferAttorney,
      appointmentEvidenceConfirmed: true,
      transferInstructionAccepted: false,
      isPrimaryTransferAttorney: true,
    }).reason,
    'transfer_instruction_acceptance_required',
  )
})

test('fallback inviters are role-scoped and require appointment evidence', () => {
  assert.deepEqual(
    evaluateLegalRoleInviteAuthority({
      targetRole: R.bondAttorney,
      actorRole: A.bondOriginator,
      appointmentEvidenceConfirmed: true,
    }),
    { allowed: true, reason: 'fallback_inviter' },
  )
  assert.equal(
    evaluateLegalRoleInviteAuthority({
      targetRole: R.cancellationAttorney,
      actorRole: A.bondOriginator,
      appointmentEvidenceConfirmed: true,
    }).reason,
    'actor_not_authorized',
  )
  assert.equal(
    evaluateLegalRoleInviteAuthority({
      targetRole: R.cancellationAttorney,
      actorRole: A.agent,
      appointmentEvidenceConfirmed: false,
    }).reason,
    'appointment_evidence_required',
  )
})

test('authority policies expose immutable role rules for downstream phases', () => {
  const cancellationPolicy = getLegalRoleAuthorityPolicy(R.cancellationAttorney)
  assert.equal(cancellationPolicy.appointmentKind, 'bank_appointment')
  assert.deepEqual(cancellationPolicy.appointmentAuthorities, [A.existingBank])
  assert.equal(Object.isFrozen(cancellationPolicy), true)
  assert.equal(Object.isFrozen(cancellationPolicy.fallbackInviters), true)
})

test('the appointed firm controls its own individual staff assignment', () => {
  assert.deepEqual(
    evaluateLegalRoleStaffAssignmentAuthority({
      actorRole: A.appointedFirmManager,
      firmInviteAccepted: true,
      actorBelongsToAppointedFirm: true,
    }),
    { allowed: true, reason: 'appointed_firm_manager' },
  )
  assert.equal(
    evaluateLegalRoleStaffAssignmentAuthority({
      actorRole: A.transferAttorney,
      firmInviteAccepted: true,
      actorBelongsToAppointedFirm: false,
    }).reason,
    'appointed_firm_manager_required',
  )
  assert.equal(
    evaluateLegalRoleStaffAssignmentAuthority({
      actorRole: A.appointedFirmManager,
      firmInviteAccepted: false,
      actorBelongsToAppointedFirm: true,
    }).reason,
    'firm_invite_acceptance_required',
  )
})

console.log('legalRoleCoordinationContract tests passed')
