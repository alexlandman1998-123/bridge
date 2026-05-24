export const APP_ROLES = Object.freeze({
  agent: 'agent',
  developer: 'developer',
  attorney: 'attorney',
  bondOriginator: 'bond_originator',
  client: 'client',
  platformAdmin: 'platform_admin',
})

export const LEGACY_RECOVERY_APP_ROLE = 'viewer'

export const CANONICAL_APP_ROLE_VALUES = Object.freeze(Object.values(APP_ROLES))
export const TRANSITIONAL_APP_ROLE_VALUES = Object.freeze([
  ...CANONICAL_APP_ROLE_VALUES,
  LEGACY_RECOVERY_APP_ROLE,
])

export const DEFAULT_APP_ROLE = LEGACY_RECOVERY_APP_ROLE

export function normalizeCanonicalAppRole(value, fallback = DEFAULT_APP_ROLE) {
  const normalized = String(value || '').trim().toLowerCase()
  if (TRANSITIONAL_APP_ROLE_VALUES.includes(normalized)) return normalized
  if (normalized === 'buyer' || normalized === 'seller') return APP_ROLES.client
  if (normalized === 'bond-originator') return APP_ROLES.bondOriginator
  if (normalized === 'platform_admin' || normalized === 'platform-admin') return APP_ROLES.platformAdmin
  return fallback
}

export function isCanonicalAppRole(value) {
  return CANONICAL_APP_ROLE_VALUES.includes(normalizeCanonicalAppRole(value, ''))
}
