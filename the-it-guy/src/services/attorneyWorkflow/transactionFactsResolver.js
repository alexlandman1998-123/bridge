import { resolveBuyerOnboardingFlow } from '../../lib/buyerOnboardingFlow.js'

const CASH_FINANCE_VALUES = new Set(['cash', 'cash_sale', 'cash_deal', 'proof_of_funds'])
const BOND_FINANCE_VALUES = new Set(['bond', 'bonded', 'bond_finance', 'mortgage', 'home_loan'])
const HYBRID_FINANCE_VALUES = new Set(['hybrid', 'cash_and_bond', 'partial_bond', 'combination'])

const COMPANY_VALUES = new Set(['company', 'business', 'corporate', 'pty', 'pty_ltd', 'close_corporation', 'cc'])
const TRUST_VALUES = new Set(['trust', 'family_trust'])
const INDIVIDUAL_VALUES = new Set(['individual', 'person', 'natural_person', 'private_individual'])
const NATURAL_PERSON_PURCHASER_VALUES = new Set([
  'single',
  'unmarried',
  'not_married',
  'never_married',
  'divorced',
  'widowed',
  'married',
  'married_coc',
  'married_cop',
  'married_in_community',
  'married_in_community_of_property',
  'married_anc',
  'married_anc_accrual',
  'married_out_of_community',
  'married_out_of_community_of_property',
  'foreign',
  'foreign_purchaser',
  'foreign_individual',
  'foreign_buyer',
  'non_resident',
])

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

const PROPERTY_TENURE_FIELD_CANDIDATES = [
  'property_tenure',
  'propertyTenure',
  'property_structure_type',
  'propertyStructureType',
  'ownership_type',
  'ownershipType',
]

const VAT_TREATMENT_FIELD_CANDIDATES = [
  'vat_treatment',
  'vatTreatment',
  'transfer_tax_treatment',
  'vat_applicable',
  'vatApplicable',
  'is_vat_transaction',
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

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function extractRoutingProfile(transaction = {}) {
  return parseJsonObject(
    transaction.routingProfile ||
      transaction.routing_profile ||
      transaction.routing_profile_json ||
      transaction.routingProfileJson,
  )
}

function firstProfileField(profile, candidates, rawFieldsUsed, canonicalName) {
  for (const field of candidates) {
    const value = readPath(profile, field)
    if (hasUsableValue(value)) {
      rawFieldsUsed[canonicalName] = `routing_profile_json.${field}`
      return value
    }
  }
  return undefined
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
  if (normalized.includes('developer')) return 'developer'
  if (COMPANY_VALUES.has(normalized) || normalized.includes('company') || normalized.includes('pty')) return 'company'
  if (TRUST_VALUES.has(normalized) || normalized.includes('trust')) return 'trust'
  if (NATURAL_PERSON_PURCHASER_VALUES.has(normalized)) return 'individual'
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

function normalizePropertyTenure(value, transaction = {}) {
  const normalized = normalizeKey(value)
  const haystack = normalizeKey([
    value,
    transaction?.property_type,
    transaction?.propertyType,
    transaction?.unit?.property_type,
    transaction?.unit?.propertyType,
  ].filter(Boolean).join(' '))
  if (normalized === 'sectional_title' || haystack.includes('sectional') || haystack.includes('body_corporate')) return 'sectional_title'
  if (normalized === 'estate_hoa' || haystack.includes('estate') || haystack.includes('hoa')) return 'estate_hoa'
  if (normalized === 'freehold' || haystack.includes('freehold') || haystack.includes('full_title')) return 'freehold'
  if (haystack.includes('share_block')) return 'share_block'
  if (
    haystack.includes('vacant') ||
    haystack.includes('agricultural') ||
    haystack.includes('farm') ||
    haystack.includes('smallholding') ||
    haystack.includes('mixed_use') ||
    haystack.includes('commercial') ||
    haystack.includes('office') ||
    haystack.includes('warehouse') ||
    haystack.includes('retail') ||
    haystack.includes('industrial') ||
    haystack.includes('business') ||
    haystack.includes('land')
  ) {
    return 'freehold'
  }
  return normalized || 'unknown'
}

function normalizeVatTreatment(value) {
  const normalized = normalizeKey(value)
  if (!normalized) return 'unknown'
  if (['vat', 'vat_applicable', 'standard_vat', 'taxable_supply'].includes(normalized)) return 'vat'
  if (['zero_rated', 'zero_rated_going_concern', 'going_concern'].includes(normalized)) return 'zero_rated_going_concern'
  if (['transfer_duty', 'duty', 'no_vat', 'false'].includes(normalized)) return 'transfer_duty'
  if (truthyFlag(value)) return 'vat'
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

function extractOnboardingFormData(transaction = {}) {
  const candidates = [
    transaction.onboardingFormData,
    transaction.onboarding_form_data,
    transaction.buyerOnboardingFormData,
    transaction.buyer_onboarding_form_data,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate
    }
  }

  return {}
}

function extractBuyerOnboardingFlowSnapshot(transaction = {}, onboardingFormData = {}) {
  const candidates = [
    transaction.buyer_onboarding_flow,
    transaction.onboarding_flow,
    transaction.buyerOnboardingFlow,
    onboardingFormData.buyer_onboarding_flow,
    onboardingFormData.onboarding_flow,
  ]

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      (Array.isArray(candidate.visible_fields) ||
        Array.isArray(candidate.required_fields) ||
        typeof candidate.purchaser_branch === 'string' ||
        typeof candidate.finance_branch === 'string')
    ) {
      return candidate
    }
  }

  return null
}

