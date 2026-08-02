import { resolveTransactionFacts } from '../attorneyWorkflow/transactionFactsResolver.js'
import {
  buildCanonicalRequiredDocumentRows,
  syncCanonicalRequiredDocumentRows,
} from './documentRequestCanonicalRequiredDocumentSyncService.js'

export const DOCUMENT_REQUEST_CANONICAL_TRANSACTION_SYNC_VERSION =
  'document_request_canonical_transaction_sync_v1'

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasValue(value) {
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function firstValue(...values) {
  return values.find(hasValue) ?? ''
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['true', 'yes', 'y', '1', 'required', 'applies', 'existing_bond', 'bond', 'outstanding'].includes(normalized)
}

function normalizeMaritalRegime(value) {
  const normalized = normalizeKey(value)
  if (
    [
      'cop',
      'married_cop',
      'married_coc',
      'in_community',
      'married_in_community',
      'married_in_community_of_property',
      'community_of_property',
    ].includes(normalized)
  ) {
    return 'married_cop'
  }
  if (
    [
      'anc',
      'married_anc',
      'married_anc_accrual',
      'out_of_community',
      'married_out_of_community',
      'married_out_of_community_of_property',
      'out_of_community_with_accrual',
      'out_of_community_without_accrual',
      'antenuptial_contract',
    ].includes(normalized)
  ) {
    return 'married_anc'
  }
  return normalized
}

function firstMaritalRegime(...values) {
  for (const value of values) {
    const normalized = normalizeMaritalRegime(value)
    if (normalized === 'married_cop' || normalized === 'married_anc') return normalized
  }
  return ''
}

function normalizeFormData(value = {}) {
  if (!isPlainObject(value)) return {}
  if (isPlainObject(value.formData)) return value.formData
  if (isPlainObject(value.form_data)) return value.form_data
  return value
}

function compact(values = []) {
  return values.map((value) => String(value || '').trim()).filter(Boolean)
}

function knownFact(value = '') {
  const normalized = normalizeKey(value)
  return normalized && normalized !== 'unknown' ? normalized : ''
}

function readPath(source = {}, path = '') {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((value, key) => {
      if (!isPlainObject(value)) return undefined
      return value[key]
    }, source)
}

function firstPath(source = {}, paths = []) {
  for (const path of paths) {
    const value = readPath(source, path)
    if (hasValue(value)) return value
  }
  return ''
}

function buildFactResolverInput({
  transaction = {},
  onboardingFormData = {},
  unit = null,
  listing = null,
  sellerFormData = {},
} = {}) {
  return {
    ...(transaction || {}),
    unit: unit || transaction?.unit || null,
    listing: listing || transaction?.listing || null,
    onboardingFormData,
    onboarding_form_data: onboardingFormData,
    sellerOnboardingFormData: sellerFormData,
    seller_onboarding_form_data: sellerFormData,
  }
}

function hasSellerSignal({ facts = {}, transaction = {}, sellerFormData = {}, listing = {} } = {}) {
  if (knownFact(facts.sellerEntityType)) return true
  return [
    transaction?.seller_entity_type,
    transaction?.seller_type,
    sellerFormData?.ownershipType,
    sellerFormData?.ownership_type,
    sellerFormData?.sellerEntityType,
    sellerFormData?.seller_entity_type,
    listing?.sellerEntityType,
    listing?.seller_entity_type,
  ].some(hasValue)
}

function propertyTriggerValues({ facts = {}, transaction = {}, sellerFormData = {}, listing = {} } = {}) {
  return compact([
    facts.propertyTenure,
    facts.propertyType,
    transaction?.property_tenure,
    transaction?.propertyTenure,
    transaction?.property_type,
    transaction?.propertyType,
    sellerFormData?.propertyCategory,
    sellerFormData?.property_category,
    sellerFormData?.propertyType,
    sellerFormData?.property_type,
    sellerFormData?.propertyStructureType,
    sellerFormData?.property_structure_type,
    listing?.propertyCategory,
    listing?.property_category,
    listing?.propertyType,
    listing?.property_type,
  ])
}

export function resolveCanonicalDocumentRequestSyncAudience({ audience = 'auto', buyerKnown = false, sellerKnown = false } = {}) {
  const normalized = normalizeKey(audience || 'auto')
  if (normalized && normalized !== 'auto') {
    if (normalized === 'shared') return 'client'
    return normalized
  }
  if (buyerKnown && sellerKnown) return 'client'
  if (buyerKnown) return 'buyer'
  if (sellerKnown) return 'seller'
  return 'none'
}

export function buildCanonicalDocumentRequestScenarioFromTransactionContext({
  transaction = {},
  onboardingFormData = {},
  sellerFormData = {},
  listing = {},
  unit = null,
  explicitScenario = null,
} = {}) {
  const normalizedOnboardingFormData = normalizeFormData(onboardingFormData)
  const normalizedSellerFormData = normalizeFormData(sellerFormData)
  const normalizedListing = isPlainObject(listing) ? listing : {}
  const normalizedTransaction = isPlainObject(transaction) ? transaction : {}
  const facts = resolveTransactionFacts(
    buildFactResolverInput({
      transaction: normalizedTransaction,
      onboardingFormData: normalizedOnboardingFormData,
      sellerFormData: normalizedSellerFormData,
      listing: normalizedListing,
      unit,
    }),
  )

  const explicit = isPlainObject(explicitScenario) ? explicitScenario : {}
  const buyerEntityType = firstValue(
    explicit.buyerEntityType,
    explicit.buyer_entity_type,
    knownFact(facts.buyerEntityType),
  )
  const sellerEntityType = firstValue(
    explicit.sellerEntityType,
    explicit.seller_entity_type,
    knownFact(facts.sellerEntityType),
  )
  const financeType = firstValue(explicit.financeType, explicit.finance_type, knownFact(facts.financeType))
  const buyerMaritalRegime = firstMaritalRegime(
    explicit.buyerMaritalRegime,
    explicit.buyer_marital_regime,
    explicit.buyerMaritalStatus,
    explicit.buyer_marital_status,
    normalizedTransaction.buyer_marital_regime,
    normalizedTransaction.buyer_marital_status,
    normalizedTransaction.marital_regime,
    normalizedTransaction.marital_status,
    firstPath(normalizedOnboardingFormData, [
      'buyer.marital_regime',
      'personal.marital_regime',
      'marital_regime',
    ]),
    firstPath(normalizedOnboardingFormData, [
      'buyer.marital_status',
      'personal.marital_status',
      'marital_status',
    ]),
    normalizedTransaction.purchaser_type,
    firstPath(normalizedOnboardingFormData, ['purchaser_type']),
  )
  const sellerMaritalRegime = firstMaritalRegime(
    explicit.sellerMaritalRegime,
    explicit.seller_marital_regime,
    explicit.sellerMaritalStatus,
    explicit.seller_marital_status,
    normalizedTransaction.seller_marital_regime,
    normalizedTransaction.seller_marital_status,
    normalizedSellerFormData.sellerMaritalRegime,
    normalizedSellerFormData.seller_marital_regime,
    normalizedSellerFormData.sellerMaritalStatus,
    normalizedSellerFormData.seller_marital_status,
    normalizedSellerFormData.maritalRegime,
    normalizedSellerFormData.marital_regime,
    normalizedSellerFormData.maritalStatus,
    normalizedSellerFormData.marital_status,
    firstPath(normalizedSellerFormData, ['seller.marital_regime']),
    firstPath(normalizedSellerFormData, ['seller.marital_status']),
  )
  const sellerKnown = hasSellerSignal({
    facts,
    transaction: normalizedTransaction,
    sellerFormData: normalizedSellerFormData,
    listing: normalizedListing,
  })
  const buyerKnown = Boolean(buyerEntityType)
  const propertyTriggers = propertyTriggerValues({
    facts,
    transaction: normalizedTransaction,
    sellerFormData: normalizedSellerFormData,
    listing: normalizedListing,
  })
  const propertyType = firstValue(explicit.propertyType, explicit.property_type, facts.propertyTenure, facts.propertyType)
  const sellerHasExistingBond = normalizeBoolean(
    firstValue(
      explicit.sellerHasExistingBond,
      explicit.seller_has_existing_bond,
      facts.sellerHasExistingBond,
      normalizedTransaction.seller_has_existing_bond,
      normalizedTransaction.existing_bond,
      normalizedTransaction.cancellation_required,
      normalizedSellerFormData.sellerHasExistingBond,
      normalizedSellerFormData.seller_has_existing_bond,
      normalizedSellerFormData.existingBond,
      normalizedSellerFormData.existing_bond,
    ),
  )

  const scenario = {
    ...explicit,
    buyerEntityType,
    sellerEntityType,
    buyerMaritalRegime,
    sellerMaritalRegime,
    financeType,
    sellerHasExistingBond,
    requiresCancellationAttorney:
      normalizeBoolean(explicit.requiresCancellationAttorney || explicit.requires_cancellation_attorney) ||
      facts.requiresCancellationAttorney === true ||
      sellerHasExistingBond,
    propertyType,
    propertyTriggers,
    gasInstallation: normalizeBoolean(
      firstValue(
        explicit.gasInstallation,
        explicit.gas_installation,
        normalizedSellerFormData.gasInstallation,
        normalizedSellerFormData.gas_installation,
        normalizedListing.gasInstallation,
        normalizedListing.gas_installation,
      ),
    ),
    electricFence: normalizeBoolean(
      firstValue(
        explicit.electricFence,
        explicit.electric_fence,
        normalizedSellerFormData.electricFence,
        normalizedSellerFormData.electric_fence,
        normalizedListing.electricFence,
        normalizedListing.electric_fence,
      ),
    ),
    municipalWaterCocRequired: normalizeBoolean(
      firstValue(
        explicit.municipalWaterCocRequired,
        explicit.municipal_water_coc_required,
        normalizedSellerFormData.municipalWaterCocRequired,
        normalizedSellerFormData.municipal_water_coc_required,
      ),
    ),
    beetleCertificateRequired: normalizeBoolean(
      firstValue(
        explicit.beetleCertificateRequired,
        explicit.beetle_certificate_required,
        normalizedSellerFormData.beetleCertificateRequired,
        normalizedSellerFormData.beetle_certificate_required,
      ),
    ),
    solarInstallation: normalizeBoolean(
      firstValue(
        explicit.solarInstallation,
        explicit.solar_installation,
        normalizedSellerFormData.solarInstallation,
        normalizedSellerFormData.solar_installation,
      ),
    ),
    alterations: normalizeBoolean(
      firstValue(explicit.alterations, normalizedSellerFormData.alterations, normalizedListing.alterations),
    ),
    newBuilding: normalizeBoolean(
      firstValue(
        explicit.newBuilding,
        explicit.new_building,
        normalizedSellerFormData.newBuilding,
        normalizedSellerFormData.new_building,
      ),
    ),
    developmentSale: normalizeBoolean(
      firstValue(
        explicit.developmentSale,
        explicit.development_sale,
        normalizedSellerFormData.developmentSale,
        normalizedSellerFormData.development_sale,
        normalizedTransaction.development_id,
      ),
    ),
    municipalRequirement: normalizeBoolean(
      firstValue(
        explicit.municipalRequirement,
        explicit.municipal_requirement,
        normalizedSellerFormData.municipalRequirement,
        normalizedSellerFormData.municipal_requirement,
      ),
    ),
    vatTransaction:
      facts.hasVatTreatment === true ||
      normalizeBoolean(
        firstValue(
          explicit.vatTransaction,
          explicit.vat_transaction,
          normalizedSellerFormData.vatTransaction,
          normalizedSellerFormData.vat_transaction,
          normalizedTransaction.vat_transaction,
        ),
      ),
  }

  return {
    version: DOCUMENT_REQUEST_CANONICAL_TRANSACTION_SYNC_VERSION,
    scenario,
    facts,
    coverage: {
      buyerKnown,
      sellerKnown,
      financeKnown: Boolean(financeType),
      propertyKnown: Boolean(propertyType || propertyTriggers.length),
    },
    confidenceWarnings: facts.confidenceWarnings || [],
    missingFields: facts.missingFields || [],
  }
}

export function buildCanonicalRequiredDocumentRowsForTransactionContext({
  transactionId = '',
  audience = 'auto',
  transaction = {},
  onboardingFormData = {},
  sellerFormData = {},
  listing = {},
  unit = null,
  explicitScenario = null,
  existingRows = [],
  requestPendingPolicy = false,
  includePendingPolicyRows = false,
} = {}) {
  const resolvedTransactionId = transactionId || transaction?.id || transaction?.transaction_id
  if (!resolvedTransactionId) throw new Error('transactionId is required.')
  const derived = buildCanonicalDocumentRequestScenarioFromTransactionContext({
    transaction,
    onboardingFormData,
    sellerFormData,
    listing,
    unit,
    explicitScenario,
  })
  const resolvedAudience = resolveCanonicalDocumentRequestSyncAudience({
    audience,
    buyerKnown: derived.coverage.buyerKnown,
    sellerKnown: derived.coverage.sellerKnown,
  })

  if (resolvedAudience === 'none') {
    return {
      ...derived,
      transactionId: resolvedTransactionId,
      audience: resolvedAudience,
      rows: [],
      skipped: true,
      reason: 'insufficient_transaction_facts',
    }
  }

  const result = buildCanonicalRequiredDocumentRows({
    transactionId: resolvedTransactionId,
    scenario: derived.scenario,
    audience: resolvedAudience,
    existingRows,
    requestPendingPolicy,
    includePendingPolicyRows,
  })

  return {
    ...result,
    transactionSyncVersion: DOCUMENT_REQUEST_CANONICAL_TRANSACTION_SYNC_VERSION,
    requestedAudience: audience,
    derivedAudience: resolvedAudience,
    derivedScenario: derived.scenario,
    transactionFacts: derived.facts,
    coverage: derived.coverage,
    confidenceWarnings: derived.confidenceWarnings,
    missingFields: derived.missingFields,
  }
}

export async function syncCanonicalRequiredDocumentsForTransactionContext({
  client,
  transactionId = '',
  audience = 'auto',
  transaction = {},
  onboardingFormData = {},
  sellerFormData = {},
  listing = {},
  unit = null,
  explicitScenario = null,
  requestPendingPolicy = false,
  includePendingPolicyRows = false,
  dryRun = false,
} = {}) {
  if (!client?.from) throw new Error('client is required.')
  const resolvedTransactionId = transactionId || transaction?.id || transaction?.transaction_id
  if (!resolvedTransactionId) throw new Error('transactionId is required.')
  const derived = buildCanonicalDocumentRequestScenarioFromTransactionContext({
    transaction,
    onboardingFormData,
    sellerFormData,
    listing,
    unit,
    explicitScenario,
  })
  const resolvedAudience = resolveCanonicalDocumentRequestSyncAudience({
    audience,
    buyerKnown: derived.coverage.buyerKnown,
    sellerKnown: derived.coverage.sellerKnown,
  })

  if (resolvedAudience === 'none') {
    return {
      ...derived,
      transactionId: resolvedTransactionId,
      audience: resolvedAudience,
      rows: [],
      dryRun: Boolean(dryRun),
      synced: 0,
      skipped: true,
      reason: 'insufficient_transaction_facts',
      persistedRows: [],
    }
  }

  const result = await syncCanonicalRequiredDocumentRows({
    client,
    transactionId: resolvedTransactionId,
    scenario: derived.scenario,
    audience: resolvedAudience,
    requestPendingPolicy,
    includePendingPolicyRows,
    dryRun,
  })

  return {
    ...result,
    transactionSyncVersion: DOCUMENT_REQUEST_CANONICAL_TRANSACTION_SYNC_VERSION,
    requestedAudience: audience,
    derivedAudience: resolvedAudience,
    derivedScenario: derived.scenario,
    transactionFacts: derived.facts,
    coverage: derived.coverage,
    confidenceWarnings: derived.confidenceWarnings,
    missingFields: derived.missingFields,
  }
}
