export const ATTORNEY_LEGAL_ROLES = Object.freeze({
  transfer: 'transfer_attorney',
  bond: 'bond_attorney',
  cancellation: 'cancellation_attorney',
})

export const ATTORNEY_APPOINTMENT_AUTHORITIES = Object.freeze({
  sellerOrAgent: 'seller_or_agent',
  bank: 'bank',
})

export const ATTORNEY_FIRM_ACCEPTANCE_STATUSES = Object.freeze({
  awaiting: 'awaiting_firm_acceptance',
  accepted: 'accepted',
  declined: 'declined',
  replacementRequired: 'replacement_required',
})

export const ATTORNEY_STAFF_ASSIGNMENT_STATUSES = Object.freeze({
  awaiting: 'awaiting_staff_assignment',
  assigned: 'staff_assigned',
})

export const ATTORNEY_ALLOCATION_STATES = Object.freeze({
  awaitingFirmAcceptance: 'awaiting_firm_acceptance',
  awaitingStaffAssignment: 'awaiting_staff_assignment',
  staffAssigned: 'staff_assigned',
  active: 'active',
  declined: 'declined',
  replacementRequired: 'replacement_required',
  completed: 'completed',
  removed: 'removed',
})

export const ATTORNEY_ALLOCATION_STATE_LABELS = Object.freeze({
  [ATTORNEY_ALLOCATION_STATES.awaitingFirmAcceptance]: 'Awaiting Firm Acceptance',
  [ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment]: 'Awaiting Staff Assignment',
  [ATTORNEY_ALLOCATION_STATES.staffAssigned]: 'Staff Assigned',
  [ATTORNEY_ALLOCATION_STATES.active]: 'Active',
  [ATTORNEY_ALLOCATION_STATES.declined]: 'Declined',
  [ATTORNEY_ALLOCATION_STATES.replacementRequired]: 'Replacement Required',
  [ATTORNEY_ALLOCATION_STATES.completed]: 'Completed',
  [ATTORNEY_ALLOCATION_STATES.removed]: 'Removed',
})

export const ATTORNEY_ALLOCATION_TRANSITIONS = Object.freeze({
  [ATTORNEY_ALLOCATION_STATES.awaitingFirmAcceptance]: Object.freeze([
    ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment,
    ATTORNEY_ALLOCATION_STATES.declined,
    ATTORNEY_ALLOCATION_STATES.replacementRequired,
    ATTORNEY_ALLOCATION_STATES.removed,
  ]),
  [ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment]: Object.freeze([
    ATTORNEY_ALLOCATION_STATES.staffAssigned,
    ATTORNEY_ALLOCATION_STATES.declined,
    ATTORNEY_ALLOCATION_STATES.replacementRequired,
    ATTORNEY_ALLOCATION_STATES.removed,
  ]),
  [ATTORNEY_ALLOCATION_STATES.staffAssigned]: Object.freeze([
    ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment,
    ATTORNEY_ALLOCATION_STATES.active,
    ATTORNEY_ALLOCATION_STATES.declined,
    ATTORNEY_ALLOCATION_STATES.replacementRequired,
    ATTORNEY_ALLOCATION_STATES.removed,
  ]),
  [ATTORNEY_ALLOCATION_STATES.active]: Object.freeze([
    ATTORNEY_ALLOCATION_STATES.replacementRequired,
    ATTORNEY_ALLOCATION_STATES.completed,
    ATTORNEY_ALLOCATION_STATES.removed,
  ]),
  [ATTORNEY_ALLOCATION_STATES.declined]: Object.freeze([
    ATTORNEY_ALLOCATION_STATES.replacementRequired,
    ATTORNEY_ALLOCATION_STATES.removed,
  ]),
  [ATTORNEY_ALLOCATION_STATES.replacementRequired]: Object.freeze([
    ATTORNEY_ALLOCATION_STATES.awaitingFirmAcceptance,
    ATTORNEY_ALLOCATION_STATES.removed,
  ]),
  [ATTORNEY_ALLOCATION_STATES.completed]: Object.freeze([]),
  [ATTORNEY_ALLOCATION_STATES.removed]: Object.freeze([]),
})

