import { useEffect, useRef } from 'react'

// Keep request ownership and the cooldown outside the effect lifetime. Lead
// snapshots change during rendering; that must never start another read.
export default function useSellerOnboardingCompletionPolling({ enabled, pollingKey, onPoll, intervalMs = 7000 }) {
  const callbackRef = useRef(onPoll)
  const requestRef = useRef({ inFlight: false, nextAllowedAt: 0 })

  useEffect(() => { callbackRef.current = onPoll })

  useEffect(() => {
    if (!enabled || !pollingKey) return
    let active = true
    let stopped = false
    let timer = null
    let controller = null
    const request = requestRef.current
    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
    }
    const schedule = (delay) => {
      clearTimer()
      if (active && !stopped) timer = window.setTimeout(() => { void poll() }, delay)
    }
    async function poll() {
      clearTimer()
      if (!active || stopped || document.visibilityState === 'hidden') return
      if (request.inFlight) {
        schedule(intervalMs)
        return
      }
      const remaining = request.nextAllowedAt - Date.now()
      if (remaining > 0) {
        schedule(remaining)
        return
      }
      request.inFlight = true
      request.nextAllowedAt = Date.now() + intervalMs
      controller = new AbortController()
      const signal = controller.signal
      const isCurrent = () => active && !signal.aborted
      try {
        const keepPolling = await callbackRef.current({ signal, isCurrent })
        if (isCurrent() && keepPolling === false) stopped = true
      } catch (error) {
        if (isCurrent()) console.warn('[PIPELINE] seller onboarding completion polling failed', error)
      } finally {
        request.inFlight = false
        request.nextAllowedAt = Date.now() + intervalMs
        controller = null
        if (active && !stopped) schedule(intervalMs)
      }
    }
    const reconcileWhenVisible = () => {
      if (document.visibilityState !== 'hidden') void poll()
    }
    void poll()
    window.addEventListener('focus', reconcileWhenVisible)
    document.addEventListener('visibilitychange', reconcileWhenVisible)
    return () => {
      active = false
      clearTimer()
      controller?.abort()
      window.removeEventListener('focus', reconcileWhenVisible)
      document.removeEventListener('visibilitychange', reconcileWhenVisible)
    }
  }, [enabled, pollingKey, intervalMs])
}
