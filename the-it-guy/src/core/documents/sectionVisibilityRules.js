function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase()
}

export const VISIBILITY_VALUELESS_OPERATORS = ['exists', 'missing', 'truthy', 'falsy']
export const VISIBILITY_ENGINE_VERSION = 'conditional-visibility-v2'

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
  property_title_type: ['property_title_type', 'property.title_type_raw', 'property.title_type', 'propertyStructureType', 'property_structure_type'],
  'property.title_type_raw': ['property.title_type_raw', 'property_title_type', 'property.title_type', 'propertyStructureType', 'property_structure_type'],
  mandate_template_variant: ['mandate_template_variant', 'mandate.template_variant', 'mandateClauseProfile', 'mandate_clause_profile'],
  mandate_clause_profile: ['mandate_clause_profile', 'mandate.clause_profile', 'mandateTemplateVariant', 'mandate_template_variant'],
  seller_clause_profile: ['seller_clause_profile', 'seller.clause_profile'],
  buyer_clause_profile: ['buyer_clause_profile', 'buyer.clause_profile'],
  property_clause_profile: ['property_clause_profile', 'property.clause_profile'],
  finance_clause_profile: ['finance_clause_profile', 'finance.clause_profile'],
  legal_document_scenario: ['legal_document_scenario', 'legal.document_scenario'],
  legal_active_clause_packs: ['legal_active_clause_packs', 'legal.active_clause_packs'],
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

function visibilityError(code, message, details = {}) {
  return { code, message, ...details }
}

function resolveVisibilityPlaceholderEvidence(placeholders = {}, field = '') {
  const payload = placeholders && typeof placeholders === 'object' ? placeholders : {}
  const matches = buildFieldCandidates(field)
    .map((candidate) => ({
      key: candidate,
      value: hasOwn(payload, candidate) ? payload[candidate] : resolveNestedValue(payload, candidate),
    }))
    .filter((item) => item.value !== undefined)
  const meaningful = matches.filter((item) => isMeaningfullyPresent(item.value))
  const selected = meaningful[0] || matches[0] || { key: normalizeVisibilityFieldKey(field), value: undefined }
  const signatures = new Set(meaningful.map((item) => comparableValues(item.value).sort().join('|')))
  return {
    value: selected.value,
    resolvedKey: selected.key,
    candidates: matches,
    conflict: signatures.size > 1,
  }
}

function resolveStrictVisibilityOperator(value = '') {
  const normalized = normalizeComparable(value).replace(/\s+/g, ' ')
  return VISIBILITY_OPERATOR_ALIASES.get(normalized) || null
}

function normalizeBooleanValue(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeComparable(value)
  if (['true', 'yes', '1', 'on'].includes(normalized)) return true
  if (['false', 'no', '0', 'off', ''].includes(normalized)) return false
  return Boolean(value)
}

