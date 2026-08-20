function normalizeRouteValue(value) {
  return String(value || '').trim()
}

export function resolveTransactionWorkspaceRoute({
  transactionId = '',
  developmentId = '',
  unitId = '',
  unitNumber = '',
  transactionReference = '',
  title = '',
  fallbackPath = '/units',
} = {}) {
  const normalizedTransactionId = normalizeRouteValue(transactionId)
  const normalizedDevelopmentId = normalizeRouteValue(developmentId)
  if (normalizedTransactionId) {
    const state = {
      headerTitle: normalizeRouteValue(title || transactionReference) || 'Transaction',
    }
    if (normalizedDevelopmentId) {
      state.developmentId = normalizedDevelopmentId
    }

    return {
      kind: 'transaction',
      path: normalizedDevelopmentId
        ? `/developments/${encodeURIComponent(normalizedDevelopmentId)}/transactions/${encodeURIComponent(normalizedTransactionId)}`
        : `/transactions/${encodeURIComponent(normalizedTransactionId)}`,
      state,
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
