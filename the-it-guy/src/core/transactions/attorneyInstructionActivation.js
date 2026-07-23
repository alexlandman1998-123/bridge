function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
}

export const ATTORNEY_INSTRUCTION_ACTIVATION_LANES = Object.freeze({
  transfer_attorney: Object.freeze({
    roleType: 'transfer_attorney',
    legalRole: 'transfer',
    assignmentType: 'transfer',
    activationEventType: 'transfer_attorney_activated',
  }),
  bond_attorney: Object.freeze({
    roleType: 'bond_attorney',
    legalRole: 'bond',
    assignmentType: 'bond',
    activationEventType: 'bond_attorney_activated',
  }),
  cancellation_attorney: Object.freeze({
    roleType: 'cancellation_attorney',
    legalRole: 'cancellation',
    assignmentType: 'cancellation',
    activationEventType: 'cancellation_attorney_activated',
  }),
})

export function resolveAttorneyInstructionActivationLane(roleplayer = {}) {
  const roleType = normalizeKey(roleplayer.roleType || roleplayer.role_type)
  return ATTORNEY_INSTRUCTION_ACTIVATION_LANES[roleType] || null
}

export function shouldCreateAttorneyAssignmentForSelection(selection = {}) {
  const assignmentStatus = normalizeKey(selection.assignmentStatus || selection.assignment_status || selection.status)
  const activationTrigger = normalizeKey(selection.activationTrigger || selection.activation_trigger)

  if (!assignmentStatus && !activationTrigger) return true
  if (assignmentStatus === 'active') return true
  if (activationTrigger === 'immediate') return true
  return !['selected', 'pending', 'awaiting_activation'].includes(assignmentStatus)
}

export function shouldActivateAttorneyRoleplayerAtSignedOtp(
  roleplayer = {},
  { bondActivationRequested = false, cancellationActivationRequested = false } = {},
) {
  const lane = resolveAttorneyInstructionActivationLane(roleplayer)
  const assignmentStatus = normalizeKey(
    roleplayer.assignmentStatus || roleplayer.assignment_status || roleplayer.status,
  )

  if (['removed', 'declined', 'rejected', 'replaced'].includes(assignmentStatus)) return false
  if (lane?.roleType === 'transfer_attorney') return true
  if (lane?.roleType === 'bond_attorney') return Boolean(bondActivationRequested)
  if (lane?.roleType === 'cancellation_attorney') return Boolean(cancellationActivationRequested)
  return false
}
