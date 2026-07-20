import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalDocumentScenarioPlaceholders,
  resolveCanonicalLegalDocumentScenario,
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
    'cash_contribution_pack',
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

test('does not invent defaults when an OTP has no routing facts', () => {
  const profile = resolveCanonicalLegalDocumentScenario({ packetType: 'otp' })

  assert.equal(profile.complete, false)
  assert.equal(profile.sellerEntityType, '')
  assert.equal(profile.buyerEntityType, '')
  assert.equal(profile.propertyTitleType, '')
  assert.equal(profile.financeType, '')
  assert.deepEqual(profile.activePackKeys, [])
  assert.deepEqual(profile.missingFacts, [
    'seller_entity_type',
    'buyer_entity_type',
    'property_title_type',
    'finance_type',
  ])
})

test('records provenance and blocks contradictory source values', () => {
  const profile = resolveCanonicalLegalDocumentScenario({
    packetType: 'mandate',
    placeholders: {
      seller_entity_type: 'company',
      property_title_type: 'full_title',
    },
    seller: { entityType: 'trust' },
  })

  assert.equal(profile.complete, false)
  assert.equal(profile.sellerEntityType, 'company')
  assert.equal(profile.sourceProvenance.seller_entity_type.source, 'placeholders')
  assert.deepEqual(profile.conflictingFacts.map((fact) => fact.field), ['seller_entity_type'])
  assert.deepEqual(
    profile.conflictingFacts[0].values.map((entry) => entry.value),
    ['company', 'trust'],
  )
})

test('blocks unsupported values instead of coercing them to a legal type', () => {
  const profile = resolveCanonicalLegalDocumentScenario({
    packetType: 'mandate',
    seller: { entityType: 'partnership' },
    property: { titleType: 'full_title' },
  })

  assert.equal(profile.complete, false)
  assert.deepEqual(profile.invalidFacts.map((fact) => fact.field), ['seller_entity_type'])
  assert.deepEqual(profile.missingFacts, ['seller_entity_type'])
})

test('blocks a rejected source candidate even when another source is valid', () => {
  const profile = resolveCanonicalLegalDocumentScenario({
    packetType: 'mandate',
    placeholders: {
      seller_entity_type: 'company',
      property_title_type: 'full_title',
    },
    seller: { entityType: 'partnership' },
  })

  assert.equal(profile.sellerEntityType, 'company')
  assert.equal(profile.complete, false)
  assert.deepEqual(profile.invalidFacts.map((fact) => fact.field), ['seller_entity_type'])
  assert.equal(profile.sourceProvenance.seller_entity_type.rejectedCandidates[0].source, 'seller')
})

test('retains close corporation as a canonical fact while using company wording', () => {
  const profile = resolveCanonicalLegalDocumentScenario({
    packetType: 'mandate',
    seller: { entityType: 'Close Corporation' },
    property: { titleType: 'full_title' },
  })
  const placeholders = buildLegalDocumentScenarioPlaceholders(profile)

  assert.equal(profile.complete, true)
  assert.equal(profile.sellerEntityType, 'close_corporation')
  assert.equal(profile.sellerClauseProfile, 'company')
  assert.equal(placeholders.seller_entity_type, 'close_corporation')
  assert.ok(profile.activePackKeys.includes('seller_company_authority_pack'))
})

test('maps legacy property aliases into the canonical two-way title model', () => {
  const sectional = resolveCanonicalLegalDocumentScenario({
    packetType: 'mandate',
    seller: { entityType: 'company' },
    property: { titleType: 'share block' },
  })
  const fullTitle = resolveCanonicalLegalDocumentScenario({
    packetType: 'mandate',
    seller: { entityType: 'trust' },
    property: { titleType: 'agricultural holding' },
  })

  assert.equal(sectional.propertyTitleType, 'sectional_title')
  assert.equal(fullTitle.propertyTitleType, 'full_title')
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
