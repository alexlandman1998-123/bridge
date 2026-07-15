import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendDocumentStartLegalScenarioParams,
  getDocumentStartLegalScenarioInclusions,
  normalizeDocumentStartLegalScenario,
  readDocumentStartLegalScenarioParams,
} from '../documentStartLegalScenario.js'

test('classifies a company sectional-title mandate', () => {
  const scenario = normalizeDocumentStartLegalScenario({
    sellerEntityType: 'company',
    propertyTitleType: 'sectional title',
  }, 'mandate')

  assert.equal(scenario.complete, true)
  assert.equal(scenario.mandateTemplateVariant, 'company_sectional_title')
  assert.deepEqual(scenario.missingFields, [])
})

test('requires marital regime for an individual party', () => {
  const scenario = normalizeDocumentStartLegalScenario({
    sellerEntityType: 'individual',
    propertyTitleType: 'full_title',
  }, 'mandate')

  assert.equal(scenario.complete, false)
  assert.deepEqual(scenario.missingFields, ['seller_marital_regime'])
})

test('classifies an OTP across seller, buyer, property, and finance', () => {
  const scenario = normalizeDocumentStartLegalScenario({
    sellerEntityType: 'trust',
    buyerEntityType: 'individual',
    buyerMaritalRegime: 'married in community of property',
    propertyTitleType: 'apartment',
    financeType: 'hybrid',
  }, 'otp')

  assert.equal(scenario.complete, true)
  assert.equal(scenario.sellerProfile, 'trust')
  assert.equal(scenario.buyerProfile, 'individual_spouse_consent')
  assert.equal(scenario.propertyTitleType, 'sectional_title')
  assert.equal(scenario.financeType, 'combination')
  assert.deepEqual(getDocumentStartLegalScenarioInclusions(scenario, 'otp'), [
    'Trustee authority and signature wording',
    'Spouse consent and signature wording',
    'Sectional-title property wording',
    'Cash and bond finance wording',
  ])
})

test('round trips the scenario through workspace query parameters', () => {
  const params = new URLSearchParams()
  appendDocumentStartLegalScenarioParams(params, {
    sellerEntityType: 'company',
    buyerEntityType: 'trust',
    propertyTitleType: 'full_title',
    financeType: 'cash',
  }, 'otp')

  const scenario = readDocumentStartLegalScenarioParams(params, 'otp')
  assert.equal(scenario.complete, true)
  assert.equal(scenario.sellerEntityType, 'company')
  assert.equal(scenario.buyerEntityType, 'trust')
  assert.equal(scenario.propertyTitleType, 'full_title')
  assert.equal(scenario.financeType, 'cash')
  assert.equal(scenario.legalInstrumentFamily, 'residential_resale')
})

test('carries a specialist agreement family into the legal workspace', () => {
  const params = new URLSearchParams()
  appendDocumentStartLegalScenarioParams(params, {
    legalInstrumentFamily: 'auction_sale',
    sellerEntityType: 'company',
    buyerEntityType: 'company',
    propertyTitleType: 'full_title',
    financeType: 'cash',
  }, 'otp')

  const scenario = readDocumentStartLegalScenarioParams(params, 'otp')
  assert.equal(scenario.legalInstrumentFamily, 'auction_sale')
  assert.equal(scenario.legalInstrumentFamilyGenerationAllowed, false)
  assert.equal(getDocumentStartLegalScenarioInclusions(scenario, 'otp')[0], 'Attorney-approved specialist agreement required')
})
