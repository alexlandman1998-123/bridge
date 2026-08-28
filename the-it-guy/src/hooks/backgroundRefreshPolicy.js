export const BACKGROUND_REFRESH_INTERVALS = Object.freeze({
  notifications: 5 * 60 * 1000,
  externalPortal: 60 * 1000,
  agencyCalendar: 3 * 60 * 1000,
  commandCenter: 5 * 60 * 1000,
})

export const DEFAULT_FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30 * 1000

export function shouldRunBackgroundRefresh({
  visibilityState = 'visible',
  now = Date.now(),
  lastRunAt = 0,
  minIntervalMs = DEFAULT_FOREGROUND_REFRESH_MIN_INTERVAL_MS,
  force = false,
} = {}) {
  if (visibilityState !== 'visible') return false
  if (force) return true
  const minimum = Math.max(0, Number(minIntervalMs) || 0)
  return Number(now) - Number(lastRunAt || 0) >= minimum
}
