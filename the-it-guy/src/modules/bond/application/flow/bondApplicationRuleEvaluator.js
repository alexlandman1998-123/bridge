import { isPlainObject } from '../bondApplicationState.js'

export function getBondApplicationPathValue(source, path) {
  if (!path) return source
  return String(path).split('.').filter(Boolean).reduce((current, key) => current?.[key], source)
}

export function isBondApplicationValuePresent(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function compareNumber(value, expected, comparator) {
  const actualNumber = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  const expectedNumber = typeof expected === 'number' ? expected : Number(String(expected ?? '').replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false
  return comparator(actualNumber, expectedNumber)
}

export function evaluateBondApplicationRule(rule, state = {}) {
  if (rule === undefined || rule === null) return true
  if (typeof rule === 'boolean') return rule
  if (!isPlainObject(rule)) return false

  if (Array.isArray(rule.all)) {
    return rule.all.every((childRule) => evaluateBondApplicationRule(childRule, state))
  }
  if (Array.isArray(rule.any)) {
    return rule.any.some((childRule) => evaluateBondApplicationRule(childRule, state))
  }
  if (Object.prototype.hasOwnProperty.call(rule, 'not')) {
    return !evaluateBondApplicationRule(rule.not, state)
  }

  const value = getBondApplicationPathValue(state, rule.field)

  if (Object.prototype.hasOwnProperty.call(rule, 'equals')) return value === rule.equals
  if (Object.prototype.hasOwnProperty.call(rule, 'notEquals')) return value !== rule.notEquals
  if (Object.prototype.hasOwnProperty.call(rule, 'in')) return Array.isArray(rule.in) && rule.in.includes(value)
  if (Object.prototype.hasOwnProperty.call(rule, 'notIn')) return Array.isArray(rule.notIn) && !rule.notIn.includes(value)
  if (Object.prototype.hasOwnProperty.call(rule, 'exists')) return isBondApplicationValuePresent(value) === Boolean(rule.exists)
  if (Object.prototype.hasOwnProperty.call(rule, 'notExists')) return isBondApplicationValuePresent(value) !== Boolean(rule.notExists)
  if (Object.prototype.hasOwnProperty.call(rule, 'truthy')) return Boolean(value) === Boolean(rule.truthy)
  if (Object.prototype.hasOwnProperty.call(rule, 'falsy')) return Boolean(value) !== Boolean(rule.falsy)
  if (Object.prototype.hasOwnProperty.call(rule, 'greaterThan')) return compareNumber(value, rule.greaterThan, (actual, expected) => actual > expected)
  if (Object.prototype.hasOwnProperty.call(rule, 'greaterThanOrEqual')) return compareNumber(value, rule.greaterThanOrEqual, (actual, expected) => actual >= expected)
  if (Object.prototype.hasOwnProperty.call(rule, 'lessThan')) return compareNumber(value, rule.lessThan, (actual, expected) => actual < expected)
  if (Object.prototype.hasOwnProperty.call(rule, 'lessThanOrEqual')) return compareNumber(value, rule.lessThanOrEqual, (actual, expected) => actual <= expected)
  if (Object.prototype.hasOwnProperty.call(rule, 'collectionNotEmpty')) return asArray(value).length > 0 === Boolean(rule.collectionNotEmpty)
  if (Object.prototype.hasOwnProperty.call(rule, 'collectionEmpty')) return asArray(value).length === 0 === Boolean(rule.collectionEmpty)
  if (Object.prototype.hasOwnProperty.call(rule, 'collectionCountAtLeast')) return asArray(value).length >= Number(rule.collectionCountAtLeast || 0)

  return false
}

export function createBondApplicationRuleDiagnostic(rule, message = 'Unsupported or invalid rule definition.') {
  return {
    type: 'invalid_rule',
    field: isPlainObject(rule) ? rule.field ?? null : null,
    message,
  }
}
