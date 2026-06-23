import { resolveMobileRoleCategory } from '../config/mobileShell.js'

const MOBILE_ENABLED_ROLES = new Set(['agent', 'principal', 'attorney', 'bond_originator', 'commercial'])

export function userCanAccessMobile(userContext = {}) {
  const role = String(userContext.role || userContext.baseRole || userContext.appRole || userContext.profile?.role || '').trim().toLowerCase()
  if (role === 'client') return false
  const category = resolveMobileRoleCategory(userContext)
  return MOBILE_ENABLED_ROLES.has(category)
}

export function getDesktopLandingRoute(userContext = {}) {
  const category = resolveMobileRoleCategory(userContext)
  const role = String(userContext.role || userContext.baseRole || userContext.appRole || userContext.profile?.role || '').trim().toLowerCase()
  if (category === 'commercial') return '/commercial'
  if (category === 'attorney' || role === 'attorney') return '/attorney/dashboard'
  if (category === 'bond_originator' || role === 'bond_originator') return '/dashboard'
  return '/dashboard'
}
