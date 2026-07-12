import {
  LEGAL_SCENARIO_MATRIX_VERSION,
  LEGAL_SCENARIO_STATUSES,
  resolveLegalMatterSupport,
} from './legalScenarioMatrix.js'

export const LEGAL_SUPPORT_BOUNDARY_VERSION = 'legal_support_boundary_v1'

export const LEGAL_SUPPORT_BOUNDARY_REQUIREMENT_KEYS = Object.freeze({
  manualReview: 'legal_support_boundary_review',
  unsupported: 'legal_support_boundary_stop',
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return value
  return normalizeText(value).length > 0
}

function firstValue(...values) {
  return values.find((value) => hasValue(value))
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined || value === '') return []
  return [value]
}

function truthyFlag(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['1', 'true', 'yes', 'y', 'on', 'required', 'applicable'].includes(normalized)
}

function extractConditionValues(source = {}) {
  const values = [
    ...toArray(source.conditions),
    ...toArray(source.conditionTypes),
    ...toArray(source.condition_types),
    source.conditionType,
    source.condition_type,
    source.suspensiveConditionType,
    source.suspensive_condition_type,
    source.specialConditionType,
    source.special_condition_type,
  ]

  if (truthyFlag(source.subjectToSale ?? source.subject_to_sale ?? source.purchaseSubjectToSale)) {
    values.push('subject_to_sale')
  }
  if (truthyFlag(source.subjectToInspection ?? source.subject_to_inspection ?? source.inspectionCondition)) {
    values.push('subject_to_inspection')
  }
  if (truthyFlag(source.otpAddendum ?? source.otp_addendum ?? source.saleAgreementAddendum)) {
    values.push('otp_addendum')
  }

  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function getNestedValue(object = {}, path = []) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return current[key]
  }, object)
}

export function buildLegalSupportBoundaryInput({
  transaction = {},
  formData = {},
  listing = {},
  onboardingData = {},
} = {}) {
  const form = formData && typeof formData === 'object' ? formData : {}
  const onboarding = onboardingData && typeof onboardingData === 'object' ? onboardingData : {}
  const tx = transaction && typeof transaction === 'object' ? transaction : {}
  const listingData = listing && typeof listing === 'object' ? listing : {}
  const buyerFacts = getNestedValue(tx, ['facts', 'buyer']) || getNestedValue(form, ['facts', 'buyer']) || {}
  const sellerFacts = getNestedValue(tx, ['facts', 'seller']) || getNestedValue(form, ['facts', 'seller']) || {}
  const propertyFacts = getNestedValue(tx, ['facts', 'property']) || getNestedValue(form, ['facts', 'property']) || {}

  const buyerType = firstValue(
    form.buyerType,
    form.buyer_type,
    form.purchaserType,
    form.purchaser_type,
    form.purchaser_entity_type,
    form.buyerLegalType,
    form.buyer_legal_type,
    tx.buyerType,
    tx.buyer_type,
    tx.purchaserType,
    tx.purchaser_type,
    tx.purchaser_entity_type,
    tx.buyer_entity_type,
    tx.buyerLegalType,
    tx.buyer_legal_type,
    buyerFacts.legal_type,
    buyerFacts.purchaser_type,
  )

  const sellerType = firstValue(
    onboarding.sellerType,
    onboarding.seller_type,
    onboarding.ownerType,
    onboarding.owner_type,
    onboarding.ownershipType,
    onboarding.ownership_type,
    onboarding.ownershipStructure,
    onboarding.ownership_structure,
    onboarding.entityType,
    onboarding.entity_type,
    form.sellerType,
    form.seller_type,
    form.ownerType,
    form.owner_type,
    form.ownershipType,
    form.ownership_type,
    form.ownershipStructure,
    form.ownership_structure,
    form.seller_entity_type,
    listingData.sellerType,
    listingData.seller_type,
    listingData.ownerType,
    listingData.owner_type,
    listingData.ownershipType,
    listingData.ownership_type,
    listingData.ownership_structure,
    tx.sellerType,
    tx.seller_type,
    tx.seller_entity_type,
    tx.seller_legal_type,
    tx.ownerType,
    tx.owner_type,
    tx.ownershipType,
    tx.ownership_type,
    tx.ownership_structure,
    sellerFacts.legal_type,
    sellerFacts.owner_type,
  )

  const financeType = firstValue(
    form.purchase_finance_type,
    form.financeType,
    form.finance_type,
    form.fundingType,
    form.funding_type,
    tx.purchase_finance_type,
    tx.financeType,
    tx.finance_type,
    tx.fundingType,
    tx.funding_type,
  )

  const propertyType = firstValue(
    onboarding.propertyStructureType,
    onboarding.property_structure_type,
    onboarding.propertyCategory,
    onboarding.property_category,
    onboarding.propertyType,
    onboarding.property_type,
    form.propertyStructureType,
    form.property_structure_type,
    form.propertyCategory,
    form.property_category,
    form.propertyType,
    form.property_type,
    listingData.propertyStructureType,
    listingData.property_structure_type,
    listingData.propertyCategory,
    listingData.property_category,
    listingData.propertyType,
    listingData.property_type,
    tx.propertyStructureType,
    tx.property_structure_type,
    tx.propertyCategory,
    tx.property_category,
    tx.propertyType,
    tx.property_type,
    tx.propertyTenure,
    tx.property_tenure,
    propertyFacts.type,
    propertyFacts.property_type,
  )

  return {
    buyerType,
    sellerType,
    financeType,
    propertyType,
    conditions: [
      ...extractConditionValues(tx),
      ...extractConditionValues(form),
      ...extractConditionValues(onboarding),
      ...extractConditionValues(listingData),
    ],
  }
}

