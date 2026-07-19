export const MVP_LAUNCH_SCOPE_VERSION = 'arch9_mvp_launch_scope_v1'

export const MVP_SUPPORTED_TRANSACTION_TYPES = Object.freeze([
  'resale',
  'private_sale',
  'development_sale',
])

export const MVP_SUPPORTED_FINANCE_TYPES = Object.freeze([
  'cash',
  'bond',
  'hybrid',
])

export const MVP_SUPPORTED_PROPERTY_TENURES = Object.freeze([
  'freehold',
  'sectional_title',
  'estate_hoa',
])

export const MVP_SUPPORTED_BUYER_ENTITY_TYPES = Object.freeze([
  'individual',
  'company',
  'trust',
])

export const MVP_SUPPORTED_SELLER_ENTITY_TYPES = Object.freeze([
  'individual',
  'company',
  'trust',
  'developer',
])

const FIELD_LABELS = Object.freeze({
  transactionType: 'Transaction type',
  financeType: 'Finance type',
  propertyTenure: 'Property tenure',
  buyerEntityType: 'Buyer entity type',
  sellerEntityType: 'Seller entity type',
})

function normalizeValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function issue({ field, code, value = '', expected = [] }) {
  return {
    field,
    label: FIELD_LABELS[field] || field,
    code,
    value: normalizeValue(value) || null,
    expected,
  }
}

function evaluateField({ field, value, supportedValues, issues }) {
  const normalized = normalizeValue(value)
  if (!normalized || normalized === 'unknown') {
    issues.push(issue({ field, code: 'missing_required_routing_fact', value, expected: supportedValues }))
    return
  }
  if (!supportedValues.includes(normalized)) {
    issues.push(issue({ field, code: 'outside_mvp_launch_scope', value, expected: supportedValues }))
  }
}

export function evaluateMvpLaunchScope(profile = {}) {
  const issues = []
  const transactionType = normalizeValue(profile.transactionType)

  evaluateField({
    field: 'transactionType',
    value: transactionType,
    supportedValues: MVP_SUPPORTED_TRANSACTION_TYPES,
    issues,
  })
  evaluateField({
    field: 'financeType',
    value: profile.financeType,
    supportedValues: MVP_SUPPORTED_FINANCE_TYPES,
    issues,
  })
  evaluateField({
    field: 'propertyTenure',
    value: profile.propertyTenure,
    supportedValues: MVP_SUPPORTED_PROPERTY_TENURES,
    issues,
  })
  evaluateField({
    field: 'buyerEntityType',
    value: profile.buyerEntityType,
    supportedValues: MVP_SUPPORTED_BUYER_ENTITY_TYPES,
    issues,
  })
  evaluateField({
    field: 'sellerEntityType',
    value: profile.sellerEntityType,
    supportedValues: MVP_SUPPORTED_SELLER_ENTITY_TYPES,
    issues,
  })

  if (transactionType !== 'development_sale' && normalizeValue(profile.sellerEntityType) === 'developer') {
    issues.push(
      issue({
        field: 'sellerEntityType',
        code: 'developer_seller_requires_development_sale',
        value: profile.sellerEntityType,
        expected: ['individual', 'company', 'trust'],
      }),
    )
  }

  const missingFacts = issues.filter((item) => item.code === 'missing_required_routing_fact')
  const unsupportedFacts = issues.filter((item) => item.code !== 'missing_required_routing_fact')
  const status = unsupportedFacts.length ? 'out_of_scope' : missingFacts.length ? 'incomplete' : 'supported'

  return {
    version: MVP_LAUNCH_SCOPE_VERSION,
    status,
    supported: status === 'supported',
    readyForMvpTransactionCreation: status === 'supported',
    issues,
    missingFields: missingFacts.map((item) => item.field),
    unsupportedFields: unsupportedFacts.map((item) => item.field),
  }
}

export function formatMvpLaunchScopeIssue(item = {}) {
  const label = item.label || FIELD_LABELS[item.field] || 'Routing fact'
  if (item.code === 'missing_required_routing_fact') {
    return `${label} is required before this transaction can enter the MVP workflow.`
  }
  if (item.code === 'developer_seller_requires_development_sale') {
    return 'Developer seller is only supported for development-sale transactions in the MVP workflow.'
  }
  return `${label} is outside the Arch9 MVP launch scope.`
}

export function assertMvpLaunchScope(profile = {}) {
  const assessment = evaluateMvpLaunchScope(profile)
  if (assessment.supported) return assessment

  const error = new Error(assessment.issues.map(formatMvpLaunchScopeIssue).join(' '))
  error.code = 'mvp_transaction_out_of_scope'
  error.launchScope = assessment
  throw error
}
