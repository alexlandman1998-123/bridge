export const ADMIN_LEVELS = {
  EXECUTIVE: 'executive',
  CUSTOMER_SUPPORT: 'customer_support',
}

const ADMIN_LEVEL_LABELS = {
  [ADMIN_LEVELS.EXECUTIVE]: 'Executive Level',
  [ADMIN_LEVELS.CUSTOMER_SUPPORT]: 'Customer Support Level',
}

const EXECUTIVE_ROLE_TOKENS = new Set([
  'executive',
  'executive_level',
  'founder',
  'super_admin',
  'platform_admin',
  'internal_admin',
  'developer',
  'hq_staff',
  'admin',
])

const CUSTOMER_SUPPORT_ROLE_TOKENS = new Set([
  'customer_support',
  'customer_support_level',
  'support_agent',
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
  const level = tokens.some((token) => EXECUTIVE_ROLE_TOKENS.has(token))
    ? ADMIN_LEVELS.EXECUTIVE
    : tokens.some((token) => CUSTOMER_SUPPORT_ROLE_TOKENS.has(token))
      ? ADMIN_LEVELS.CUSTOMER_SUPPORT
      : ''

  return {
    allowed: Boolean(level),
    level,
    roles: Array.from(new Set(tokens)),
  }
}

export function formatAdminLevelLabel(value = '') {
  return ADMIN_LEVEL_LABELS[value] || 'No Admin Access'
}

export function formatRoleLabel(value = '') {
  return String(value || 'staff')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
