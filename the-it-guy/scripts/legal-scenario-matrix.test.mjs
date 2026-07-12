import assert from 'node:assert/strict'
import {
  LEGAL_SCENARIO_MATRIX_VERSION,
  LEGAL_SCENARIO_PHASE0_FIXTURES,
  LEGAL_SCENARIO_STATUSES,
  listLegalScenarios,
  resolveLegalMatterSupport,
  resolveLegalScenarioSupport,
} from '../src/core/legal/legalScenarioMatrix.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('exposes the Phase 0 legal scenario matrix', () => {
  assert.equal(LEGAL_SCENARIO_MATRIX_VERSION, 'legal_scenario_matrix_v1')
  assert.equal(listLegalScenarios('buyer').length > 0, true)
  assert.equal(listLegalScenarios('seller').length > 0, true)
  assert.equal(listLegalScenarios('finance').length > 0, true)
  assert.equal(listLegalScenarios('property').length > 0, true)
  assert.equal(listLegalScenarios('condition').length > 0, true)
})

test('classifies all locked Phase 0 fixtures', () => {
  for (const fixture of LEGAL_SCENARIO_PHASE0_FIXTURES) {
    const result = resolveLegalScenarioSupport({ axis: fixture.axis, value: fixture.value })
    assert.equal(result.status, fixture.expectedStatus, `${fixture.key} should be ${fixture.expectedStatus}`)
  }
})

test('keeps supported standard branches eligible for baseline automation', () => {
  const supportedInputs = [
    { axis: 'buyer', value: 'individual' },
    { axis: 'buyer', value: 'married_in_community' },
    { axis: 'buyer', value: 'company' },
    { axis: 'buyer', value: 'trust' },
    { axis: 'seller', value: 'multiple_individuals' },
    { axis: 'seller', value: 'deceased_estate' },
    { axis: 'finance', value: 'cash_and_bond' },
    { axis: 'property', value: 'body corporate' },
    { axis: 'condition', value: 'deposit' },
  ]

  for (const input of supportedInputs) {
    const result = resolveLegalScenarioSupport(input)
    assert.equal(result.status, LEGAL_SCENARIO_STATUSES.supported, `${input.axis}:${input.value}`)
    assert.equal(result.automationAllowed, true, `${input.axis}:${input.value} should allow baseline automation`)
  }
})

test('routes high-risk branches to manual review instead of supported aliases', () => {
  const manualReviewInputs = [
    { axis: 'buyer', value: 'foreign buyer' },
    { axis: 'buyer', value: 'cc' },
    { axis: 'buyer', value: 'poa' },
    { axis: 'buyer', value: 'minor' },
    { axis: 'buyer', value: 'deceased_estate' },
    { axis: 'buyer', value: 'sequestrated' },
    { axis: 'buyer', value: 'curatorship' },
    { axis: 'seller', value: 'foreign_owner' },
    { axis: 'seller', value: 'poa' },
    { axis: 'seller', value: 'cc' },
    { axis: 'finance', value: 'offshore_funds' },
    { axis: 'property', value: 'commercial_property' },
    { axis: 'condition', value: 'subject_to_sale' },
  ]

  for (const input of manualReviewInputs) {
    const result = resolveLegalScenarioSupport(input)
    assert.equal(result.status, LEGAL_SCENARIO_STATUSES.manualReview, `${input.axis}:${input.value}`)
    assert.equal(result.manualReviewRequired, true, `${input.axis}:${input.value} should require manual review`)
    assert.equal(result.automationAllowed, false, `${input.axis}:${input.value} should not allow baseline automation`)
  }
})

test('stops unsupported branches instead of guessing a supported rule', () => {
  const unsupportedInputs = [
    { axis: 'buyer', value: 'business rescue' },
    { axis: 'buyer', value: 'liquidation' },
    { axis: 'seller', value: 'business rescue' },
    { axis: 'seller', value: 'liquidation' },
    { axis: 'property', value: 'share block' },
    { axis: 'property', value: 'long term leasehold' },
    { axis: 'property', value: 'land claim' },
    { axis: 'buyer', value: 'alien_structure' },
  ]

  for (const input of unsupportedInputs) {
    const result = resolveLegalScenarioSupport(input)
    assert.equal(result.status, LEGAL_SCENARIO_STATUSES.unsupported, `${input.axis}:${input.value}`)
    assert.equal(result.unsupported, true, `${input.axis}:${input.value} should stop automation`)
  }
})

test('combines whole-matter status by highest risk', () => {
  const supportedMatter = resolveLegalMatterSupport({
    buyerType: 'company',
    sellerType: 'individual',
    financeType: 'bond',
    propertyType: 'sectional_title',
    conditions: ['standard_bond_condition'],
  })
  assert.equal(supportedMatter.status, LEGAL_SCENARIO_STATUSES.supported)
  assert.equal(supportedMatter.automationAllowed, true)

  const manualMatter = resolveLegalMatterSupport({
    buyerType: 'company',
    sellerType: 'individual',
    financeType: 'bond',
    propertyType: 'sectional_title',
    conditions: ['subject_to_sale'],
  })
  assert.equal(manualMatter.status, LEGAL_SCENARIO_STATUSES.manualReview)
  assert.equal(manualMatter.manualReviewRequired, true)
  assert.equal(manualMatter.automationAllowed, false)

  const blockedMatter = resolveLegalMatterSupport({
    buyerType: 'company',
    sellerType: 'liquidation',
    financeType: 'cash',
    propertyType: 'residential',
  })
  assert.equal(blockedMatter.status, LEGAL_SCENARIO_STATUSES.unsupported)
  assert.equal(blockedMatter.unsupported, true)
  assert.equal(blockedMatter.automationAllowed, false)
})

test('requires explicit classification for vague or missing branches', () => {
  const otherBuyer = resolveLegalScenarioSupport({ axis: 'buyer', value: 'other' })
  assert.equal(otherBuyer.status, LEGAL_SCENARIO_STATUSES.manualReview)
  assert.equal(otherBuyer.automationAllowed, false)

  const missingSeller = resolveLegalScenarioSupport({ axis: 'seller' })
  assert.equal(missingSeller.status, LEGAL_SCENARIO_STATUSES.manualReview)
  assert.equal(missingSeller.automationAllowed, false)
})

console.log('legal scenario matrix tests passed')
