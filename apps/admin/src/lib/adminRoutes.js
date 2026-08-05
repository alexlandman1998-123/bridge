import { ADMIN_LEVELS } from './adminAccess.js'

export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', levels: [ADMIN_LEVELS.EXECUTIVE] },
  { id: 'support', label: 'Support', levels: [ADMIN_LEVELS.EXECUTIVE, ADMIN_LEVELS.CUSTOMER_SUPPORT] },
  { id: 'search', label: 'Search', levels: [ADMIN_LEVELS.EXECUTIVE, ADMIN_LEVELS.CUSTOMER_SUPPORT] },
  { id: 'settings', label: 'Settings', levels: [ADMIN_LEVELS.EXECUTIVE, ADMIN_LEVELS.CUSTOMER_SUPPORT] },
]

export function getDefaultView(level = '') {
  return level === ADMIN_LEVELS.CUSTOMER_SUPPORT ? 'support' : 'dashboard'
}

export function getAllowedAdminViews(level = '') {
  return ADMIN_NAV_ITEMS.filter((item) => item.levels.includes(level)).map((item) => item.id)
}

export function getViewFromPath(pathname = '', level = '') {
  const path = String(pathname || '')
  if (path.includes('/admin/support')) return 'support'
  if (path.includes('/admin/search')) return 'search'
  if (path.includes('/admin/settings')) return 'settings'
  return getDefaultView(level)
}

export function pathForView(viewId = 'dashboard') {
  if (viewId === 'support') return '/admin/support'
  if (viewId === 'search') return '/admin/search'
  if (viewId === 'settings') return '/admin/settings'
  return '/admin'
}

export function resolveAdminViewFromPath({ level = '', pathname = '' } = {}) {
  const requestedView = getViewFromPath(pathname, level)
  const allowedViews = getAllowedAdminViews(level)
  return allowedViews.includes(requestedView) ? requestedView : getDefaultView(level)
}
