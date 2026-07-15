import {
  LEGAL_ROLE_COORDINATION_DIMENSIONS,
  LEGAL_ROLE_COORDINATION_STATES,
  LEGAL_ROLE_TYPES,
  getAllowedLegalRoleStateTransitions,
  getInitialLegalRoleCoordinationState,
  getLegalRoleAuthorityPolicy,
  getLegalRoleCoordinationStateDimension,
  isBankAppointedLegalRole,
  normalizeLegalRoleType,
} from './legalRoleCoordinationContract.js'
import { ATTORNEY_WORLD_CLASS_ROLE_RESPONSIBILITIES } from './attorneyThreeRoleWorldClassBaseline.js'
import { resolveLegalRequirements } from '../../services/attorneyWorkflow/attorneyWorkflowResolver.js'

export const ATTORNEY_THREE_ROLE_PHASE1_VERSION = 'attorney_three_role_coordination_phase1_v1'

const S = LEGAL_ROLE_COORDINATION_STATES
const ALL_ROLE_TYPES = Object.freeze(Object.values(LEGAL_ROLE_TYPES))
const VALID_STATES = new Set(Object.values(S))

const NEXT_ACTIONS = Object.freeze({
  [S.notRequired]: Object.freeze({ key: 'none', owner: 'none', label: 'No legal-role action required' }),
  [S.awaitingTrigger]: Object.freeze({ key: 'satisfy_trigger', owner: 'transaction_coordinator', label: 'Complete the transaction trigger for this legal role' }),
  [S.awaitingAppointment]: Object.freeze({ key: 'capture_seller_nomination', owner: 'seller', label: 'Capture the seller-authorised transfer attorney nomination' }),
  [S.awaitingBankAppointment]: Object.freeze({ key: 'capture_bank_appointment', owner: 'appointing_bank', label: 'Capture the bank-appointed firm and supporting evidence' }),
  [S.appointmentCaptured]: Object.freeze({ key: 'prepare_platform_invite', owner: 'coordination_owner', label: 'Prepare the appointed firm platform invitation' }),
  [S.invitePending]: Object.freeze({ key: 'send_platform_invite', owner: 'coordination_owner', label: 'Send the appointed firm platform invitation' }),
  [S.inviteSent]: Object.freeze({ key: 'accept_platform_invite', owner: 'appointed_firm', label: 'Appointed firm must accept platform access' }),
  [S.inviteAccepted]: Object.freeze({ key: 'confirm_formal_instruction', owner: 'formal_instructor', label: 'Confirm the formal legal instruction separately from platform access' }),
  [S.instructionConfirmed]: Object.freeze({ key: 'accept_legal_instruction', owner: 'appointed_firm', label: 'Appointed firm must accept the legal instruction' }),
  [S.active]: Object.freeze({ key: 'advance_legal_lane', owner: 'appointed_matter_team', label: 'Advance the assigned legal workflow lane' }),
  [S.declined]: Object.freeze({ key: 'start_replacement', owner: 'appointment_authority', label: 'Start the authorised replacement process' }),
  [S.replacementRequired]: Object.freeze({ key: 'capture_replacement_appointment', owner: 'appointment_authority', label: 'Capture an authorised replacement appointment' }),
  [S.completed]: Object.freeze({ key: 'none', owner: 'none', label: 'Legal-role work is complete' }),
})

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function readRole(row = {}) {
  return normalizeLegalRoleType(row.roleType || row.role_type || row.attorneyRole || row.attorney_role || row.assignmentType || row.assignment_type)
}

function readState(row = {}) {
  return normalizeText(row.coordinationState || row.coordination_state)
}

function isLiveAssignment(row = {}) {
  return !['removed', 'cancelled'].includes(normalizeText(row.assignmentStatus || row.assignment_status || row.status))
}

function isPrimaryAssignment(row = {}) {
  return row.isPrimary === true || row.is_primary === true
}

