export const LEGAL_ROLE_COORDINATION_CONTRACT_VERSION = 'legal_role_coordination_v1'

export const LEGAL_ROLE_TYPES = Object.freeze({
  transferAttorney: 'transfer_attorney',
  bondAttorney: 'bond_attorney',
  cancellationAttorney: 'cancellation_attorney',
})

export const BANK_APPOINTED_LEGAL_ROLES = Object.freeze([
  LEGAL_ROLE_TYPES.bondAttorney,
  LEGAL_ROLE_TYPES.cancellationAttorney,
])

export const LEGAL_ROLE_COORDINATION_ACTORS = Object.freeze({
  seller: 'seller',
  agent: 'agent',
  principal: 'principal',
  admin: 'admin',
  system: 'system',
  transferAttorney: 'transfer_attorney',
  transferFirmManager: 'transfer_firm_manager',
  bondOriginator: 'bond_originator',
  existingBank: 'existing_bank',
  newLendingBank: 'new_lending_bank',
  appointedFirmManager: 'appointed_firm_manager',
})

export const LEGAL_ROLE_APPOINTMENT_SOURCES = Object.freeze({
  sellerNomination: 'seller_nomination',
  agencyPreferred: 'agency_preferred',
  clientInvite: 'client_invite',
  bankIntegration: 'bank_integration',
  bondOriginator: 'bond_originator',
  transferAttorney: 'transfer_attorney',
  agentFallback: 'agent_fallback',
  instructionDocument: 'instruction_document',
  legacyManual: 'legacy_manual',
})

export const LEGAL_ROLE_COORDINATION_STATES = Object.freeze({
  notRequired: 'not_required',
  awaitingTrigger: 'awaiting_trigger',
  awaitingAppointment: 'awaiting_appointment',
  awaitingBankAppointment: 'awaiting_bank_appointment',
  appointmentCaptured: 'appointment_captured',
  invitePending: 'invite_pending',
  inviteSent: 'invite_sent',
  inviteAccepted: 'invite_accepted',
  instructionConfirmed: 'instruction_confirmed',
  active: 'active',
  declined: 'declined',
  replacementRequired: 'replacement_required',
  completed: 'completed',
})

export const LEGAL_ROLE_COORDINATION_DIMENSIONS = Object.freeze({
  requirement: 'requirement',
  appointment: 'appointment',
  platformInvitation: 'platform_invitation',
  legalInstruction: 'legal_instruction',
  matter: 'matter',
})

export const LEGAL_ROLE_COORDINATION_EVENTS = Object.freeze({
  requirementDetected: 'legal_role_requirement_detected',
  appointmentAwaited: 'legal_role_appointment_awaited',
  appointmentCaptured: 'legal_role_appointment_captured',
  invitePrepared: 'legal_role_invite_prepared',
  inviteSent: 'legal_role_invite_sent',
  inviteAccepted: 'legal_role_invite_accepted',
  instructionConfirmed: 'legal_role_instruction_confirmed',
  activated: 'legal_role_activated',
  declined: 'legal_role_declined',
  replacementRequired: 'legal_role_replacement_required',
  completed: 'legal_role_completed',
})

const ROLE_ALIASES = Object.freeze({
  transfer: LEGAL_ROLE_TYPES.transferAttorney,
  transfer_attorney: LEGAL_ROLE_TYPES.transferAttorney,
  transferring_attorney: LEGAL_ROLE_TYPES.transferAttorney,
  conveyancer: LEGAL_ROLE_TYPES.transferAttorney,
  bond: LEGAL_ROLE_TYPES.bondAttorney,
  bond_attorney: LEGAL_ROLE_TYPES.bondAttorney,
  bond_registration_attorney: LEGAL_ROLE_TYPES.bondAttorney,
  registration_attorney: LEGAL_ROLE_TYPES.bondAttorney,
  cancellation: LEGAL_ROLE_TYPES.cancellationAttorney,
  cancellation_attorney: LEGAL_ROLE_TYPES.cancellationAttorney,
  bond_cancellation_attorney: LEGAL_ROLE_TYPES.cancellationAttorney,
})

const ACTOR_ALIASES = Object.freeze({
  agency_admin: LEGAL_ROLE_COORDINATION_ACTORS.admin,
  internal_admin: LEGAL_ROLE_COORDINATION_ACTORS.admin,
  administrator: LEGAL_ROLE_COORDINATION_ACTORS.admin,
  transferring_attorney: LEGAL_ROLE_COORDINATION_ACTORS.transferAttorney,
  transfer_firm_admin: LEGAL_ROLE_COORDINATION_ACTORS.transferFirmManager,
})

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
}

