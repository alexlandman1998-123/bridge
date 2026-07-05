import { FINANCE_MANAGED_BY_OPTIONS } from './roleConfig.js'

export const CANONICAL_FINANCE_TYPES = ['cash', 'bond', 'combination', 'developer']

export const FINANCE_MANAGED_BY = Object.freeze({
  BOND_ORIGINATOR: 'bond_originator',
  CLIENT: 'client',
  INTERNAL: 'internal',
})

export const FINANCE_ASSISTANCE_PREFERENCES = Object.freeze({
  REQUESTED: 'requested',
  DECLINED: 'declined',
  UNKNOWN: 'unknown',
})

const BOND_ORIGINATOR_MANAGED_ALIASES = new Set([
  'bondoriginator',
  'bond_originator',
  'bond_originator_managed',
  'originator',
  'originator_managed',
  'ooba',
  'ooba_assisted',
])

const CLIENT_MANAGED_ALIASES = new Set([
  'buyer',
  'buyer_attorney',
  'buyer_attorney_managed',
  'cash',
  'cash_buyer',
  'client',
  'client_managed',
  'external',
  'external_finance',
  'own',
  'own_bank',
  'own_bond',
  'own_finance',
  'self',
  'self_managed',
])

const INTERNAL_MANAGED_ALIASES = new Set([
  'admin',
  'agency',
  'agency_managed',
  'developer',
  'developer_finance',
  'internal',
  'internal_admin',
])

const AFFIRMATIVE_FINANCE_ASSISTANCE_VALUES = new Set([
  '1',
  'true',
  'yes',
  'y',
  'on',
  'enabled',
  'requested',
  'request',
  'originator',
  'originator_assisted',
  'bond_originator',
  'ooba',
  'assist',
  'assisted',
])

const NEGATIVE_FINANCE_ASSISTANCE_VALUES = new Set([
  '0',
  'false',
  'no',
  'n',
  'off',
  'disabled',
  'declined',
  'decline',
  'not_requested',
  'self_managed',
  'own_finance',
  'client',
  'buyer',
])

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function resolveFormData(input = {}) {
  if (!isPlainObject(input)) return {}
  const source = isPlainObject(input.formData) ? input.formData : input
  return isPlainObject(source.form_data) ? source.form_data : source
}

function getFinanceFormData(input = {}) {
  const formData = resolveFormData(input)
  return isPlainObject(formData.finance) ? formData.finance : {}
}

