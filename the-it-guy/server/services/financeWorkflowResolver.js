const FINANCE_TYPE_ALIAS = Object.freeze({
  bond: 'bond',
  bond_finance: 'bond',
  mortgage: 'bond',
  cash: 'cash',
  cash_buyer: 'cash',
  hybrid: 'hybrid',
  combination: 'hybrid',
  bond_cash: 'hybrid',
  cash_and_bond: 'hybrid',
  cash_bond: 'hybrid',
  'cash+bond': 'hybrid',
})

export const FINANCE_WORKFLOW_KEYS = Object.freeze([
  'finance_bond',
  'finance_cash',
  'finance_hybrid',
  'finance_unknown',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

export function normaliseFinanceType(value) {
  const normalized = normalizeKey(value)
  if (!normalized) return 'unknown'

  if (FINANCE_TYPE_ALIAS[normalized]) {
    return FINANCE_TYPE_ALIAS[normalized]
  }

  const hasCash = normalized.includes('cash')
  const hasBond = normalized.includes('bond') || normalized.includes('mortgage')

  if (hasCash && hasBond) return 'hybrid'
  if (hasBond) return 'bond'
  if (hasCash) return 'cash'

  return 'unknown'
}

export const normalizeFinanceTypeForWorkflow = normaliseFinanceType

export function toCanonicalTransactionFinanceType(value) {
  const normalized = normaliseFinanceType(value)
  if (normalized === 'hybrid') return 'combination'
  if (normalized === 'unknown') return null
  return normalized
}

export function resolveFinanceWorkflowKey(transaction = {}) {
  const financeType = normaliseFinanceType(
    typeof transaction === 'string' ? transaction : transaction?.finance_type,
  )

  if (financeType === 'bond') return 'finance_bond'
  if (financeType === 'cash') return 'finance_cash'
  if (financeType === 'hybrid') return 'finance_hybrid'
  return 'finance_unknown'
}

export function resolveInactiveFinanceWorkflowKeys(transaction = {}) {
  const activeWorkflowKey = resolveFinanceWorkflowKey(transaction)
  return FINANCE_WORKFLOW_KEYS.filter((workflowKey) => workflowKey !== activeWorkflowKey)
}

export function isFinanceWorkflowKey(workflowKey = '') {
  return FINANCE_WORKFLOW_KEYS.includes(normalizeText(workflowKey))
}