function freezePolicy(policy) {
  return Object.freeze({
    ...policy,
    appointmentAuthorities: Object.freeze([...policy.appointmentAuthorities]),
    appointmentSources: Object.freeze([...policy.appointmentSources]),
    primaryInviters: Object.freeze([...policy.primaryInviters]),
    fallbackInviters: Object.freeze([...policy.fallbackInviters]),
    formalInstructors: Object.freeze([...policy.formalInstructors]),
  })
}

export const LEGAL_ROLE_AUTHORITY_MATRIX = Object.freeze({
  [LEGAL_ROLE_TYPES.transferAttorney]: freezePolicy({
    appointmentKind: 'seller_nomination',
    appointmentAuthorities: [LEGAL_ROLE_COORDINATION_ACTORS.seller],
    appointmentSources: [
      LEGAL_ROLE_APPOINTMENT_SOURCES.sellerNomination,
      LEGAL_ROLE_APPOINTMENT_SOURCES.agencyPreferred,
      LEGAL_ROLE_APPOINTMENT_SOURCES.clientInvite,
    ],
    primaryInviters: [LEGAL_ROLE_COORDINATION_ACTORS.system, LEGAL_ROLE_COORDINATION_ACTORS.agent],
    fallbackInviters: [
      LEGAL_ROLE_COORDINATION_ACTORS.seller,
      LEGAL_ROLE_COORDINATION_ACTORS.principal,
      LEGAL_ROLE_COORDINATION_ACTORS.admin,
    ],
    formalInstructors: [LEGAL_ROLE_COORDINATION_ACTORS.seller],
    appointmentEvidenceRequiredForInvite: true,
    acceptedTransferInstructionRequiredForInvite: false,
  }),
  [LEGAL_ROLE_TYPES.cancellationAttorney]: freezePolicy({
    appointmentKind: 'bank_appointment',
    appointmentAuthorities: [LEGAL_ROLE_COORDINATION_ACTORS.existingBank],
    appointmentSources: [
      LEGAL_ROLE_APPOINTMENT_SOURCES.bankIntegration,
      LEGAL_ROLE_APPOINTMENT_SOURCES.transferAttorney,
      LEGAL_ROLE_APPOINTMENT_SOURCES.agentFallback,
      LEGAL_ROLE_APPOINTMENT_SOURCES.instructionDocument,
      LEGAL_ROLE_APPOINTMENT_SOURCES.legacyManual,
    ],
    primaryInviters: [LEGAL_ROLE_COORDINATION_ACTORS.system, LEGAL_ROLE_COORDINATION_ACTORS.transferAttorney],
    fallbackInviters: [
      LEGAL_ROLE_COORDINATION_ACTORS.transferFirmManager,
      LEGAL_ROLE_COORDINATION_ACTORS.agent,
      LEGAL_ROLE_COORDINATION_ACTORS.principal,
      LEGAL_ROLE_COORDINATION_ACTORS.admin,
    ],
    formalInstructors: [LEGAL_ROLE_COORDINATION_ACTORS.existingBank],
    appointmentEvidenceRequiredForInvite: true,
    acceptedTransferInstructionRequiredForInvite: true,
  }),
  [LEGAL_ROLE_TYPES.bondAttorney]: freezePolicy({
    appointmentKind: 'bank_appointment',
    appointmentAuthorities: [LEGAL_ROLE_COORDINATION_ACTORS.newLendingBank],
    appointmentSources: [
      LEGAL_ROLE_APPOINTMENT_SOURCES.bankIntegration,
      LEGAL_ROLE_APPOINTMENT_SOURCES.bondOriginator,
      LEGAL_ROLE_APPOINTMENT_SOURCES.transferAttorney,
      LEGAL_ROLE_APPOINTMENT_SOURCES.agentFallback,
      LEGAL_ROLE_APPOINTMENT_SOURCES.instructionDocument,
      LEGAL_ROLE_APPOINTMENT_SOURCES.legacyManual,
    ],
    primaryInviters: [LEGAL_ROLE_COORDINATION_ACTORS.system, LEGAL_ROLE_COORDINATION_ACTORS.transferAttorney],
    fallbackInviters: [
      LEGAL_ROLE_COORDINATION_ACTORS.transferFirmManager,
      LEGAL_ROLE_COORDINATION_ACTORS.bondOriginator,
      LEGAL_ROLE_COORDINATION_ACTORS.agent,
      LEGAL_ROLE_COORDINATION_ACTORS.principal,
      LEGAL_ROLE_COORDINATION_ACTORS.admin,
    ],
    formalInstructors: [LEGAL_ROLE_COORDINATION_ACTORS.newLendingBank],
    appointmentEvidenceRequiredForInvite: true,
    acceptedTransferInstructionRequiredForInvite: true,
  }),
})

