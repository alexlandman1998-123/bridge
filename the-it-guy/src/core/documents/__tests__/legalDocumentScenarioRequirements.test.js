import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalDocumentRequirementDraftFromPlaceholders,
  resolveLegalDocumentScenarioRequirements,
} from '../legalDocumentScenarioRequirements.js'

test('requires spouse facts only for an individual married in community', () => {
  const requirements = resolveLegalDocumentScenarioRequirements({
    packetType: 'otp',
    seller: { entityType: 'company' },
    buyer: { entityType: 'individual', maritalStatus: 'in community of property' },
    property: { propertyType: 'full title' },
    transaction: { financeType: 'cash' },
    draft: {},
  })

  assert.ok(requirements.requiredFieldKeys.includes('buyerSpouseFullName'))
  assert.ok(requirements.requiredFieldKeys.includes('buyerSpouseIdNumber'))
  assert.ok(requirements.requiredFieldKeys.includes('buyerSpouseEmail'))
  assert.ok(!requirements.requiredFieldKeys.includes('sellerSpouseFullName'))
})

test('requires trust authority and sectional-title facts for that scenario', () => {
  const requirements = resolveLegalDocumentScenarioRequirements({
    packetType: 'otp',
    seller: { entityType: 'trust' },
    buyer: { entityType: 'company' },
    property: { propertyType: 'sectional title' },
    transaction: { financeType: 'bond' },
    draft: {},
  })

  for (const key of ['sellerTrusteeNames', 'sellerAuthorityBasis', 'unitNumber', 'complexName', 'bondAmount']) {
    assert.ok(requirements.requiredFieldKeys.includes(key), key)
  }
  assert.ok(!requirements.requiredFieldKeys.includes('erfNumber'))
  assert.ok(!requirements.requiredFieldKeys.includes('cashAmount'))
})

test('matches company and cash generation requirements', () => {
  const requirements = resolveLegalDocumentScenarioRequirements({
    packetType: 'otp',
    seller: { entityType: 'company' },
    buyer: { entityType: 'company' },
    property: { propertyType: 'full title' },
    transaction: { financeType: 'cash' },
    draft: {},
  })

  assert.ok(requirements.requiredFieldKeys.includes('sellerResolutionDate'))
  assert.ok(requirements.requiredFieldKeys.includes('buyerResolutionDate'))
  assert.ok(requirements.requiredFieldKeys.includes('cashAmount'))
})

test('maps canonical packet placeholders back to the UI readiness contract', () => {
  const draft = buildLegalDocumentRequirementDraftFromPlaceholders({
    seller_company_registration_number: '2020/123456/07',
    seller_resolution_date: '2026-07-14',
    buyer_spouse_full_name: 'Taylor Buyer',
    property_title_type: 'sectional_title',
    property_unit_number: '12',
    property_complex_name: 'Sample Scheme',
    cash_amount: '3250000',
  })

  assert.equal(draft.sellerIdNumber, '2020/123456/07')
  assert.equal(draft.sellerResolutionDate, '2026-07-14')
  assert.equal(draft.buyerSpouseFullName, 'Taylor Buyer')
  assert.equal(draft.propertyTitleType, 'sectional_title')
  assert.equal(draft.unitNumber, '12')
  assert.equal(draft.cashAmount, '3250000')
})

test('reports readiness from the same scenario-specific field list', () => {
  const requirements = resolveLegalDocumentScenarioRequirements({
    packetType: 'mandate',
    seller: { entityType: 'individual', maritalStatus: 'out of community of property' },
    property: { propertyType: 'full title' },
    draft: {
      sellerFullName: 'Alex Seller',
      sellerIdNumber: '8001015009087',
      sellerMaritalRegime: 'out_of_community',
      propertyAddress: '1 Main Road',
      propertyTitleType: 'full_title',
      erfNumber: '1234',
    },
  })

  assert.equal(requirements.complete, true)
  assert.deepEqual(requirements.missingFields, [])
})
