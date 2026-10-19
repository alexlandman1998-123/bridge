import test from 'node:test'
import assert from 'node:assert/strict'

import { getSellerFicaOnboardingMissing } from '../sellerFicaOnboardingFields.js'
import { buildCanonicalSellerOnboardingPayload } from '../../services/documents/sellerOnboardingFactTransformer.js'

const person = { name: 'Ana', surname: 'Nkosi', idNumber: '8001015009087', nationality: 'South African', residentialAddress: '1 Main Road' }
const risk = { occupation: 'Business owner', sourceOfFunds: 'Business income', politicallyExposedPerson: 'no' }

test('saved database field names reach FICA validation and generation without recapture', () => {
  const owner = { first_name: 'Ana', last_name: 'Nkosi', id_number: person.idNumber, nationality: person.nationality, residential_address: person.residentialAddress, ownership_share: '30' }
  const saved = { occupation: 'Business owner', source_of_funds: 'Business income', politically_exposed_person: false, owner_structure_type: 'company', company_name: 'Ana Holdings', company_registered_address: '1 Main Road', company_directors: [owner], company_beneficial_owners: [owner], authorised_signatory_name: 'Ana Nkosi', authorised_signatory_capacity: 'Director' }
  assert.deepEqual(getSellerFicaOnboardingMissing(saved), [])
  const facts = buildCanonicalSellerOnboardingPayload(saved).canonicalSellerFacts
  assert.equal(facts.seller.company.beneficial_owners[0].id_number, person.idNumber)
  assert.equal(facts.seller.company.beneficial_owners[0].ownership_share, 30)
  assert.equal(facts.seller.source_of_funds, 'Business income')
  assert.equal(facts.seller.politically_exposed_person, 'no')
  assert.equal(facts.seller.name, 'Ana Holdings')
  assert.equal(facts.seller.company.directors[0].id_number, person.idNumber)
  assert.equal(facts.seller.company.authorised_signatory.capacity, 'Director')
  assert.equal(Object.hasOwn(saved, 'companyName'), false, 'the saved input remains untouched')
  const cleared = buildCanonicalSellerOnboardingPayload({ ...saved, companyName: '', companyDirectors: [] }).canonicalSellerFacts
  assert.equal(cleared.seller.company.name, '')
  assert.deepEqual(cleared.seller.company.directors, [])
  assert.ok(getSellerFicaOnboardingMissing({ ...saved, company_beneficial_owners: [] }).includes('Beneficial owners / controllers: add at least one person'))

  const trust = { ...saved, owner_structure_type: 'trust', trust_name: 'Ana Trust', trust_trustees: [owner], authorised_trustee_capacity: 'Trustee', trust_founders: [owner], trust_beneficiary_class: 'Descendants' }
  assert.deepEqual(getSellerFicaOnboardingMissing(trust), [])
  const trustFacts = buildCanonicalSellerOnboardingPayload(trust).canonicalSellerFacts
  assert.equal(trustFacts.seller.trust.founders[0].id_number, person.idNumber)
  assert.equal(trustFacts.seller.trust.beneficiary_class, 'Descendants')
  assert.equal(trustFacts.seller.name, 'Ana Trust')
  assert.equal(trustFacts.seller.trust.trustees[0].id_number, person.idNumber)
  assert.equal(trustFacts.seller.trust.authorised_trustee.capacity, 'Trustee')
  assert.deepEqual(getSellerFicaOnboardingMissing({ ...trust, politically_exposed_person: true }), ['Political exposure details'])
  const foreignFacts = buildCanonicalSellerOnboardingPayload({ sa_resident: false, tax_resident: false }).canonicalSellerFacts
  assert.equal(foreignFacts.seller.sa_resident, 'no')
  assert.equal(foreignFacts.seller.tax_resident, 'no')
})

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


test('beneficial owner warnings identify only missing fields and the affected row', () => {
  const form = { ...risk, ownerStructureType: 'company', companyBeneficialOwners: [
    { ...person, ownershipShare: '100' },
    { ...person, surname: '', nationality: '', residentialAddress: '', ownershipShare: '' },
  ] }
  assert.deepEqual(getSellerFicaOnboardingMissing(form), [
    'Beneficial owners / controllers, person 2: add surname, nationality, residential address',
    'Beneficial owners / controllers, person 2: add an ownership share or explain how this person controls the company',
  ])
  assert.deepEqual(getSellerFicaOnboardingMissing({ ...form, companyBeneficialOwners: [] }), [
    'Beneficial owners / controllers: add at least one person',
  ])
})
