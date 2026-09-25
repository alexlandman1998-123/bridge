import assert from 'node:assert/strict'
import test from 'node:test'

import { buildListingSellerInformationModel } from '../listingSellerInformationModel.js'

function rowLabels(model) {
  return model.groups.flatMap((group) => group.rows.map((row) => row.label))
}

test('company sellers show company, contact, authority and relevant property groups', () => {
  const model = buildListingSellerInformationModel({
    sellerOnboarding: {
      formData: {
        sellerProfileCaptureSource: 'listing_seller_profile_capture',
        sellerOwnershipConfirmed: true,
        ownerStructureType: 'company',
        companyName: 'Arch Holdings',
        companyRegistrationNumber: '2020/123456/07',
        companyRegisteredAddress: '1 Company Road',
        companyDirectors: [{ name: 'Dina', surname: 'Director', email: 'dina@example.com' }],
        authorisedSignatoryName: 'Dina Director',
        authorisedSignatoryCapacity: 'Director',
        email: 'contact@example.com',
        propertyAddress: '10 Example Street',
        bondStatus: 'no_bond',
      },
    },
  })

  assert.equal(model.profileType, 'company')
  assert.deepEqual(model.groups.map((group) => group.title), [
    'Company details',
    'Directors',
    'Signing authority',
    'Primary contact details',
    'Property and ownership details',
  ])
  assert.ok(rowLabels(model).includes('Registration number'))
  assert.ok(!rowLabels(model).includes('Outstanding bond'))
  assert.ok(!rowLabels(model).includes('Marital status'))
})

test('individual sellers do not show entity or spouse fields unless relevant', () => {
  const model = buildListingSellerInformationModel({
    sellerOnboarding: {
      formData: {
        sellerProfileCaptureSource: 'listing_seller_profile_capture',
        sellerOwnershipConfirmed: true,
        ownerStructureType: 'individual',
        sellerFirstName: 'Indi',
        sellerSurname: 'Owner',
        idNumber: '9001010000000',
        propertyAddress: '20 Example Street',
      },
    },
  })

  assert.equal(model.profileType, 'individual')
  assert.ok(model.groups.some((group) => group.title === 'Individual details'))
  assert.ok(!model.groups.some((group) => group.title === 'Spouse details'))
  assert.ok(!model.groups.some((group) => group.title === 'Company details'))
})

test('trust sellers show trustees and beneficial owners without individual defaults', () => {
  const model = buildListingSellerInformationModel({
    sellerOnboarding: {
      formData: {
        sellerProfileCaptureSource: 'listing_seller_profile_capture',
        sellerOwnershipConfirmed: true,
        ownerStructureType: 'trust',
        trustName: 'Example Family Trust',
        trustRegistrationNumber: 'IT123/2020',
        trustees: [{ name: 'Terry', surname: 'Trustee' }],
        trustBeneficiaries: [{ name: 'Ben', surname: 'Beneficiary' }],
        authorisedTrusteeName: 'Terry Trustee',
        propertyAddress: '30 Example Street',
        bondStatus: 'bonded',
        bondHolder: 'Example Bank',
        outstandingBond: '1000000',
      },
    },
  })

  assert.deepEqual(model.groups.slice(0, 4).map((group) => group.title), [
    'Trust details',
    'Trustees',
    'Beneficial owners',
    'Signing authority',
  ])
  assert.ok(rowLabels(model).includes('Bond holder'))
  assert.ok(rowLabels(model).includes('Outstanding bond'))
  assert.ok(!rowLabels(model).includes('Marital status'))
})
