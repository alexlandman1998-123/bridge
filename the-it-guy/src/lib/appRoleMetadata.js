import {
  DEFAULT_APP_ROLE,
  TRANSITIONAL_APP_ROLE_VALUES,
  normalizeCanonicalAppRole,
} from '../constants/appRoles'

export { DEFAULT_APP_ROLE }

export const APP_ROLES = TRANSITIONAL_APP_ROLE_VALUES
export const INTERNAL_APP_ROLES = TRANSITIONAL_APP_ROLE_VALUES

export const APP_ROLE_LABELS = {
  developer: 'Developer',
  agent: 'Agent',
  attorney: 'Attorney / Conveyancer',
  bond_originator: 'Bond Originator',
  client: 'Client / Buyer',
  platform_admin: 'Platform Admin',
  viewer: 'Viewer',
}

export function normalizeAppRole(value) {
  return normalizeCanonicalAppRole(value, DEFAULT_APP_ROLE)
}

export function isInternalAppRole(value) {
  return INTERNAL_APP_ROLES.includes(normalizeAppRole(value))
}