function latestByTimestamp(rows = []) {
  return [...rows].sort((left, right) => {
    const rightTime = new Date(right.updated_at || right.updatedAt || right.captured_at || right.capturedAt || 0).getTime()
    const leftTime = new Date(left.updated_at || left.updatedAt || left.captured_at || left.capturedAt || 0).getTime()
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
  })[0] || null
}

function triggerSatisfiedForRole(roleType, triggers = {}) {
  if (triggers[roleType] === true) return true
  if (roleType === LEGAL_ROLE_TYPES.transferAttorney) return triggers.transfer === true || triggers.transferInstructionReady === true
  if (roleType === LEGAL_ROLE_TYPES.bondAttorney) return triggers.bond === true || triggers.bondAppointmentReady === true
  if (roleType === LEGAL_ROLE_TYPES.cancellationAttorney) return triggers.cancellation === true || triggers.cancellationAppointmentReady === true
  return false
}

function deriveRoleState({ roleType, required, triggers, appointment, primaryAssignment }) {
  if (!required) return S.notRequired

  const appointmentState = readState(appointment || {})
  if (appointmentState && VALID_STATES.has(appointmentState)) return appointmentState

  if (roleType === LEGAL_ROLE_TYPES.transferAttorney && primaryAssignment) {
    const instructionStatus = normalizeText(primaryAssignment.instructionStatus || primaryAssignment.instruction_status)
    if (instructionStatus === 'accepted') return S.active
    if (instructionStatus === 'declined') return S.replacementRequired
    return S.appointmentCaptured
  }

  return getInitialLegalRoleCoordinationState(roleType, {
    required,
    triggerSatisfied: triggerSatisfiedForRole(roleType, triggers),
  })
}

function deriveConsistencyIssues({ roleType, required, state, appointment, assignments }) {
  const issues = []
  const bankAppointed = isBankAppointedLegalRole(roleType)
  const liveAssignments = assignments.filter(isLiveAssignment)
  const primaryAssignments = liveAssignments.filter(isPrimaryAssignment)

  if (!required && (appointment || liveAssignments.length)) issues.push('records_exist_for_non_required_role')
  if (appointment && readState(appointment) && !VALID_STATES.has(readState(appointment))) issues.push('invalid_coordination_state')
  if (bankAppointed && liveAssignments.length && !appointment) issues.push('bank_assignment_without_appointment')
  if (bankAppointed && appointment && appointment.evidence_confirmed !== true && appointment.evidenceConfirmed !== true) issues.push('appointment_evidence_missing')
  if (primaryAssignments.length > 1) issues.push('multiple_primary_assignments')

  if ([S.active, S.completed].includes(state) && !liveAssignments.length) issues.push('active_role_without_assignment')
  if (bankAppointed && state === S.active) {
    const instructionIssuer = normalizeText(appointment?.instruction_issuer || appointment?.instructionIssuer)
    const instructionReference = String(appointment?.instruction_reference || appointment?.instructionReference || '').trim()
    if (instructionIssuer !== 'bank' || !instructionReference) issues.push('active_bank_role_without_verified_bank_instruction')
  }

  const acceptedFirmId = appointment?.accepted_firm_id || appointment?.acceptedFirmId
  if (bankAppointed && acceptedFirmId && liveAssignments.some((assignment) => {
    const firmId = assignment.attorney_firm_id || assignment.attorneyFirmId || assignment.firm_id || assignment.firmId
    return firmId && firmId !== acceptedFirmId
  })) issues.push('assignment_firm_mismatch')

  return Object.freeze(issues)
}

