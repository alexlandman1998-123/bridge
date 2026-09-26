import { useEffect, useRef, useState } from 'react'

import { createLiveRefreshQueue } from '../core/transactions/liveRefreshQueue'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const DEFAULT_POLLING_INTERVAL_MS = 60_000

export default function useAttorneyDashboardLiveRefresh({
  firmId,
  onRefresh,
  enabled = true,
  pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS,
  debounceMs = 450,
} = {}) {
  const refreshRef = useRef(onRefresh)
  const [connectionState, setConnectionState] = useState('idle')

  useEffect(() => {
    refreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const normalizedFirmId = String(firmId || '').trim()
    if (!enabled || !normalizedFirmId) {
      setConnectionState('idle')
      return undefined
    }

    let active = true
    let debounceTimer = null
    let pollTimer = null
    let channel = null
    const pollDelay = Math.max(30_000, Number(pollingIntervalMs) || DEFAULT_POLLING_INTERVAL_MS)
    const queue = createLiveRefreshQueue({
      refresh: (context) => refreshRef.current?.(context),
    })

    const canRefresh = () => active && document.visibilityState !== 'hidden' && navigator.onLine !== false
    const schedule = (reason, immediate = false) => {
      if (!canRefresh()) return
      if (debounceTimer) window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        if (canRefresh()) void queue.request({ reason })
      }, immediate ? 0 : Math.max(0, Number(debounceMs) || 0))
    }
    const recover = () => schedule('dashboard_reconciled', true)
    const onLocalTransactionUpdate = () => schedule('local_transaction_updated')
    const onOnline = () => {
      setConnectionState(isSupabaseConfigured ? 'connecting' : 'polling')
      recover()
    }
    const onOffline = () => setConnectionState('offline')

    window.addEventListener('itg:transaction-updated', onLocalTransactionUpdate)
    window.addEventListener('focus', recover)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', recover)

    if (isSupabaseConfigured) {
      setConnectionState('connecting')
      // RLS limits this unfiltered stream to transaction signals visible to
      // the signed-in attorney. This also catches newly assigned matters,
      // whose IDs are not known to the dashboard's capped initial snapshot.
      channel = supabase
        .channel(`attorney-dashboard-${normalizedFirmId}-${Math.random().toString(36).slice(2, 9)}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'transaction_refresh_signals',
        }, () => schedule('transaction_refresh_signal'))
        .subscribe((state) => {
          if (!active) return
          setConnectionState(navigator.onLine === false
            ? 'offline'
            : state === 'SUBSCRIBED' ? 'live' : 'polling')
        })
    } else {
      setConnectionState('polling')
    }

    pollTimer = window.setInterval(() => schedule('dashboard_poll', true), pollDelay)

    return () => {
      active = false
      queue.stop()
      if (debounceTimer) window.clearTimeout(debounceTimer)
      if (pollTimer) window.clearInterval(pollTimer)
      window.removeEventListener('itg:transaction-updated', onLocalTransactionUpdate)
      window.removeEventListener('focus', recover)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', recover)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [debounceMs, enabled, firmId, pollingIntervalMs])

  return { connectionState }
}