const S = LEGAL_ROLE_COORDINATION_STATES

const SHARED_TRANSITIONS = Object.freeze({
  [S.notRequired]: Object.freeze([S.awaitingTrigger]),
  [S.appointmentCaptured]: Object.freeze([S.invitePending, S.replacementRequired]),
  [S.invitePending]: Object.freeze([S.inviteSent, S.replacementRequired]),
  [S.inviteSent]: Object.freeze([S.inviteAccepted, S.declined, S.replacementRequired, S.invitePending]),
  [S.inviteAccepted]: Object.freeze([S.instructionConfirmed, S.declined, S.replacementRequired]),
  [S.instructionConfirmed]: Object.freeze([S.active, S.declined, S.replacementRequired]),
  [S.active]: Object.freeze([S.completed, S.replacementRequired]),
  [S.declined]: Object.freeze([S.replacementRequired]),
  [S.completed]: Object.freeze([]),
})

function buildTransitionMatrix({ appointmentWaitingState }) {
  return Object.freeze({
    ...SHARED_TRANSITIONS,
    [S.awaitingTrigger]: Object.freeze([appointmentWaitingState, S.appointmentCaptured]),
    [appointmentWaitingState]: Object.freeze([S.appointmentCaptured]),
    [S.replacementRequired]: Object.freeze([appointmentWaitingState, S.appointmentCaptured]),
  })
}

export const LEGAL_ROLE_TRANSITION_MATRIX = Object.freeze({
  [LEGAL_ROLE_TYPES.transferAttorney]: buildTransitionMatrix({ appointmentWaitingState: S.awaitingAppointment }),
  [LEGAL_ROLE_TYPES.bondAttorney]: buildTransitionMatrix({ appointmentWaitingState: S.awaitingBankAppointment }),
  [LEGAL_ROLE_TYPES.cancellationAttorney]: buildTransitionMatrix({ appointmentWaitingState: S.awaitingBankAppointment }),
})

const STATE_DIMENSION_MAP = Object.freeze({
  [S.notRequired]: LEGAL_ROLE_COORDINATION_DIMENSIONS.requirement,
  [S.awaitingTrigger]: LEGAL_ROLE_COORDINATION_DIMENSIONS.requirement,
  [S.awaitingAppointment]: LEGAL_ROLE_COORDINATION_DIMENSIONS.appointment,
  [S.awaitingBankAppointment]: LEGAL_ROLE_COORDINATION_DIMENSIONS.appointment,
  [S.appointmentCaptured]: LEGAL_ROLE_COORDINATION_DIMENSIONS.appointment,
  [S.invitePending]: LEGAL_ROLE_COORDINATION_DIMENSIONS.platformInvitation,
  [S.inviteSent]: LEGAL_ROLE_COORDINATION_DIMENSIONS.platformInvitation,
  [S.inviteAccepted]: LEGAL_ROLE_COORDINATION_DIMENSIONS.platformInvitation,
  [S.instructionConfirmed]: LEGAL_ROLE_COORDINATION_DIMENSIONS.legalInstruction,
  [S.active]: LEGAL_ROLE_COORDINATION_DIMENSIONS.matter,
  [S.declined]: LEGAL_ROLE_COORDINATION_DIMENSIONS.matter,
  [S.replacementRequired]: LEGAL_ROLE_COORDINATION_DIMENSIONS.appointment,
  [S.completed]: LEGAL_ROLE_COORDINATION_DIMENSIONS.matter,
})

export function normalizeLegalRoleType(value, fallback = '') {
  return ROLE_ALIASES[normalizeKey(value)] || fallback
}

export function normalizeLegalRoleCoordinationActor(value, fallback = '') {
  const normalized = normalizeKey(value)
  if (Object.values(LEGAL_ROLE_COORDINATION_ACTORS).includes(normalized)) return normalized
  return ACTOR_ALIASES[normalized] || fallback
}

export function isBankAppointedLegalRole(roleType) {
  return BANK_APPOINTED_LEGAL_ROLES.includes(normalizeLegalRoleType(roleType))
}

