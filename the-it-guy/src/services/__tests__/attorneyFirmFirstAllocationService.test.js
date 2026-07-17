import assert from 'node:assert/strict'
import {
  buildAttorneyAllocationActivationPayload,
  buildAttorneyFirmAcceptancePayload,
  buildAttorneyFirmDeclinePayload,
  buildAttorneyFirmNominationPayload,
  buildInternalPrimaryAttorneyPayload,
  mapAttorneyFirmFirstAllocationRow,
  __attorneyFirmFirstAllocationServiceTestUtils,
} from '../attorneyFirmFirstAllocationService.js'

const fixedAt = '2026-07-17T10:00:00.000Z'

function test(name, callback) {
  try {
    callback()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('agent nomination appoints the firm without assigning its preferred person', () => {
  const payload = buildAttorneyFirmNominationPayload({
    transactionId: 'transaction-1',
    attorneyFirmId: 'firm-1',
    preferredAttorneyUserId: 'attorney-1',
    preferredContactName: 'A. Attorney',
    preferredContactEmail: 'ATTORNEY@EXAMPLE.TEST',
    appointmentSource: 'Agent Nomination',
    actorUserId: 'agent-1',
    nominatedAt: fixedAt,
  })

  assert.equal(payload.attorney_firm_id, 'firm-1')
  assert.equal(payload.attorney_user_id, null)
  assert.equal(payload.primary_attorney_id, null)
  assert.equal(payload.preferred_attorney_user_id, 'attorney-1')
  assert.equal(payload.preferred_contact_email, 'attorney@example.test')
  assert.equal(payload.appointment_source, 'agent_nomination')
  assert.equal(payload.firm_acceptance_status, 'awaiting_firm_acceptance')
  assert.equal(payload.staff_assignment_status, 'awaiting_staff_assignment')
  assert.equal(payload.allocation_state, 'awaiting_firm_acceptance')
  assert.equal(payload.assignment_status, 'pending')
})

test('firm acceptance remains pending until internal staff are assigned', () => {
  const payload = buildAttorneyFirmAcceptancePayload({ actorUserId: 'firm-admin-1', acceptedAt: fixedAt })
  assert.equal(payload.firm_acceptance_status, 'accepted')
  assert.equal(payload.allocation_state, 'awaiting_staff_assignment')
  assert.equal(payload.staff_assignment_status, 'awaiting_staff_assignment')
  assert.equal(payload.assignment_status, 'pending')
  assert.equal('instruction_status' in payload, false)
  assert.equal('attorney_user_id' in payload, false)
})

test('the appointed firm assigns its own primary attorney before activation', () => {
  const payload = buildInternalPrimaryAttorneyPayload({
    attorneyUserId: 'attorney-1',
    actorUserId: 'firm-admin-1',
    assignedAt: fixedAt,
  })
  assert.equal(payload.attorney_user_id, 'attorney-1')
  assert.equal(payload.primary_attorney_id, 'attorney-1')
  assert.equal(payload.staff_assignment_status, 'staff_assigned')
  assert.equal(payload.allocation_state, 'staff_assigned')
  assert.equal(payload.assignment_status, 'pending')
})

test('activation is the only Phase 3 payload that accepts the instruction and makes it active', () => {
  const payload = buildAttorneyAllocationActivationPayload({
    actorUserId: 'firm-admin-1',
    activatedAt: fixedAt,
  })
  assert.equal(payload.allocation_state, 'active')
  assert.equal(payload.assignment_status, 'active')
  assert.equal(payload.instruction_status, 'accepted')
  assert.equal(payload.instruction_accepted_by, 'firm-admin-1')
})

test('declines require an accountable reason and close the legacy assignment', () => {
  assert.throws(
    () => buildAttorneyFirmDeclinePayload({ actorUserId: 'firm-admin-1', reason: '' }),
    /decline reason is required/i,
  )
  const payload = buildAttorneyFirmDeclinePayload({
    actorUserId: 'firm-admin-1',
    reason: 'Capacity unavailable',
    declinedAt: fixedAt,
  })
  assert.equal(payload.allocation_state, 'declined')
  assert.equal(payload.instruction_status, 'declined')
  assert.equal(payload.assignment_status, 'removed')
  assert.equal(payload.decline_reason, 'Capacity unavailable')
})

test('service transition guard uses the shared Phase 1 contract', () => {
  const { assertTransition } = __attorneyFirmFirstAllocationServiceTestUtils
  assert.doesNotThrow(() => assertTransition('awaiting_firm_acceptance', 'awaiting_staff_assignment'))
  assert.throws(
    () => assertTransition('awaiting_firm_acceptance', 'active'),
    /cannot move/i,
  )
})

test('database rows are returned to UI callers in the canonical camel-case shape', () => {
  const mapped = mapAttorneyFirmFirstAllocationRow({
    id: 'assignment-1',
    transaction_id: 'transaction-1',
    attorney_firm_id: 'firm-1',
    attorney_role: 'transfer_attorney',
    assignment_type: 'transfer',
    preferred_attorney_user_id: 'preferred-1',
    firm_acceptance_status: 'accepted',
    staff_assignment_status: 'awaiting_staff_assignment',
    allocation_state: 'awaiting_staff_assignment',
    assignment_status: 'pending',
    is_primary: true,
  })
  assert.equal(mapped.transactionId, 'transaction-1')
  assert.equal(mapped.attorneyFirmId, 'firm-1')
  assert.equal(mapped.preferredAttorneyUserId, 'preferred-1')
  assert.equal(mapped.allocationState, 'awaiting_staff_assignment')
  assert.equal(mapped.attorneyUserId, null)
})

console.log('attorney firm-first allocation Phase 3 service tests passed')
