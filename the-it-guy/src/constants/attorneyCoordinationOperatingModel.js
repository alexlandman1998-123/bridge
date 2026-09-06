export const ATTORNEY_COORDINATION_OPERATING_MODEL_VERSION = 'attorney-coordination-operating-model-phase0-v1'

export const ATTORNEY_COORDINATION_LANES = Object.freeze([
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
])

export const ATTORNEY_COORDINATION_ACTIONS = Object.freeze({
  nominateFirm: 'nominate_firm',
  acceptFirmInstruction: 'accept_firm_instruction',
  allocateFirmStaff: 'allocate_firm_staff',
  coordinateLane: 'coordinate_lane',
  updateLane: 'update_lane',
  reassignFirm: 'reassign_firm',
})

export const ATTORNEY_COORDINATION_DEFINITIONS = Object.freeze({
  nomination: 'Select or invite the external firm responsible for a transaction lane.',
  firmAcceptance: 'The nominated firm accepts responsibility for its transaction lane.',
  internalAllocation: 'The responsible firm assigns its own attorney and support staff after acceptance.',
  coordination: 'Request information, send reminders, and view shared progress without editing another lane.',
  delegation: 'A time-bounded, auditable grant allowing a named user to perform specified actions in another lane.',
  reassignment: 'Replace the responsible firm or attorney without overwriting the prior assignment history.',
})

export const ATTORNEY_COORDINATION_RULES = Object.freeze({
  sharedWorkspace: true,
  sharedTransactionSystemOfRecord: true,
  separateLaneCopiesAllowed: false,
  transferAttorneyMayNominateExternalFirms: Object.freeze([
    'bond_attorney',
    'cancellation_attorney',
  ]),
  nominatedFirmMustAccept: true,
  nominatedFirmAllocatesOwnStaff: true,
  transferAttorneyMayAllocateExternalFirmStaff: false,
  crossLaneViewUsesSharedVisibility: true,
  crossLaneUpdateRequiresExplicitDelegation: true,
  delegationMustPreserveActualActor: true,
  delegationMustBeMatterAndLaneScoped: true,
  delegationMustBeRevocableAndTimeBounded: true,
  reassignmentMustPreserveHistory: true,
})

const normalize = (value = '') => String(value || '').trim().toLowerCase()

export function evaluateAttorneyCoordinationAuthority({
  action = '',
  actorRole = '',
  actorFirmId = '',
  transferFirmId = '',
  targetRole = '',
  responsibleFirmId = '',
  hasActiveDelegation = false,
  canManageResponsibleFirm = false,
} = {}) {
  const requestedAction = normalize(action)
  const role = normalize(actorRole)
  const laneRole = normalize(targetRole)
  const actorFirm = normalize(actorFirmId)
  const transferFirm = normalize(transferFirmId)
  const responsibleFirm = normalize(responsibleFirmId)
  const isAssignedTransferAttorney = role === 'transfer_attorney' && actorFirm && actorFirm === transferFirm
  const belongsToResponsibleFirm = actorFirm && responsibleFirm && actorFirm === responsibleFirm

  if (!ATTORNEY_COORDINATION_LANES.includes(laneRole)) {
    return { allowed: false, reason: 'A valid attorney transaction lane is required.' }
  }

  if (requestedAction === ATTORNEY_COORDINATION_ACTIONS.nominateFirm) {
    const allowed = isAssignedTransferAttorney && ATTORNEY_COORDINATION_RULES.transferAttorneyMayNominateExternalFirms.includes(laneRole)
    return { allowed, reason: allowed ? 'The assigned transfer attorney may nominate the external lane firm.' : 'Only the assigned transfer attorney may nominate the bond or cancellation firm.' }
  }

  if (requestedAction === ATTORNEY_COORDINATION_ACTIONS.allocateFirmStaff) {
    const allowed = belongsToResponsibleFirm && canManageResponsibleFirm === true
    return { allowed, reason: allowed ? 'The responsible firm may allocate its own staff.' : 'Staff allocation belongs to an authorised manager of the responsible firm.' }
  }

  if (requestedAction === ATTORNEY_COORDINATION_ACTIONS.coordinateLane) {
    const allowed = isAssignedTransferAttorney || belongsToResponsibleFirm
    return { allowed, reason: allowed ? 'Coordination does not transfer lane ownership.' : 'The actor is not part of the coordinated legal team.' }
  }

  if (requestedAction === ATTORNEY_COORDINATION_ACTIONS.updateLane) {
    const ownsLane = role === laneRole && belongsToResponsibleFirm
    const delegated = hasActiveDelegation === true
    const allowed = ownsLane || delegated
    return { allowed, actingOnBehalf: !ownsLane && delegated, reason: allowed ? 'Lane update authority is present.' : 'Updating another lane requires an active explicit delegation.' }
  }

  if (requestedAction === ATTORNEY_COORDINATION_ACTIONS.acceptFirmInstruction) {
    const allowed = belongsToResponsibleFirm && canManageResponsibleFirm === true
    return { allowed, reason: allowed ? 'The nominated firm may accept its instruction.' : 'Only an authorised member of the nominated firm may accept the instruction.' }
  }

  if (requestedAction === ATTORNEY_COORDINATION_ACTIONS.reassignFirm) {
    const allowed = isAssignedTransferAttorney || canManageResponsibleFirm === true
    return { allowed, reason: allowed ? 'Reassignment is permitted and must retain history.' : 'The actor cannot reassign this lane.' }
  }

  return { allowed: false, reason: 'The requested coordination action is not recognised.' }
}
