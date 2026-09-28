import test from 'node:test'
import assert from 'node:assert/strict'

import { getSellerFicaOnboardingMissing } from '../sellerFicaOnboardingFields.js'
import { buildCanonicalSellerOnboardingPayload } from '../../services/documents/sellerOnboardingFactTransformer.js'

const person = { name: 'Ana', surname: 'Nkosi', idNumber: '8001015009087', nationality: 'South African', residentialAddress: '1 Main Road' }
const risk = { occupation: 'Business owner', sourceOfFunds: 'Business income', politicallyExposedPerson: 'no' }

test('FICA questions are conditional and require a reason when politically exposed', () => {
  assert.deepEqual(getSellerFicaOnboardingMissing({ ...risk, ownerStructureType: 'individual' }), [])
  assert.deepEqual(getSellerFicaOnboardingMissing({ ...risk, ownerStructureType: 'individual', politicallyExposedPerson: 'yes' }), ['Political exposure details'])
  assert.ok(getSellerFicaOnboardingMissing({ ownerStructureType: 'individual' }).includes('Source of funds / wealth'))
})

test('company and trust ownership details use the same canonical seller facts', () => {
  const company = { ...risk, ownerStructureType: 'company', companyBeneficialOwners: [{ ...person, ownershipShare: '30%' }] }
  assert.deepEqual(getSellerFicaOnboardingMissing(company), [])
  const companyFacts = buildCanonicalSellerOnboardingPayload(company).canonicalSellerFacts
  assert.equal(companyFacts.seller.company.beneficial_owners[0].nationality, 'South African')
  assert.equal(companyFacts.seller.source_of_funds, 'Business income')

  const trust = { ...risk, ownerStructureType: 'trust', trustFounders: [person], trustBeneficiaryClass: 'Descendants' }
  assert.deepEqual(getSellerFicaOnboardingMissing(trust), [])
  const trustFacts = buildCanonicalSellerOnboardingPayload(trust).canonicalSellerFacts
  assert.equal(trustFacts.seller.trust.founders[0].id_number, person.idNumber)
  assert.equal(trustFacts.seller.trust.beneficiary_class, 'Descendants')
})

test('a director who signs reuses their captured identity', () => {
  const facts = buildCanonicalSellerOnboardingPayload({
    ...risk,
    ownerStructureType: 'company',
    companyDirectors: [person],
    authorisedSignatoryName: 'Ana Nkosi',
  }).canonicalSellerFacts
  assert.equal(facts.seller.company.authorised_signatory.id_number, person.idNumber)
  assert.equal(facts.seller.company.authorised_signatory.nationality, person.nationality)
  assert.equal(facts.seller.company.authorised_signatory.residential_address, person.residentialAddress)
})
