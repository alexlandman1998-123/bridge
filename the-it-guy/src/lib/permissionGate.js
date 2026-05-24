import { can, resolvePermissionDenialMessage } from '../auth/permissions/permissionResolver'

export function canUser({
  capability = '',
  appRole = '',
  organisationRole = '',
  userId = '',
  isSuperAdmin = false,
  currentMembership = null,
  currentWorkspace = null,
  workspaceType = '',
  membershipStatus = '',
} = {}) {
  if (isSuperAdmin) return true
  return can(capability, {
    appRole,
    organisationRole,
    userId,
    currentMembership,
    currentWorkspace,
    workspaceType,
    membershipStatus,
  })
}

export function resolveCapabilityDenialMessage(capability = '') {
  return resolvePermissionDenialMessage(capability)
}
