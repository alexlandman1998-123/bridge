import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerMandateDocumentModel } from '../sellerMandateWordingMarkup.js'
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
  assert.equal(company.seller.companyName, 'Example Holdings')
  assert.equal(company.seller.companyRegistrationNumber, '2020/123456/07')
  assert.equal(trust.seller.parties[0].role, 'Trustee')
  assert.equal(trust.seller.parties[0].authorityBasis, 'Trust resolution')
  assert.equal(trust.seller.trustName, 'Example Family Trust')
  assert.equal(trust.seller.trustRegistrationNumber, 'IT123/2020')
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

test('estate, principal and other entity identities do not become their contact person', () => {
  const scenarios = [
    { ownershipType: 'deceased_estate', deceasedEstateName: 'Estate Late Owner', estateReference: 'EST-123', executorName: 'Pat Executor', expectedName: 'Estate Late Owner', expectedId: 'EST-123' },
    { ownershipType: 'power_of_attorney', powerOfAttorneyPrincipalName: 'Alex Principal', powerOfAttorneyPrincipalIdNumber: 'OWNER-ID', powerOfAttorneyName: 'Pat Representative', expectedName: 'Alex Principal', expectedId: 'OWNER-ID' },
    { ownershipType: 'other', otherEntityName: 'Example Association', otherEntityRegistrationNumber: 'ASSOC-123', expectedName: 'Example Association', expectedId: 'ASSOC-123' },
  ]
  for (const scenario of scenarios) {
    const pack = buildSellerOnboardingSigningPackSnapshot({ formData: { sellerFirstName: 'Contact', sellerSurname: 'Person', idNumber: 'CONTACT-ID', ...scenario } })
    assert.equal(pack.seller.legalOwnerName, scenario.expectedName)
    assert.equal(pack.seller.legalOwnerIdentity, scenario.expectedId)
    const document = buildSellerMandateDocumentModel({ signingPack: { ...pack, mandate: { mandateType: 'sole' }, branding: { organisationName: 'Agency' }, signers: [{ name: 'Pat Representative', role: 'Representative' }] } })
    assert.equal(document.sellerName, scenario.expectedName)
    assert.equal(document.sellerIdentity, scenario.expectedId)
  }
  const missingEstate = buildSellerOnboardingSigningPackSnapshot({ formData: { ownershipType: 'deceased_estate', sellerFirstName: 'Pat', sellerSurname: 'Executor' } })
  assert.equal(missingEstate.seller.legalOwnerName, '')
})

test('multiple-owner mandate names owners once and does not identify the contact as an owner', () => {
  const pack = buildSellerOnboardingSigningPackSnapshot({
    formData: { ownershipType: 'multiple_owners', sellerFirstName: 'Administrative', sellerSurname: 'Contact',
      multipleOwners: [{ name: 'Alex', surname: 'Owner', idNumber: 'A1' }, { name: 'Sam', surname: 'Owner', idNumber: 'S2' }] },
    mandate: { mandateType: 'sole' }, branding: { organisationName: 'Agency' }, recipients: [{ name: 'Alex Owner', role: 'Seller' }, { name: 'Sam Owner', role: 'Seller' }],
  })
  const document = buildSellerMandateDocumentModel({ signingPack: pack })
  assert.equal(document.sellerName, 'Alex Owner')
  assert.equal(document.sellerIdentity, 'A1')
  assert.deepEqual(document.coOwners.map((owner) => owner.name), ['Sam Owner'])
})

test('an entity contact and stale owner arrays cannot become mandate co-owners', () => {
  const pack = buildSellerOnboardingSigningPackSnapshot({ formData: {
    ownerEntityType: 'company', ownerStructureType: 'company', ownershipType: 'company',
    companyName: 'Current Company', companyRegistrationNumber: 'CO-123',
    primaryContactName: 'Pat Contact', sellerFirstName: 'Pat', sellerSurname: 'Contact',
    multipleOwners: [{ name: 'Previous', surname: 'Owner', idNumber: 'OLD-ID' }],
  } })
  assert.equal(pack.seller.legalOwnerName, 'Current Company')
  assert.equal(pack.seller.parties.some(person => ['Owner', 'Seller'].includes(person.role)), false)
})
