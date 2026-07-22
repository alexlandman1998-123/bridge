import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateConditionalSigningPlan } from '../conditionalSigningEngine.js'

const agent = {
  agent_full_name: 'Ava Agent',
  agent_email: 'ava@agency.example',
}

test('mandate signer plan adds seller spouse only for an in-community individual', () => {
  const common = {
    packetType: 'mandate',
    placeholders: {
      ...agent,
      seller_entity_type: 'individual',
      seller_full_name: 'Sam Seller',
      seller_email: 'sam@example.com',
      seller_spouse_full_name: 'Pat Seller',
      seller_spouse_email: 'pat@example.com',
      property_title_type: 'full_title',
    },
  }
  const single = evaluateConditionalSigningPlan({
    ...common,
    placeholders: { ...common.placeholders, seller_marital_regime: 'single' },
  })
  const married = evaluateConditionalSigningPlan({
    ...common,
    placeholders: { ...common.placeholders, seller_marital_regime: 'in_community' },
  })

  assert.deepEqual(single.selectedSignerRoles, ['seller', 'agent'])
  assert.deepEqual(married.selectedSignerRoles, ['seller', 'seller_spouse', 'agent'])
  assert.ok(single.excludedScenarioRoles.includes('seller_spouse'))
  assert.equal(married.canPrepareSigning, true)
})

test('company and trust parties use representative roles without spouse roles', () => {
  const audit = evaluateConditionalSigningPlan({
    packetType: 'otp',
    placeholders: {
      buyer_entity_type: 'company',
      buyer_representative_name: 'Buyer Director',
      buyer_representative_email: 'director@buyer.example',
      seller_entity_type: 'trust',
      seller_representative_name: 'Seller Trustee',
      seller_representative_email: 'trustee@seller.example',
      property_title_type: 'sectional_title',
      finance_type: 'bond',
    },
  })

  assert.deepEqual(audit.selectedSignerRoles, ['purchaser_1', 'seller'])
  assert.ok(audit.excludedScenarioRoles.includes('buyer_spouse'))
  assert.ok(audit.excludedScenarioRoles.includes('seller_spouse'))
  assert.equal(audit.signers[0].label, 'Buyer representative')
  assert.equal(audit.signers[1].label, 'Seller representative')
})

test('stale spouse fields and roster entries fail closed after the scenario changes', () => {
  const input = {
    packetType: 'otp',
    placeholders: {
      buyer_entity_type: 'individual',
      buyer_marital_regime: 'single',
      buyer_full_name: 'Buyer',
      buyer_email: 'buyer@example.com',
      seller_entity_type: 'individual',
      seller_marital_regime: 'single',
      seller_full_name: 'Seller',
      seller_email: 'seller@example.com',
      property_title_type: 'full_title',
      finance_type: 'cash',
    },
    plannedFields: [
      { signerRole: 'purchaser_1', fieldType: 'signature', required: true },
      { signerRole: 'seller', fieldType: 'signature', required: true },
      { signerRole: 'buyer_spouse', fieldType: 'signature', required: true },
    ],
    actualSigners: [
      { signerRole: 'purchaser_1' },
      { signerRole: 'seller' },
      { signerRole: 'buyer_spouse' },
    ],
  }
  const audit = evaluateConditionalSigningPlan(input)

  assert.equal(audit.canPrepareSigning, false)
  assert.ok(audit.issues.some((item) => item.code === 'CONDITIONAL_SIGNING_FIELD_ROLE_UNEXPECTED'))
  assert.ok(audit.issues.some((item) => item.code === 'CONDITIONAL_SIGNER_ROSTER_UNEXPECTED'))
})

test('missing contact facts block signing preparation but not document assembly', () => {
  const audit = evaluateConditionalSigningPlan({
    packetType: 'mandate',
    placeholders: {
      seller_entity_type: 'company',
      seller_representative_name: 'Director',
      property_title_type: 'full_title',
      agent_full_name: 'Agent',
    },
  })

  assert.equal(audit.documentCanProceed, true)
  assert.equal(audit.canPrepareSigning, false)
  assert.ok(audit.issues.every((item) => item.code === 'CONDITIONAL_SIGNER_FACT_MISSING'))
})

test('required roles must have exactly one required signature field when a template supplies fields', () => {
  const audit = evaluateConditionalSigningPlan({
    packetType: 'mandate',
    placeholders: {
      ...agent,
      seller_entity_type: 'individual',
      seller_marital_regime: 'single',
      seller_full_name: 'Seller',
      seller_email: 'seller@example.com',
      property_title_type: 'full_title',
    },
    plannedFields: [
      { signerRole: 'seller', fieldType: 'signature', required: true },
      { signerRole: 'seller', fieldType: 'signature', required: true },
    ],
  })

  assert.ok(audit.issues.some((item) => item.code === 'CONDITIONAL_SIGNING_FIELD_MISSING'))
  assert.ok(audit.issues.some((item) => item.code === 'CONDITIONAL_SIGNING_FIELD_DUPLICATE'))
  assert.equal(audit.documentCanProceed, false)
})

test('stored protected signer-role conditions cannot drift', () => {
  const audit = evaluateConditionalSigningPlan({
    packetType: 'mandate',
    placeholders: {
      ...agent,
      seller_entity_type: 'individual',
      seller_marital_regime: 'single',
      seller_full_name: 'Seller',
      seller_email: 'seller@example.com',
      property_title_type: 'full_title',
    },
    signerRoleDefinitions: [
      { role: 'seller', required: true },
      { role: 'agent', required: true },
      { role: 'seller_spouse', required: false, conditionJson: { enabled: true, rule: { field: 'seller_spouse_consent_required', operator: 'equals', value: 'No' } } },
      { role: 'witness', required: false },
    ],
  })

  assert.ok(audit.issues.some((item) => item.code === 'CONDITIONAL_SIGNER_ROLE_RULE_DRIFT'))
  assert.equal(audit.documentCanProceed, false)
})
