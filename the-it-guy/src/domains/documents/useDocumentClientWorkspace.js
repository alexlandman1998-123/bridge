import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { fetchDocumentClientWorkspace } from './workspaceReadApi.js'

function createClientReader(row, scopeKey, referenceData) {
  let state = { scopeKey, data: null, loading: Boolean(row), error: '' }
  let revision = 0
  let disposed = false
  let pending = null
  const listeners = new Set()
  const publish = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  const refresh = ({ force = false } = {}) => {
    if (!row || disposed) return Promise.resolve()
    if (pending && !force) return pending
    const request = ++revision
    publish({ loading: true, error: '' })
    pending = (referenceData ? fetchDocumentClientWorkspace(row, { referenceData }) : fetchDocumentClientWorkspace(row)).then(data => {
      if (!disposed && request === revision) publish({ data, loading: false })
    }).catch(cause => {
      if (!disposed && request === revision) publish({ loading: false, error: cause.message || 'Unable to load this client’s documents.' })
    }).finally(() => { if (request === revision) pending = null })
    return pending
  }
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    start: () => { disposed = false; void refresh() },
    dispose: () => { disposed = true; revision += 1; pending = null },
    refresh,
  }
}

export function useDocumentClientWorkspace(row, scopeKey, referenceData = null) {
  const reader = useMemo(() => createClientReader(row, scopeKey, referenceData), [row, scopeKey, referenceData])
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useEffect(() => { reader.start(); return reader.dispose }, [reader])
  return { ...state, refresh: reader.refresh }
}
