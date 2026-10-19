import { useCallback, useEffect, useRef, useState } from 'react'
import { createCoalescedRefresh } from '../lib/coalescedRefresh'
import useAppointmentReconciliation from './useAppointmentReconciliation'

// Calendar readers share the same refresh policy, regardless of which event asks for a
// refresh. Render-time object identity changes do not start network requests.
export default function useCalendarRead({ scopeKey, read, enabled = true, revision = 0, intervalMs = 30000, timeoutMs = 15000, reconcile = true }) {
  const [queue] = useState(() => createCoalescedRefresh({ minIntervalMs: 5000 }))
  const readRef = useRef(read)
  readRef.current = read
  const scopeRef = useRef(null)
  const [state, setState] = useState({ key: null, data: null, status: 'idle', error: '', hasSnapshot: false })
  const { revision: refresh } = useAppointmentReconciliation({ enabled: enabled && reconcile, scopeKey, intervalMs })

  useEffect(() => {
    const scope = { active: enabled, key: scopeKey }
    scopeRef.current = scope
    return () => { scope.active = false; queue.cancel() }
  }, [scopeKey, enabled, queue])

  const execute = useCallback((immediate = false) => {
    if (!enabled) return Promise.resolve()
    const scope = scopeRef.current
    if (!scope?.active || scope.key !== scopeKey) return Promise.resolve()
    const readSnapshot = readRef.current
    return queue.run(scopeKey, async signal => {
      if (!immediate && (document.visibilityState === 'hidden' || navigator.onLine === false)) throw new DOMException('Calendar read paused.', 'AbortError')
      const controller = new AbortController()
      let timer, cancel
      const stopped = new Promise((_, reject) => {
        cancel = () => { clearTimeout(timer); controller.abort(); reject(new DOMException('Calendar read cancelled.', 'AbortError')) }
        signal.addEventListener('abort', cancel, { once: true })
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('Calendar data is taking too long to load. Please retry.'))
        }, timeoutMs)
      })
      setState(previous => ({ key: scopeKey, data: previous.key === scopeKey ? previous.data : null,
        hasSnapshot: previous.key === scopeKey && previous.hasSnapshot, status: 'loading', error: previous.key === scopeKey ? previous.error : '' }))
      const operation = Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return readSnapshot(controller.signal)
      })
      try {
        const data = await Promise.race([operation, stopped])
        if (scope.active) setState({ key: scopeKey, data, hasSnapshot: true, status: 'ready', error: '' })
        return data
      } catch (error) {
        if (scope.active && error?.name !== 'AbortError') setState(previous => ({ ...previous, status: 'error', error: error?.message || 'Calendar data could not be loaded. Please retry.' }))
        // A deadline updates the UI and aborts transport, but cannot free the
        // queue until a service that ignores cancellation has actually settled.
        if (controller.signal.aborted) await operation.catch(() => {})
        throw error
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', cancel)
      }
    }, { immediate }).catch(() => {})
  }, [scopeKey, enabled, timeoutMs, queue])

  useEffect(() => { void execute() }, [execute, revision, refresh])
  const reload = useCallback(() => execute(true), [execute])
  const refreshRead = useCallback(() => execute(), [execute])

  return { ...(enabled && state.key === scopeKey ? state : { data: null, status: enabled ? 'loading' : 'idle', error: '', hasSnapshot: false }), reconciliationRevision: refresh, reload, refresh: refreshRead }
}
