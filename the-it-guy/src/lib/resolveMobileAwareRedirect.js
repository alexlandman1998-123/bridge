import { mapDesktopRouteToMobile, isPortalOrPublicRoute } from '../config/mobileRouteMappings'
import { getDesktopLandingRoute, userCanAccessMobile } from './mobileAccess'

export const POST_LOGIN_REDIRECT_STORAGE_KEY = 'arch9_post_login_redirect'

function normalizePath(path = '') {
  const value = String(path || '').trim()
  if (!value || !value.startsWith('/')) return '/dashboard'
  if (value.startsWith('//')) return '/dashboard'
  return value
}

export function storePostLoginRedirect(path = '') {
  if (typeof window === 'undefined') return
  const normalized = normalizePath(path)
  if (isPortalOrPublicRoute(normalized) && normalized.startsWith('/auth')) return
  window.sessionStorage.setItem(POST_LOGIN_REDIRECT_STORAGE_KEY, normalized)
}

export function getPostLoginRedirect(fallback = '/dashboard') {
  if (typeof window === 'undefined') return normalizePath(fallback)
  return normalizePath(window.sessionStorage.getItem(POST_LOGIN_REDIRECT_STORAGE_KEY) || fallback)
}

export function clearPostLoginRedirect() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_STORAGE_KEY)
}

export function resolveMobileAwareRedirect({
  intendedPath = '/dashboard',
  user = {},
  deviceType = 'desktop',
  featureFlags = {},
  userPreference = {},
} = {}) {
  const intended = normalizePath(intendedPath)
  const mobileShellEnabled = Boolean(featureFlags.enableMobileShell)
  const mobileRedirectEnabled = Boolean(featureFlags.enableMobileLoginRedirect)
  const preferDesktopOnMobile = Boolean(userPreference.preferDesktopOnMobile)
  const canAccessMobile = userCanAccessMobile(user)
  const desktopLanding = getDesktopLandingRoute(user)

  if (intended.startsWith('/mobile')) {
    if (!mobileShellEnabled || !canAccessMobile) return desktopLanding
    return intended
  }

  if (isPortalOrPublicRoute(intended)) return intended

  if (!mobileShellEnabled || !mobileRedirectEnabled || deviceType !== 'mobile' || !canAccessMobile || preferDesktopOnMobile) {
    return intended
  }

  return mapDesktopRouteToMobile(intended)
}
