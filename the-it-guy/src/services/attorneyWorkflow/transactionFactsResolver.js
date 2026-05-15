const CASH_FINANCE_VALUES = new Set(['cash', 'cash_sale', 'cash_deal', 'proof_of_funds'])
const BOND_FINANCE_VALUES = new Set(['bond', 'bonded', 'bond_finance', 'mortgage', 'home_loan'])
const HYBRID_FINANCE_VALUES = new Set(['hybrid', 'cash_and_bond', 'partial_bond', 'combination'])

const COMPANY_VALUES = new Set(['company', 'business', 'corporate', 'pty', 'pty_ltd', 'close_corporation', 'cc'])
const TRUST_VALUES = new Set(['trust', 'family_trust'])
const INDIVIDUAL_VALUES = new Set(['individual', 'person', 'natural_person', 'private_individual'])

const DEVELOPMENT_TRANSACTION_VALUES = new Set(['development', 'development_sale', 'new_development', 'off_plan'])
const PRIVATE_TRANSACTION_VALUES = new Set(['private', 'private_sale', 'resale', 'seller_owned', 'sale'])
const COMMERCIAL_PROPERTY_VALUES = new Set(['commercial', 'industrial', 'retail', 'agricultural', 'office', 'warehouse'])

const FINANCE_FIELD_CANDIDATES = [
  'finance_type',
  'transaction_finance_type',
  'funding_type',
  'deal_type',
  'purchase_type',
  'purchase_finance_type',
]

const TRANSACTION_TYPE_FIELD_CANDIDATES = [
  'transaction_type',
  'property_transaction_type',
  'sale_type',
  'listing_type',
  'deal_type',
]

const BUYER_ENTITY_FIELD_CANDIDATES = [
  'buyer_entity_type',
  'buyer_type',
  'purchaser_type',
  'purchaser_entity_type',
  'client_type',
  'buyer.entity_type',
  'buyer.type',
  'buyer.profile_type',
]

const SELLER_ENTITY_FIELD_CANDIDATES = [
  'seller_entity_type',
  'seller_type',
  'vendor_type',
  'seller.entity_type',
  'seller.type',
  'sellerLead.seller_type',
  'sellerLead.entity_type',
]

const SELLER_BOND_FIELD_CANDIDATES = [
  'seller_has_existing_bond',
  'seller_has_bond',
  'seller_existing_bond',
  'existing_bond',
  'has_existing_bond',
  'outstanding_bond',
  'bond_status',
  'seller.bond_status',
]

const CANCELLATION_FIELD_CANDIDATES = [
  'cancellation_required',
  'requires_cancellation',
  'bond_cancellation_required',
  'seller_requires_bond_cancellation',
]

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function readPath(source, path) {
  const parts = String(path || '').split('.').filter(Boolean)
  let current = source
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

function hasUsableValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return true
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function firstField(transaction, candidates, rawFieldsUsed, canonicalName) {
  for (const field of candidates) {
    const value = readPath(transaction, field)
    if (hasUsableValue(value)) {
      rawFieldsUsed[canonicalName] = field
      return value
    }
  }
  return undefined
}

function truthyFlag(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['true', 'yes', 'y', '1', 'required', 'requires_cancellation', 'cancellation_required', 'bond', 'existing_bond', 'outstanding'].includes(normalized)
}

function normalizeFinanceType(value) {
  const normalized = normalizeKey(value)
  if (!normalized) return 'unknown'
  if (CASH_FINANCE_VALUES.has(normalized)) return 'cash'
  if (BOND_FINANCE_VALUES.has(normalized)) return 'bond'
  if (HYBRID_FINANCE_VALUES.has(normalized)) return 'hybrid'
  if (normalized.includes('cash') && normalized.includes('bond')) return 'hybrid'
  if (normalized.includes('bond') || normalized.includes('mortgage')) return 'bond'
  if (normalized.includes('cash')) return 'cash'
  return normalized
}

function normalizeEntityType(value) {
  const normalized = normalizeKey(value)
  if (!normalized) return 'unknown'
  if (COMPANY_VALUES.has(normalized) || normalized.includes('company') || normalized.includes('pty')) return 'company'
  if (TRUST_VALUES.has(normalized) || normalized.includes('trust')) return 'trust'
  if (INDIVIDUAL_VALUES.has(normalized) || normalized.includes('individual') || normalized.includes('person')) return 'individual'
  return normalized
}

function normalizeTransactionType(value, transaction = {}) {
  const normalized = normalizeKey(value)
  if (transaction?.development_id || transaction?.developmentId || transaction?.unit?.development_id || transaction?.development?.id) {
    return 'development_sale'
  }
  if (!normalized) return 'unknown'
  if (DEVELOPMENT_TRANSACTION_VALUES.has(normalized)) return 'development_sale'
  if (normalized === 'commercial' || normalized === 'commercial_transaction') return 'commercial'
  if (normalized === 'resale') return 'resale'
  if (PRIVATE_TRANSACTION_VALUES.has(normalized)) return 'private_sale'
  return normalized
}

function countRelated(transaction, keys = []) {
  for (const key of keys) {
    const value = readPath(transaction, key)
    if (Array.isArray(value)) return value.length
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric >= 0) return numeric
  }
  return 0
}

