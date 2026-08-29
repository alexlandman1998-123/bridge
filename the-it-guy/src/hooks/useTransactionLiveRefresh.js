import { useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function createChannelName(transactionId) {
  const suffix = Math.random().toString(36).slice(2, 9)
  return `transaction-live-${String(transactionId || '').slice(0, 8)}-${suffix}`
}

export default function useTransactionLiveRefresh({
  transactionId,
  onRefresh,
  enabled = true,
  includeNotifications = true,
  pollingIntervalMs = 30_000,
  debounceMs = 350,
} = {}) {
  const refreshRef = useRef(onRefresh)
  const lastVersionRef = useRef(null)
  const [connectionState, setConnectionState] = useState('idle')
  const [lastRefreshAt, setLastRefreshAt] = useState(null)
  const [lastRefreshReason, setLastRefreshReason] = useState(null)
  const [lastErrorAt, setLastErrorAt] = useState(null)
  const [lastErrorMessage, setLastErrorMessage] = useState('')

  useEffect(() => {
    refreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const normalizedTransactionId = String(transactionId || '').trim()
    if (!enabled || !normalizedTransactionId || !isSupabaseConfigured) {
      setConnectionState('idle')
      return undefined
    }

    const state = { active: true, inFlight: false, pending: false, timer: null }
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
          setLastRefreshAt(new Date().toISOString())
          setLastRefreshReason(reason)
          setLastErrorAt(null)
          setLastErrorMessage('')
        }
      } catch (error) {
        if (state.active) {
          setLastErrorAt(new Date().toISOString())
          setLastErrorMessage(error?.message || 'Background refresh failed.')
        }
        console.warn('[transaction-live-refresh] Background refresh failed.', {
          transactionId: normalizedTransactionId,
          reason,
          message: error?.message || 'refresh_failed',
        })
      } finally {
        state.inFlight = false
        if (state.active && state.pending) {
          state.pending = false
          queueMicrotask(() => void runRefresh('pending_change'))
        }
      }
    }
    const scheduleRefresh = (reason, payload = null) => {
      if (state.timer) window.clearTimeout(state.timer)
      state.timer = window.setTimeout(() => {
        state.timer = null
        void runRefresh(reason, payload)
      }, Math.max(0, Number(debounceMs) || 0))
    }

    const handleVersionSignal = (payload) => {
      const nextVersion = Number(payload?.new?.version || payload?.record?.version || 0)
      if (nextVersion && lastVersionRef.current !== null && nextVersion <= lastVersionRef.current) return
      if (nextVersion) lastVersionRef.current = nextVersion
      scheduleRefresh('transaction_version_changed', payload)
    }
    const reconcileVersion = async () => {
      const result = await supabase
        .from('transaction_refresh_signals')
        .select('version,changed_at')
        .eq('transaction_id', normalizedTransactionId)
        .maybeSingle()
      if (result.error || !result.data) return
      const remoteVersion = Number(result.data.version || 0)
      if (lastVersionRef.current !== null && remoteVersion > lastVersionRef.current) {
        scheduleRefresh('transaction_version_reconciled', result.data)
      }
      lastVersionRef.current = remoteVersion
    }

    const channel = supabase
      .channel(createChannelName(normalizedTransactionId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transaction_refresh_signals',
          filter: `transaction_id=eq.${normalizedTransactionId}`,
        },
        handleVersionSignal,
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
      setConnectionState(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'polling' : 'connecting')
      if (status === 'SUBSCRIBED') void reconcileVersion()
    })

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') scheduleRefresh('poll_interval')
    }, Math.max(10_000, Number(pollingIntervalMs) || 30_000))
    const handleFocus = () => scheduleRefresh('window_focus')
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefresh('visibility_restored')
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      state.active = false
      state.pending = false
      lastVersionRef.current = null
      if (state.timer) window.clearTimeout(state.timer)
      window.clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [debounceMs, enabled, includeNotifications, pollingIntervalMs, transactionId])

  return {
    connectionState,
    lastRefreshAt,
    lastRefreshReason,
    lastErrorAt,
    lastErrorMessage,
  }
}
