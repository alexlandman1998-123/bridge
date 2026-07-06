function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase()
}

export const VISIBILITY_VALUELESS_OPERATORS = ['exists', 'missing', 'truthy', 'falsy']

const VISIBILITY_OPERATOR_ALIASES = new Map([
  ['=', 'equals'],
  ['==', 'equals'],
  ['eq', 'equals'],
  ['is', 'equals'],
  ['equal', 'equals'],
  ['equals', 'equals'],
  ['!=', 'not_equals'],
  ['<>', 'not_equals'],
  ['ne', 'not_equals'],
  ['not equal', 'not_equals'],
  ['not equals', 'not_equals'],
  ['does not equal', 'not_equals'],
  ['does_not_equal', 'not_equals'],
  ['not_equals', 'not_equals'],
  ['contains', 'contains'],
  ['includes', 'contains'],
  ['does not contain', 'not_contains'],
  ['does_not_contain', 'not_contains'],
  ['not_contains', 'not_contains'],
  ['in', 'in'],
  ['one of', 'in'],
  ['is one of', 'in'],
  ['not in', 'not_in'],
  ['not_in', 'not_in'],
  ['is not one of', 'not_in'],
  ['exists', 'exists'],
  ['present', 'exists'],
  ['not empty', 'exists'],
  ['is not empty', 'exists'],
  ['is required', 'exists'],
  ['required', 'exists'],
  ['missing', 'missing'],
  ['empty', 'missing'],
  ['is empty', 'missing'],
  ['is blank', 'missing'],
  ['truthy', 'truthy'],
  ['true', 'truthy'],
  ['falsy', 'falsy'],
  ['false', 'falsy'],
])

const FIELD_ALIAS_MAP = {
  seller_entity_type: ['seller_entity_type', 'seller.entity_type_raw', 'seller.entity_type', 'seller.entityType', 'sellerEntityType'],
  'seller.entity_type_raw': ['seller.entity_type_raw', 'seller_entity_type', 'seller.entity_type', 'seller.entityType', 'sellerEntityType'],
  buyer_entity_type: ['buyer_entity_type', 'buyer.entity_type_raw', 'buyer.entity_type', 'buyer.entityType', 'buyerEntityType'],
  'buyer.entity_type_raw': ['buyer.entity_type_raw', 'buyer_entity_type', 'buyer.entity_type', 'buyer.entityType', 'buyerEntityType'],
  finance_type: ['finance_type', 'transaction.finance_type_raw', 'transaction.finance_type', 'transactionFinanceType', 'financeType'],
  seller_marital_status: ['seller_marital_status', 'seller.marital_status_raw', 'seller.marital_status', 'sellerMaritalStatus'],
  buyer_marital_status: ['buyer_marital_status', 'buyer.marital_status_raw', 'buyer.marital_status', 'buyerMaritalStatus'],
}

export function normalizeVisibilityFieldKey(value = '') {
  return normalizeText(value)
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '')
}

export function normalizeVisibilityOperator(value = 'exists', fallback = 'exists') {
  const normalized = normalizeComparable(value || fallback).replace(/\s+/g, ' ')
  return VISIBILITY_OPERATOR_ALIASES.get(normalized) || VISIBILITY_OPERATOR_ALIASES.get(normalizeComparable(fallback)) || 'exists'
}

function normalizeVisibilityValueForInput(value = '') {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean).join(', ')
  return normalizeText(value)
}

function normalizeVisibilityRuleValue(value = '', operator = 'equals') {
  if (VISIBILITY_VALUELESS_OPERATORS.includes(operator)) return ''
  if (operator === 'in' || operator === 'not_in') {
    if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean)
    return normalizeText(value)
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean)
  }
  return normalizeText(value)
}

export function normalizeVisibilityConditionInput(condition = {}, fallbackField = '', { defaultOperator = 'equals' } = {}) {
  const source = condition && typeof condition === 'object' ? condition : {}
  const rule = source.rule && typeof source.rule === 'object' ? source.rule : source
  const field = normalizeVisibilityFieldKey(rule.field || rule.key || rule.placeholder || rule.placeholderKey || rule.placeholder_key || fallbackField)
  const operator = normalizeVisibilityOperator(rule.operator || source.operator || defaultOperator, defaultOperator)
  return {
    enabled: Boolean(source.enabled ?? rule.enabled ?? field),
    field,
    operator,
    value: VISIBILITY_VALUELESS_OPERATORS.includes(operator) ? '' : normalizeVisibilityValueForInput(rule.value ?? source.value),
    label: normalizeText(source.label || rule.label),
  }
}

