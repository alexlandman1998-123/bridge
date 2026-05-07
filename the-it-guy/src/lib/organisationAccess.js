import { normalizeAppRole } from './roles'

const ADMIN_MEMBERSHIP_ROLES = new Set(['super_admin', 'principal', 'admin'])

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
  const normalizedAppRole = normalizeAppRole(appRole)
  if (normalizedAppRole === 'developer') return true
  if (normalizedAppRole !== 'agent') return false
  return isOrganisationAdminMembershipRole(membershipRole)
}

export function canManageOrganisationMembers({ appRole, membershipRole } = {}) {
  return canManageOrganisationSettings({ appRole, membershipRole })
}

export function canAccessPrincipalExperience({ appRole, membershipRole } = {}) {
  if (normalizeAppRole(appRole) !== 'agent') return false
  return isOrganisationAdminMembershipRole(membershipRole)
}