export function resolveTransactionFacts(transaction = {}) {
  const rawFieldsUsed = {}
  const missingFields = []
  const confidenceWarnings = []
  const routingProfile = extractRoutingProfile(transaction)
  const onboardingFormData = extractOnboardingFormData(transaction)

  const financeRaw = firstProfileField(routingProfile, ['financeType', 'finance_type'], rawFieldsUsed, 'financeType') ??
    firstField(transaction, FINANCE_FIELD_CANDIDATES, rawFieldsUsed, 'financeType')
  const transactionTypeRaw = firstProfileField(routingProfile, ['transactionType', 'transaction_type'], rawFieldsUsed, 'transactionType') ??
    firstField(transaction, TRANSACTION_TYPE_FIELD_CANDIDATES, rawFieldsUsed, 'transactionType')
  const buyerEntityRaw = firstProfileField(routingProfile, ['buyerEntityType', 'buyer_entity_type', 'purchaserType', 'purchaser_type'], rawFieldsUsed, 'buyerEntityType') ??
    firstField(transaction, BUYER_ENTITY_FIELD_CANDIDATES, rawFieldsUsed, 'buyerEntityType')
  const sellerEntityRaw = firstProfileField(routingProfile, ['sellerEntityType', 'seller_entity_type', 'sellerType', 'seller_type'], rawFieldsUsed, 'sellerEntityType') ??
    firstField(transaction, SELLER_ENTITY_FIELD_CANDIDATES, rawFieldsUsed, 'sellerEntityType')
  const sellerBondRaw = firstProfileField(routingProfile, ['sellerHasExistingBond', 'seller_has_existing_bond', 'existingBond', 'existing_bond'], rawFieldsUsed, 'sellerHasExistingBond') ??
    firstField(transaction, SELLER_BOND_FIELD_CANDIDATES, rawFieldsUsed, 'sellerHasExistingBond')
  const cancellationRaw = firstProfileField(routingProfile, ['cancellationRequired', 'cancellation_required'], rawFieldsUsed, 'cancellationRequired') ??
    firstField(transaction, CANCELLATION_FIELD_CANDIDATES, rawFieldsUsed, 'cancellationRequired')
  const propertyTenureRaw = firstProfileField(routingProfile, ['propertyTenure', 'property_tenure'], rawFieldsUsed, 'propertyTenure') ??
    firstField(transaction, PROPERTY_TENURE_FIELD_CANDIDATES, rawFieldsUsed, 'propertyTenure')
  const vatTreatmentRaw = firstProfileField(routingProfile, ['vatTreatment', 'vat_treatment'], rawFieldsUsed, 'vatTreatment') ??
    firstField(transaction, VAT_TREATMENT_FIELD_CANDIDATES, rawFieldsUsed, 'vatTreatment')

  const financeType = normalizeFinanceType(financeRaw)
  const transactionType = normalizeTransactionType(transactionTypeRaw, transaction)
  const buyerEntityType = normalizeEntityType(buyerEntityRaw)
  const sellerEntityType = normalizeEntityType(sellerEntityRaw)
  const propertyType = normalizeKey(transaction?.property_type || transaction?.propertyType || transaction?.unit?.property_type)
  const propertyTenure = normalizePropertyTenure(propertyTenureRaw || propertyType, transaction)
  const vatTreatment = normalizeVatTreatment(vatTreatmentRaw)
  const buyerFlowSnapshot = extractBuyerOnboardingFlowSnapshot(transaction, onboardingFormData) ||
    (Object.keys(onboardingFormData || {}).length
      ? resolveBuyerOnboardingFlow(onboardingFormData, transaction, {
          purchaserType: onboardingFormData?.purchaser_type || buyerEntityType || transaction?.purchaser_type || 'individual',
          financeType: financeType || onboardingFormData?.purchase_finance_type || transaction?.finance_type || 'cash',
        })
      : null)

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
  if (propertyTenure === 'unknown') {
    missingFields.push('property_tenure')
    confidenceWarnings.push('Property tenure is missing; sectional title, HOA, and freehold transfer requirements may be incomplete.')
  }
  if ((transactionType === 'commercial' || transactionType === 'development_sale') && vatTreatment === 'unknown') {
    missingFields.push('vat_treatment')
    confidenceWarnings.push('VAT treatment is missing; VAT/transfer duty requirements may be incomplete.')
  }

  return {
    transactionId: transaction?.id || transaction?.transaction_id || routingProfile.transactionId || null,
    transactionType,
    financeType,
    propertyType,
    propertyTenure,
    vatTreatment,
    isCashDeal,
    isBondDeal,
    isHybridDeal,
    requiresTransferAttorney: hasUsableValue(routingProfile.requiresTransferAttorney) ? truthyFlag(routingProfile.requiresTransferAttorney) : true,
    requiresBondAttorney: hasUsableValue(routingProfile.requiresBondAttorney) ? truthyFlag(routingProfile.requiresBondAttorney) : isBondDeal || isHybridDeal,
    requiresCancellationAttorney: hasUsableValue(routingProfile.requiresCancellationAttorney) ? truthyFlag(routingProfile.requiresCancellationAttorney) : cancellationRequired,
    buyerEntityType,
    sellerEntityType,
    buyerIsIndividual: buyerEntityType === 'individual',
    buyerIsCompany: buyerEntityType === 'company',
    buyerIsTrust: buyerEntityType === 'trust',
    sellerIsIndividual: sellerEntityType === 'individual',
    sellerIsCompany: sellerEntityType === 'company',
    sellerIsTrust: sellerEntityType === 'trust',
    buyerBranch: String(buyerFlowSnapshot?.buyer_branch || buyerFlowSnapshot?.purchaser_branch || buyerEntityType || '').trim().toLowerCase(),
    buyerPurchaseMode: String(buyerFlowSnapshot?.buyer_purchase_mode || buyerFlowSnapshot?.purchase_mode || '').trim().toLowerCase(),
    buyerFinanceSupportMode: String(buyerFlowSnapshot?.buyer_finance_support_mode || buyerFlowSnapshot?.finance_support_mode || '').trim().toLowerCase(),
    buyerOnboardingFlowVersion: buyerFlowSnapshot?.version || buyerFlowSnapshot?.buyer_onboarding_flow_version || buyerFlowSnapshot?.onboarding_flow_version || '',
    buyerOnboardingFlow: buyerFlowSnapshot || null,
    isDevelopmentSale,
    isPrivateSale,
    isResale,
    isCommercialTransaction,
    isSectionalTitle: propertyTenure === 'sectional_title',
    isEstateHoa: propertyTenure === 'estate_hoa',
    isFreehold: propertyTenure === 'freehold',
    hasVatTreatment: vatTreatment === 'vat' || vatTreatment === 'zero_rated_going_concern',
    sellerHasExistingBond,
    cancellationRequired,
    requiredWorkflowKeys: Array.isArray(routingProfile.requiredWorkflowKeys) ? routingProfile.requiredWorkflowKeys.filter(Boolean) : [],
    requiredDocumentGroups: Array.isArray(routingProfile.requiredDocumentGroups) ? routingProfile.requiredDocumentGroups.filter(Boolean) : [],
    workflowTemplateKey: routingProfile.workflowTemplateKey || '',
    routingProfileVersion: routingProfile.version || transaction.routing_profile_version || transaction.routingProfileVersion || '',
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
  propertyTenure: PROPERTY_TENURE_FIELD_CANDIDATES,
  vatTreatment: VAT_TREATMENT_FIELD_CANDIDATES,
}
