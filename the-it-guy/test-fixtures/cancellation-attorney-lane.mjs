const ids = Object.freeze({
  transactionId: '90000000-0000-4000-8000-000000000001',
  firmId: '90000000-0000-4000-8000-000000000002',
  organisationId: '90000000-0000-4000-8000-000000000003',
  appointmentId: '90000000-0000-4000-8000-000000000004',
  assignmentId: '90000000-0000-4000-8000-000000000005',
  subprocessId: '90000000-0000-4000-8000-000000000006',
})

// Non-production fixture for browser and service tests. It models the bank
// appointment -> canonical firm assignment -> linked cancellation lane chain.
export const cancellationAttorneyLaneFixture = Object.freeze({
  ids,
  transaction: Object.freeze({
    id: ids.transactionId,
    reference: 'TEST-CANCELLATION-001',
    seller_has_existing_bond: true,
    existing_bond: true,
    is_demo_data: true,
  }),
  firm: Object.freeze({
    id: ids.firmId,
    organisation_id: ids.organisationId,
    name: 'Cancellation Fixture Attorneys',
    is_active: true,
    is_demo_data: true,
  }),
  appointment: Object.freeze({
    id: ids.appointmentId,
    transaction_id: ids.transactionId,
    role_type: 'cancellation_attorney',
    evidence_confirmed: true,
    coordination_state: 'invite_accepted',
    accepted_organisation_id: ids.organisationId,
    accepted_firm_id: ids.firmId,
    staff_assignment_status: 'awaiting_staff_assignment',
    appointment_source: 'test_fixture',
  }),
  assignment: Object.freeze({
    id: ids.assignmentId,
    transaction_id: ids.transactionId,
    firm_id: ids.firmId,
    attorney_firm_id: ids.firmId,
    assignment_type: 'cancellation',
    matter_type: 'cancellation',
    attorney_role: 'cancellation_attorney',
    status: 'pending',
    assignment_status: 'pending',
    instruction_status: 'new_instruction',
    firm_acceptance_status: 'accepted',
    staff_assignment_status: 'awaiting_staff_assignment',
    allocation_state: 'awaiting_staff_assignment',
    is_primary: true,
    visibility_scope: 'firm_matter',
    is_demo_data: true,
  }),
  subprocess: Object.freeze({
    id: ids.subprocessId,
    transaction_id: ids.transactionId,
    process_type: 'cancellation',
    attorney_role: 'cancellation_attorney',
    attorney_assignment_id: ids.assignmentId,
    owner_type: 'attorney',
    status: 'not_started',
    lane_status: 'not_started',
    current_stage: 'instruction_received',
    visibility_scope: 'shared',
    is_required: true,
    is_demo_data: true,
  }),
})

export default cancellationAttorneyLaneFixture
