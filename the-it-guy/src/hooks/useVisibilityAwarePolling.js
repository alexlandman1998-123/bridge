import { useEffect, useRef } from 'react'
import {
  DEFAULT_FOREGROUND_REFRESH_MIN_INTERVAL_MS,
  shouldRunBackgroundRefresh,
} from './backgroundRefreshPolicy.js'

export default function useVisibilityAwarePolling(
  callback,
  {
    enabled = true,
    intervalMs,
    minForegroundIntervalMs = DEFAULT_FOREGROUND_REFRESH_MIN_INTERVAL_MS,
    label = 'background-refresh',
  } = {},
) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const configuredIntervalMs = Number(intervalMs)
    if (!enabled || !Number.isFinite(configuredIntervalMs) || configuredIntervalMs <= 0 || typeof window === 'undefined') return undefined
    const normalizedIntervalMs = Math.max(30_000, configuredIntervalMs)

    let active = true
    let inFlight = false
    let lastRunAt = Date.now()

    const run = async (reason, { force = false } = {}) => {
      if (!active || inFlight) return false
      const now = Date.now()
      if (!shouldRunBackgroundRefresh({
        visibilityState: document.visibilityState,
        now,
        lastRunAt,
        minIntervalMs: minForegroundIntervalMs,
        force,
      })) return false

      inFlight = true
      lastRunAt = now
      try {
        await callbackRef.current?.({ reason })
        return true
      } catch (error) {
        console.warn(`[${label}] refresh failed`, error)
        return false
      } finally {
        inFlight = false
      }
    }

    const intervalId = window.setInterval(() => {
      void run('interval')
    }, normalizedIntervalMs)
    const handleFocus = () => void run('window_focus')
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void run('visibility_restored')
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, intervalMs, label, minForegroundIntervalMs])
}
