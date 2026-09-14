import assert from 'node:assert/strict'
import test from 'node:test'

import { syncSellerDocumentRequirements } from '../sellerDocumentRequirementEngine.js'

test('replaces company requirements with trust requirements when the submitted seller structure changes', () => {
  const companyListing = {
    id: 'listing-1',
    listingStatus: 'onboarding_completed',
    sellerOnboarding: { formData: { ownershipType: 'company', companyName: 'SellerCo Pty Ltd' } },
  }
  const companyRows = syncSellerDocumentRequirements(companyListing, []).upsertRows
  assert.equal(companyRows.some((row) => row.requirement_key === 'company_resolution_to_sell'), true)

  const trustListing = {
    ...companyListing,
    sellerOnboarding: { formData: { ownershipType: 'trust', trustName: 'Seller Family Trust' } },
  }
  const synced = syncSellerDocumentRequirements(trustListing, companyRows)

  assert.equal(synced.upsertRows.some((row) => row.requirement_key === 'trust_resolution_to_sell'), true)
  assert.equal(synced.markNotApplicableRows.some((row) => row.requirement_key === 'company_resolution_to_sell'), true)
})
