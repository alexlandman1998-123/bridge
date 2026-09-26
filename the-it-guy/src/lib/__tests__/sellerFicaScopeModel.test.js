import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSellerFicaScope } from '../sellerFicaScopeModel.js'

const person = (name, idNumber) => ({ fullName: name, idNumber, residentialAddress: '1 Main Road', nationality: 'South African' })

test('an unconfirmed seller route never defaults to an individual verification subject', () => {
  const scope = buildSellerFicaScope({ sellerSubject: { kind: 'unknown' } })
  assert.equal(scope.kind, 'unknown')
  assert.equal(scope.collectionComplete, false)
  assert.equal(scope.providerReady, false)
  assert.ok(scope.missing.includes('Confirmed seller ownership route'))
})

test('joint owners are counted separately and missing facts are attributed to the right owner', () => {
  const scope = buildSellerFicaScope({
    sellerSubject: { kind: 'multiple_owners' },
    onboarding: { multipleOwners: [person('Alex Owner', '8001015009087'), { fullName: 'Sam Owner' }] },
  })
  assert.equal(scope.subjects.length, 2)
  assert.equal(scope.subjects[0].complete, true)
  assert.equal(scope.subjects[1].complete, false)
  assert.ok(scope.missing.includes('Sam Owner: ID or passport number'))
  assert.equal(scope.providerReady, false)
})

test('company scope includes entity, directors, beneficial owners and authorised representative', () => {
  const scope = buildSellerFicaScope({
    sellerSubject: { kind: 'company', legalOwner: { name: 'Acme', registrationNumber: '2020/123456/07', address: '2 Market Road' } },
    onboarding: {
      companyDirectors: [person('Director One', '8001015009087')],
      companyBeneficialOwners: [person('Owner One', '8001015009088')],
      authorisedSignatoryName: 'Director One',
      authorisedSignatoryIdNumber: '8001015009087',
      companyAuthorityBasis: 'Resolution',
    },
  })
  assert.equal(scope.subjects.filter((entry) => entry.type === 'entity').length, 1)
  assert.equal(scope.subjects.filter((entry) => entry.type === 'person').length, 2)
  assert.deepEqual(scope.subjects[1].roles, ['Director / member', 'Authorised representative'])
  assert.equal(scope.missing.some((entry) => entry.includes('Beneficial ownership / control declaration')), false)
})

test('same-name people with distinct IDs are never merged', () => {
  const scope = buildSellerFicaScope({
    sellerSubject: { kind: 'multiple_owners' },
    onboarding: { multipleOwners: [person('Same Name', '8001015009087'), person('Same Name', '8001015009088')] },
  })
  assert.equal(scope.subjects.length, 2)
})

test('trust scope exposes missing founder and beneficiary coverage rather than assuming trustees are enough', () => {
  const scope = buildSellerFicaScope({
    sellerSubject: { kind: 'trust', legalOwner: { name: 'Family Trust', registrationNumber: 'IT123/2020', address: '3 Trust Lane' } },
    onboarding: { trustees: [person('Trustee One', '8001015009087')], authorisedTrusteeName: 'Trustee One', authorisedTrusteeIdNumber: '8001015009087', trustAuthorityBasis: 'Letters of Authority' },
  })
  assert.ok(scope.missing.includes('Trust founder(s) / founder structure'))
  assert.ok(scope.missing.includes('Named beneficiaries or beneficiary class declaration'))
  assert.equal(scope.subjects.filter((entry) => entry.type === 'person').length, 1)
  assert.equal(scope.collectionComplete, false)
})

test('foreign sellers require an explicit jurisdiction and review', () => {
  const scope = buildSellerFicaScope({ sellerSubject: { kind: 'foreign_individual', legalOwner: { name: 'Foreign Seller', registrationNumber: 'P123', address: '1 Abroad Road' } } })
  assert.ok(scope.missing.includes('Foreign jurisdiction'))
  assert.ok(scope.review.some((entry) => entry.includes('foreign-document')))
})

test('a sale-property address never substitutes for an individual seller residence', () => {
  const scope = buildSellerFicaScope({
    sellerSubject: { kind: 'individual', legalOwner: { name: 'Seller', registrationNumber: '8001015009087', address: 'Sale property address' } },
    onboarding: { nationality: 'South African', propertyAddress: 'Sale property address' },
  })
  assert.ok(scope.missing.includes('Seller: residential address'))
})
