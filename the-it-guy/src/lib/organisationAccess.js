import { normalizeAppRole } from './roles'
import { FEATURE_FLAGS } from './featureFlags'
import { can } from '../auth/permissions/permissionResolver'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import { inferWorkspaceTypeFromAppRole } from '../constants/workspaceTypes'

const ADMIN_MEMBERSHIP_ROLES = new Set(['super_admin', 'principal', 'admin', 'branch_manager'])

export function normalizeOrganisationMembershipRole(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'viewer'
  if (normalized === 'administrator') return 'admin'
  if (normalized === 'owner') return 'principal'
  if (normalized === 'superadmin') return 'super_admin'
  if (normalized === 'branch_admin') return 'branch_manager'
  if (normalized === 'branch manager') return 'branch_manager'
  if (normalized === 'principal / owner') return 'principal'
  return normalized
}

export function isOrganisationAdminMembershipRole(value) {
  return ADMIN_MEMBERSHIP_ROLES.has(normalizeOrganisationMembershipRole(value))
}

export function canViewOrganisationSettings({ appRole } = {}) {
  return normalizeAppRole(appRole) !== 'client'
}

export function canManageOrganisationSettings({ appRole, membershipRole } = {}) {
  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return normalizeAppRole(appRole) !== 'client'
  }
  const normalizedAppRole = normalizeAppRole(appRole)
  const workspaceType = inferWorkspaceTypeFromAppRole(normalizedAppRole)
  return can(PERMISSIONS.manageWorkspaceSettings, {
    appRole: normalizedAppRole,
    organisationRole: membershipRole,
    workspaceType,
    membershipStatus: 'active',
    currentMembership: {
      id: 'legacy-access-check',
      role: membershipRole,
      status: 'active',
      workspaceType,
      workspaceId: 'legacy-access-check',
      workspace: { id: 'legacy-access-check', type: workspaceType },
    },
  })
}

export function canManageOrganisationMembers({ appRole, membershipRole } = {}) {
  const normalizedAppRole = normalizeAppRole(appRole)
  const workspaceType = inferWorkspaceTypeFromAppRole(normalizedAppRole)
  return can(PERMISSIONS.manageUsers, {
    appRole: normalizedAppRole,
    organisationRole: membershipRole,
    workspaceType,
    membershipStatus: 'active',
    currentMembership: {
      id: 'legacy-access-check',
      role: membershipRole,
      status: 'active',
      workspaceType,
      workspaceId: 'legacy-access-check',
      workspace: { id: 'legacy-access-check', type: workspaceType },
    },
  })
}

export function canAccessPrincipalExperience({ appRole, membershipRole } = {}) {
  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return normalizeAppRole(appRole) !== 'client'
  }
  if (normalizeAppRole(appRole) !== 'agent') return false
  return isOrganisationAdminMembershipRole(membershipRole)
}
