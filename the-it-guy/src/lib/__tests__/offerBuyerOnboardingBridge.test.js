import assert from 'node:assert/strict'

import {
  buildOfferBuyerVerificationModel,
  mapOfferFormToBuyerOnboardingForm,
} from '../offerBuyerOnboardingBridge.js'

const offerForm = {
  fullName: 'Alex Buyer',
  email: 'alex@example.test',
  phone: '+27 82 000 0000',
  idNumber: '9001015009087',
  offerAmount: '2500000',
  depositAmount: '250000',
  financeType: 'hybrid',
  proofOfFundsUrl: 'https://docs.example.test/proof.pdf',
  bondAssistancePreference: 'originator_assisted',
  needsBondAssistance: true,
}

const formData = mapOfferFormToBuyerOnboardingForm(offerForm)

assert.equal(formData.purchase_finance_type, 'combination')
assert.equal(formData.first_name, 'Alex')
assert.equal(formData.last_name, 'Buyer')
assert.equal(formData.finance.purchase_price, '2500000')
assert.equal(formData.finance.cash_amount, '250000')
assert.equal(formData.finance.bond_amount, '2250000')
assert.equal(formData.finance.proof_of_funds_available, 'yes')
assert.equal(formData.finance.bond_assistance_preference, 'originator_assisted')
assert.equal(formData.finance.bond_help_requested, 'yes')
assert.equal(formData.finance.finance_managed_by, 'bond_originator')
assert.equal(formData.finance_managed_by, 'bond_originator')

const selfManagedFormData = mapOfferFormToBuyerOnboardingForm({
  ...offerForm,
  financeType: 'bond',
  bondAssistancePreference: 'self_managed',
  needsBondAssistance: false,
})

assert.equal(selfManagedFormData.purchase_finance_type, 'bond')
assert.equal(selfManagedFormData.bond_assistance_preference, 'self_managed')
assert.equal(selfManagedFormData.bond_help_requested, 'no')
assert.equal(selfManagedFormData.finance.finance_managed_by, 'client')
assert.equal(selfManagedFormData.finance_managed_by, 'client')

const model = buildOfferBuyerVerificationModel(offerForm, { confirmedAccuracy: true })
const sectionKeys = model.sections.map((section) => section.key)

assert.deepEqual(sectionKeys, [
  'about',
  'household',
  'employment',
  'finance',
  'documents',
  'compliance',
  'signature',
])
assert.equal(model.flow.buyer_finance_branch, 'hybrid')
assert.equal(model.sections.find((section) => section.key === 'compliance')?.complete, true)
assert.equal(model.requiredDocuments.length > 0, true)

console.log('offerBuyerOnboardingBridge tests passed')