function evaluateVisibilityPredicateDetailed(rule = {}, placeholders = {}, { strict = false, path = 'rule' } = {}) {
  const field = normalizeVisibilityFieldKey(rule.key || rule.placeholder || rule.placeholderKey || rule.placeholder_key || rule.field)
  const rawOperator = rule.operator || 'exists'
  const operator = strict ? resolveStrictVisibilityOperator(rawOperator) : normalizeVisibilityOperator(rawOperator)
  const errors = []

  if (!field) {
    errors.push(visibilityError('VISIBILITY_FIELD_MISSING', 'Conditional rule field is missing.', { path }))
  }
  if (!operator) {
    errors.push(visibilityError('VISIBILITY_OPERATOR_UNSUPPORTED', `Conditional operator "${normalizeText(rawOperator)}" is not supported.`, { path, field }))
  }

  const expected = rule.value
  const expectedList = expectedValues(expected)
  if (operator && !VISIBILITY_VALUELESS_OPERATORS.includes(operator) && expectedList.length === 0) {
    errors.push(visibilityError('VISIBILITY_EXPECTED_VALUE_MISSING', 'Conditional rule expected value is missing.', { path, field, operator }))
  }

  const evidence = resolveVisibilityPlaceholderEvidence(placeholders, field)
  if (strict && evidence.conflict) {
    errors.push(visibilityError('VISIBILITY_FIELD_CONFLICT', `Conflicting values were supplied for ${field}.`, {
      path,
      field,
      candidateKeys: evidence.candidates.map((item) => item.key),
    }))
  }

  const current = evidence.value
  const present = isMeaningfullyPresent(current)
  const currentValues = comparableValues(current)
  const currentText = currentValues.join(' ')
  const expectedText = expectedList[0] || ''
  let matched = false

  if (!errors.length || !strict) {
    if (operator === 'exists') matched = present
    else if (operator === 'missing') matched = !present
    else if (operator === 'truthy') matched = present && normalizeBooleanValue(current)
    else if (operator === 'falsy') matched = !present || !normalizeBooleanValue(current)
    else if (!present && strict) matched = false
    else if (operator === 'equals') matched = currentValues.some((value) => value === expectedText)
    else if (operator === 'not_equals') matched = currentValues.every((value) => value !== expectedText)
    else if (operator === 'contains') matched = Boolean(expectedText && currentText.includes(expectedText))
    else if (operator === 'not_contains') matched = Boolean(!expectedText || !currentText.includes(expectedText))
    else if (operator === 'in') matched = expectedList.some((value) => currentValues.includes(value))
    else if (operator === 'not_in') matched = !expectedList.some((value) => currentValues.includes(value))
  }

  const valid = errors.length === 0
  return {
    engineVersion: VISIBILITY_ENGINE_VERSION,
    visible: strict ? valid && matched : matched,
    valid,
    decision: strict && !valid ? 'invalid_excluded' : matched ? 'included' : 'excluded',
    field,
    operator: operator || normalizeText(rawOperator),
    expected: VISIBILITY_VALUELESS_OPERATORS.includes(operator) ? null : expected,
    actual: current,
    resolvedKey: evidence.resolvedKey,
    errors,
    trace: [{ path, field, operator: operator || normalizeText(rawOperator), matched, present, resolvedKey: evidence.resolvedKey }],
  }
}

function combineVisibilityResults(kind, results = [], { strict = false, path = 'rule' } = {}) {
  const valid = results.every((result) => result.valid)
  const matched = kind === 'any'
    ? results.some((result) => result.visible)
    : results.every((result) => result.visible)
  const errors = results.flatMap((result) => result.errors || [])
  const visible = strict ? valid && matched : matched
  return {
    engineVersion: VISIBILITY_ENGINE_VERSION,
    visible,
    valid,
    decision: strict && !valid ? 'invalid_excluded' : visible ? 'included' : 'excluded',
    operator: kind,
    errors,
    trace: [{ path, operator: kind, matched }, ...results.flatMap((result) => result.trace || [])],
  }
}

