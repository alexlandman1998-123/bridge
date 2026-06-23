export const MOBILE_DESKTOP_PREFERENCE_KEY = 'arch9_prefer_desktop_mobile'

export function userPrefersDesktopOnMobile() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(MOBILE_DESKTOP_PREFERENCE_KEY) === 'true'
}

export function setPreferDesktopOnMobile(preferDesktop) {
  if (typeof window === 'undefined') return
  if (preferDesktop) {
    window.localStorage.setItem(MOBILE_DESKTOP_PREFERENCE_KEY, 'true')
    return
  }
  window.localStorage.removeItem(MOBILE_DESKTOP_PREFERENCE_KEY)
}