function getFinanceTypeFromFormData(formData = {}) {
  const form = resolveFormData(formData)
  const finance = getFinanceFormData(form)
  return (
    form.finance_type ||
    form.financeType ||
    form.purchase_finance_type ||
    form.purchaseFinanceType ||
    finance.finance_type ||
    finance.financeType ||
    finance.purchase_finance_type ||
    finance.purchaseFinanceType ||
    ''
  )
}

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

  if (normalized === 'developer' || normalized === 'developer_finance' || normalized === 'developer finance') {
    return 'developer'
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

  if (normalized.includes('developer')) {
    return 'developer'
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

export function normalizeFinanceManagedBy(value, { fallback = FINANCE_MANAGED_BY.BOND_ORIGINATOR } = {}) {
  const normalized = normalizeKey(value)

  if (!normalized) return fallback
  if (BOND_ORIGINATOR_MANAGED_ALIASES.has(normalized)) return FINANCE_MANAGED_BY.BOND_ORIGINATOR
  if (CLIENT_MANAGED_ALIASES.has(normalized)) return FINANCE_MANAGED_BY.CLIENT
  if (INTERNAL_MANAGED_ALIASES.has(normalized)) return FINANCE_MANAGED_BY.INTERNAL
  return FINANCE_MANAGED_BY_OPTIONS.includes(normalized) ? normalized : fallback
}

export function isAffirmativeFinanceAssistanceValue(value) {
  return AFFIRMATIVE_FINANCE_ASSISTANCE_VALUES.has(normalizeKey(value))
}

export function isNegativeFinanceAssistanceValue(value) {
  return NEGATIVE_FINANCE_ASSISTANCE_VALUES.has(normalizeKey(value))
}

function financeAssistanceCandidates(input = {}) {
  const formData = resolveFormData(input)
  const finance = getFinanceFormData(input)
  return [
    input.assistanceRequested,
    input.financeAssistanceRequested,
    input.bondHelpRequested,
    input.bond_help_requested,
    input.oobaAssistRequested,
    input.ooba_assist_requested,
    formData.assistanceRequested,
    formData.financeAssistanceRequested,
    formData.bond_help_requested,
    formData.bondHelpRequested,
    formData.needs_bond_assistance,
    formData.needsBondAssistance,
    formData.ooba_assist_requested,
    formData.oobaAssistRequested,
    finance.bond_help_requested,
    finance.bondHelpRequested,
    finance.needs_bond_assistance,
    finance.needsBondAssistance,
    finance.ooba_assist_requested,
    finance.oobaAssistRequested,
  ]
}

function hasBuyerAppointedOriginatorDetails(input = {}) {
  const formData = resolveFormData(input)
  const finance = getFinanceFormData(input)
  return [
    input.bondOriginatorName,
    input.bond_originator_name,
    input.bondOriginatorContact,
    input.bond_originator_contact,
    formData.bond_originator_name,
    formData.bondOriginatorName,
    formData.bond_originator_contact,
    formData.bondOriginatorContact,
    finance.bond_originator_name,
    finance.bondOriginatorName,
    finance.bond_originator_contact,
    finance.bondOriginatorContact,
  ].some((value) => String(value || '').trim())
}

export function resolveFinanceAssistancePreference(input = {}) {
  const candidates = financeAssistanceCandidates(input)
  if (candidates.some(isAffirmativeFinanceAssistanceValue) || hasBuyerAppointedOriginatorDetails(input)) {
    return FINANCE_ASSISTANCE_PREFERENCES.REQUESTED
  }
  if (candidates.some(isNegativeFinanceAssistanceValue)) {
    return FINANCE_ASSISTANCE_PREFERENCES.DECLINED
  }
  return FINANCE_ASSISTANCE_PREFERENCES.UNKNOWN
}

export function isFinanceAssistanceRequested(input = {}) {
  return resolveFinanceAssistancePreference(input) === FINANCE_ASSISTANCE_PREFERENCES.REQUESTED
}

export function isFinanceAssistanceDeclined(input = {}) {
  return resolveFinanceAssistancePreference(input) === FINANCE_ASSISTANCE_PREFERENCES.DECLINED
}

export function deriveFinanceManagedBy({
  financeType = '',
  financeManagedBy = '',
  formData = null,
  fallback = FINANCE_MANAGED_BY.BOND_ORIGINATOR,
} = {}) {
  const normalizedFinanceType = normalizeFinanceType(
    financeType || getFinanceTypeFromFormData(formData || {}),
    { allowUnknown: true },
  )

  if (normalizedFinanceType === 'cash') return FINANCE_MANAGED_BY.CLIENT
  if (normalizedFinanceType === 'developer') return FINANCE_MANAGED_BY.INTERNAL

  if (isBondFinanceType(normalizedFinanceType)) {
    const assistancePreference = resolveFinanceAssistancePreference(formData || {})
    if (assistancePreference === FINANCE_ASSISTANCE_PREFERENCES.REQUESTED) {
      return FINANCE_MANAGED_BY.BOND_ORIGINATOR
    }
    if (assistancePreference === FINANCE_ASSISTANCE_PREFERENCES.DECLINED) {
      return FINANCE_MANAGED_BY.CLIENT
    }
    return normalizeFinanceManagedBy(financeManagedBy, { fallback: FINANCE_MANAGED_BY.BOND_ORIGINATOR })
  }

  return normalizeFinanceManagedBy(financeManagedBy, { fallback })
}

export function isOriginatorManagedFinance(input = {}) {
  const managedBy = isPlainObject(input)
    ? deriveFinanceManagedBy(input)
    : normalizeFinanceManagedBy(input)
  return managedBy === FINANCE_MANAGED_BY.BOND_ORIGINATOR
}

export function isClientManagedFinance(input = {}) {
  const managedBy = isPlainObject(input)
    ? deriveFinanceManagedBy(input)
    : normalizeFinanceManagedBy(input)
  return managedBy === FINANCE_MANAGED_BY.CLIENT
}

export function financeTypeLabel(value) {
  const normalized = normalizeFinanceType(value, { allowUnknown: true })
  if (normalized === 'cash') return 'Cash Purchase'
  if (normalized === 'bond') return 'Bond / Mortgage Finance'
  if (normalized === 'combination') return 'Combination (Cash + Bond)'
  if (normalized === 'developer') return 'Developer Finance'
  return 'Unknown'
}

export function financeTypeShortLabel(value) {
  const normalized = normalizeFinanceType(value, { allowUnknown: true })
  if (normalized === 'cash') return 'Cash'
  if (normalized === 'bond') return 'Bond'
  if (normalized === 'combination') return 'Combination'
  if (normalized === 'developer') return 'Developer Finance'
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