function buildRolePlan({ roleType, required, reason, triggers, appointments, assignments }) {
  const roleAppointments = appointments.filter((row) => readRole(row) === roleType)
  const appointment = latestByTimestamp(roleAppointments)
  const roleAssignments = assignments.filter((row) => readRole(row) === roleType)
  const primaryAssignment = latestByTimestamp(roleAssignments.filter((row) => isLiveAssignment(row) && isPrimaryAssignment(row)))
  const state = deriveRoleState({ roleType, required, triggers, appointment, primaryAssignment })
  const authority = getLegalRoleAuthorityPolicy(roleType)
  const responsibility = ATTORNEY_WORLD_CLASS_ROLE_RESPONSIBILITIES[roleType]
  const issues = deriveConsistencyIssues({ roleType, required, state, appointment, assignments: roleAssignments })

  return Object.freeze({
    roleType,
    laneKey: responsibility.laneKey,
    required,
    requirementReason: reason,
    state,
    dimension: getLegalRoleCoordinationStateDimension(state),
    nextAction: NEXT_ACTIONS[state],
    allowedNextStates: getAllowedLegalRoleStateTransitions(roleType, state),
    appointmentKind: authority.appointmentKind,
    appointmentAuthorities: authority.appointmentAuthorities,
    formalInstructors: authority.formalInstructors,
    valueProposition: responsibility.valueProposition,
    responsibilityKeys: responsibility.owns,
    appointment: appointment || null,
    primaryAssignment: primaryAssignment || null,
    consistencyIssues: issues,
    healthy: issues.length === 0,
    readyToWork: [S.active, S.completed].includes(state) && issues.length === 0,
  })
}

export function buildAttorneyThreeRoleCoordinationPlan({ transaction = {}, triggers = {}, appointments = [], assignments = [] } = {}) {
  const requirements = resolveLegalRequirements(transaction)
  const laneByRole = new Map(
    Object.values(requirements.lanes)
      .filter((lane) => lane?.role)
      .map((lane) => [lane.role, lane]),
  )

  const roles = ALL_ROLE_TYPES.map((roleType) => {
    const lane = laneByRole.get(roleType)
    return buildRolePlan({
      roleType,
      required: lane?.required === true,
      reason: lane?.reason || '',
      triggers,
      appointments,
      assignments,
    })
  })
  const requiredRoles = roles.filter((role) => role.required)
  const issues = roles.flatMap((role) => role.consistencyIssues.map((issue) => ({ roleType: role.roleType, issue })))

  return Object.freeze({
    version: ATTORNEY_THREE_ROLE_PHASE1_VERSION,
    transactionId: transaction.id || null,
    roles: Object.freeze(roles),
    requiredRoleTypes: Object.freeze(requiredRoles.map((role) => role.roleType)),
    currentDimensions: Object.freeze([...new Set(requiredRoles.map((role) => role.dimension).filter(Boolean))]),
    readyToWork: requiredRoles.length > 0 && requiredRoles.every((role) => role.readyToWork) && issues.length === 0,
    completed: requiredRoles.length > 0 && requiredRoles.every((role) => role.state === S.completed),
    healthy: issues.length === 0,
    consistencyIssues: Object.freeze(issues),
    missingTransactionFields: Object.freeze(requirements.facts.missingFields),
    warnings: Object.freeze(requirements.warnings),
  })
}

export function getAttorneyThreeRolePlanForRole(plan, roleType) {
  const normalizedRole = normalizeLegalRoleType(roleType)
  return plan?.roles?.find((role) => role.roleType === normalizedRole) || null
}

export function summarizeAttorneyThreeRoleCoordinationPlan(plan) {
  const roles = Array.isArray(plan?.roles) ? plan.roles : []
  return Object.freeze({
    required: roles.filter((role) => role.required).length,
    active: roles.filter((role) => role.required && role.state === S.active).length,
    completed: roles.filter((role) => role.required && role.state === S.completed).length,
    blocked: roles.filter((role) => role.required && [S.declined, S.replacementRequired].includes(role.state)).length,
    awaitingAppointment: roles.filter((role) => role.required && role.dimension === LEGAL_ROLE_COORDINATION_DIMENSIONS.appointment).length,
    issueCount: Array.isArray(plan?.consistencyIssues) ? plan.consistencyIssues.length : 0,
  })
}
