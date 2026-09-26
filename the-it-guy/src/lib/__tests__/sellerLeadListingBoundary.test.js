import assert from 'node:assert/strict'
import test from 'node:test'
import { isUnconvertedSellerLeadIntake, isUnpublishedDraftListing } from '../sellerLeadListingBoundary.js'
import { normalizeListingSource } from '../propertyTaxonomy.js'

test('seller lead intake stays out of Listings until the mandate is signed', () => {
  assert.equal(normalizeListingSource('seller_lead_intake'), 'seller_lead_intake')
  const intake = {
    listingSource: 'seller_lead_intake',
    listingStatus: 'onboarding_sent',
    mandateStatus: 'not_started',
    listingVisibility: 'internal',
    isActive: false,
  }
  assert.equal(isUnconvertedSellerLeadIntake(intake), true)
  assert.equal(isUnconvertedSellerLeadIntake({ ...intake, mandateStatus: 'signed_uploaded' }), false)
  assert.equal(isUnconvertedSellerLeadIntake({ ...intake, listingStatus: 'mandate_signed' }), false)
  assert.equal(isUnconvertedSellerLeadIntake({ ...intake, listingSource: 'private_listing' }), false)
})

test('signed internal listings are labelled as drafts until activated', () => {
  const draft = { listingStatus: 'mandate_signed', listingVisibility: 'internal', isActive: false }
  assert.equal(isUnpublishedDraftListing(draft), true)
  assert.equal(isUnpublishedDraftListing({ ...draft, listingStatus: 'active' }), false)
  assert.equal(isUnpublishedDraftListing({ ...draft, isActive: true }), false)
  assert.equal(isUnpublishedDraftListing({ ...draft, listingVisibility: 'public' }), false)
})
