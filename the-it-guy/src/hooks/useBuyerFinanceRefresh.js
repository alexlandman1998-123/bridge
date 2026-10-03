import { useCallback, useEffect, useRef, useState } from 'react'
import usePortalWorkspaceRefresh from './usePortalWorkspaceRefresh'

// Finance reads independently of slower portal/document hydration. Results from
// an old token/matter or an unmounted page must never enter the next scope.
export default function useBuyerFinanceRefresh({ token, transactionId, enabled, initialFinance, readFinance }) {
  const identity = `${token || ''}:${transactionId || ''}`
  const generation = useRef({ identity, version: 0 })
  if (generation.current.identity !== identity) generation.current = { identity, version: generation.current.version + 1 }
  const scope = `${identity}:${generation.current.version}`
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const mountedRef = useRef(true)
  const readRef = useRef(readFinance)
  readRef.current = readFinance
  const pendingRef = useRef(null)
  const [snapshot, setSnapshot] = useState(null)
  const [busyScope, setBusyScope] = useState('')
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  const refresh = useCallback(async () => {
    if (!enabled || !token || !transactionId) return false
    if (pendingRef.current?.scope === scope) return pendingRef.current.promise
    setBusyScope(scope)
    const promise = (async () => {
      let timeout
      try {
        const finance = await Promise.race([
          Promise.resolve().then(() => readRef.current(token)),
          new Promise((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Finance read timed out')), 15_000) }),
        ])
        if (!mountedRef.current || scopeRef.current !== scope) return false
        setSnapshot({ scope, finance, failed: false })
        return true
      } catch {
        if (mountedRef.current && scopeRef.current === scope) setSnapshot({ scope, finance: null, failed: true })
        return false
      } finally {
        window.clearTimeout(timeout)
        if (pendingRef.current?.scope === scope) pendingRef.current = null
        if (mountedRef.current && scopeRef.current === scope) setBusyScope('')
      }
    })()
    pendingRef.current = { scope, promise }
    return promise
  }, [enabled, scope, token, transactionId])
  const status = usePortalWorkspaceRefresh({ enabled, onRefresh: refresh, pollingIntervalMs: 30_000, scopeKey: scope, refreshOnMount: true })
  const current = snapshot?.scope === scope ? snapshot : null
  return { finance: current ? current.finance : initialFinance || null, failed: Boolean(current?.failed), refreshing: busyScope === scope, refresh, connectionState: status.connectionState }
}
