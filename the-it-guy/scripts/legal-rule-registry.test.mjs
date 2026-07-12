import assert from 'node:assert/strict'
import {
  LEGAL_BUYER_TYPES,
  LEGAL_FINANCE_TYPES,
  LEGAL_PROPERTY_TYPES,
  LEGAL_RULE_REGISTRY_VERSION,
  LEGAL_SELLER_TYPES,
  normalizeBuyerType,
  normalizeFinanceTypeForLegalRules,
  normalizeOwnershipStructure,
  normalizePropertyType,
  normalizeSellerType,
  normalizeTransactionType,
  isMultipleOwnerSellerType,
} from '../src/core/legal/legalRuleRegistry.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('exposes canonical legal registries', () => {
  assert.equal(LEGAL_RULE_REGISTRY_VERSION, 'legal_rule_registry_v1')
  assert.ok(LEGAL_BUYER_TYPES.includes('foreign_purchaser'))
  assert.ok(LEGAL_SELLER_TYPES.includes('multiple_owners'))
  assert.ok(LEGAL_FINANCE_TYPES.includes('hybrid'))
  assert.ok(LEGAL_PROPERTY_TYPES.includes('sectional_title'))
})

test('normalizes legacy seller branch names to canonical values', () => {
  assert.equal(normalizeSellerType('multiple_individuals'), 'multiple_owners')
  assert.equal(normalizeSellerType('joint owners'), 'multiple_owners')
  assert.equal(isMultipleOwnerSellerType('multiple_individuals'), true)
  assert.equal(isMultipleOwnerSellerType('multiple_owners'), true)
  assert.equal(isMultipleOwnerSellerType('individual'), false)
})

test('keeps finance aliases behind one legal workflow term', () => {
  assert.equal(normalizeFinanceTypeForLegalRules('combination'), 'hybrid')
  assert.equal(normalizeFinanceTypeForLegalRules('cash + bond'), 'hybrid')
  assert.equal(normalizeFinanceTypeForLegalRules('home loan'), 'bond')
  assert.equal(normalizeFinanceTypeForLegalRules('', { allowUnknown: true }), 'unknown')
})

test('normalizes buyer, property, ownership and transaction aliases', () => {
  assert.equal(normalizeBuyerType('married in community of property'), 'married_coc')
  assert.equal(normalizeBuyerType('foreign buyer'), 'foreign_purchaser')
  assert.equal(normalizeBuyerType('buyer poa'), 'power_of_attorney')
  assert.equal(normalizeBuyerType('sequestrated'), 'insolvent')
  assert.equal(normalizePropertyType('body corporate'), 'sectional_title')
  assert.equal(normalizeOwnershipStructure('poa'), 'power_of_attorney')
  assert.equal(normalizeOwnershipStructure('company liquidation'), 'liquidation')
  assert.equal(normalizeTransactionType('off plan'), 'development_sale')
})
