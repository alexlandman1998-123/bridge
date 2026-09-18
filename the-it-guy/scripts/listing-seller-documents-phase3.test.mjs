import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildListingSellerDocumentReadiness } from '../src/lib/listingSellerProfileBuilderModel.js'

const commission = { basis: 'percentage', percentage: '5', vatHandling: 'exclusive' }
const listing = (formData = {}) => ({
  sellerCanonicalFacts: { source: 'direct_listing_intake' },
  sellerOnboarding: { formData },
})

{
  const result = buildListingSellerDocumentReadiness(listing({
    sellerProfileCaptureSource: 'listing_seller_profile_capture', sellerType: 'individual', ownerStructureType: 'individual',
    sellerName: 'Ava Seller', email: 'ava@example.test', propertyAddress: '10 Example Road', mandateType: 'sole', askingPrice: '2500000', mandateStartDate: '2026-09-18', expiryDate: '2026-12-18',
  }), commission)
  assert.equal(result.byKey.mandate.ready, true)
  assert.equal(result.byKey.disclosure.ready, false)
  assert.equal(result.byKey.fica.ready, false)
  assert.ok(result.byKey.fica.missing.includes('Add the seller ID or passport number.'))
}

{
  const result = buildListingSellerDocumentReadiness(listing({
    sellerProfileCaptureSource: 'listing_seller_profile_capture', sellerType: 'multiple_owners', ownerStructureType: 'multiple_owners',
    multipleOwners: [
      { fullName: 'Ava Seller', email: 'ava@example.test', idNumber: '8001010000001', residentialAddress: '1 Main Road' },
      { fullName: 'Ben Seller', email: 'ben@example.test', idNumber: '8101010000001', residentialAddress: '' },
    ],
    propertyAddress: '10 Example Road', mandateType: 'sole', askingPrice: '2500000', mandateStartDate: '2026-09-18', expiryDate: '2026-12-18',
  }), commission)
  assert.equal(result.byKey.mandate.ready, true)
  assert.equal(result.byKey.fica.ready, false)
  assert.ok(result.byKey.fica.missing.includes("Add owner 2's residential address."))
}

{
  const result = buildListingSellerDocumentReadiness(listing({
    sellerProfileCaptureSource: 'listing_seller_profile_capture', sellerType: 'company', ownerStructureType: 'company', companyName: 'Acme Holdings', companyRegistrationNumber: '2020/123456/07', companyRegisteredAddress: '1 Company Road',
    authorisedSignatoryName: 'Casey Director', authorisedSignatoryCapacity: 'Director', authorisedSignatoryEmail: 'casey@example.test',
    propertyAddress: '10 Example Road', mandateType: 'sole', askingPrice: '2500000', mandateStartDate: '2026-09-18', expiryDate: '2026-12-18',
  }), commission)
  assert.equal(result.byKey.fica.ready, true)
}

const [model, detail] = await Promise.all([
  readFile(new URL('../src/lib/listingSellerProfileBuilderModel.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
])
assert.match(model, /buildListingSellerDocumentReadiness/)
assert.match(detail, /getSellerSigningDocumentOptions\(\)\.documents/)
assert.match(detail, /disabled=\{!document\.ready\}/)
assert.match(detail, /Residential address/)

console.log('listing seller documents phase 3 checks passed.')