const LEGAL_ROLE_ALIASES = Object.freeze({
  transfer: ATTORNEY_LEGAL_ROLES.transfer,
  conveyancer: ATTORNEY_LEGAL_ROLES.transfer,
  attorney: ATTORNEY_LEGAL_ROLES.transfer,
  transfer_attorney: ATTORNEY_LEGAL_ROLES.transfer,
  transfer_and_bond: ATTORNEY_LEGAL_ROLES.transfer,
  bond: ATTORNEY_LEGAL_ROLES.bond,
  bond_attorney: ATTORNEY_LEGAL_ROLES.bond,
  cancellation: ATTORNEY_LEGAL_ROLES.cancellation,
  cancellation_attorney: ATTORNEY_LEGAL_ROLES.cancellation,
})

const CANONICAL_ALLOCATION_STATES = new Set(Object.values(ATTORNEY_ALLOCATION_STATES))
const ACCEPTED_COORDINATION_STATES = new Set(['invite_accepted', 'instruction_confirmed', 'active'])
const REMOVED_STATUSES = new Set(['removed', 'cancelled', 'canceled'])
const DECLINED_STATUSES = new Set(['declined', 'rejected'])
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'closed'])

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
}

function firstText(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || ''
}

function readFirmId(allocation = {}) {
  return firstText(
    allocation.attorneyFirmId,
    allocation.attorney_firm_id,
    allocation.firmId,
    allocation.firm_id,
    allocation.acceptedFirmId,
    allocation.accepted_firm_id,
  ) || null
}

function readPrimaryAttorneyId(allocation = {}) {
  return firstText(
    allocation.attorneyUserId,
    allocation.attorney_user_id,
    allocation.primaryAttorneyId,
    allocation.primary_attorney_id,
    allocation.assignedUserId,
    allocation.assigned_user_id,
  ) || null
}

function readPreferredAttorneyId(allocation = {}) {
  return firstText(
    allocation.preferredAttorneyUserId,
    allocation.preferred_attorney_user_id,
  ) || null
}

export function normalizeAttorneyLegalRole(value, fallback = '') {
  return LEGAL_ROLE_ALIASES[normalizeKey(value)] || fallback
}

export function resolveAttorneyAppointmentAuthority(role) {
  const legalRole = normalizeAttorneyLegalRole(role)
  if (legalRole === ATTORNEY_LEGAL_ROLES.transfer) return ATTORNEY_APPOINTMENT_AUTHORITIES.sellerOrAgent
  if ([ATTORNEY_LEGAL_ROLES.bond, ATTORNEY_LEGAL_ROLES.cancellation].includes(legalRole)) {
    return ATTORNEY_APPOINTMENT_AUTHORITIES.bank
  }
  return null
}

export function getAttorneyAllocationStateLabel(state) {
  return ATTORNEY_ALLOCATION_STATE_LABELS[normalizeKey(state)] || 'Unknown'
}

export function canTransitionAttorneyAllocation(fromState, toState) {
  const from = normalizeKey(fromState)
  const to = normalizeKey(toState)
  if (!CANONICAL_ALLOCATION_STATES.has(from) || !CANONICAL_ALLOCATION_STATES.has(to)) return false
  if (from === to) return true
  return ATTORNEY_ALLOCATION_TRANSITIONS[from]?.includes(to) || false
}

