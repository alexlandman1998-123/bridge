export const MOBILE_DESKTOP_PREFERENCE_KEY = 'arch9_prefer_desktop_mobile'
export const MOBILE_DESKTOP_PREFERENCE_TTL_MS = 2 * 60 * 60 * 1000

function getStorage() {
  if (typeof window === 'undefined') return null
  return window.localStorage || null
}

function safeRemovePreference() {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(MOBILE_DESKTOP_PREFERENCE_KEY)
  } catch {
    // Ignore storage failures, such as private browsing restrictions.
  }
}

export function userPrefersDesktopOnMobile() {
  const storage = getStorage()
  if (!storage) return false

  try {
    const rawValue = storage.getItem(MOBILE_DESKTOP_PREFERENCE_KEY)
    if (!rawValue) return false

    if (rawValue === 'true') {
      safeRemovePreference()
      return false
    }

    const parsed = JSON.parse(rawValue)
    if (!parsed?.preferDesktop) {
      safeRemovePreference()
      return false
    }

    const expiresAt = Number(parsed.expiresAt || 0)
    if (expiresAt && expiresAt <= Date.now()) {
      safeRemovePreference()
      return false
    }

    return true
  } catch {
    safeRemovePreference()
    return false
  }
}

export function setPreferDesktopOnMobile(preferDesktop, { ttlMs = MOBILE_DESKTOP_PREFERENCE_TTL_MS } = {}) {
  const storage = getStorage()
  if (!storage) return

  if (preferDesktop) {
    const now = Date.now()
    try {
      storage.setItem(
        MOBILE_DESKTOP_PREFERENCE_KEY,
        JSON.stringify({
          preferDesktop: true,
          createdAt: now,
          expiresAt: now + Math.max(Number(ttlMs) || MOBILE_DESKTOP_PREFERENCE_TTL_MS, 60 * 1000),
        }),
      )
    } catch {
      // Ignore storage failures; the desktop fallback will still work for the current navigation.
    }
    return
  }

  safeRemovePreference()
}
