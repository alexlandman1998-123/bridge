// Agency access has two tiers. Descriptive job titles never grant authority.
export const AGENCY_OPERATIONS_OPEN = false
export function isAgencySeniorRole(role = '') {
  return ['owner', 'principal'].includes(String(role || '').trim().toLowerCase())
}

export function hasOpenAgencyOperations({ workspaceType = '', appRole = '', membershipStatus = '', hasActiveMembership = false, organisationRole = '', membershipRole = '', role = '', authorityRole = '' } = {}) {
  const type = String(workspaceType || '').trim().toLowerCase()
  const isAgency = ['agency', 'residential'].includes(type) || (!type && appRole === 'agent')
  const active = hasActiveMembership || ['active', 'accepted'].includes(String(membershipStatus || '').trim().toLowerCase())
  return isAgency && active && isAgencySeniorRole(organisationRole || membershipRole || authorityRole || role)
}

export function hasOpenAgencyContext(context = {}) {
  return hasOpenAgencyOperations({
    workspaceType: context.organisation?.type || context.workspaceType,
    appRole: context.profile?.role || context.appRole,
    membershipStatus: context.membershipStatus || context.membership?.membership_status || context.membership?.status,
    membershipRole: context.membershipRole || context.membership?.workspace_role || context.membership?.role,
  })
}
