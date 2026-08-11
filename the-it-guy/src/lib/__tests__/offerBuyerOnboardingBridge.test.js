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

const onboardingOnlyFormData = mapOfferFormToBuyerOnboardingForm({
  fullName: 'Price Context Buyer',
  email: 'price@example.test',
  phone: '0820000002',
  idNumber: '9101015009087',
  purchasePrice: '1750000',
  depositAmount: '150000',
  financeType: 'bond',
})

assert.equal(onboardingOnlyFormData.purchase_price, '1750000')
assert.equal(onboardingOnlyFormData.finance.bond_amount, '1600000')

const companyFormData = mapOfferFormToBuyerOnboardingForm({
  purchaser_entity_type: 'company',
  company_name: 'Buyer Holdings (Pty) Ltd',
  company_registration_number: '2020/123456/07',
  company_registered_address: '1 Company Road',
  nature_of_business: 'Property investment',
  company_contact_name: 'Casey Contact',
  company_contact_email: 'casey@example.test',
  company_contact_phone: '0820000003',
  authorised_signatory_name: 'Dina Director',
  authorised_signatory_identity_number: '8001015009087',
  authorised_signatory_email: 'dina@example.test',
  authorised_signatory_phone: '0820000004',
  authorised_signatory_capacity: 'Director',
  board_resolution_available: 'yes',
  directors: [
    {
      full_name: 'Dina Director',
      id_number: '8001015009087',
      phone: '0820000004',
      email: 'dina@example.test',
      residential_address: '2 Director Street',
      role_title: 'Director',
      signing_authority: true,
    },
  ],
})

assert.equal(companyFormData.purchaser_type, 'company')
assert.equal(companyFormData.company.name, 'Buyer Holdings (Pty) Ltd')
assert.equal(companyFormData.company.directors.length, 1)
assert.equal(companyFormData.company.directors[0].signing_authority, 'yes')
assert.equal(companyFormData.authorised_signatory_name, 'Dina Director')

const trustFormData = mapOfferFormToBuyerOnboardingForm({
  purchaser_entity_type: 'trust',
  trust_name: 'Buyer Family Trust',
  trust_registration_number: 'IT1234/2020',
  trust_type: 'Family trust',
  masters_office_reference: 'MO-123',
  trust_registered_address: '1 Trust Road',
  trust_contact_name: 'Terry Trustee',
  trust_contact_email: 'terry@example.test',
  trust_contact_phone: '0820000005',
  authorised_trustee_name: 'Terry Trustee',
  authorised_trustee_identity_number: '8101015009087',
  authorised_trustee_email: 'terry@example.test',
  authorised_trustee_phone: '0820000005',
  authorised_trustee_capacity: 'Trustee',
  trust_deed_available: 'yes',
  letters_of_authority_available: 'yes',
  trust_resolution_available: 'yes',
  all_trustees_signing: 'no',
  trustees: [
    {
      full_name: 'Terry Trustee',
      id_number: '8101015009087',
      phone: '0820000005',
      email: 'terry@example.test',
      residential_address: '2 Trustee Street',
      role_title: 'Trustee',
      signing_authority: true,
    },
  ],
})

assert.equal(trustFormData.purchaser_type, 'trust')
assert.equal(trustFormData.trust.name, 'Buyer Family Trust')
assert.equal(trustFormData.trust.trustees.length, 1)
assert.equal(trustFormData.trust.trustees[0].signing_authority, 'yes')
assert.equal(trustFormData.authorised_trustee_name, 'Terry Trustee')

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
