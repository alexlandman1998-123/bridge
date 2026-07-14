import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalDocumentScenarioPlaceholders,
  resolveLegalDocumentScenarioProfile,
} from '../legalDocumentScenarioProfile.js'
import { resolveMandateScenarioProfile } from '../mandateScenarioProfile.js'

test('resolves a company sectional-title mandate through the shared profile', () => {
  const profile = resolveLegalDocumentScenarioProfile({
    packetType: 'mandate',
    seller: { entityType: 'company' },
    property: { propertyType: 'apartment' },
  })

  assert.equal(profile.complete, true)
  assert.equal(profile.scenarioKey, 'company_sectional_title')
  assert.deepEqual(profile.activeClausePacks, [
    'seller_company_authority_pack',
    'property_sectional_title_pack',
  ])
})

test('resolves seller, buyer, property, and finance dimensions for an OTP', () => {
  const profile = resolveLegalDocumentScenarioProfile({
    packetType: 'otp',
    placeholders: {
      seller_entity_type: 'trust',
      buyer_entity_type: 'individual',
      buyer_marital_status: 'married in community of property',
      property_title_type: 'sectional_title',
      finance_type: 'combination',
    },
  })

  assert.equal(profile.complete, true)
  assert.equal(profile.sellerClauseProfile, 'trust')
  assert.equal(profile.buyerClauseProfile, 'individual_spouse_consent')
  assert.equal(profile.propertyClauseProfile, 'sectional_title')
  assert.equal(profile.financeClauseProfile, 'combination')
  assert.deepEqual(profile.activeClausePacks, [
    'seller_trust_authority_pack',
    'buyer_individual_capacity_pack',
    'buyer_spouse_consent_pack',
    'property_sectional_title_pack',
    'bond_finance_pack',
  ])
})

test('records unknown legal-routing facts without silently completing the scenario', () => {
  const profile = resolveLegalDocumentScenarioProfile({
    packetType: 'otp',
    placeholders: {
      seller_entity_type: 'company',
      property_title_type: 'full_title',
    },
  })

  assert.equal(profile.complete, false)
  assert.deepEqual(profile.missingRoutingFacts, ['buyer_entity_type', 'finance_type'])
  assert.equal(profile.buyerClauseProfile, 'party_unknown')
  assert.equal(profile.financeClauseProfile, 'finance_unknown')
})

test('keeps the mandate compatibility wrapper on the shared resolver', () => {
  const profile = resolveMandateScenarioProfile({
    placeholders: {
      seller_entity_type: 'individual',
      seller_marital_status: 'married in community of property',
      property_title_type: 'full_title',
    },
  })
  const placeholders = buildLegalDocumentScenarioPlaceholders(profile)

  assert.equal(profile.templateVariant, 'individual_spouse_consent_full_title')
  assert.equal(placeholders.legal_document_scenario, 'individual_spouse_consent_full_title')
  assert.equal(placeholders.seller_clause_profile, 'individual_spouse_consent')
})

test('covers the legal party and property routing matrix', () => {
  const scenarios = [
    {
      label: 'company full title',
      seller: { entityType: 'company' },
      property: { propertyType: 'freehold' },
      expectedKey: 'company_full_title',
    },
    {
      label: 'trust sectional title',
      seller: { entityType: 'trust' },
      property: { propertyType: 'sectional title' },
      expectedKey: 'trust_sectional_title',
    },
    {
      label: 'individual out of community full title',
      seller: { entityType: 'individual', maritalStatus: 'out of community of property' },
      property: { propertyType: 'house' },
      expectedKey: 'individual_full_title',
    },
    {
      label: 'individual in community sectional title',
      seller: { entityType: 'individual', maritalStatus: 'in community of property' },
      property: { propertyType: 'apartment' },
      expectedKey: 'individual_spouse_consent_sectional_title',
    },
  ]

  for (const scenario of scenarios) {
    const profile = resolveLegalDocumentScenarioProfile({
      packetType: 'mandate',
      seller: scenario.seller,
      property: scenario.property,
    })

    assert.equal(profile.complete, true, scenario.label)
    assert.equal(profile.scenarioKey, scenario.expectedKey, scenario.label)
  }
})

test('builds canonical OTP routing placeholders from one resolved profile', () => {
  const profile = resolveLegalDocumentScenarioProfile({
    packetType: 'otp',
    seller: { entityType: 'company' },
    buyer: { entityType: 'trust' },
    property: { propertyType: 'freehold' },
    transaction: { financeType: 'cash' },
  })
  const placeholders = buildLegalDocumentScenarioPlaceholders(profile)

  assert.equal(placeholders.legal_document_scenario, 'company_seller__trust_buyer__full_title__cash')
  assert.equal(placeholders.seller_clause_profile, 'company')
  assert.equal(placeholders.buyer_clause_profile, 'trust')
  assert.equal(placeholders.property_clause_profile, 'full_title')
  assert.equal(placeholders.finance_clause_profile, 'cash')
  assert.equal(
    placeholders.legal_active_clause_packs,
    'seller_company_authority_pack, buyer_trust_authority_pack, property_full_title_pack, cash_sale_pack',
  )
})
