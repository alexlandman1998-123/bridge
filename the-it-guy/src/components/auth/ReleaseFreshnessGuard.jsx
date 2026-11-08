import { useEffect } from 'react'

const RELEASE_REFRESH_STORAGE_PREFIX = 'arch9:release-refresh'

function getLoadedReleaseId() {
  if (typeof document === 'undefined') return ''
  return String(document.querySelector('meta[name="arch9-release"]')?.getAttribute('content') || '').trim()
}

function buildReleaseRefreshUrl() {
  if (typeof window === 'undefined') return ''
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('arch9_release_refresh', String(Date.now()))
    return url.toString()
  } catch {
    const separator = window.location.href.includes('?') ? '&' : '?'
    return `${window.location.href}${separator}arch9_release_refresh=${Date.now()}`
  }
}

export default function ReleaseFreshnessGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let cancelled = false
    let timerId = null
    let inFlight = false
    const controller = new AbortController()

    async function checkReleaseFreshness() {
      if (cancelled || inFlight || document.visibilityState === 'hidden' || navigator.onLine === false) return
      const loadedReleaseId = getLoadedReleaseId()
      if (!loadedReleaseId) return
      inFlight = true
      try {
        const response = await fetch(`/release-manifest.json?release_check=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) return
        const manifest = await response.json()
        const latestReleaseId = String(manifest?.releaseId || '').trim()
        if (!latestReleaseId || latestReleaseId === loadedReleaseId || cancelled) return
        const refreshKey = `${RELEASE_REFRESH_STORAGE_PREFIX}:${latestReleaseId}`
        try {
          if (window.sessionStorage?.getItem(refreshKey) === 'true') return
          window.sessionStorage?.setItem(refreshKey, 'true')
        } catch {
          // A single cache-busted reload is still safe if session storage is unavailable.
        }
        const nextUrl = buildReleaseRefreshUrl()
        window.location.replace(nextUrl || window.location.href)
      } catch (error) {
        if (!cancelled) console.debug('[RELEASE] freshness check skipped', error)
      } finally {
        inFlight = false
      }
    }

    void checkReleaseFreshness()
    timerId = window.setInterval(() => {
      void checkReleaseFreshness()
    }, 60000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkReleaseFreshness()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleVisibilityChange)

    return () => {
      cancelled = true
      controller.abort()
      window.removeEventListener('online', handleVisibilityChange)
      if (timerId) window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}

