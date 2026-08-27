import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BUYER_DOCUMENT_RULE_SET_VERSION,
  deriveOnboardingConfiguration,
} from '../../../lib/purchaserPersonas.js'
import { resolveSellerOnboardingFlow } from '../../../lib/sellerOnboardingFlow.js'

function documentKeys(configuration = {}) {
  return new Set((configuration.requiredDocuments || []).map((document) => document.key))
}

test('self-employed bond onboarding requests six months and the supporting evidence set', () => {
  const configuration = deriveOnboardingConfiguration({
    purchaser_type: 'individual',
    purchase_finance_type: 'bond',
    employment_type: 'self_employed',
    first_name: 'Alex',
    last_name: 'Buyer',
  })
  const keys = documentKeys(configuration)

  assert.equal(keys.has('bank_statements_12_months'), false)
  assert.equal(keys.has('bank_statements_6_months'), true)
  assert.equal(keys.has('financial_statements'), true)
  assert.equal(keys.has('tax_returns_latest'), true)
  assert.equal(keys.has('accountant_letter'), true)

  const bankStatements = configuration.requiredDocuments.find(
    (document) => document.key === 'bank_statements_6_months',
  )
  assert.equal(bankStatements.label, 'Purchaser 1 (Alex Buyer) — Bank Statements (Last 6 Months)')
  assert.equal(bankStatements.requestRuleSetVersion, BUYER_DOCUMENT_RULE_SET_VERSION)
  assert.equal(bankStatements.requestTriggerCode, 'finance:bond:self_employed')
  assert.deepEqual(bankStatements.requestTriggerFacts, {
    purchaserType: 'individual',
    financeType: 'bond',
    employmentType: 'self_employed',
    coPurchasing: false,
    spouseIsCoPurchaser: false,
  })
})

test('cash onboarding does not request bond affordability documents', () => {
  const configuration = deriveOnboardingConfiguration({
    purchaser_type: 'individual',
    purchase_finance_type: 'cash',
    employment_type: 'self_employed',
  })
  const keys = documentKeys(configuration)

  assert.equal(keys.has('proof_of_funds'), true)
  assert.equal(keys.has('bank_statements_6_months'), false)
  assert.equal(keys.has('financial_statements'), false)
  assert.equal(keys.has('tax_returns_latest'), false)
})

test('an ANC spouse is only assigned purchaser documents when they are a co-purchaser', () => {
  const relatedSpouse = deriveOnboardingConfiguration({
    purchaser_type: 'married_anc',
    purchase_finance_type: 'cash',
    spouse_full_name: 'Taylor Buyer',
    spouse_is_co_purchaser: 'no',
  })
  assert.equal(documentKeys(relatedSpouse).has('spouse_id_optional'), false)
  assert.equal(documentKeys(relatedSpouse).has('spouse_proof_of_address_optional'), false)

  const coPurchasingSpouse = deriveOnboardingConfiguration({
    purchaser_type: 'married_anc',
    purchase_finance_type: 'cash',
    spouse_full_name: 'Taylor Buyer',
    spouse_is_co_purchaser: 'yes',
  })
  const spouseId = coPurchasingSpouse.requiredDocuments.find(
    (document) => document.key === 'spouse_id_optional',
  )
  assert.equal(spouseId.participantKey, 'purchaser:2')
  assert.equal(spouseId.label, 'Purchaser 2 (Taylor Buyer) — Co-purchaser ID Copy')
})

test('property features only trigger approved compliance documents', () => {
  const featureFlow = resolveSellerOnboardingFlow({
    features: ['garden', 'pool', 'borehole', 'water_tank', 'gas_geyser', 'solar_panels', 'electric_fencing'],
  })
  const triggers = new Set(featureFlow.document_triggers)

  assert.equal(triggers.has('gas_compliance_certificate'), true)
  assert.equal(triggers.has('solar_compliance_documents'), true)
  assert.equal(triggers.has('electric_fence_certificate'), true)
  assert.equal(triggers.has('borehole_certificate'), false)

  const explicitBoreholeCertificate = resolveSellerOnboardingFlow({
    boreholeInstallation: true,
    boreholeCertificateRequired: true,
  })
  assert.equal(explicitBoreholeCertificate.document_triggers.includes('borehole_certificate'), true)
})
