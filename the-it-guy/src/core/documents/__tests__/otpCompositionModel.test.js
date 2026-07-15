import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOtpCompositionPlan, listOtpManagedFacts } from '../otpCompositionModel.js'

const sections = [
  { section_key: 'definitions', section_label: 'Definitions', section_type: 'legal_text', sort_order: 1, legal_text: 'Definitions.' },
  { section_key: 'schedule_1', section_label: 'Transaction particulars', section_type: 'dynamic_fields', sort_order: 2, legal_text: '{{purchase_price}}' },
  { section_key: 'buyer_individual_capacity_pack', section_label: 'Individual buyer', sort_order: 3, condition_json: { enabled: true, rule: { field: 'buyer_entity_type', operator: 'equals', value: 'individual' } } },
  { section_key: 'buyer_company_authority_pack', section_label: 'Company buyer', sort_order: 4, condition_json: { enabled: true, rule: { field: 'buyer_entity_type', operator: 'in', value: ['company', 'close_corporation'] } } },
  { section_key: 'cash_sale_pack', section_label: 'Cash sale', sort_order: 5, condition_json: { enabled: true, rule: { field: 'finance_type', operator: 'equals', value: 'cash' } } },
  { section_key: 'signature_pages', section_label: 'Signatures', section_type: 'signature_zone', sort_order: 6 },
]

const companyBond = {
  seller: { entity_type: 'individual', marital_regime: 'single' },
  buyer: { entity_type: 'company' },
  property: { title_type: 'full_title' },
  transaction: { finance_type: 'bond' },
}

test('keeps standard, conditional and signing responsibilities separate', () => {
  const plan = buildOtpCompositionPlan({ sections, input: companyBond })
  assert.equal(plan.summary.coreCount, 1)
  assert.equal(plan.summary.transactionDataCount, 1)
  assert.equal(plan.summary.conditionalCount, 3)
  assert.equal(plan.summary.signingCount, 1)
  assert.deepEqual(plan.groups.standard.map((entry) => entry.key), ['definitions', 'schedule_1'])
  assert.deepEqual(plan.groups.signing.map((entry) => entry.key), ['signature_pages'])
})

test('explains conditional inclusion from onboarding facts', () => {
  const plan = buildOtpCompositionPlan({ sections, input: companyBond })
  const decisions = Object.fromEntries(plan.groups.conditional.map((entry) => [entry.key, entry]))
  assert.equal(decisions.buyer_company_authority_pack.included, true)
  assert.equal(decisions.buyer_individual_capacity_pack.included, false)
  assert.equal(decisions.cash_sale_pack.included, false)
  assert.match(decisions.buyer_company_authority_pack.reason, /Included/)
  assert.equal(plan.facts.find((fact) => fact.key === 'buyer_entity_type').value, 'company')
})

test('reports unanswered routing facts instead of silently choosing clauses', () => {
  const plan = buildOtpCompositionPlan({ sections, input: {} })
  assert.equal(plan.ready, false)
  assert.equal(plan.missingFacts.includes('buyer_entity_type'), true)
  assert.match(plan.groups.conditional.find((entry) => entry.key === 'buyer_company_authority_pack').reason, /Needs buyer entity type/)
})

test('publishes one small, user-facing registry of managed onboarding facts', () => {
  const facts = listOtpManagedFacts()
  assert.deepEqual(facts.filter((fact) => fact.layer === 'primary').map((fact) => fact.key), [
    'buyer_entity_type',
    'buyer_marital_regime',
    'seller_entity_type',
    'seller_marital_regime',
    'property_title_type',
    'finance_type',
  ])
  assert.equal(facts.filter((fact) => fact.layer === 'exception').length, 7)
  assert.equal(facts.every((fact) => fact.question && fact.group), true)
})

test('keeps unusual legal conditions in an explicit exception layer', () => {
  const exceptionSections = [
    ...sections,
    { section_key: 'linked_property_sale_pack', section_label: 'Linked sale', condition_json: { enabled: true, rule: { field: 'legal_active_clause_packs', operator: 'contains', value: 'linked_property_sale_pack' } } },
  ]
  const plan = buildOtpCompositionPlan({
    sections: exceptionSections,
    input: {
      ...companyBond,
      legalDealFacts: {
        instrument: { familyKey: 'residential_resale' },
        parties: { seller: { entityType: 'individual', maritalRegime: 'single' }, buyer: { entityType: 'company' } },
        property: { titleType: 'full_title' },
        finance: { type: 'bond' },
        conditions: { saleOfExistingProperty: 'yes', linkedSaleDeadline: '2026-10-01' },
      },
    },
  })
  assert.equal(plan.groups.conditional.find((entry) => entry.key === 'linked_property_sale_pack').included, true)
  assert.equal(plan.facts.find((fact) => fact.key === 'sale_of_existing_property').value, 'yes')
})
