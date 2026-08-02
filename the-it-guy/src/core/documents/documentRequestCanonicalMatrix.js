import checklist from '../../../config/document-request-phase1-legal-checklist.json' with { type: 'json' }

export const DOCUMENT_REQUEST_CANONICAL_MATRIX_VERSION = 'document_request_canonical_matrix_v1'
export const DOCUMENT_REQUEST_CANONICAL_MATRIX_SOURCE_VERSION = checklist.version

const REQUIRED_FIELDS = Object.freeze(['key', 'label', 'ownerRole', 'appliesTo', 'level', 'visibility', 'blocker'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function freezeRequirement(requirement = {}, index = 0) {
  const ownerRole = normalizeKey(requirement.ownerRole)
  return Object.freeze({
    key: normalizeKey(requirement.key),
    label: normalizeText(requirement.label),
    ownerRole,
    requestedFrom: normalizeKey(requirement.requestedFrom || requirement.requested_from || ownerRole),
    appliesTo: Object.freeze(unique(normalizeArray(requirement.appliesTo).map(normalizeKey))),
    level: normalizeKey(requirement.level),
    visibility: normalizeKey(requirement.visibility),
    blocker: normalizeKey(requirement.blocker),
    sortOrder: Number.isFinite(Number(requirement.sortOrder)) ? Number(requirement.sortOrder) : index + 1,
    sourceVersion: DOCUMENT_REQUEST_CANONICAL_MATRIX_SOURCE_VERSION,
  })
}

function buildMatrix(source = checklist) {
  return Object.freeze({
    version: DOCUMENT_REQUEST_CANONICAL_MATRIX_VERSION,
    sourceVersion: normalizeText(source.version),
    preparedAt: normalizeText(source.preparedAt),
    jurisdiction: normalizeText(source.jurisdiction),
    status: normalizeKey(source.status),
    requirements: Object.freeze(normalizeArray(source.requirements).map(freezeRequirement)),
    signoffDecisions: Object.freeze(
      normalizeArray(source.signoffDecisions).map((decision) =>
        Object.freeze({
          key: normalizeKey(decision.key),
          recommendedDefault: normalizeKey(decision.recommendedDefault),
          status: normalizeKey(decision.status || 'pending'),
        }),
      ),
    ),
    sources: Object.freeze(normalizeArray(source.sources).map(normalizeText).filter(Boolean)),
  })
}

export const DOCUMENT_REQUEST_CANONICAL_MATRIX = buildMatrix()

export function validateDocumentRequestCanonicalMatrix(matrix = DOCUMENT_REQUEST_CANONICAL_MATRIX) {
  const errors = []
  const keys = new Set()
  if (!matrix?.version) errors.push('Matrix version is required.')
  if (!Array.isArray(matrix?.requirements) || matrix.requirements.length === 0) errors.push('At least one requirement is required.')

  for (const [index, requirement] of (matrix.requirements || []).entries()) {
    for (const field of REQUIRED_FIELDS) {
      if (field === 'appliesTo') {
        if (!Array.isArray(requirement.appliesTo) || requirement.appliesTo.length === 0) {
          errors.push(`${requirement.key || `requirement_${index + 1}`}: appliesTo is required.`)
        }
      } else if (!normalizeText(requirement[field])) {
        errors.push(`${requirement.key || `requirement_${index + 1}`}: ${field} is required.`)
      }
    }
    if (keys.has(requirement.key)) errors.push(`Duplicate requirement key: ${requirement.key}`)
    if (requirement.key) keys.add(requirement.key)
  }

  const pendingSignoffDecisions = (matrix.signoffDecisions || []).filter((decision) => decision.status === 'pending')
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    counts: Object.freeze({
      requirements: matrix.requirements?.length || 0,
      signoffDecisions: matrix.signoffDecisions?.length || 0,
      pendingSignoffDecisions: pendingSignoffDecisions.length,
      sources: matrix.sources?.length || 0,
    }),
    pendingSignoffDecisions: Object.freeze(pendingSignoffDecisions),
  })
}

export function listCanonicalDocumentRequestRequirements(filters = {}) {
  const ownerRole = normalizeKey(filters.ownerRole || filters.requestedFrom || filters.requested_from)
  const appliesTo = normalizeKey(filters.appliesTo || filters.applies_to)
  const level = normalizeKey(filters.level)
  const visibility = normalizeKey(filters.visibility)
  const blocker = normalizeKey(filters.blocker)
  const includePendingPolicy = filters.includePendingPolicy !== false

  return DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements.filter((requirement) => {
    if (ownerRole && requirement.ownerRole !== ownerRole && requirement.requestedFrom !== ownerRole) return false
    if (appliesTo && !requirement.appliesTo.includes(appliesTo)) return false
    if (level && requirement.level !== level) return false
    if (visibility && requirement.visibility !== visibility) return false
    if (blocker && requirement.blocker !== blocker) return false
    if (!includePendingPolicy && requirement.level.startsWith('pending_policy_')) return false
    return true
  })
}

export function getCanonicalDocumentRequestRequirement(key = '') {
  const normalized = normalizeKey(key)
  return DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements.find((requirement) => requirement.key === normalized) || null
}