export function evaluateVisibilityRulesDetailed(ruleSet = null, placeholders = {}, { strict = false, path = 'condition' } = {}) {
  if (ruleSet === null || ruleSet === undefined || (typeof ruleSet === 'object' && !Array.isArray(ruleSet) && Object.keys(ruleSet).length === 0)) {
    return {
      engineVersion: VISIBILITY_ENGINE_VERSION,
      visible: true,
      valid: true,
      decision: 'unconditional',
      errors: [],
      trace: [{ path, operator: 'unconditional', matched: true }],
    }
  }
  if (typeof ruleSet === 'boolean') {
    return {
      engineVersion: VISIBILITY_ENGINE_VERSION,
      visible: ruleSet,
      valid: true,
      decision: ruleSet ? 'included' : 'excluded',
      errors: [],
      trace: [{ path, operator: 'boolean', matched: ruleSet }],
    }
  }
  if (Array.isArray(ruleSet)) {
    if (strict && ruleSet.length === 0) {
      const error = visibilityError('VISIBILITY_GROUP_EMPTY', 'Conditional rule group cannot be empty.', { path })
      return { engineVersion: VISIBILITY_ENGINE_VERSION, visible: false, valid: false, decision: 'invalid_excluded', errors: [error], trace: [{ path, operator: 'all', matched: false }] }
    }
    return combineVisibilityResults('all', ruleSet.map((item, index) => evaluateVisibilityRulesDetailed(item, placeholders, { strict, path: `${path}[${index}]` })), { strict, path })
  }
  if (typeof ruleSet !== 'object') {
    if (!strict) return { engineVersion: VISIBILITY_ENGINE_VERSION, visible: true, valid: true, decision: 'legacy_included', errors: [], trace: [{ path, operator: 'legacy', matched: true }] }
    const error = visibilityError('VISIBILITY_RULE_INVALID_TYPE', 'Conditional rule must be an object, array or boolean.', { path })
    return { engineVersion: VISIBILITY_ENGINE_VERSION, visible: false, valid: false, decision: 'invalid_excluded', errors: [error], trace: [{ path, operator: 'invalid', matched: false }] }
  }
  if (ruleSet.enabled === false) {
    return { engineVersion: VISIBILITY_ENGINE_VERSION, visible: true, valid: true, decision: 'disabled_unconditional', errors: [], trace: [{ path, operator: 'disabled', matched: true }] }
  }
  if (ruleSet.rule && typeof ruleSet.rule === 'object') {
    if (strict && Object.keys(ruleSet.rule).length === 0) {
      const error = visibilityError('VISIBILITY_RULE_EMPTY', 'Enabled conditional rule cannot be empty.', { path: `${path}.rule` })
      return { engineVersion: VISIBILITY_ENGINE_VERSION, visible: false, valid: false, decision: 'invalid_excluded', errors: [error], trace: [{ path, operator: 'rule', matched: false }] }
    }
    return evaluateVisibilityRulesDetailed(ruleSet.rule, placeholders, { strict, path: `${path}.rule` })
  }
  if (Array.isArray(ruleSet.all)) {
    if (strict && ruleSet.all.length === 0) {
      const error = visibilityError('VISIBILITY_GROUP_EMPTY', 'Conditional all-group cannot be empty.', { path })
      return { engineVersion: VISIBILITY_ENGINE_VERSION, visible: false, valid: false, decision: 'invalid_excluded', errors: [error], trace: [{ path, operator: 'all', matched: false }] }
    }
    return combineVisibilityResults('all', ruleSet.all.map((item, index) => evaluateVisibilityRulesDetailed(item, placeholders, { strict, path: `${path}.all[${index}]` })), { strict, path })
  }
  if (Array.isArray(ruleSet.any)) {
    if (strict && ruleSet.any.length === 0) {
      const error = visibilityError('VISIBILITY_GROUP_EMPTY', 'Conditional any-group cannot be empty.', { path })
      return { engineVersion: VISIBILITY_ENGINE_VERSION, visible: false, valid: false, decision: 'invalid_excluded', errors: [error], trace: [{ path, operator: 'any', matched: false }] }
    }
    return combineVisibilityResults('any', ruleSet.any.map((item, index) => evaluateVisibilityRulesDetailed(item, placeholders, { strict, path: `${path}.any[${index}]` })), { strict, path })
  }
  if (ruleSet.not !== undefined) {
    const nested = evaluateVisibilityRulesDetailed(ruleSet.not, placeholders, { strict, path: `${path}.not` })
    const visible = strict ? nested.valid && !nested.visible : !nested.visible
    return {
      engineVersion: VISIBILITY_ENGINE_VERSION,
      visible,
      valid: nested.valid,
      decision: strict && !nested.valid ? 'invalid_excluded' : visible ? 'included' : 'excluded',
      operator: 'not',
      errors: nested.errors,
      trace: [{ path, operator: 'not', matched: visible }, ...(nested.trace || [])],
    }
  }

  return evaluateVisibilityPredicateDetailed(ruleSet, placeholders, { strict, path })
}

export function evaluateVisibilityRules(ruleSet = null, placeholders = {}) {
  return evaluateVisibilityRulesDetailed(ruleSet, placeholders).visible
}
