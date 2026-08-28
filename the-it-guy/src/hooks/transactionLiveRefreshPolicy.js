export const DEFAULT_REALTIME_RECONCILIATION_MS = 5 * 60 * 1000
export const DEFAULT_FALLBACK_POLLING_MS = 60 * 1000

export function resolveTransactionPollReason({
  visibilityState = 'visible',
  realtimeState = 'connecting',
  now = Date.now(),
  lastReconciliationAt = 0,
  reconciliationIntervalMs = DEFAULT_REALTIME_RECONCILIATION_MS,
  fallbackPollingIntervalMs = DEFAULT_FALLBACK_POLLING_MS,
} = {}) {
  if (visibilityState !== 'visible') return null
  if (realtimeState !== 'live') {
    const fallbackInterval = Math.max(60_000, Number(fallbackPollingIntervalMs) || DEFAULT_FALLBACK_POLLING_MS)
    return now - Number(lastReconciliationAt || 0) >= fallbackInterval ? 'poll_fallback' : null
  }
  const interval = Math.max(60_000, Number(reconciliationIntervalMs) || DEFAULT_REALTIME_RECONCILIATION_MS)
  return now - Number(lastReconciliationAt || 0) >= interval ? 'poll_reconciliation' : null
}
