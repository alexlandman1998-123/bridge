export const DEFAULT_REALTIME_RECONCILIATION_MS = 5 * 60 * 1000

export function resolveTransactionPollReason({
  visibilityState = 'visible',
  realtimeState = 'connecting',
  now = Date.now(),
  lastReconciliationAt = 0,
  reconciliationIntervalMs = DEFAULT_REALTIME_RECONCILIATION_MS,
} = {}) {
  if (visibilityState !== 'visible') return null
  if (realtimeState !== 'live') return 'poll_fallback'
  const interval = Math.max(60_000, Number(reconciliationIntervalMs) || DEFAULT_REALTIME_RECONCILIATION_MS)
  return now - Number(lastReconciliationAt || 0) >= interval ? 'poll_reconciliation' : null
}