export function resolveAttorneyFirmAcceptanceStatus(allocation = {}) {
  const explicitStatus = normalizeKey(
    allocation.firmAcceptanceStatus ||
      allocation.firm_acceptance_status ||
      allocation.acceptanceStatus ||
      allocation.acceptance_status,
  )
  if (Object.values(ATTORNEY_FIRM_ACCEPTANCE_STATUSES).includes(explicitStatus)) return explicitStatus

  const coordinationState = normalizeKey(allocation.coordinationState || allocation.coordination_state)
  if (coordinationState === ATTORNEY_FIRM_ACCEPTANCE_STATUSES.replacementRequired) {
    return ATTORNEY_FIRM_ACCEPTANCE_STATUSES.replacementRequired
  }
  if (DECLINED_STATUSES.has(coordinationState)) return ATTORNEY_FIRM_ACCEPTANCE_STATUSES.declined
  if (ACCEPTED_COORDINATION_STATES.has(coordinationState)) return ATTORNEY_FIRM_ACCEPTANCE_STATUSES.accepted

  if (firstText(allocation.acceptedAt, allocation.accepted_at, allocation.firmAcceptedAt, allocation.firm_accepted_at)) {
    return ATTORNEY_FIRM_ACCEPTANCE_STATUSES.accepted
  }

  const assignmentStatus = normalizeKey(allocation.assignmentStatus || allocation.assignment_status || allocation.status)
  if (DECLINED_STATUSES.has(assignmentStatus)) return ATTORNEY_FIRM_ACCEPTANCE_STATUSES.declined
  if (assignmentStatus === 'active' && readFirmId(allocation)) return ATTORNEY_FIRM_ACCEPTANCE_STATUSES.accepted
  return ATTORNEY_FIRM_ACCEPTANCE_STATUSES.awaiting
}

export function resolveAttorneyStaffAssignmentStatus(allocation = {}) {
  const explicitStatus = normalizeKey(allocation.staffAssignmentStatus || allocation.staff_assignment_status)
  if (Object.values(ATTORNEY_STAFF_ASSIGNMENT_STATUSES).includes(explicitStatus)) return explicitStatus
  return readPrimaryAttorneyId(allocation)
    ? ATTORNEY_STAFF_ASSIGNMENT_STATUSES.assigned
    : ATTORNEY_STAFF_ASSIGNMENT_STATUSES.awaiting
}

export function resolveAttorneyAllocationState(allocation = {}) {
  const explicitState = normalizeKey(allocation.allocationState || allocation.allocation_state)
  if (CANONICAL_ALLOCATION_STATES.has(explicitState)) return explicitState

  const assignmentStatus = normalizeKey(allocation.assignmentStatus || allocation.assignment_status || allocation.status)
  const instructionStatus = normalizeKey(allocation.instructionStatus || allocation.instruction_status)
  const coordinationState = normalizeKey(allocation.coordinationState || allocation.coordination_state)

  if (REMOVED_STATUSES.has(assignmentStatus)) return ATTORNEY_ALLOCATION_STATES.removed
  if (COMPLETED_STATUSES.has(assignmentStatus) || COMPLETED_STATUSES.has(instructionStatus)) {
    return ATTORNEY_ALLOCATION_STATES.completed
  }
  if (coordinationState === 'replacement_required') return ATTORNEY_ALLOCATION_STATES.replacementRequired
  if (DECLINED_STATUSES.has(assignmentStatus) || DECLINED_STATUSES.has(instructionStatus)) {
    return ATTORNEY_ALLOCATION_STATES.declined
  }

  const firmId = readFirmId(allocation)
  const primaryAttorneyId = readPrimaryAttorneyId(allocation)
  const acceptanceStatus = resolveAttorneyFirmAcceptanceStatus(allocation)
  if (!firmId || acceptanceStatus === ATTORNEY_FIRM_ACCEPTANCE_STATUSES.awaiting) {
    return ATTORNEY_ALLOCATION_STATES.awaitingFirmAcceptance
  }
  if (acceptanceStatus === ATTORNEY_FIRM_ACCEPTANCE_STATUSES.replacementRequired) {
    return ATTORNEY_ALLOCATION_STATES.replacementRequired
  }
  if (acceptanceStatus === ATTORNEY_FIRM_ACCEPTANCE_STATUSES.declined) {
    return ATTORNEY_ALLOCATION_STATES.declined
  }
  if (!primaryAttorneyId) return ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment

  if (coordinationState === 'active' || instructionStatus === 'accepted') {
    return ATTORNEY_ALLOCATION_STATES.active
  }
  if (!instructionStatus && assignmentStatus === 'active') return ATTORNEY_ALLOCATION_STATES.active
  return ATTORNEY_ALLOCATION_STATES.staffAssigned
}

