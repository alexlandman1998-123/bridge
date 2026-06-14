import { resolveTransactionFacts } from './attorneyWorkflow/transactionFactsResolver.js'

export const TRANSACTION_ROUTING_PROFILE_VERSION = 'transaction_routing_profile_v1'

const FINANCE_WORKFLOW_BY_TYPE = Object.freeze({
  cash: 'finance_cash',
  bond: 'finance_bond',
  hybrid: 'finance_hybrid',
  combination: 'finance_hybrid',
  developer: 'finance_unknown',
  unknown: 'finance_unknown',
})

const ENTITY_ALIASES = Object.freeze({
  company: new Set(['company', 'business', 'corporate', 'pty', 'pty_ltd', 'close_corporation', 'cc', 'developer']),
  trust: new Set(['trust', 'family_trust']),
  individual: new Set(['individual', 'person', 'natural_person', 'private_individual']),
})

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function hasValue(value) {
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function truthyFlag(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['1', 'true', 'yes', 'y', 'required', 'applies', 'applicable', 'vat', 'existing_bond', 'outstanding_bond'].includes(normalized)
}

function firstValue(...values) {
  for (const value of values) {
    if (hasValue(value)) return value
  }
  return undefined
}

function normalizeFinanceType(value) {
  const normalized = normalizeKey(value)
  if (!normalized) return 'unknown'
  if (normalized.includes('cash') && (normalized.includes('bond') || normalized.includes('mortgage'))) return 'hybrid'
  if (['hybrid', 'combination', 'cash_and_bond', 'partial_bond', 'cash_bond'].includes(normalized)) return 'hybrid'
  if (['bond', 'bonded', 'bond_finance', 'mortgage', 'home_loan'].includes(normalized) || normalized.includes('bond') || normalized.includes('mortgage')) return 'bond'
  if (['cash', 'cash_sale', 'cash_deal', 'proof_of_funds'].includes(normalized) || normalized.includes('cash')) return 'cash'
  if (normalized.includes('developer')) return 'developer'
  return normalized
}

function normalizeEntityType(value, fallback = 'unknown') {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (normalized.includes('developer')) return 'developer'
  if (ENTITY_ALIASES.company.has(normalized) || normalized.includes('company') || normalized.includes('pty') || normalized.includes('developer')) return 'company'
  if (ENTITY_ALIASES.trust.has(normalized) || normalized.includes('trust')) return 'trust'
  if (ENTITY_ALIASES.individual.has(normalized) || normalized.includes('individual') || normalized.includes('person')) return 'individual'
  return normalized
}

function normalizeTransactionType(value, context = {}) {
  const normalized = normalizeKey(value)
  if (
    context.transaction?.development_id ||
    context.transaction?.developmentId ||
    context.listing?.developmentId ||
    context.listing?.development_id ||
    context.development?.id ||
    context.unit?.development_id ||
    context.unit?.developmentId
  ) {
    return 'development_sale'
  }
  if (['development', 'development_sale', 'new_development', 'off_plan', 'developer_sale'].includes(normalized)) return 'development_sale'
  if (['commercial', 'commercial_transaction', 'commercial_sale'].includes(normalized)) return 'commercial'
  if (normalized === 'resale') return 'resale'
  if (['private', 'private_sale', 'private_property', 'seller_owned', 'sale'].includes(normalized)) return 'private_sale'
  return normalized || 'unknown'
}

function normalizePropertyTenure(value, context = {}) {
  const normalized = normalizeKey(value)
  const haystack = normalizeKey([
    value,
    context.transaction?.property_tenure,
    context.transaction?.propertyTenure,
    context.transaction?.property_type,
    context.transaction?.propertyType,
    context.listing?.propertyTenure,
    context.listing?.property_tenure,
    context.listing?.propertyStructureType,
    context.listing?.property_structure_type,
    context.listing?.propertyType,
    context.listing?.property_type,
    context.listing?.ownershipType,
    context.listing?.sellerOnboarding?.formData?.ownershipType,
    context.listing?.sellerOnboarding?.formData?.propertyStructureType,
    context.sellerOnboarding?.formData?.ownershipType,
    context.sellerOnboarding?.formData?.propertyStructureType,
    context.unit?.property_type,
    context.unit?.propertyType,
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
  return 'unknown'
}

function normalizeVatTreatment(value, context = {}) {
  const normalized = normalizeKey(value)
  if (['vat', 'vat_applicable', 'standard_vat', 'taxable_supply'].includes(normalized)) return 'vat'
  if (['zero_rated', 'zero_rated_going_concern', 'going_concern'].includes(normalized)) return 'zero_rated_going_concern'
  if (['transfer_duty', 'duty', 'no_vat'].includes(normalized)) return 'transfer_duty'

  const vatApplicable = firstValue(
    context.transaction?.vat_applicable,
    context.transaction?.vatApplicable,
    context.transaction?.is_vat_transaction,
    context.listing?.vatApplicable,
    context.listing?.sellerOnboarding?.formData?.vatApplicable,
    context.sellerOnboarding?.formData?.vatApplicable,
  )
  if (truthyFlag(vatApplicable)) return 'vat'
  if (hasValue(vatApplicable) && !truthyFlag(vatApplicable)) return 'transfer_duty'
  return 'unknown'
}

function extractSellerOnboarding(input = {}) {
  return (
    input.sellerOnboarding ||
    input.seller_onboarding ||
    input.listing?.sellerOnboarding ||
    input.listing?.seller_onboarding ||
    {}
  )
}

function extractFormData(input = {}) {
  const onboarding = extractSellerOnboarding(input)
  return {
    ...((onboarding?.formData && typeof onboarding.formData === 'object') ? onboarding.formData : {}),
    ...((onboarding?.form_data && typeof onboarding.form_data === 'object') ? onboarding.form_data : {}),
    ...((input.formData && typeof input.formData === 'object') ? input.formData : {}),
    ...((input.form_data && typeof input.form_data === 'object') ? input.form_data : {}),
  }
}

function buildResolverInput(input = {}) {
  const transaction = input.transaction || input.transactionRow || input.transaction_row || input
  const listing = input.listing || input.privateListing || input.private_listing || {}
  const offer = input.offer || input.acceptedOffer || input.accepted_offer || {}
  const development = input.development || listing?.development || {}
  const unit = input.unit || transaction?.unit || listing?.unit || {}
  const buyerLead = input.buyerLead || input.buyer_lead || input.lead || {}
  const sellerLead = input.sellerLead || input.seller_lead || {}
  const sellerOnboarding = extractSellerOnboarding(input)
  const formData = extractFormData(input)

  return {
    id: transaction?.id || transaction?.transaction_id || null,
    finance_type: firstValue(
      transaction?.finance_type,
      transaction?.financeType,
      transaction?.purchase_finance_type,
      transaction?.funding_type,
      transaction?.fundingType,
      transaction?.purchase_type,
      transaction?.purchaseType,
      input.financeType,
      input.finance_type,
      input.fundingType,
      input.funding_type,
      offer?.financeType,
      offer?.finance_type,
      offer?.offer?.financeType,
      formData.purchaseFinanceType,
      formData.purchase_finance_type,
      formData.financeType,
      buyerLead.financeType,
    ),
    transaction_type: firstValue(
      transaction?.transaction_type,
      transaction?.transactionType,
      transaction?.property_transaction_type,
      transaction?.propertyTransactionType,
      transaction?.sale_type,
      transaction?.saleType,
      input.transactionType,
      input.transaction_type,
      input.propertyTransactionType,
      input.property_transaction_type,
      listing?.listingCategory,
      listing?.listing_category,
      listing?.listingSource,
      listing?.listing_source,
      formData.transactionType,
      formData.saleType,
    ),
    property_type: firstValue(
      transaction?.property_type,
      transaction?.propertyType,
      listing?.propertyType,
      listing?.property_type,
      listing?.propertyStructureType,
      listing?.property_structure_type,
      unit?.property_type,
      unit?.propertyType,
      formData.propertyType,
      formData.propertyStructureType,
    ),
    property_tenure: firstValue(
      transaction?.property_tenure,
      transaction?.propertyTenure,
      listing?.propertyTenure,
      listing?.property_tenure,
      formData.propertyTenure,
    ),
    vat_treatment: firstValue(
      transaction?.vat_treatment,
      transaction?.vatTreatment,
      transaction?.transfer_tax_treatment,
      input.vatTreatment,
      input.vat_treatment,
      listing?.vatTreatment,
      listing?.vat_treatment,
      formData.vatTreatment,
      formData.vat_treatment,
    ),
    buyer_entity_type: firstValue(
      transaction?.buyer_entity_type,
      transaction?.buyerEntityType,
      transaction?.purchaser_type,
      input.buyerEntityType,
      input.purchaserType,
      buyerLead.entityType,
      buyerLead.buyerType,
      buyerLead.purchaserType,
      formData.buyerEntityType,
      formData.purchaser_type,
      formData.purchaserType,
    ),
    seller_entity_type: firstValue(
      transaction?.seller_entity_type,
      transaction?.sellerEntityType,
      transaction?.seller_type,
      input.sellerEntityType,
      listing?.sellerType,
      listing?.seller_type,
      listing?.seller?.type,
      listing?.seller?.sellerType,
      sellerLead.sellerType,
      sellerLead.seller_type,
      formData.sellerType,
      formData.seller_type,
      sellerOnboarding?.seller_type,
    ),
    seller_has_existing_bond: firstValue(
      transaction?.seller_has_existing_bond,
      transaction?.sellerHasExistingBond,
      transaction?.existing_bond,
      transaction?.existingBond,
      input.sellerHasExistingBond,
      input.existingBond,
      listing?.sellerHasExistingBond,
      listing?.existingBond,
      listing?.seller?.hasExistingBond,
      formData.sellerHasExistingBond,
      formData.existingBond,
      formData.outstandingBond,
    ),
    cancellation_required: firstValue(
      transaction?.cancellation_required,
      transaction?.cancellationRequired,
      input.cancellationRequired,
      listing?.cancellationRequired,
      formData.cancellationRequired,
      formData.bondCancellationRequired,
    ),
    development_id: transaction?.development_id || transaction?.developmentId || listing?.developmentId || listing?.development_id || development?.id || unit?.development_id || null,
    development,
    unit,
    listing,
    buyerLead,
    sellerLead,
    sellerOnboarding,
    formData,
  }
}

function compactUnique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

export function resolveWorkflowKeysForRoutingProfile(profile = {}) {
  const financeWorkflowKey = FINANCE_WORKFLOW_BY_TYPE[profile.financeType] || 'finance_unknown'
  return compactUnique([
    'sales_otp',
    financeWorkflowKey,
    'attorney_transfer',
    profile.requiresBondAttorney ? 'attorney_bond' : '',
    profile.requiresCancellationAttorney ? 'seller_bond_cancellation' : '',
    'registration',
  ])
}

export function resolveWorkflowTemplateKeyForRoutingProfile(profile = {}) {
  const financeType = profile.financeType || 'unknown'
  if (profile.transactionType === 'development_sale') return `development_${financeType === 'unknown' ? 'unknown' : financeType}`
  if (profile.transactionType === 'commercial') {
    return profile.vatTreatment === 'vat' || profile.vatTreatment === 'zero_rated_going_concern'
      ? `commercial_${profile.vatTreatment}`
      : 'commercial_transfer'
  }
  if (profile.propertyTenure === 'sectional_title') return `${financeType}_sectional_title`
  if (profile.propertyTenure === 'estate_hoa') return `${financeType}_estate_hoa`
  if (profile.propertyTenure === 'freehold') return `${financeType}_freehold_resale`
  return `${financeType}_property_transfer`
}

export function resolveRequiredDocumentGroupsForRoutingProfile(profile = {}) {
  return compactUnique([
    'buyer_identity_fica',
    'seller_identity_fica',
    'seller_authority',
    profile.financeType === 'cash' || profile.financeType === 'hybrid' ? 'buyer_finance' : '',
    profile.requiresBondAttorney ? 'bond_originator' : '',
    'attorney_transfer_readiness',
    profile.requiresCancellationAttorney ? 'property_finance_existing_bond' : '',
    profile.propertyTenure === 'sectional_title' ? 'sectional_title_body_corporate' : '',
    profile.propertyTenure === 'estate_hoa' ? 'estate_hoa' : '',
    profile.transactionType === 'development_sale' ? 'developer_sale_pack' : '',
    profile.transactionType === 'commercial' ? 'commercial_due_diligence' : '',
    profile.vatTreatment === 'vat' || profile.vatTreatment === 'zero_rated_going_concern' ? 'vat_transfer_treatment' : '',
  ])
}

function buildWarnings({ facts, propertyTenure, vatTreatment, transactionType, context }) {
  const warnings = [...(facts.confidenceWarnings || [])]
  const missingFields = [...(facts.missingFields || [])]

  if (propertyTenure === 'unknown') {
    warnings.push('Property tenure is missing; sectional title, HOA, and freehold transfer requirements may be incomplete.')
    missingFields.push('property_tenure')
  }

  if ((transactionType === 'commercial' || transactionType === 'development_sale') && vatTreatment === 'unknown') {
    warnings.push('VAT treatment is missing; transfer duty/VAT routing may be incomplete.')
    missingFields.push('vat_treatment')
  }

  if (!hasValue(context.resolverInput?.seller_has_existing_bond) && !hasValue(context.resolverInput?.cancellation_required)) {
    warnings.push('Seller existing bond/cancellation input is missing; cancellation workflow will remain off until confirmed.')
  }

  return {
    warnings: compactUnique(warnings),
    missingFields: compactUnique(missingFields),
  }
}

export function resolveTransactionRoutingProfile(input = {}) {
  const resolverInput = buildResolverInput(input || {})
  const facts = resolveTransactionFacts(resolverInput)
  const context = {
    transaction: input.transaction || input.transactionRow || input.transaction_row || input || {},
    listing: input.listing || input.privateListing || input.private_listing || {},
    development: input.development || {},
    unit: input.unit || {},
    sellerOnboarding: extractSellerOnboarding(input),
    resolverInput,
  }
  const financeType = normalizeFinanceType(facts.financeType)
  const transactionType = normalizeTransactionType(facts.transactionType, context)
  const propertyTenure = normalizePropertyTenure(resolverInput.property_tenure || resolverInput.property_type, context)
  const buyerEntityType = normalizeEntityType(facts.buyerEntityType)
  const sellerEntityType = transactionType === 'development_sale' && facts.sellerEntityType === 'unknown'
    ? 'developer'
    : normalizeEntityType(facts.sellerEntityType)
  const vatTreatment = normalizeVatTreatment(
    firstValue(
      resolverInput.vat_treatment,
      context.transaction?.vat_treatment,
      context.transaction?.vatTreatment,
      context.listing?.vatTreatment,
      context.listing?.sellerOnboarding?.formData?.vatTreatment,
      context.sellerOnboarding?.formData?.vatTreatment,
    ),
    context,
  )
  const sellerHasExistingBond = Boolean(facts.sellerHasExistingBond)
  const cancellationRequired = Boolean(facts.cancellationRequired || sellerHasExistingBond)

  const baseProfile = {
    version: TRANSACTION_ROUTING_PROFILE_VERSION,
    transactionId: facts.transactionId,
    financeType,
    transactionType,
    propertyTenure,
    buyerEntityType,
    sellerEntityType,
    sellerHasExistingBond,
    cancellationRequired,
    vatTreatment: vatTreatment === 'unknown' && transactionType !== 'commercial' && transactionType !== 'development_sale' ? 'transfer_duty' : vatTreatment,
    requiresTransferAttorney: true,
    requiresBondAttorney: financeType === 'bond' || financeType === 'hybrid',
    requiresCancellationAttorney: cancellationRequired,
    isDevelopmentSale: transactionType === 'development_sale',
    isCommercialTransaction: transactionType === 'commercial',
    isSectionalTitle: propertyTenure === 'sectional_title',
    isEstateHoa: propertyTenure === 'estate_hoa',
    rawFacts: facts,
    rawFieldSources: facts.rawFieldsUsed || {},
  }
  const workflowTemplateKey = resolveWorkflowTemplateKeyForRoutingProfile(baseProfile)
  const requiredWorkflowKeys = resolveWorkflowKeysForRoutingProfile(baseProfile)
  const requiredDocumentGroups = resolveRequiredDocumentGroupsForRoutingProfile(baseProfile)
  const diagnostics = buildWarnings({
    facts,
    propertyTenure,
    vatTreatment: baseProfile.vatTreatment,
    transactionType,
    context,
  })

  return {
    ...baseProfile,
    workflowTemplateKey,
    requiredWorkflowKeys,
    requiredDocumentGroups,
    warnings: diagnostics.warnings,
    missingFields: diagnostics.missingFields,
    sourceSnapshot: {
      transactionId: resolverInput.id || null,
      listingId: resolverInput.listing?.id || resolverInput.listing?.listingId || null,
      developmentId: resolverInput.development_id || null,
      financeTypeSource: resolverInput.finance_type || null,
      transactionTypeSource: resolverInput.transaction_type || null,
      propertyTypeSource: resolverInput.property_type || null,
      propertyTenureSource: resolverInput.property_tenure || null,
    },
  }
}

export function summarizeTransactionRoutingProfile(profile = {}) {
  return [
    profile.financeType && profile.financeType !== 'unknown' ? profile.financeType : 'unknown finance',
    profile.propertyTenure && profile.propertyTenure !== 'unknown' ? profile.propertyTenure : '',
    profile.transactionType && profile.transactionType !== 'unknown' ? profile.transactionType : '',
  ].filter(Boolean).join(' + ')
}
