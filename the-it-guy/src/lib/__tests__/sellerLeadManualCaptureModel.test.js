import assert from 'node:assert/strict'
import test from 'node:test'

import { LISTING_SELLER_PROFILE_CAPTURE_SOURCE } from '../listingSellerProfileBuilderModel.js'
import { buildSellerLeadManualCapturePayload } from '../sellerLeadManualCaptureModel.js'

test('seller-lead manual capture produces the same canonical source marker as listings', () => {
  const result = buildSellerLeadManualCapturePayload({
    form: {
      sellerOwnershipRoute: 'company',
      ownerEntityType: 'company',
      ownerStructureType: 'company',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      propertyAddress: '1 Main Road',
      companyName: 'Kingdom Holdings (Pty) Ltd',
      companyRegistrationNumber: '2020/123456/07',
      authorisedSignatoryName: 'John Doe',
      authorisedSignatoryCapacity: 'Director',
      authorisedSignatoryEmail: 'john@example.com',
    },
    listing: { id: 'listing-1' },
  })

  assert.equal(result.formPatch.sellerProfileCaptureSource, LISTING_SELLER_PROFILE_CAPTURE_SOURCE)
  assert.equal(result.formPatch.ownerStructureType, 'company')
  assert.equal(result.canonicalSellerFacts.seller.owner_structure_type, 'company')
  assert.equal(result.canonicalSellerFacts.seller.company.name, 'Kingdom Holdings (Pty) Ltd')
})

test('seller-lead manual capture keeps a power-of-attorney route instead of collapsing it to individual', () => {
  const result = buildSellerLeadManualCapturePayload({
    form: {
      sellerOwnershipRoute: 'power_of_attorney',
      powerOfAttorneyPrincipalName: 'Alex Landman',
      powerOfAttorneyPrincipalIdNumber: '8001015009087',
      powerOfAttorneyName: 'Pat Representative',
      powerOfAttorneyEmail: 'pat@example.com',
      propertyAddress: '1 Main Road',
    },
  })

  assert.equal(result.formPatch.ownerStructureType, 'power_of_attorney')
  assert.equal(result.formPatch.powerOfAttorneyPrincipalName, 'Alex Landman')
  assert.equal(result.canonicalSellerFacts.seller.owner_structure_type, 'power_of_attorney')
})