export function resolveTransactionFacts(transaction = {}) {
  const rawFieldsUsed = {}
  const missingFields = []
  const confidenceWarnings = []

  const financeRaw = firstField(transaction, FINANCE_FIELD_CANDIDATES, rawFieldsUsed, 'financeType')
  const transactionTypeRaw = firstField(transaction, TRANSACTION_TYPE_FIELD_CANDIDATES, rawFieldsUsed, 'transactionType')
  const buyerEntityRaw = firstField(transaction, BUYER_ENTITY_FIELD_CANDIDATES, rawFieldsUsed, 'buyerEntityType')
  const sellerEntityRaw = firstField(transaction, SELLER_ENTITY_FIELD_CANDIDATES, rawFieldsUsed, 'sellerEntityType')
  const sellerBondRaw = firstField(transaction, SELLER_BOND_FIELD_CANDIDATES, rawFieldsUsed, 'sellerHasExistingBond')
  const cancellationRaw = firstField(transaction, CANCELLATION_FIELD_CANDIDATES, rawFieldsUsed, 'cancellationRequired')

  const financeType = normalizeFinanceType(financeRaw)
  const transactionType = normalizeTransactionType(transactionTypeRaw, transaction)
  const buyerEntityType = normalizeEntityType(buyerEntityRaw)
  const sellerEntityType = normalizeEntityType(sellerEntityRaw)
  const propertyType = normalizeKey(transaction?.property_type || transaction?.propertyType || transaction?.unit?.property_type)

  if (financeType === 'unknown') {
    missingFields.push('finance_type')
    confidenceWarnings.push('Finance type is missing or unknown; bond workflow is not required until finance is confirmed.')
  }
  if (transactionType === 'unknown') {
    missingFields.push('transaction_type')
    confidenceWarnings.push('Transaction type is missing; development/private/commercial legal requirements may be incomplete.')
  }
  if (buyerEntityType === 'unknown') {
    missingFields.push('buyer_entity_type')
    confidenceWarnings.push('Buyer entity type is missing; buyer-specific legal requirements may be incomplete.')
  }
  if (sellerEntityType === 'unknown') {
    missingFields.push('seller_entity_type')
    confidenceWarnings.push('Seller entity type is missing; seller-specific legal requirements may be incomplete.')
  }

  const isCashDeal = financeType === 'cash'
  const isBondDeal = financeType === 'bond'
  const isHybridDeal = financeType === 'hybrid'
  const sellerHasExistingBond = truthyFlag(sellerBondRaw)
  const cancellationRequired = truthyFlag(cancellationRaw) || sellerHasExistingBond
  const isCommercialTransaction = transactionType === 'commercial' || COMMERCIAL_PROPERTY_VALUES.has(propertyType)
  const isDevelopmentSale = transactionType === 'development_sale'
  const isResale = transactionType === 'resale'
  const isPrivateSale = transactionType === 'private_sale' || isResale

  if (!hasUsableValue(sellerBondRaw) && !hasUsableValue(cancellationRaw)) {
    confidenceWarnings.push('No seller bond/cancellation flag was found; cancellation workflow is not required by default.')
  }

  return {
    transactionId: transaction?.id || transaction?.transaction_id || null,
    transactionType,
    financeType,
    propertyType,
    isCashDeal,
    isBondDeal,
    isHybridDeal,
    requiresTransferAttorney: true,
    requiresBondAttorney: isBondDeal || isHybridDeal,
    requiresCancellationAttorney: cancellationRequired,
    buyerEntityType,
    sellerEntityType,
    buyerIsIndividual: buyerEntityType === 'individual',
    buyerIsCompany: buyerEntityType === 'company',
    buyerIsTrust: buyerEntityType === 'trust',
    sellerIsIndividual: sellerEntityType === 'individual',
    sellerIsCompany: sellerEntityType === 'company',
    sellerIsTrust: sellerEntityType === 'trust',
    isDevelopmentSale,
    isPrivateSale,
    isResale,
    isCommercialTransaction,
    sellerHasExistingBond,
    cancellationRequired,
    hasMultipleBuyers: countRelated(transaction, ['buyers', 'buyer_participants', 'buyer_count', 'purchaser_count']) > 1,
    hasMultipleSellers: countRelated(transaction, ['sellers', 'seller_participants', 'seller_count', 'vendor_count']) > 1,
    rawFieldsUsed,
    missingFields,
    confidenceWarnings,
  }
}

export const transactionFactsFieldCandidates = {
  finance: FINANCE_FIELD_CANDIDATES,
  transactionType: TRANSACTION_TYPE_FIELD_CANDIDATES,
  buyerEntityType: BUYER_ENTITY_FIELD_CANDIDATES,
  sellerEntityType: SELLER_ENTITY_FIELD_CANDIDATES,
  sellerBond: SELLER_BOND_FIELD_CANDIDATES,
  cancellation: CANCELLATION_FIELD_CANDIDATES,
}
