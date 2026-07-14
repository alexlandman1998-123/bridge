function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
}

export function shouldCreateAttorneyAssignmentForSelection(selection = {}) {
  const assignmentStatus = normalizeKey(selection.assignmentStatus || selection.assignment_status || selection.status)
  const activationTrigger = normalizeKey(selection.activationTrigger || selection.activation_trigger)

  if (!assignmentStatus && !activationTrigger) return true
  if (assignmentStatus === 'active') return true
  if (activationTrigger === 'immediate') return true
  return !['selected', 'pending', 'awaiting_activation'].includes(assignmentStatus)
}

export function shouldActivateAttorneyRoleplayerAtSignedOtp(roleplayer = {}, { bondActivationRequested = false } = {}) {
  const roleType = normalizeKey(roleplayer.roleType || roleplayer.role_type)
  const assignmentStatus = normalizeKey(
    roleplayer.assignmentStatus || roleplayer.assignment_status || roleplayer.status,
  )

  if (['removed', 'declined', 'rejected', 'replaced'].includes(assignmentStatus)) return false
  if (roleType === 'transfer_attorney') return true
  if (roleType === 'bond_attorney') return Boolean(bondActivationRequested)
  return false
}

