import { openingRequestTrace } from '../services/observability/openingRequestTrace.js'

// Caller-owned, viewer-scoped reference data. Mutable records use maxAgeMs: 0
// to share only an in-flight request, never a completed result.
export function createScopedReadCache({ scopeKey = '', now = Date.now, maxEntries = 32 } = {}) {
  let clients = new WeakMap()
  let revision = 0
  return {
    scopeKey,
    invalidate(group = '') {
      revision += 1
      // Invalidating a reference family also retires outstanding reads so late
      // results cannot repopulate a cache after permissions/data changed.
      clients = new WeakMap()
      openingRequestTrace.cache(group || 'references', 'invalidated')
    },
    read({ client, group, key, load, maxAgeMs = 30_000 }) {
      if (!client || !['object', 'function'].includes(typeof client)) return Promise.resolve().then(load)
      let entries = clients.get(client)
      if (!entries) { entries = new Map(); clients.set(client, entries) }
      const cacheKey = JSON.stringify([group, key])
      const existing = entries.get(cacheKey)
      if (existing?.pending) { openingRequestTrace.cache(group, 'joined'); return existing.pending }
      if (existing && existing.expiresAt > now()) { openingRequestTrace.cache(group, 'hit'); return Promise.resolve(existing.value) }
      openingRequestTrace.cache(group, 'miss')
      const version = revision
      const entry = {}
      entry.pending = Promise.resolve().then(load).then(value => {
        if (revision !== version && maxAgeMs === 0) throw new DOMException('Read invalidated by a data or viewer change.', 'AbortError')
        if (revision === version && entries.get(cacheKey) === entry) {
          if (maxAgeMs > 0) { entry.value = value; entry.expiresAt = now() + maxAgeMs; entry.pending = null }
          else entries.delete(cacheKey)
        }
        return value
      }).catch(error => { if (entries.get(cacheKey) === entry) entries.delete(cacheKey); throw error })
      entries.delete(cacheKey)
      while (entries.size >= Math.max(1, maxEntries)) entries.delete(entries.keys().next().value)
      entries.set(cacheKey, entry)
      return entry.pending
    },
  }
}

export function watchScopedReadInvalidation(cache, { windowApi = typeof window === 'undefined' ? null : window, onInvalidate = () => {} } = {}) {
  if (!windowApi) return () => {}
  const events = ['bridge:workspace-scoped-cache-cleared', 'itg:developments-changed', 'itg:transaction-created', 'itg:transaction-updated', 'itg:document-requirements-changed', 'arch9:document-requirements-changed', 'itg:agency-crm-updated']
  const handler = event => { cache.invalidate(); onInvalidate(event.type) }
  const storage = event => { if (event.key === 'arch9:document-requirements-changed') handler({ type: event.key }) }
  events.forEach(event => windowApi.addEventListener(event, handler))
  windowApi.addEventListener('storage', storage)
  return () => { events.forEach(event => windowApi.removeEventListener(event, handler)); windowApi.removeEventListener('storage', storage) }
}
