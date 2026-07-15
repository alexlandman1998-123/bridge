import assert from 'node:assert/strict'
import {
  buildAttorneyThreeRoleCoordinationPlan,
  getAttorneyThreeRolePlanForRole,
  summarizeAttorneyThreeRoleCoordinationPlan,
} from '../attorneyThreeRoleCoordinationPlan.js'
import {
  LEGAL_ROLE_COORDINATION_DIMENSIONS,
  LEGAL_ROLE_COORDINATION_STATES,
  LEGAL_ROLE_TYPES,
} from '../legalRoleCoordinationContract.js'

const R = LEGAL_ROLE_TYPES
const S = LEGAL_ROLE_COORDINATION_STATES

const cashPlan = buildAttorneyThreeRoleCoordinationPlan({
  transaction: { id: 'cash', finance_type: 'cash', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false },
})
assert.deepEqual(cashPlan.requiredRoleTypes, [R.transferAttorney])
assert.equal(getAttorneyThreeRolePlanForRole(cashPlan, R.transferAttorney).state, S.awaitingTrigger)
assert.equal(getAttorneyThreeRolePlanForRole(cashPlan, R.bondAttorney).state, S.notRequired)
assert.equal(cashPlan.readyToWork, false)

const triggeredPlan = buildAttorneyThreeRoleCoordinationPlan({
  transaction: { finance_type: 'bond', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: true },
  triggers: { transfer: true, bond: true, cancellation: true },
})
assert.equal(getAttorneyThreeRolePlanForRole(triggeredPlan, R.transferAttorney).state, S.awaitingAppointment)
assert.equal(getAttorneyThreeRolePlanForRole(triggeredPlan, R.bondAttorney).state, S.awaitingBankAppointment)
assert.equal(getAttorneyThreeRolePlanForRole(triggeredPlan, R.cancellationAttorney).state, S.awaitingBankAppointment)
assert.equal(summarizeAttorneyThreeRoleCoordinationPlan(triggeredPlan).awaitingAppointment, 3)

const invitationPlan = buildAttorneyThreeRoleCoordinationPlan({
  transaction: { finance_type: 'bond', buyer_entity_type: 'company', seller_entity_type: 'individual' },
  appointments: [{ role_type: 'bond_attorney', coordination_state: 'invite_accepted', evidence_confirmed: true, updated_at: '2026-07-15T10:00:00Z' }],
})
const invitedBond = getAttorneyThreeRolePlanForRole(invitationPlan, R.bondAttorney)
assert.equal(invitedBond.state, S.inviteAccepted)
assert.equal(invitedBond.dimension, LEGAL_ROLE_COORDINATION_DIMENSIONS.platformInvitation)
assert.equal(invitedBond.readyToWork, false)
assert.equal(invitedBond.nextAction.key, 'confirm_formal_instruction')

const healthyActivePlan = buildAttorneyThreeRoleCoordinationPlan({
  transaction: { finance_type: 'bond', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false },
  appointments: [{
    role_type: 'bond_attorney', coordination_state: 'active', evidence_confirmed: true,
    instruction_issuer: 'bank', instruction_reference: 'BANK-123', accepted_firm_id: 'bond-firm', updated_at: '2026-07-15T10:00:00Z',
  }],
  assignments: [
    { attorney_role: 'transfer_attorney', is_primary: true, assignment_status: 'active', instruction_status: 'accepted', updated_at: '2026-07-15T09:00:00Z' },
    { attorney_role: 'bond_attorney', is_primary: true, assignment_status: 'active', attorney_firm_id: 'bond-firm', updated_at: '2026-07-15T10:00:00Z' },
  ],
})
assert.equal(healthyActivePlan.readyToWork, true)
assert.equal(healthyActivePlan.healthy, true)
assert.deepEqual(summarizeAttorneyThreeRoleCoordinationPlan(healthyActivePlan), {
  required: 2, active: 2, completed: 0, blocked: 0, awaitingAppointment: 0, issueCount: 0,
})

const unsafePlan = buildAttorneyThreeRoleCoordinationPlan({
  transaction: { finance_type: 'bond', buyer_entity_type: 'individual', seller_entity_type: 'individual' },
  appointments: [{ role_type: 'bond_attorney', coordination_state: 'active', evidence_confirmed: false, accepted_firm_id: 'appointed-firm' }],
  assignments: [{ attorney_role: 'bond_attorney', is_primary: true, assignment_status: 'active', attorney_firm_id: 'wrong-firm' }],
})
const unsafeBond = getAttorneyThreeRolePlanForRole(unsafePlan, R.bondAttorney)
assert.deepEqual([...unsafeBond.consistencyIssues].sort(), [
  'active_bank_role_without_verified_bank_instruction',
  'appointment_evidence_missing',
  'assignment_firm_mismatch',
])
assert.equal(unsafePlan.readyToWork, false)
assert.equal(unsafePlan.healthy, false)

const duplicatePlan = buildAttorneyThreeRoleCoordinationPlan({
  transaction: { finance_type: 'cash', buyer_entity_type: 'individual', seller_entity_type: 'individual' },
  assignments: [
    { attorney_role: 'transfer_attorney', is_primary: true, assignment_status: 'active', instruction_status: 'accepted' },
    { attorney_role: 'transfer_attorney', is_primary: true, assignment_status: 'active', instruction_status: 'accepted' },
  ],
})
assert.ok(getAttorneyThreeRolePlanForRole(duplicatePlan, R.transferAttorney).consistencyIssues.includes('multiple_primary_assignments'))

const replacementPlan = buildAttorneyThreeRoleCoordinationPlan({
  transaction: { finance_type: 'bond', buyer_entity_type: 'individual', seller_entity_type: 'individual' },
  appointments: [
    { role_type: 'bond_attorney', coordination_state: 'active', evidence_confirmed: true, updated_at: '2026-07-14T10:00:00Z' },
    { role_type: 'bond_attorney', coordination_state: 'replacement_required', evidence_confirmed: true, updated_at: '2026-07-15T10:00:00Z' },
  ],
})
const replacementBond = getAttorneyThreeRolePlanForRole(replacementPlan, R.bondAttorney)
assert.equal(replacementBond.state, S.replacementRequired)
assert.equal(replacementBond.nextAction.key, 'capture_replacement_appointment')
assert.equal(summarizeAttorneyThreeRoleCoordinationPlan(replacementPlan).blocked, 1)

const nonRequiredRecordsPlan = buildAttorneyThreeRoleCoordinationPlan({
  transaction: { finance_type: 'cash', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false },
  assignments: [{ attorney_role: 'bond_attorney', is_primary: true, assignment_status: 'active' }],
})
assert.ok(getAttorneyThreeRolePlanForRole(nonRequiredRecordsPlan, R.bondAttorney).consistencyIssues.includes('records_exist_for_non_required_role'))
assert.equal(nonRequiredRecordsPlan.healthy, false)
assert.equal(nonRequiredRecordsPlan.readyToWork, false)

console.log('Attorney three-role Phase 1 coordination plan tests passed.')
