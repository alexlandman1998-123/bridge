const ADMIN_ACCESS_ROLES = new Set([
  'founder',
  'super_admin',
  'platform_admin',
  'internal_admin',
  'developer',
  'hq_staff',
  'support_agent',
  'customer_support',
  'admin',
])

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function collectTokens(source = {}) {
  const tokens = []
  const singleKeys = [
    'role',
    'appRole',
    'app_role',
    'systemRole',
    'system_role',
    'workspaceRole',
    'workspace_role',
    'organisationRole',
    'organisation_role',
    'organizationRole',
    'organization_role',
  ]
  const arrayKeys = ['roles', 'permissions', 'permissionKeys', 'permission_keys']

  for (const key of singleKeys) {
    const token = normalizeToken(source?.[key])
    if (token) tokens.push(token)
  }

  for (const key of arrayKeys) {
    const values = Array.isArray(source?.[key]) ? source[key] : []
    for (const value of values) {
      const token = normalizeToken(value)
      if (token) tokens.push(token)
    }
  }

  return tokens
}

export function resolveAdminAccess({ user, profile } = {}) {
  const metadata = user?.app_metadata || {}
  const userMetadata = user?.user_metadata || {}
  const tokens = [
    ...collectTokens(metadata),
    ...collectTokens(userMetadata),
    ...collectTokens(profile),
    normalizeToken(profile?.raw_user_meta_data?.role),
  ].filter(Boolean)
  const allowed = tokens.some((token) => ADMIN_ACCESS_ROLES.has(token))

  return {
    allowed,
    roles: Array.from(new Set(tokens)),
  }
}

export function formatRoleLabel(value = '') {
  return String(value || 'staff')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
