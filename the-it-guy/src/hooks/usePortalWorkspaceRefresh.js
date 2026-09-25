import { useEffect, useRef, useState } from 'react'

/**
 * Refreshes a portal workspace only while it is visible and the browser is
 * online. It deliberately has no direct database subscription: portal reads
 * must continue through the authenticated workspace loader, which applies the
 * same access checks as the initial page load.
 */
export default function usePortalWorkspaceRefresh({
  enabled = true,
  onRefresh,
  pollingIntervalMs = 45_000,
  debounceMs = 350,
  scopeKey = '',
  refreshOnMount = false,
} = {}) {
  const refreshRef = useRef(onRefresh)
  const [status, setStatus] = useState({
    connectionState: 'idle',
    lastRefreshAt: null,
    lastRefreshReason: null,
    lastErrorAt: null,
    lastErrorMessage: '',
  })

  useEffect(() => { refreshRef.current = onRefresh }, [onRefresh])

  useEffect(() => {
    const canRefresh = () => enabled
      && document.visibilityState !== 'hidden'
      && navigator.onLine !== false
    setStatus({
      connectionState: enabled ? (navigator.onLine === false ? 'offline' : 'polling') : 'idle',
      lastRefreshAt: null,
      lastRefreshReason: null,
      lastErrorAt: null,
      lastErrorMessage: '',
    })
    if (!enabled) return undefined

    let active = true
    let inFlight = false
    let queuedReason = ''
    let debounceTimer = null
    const intervalMs = Math.max(15_000, Number(pollingIntervalMs) || 45_000)

    const refresh = async (reason) => {
      if (!canRefresh()) return
      if (inFlight) {
        queuedReason = reason
        return
      }
      inFlight = true
      try {
        const refreshed = await refreshRef.current?.({ reason })
        if (!active) return
        if (refreshed === false) {
          setStatus((previous) => ({
            ...previous,
            lastErrorAt: new Date().toISOString(),
            lastErrorMessage: 'Updates could not be refreshed. Retrying automatically.',
          }))
          return
        }
        setStatus((previous) => ({
          ...previous,
          connectionState: navigator.onLine === false ? 'offline' : 'polling',
          lastRefreshAt: new Date().toISOString(),
          lastRefreshReason: reason,
          lastErrorAt: null,
          lastErrorMessage: '',
        }))
      } catch {
        if (active) {
          setStatus((previous) => ({
            ...previous,
            lastErrorAt: new Date().toISOString(),
            lastErrorMessage: 'Updates could not be refreshed. Retrying automatically.',
          }))
        }
      } finally {
        inFlight = false
        const nextReason = queuedReason
        queuedReason = ''
        if (nextReason && active) void refresh(nextReason)
      }
    }

    const schedule = (reason) => {
      if (!canRefresh()) return
      if (debounceTimer) window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        void refresh(reason)
      }, Math.max(0, Number(debounceMs) || 0))
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') schedule('portal_visible')
    }
    const onOnline = () => {
      setStatus((previous) => ({ ...previous, connectionState: 'polling' }))
      schedule('portal_reconnected')
    }
    const onOffline = () => {
      setStatus((previous) => ({ ...previous, connectionState: 'offline' }))
    }
    const onFocus = () => schedule('portal_focused')

    if (refreshOnMount) schedule('portal_opened')
    const interval = window.setInterval(() => schedule('listing_poll'), intervalMs)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      if (debounceTimer) window.clearTimeout(debounceTimer)
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [debounceMs, enabled, pollingIntervalMs, refreshOnMount, scopeKey])

  return status
}
