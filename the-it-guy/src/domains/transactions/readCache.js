// Extracted read path; queries, filters, mapping and cache behaviour are preserved.

export const TRANSACTION_SUMMARY_CACHE_TTL_MS = 8 * 1000

export const UNIT_WORKSPACE_SHELL_CACHE_TTL_MS = 10 * 1000

export const unitSummaryCache = new Map()

export const unitSummaryInFlight = new Map()

export const unitWorkspaceShellCache = new Map()

export const transactionRouteCoreCache = new Map()

export function readTimedCache(map, key, ttlMs) {
  const record = map.get(key)
  if (!record) {
    return null
  }

  if (Date.now() - record.cachedAt > ttlMs) {
    map.delete(key)
    return null
  }

  return record.value
}

export function writeTimedCache(map, key, value) {
  map.set(key, {
    value,
    cachedAt: Date.now(),
  })
}

export function invalidateTransactionWorkspaceCoreCache(transactionId) {
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) return
  unitWorkspaceShellCache.delete(normalizedTransactionId)
  transactionRouteCoreCache.delete(normalizedTransactionId)
}
