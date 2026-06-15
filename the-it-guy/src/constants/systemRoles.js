export const SYSTEM_ROLES = Object.freeze({
  professional: 'professional',
  client: 'client',
  admin: 'admin',
  superAdmin: 'super_admin',
  founder: 'founder',
})

export const SYSTEM_ROLE_VALUES = Object.freeze(Object.values(SYSTEM_ROLES))

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

export function normalizeSystemRole(value = '', fallback = '') {
  const normalized = normalizeKey(value)
  if (SYSTEM_ROLE_VALUES.includes(normalized)) return normalized
  if (normalized === 'founder_user') return SYSTEM_ROLES.founder
  if (normalized === 'platform_admin' || normalized === 'admin_user') return SYSTEM_ROLES.admin
  if (normalized === 'superadmin' || normalized === 'super_admin_user') return SYSTEM_ROLES.superAdmin
  if (normalized === 'buyer' || normalized === 'seller') return SYSTEM_ROLES.client
  if (['agent', 'developer', 'attorney', 'bond_originator', 'professional_user'].includes(normalized)) {
    return SYSTEM_ROLES.professional
  }
  return fallback
}
