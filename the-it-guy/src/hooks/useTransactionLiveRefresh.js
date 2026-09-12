import { useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { createLiveRefreshQueue } from '../core/transactions/liveRefreshQueue'

export default function useTransactionLiveRefresh({
  transactionId, onRefresh, enabled = true, includeNotifications = true,
  pollingIntervalMs = 30_000, debounceMs = 350, realtime = true, scopeKey = '', refreshOnMount = true,
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
    let pollStartTimer = null
    let pendingVersion = null
    let pendingForce = false
    let reconciling = false
    let lastFullReadAt = 0
    let nextPollAt = 0
    let failures = 0
    const pollDelay = Math.max(10_000, Number(pollingIntervalMs) || 30_000)
    const queue = createLiveRefreshQueue({
      refresh: (context) => refreshRef.current?.(context),
      onSuccess: ({ reason }) => {
        lastFullReadAt = Date.now()
        failures = 0
        nextPollAt = Date.now() + pollDelay
        setStatus((previous) => ({ ...previous, lastRefreshAt: new Date().toISOString(),
          lastRefreshReason: reason, lastErrorAt: null, lastErrorMessage: '' }))
      },
      onError: () => {
        failures++
        nextPollAt = Date.now() + Math.min(60_000, pollDelay * 2 ** Math.min(failures, 3))
        setStatus((previous) => ({ ...previous,
          lastErrorAt: new Date().toISOString(), lastErrorMessage: 'Updates could not be refreshed. Retrying automatically.' }))
      },
    })
    const canRead = () => active && document.visibilityState !== 'hidden' && navigator.onLine !== false
    const schedule = (reason, version = null, idleOnly = false) => {
      if (!canRead()) return
      if (idleOnly && (queue.busy || timer)) return
      pendingVersion = Math.max(pendingVersion ?? -1, Number.isSafeInteger(version) ? version : -1)
      pendingForce ||= !Number.isSafeInteger(version) || version < 0
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        const nextVersion = pendingForce ? null : pendingVersion
        pendingVersion = null
        pendingForce = false
        if (canRead()) void queue.request({ reason, version: nextVersion, idleOnly })
      }, Math.max(0, Number(debounceMs) || 0))
    }
    const reconcile = async (force = false) => {
      if (!canRead() || reconciling || (!force && (queue.busy || Date.now() < nextPollAt))) return
      // Portal headers do not authorise a WebSocket. Reuse the portal's secure
      // full loader, including seller session checks, on every visible poll.
      if (!realtime) { schedule(force ? 'portal_reconnected' : 'portal_poll', null, !force); return }
      reconciling = true
      try {
        const result = await supabase.from('transaction_refresh_signals')
          .select('version').eq('transaction_id', id).maybeSingle()
        if (!canRead()) return
        if (result.error) throw result.error
        const revision = result.data?.version == null ? null : Number(result.data.version)
        // Also recover changes which do not yet publish a version signal.
        if (revision !== null && revision > queue.acknowledged) schedule('transaction_version_changed', revision, !force)
        else if (force || revision === null || Date.now() - lastFullReadAt >= 60_000) schedule('transaction_reconciled', null, !force)
      } catch {
        if (canRead()) schedule('transaction_poll_fallback', null, !force)
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
        if (state === 'SUBSCRIBED' && refreshOnMount) void reconcile(true)
      })
    }
    // Five participants often open the same matter together. Spread their
    // non-critical polls deterministically so a single journey update does not
    // create a thundering herd of identical reads. Realtime subscribers still
    // reconcile immediately when a signal arrives.
    const intervalMs = Math.max(10_000, Number(pollingIntervalMs) || 30_000)
    const jitterSeed = `${id}:${scopeKey}`.split('').reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0)
    const jitterMs = jitterSeed % Math.min(3_000, Math.max(1_000, Math.floor(intervalMs / 4)))
    let interval = null
    pollStartTimer = window.setTimeout(() => {
      if (!active) return
      void reconcile()
      interval = window.setInterval(() => void reconcile(), intervalMs)
    }, (refreshOnMount ? 0 : intervalMs) + jitterMs)
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
      if (pollStartTimer) window.clearTimeout(pollStartTimer)
      if (interval) window.clearInterval(interval)
      window.removeEventListener('focus', recover)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', recover)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [debounceMs, enabled, includeNotifications, pollingIntervalMs, realtime, refreshOnMount, scopeKey, transactionId])
  return status
}
