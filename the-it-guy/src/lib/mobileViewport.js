import { isMobileViewport as isPhoneViewport } from './deviceDetection'

export function isMobileViewport(viewportWidth = null) {
  return isPhoneViewport(viewportWidth)
}
