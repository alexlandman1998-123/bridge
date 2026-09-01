const terminalLifecycleStates = new Set(['archived', 'cancelled', 'canceled', 'deleted'])

const normalizeLifecycleState = (value) => String(value || '').trim().toLowerCase()

export function isCurrentDevelopmentTransactionRow(row) {
  const transaction = row?.transaction

  if (!transaction?.id || transaction.is_active === false) {
    return false
  }

  if (transaction.archived_at || transaction.cancelled_at || transaction.deleted_at) {
    return false
  }

  return !terminalLifecycleStates.has(normalizeLifecycleState(transaction.lifecycle_state))
}

export function selectCurrentDevelopmentTransactionRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter(isCurrentDevelopmentTransactionRow)
}
