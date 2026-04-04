import { INTERNAL_APP_ROLES, normalizeAppRole } from './roles'
import { getDevBypassUserId } from './demoIds'

export const DEV_AUTH_STORAGE_KEY = 'itg:dev-auth-role'

export function getStoredDevAuthRole() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return null
  }

  const storedValue = normalizeAppRole(window.localStorage.getItem(DEV_AUTH_STORAGE_KEY))
  return INTERNAL_APP_ROLES.includes(storedValue) && storedValue !== 'client' ? storedValue : null
}

export function setStoredDevAuthRole(role) {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return
  }

  const normalizedRole = normalizeAppRole(role)
  if (!INTERNAL_APP_ROLES.includes(normalizedRole) || normalizedRole === 'client') {
    window.localStorage.removeItem(DEV_AUTH_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(DEV_AUTH_STORAGE_KEY, normalizedRole)
}

export function clearStoredDevAuthRole() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(DEV_AUTH_STORAGE_KEY)
}

export function createDevAuthSession(role) {
  const normalizedRole = normalizeAppRole(role)

  return {
    access_token: 'dev-bypass-token',
    refresh_token: 'dev-bypass-refresh-token',
    expires_in: 60 * 60 * 24,
    token_type: 'bearer',
    user: {
      id: getDevBypassUserId(normalizedRole),
      email: `${normalizedRole.replace(/_/g, '.')}@bridge.local`,
      app_metadata: { provider: 'dev-bypass' },
      user_metadata: {
        first_name: 'Demo',
        last_name: 'User',
        full_name: 'Demo User',
      },
    },
  }
}
