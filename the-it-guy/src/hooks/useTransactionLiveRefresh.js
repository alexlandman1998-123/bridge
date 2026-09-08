import { useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { createLiveRefreshQueue } from '../core/transactions/liveRefreshQueue'

export default function useTransactionLiveRefresh({
  transactionId, onRefresh, enabled = true, includeNotifications = true,
  pollingIntervalMs = 30_000, debounceMs = 350, realtime = true, scopeKey = '',
} = {}) {
  const refreshRef = useRef(onRefresh)
  const [status, setStatus] = useState({ connectionState: 'idle', lastRefreshAt: null,
    lastRefreshReason: null, lastErrorAt: null, lastErrorMessage: '' })
  useEffect(() => { refreshRef.current = onRefresh }, [onRefresh])
  useEffect(() => {
    const id = String(transactionId || '').trim()
    setStatus({ connectionState: enabled && id ? (realtime ? 'connecting' : 'polling') : 'idle',
      lastRefreshAt: null, lastRefreshReason: null, lastErrorAt: null, lastErrorMessage: '' })
    if (!enabled || !id || (realtime && !isSupabaseConfigured)) return undefined
    let active = true
    let timer = null
    let pendingVersion = null
    let pendingForce = false
    let reconciling = false
    let lastFullReadAt = 0
    const queue = createLiveRefreshQueue({
      refresh: (context) => refreshRef.current?.(context),
      onSuccess: ({ reason }) => {
        lastFullReadAt = Date.now()
        setStatus((previous) => ({ ...previous, lastRefreshAt: new Date().toISOString(),
          lastRefreshReason: reason, lastErrorAt: null, lastErrorMessage: '' }))
      },
      onError: () => setStatus((previous) => ({ ...previous,
        lastErrorAt: new Date().toISOString(), lastErrorMessage: 'Updates could not be refreshed. Retrying automatically.' })),
    })
    const canRead = () => active && document.visibilityState !== 'hidden' && navigator.onLine !== false
    const schedule = (reason, version = null) => {
      if (!canRead()) return
      pendingVersion = Math.max(pendingVersion ?? -1, Number.isSafeInteger(version) ? version : -1)
      pendingForce ||= !Number.isSafeInteger(version) || version < 0
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        const nextVersion = pendingForce ? null : pendingVersion
        pendingVersion = null
        pendingForce = false
        if (canRead()) void queue.request({ reason, version: nextVersion })
      }, Math.max(0, Number(debounceMs) || 0))
    }
    const reconcile = async (force = false) => {
      if (!canRead() || reconciling) return
      // Portal headers do not authorise a WebSocket. Reuse the portal's secure
      // full loader, including seller session checks, on every visible poll.
      if (!realtime) { schedule(force ? 'portal_reconnected' : 'portal_poll'); return }
      reconciling = true
      try {
        const result = await supabase.from('transaction_refresh_signals')
          .select('version').eq('transaction_id', id).maybeSingle()
        if (!canRead()) return
        if (result.error) throw result.error
        const revision = result.data?.version == null ? null : Number(result.data.version)
        // Also recover changes which do not yet publish a version signal.
        if (force || revision === null || Date.now() - lastFullReadAt >= 60_000) schedule('transaction_reconciled')
        else if (revision > queue.acknowledged) schedule('transaction_version_changed', revision)
      } catch {
        if (canRead()) schedule('transaction_poll_fallback')
      } finally { reconciling = false }
    }
    let channel = null
    if (realtime) {
      channel = supabase.channel(`transaction-live-${id}-${Math.random().toString(36).slice(2, 9)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction_refresh_signals',
          filter: `transaction_id=eq.${id}` }, (payload) => schedule('transaction_version_changed', Number(payload?.new?.version)))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions',
          filter: `id=eq.${id}` }, () => schedule('canonical_transaction_changed'))
      if (includeNotifications) channel.on('postgres_changes', { event: '*', schema: 'public',
        table: 'notification_events', filter: `transaction_id=eq.${id}` }, () => schedule('notification_changed'))
      channel.subscribe((state) => {
        if (!active) return
        setStatus((previous) => ({ ...previous, connectionState: navigator.onLine === false ? 'offline'
          : state === 'SUBSCRIBED' ? 'live' : 'polling' }))
        if (state === 'SUBSCRIBED') void reconcile(true)
      })
    }
    void reconcile(true)
    const interval = window.setInterval(() => void reconcile(), Math.max(10_000, Number(pollingIntervalMs) || 30_000))
    const recover = () => { if (canRead()) void reconcile(true) }
    const online = () => {
      setStatus((previous) => ({ ...previous, connectionState: 'polling' }))
      recover()
    }
    const offline = () => setStatus((previous) => ({ ...previous, connectionState: 'offline' }))
    window.addEventListener('focus', recover)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', recover)
    return () => {
      active = false
      queue.stop()
      if (timer) window.clearTimeout(timer)
      window.clearInterval(interval)
      window.removeEventListener('focus', recover)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', recover)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [debounceMs, enabled, includeNotifications, pollingIntervalMs, realtime, scopeKey, transactionId])
  return status
}
