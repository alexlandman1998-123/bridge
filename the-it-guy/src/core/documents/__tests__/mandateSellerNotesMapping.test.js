import assert from 'node:assert/strict'
import test from 'node:test'

import { mapSellerOnboardingToMandateData } from '../mandateDataMapper.js'

test('seller onboarding special conditions and notes are included in mandate data and placeholders', () => {
  const result = mapSellerOnboardingToMandateData({
    onboardingSubmission: {
      sellerFirstName: 'Sam',
      sellerSurname: 'Seller',
      email: 'sam@example.com',
      propertyAddress: '1 Test Street',
      mandateType: 'sole',
      askingPrice: 1500000,
      commissionPercentage: 5,
      vatHandling: 'inclusive',
      specialConditions: 'Sale excludes the solar battery.',
      sellerNotes: 'Seller requires 24 hours notice for viewings.',
    },
  })

  assert.match(result.mandate.specialConditions, /Sale excludes the solar battery\./)
  assert.match(result.mandate.specialConditions, /Notes: Seller requires 24 hours notice for viewings\./)
  assert.equal(result.placeholders.special_conditions, result.mandate.specialConditions)
})

test('internal agent notes are excluded from mandate data', () => {
  const result = mapSellerOnboardingToMandateData({
    onboardingSubmission: {
      sellerFirstName: 'Sam', sellerSurname: 'Seller', email: 'sam@example.com',
      propertyAddress: '1 Test Street', mandateType: 'sole', askingPrice: 1500000,
      commissionPercentage: 5, vatHandling: 'inclusive',
      specialConditions: 'Occupation is on transfer.',
      internalNotes: 'Compliance team must review the source of funds.',
      agentNotes: 'Do not share this negotiation note.',
      notes: 'Legacy internal workspace note.',
    },
  })
  assert.match(result.mandate.specialConditions, /Occupation is on transfer\./)
  assert.doesNotMatch(result.mandate.specialConditions, /source of funds/i)
  assert.doesNotMatch(result.mandate.specialConditions, /negotiation note/i)
  assert.doesNotMatch(result.mandate.specialConditions, /workspace note/i)
})
