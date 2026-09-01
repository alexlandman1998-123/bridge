export const ADMIN_LEVELS = {
  EXECUTIVE: 'executive',
  CUSTOMER_SUPPORT: 'customer_support',
}

const ADMIN_LEVEL_LABELS = {
  [ADMIN_LEVELS.EXECUTIVE]: 'Executive Level',
  [ADMIN_LEVELS.CUSTOMER_SUPPORT]: 'Customer Support Level',
}

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

// The database is the authorization boundary. Do not infer access from the
// browser session, user_metadata, or a writable profile row: each can be
// controlled by the signed-in user. arch9_admin_access_level returns a level
// derived from trusted auth.app_metadata only.
export function resolveAdminAccess(access = {}) {
  const level = normalizeToken(access?.level)
  const tokens = collectTokens({ roles: access?.roles })
  const allowedLevel = level === ADMIN_LEVELS.EXECUTIVE || level === ADMIN_LEVELS.CUSTOMER_SUPPORT

  return {
    allowed: allowedLevel,
    level: allowedLevel ? level : '',
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