export function buildVisibilityConditionJson(condition = {}) {
  const normalized = normalizeVisibilityConditionInput(condition)
  if (!normalized.enabled || !normalized.field) return {}
  return {
    enabled: true,
    rule: {
      field: normalized.field,
      operator: normalized.operator,
      value: normalizeVisibilityRuleValue(normalized.value, normalized.operator),
    },
    ...(normalized.label ? { label: normalized.label } : {}),
  }
}

function hasOwn(object = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function resolveNestedValue(object = {}, path = '') {
  if (!path.includes('.')) return undefined
  return path.split('.').reduce((current, part) => (
    current && typeof current === 'object' && hasOwn(current, part) ? current[part] : undefined
  ), object)
}

function buildFieldCandidates(field = '') {
  const key = normalizeVisibilityFieldKey(field)
  const aliases = FIELD_ALIAS_MAP[key] || []
  const candidates = [key, ...aliases]
  if (key.includes('.')) candidates.push(key.replace(/\./g, '_'))
  return Array.from(new Set(candidates.filter(Boolean)))
}

export function isMeaningfullyPresent(value) {
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

export function resolveVisibilityPlaceholderValue(placeholders = {}, field = '') {
  const payload = placeholders && typeof placeholders === 'object' ? placeholders : {}
  let firstExisting

  for (const candidate of buildFieldCandidates(field)) {
    const value = hasOwn(payload, candidate) ? payload[candidate] : resolveNestedValue(payload, candidate)
    if (value !== undefined && firstExisting === undefined) firstExisting = value
    if (isMeaningfullyPresent(value)) return value
  }

  return firstExisting
}

function comparableValues(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeComparable(item))
  return [normalizeComparable(value)]
}

function expectedValues(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeComparable(item)).filter(Boolean)
  return normalizeText(value)
    .split(',')
    .map((item) => normalizeComparable(item))
    .filter(Boolean)
}

function evaluateVisibilityPredicate(rule = {}, placeholders = {}) {
  const field = normalizeVisibilityFieldKey(rule.key || rule.placeholder || rule.field)
  if (!field) return true

  const operator = normalizeVisibilityOperator(rule.operator || 'exists')
  const expected = rule.value
  const current = resolveVisibilityPlaceholderValue(placeholders, field)
  const currentValues = comparableValues(current)
  const currentText = currentValues.join(' ')
  const expectedList = expectedValues(expected)
  const expectedText = expectedList[0] || ''

  if (operator === 'exists') return isMeaningfullyPresent(current)
  if (operator === 'missing') return !isMeaningfullyPresent(current)
  if (operator === 'truthy') return Boolean(current)
  if (operator === 'falsy') return !current
  if (operator === 'equals') return currentValues.some((value) => value === expectedText)
  if (operator === 'not_equals') return currentValues.every((value) => value !== expectedText)
  if (operator === 'contains') return Boolean(expectedText && currentText.includes(expectedText))
  if (operator === 'not_contains') return Boolean(!expectedText || !currentText.includes(expectedText))
  if (operator === 'in') return expectedList.some((value) => currentValues.includes(value))
  if (operator === 'not_in') return !expectedList.some((value) => currentValues.includes(value))

  return true
}

export function evaluateVisibilityRules(ruleSet = null, placeholders = {}) {
  if (!ruleSet) return true
  if (typeof ruleSet === 'boolean') return ruleSet
  if (Array.isArray(ruleSet)) {
    return ruleSet.every((item) => evaluateVisibilityRules(item, placeholders))
  }
  if (typeof ruleSet !== 'object') return true
  if (ruleSet.enabled === false) return true

  if (ruleSet.rule && typeof ruleSet.rule === 'object') {
    return evaluateVisibilityRules(ruleSet.rule, placeholders)
  }
  if (Array.isArray(ruleSet.all)) {
    return ruleSet.all.every((item) => evaluateVisibilityRules(item, placeholders))
  }
  if (Array.isArray(ruleSet.any)) {
    return ruleSet.any.some((item) => evaluateVisibilityRules(item, placeholders))
  }
  if (ruleSet.not !== undefined) {
    return !evaluateVisibilityRules(ruleSet.not, placeholders)
  }

  return evaluateVisibilityPredicate(ruleSet, placeholders)
}
