import { normalizeAppRole } from './roles'
import { FEATURE_FLAGS } from './featureFlags'
import { can } from '../auth/permissions/permissionResolver'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import { inferWorkspaceTypeFromAppRole, normalizeWorkspaceType } from '../constants/workspaceTypes'

const ADMIN_MEMBERSHIP_ROLES = new Set(['owner', 'super_admin', 'principal', 'admin', 'branch_manager'])

export function normalizeOrganisationMembershipRole(value, options = {}) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'viewer'
  if (normalized === 'administrator') return 'admin'
  if (normalized === 'owner') return 'owner'
  if (normalized === 'superadmin') return 'super_admin'
  if (normalized === 'branch_admin') return 'branch_manager'
  if (normalized === 'branch manager') return 'branch_manager'
  if (normalized === 'principal / owner') {
    const appRole = normalizeAppRole(options.appRole || options.app_role || '')
    const workspaceType = normalizeWorkspaceType(
      options.workspaceType || options.workspace_type,
      inferWorkspaceTypeFromAppRole(appRole),
    )
    return workspaceType && workspaceType !== 'agency' ? 'owner' : 'principal'
  }
  return normalized
}

export function isOrganisationAdminMembershipRole(value) {
  return ADMIN_MEMBERSHIP_ROLES.has(normalizeOrganisationMembershipRole(value))
}

export function canViewOrganisationSettings({ appRole } = {}) {
  return normalizeAppRole(appRole) !== 'client'
}

export function canManageOrganisationSettings({ appRole, membershipRole, workspaceType } = {}) {
  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return normalizeAppRole(appRole) !== 'client'
  }
  const normalizedAppRole = normalizeAppRole(appRole)
  const resolvedWorkspaceType = normalizeWorkspaceType(workspaceType, inferWorkspaceTypeFromAppRole(normalizedAppRole))
  return can(PERMISSIONS.manageWorkspaceSettings, {
    appRole: normalizedAppRole,
    organisationRole: membershipRole,
    workspaceType: resolvedWorkspaceType,
    membershipStatus: 'active',
    currentMembership: {
      id: 'legacy-access-check',
      role: membershipRole,
      status: 'active',
      workspaceType: resolvedWorkspaceType,
      workspaceId: 'legacy-access-check',
      workspace: { id: 'legacy-access-check', type: resolvedWorkspaceType },
    },
  })
}

export function canManageOrganisationMembers({ appRole, membershipRole, workspaceType } = {}) {
  const normalizedAppRole = normalizeAppRole(appRole)
  const resolvedWorkspaceType = normalizeWorkspaceType(workspaceType, inferWorkspaceTypeFromAppRole(normalizedAppRole))
  return can(PERMISSIONS.manageUsers, {
    appRole: normalizedAppRole,
    organisationRole: membershipRole,
    workspaceType: resolvedWorkspaceType,
    membershipStatus: 'active',
    currentMembership: {
      id: 'legacy-access-check',
      role: membershipRole,
      status: 'active',
      workspaceType: resolvedWorkspaceType,
      workspaceId: 'legacy-access-check',
      workspace: { id: 'legacy-access-check', type: resolvedWorkspaceType },
    },
  })
}

export function getWorkspaceAdministratorLabel({ appRole, workspaceType } = {}) {
  const normalizedAppRole = normalizeAppRole(appRole)
  const resolvedWorkspaceType = normalizeWorkspaceType(workspaceType, inferWorkspaceTypeFromAppRole(normalizedAppRole))
  if (resolvedWorkspaceType === 'developer_company') return 'owner-level administrators'
  if (resolvedWorkspaceType === 'bond_originator') return 'HQ administrators'
  if (resolvedWorkspaceType === 'attorney_firm') return 'firm administrators'
  return 'Principal-level administrators'
}

export function canAccessPrincipalExperience({ appRole, membershipRole } = {}) {
  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return normalizeAppRole(appRole) !== 'client'
  }
  if (normalizeAppRole(appRole) !== 'agent') return false
  return isOrganisationAdminMembershipRole(membershipRole)
}
