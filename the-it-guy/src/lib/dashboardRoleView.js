import { canAccessPrincipalExperience } from './organisationAccess'

function normalizeMembershipRole(value) {
  return String(value || '').trim().toLowerCase() || 'viewer'
}

export function resolveAgentDashboardViewMode({
  appRole = '',
  hydratedMembershipRole = '',
  fallbackMembershipRole = '',
} = {}) {
  const membershipRole = normalizeMembershipRole(
    hydratedMembershipRole || fallbackMembershipRole || 'viewer',
  )
  const isPrincipal = canAccessPrincipalExperience({
    appRole,
    membershipRole,
  })

  return {
    membershipRole,
    mode: String(appRole || '').trim().toLowerCase() === 'agent' && isPrincipal
      ? 'principal'
      : 'agent',
  }
}
