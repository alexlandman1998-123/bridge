import assert from 'node:assert/strict'

import {
  buildCanonicalSellerOnboardingPayload,
  validateSellerOnboardingFacts,
} from '../sellerOnboardingFactTransformer.js'

function buildBaseForm(overrides = {}) {
  return {
    sellerFirstName: 'Alex',
    sellerSurname: 'Seller',
    email: 'alex@example.com',
    phone: '0821234567',
    idNumber: '8001015009087',
    ownershipType: 'individual',
    ownerEntityType: 'natural_person',
    ownerStructureType: 'individual',
    maritalStatus: 'not_married',
    propertyCategory: 'residential',
    propertyType: 'house',
    propertyStructureType: 'full_title',
    propertyAddressLine1: '12 Market Street',
    suburb: 'Claremont',
    city: 'Cape Town',
    province: 'Western Cape',
    ratesTaxes: '1200',
    ...overrides,
  }
}

function getRequiredCodes(form) {
  const payload = buildCanonicalSellerOnboardingPayload(form, {}, { draft: false })
  const validation = validateSellerOnboardingFacts(payload.canonicalSellerFacts, { draft: false })
  return validation.required.map((item) => item.code)
}

const snakeCaseAddressPayload = buildCanonicalSellerOnboardingPayload(
  buildBaseForm({ residential_address: '34 Oak Avenue, Rondebosch' }),
)
assert.equal(snakeCaseAddressPayload.canonicalSellerFacts.seller.residential_address, '34 Oak Avenue, Rondebosch')
assert.equal(getRequiredCodes(buildBaseForm({ residential_address: '34 Oak Avenue, Rondebosch' })).includes('seller_residential_address_missing'), false)

const structuredAddressPayload = buildCanonicalSellerOnboardingPayload(
  buildBaseForm({
    residentialAddress: '',
    sellerResidentialAddressDetails: {
      line1: '9 Loop Street',
      suburb: 'Gardens',
      city: 'Cape Town',
      province: 'Western Cape',
      postalCode: '8001',
    },
  }),
)
assert.equal(structuredAddressPayload.canonicalSellerFacts.seller.residential_address, '9 Loop Street, Gardens, Cape Town, Western Cape, 8001')
assert.equal(getRequiredCodes(buildBaseForm({
  residentialAddress: '',
  sellerResidentialAddressDetails: {
    line1: '9 Loop Street',
    suburb: 'Gardens',
    city: 'Cape Town',
    province: 'Western Cape',
    postalCode: '8001',
  },
})).includes('seller_residential_address_missing'), false)

console.log('sellerOnboardingFactTransformer tests passed')
