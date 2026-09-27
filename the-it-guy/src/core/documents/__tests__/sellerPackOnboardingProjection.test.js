import assert from 'node:assert/strict'
import test from 'node:test'
import { projectSellerPackFromOnboarding } from '../sellerPackOnboardingProjection.js'

const project = (formData, options = {}) => projectSellerPackFromOnboarding({
  formData,
  onboardingSubmitted: true,
  lead: { sellerOnboardingSubmittedAt: '2026-09-27T08:00:00.000Z' },
  ...options,
})

test('submitted natural seller details populate the pack without inventing an uploaded FICA file', () => {
  const pack = project({
    sellerFirstName: 'Jane',
    sellerSurname: 'Doe',
    email: 'jane@example.com',
    idNumber: '8001011234080',
    maritalStatus: 'single',
  })

  assert.equal(pack.sellerType, 'natural')
  assert.equal(pack.maritalSetup, 'single')
  assert.equal(pack.owners[0].name, 'Jane Doe')
  assert.equal(pack.owners[0].idNumber, '8001011234080')
  assert.equal(pack.legalPath.natural.owners[0].email, 'jane@example.com')
  assert.equal(pack.sellerPackDetailsComplete, true)
  assert.equal(pack.sellerPackDetailsSource, 'seller_onboarding')
  assert.equal(pack.sellerPackDetailsCapturedAt, '2026-09-27T08:00:00.000Z')
  assert.deepEqual(pack.documents, {})
})

test('community of property retains spouse details and asks for a missing spouse ID', () => {
  const form = {
    sellerFirstName: 'Jane', sellerSurname: 'Doe', email: 'jane@example.com',
    maritalRegime: 'in_community', spouseName: 'John Doe',
  }
  const incomplete = project(form)
  assert.equal(incomplete.spouseName, 'John Doe')
  assert.equal(incomplete.sellerPackDetailsComplete, undefined)

  const complete = project({ ...form, spouseIdNumber: '7901011234081' })
  assert.equal(complete.sellerPackDetailsComplete, true)
  assert.equal(complete.legalPath.spouse.idNumber, '7901011234081')
})

test('submitted company and trust facts map their actual roleplayers', () => {
  const company = project({
    ownerEntityType: 'company', companyName: 'Example Holdings',
    companyRegistrationNumber: '2020/123456/07',
    companyDirectors: [{ firstName: 'Ada', surname: 'Mokoena', email: 'ada@example.com' }],
  })
  assert.equal(company.sellerType, 'juristic')
  assert.equal(company.juristicEntityType, 'company')
  assert.equal(company.companyDirectors[0].name, 'Ada Mokoena')
  assert.equal(company.sellerPackDetailsComplete, true)

  const trust = project({
    ownerEntityType: 'trust', trustName: 'Family Trust',
    trustees: [{ name: 'Tumi Ndlovu', email: 'tumi@example.com' }],
  })
  assert.equal(trust.juristicEntityType, 'trust')
  assert.equal(trust.trustees[0].name, 'Tumi Ndlovu')
  assert.equal(trust.sellerPackDetailsComplete, true)
})

test('explicit registered owners take precedence over the seller contact', () => {
  const pack = project({
    ownerStructureType: 'multiple_owners',
    maritalStatus: 'single',
    sellerFirstName: 'Contact', sellerSurname: 'Person', email: 'contact@example.com',
    multipleOwners: [
      { firstName: 'Ada', surname: 'Mokoena', email: 'ada@example.com' },
      { firstName: 'Tumi', surname: 'Ndlovu', email: 'tumi@example.com' },
    ],
  })
  assert.deepEqual(pack.owners.map((owner) => owner.name), ['Ada Mokoena', 'Tumi Ndlovu'])
  assert.equal(pack.sellerPackDetailsComplete, true)
})

test('missing or invalid onboarding fields leave seller-pack capture open', () => {
  const missingMarital = project({ sellerFirstName: 'Jane', sellerSurname: 'Doe', email: 'jane@example.com' })
  assert.equal(missingMarital.maritalSetup, 'unknown')
  assert.equal(missingMarital.sellerPackDetailsComplete, undefined)

  const invalidEmail = project({ sellerFirstName: 'Jane', sellerSurname: 'Doe', email: 'invalid', maritalStatus: 'single' })
  assert.equal(invalidEmail.sellerPackDetailsComplete, undefined)

  const missingDirector = project({ ownerEntityType: 'company', companyName: 'Example Holdings' })
  assert.equal(missingDirector.sellerPackDetailsComplete, undefined)

  const estate = project({ ownerStructureType: 'deceased_estate', sellerFirstName: 'Jane', sellerSurname: 'Doe', email: 'jane@example.com', maritalStatus: 'single' })
  assert.equal(estate.sellerPackDetailsComplete, undefined)
})

test('unsubmitted onboarding and a previously captured pack remain authoritative', () => {
  const formData = { sellerFirstName: 'Jane', sellerSurname: 'Doe', email: 'jane@example.com', maritalStatus: 'single' }
  const saved = { sellerType: 'natural', sellerPackDetailsCapturedAt: '2026-09-26T10:00:00.000Z', owners: [{ name: 'Corrected Owner' }], documents: { signed_mandate: { storagePath: 'saved/mandate.pdf' } } }
  assert.deepEqual(projectSellerPackFromOnboarding({ formData, existingPack: saved, onboardingSubmitted: false }), saved)
  assert.deepEqual(project(formData, { existingPack: saved }), saved)
})

test('partial saved pack corrections and uploaded files survive the onboarding projection', () => {
  const saved = {
    sellerType: 'natural',
    owners: [{ firstName: 'Corrected', surname: 'Owner', name: 'Corrected Owner', email: 'corrected@example.com' }],
    documents: { signed_mandate: { storagePath: 'saved/mandate.pdf' } },
  }
  const pack = project({
    sellerFirstName: 'Jane', sellerSurname: 'Doe', email: 'jane@example.com', maritalStatus: 'single',
  }, { existingPack: saved })
  assert.equal(pack.owners[0].name, 'Corrected Owner')
  assert.equal(pack.sellerPackDetailsComplete, true)
  assert.equal(pack.documents.signed_mandate.storagePath, 'saved/mandate.pdf')
})
