export const CANONICAL_FINANCE_TYPES = ['cash', 'bond', 'combination']

export function normalizeFinanceType(value, { fallback = 'cash', allowUnknown = false } = {}) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return allowUnknown ? 'unknown' : fallback
  }

  if (normalized === 'hybrid') {
    return 'combination'
  }

  if (normalized === 'combination' || normalized === 'cash_bond' || normalized === 'cash+bond') {
    return 'combination'
  }

  const hasCash = normalized.includes('cash')
  const hasBond = normalized.includes('bond') || normalized.includes('mortgage')

  if (hasCash && hasBond) {
    return 'combination'
  }

  if (hasBond) {
    return 'bond'
  }

  if (hasCash) {
    return 'cash'
  }

  if (allowUnknown) {
    return 'unknown'
  }

  return fallback
}

export function isBondFinanceType(value) {
  const normalized = normalizeFinanceType(value, { allowUnknown: true })
  return normalized === 'bond' || normalized === 'combination'
}

export function financeTypeLabel(value) {
  const normalized = normalizeFinanceType(value, { allowUnknown: true })
  if (normalized === 'cash') return 'Cash Purchase'
  if (normalized === 'bond') return 'Bond / Mortgage Finance'
  if (normalized === 'combination') return 'Combination (Cash + Bond)'
  return 'Unknown'
}

export function financeTypeShortLabel(value) {
  const normalized = normalizeFinanceType(value, { allowUnknown: true })
  if (normalized === 'cash') return 'Cash'
  if (normalized === 'bond') return 'Bond'
  if (normalized === 'combination') return 'Combination'
  return 'Unknown'
}

export function financeTypeMatchesFilter(value, filter) {
  const normalizedFilter = String(filter || 'all')
    .trim()
    .toLowerCase()

  if (!normalizedFilter || normalizedFilter === 'all') {
    return true
  }

  const canonicalFilter = normalizeFinanceType(normalizedFilter, {
    fallback: normalizedFilter,
    allowUnknown: normalizedFilter === 'unknown',
  })
  const canonicalValue = normalizeFinanceType(value, { allowUnknown: true })
  return canonicalValue === canonicalFilter
}
