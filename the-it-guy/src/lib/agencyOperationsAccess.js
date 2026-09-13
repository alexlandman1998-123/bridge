// Temporary launch policy: agency members collaborate without role ranks.
// Database policies enforce active membership in the same agency independently.
export const AGENCY_OPERATIONS_OPEN = true

export function hasOpenAgencyOperations({ workspaceType = '', appRole = '', membershipStatus = '', hasActiveMembership = false } = {}) {
  const type = String(workspaceType || '').trim().toLowerCase()
  const isAgency = ['agency', 'residential'].includes(type) || (!type && appRole === 'agent')
  const active = hasActiveMembership || ['active', 'accepted'].includes(String(membershipStatus || '').trim().toLowerCase())
  return AGENCY_OPERATIONS_OPEN && isAgency && active
}

export function hasOpenAgencyContext(context = {}) {
  return hasOpenAgencyOperations({
    workspaceType: context.organisation?.type || context.workspaceType,
    appRole: context.profile?.role || context.appRole,
    membershipStatus: context.membershipStatus || context.membership?.membership_status || context.membership?.status,
  })
}
