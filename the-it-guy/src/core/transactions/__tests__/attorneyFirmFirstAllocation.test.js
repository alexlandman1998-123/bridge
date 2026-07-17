import assert from 'node:assert/strict'
import {
  ATTORNEY_ALLOCATION_STATES,
  ATTORNEY_APPOINTMENT_AUTHORITIES,
  ATTORNEY_FIRM_ACCEPTANCE_STATUSES,
  ATTORNEY_LEGAL_ROLES,
  ATTORNEY_STAFF_ASSIGNMENT_STATUSES,
  buildAttorneyFirmFirstAllocationContract,
  canTransitionAttorneyAllocation,
  evaluateAttorneyAllocationActivation,
  normalizeAttorneyLegalRole,
  resolveAttorneyAllocationState,
} from '../attorneyFirmFirstAllocation.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('normalizes legacy assignment types into canonical legal roles', () => {
  assert.equal(normalizeAttorneyLegalRole('transfer_and_bond'), ATTORNEY_LEGAL_ROLES.transfer)
  assert.equal(normalizeAttorneyLegalRole('bond'), ATTORNEY_LEGAL_ROLES.bond)
  assert.equal(normalizeAttorneyLegalRole('cancellation attorney'), ATTORNEY_LEGAL_ROLES.cancellation)
})

test('keeps firm ownership and person responsibility on the same contract', () => {
  const contract = buildAttorneyFirmFirstAllocationContract({
    attorney_role: 'transfer_attorney',
    attorney_firm_id: 'firm-1',
    attorney_user_id: 'user-1',
    assignment_status: 'active',
  })

  assert.equal(contract.appointmentAuthority, ATTORNEY_APPOINTMENT_AUTHORITIES.sellerOrAgent)
  assert.equal(contract.firmOwnsInstruction, true)
  assert.equal(contract.personOwnsOperationalWork, true)
  assert.equal(contract.state, ATTORNEY_ALLOCATION_STATES.active)
  assert.deepEqual(contract.invariantViolations, [])
})

test('maps a listing nomination to firm acceptance without treating a contact as the assignee', () => {
  const contract = buildAttorneyFirmFirstAllocationContract({
    role_type: 'transfer_attorney',
    partner_organisation_id: 'organisation-1',
    company_name: 'Example Attorneys',
    contact_person: 'Sarah Example',
  })

  assert.equal(contract.state, ATTORNEY_ALLOCATION_STATES.awaitingFirmAcceptance)
  assert.equal(contract.primaryAttorneyId, null)
  assert.equal(contract.preferredContactName, 'Sarah Example')
  assert.equal(contract.personOwnsOperationalWork, false)
})

test('supports the bank-appointed firm-first pending state', () => {
  const contract = buildAttorneyFirmFirstAllocationContract({
    attorney_role: 'bond_attorney',
    attorney_firm_id: 'firm-1',
    coordination_state: 'invite_accepted',
    staff_assignment_status: 'awaiting_staff_assignment',
    assignment_status: 'pending',
  })

  assert.equal(contract.appointmentAuthority, ATTORNEY_APPOINTMENT_AUTHORITIES.bank)
  assert.equal(contract.firmAcceptanceStatus, ATTORNEY_FIRM_ACCEPTANCE_STATUSES.accepted)
  assert.equal(contract.staffAssignmentStatus, ATTORNEY_STAFF_ASSIGNMENT_STATUSES.awaiting)
  assert.equal(contract.state, ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment)
})

test('a preferred attorney is non-binding until the firm assigns a primary attorney', () => {
  const contract = buildAttorneyFirmFirstAllocationContract({
    attorney_role: 'transfer_attorney',
    attorney_firm_id: 'firm-1',
    preferred_attorney_user_id: 'preferred-user',
    firm_acceptance_status: 'accepted',
  })

  assert.equal(contract.preferredAttorneyUserId, 'preferred-user')
  assert.equal(contract.primaryAttorneyId, null)
  assert.equal(contract.state, ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment)
})

test('activation requires firm acceptance, eligible staff, module and external instruction where applicable', () => {
  const allocation = {
    attorney_role: 'cancellation_attorney',
    attorney_firm_id: 'firm-1',
    attorney_user_id: 'user-1',
    firm_acceptance_status: 'accepted',
  }

  assert.deepEqual(
    evaluateAttorneyAllocationActivation(allocation, {
      primaryAttorneyMembershipActive: true,
      firmModuleEnabled: true,
      externalInstructionRequired: true,
      externalInstructionConfirmed: false,
    }),
    {
      canActivate: false,
      blockers: ['external_instruction_not_confirmed'],
    },
  )

  assert.equal(
    evaluateAttorneyAllocationActivation(allocation, {
      primaryAttorneyMembershipActive: true,
      firmModuleEnabled: true,
      externalInstructionRequired: true,
      externalInstructionConfirmed: true,
    }).canActivate,
    true,
  )
})

test('prevents person-only ownership and invalid lifecycle shortcuts', () => {
  const contract = buildAttorneyFirmFirstAllocationContract({
    attorney_role: 'transfer_attorney',
    attorney_user_id: 'user-1',
    assignment_status: 'pending',
  })

  assert.deepEqual(contract.invariantViolations, ['person_without_firm'])
  assert.equal(
    canTransitionAttorneyAllocation(
      ATTORNEY_ALLOCATION_STATES.awaitingFirmAcceptance,
      ATTORNEY_ALLOCATION_STATES.active,
    ),
    false,
  )
  assert.equal(
    canTransitionAttorneyAllocation(
      ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment,
      ATTORNEY_ALLOCATION_STATES.staffAssigned,
    ),
    true,
  )
})

test('replacement is a firm lifecycle while internal staff can return to awaiting assignment', () => {
  assert.equal(
    canTransitionAttorneyAllocation(ATTORNEY_ALLOCATION_STATES.active, ATTORNEY_ALLOCATION_STATES.replacementRequired),
    true,
  )
  assert.equal(
    canTransitionAttorneyAllocation(ATTORNEY_ALLOCATION_STATES.staffAssigned, ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment),
    true,
  )
  assert.equal(resolveAttorneyAllocationState({ coordination_state: 'replacement_required' }), ATTORNEY_ALLOCATION_STATES.replacementRequired)
})

console.log('attorney firm-first allocation Phase 1 contract tests passed')
