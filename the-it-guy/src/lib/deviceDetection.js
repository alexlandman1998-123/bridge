export const MOBILE_VIEWPORT_MAX = 767
export const TABLET_VIEWPORT_MIN = 768
export const TABLET_VIEWPORT_MAX = 1023
export const DESKTOP_VIEWPORT_MIN = 1024

function getViewportWidth(width = null) {
  if (typeof width === 'number') return width
  if (typeof window === 'undefined') return DESKTOP_VIEWPORT_MIN
  return window.innerWidth
}

export function isMobileViewport(width = null) {
  return getViewportWidth(width) <= MOBILE_VIEWPORT_MAX
}

export function isTabletViewport(width = null) {
  const viewportWidth = getViewportWidth(width)
  return viewportWidth >= TABLET_VIEWPORT_MIN && viewportWidth <= TABLET_VIEWPORT_MAX
}

export function isDesktopViewport(width = null) {
  return getViewportWidth(width) >= DESKTOP_VIEWPORT_MIN
}

export function getDeviceType(width = null) {
  if (isMobileViewport(width)) return 'mobile'
  if (isTabletViewport(width)) return 'tablet'
  return 'desktop'
}