function nonSupportedResults(boundary = {}) {
  return toArray(boundary.results).filter((result) => result && result.status !== LEGAL_SCENARIO_STATUSES.supported)
}

export function summarizeLegalSupportBoundary(boundary = {}) {
  const results = nonSupportedResults(boundary)
  if (!results.length) return ''
  return results
    .map((result) => {
      const scenario = result.scenario || {}
      return `${scenario.title || result.scenarioKey || result.axis}: ${result.reason || scenario.boundaryReason || result.status}`
    })
    .join('; ')
}

function buildBoundaryBlockers(boundary = {}) {
  return nonSupportedResults(boundary).map((result) => ({
    axis: result.axis,
    scenarioKey: result.scenarioKey,
    status: result.status,
    action: result.action,
    reason: result.reason,
    title: result.scenario?.title || result.scenarioKey,
  }))
}

export function resolveLegalSupportBoundary(input = {}) {
  const boundaryInput =
    input && (
      Object.prototype.hasOwnProperty.call(input, 'transaction') ||
      Object.prototype.hasOwnProperty.call(input, 'formData') ||
      Object.prototype.hasOwnProperty.call(input, 'listing') ||
      Object.prototype.hasOwnProperty.call(input, 'onboardingData')
    )
      ? buildLegalSupportBoundaryInput(input)
      : input
  const support = resolveLegalMatterSupport(boundaryInput || {})
  const blockers = buildBoundaryBlockers(support)
  return Object.freeze({
    ...support,
    version: LEGAL_SUPPORT_BOUNDARY_VERSION,
    matrixVersion: LEGAL_SCENARIO_MATRIX_VERSION,
    input: Object.freeze({ ...(boundaryInput || {}) }),
    blockers: Object.freeze(blockers),
    summary: summarizeLegalSupportBoundary(support),
  })
}

export function createLegalSupportBoundaryRequirement(boundary = {}, options = {}) {
  if (!boundary?.manualReviewRequired && !boundary?.unsupported) return null

  const unsupported = Boolean(boundary.unsupported)
  const key = unsupported
    ? LEGAL_SUPPORT_BOUNDARY_REQUIREMENT_KEYS.unsupported
    : LEGAL_SUPPORT_BOUNDARY_REQUIREMENT_KEYS.manualReview
  const label = unsupported
    ? 'Unsupported Legal Scenario'
    : 'Conveyancer Legal Review'
  const description = unsupported
    ? `Automated document collection is stopped until the legal scenario is resolved. ${boundary.summary || ''}`.trim()
    : `Collect only safe intake items and pause for conveyancer review. ${boundary.summary || ''}`.trim()
  const generatedFrom = {
    ...(options.generatedFrom && typeof options.generatedFrom === 'object' ? options.generatedFrom : {}),
    legalSupportBoundary: true,
    supportBoundaryStatus: boundary.status,
    supportBoundaryAction: boundary.action,
    supportBoundaryVersion: boundary.version || LEGAL_SUPPORT_BOUNDARY_VERSION,
    scenarioKeys: toArray(boundary.results).map((result) => result.scenarioKey).filter(Boolean),
    blockers: boundary.blockers || [],
  }

  return {
    key,
    id: key,
    label,
    name: label,
    group: 'Legal Review',
    groupKey: 'legal_review',
    groupLabel: 'Legal Review',
    description,
    requirementLevel: unsupported ? 'blocker' : 'required',
    expectedFromRole: 'internal',
    defaultVisibility: 'internal',
    allowMultiple: false,
    sortOrder: Number.isFinite(options.sortOrder) ? options.sortOrder : -900,
    legalSupportBoundary: true,
    supportBoundary: boundary,
    generatedFrom,
    required: true,
    isRequired: true,
  }
}

export function createSellerLegalSupportBoundaryRequirement(boundary = {}, options = {}) {
  const requirement = createLegalSupportBoundaryRequirement(boundary, options)
  if (!requirement) return null
  return {
    requirement_key: requirement.key,
    requirement_name: requirement.label,
    requirement_description: requirement.description,
    requirement_group: requirement.groupKey,
    document_visibility: 'internal',
    visibility: 'internal',
    applies_to: 'internal',
    is_required: true,
    status: 'required',
    generated_from: requirement.generatedFrom,
    key: requirement.key,
    label: requirement.label,
    required: true,
    legalSupportBoundary: true,
    supportBoundary: boundary,
  }
}

export function canDeriveBuyerBaseline(boundary = {}) {
  if (!boundary || boundary.unsupported) return false
  return nonSupportedResults(boundary).every((result) => {
    if (result.axis === 'buyer') {
      return [
        'buyer_foreign_individual',
        'buyer_close_corporation',
        'buyer_power_of_attorney',
        'buyer_deceased_estate',
        'buyer_minor',
        'buyer_insolvent',
        'buyer_curatorship',
      ].includes(result.scenarioKey)
    }
    if (result.axis === 'finance') return false
    return true
  })
}

export function canDeriveSellerBaseline(boundary = {}) {
  if (!boundary || boundary.unsupported) return false
  return nonSupportedResults(boundary).every((result) => {
    if (result.axis === 'seller') {
      return ['seller_power_of_attorney', 'seller_close_corporation'].includes(result.scenarioKey)
    }
    return true
  })
}
