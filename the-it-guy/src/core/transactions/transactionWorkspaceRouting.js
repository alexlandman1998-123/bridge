function normalizeRouteValue(value) {
  return String(value || '').trim()
}

export function resolveTransactionWorkspaceRoute({
  transactionId = '',
  unitId = '',
  unitNumber = '',
  transactionReference = '',
  title = '',
  fallbackPath = '/units',
} = {}) {
  const normalizedTransactionId = normalizeRouteValue(transactionId)
  if (normalizedTransactionId) {
    return {
      kind: 'transaction',
      path: `/transactions/${encodeURIComponent(normalizedTransactionId)}`,
      state: {
        headerTitle: normalizeRouteValue(title || transactionReference) || 'Transaction',
      },
    }
  }

  const normalizedUnitId = normalizeRouteValue(unitId)
  if (normalizedUnitId) {
    const normalizedUnitNumber = normalizeRouteValue(unitNumber)
    return {
      kind: 'unit',
      path: `/units/${encodeURIComponent(normalizedUnitId)}`,
      state: {
        headerTitle: `Unit ${normalizedUnitNumber || 'Workspace'}`,
      },
    }
  }

  return {
    kind: 'fallback',
    path: fallbackPath,
    state: undefined,
  }
}
