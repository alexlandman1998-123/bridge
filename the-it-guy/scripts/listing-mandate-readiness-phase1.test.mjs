import assert from 'node:assert/strict'

import { buildListingMandateReadiness } from '../src/lib/listingSellerProfileBuilderModel.js'

function listing(formData = {}, fields = {}) {
  return {
    sellerCanonicalFacts: { source: 'direct_listing_intake' },
    sellerOnboarding: { formData },
    ...fields,
  }
}

const commission = { basis: 'percentage', percentage: '5', vatHandling: 'exclusive' }

{
  const readiness = buildListingMandateReadiness(listing({
    sellerProfileCaptureSource: 'listing_seller_profile_capture',
    sellerType: 'individual', ownerStructureType: 'individual', sellerName: 'Ava Seller', email: 'ava@example.test',
    propertyAddress: '10 Example Road', mandateType: 'sole', askingPrice: '2500000', mandateStartDate: '2026-09-18', expiryDate: '2026-12-18',
  }), commission)
  assert.equal(readiness.ready, true)
  assert.equal(readiness.missing.length, 0)
}

{
  const readiness = buildListingMandateReadiness(listing({
    sellerProfileCaptureSource: 'listing_seller_profile_capture',
    sellerType: 'company', ownerStructureType: 'company', companyName: 'Acme Holdings', companyRegistrationNumber: '2020/123456/07',
    authorisedSignatoryName: 'Ava Authorised', authorisedSignatoryCapacity: 'Director', authorisedSignatoryEmail: 'ava@example.test',
    propertyAddress: '10 Example Road', mandateType: 'sole', askingPrice: '2500000', mandateStartDate: '2026-09-18', expiryDate: '2026-12-18',
  }), commission)
  assert.equal(readiness.ready, true)
}

{
  const readiness = buildListingMandateReadiness(listing({
    sellerProfileCaptureSource: 'listing_seller_profile_capture', sellerType: 'multiple_owners', ownerStructureType: 'multiple_owners',
    multipleOwners: [{ fullName: 'Ava Seller', email: 'ava@example.test' }, { fullName: 'Ben Seller', email: '' }],
    propertyAddress: '10 Example Road', mandateType: 'sole', askingPrice: '2500000', mandateStartDate: '2026-09-18', expiryDate: '2026-12-18',
  }), commission)
  assert.equal(readiness.ready, false)
  assert.ok(readiness.missing.includes('Add a valid email for owner 2.'))
}

{
  const readiness = buildListingMandateReadiness(listing({
    sellerProfileCaptureSource: 'listing_seller_profile_capture', sellerType: 'individual', ownerStructureType: 'individual', sellerName: 'Ava Seller', email: 'ava@example.test',
    propertyAddress: '10 Example Road', mandateType: 'sole', askingPrice: '2500000', mandateStartDate: '2026-09-18', expiryDate: '2026-12-18',
  }), { ...commission, vatHandling: '' })
  assert.equal(readiness.ready, false)
  assert.ok(readiness.missing.includes('Choose the VAT treatment.'))
}

console.log('listing mandate readiness phase 1 checks passed.')
