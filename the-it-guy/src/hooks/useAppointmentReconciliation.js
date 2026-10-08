import { useCallback, useEffect, useState } from 'react'

// Bounded cross-device reconciliation without requiring a Realtime publication.
export default function useAppointmentReconciliation({ enabled = true, scopeKey = '', intervalMs = 30000 } = {}) {
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    if (!enabled) return undefined
    let pending
    const refresh = () => {
      clearTimeout(pending)
      pending = setTimeout(reload, 100)
    }
    const visibleRefresh = () => { if (document.visibilityState !== 'hidden') refresh() }
    const timer = setInterval(visibleRefresh, intervalMs)
    window.addEventListener('itg:agency-crm-updated', refresh)
    window.addEventListener('focus', visibleRefresh)
    window.addEventListener('online', visibleRefresh)
    document.addEventListener('visibilitychange', visibleRefresh)
    return () => {
      clearInterval(timer)
      clearTimeout(pending)
      window.removeEventListener('itg:agency-crm-updated', refresh)
      window.removeEventListener('focus', visibleRefresh)
      window.removeEventListener('online', visibleRefresh)
      document.removeEventListener('visibilitychange', visibleRefresh)
    }
  }, [enabled, scopeKey, intervalMs, reload])
  return { revision, reload }
}
