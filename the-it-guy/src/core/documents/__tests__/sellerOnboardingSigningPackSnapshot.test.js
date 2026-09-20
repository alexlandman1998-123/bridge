import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerOnboardingSigningPackSnapshot, SELLER_ONBOARDING_SIGNING_PACK_SNAPSHOT_CONTRACT } from '../sellerOnboardingSigningPackSnapshot.js'

test('builds one complete frozen contract for a natural-person seller', () => {
  const pack = buildSellerOnboardingSigningPackSnapshot({
    formData: {
      sellerFirstName: 'Avery', sellerSurname: 'Mokoena', idNumber: '9001015009087', dateOfBirth: '1990-01-01',
      nationality: 'South African', countryOfResidence: 'South Africa', email: 'avery@example.test', mobile: '0820000000',
      residentialAddress: '1 Example Road, Pretoria', incomeTaxNumber: '1234567890', sellerLegalType: 'individual',
      propertyDisclosure: { responses: { roof_leaks: { answer: 'no' } } },
    },
    listing: { propertyAddress: '10 Market Street, Pretoria' },
    recipients: [{ name: 'Avery Mokoena', email: 'avery@example.test', role: 'Seller' }],
    branding: { organisationName: 'Kingdom Real Estate', logoLightUrl: 'https://example.test/kingdom-light.png' },
    mandate: { mandateType: 'sole', commissionBasis: 'percentage', commissionPercentage: '5', vatHandling: 'VAT inclusive' },
    generatedAt: '2026-09-19T12:00:00.000Z',
  })

  assert.equal(pack.contract, SELLER_ONBOARDING_SIGNING_PACK_SNAPSHOT_CONTRACT)
  assert.equal(pack.frozenAt, '2026-09-19T12:00:00.000Z')
  assert.deepEqual(pack.seller.parties[0], {
    firstName: 'Avery', surname: 'Mokoena', name: 'Avery Mokoena', role: 'Seller', idNumber: '9001015009087',
    dateOfBirth: '1990-01-01', nationality: 'South African', countryOfResidence: 'South Africa', incomeTaxNumber: '1234567890',
    residentialAddress: '1 Example Road, Pretoria', email: 'avery@example.test', phone: '0820000000', occupation: '', sourceOfFunds: '', authorityBasis: '',
  })
  assert.equal(pack.property.address, '10 Market Street, Pretoria')
  assert.equal(pack.branding.organisationName, 'Kingdom Real Estate')
  assert.equal(pack.mandate.branding.logoLightUrl, 'https://example.test/kingdom-light.png')
})

test('projects relevant directors and trustees instead of a generic seller party', () => {
  const company = buildSellerOnboardingSigningPackSnapshot({
    formData: {
      sellerLegalType: 'company', companyName: 'Example Holdings', companyRegistrationNumber: '2020/123456/07',
      companyDirectors: [{ firstName: 'Nandi', lastName: 'Dlamini', idNumber: '8001015009087', email: 'nandi@example.test' }],
    },
  })
  const trust = buildSellerOnboardingSigningPackSnapshot({
    formData: {
      sellerLegalType: 'trust', trustName: 'Example Family Trust', trustRegistrationNumber: 'IT123/2020',
      trustees: [{ firstName: 'Musa', surname: 'Khumalo', idNumber: '8101015009087', authorityDetails: 'Trust resolution' }],
    },
  })

  assert.equal(company.seller.parties[0].role, 'Director')
  assert.equal(company.seller.parties[0].name, 'Nandi Dlamini')
  assert.equal(trust.seller.parties[0].role, 'Trustee')
  assert.equal(trust.seller.parties[0].authorityBasis, 'Trust resolution')
})

test('uses the canonical onboarding facts mapping for legacy and authority fields', () => {
  const pack = buildSellerOnboardingSigningPackSnapshot({
    formData: {
      sellerFirstName: 'Lebo', sellerSurname: 'Naidoo', idNumber: '8501015009087', dateOfBirth: '1985-01-01',
      sellerTaxNumber: '9988776655', phone: '0830000000', ownerStructureType: 'company',
      companyName: 'Lebo Properties', companyRegistrationNumber: '2018/100100/07', companyAuthorityBasis: 'Board resolution',
      companyDirectors: [{ full_name: 'Lebo Naidoo', id_number: '8501015009087', email: 'lebo@example.test', authority_details: 'Board resolution' }],
      companyBeneficialOwners: [{ full_name: 'Sam Naidoo', id_number: '8701015009087', email: 'sam@example.test' }],
      propertyAddressLine1: '22 Canonical Street', city: 'Johannesburg', province: 'Gauteng', postalCode: '2000',
    },
  })

  assert.equal(pack.seller.incomeTaxNumber, '9988776655')
  assert.equal(pack.seller.phone, '0830000000')
  assert.equal(pack.seller.companyName, 'Lebo Properties')
  assert.equal(pack.seller.parties.length, 2)
  assert.equal(pack.seller.parties[0].role, 'Director')
  assert.equal(pack.seller.parties[0].authorityBasis, 'Board resolution')
  assert.equal(pack.seller.parties[1].role, 'Beneficial Owner')
  assert.match(pack.property.address, /22 Canonical Street/)
})
