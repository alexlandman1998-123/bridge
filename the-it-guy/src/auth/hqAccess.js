export const HQ_ACCESS_ROLES = Object.freeze(['founder', 'super_admin'])

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function collectRoleTokens(source = {}) {
  const tokens = []
  const singleValueKeys = [
    'role',
    'appRole',
    'app_role',
    'systemRole',
    'system_role',
    'workspaceRole',
    'workspace_role',
    'organisationRole',
    'organisation_role',
    'membershipRole',
    'membership_role',
    'rawRole',
    'raw_role',
  ]
  const arrayValueKeys = ['roles', 'permissions', 'permissionKeys', 'permission_keys']

  for (const key of singleValueKeys) {
    const token = normalizeToken(source?.[key])
    if (token) tokens.push(token)
  }

  for (const key of arrayValueKeys) {
    const values = Array.isArray(source?.[key]) ? source[key] : []
    for (const value of values) {
      const token = normalizeToken(value)
      if (token) tokens.push(token)
    }
  }

  return tokens
}

export function canAccessHQ(context = {}) {
  const tokens = [
    ...collectRoleTokens(context),
    ...collectRoleTokens(context.profile),
    ...collectRoleTokens(context.authState?.profile),
    ...collectRoleTokens(context.currentMembership),
    ...collectRoleTokens(context.membership),
  ]
  return tokens.some((token) => HQ_ACCESS_ROLES.includes(token))
}

export function assertFounderAccess(context = {}) {
  if (canAccessHQ(context)) return true
  const error = new Error('Founder HQ access is required.')
  error.code = 'permission_denied'
  error.status = 403
  throw error
}

