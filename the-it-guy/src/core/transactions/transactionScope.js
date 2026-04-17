export const TRANSACTION_SCOPE_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'development', label: 'Developments' },
  { key: 'private', label: 'Private Transactions' },
]

export function getTransactionScopeForRow(row) {
  const explicitType = String(row?.transaction?.transaction_type || '')
    .trim()
    .toLowerCase()

  if (explicitType === 'private' || explicitType === 'private_property') {
    return 'private'
  }

  if (explicitType === 'development' || explicitType === 'developer_sale') {
    return 'development'
  }

  return row?.development?.id || row?.unit?.development_id ? 'development' : 'private'
}

export function matchesTransactionScope(row, scope = 'all') {
  if (scope === 'all') {
    return true
  }

  return getTransactionScopeForRow(row) === scope
}

export function filterRowsByTransactionScope(rows = [], scope = 'all') {
  if (!Array.isArray(rows) || scope === 'all') {
    return Array.isArray(rows) ? rows : []
  }

  return rows.filter((row) => matchesTransactionScope(row, scope))
}