export function evaluateAttorneyAllocationActivation(allocation = {}, requirements = {}) {
  const firmId = readFirmId(allocation)
  const primaryAttorneyId = readPrimaryAttorneyId(allocation)
  const firmAcceptanceStatus = resolveAttorneyFirmAcceptanceStatus(allocation)
  const blockers = []

  if (!firmId) blockers.push('missing_firm')
  if (firmAcceptanceStatus !== ATTORNEY_FIRM_ACCEPTANCE_STATUSES.accepted) blockers.push('firm_not_accepted')
  if (!primaryAttorneyId) blockers.push('missing_primary_attorney')
  if (requirements.primaryAttorneyMembershipActive !== true) blockers.push('primary_attorney_not_active_member')
  if (requirements.firmModuleEnabled !== true) blockers.push('firm_module_not_enabled')
  if (requirements.externalInstructionRequired && requirements.externalInstructionConfirmed !== true) {
    blockers.push('external_instruction_not_confirmed')
  }

  return {
    canActivate: blockers.length === 0,
    blockers: Object.freeze(blockers),
  }
}

export function buildAttorneyFirmFirstAllocationContract(allocation = {}) {
  const legalRole = normalizeAttorneyLegalRole(
    allocation.attorneyRole || allocation.attorney_role || allocation.assignmentType || allocation.assignment_type,
  )
  const firmId = readFirmId(allocation)
  const primaryAttorneyId = readPrimaryAttorneyId(allocation)
  const preferredAttorneyUserId = readPreferredAttorneyId(allocation)
  const firmAcceptanceStatus = resolveAttorneyFirmAcceptanceStatus(allocation)
  const staffAssignmentStatus = resolveAttorneyStaffAssignmentStatus(allocation)
  const state = resolveAttorneyAllocationState(allocation)
  const invariantViolations = []

  if (primaryAttorneyId && !firmId) invariantViolations.push('person_without_firm')
  if (staffAssignmentStatus === ATTORNEY_STAFF_ASSIGNMENT_STATUSES.assigned && !primaryAttorneyId) {
    invariantViolations.push('staff_status_without_primary_attorney')
  }
  if (state === ATTORNEY_ALLOCATION_STATES.active && !primaryAttorneyId) {
    invariantViolations.push('active_without_primary_attorney')
  }
  if (state === ATTORNEY_ALLOCATION_STATES.active && firmAcceptanceStatus !== ATTORNEY_FIRM_ACCEPTANCE_STATUSES.accepted) {
    invariantViolations.push('active_without_firm_acceptance')
  }

  return Object.freeze({
    legalRole,
    appointmentAuthority: resolveAttorneyAppointmentAuthority(legalRole),
    firmId,
    primaryAttorneyId,
    preferredAttorneyUserId,
    preferredContactName: firstText(allocation.preferredContactName, allocation.preferred_contact_name, allocation.contactPerson, allocation.contact_person) || null,
    firmAcceptanceStatus,
    staffAssignmentStatus,
    state,
    stateLabel: getAttorneyAllocationStateLabel(state),
    firmOwnsInstruction: Boolean(firmId),
    personOwnsOperationalWork: Boolean(primaryAttorneyId),
    invariantViolations: Object.freeze(invariantViolations),
  })
}
