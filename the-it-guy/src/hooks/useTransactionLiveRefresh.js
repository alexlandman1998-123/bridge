import { useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  DEFAULT_FALLBACK_POLLING_MS,
  DEFAULT_REALTIME_RECONCILIATION_MS,
  resolveTransactionPollReason,
} from './transactionLiveRefreshPolicy.js'

const FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30_000

function createChannelName(transactionId) {
  const suffix = Math.random().toString(36).slice(2, 9)
  return `transaction-live-${String(transactionId || '').slice(0, 8)}-${suffix}`
}

export default function useTransactionLiveRefresh({
  transactionId,
  onRefresh,
  enabled = true,
  includeNotifications = true,
  pollingIntervalMs = DEFAULT_FALLBACK_POLLING_MS,
  reconciliationIntervalMs = DEFAULT_REALTIME_RECONCILIATION_MS,
  debounceMs = 350,
} = {}) {
  const refreshRef = useRef(onRefresh)
  const [connectionState, setConnectionState] = useState('idle')
  const [lastRefreshAt, setLastRefreshAt] = useState(null)

  useEffect(() => {
    refreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const normalizedTransactionId = String(transactionId || '').trim()
    if (!enabled || !normalizedTransactionId || !isSupabaseConfigured) {
      setConnectionState('idle')
      return undefined
    }

    const state = {
      active: true,
      inFlight: false,
      pending: false,
      timer: null,
      realtimeState: 'connecting',
      lastReconciliationAt: Date.now(),
    }
    setConnectionState('connecting')
    const runRefresh = async (reason, payload = null) => {
      if (!state.active) return
      if (state.inFlight) {
        state.pending = true
        return
      }
      state.inFlight = true
      try {
        await refreshRef.current?.({ reason, payload })
        if (state.active) {
          state.lastReconciliationAt = Date.now()
          setLastRefreshAt(new Date().toISOString())
        }
      } catch (error) {
        console.warn('[transaction-live-refresh] Background refresh failed.', {
          transactionId: normalizedTransactionId,
          reason,
          message: error?.message || 'refresh_failed',
        })
      } finally {
        state.inFlight = false
        if (state.active && state.pending && document.visibilityState === 'visible') {
          state.pending = false
          queueMicrotask(() => void runRefresh('pending_change'))
        }
      }
    }
    const scheduleRefresh = (reason, payload = null) => {
      if (document.visibilityState !== 'visible') {
        state.pending = true
        return
      }
      if (state.timer) window.clearTimeout(state.timer)
      state.timer = window.setTimeout(() => {
        state.timer = null
        void runRefresh(reason, payload)
      }, Math.max(0, Number(debounceMs) || 0))
    }

    const channel = supabase
      .channel(createChannelName(normalizedTransactionId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transaction_shared_progress',
          filter: `transaction_id=eq.${normalizedTransactionId}`,
        },
        (payload) => scheduleRefresh('shared_progress_changed', payload),
      )

    if (includeNotifications) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_events',
          filter: `transaction_id=eq.${normalizedTransactionId}`,
        },
        (payload) => scheduleRefresh('notification_delivery_changed', payload),
      )
    }

    channel.subscribe((status) => {
      if (!state.active) return
      state.realtimeState = status === 'SUBSCRIBED'
        ? 'live'
        : ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)
          ? 'polling'
          : 'connecting'
      setConnectionState(state.realtimeState)
    })

    const interval = window.setInterval(() => {
      const now = Date.now()
      const reason = resolveTransactionPollReason({
        visibilityState: document.visibilityState,
        realtimeState: state.realtimeState,
        now,
        lastReconciliationAt: state.lastReconciliationAt,
        reconciliationIntervalMs,
        fallbackPollingIntervalMs: pollingIntervalMs,
      })
      if (!reason) return
      if (reason === 'poll_reconciliation') state.lastReconciliationAt = now
      scheduleRefresh(reason)
    }, Math.max(30_000, Number(pollingIntervalMs) || DEFAULT_FALLBACK_POLLING_MS))
    const scheduleForegroundRefresh = (reason) => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - state.lastReconciliationAt < FOREGROUND_REFRESH_MIN_INTERVAL_MS) return
      scheduleRefresh(reason)
    }
    const handleFocus = () => scheduleForegroundRefresh('window_focus')
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (state.pending) {
        state.pending = false
        scheduleRefresh('pending_visible_change')
        return
      }
      scheduleForegroundRefresh('visibility_restored')
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      state.active = false
      state.pending = false
      if (state.timer) window.clearTimeout(state.timer)
      window.clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [debounceMs, enabled, includeNotifications, pollingIntervalMs, reconciliationIntervalMs, transactionId])

  return { connectionState, lastRefreshAt }
}