export function getLegalRoleAuthorityPolicy(roleType) {
  return LEGAL_ROLE_AUTHORITY_MATRIX[normalizeLegalRoleType(roleType)] || null
}

export function isLegalRoleAppointmentAuthority(roleType, actorRole) {
  const policy = getLegalRoleAuthorityPolicy(roleType)
  const actor = normalizeLegalRoleCoordinationActor(actorRole)
  return Boolean(policy && actor && policy.appointmentAuthorities.includes(actor))
}

export function isLegalRoleFormalInstructor(roleType, actorRole) {
  const policy = getLegalRoleAuthorityPolicy(roleType)
  const actor = normalizeLegalRoleCoordinationActor(actorRole)
  return Boolean(policy && actor && policy.formalInstructors.includes(actor))
}

export function evaluateLegalRoleInviteAuthority({
  targetRole,
  actorRole,
  appointmentEvidenceConfirmed = false,
  transferInstructionAccepted = false,
  isPrimaryTransferAttorney = false,
} = {}) {
  const normalizedRole = normalizeLegalRoleType(targetRole)
  const actor = normalizeLegalRoleCoordinationActor(actorRole)
  const policy = getLegalRoleAuthorityPolicy(normalizedRole)

  if (!policy || !actor) return { allowed: false, reason: 'invalid_role_or_actor' }
  if (!policy.primaryInviters.includes(actor) && !policy.fallbackInviters.includes(actor)) {
    return { allowed: false, reason: 'actor_not_authorized' }
  }
  if (policy.appointmentEvidenceRequiredForInvite && !appointmentEvidenceConfirmed) {
    return { allowed: false, reason: 'appointment_evidence_required' }
  }

  const isTransferCoordinator = [
    LEGAL_ROLE_COORDINATION_ACTORS.transferAttorney,
    LEGAL_ROLE_COORDINATION_ACTORS.transferFirmManager,
  ].includes(actor)

  if (policy.acceptedTransferInstructionRequiredForInvite && isTransferCoordinator && !transferInstructionAccepted) {
    return { allowed: false, reason: 'transfer_instruction_acceptance_required' }
  }
  if (actor === LEGAL_ROLE_COORDINATION_ACTORS.transferAttorney && !isPrimaryTransferAttorney) {
    return { allowed: false, reason: 'primary_transfer_attorney_required' }
  }

  return {
    allowed: true,
    reason: policy.primaryInviters.includes(actor) ? 'primary_inviter' : 'fallback_inviter',
  }
}

export function evaluateLegalRoleStaffAssignmentAuthority({
  actorRole,
  firmInviteAccepted = false,
  actorBelongsToAppointedFirm = false,
} = {}) {
  const actor = normalizeLegalRoleCoordinationActor(actorRole)
  if (actor !== LEGAL_ROLE_COORDINATION_ACTORS.appointedFirmManager) {
    return { allowed: false, reason: 'appointed_firm_manager_required' }
  }
  if (!firmInviteAccepted) {
    return { allowed: false, reason: 'firm_invite_acceptance_required' }
  }
  if (!actorBelongsToAppointedFirm) {
    return { allowed: false, reason: 'appointed_firm_membership_required' }
  }
  return { allowed: true, reason: 'appointed_firm_manager' }
}

export function getInitialLegalRoleCoordinationState(roleType, { required = true, triggerSatisfied = false } = {}) {
  const normalizedRole = normalizeLegalRoleType(roleType)
  if (!normalizedRole || !required) return S.notRequired
  if (!triggerSatisfied) return S.awaitingTrigger
  return isBankAppointedLegalRole(normalizedRole) ? S.awaitingBankAppointment : S.awaitingAppointment
}

export function getLegalRoleCoordinationStateDimension(state) {
  return STATE_DIMENSION_MAP[normalizeKey(state)] || null
}

export function getAllowedLegalRoleStateTransitions(roleType, currentState) {
  const normalizedRole = normalizeLegalRoleType(roleType)
  const normalizedState = normalizeKey(currentState)
  return LEGAL_ROLE_TRANSITION_MATRIX[normalizedRole]?.[normalizedState] || Object.freeze([])
}

export function canTransitionLegalRoleCoordinationState(roleType, currentState, nextState) {
  const normalizedNextState = normalizeKey(nextState)
  return getAllowedLegalRoleStateTransitions(roleType, currentState).includes(normalizedNextState)
}