function buyerScenarioTokens(input = {}) {
  const entityType = normalizeKey(input.buyerEntityType || input.buyer_entity_type || input.purchaserType || input.purchaser_type || 'individual')
  const marital = normalizeKey(input.buyerMaritalRegime || input.buyer_marital_regime || input.buyerMaritalStatus || input.buyer_marital_status)
  if (entityType === 'company') return ['buyer_company']
  if (entityType === 'trust') return ['buyer_trust']
  if (['foreign', 'foreign_purchaser', 'foreign_individual'].includes(entityType)) return ['buyer_foreign_individual']
  if (
    entityType === 'married_cop' ||
    entityType === 'married_coc' ||
    marital === 'cop' ||
    marital === 'in_community' ||
    marital === 'married_cop' ||
    marital === 'married_in_community' ||
    marital === 'married_in_community_of_property'
  ) {
    return ['buyer_married_cop']
  }
  if (
    entityType === 'married_anc' ||
    entityType === 'married_anc_accrual' ||
    marital === 'anc' ||
    marital === 'married_anc' ||
    marital === 'out_of_community' ||
    marital === 'married_out_of_community' ||
    marital === 'married_out_of_community_of_property'
  ) {
    return ['buyer_married_anc']
  }
  return ['buyer_individual']
}

function sellerScenarioTokens(input = {}) {
  const entityType = normalizeKey(input.sellerEntityType || input.seller_entity_type || input.sellerType || input.seller_type || 'individual')
  const marital = normalizeKey(input.sellerMaritalRegime || input.seller_marital_regime || input.sellerMaritalStatus || input.seller_marital_status)
  if (entityType === 'company') return ['seller_company']
  if (entityType === 'trust') return ['seller_trust']
  if (entityType === 'deceased_estate') return ['seller_deceased_estate']
  if (entityType === 'power_of_attorney') return ['seller_power_of_attorney']
  if (
    entityType === 'married_cop' ||
    marital === 'cop' ||
    marital === 'in_community' ||
    marital === 'married_cop' ||
    marital === 'married_in_community' ||
    marital === 'married_in_community_of_property'
  ) {
    return ['seller_married_cop']
  }
  if (
    entityType === 'married_anc' ||
    marital === 'anc' ||
    marital === 'married_anc' ||
    marital === 'out_of_community' ||
    marital === 'married_out_of_community' ||
    marital === 'married_out_of_community_of_property'
  ) {
    return ['seller_married_anc']
  }
  return ['seller_individual']
}

function financeScenarioTokens(input = {}) {
  const financeType = normalizeKey(input.financeType || input.finance_type || 'cash')
  if (financeType === 'combination') return ['hybrid']
  if (financeType === 'bond' || financeType === 'hybrid') return [financeType]
  return ['cash']
}

function propertyScenarioTokens(input = {}) {
  const tokens = []
  const values = [
    input.propertyType,
    input.property_type,
    input.propertyTenure,
    input.property_tenure,
    input.propertyBranch,
    input.property_branch,
    ...(Array.isArray(input.propertyTriggers) ? input.propertyTriggers : []),
    ...(Array.isArray(input.property_triggers) ? input.property_triggers : []),
  ].map(normalizeKey)

  for (const value of values) {
    if (value.includes('sectional')) tokens.push('sectional_title')
    if (value.includes('share_block')) tokens.push('share_block')
    if (value.includes('estate') || value.includes('hoa')) tokens.push('estate_hoa')
    if (value.includes('tenant')) tokens.push('tenant_occupied')
    if (value.includes('vacant')) tokens.push('vacant_land')
    if (value.includes('agricultural') || value.includes('farm')) tokens.push('agricultural')
    if (value.includes('commercial')) tokens.push('commercial')
    if (value.includes('mixed_use')) tokens.push('mixed_use')
  }

  const booleanTriggers = {
    gasInstallation: 'gas_installation',
    gas_installation: 'gas_installation',
    electricFence: 'electric_fence',
    electric_fence: 'electric_fence',
    municipalWaterCocRequired: 'municipal_water_coc_required',
    municipal_water_coc_required: 'municipal_water_coc_required',
    beetleCertificateRequired: 'region_or_otp_requires_beetle',
    beetle_certificate_required: 'region_or_otp_requires_beetle',
    solarInstallation: 'solar_installation',
    solar_installation: 'solar_installation',
    alterations: 'alterations',
    newBuilding: 'new_building',
    new_building: 'new_building',
    developmentSale: 'development_sale',
    development_sale: 'development_sale',
    municipalRequirement: 'municipal_requirement',
    municipal_requirement: 'municipal_requirement',
    vatTransaction: 'vat_transaction',
    vat_transaction: 'vat_transaction',
  }

  for (const [field, token] of Object.entries(booleanTriggers)) {
    if (input[field]) tokens.push(token)
  }
  return unique(tokens)
}

export function buildCanonicalDocumentRequestScenarioTokens(input = {}) {
  const tokens = [
    'transaction',
    'buyer',
    'seller',
    'property',
    ...buyerScenarioTokens(input),
    ...sellerScenarioTokens(input),
    ...financeScenarioTokens(input),
    ...propertyScenarioTokens(input),
  ]
  if (input.sellerHasExistingBond || input.seller_has_existing_bond || input.requiresCancellationAttorney || input.requires_cancellation_attorney) {
    tokens.push('seller_existing_bond')
  }
  return Object.freeze(unique(tokens.map(normalizeKey)))
}

export function resolveCanonicalDocumentRequestsForScenario(input = {}, options = {}) {
  const tokens = new Set(buildCanonicalDocumentRequestScenarioTokens(input))
  const includePendingPolicy = options.includePendingPolicy !== false
  const includeConditional = options.includeConditional !== false

  return DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements.filter((requirement) => {
    if (!includePendingPolicy && requirement.level.startsWith('pending_policy_')) return false
    if (!includeConditional && requirement.level === 'conditional') return false
    return requirement.appliesTo.some((token) => tokens.has(token))
  })
}
