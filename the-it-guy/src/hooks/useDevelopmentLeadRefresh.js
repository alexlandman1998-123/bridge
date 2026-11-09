import { useEffect, useRef } from 'react'

// Notifications contain no buyer details. Always re-read using the screen's
// current workspace permissions, including when another tab changes a lead.
export default function useDevelopmentLeadRefresh(onRefresh, scopeKey, enabled = true) {
  const refreshRef = useRef(onRefresh)
  useEffect(() => { refreshRef.current = onRefresh }, [onRefresh])
  useEffect(() => {
    if (!enabled || !scopeKey) return undefined
    let timer
    const refresh = () => {
      window.clearTimeout(timer)
      if (document.visibilityState === 'hidden') return
      timer = window.setTimeout(() => { void Promise.resolve(refreshRef.current?.()).catch(() => {}) }, 180)
    }
    const storage = event => { if (event.key === 'bridge:buyer-lifecycle-refresh:v1') refresh() }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('itg:developer-leads-changed', refresh)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('itg:developer-leads-changed', refresh)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [enabled, scopeKey])
}
