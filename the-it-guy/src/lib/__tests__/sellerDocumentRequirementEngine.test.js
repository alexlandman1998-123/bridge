import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getRequiredSellerDocuments,
  getRequiredSellerStructuredFacts,
  syncSellerDocumentRequirements,
} from '../sellerDocumentRequirementEngine.js'

test('replaces company requirements with trust requirements when the submitted seller structure changes', () => {
  const companyListing = {
    id: 'listing-1',
    listingStatus: 'onboarding_completed',
    sellerOnboarding: { formData: { ownershipType: 'company', companyName: 'SellerCo Pty Ltd' } },
  }
  const companyRows = syncSellerDocumentRequirements(companyListing, []).upsertRows
  assert.equal(companyRows.some((row) => row.requirement_key === 'company_resolution_to_sell'), true)
  const existingRows = companyRows.map((row) => row.requirement_key === 'rates_account'
    ? { ...row, id: 'rates-account-1', status: 'uploaded' }
    : row.requirement_key === 'company_resolution_to_sell'
      ? { ...row, id: 'company-resolution-1', status: 'approved' }
      : row)

  const trustListing = {
    ...companyListing,
    sellerOnboarding: { formData: { ownershipType: 'trust', trustName: 'Seller Family Trust' } },
  }
  const synced = syncSellerDocumentRequirements(trustListing, existingRows)

  assert.equal(synced.upsertRows.some((row) => row.requirement_key === 'trust_resolution_to_sell'), true)
  assert.equal(synced.upsertRows.find((row) => row.requirement_key === 'rates_account')?.status, 'uploaded')
  assert.equal(synced.upsertRows.find((row) => row.requirement_key === 'rates_account')?.id, 'rates-account-1')
  const retiredCompanyResolution = synced.markNotApplicableRows.find((row) => row.requirement_key === 'company_resolution_to_sell')
  assert.equal(retiredCompanyResolution?.status, 'not_applicable')
  assert.equal(retiredCompanyResolution?.id, 'company-resolution-1')
  assert.equal(retiredCompanyResolution?.generated_from?.retirement_reason, 'seller_requirement_model_changed')
})

test('keeps data-capture requirements out of the upload checklist and exposes their capture surface', () => {
  const listing = {
    id: 'listing-structured-facts',
    listingStatus: 'onboarding_completed',
    sellerOnboarding: {
      formData: {
        ownershipType: 'individual',
        propertyType: 'sectional_title',
        hasExistingBond: true,
        occupancyStatus: 'tenant_occupied',
      },
    },
  }
  const profile = {
    ...syncSellerDocumentRequirements(listing, []).requirementProfile,
    bondStatus: 'bonded',
    occupancyStatus: 'tenant_occupied',
    propertyBranch: 'sectional_title',
    propertyStructureType: 'sectional_title',
  }
  const documents = getRequiredSellerDocuments(profile)
  const structuredFacts = getRequiredSellerStructuredFacts(profile)

  assert.equal(documents.some((row) => row.requirement_key === 'body_corporate_details'), false)
  assert.equal(documents.some((row) => row.requirement_key === 'bond_bank_details'), false)
  assert.equal(documents.some((row) => row.requirement_key === 'tenant_details'), false)
  assert.equal(structuredFacts.find((row) => row.requirement_key === 'body_corporate_details')?.capture_surface, 'sectional_title_details')
  assert.equal(structuredFacts.find((row) => row.requirement_key === 'body_corporate_details')?.is_required, false)
  assert.equal(structuredFacts.find((row) => row.requirement_key === 'bond_bank_details')?.capture_surface, 'bond_details')
  assert.equal(structuredFacts.find((row) => row.requirement_key === 'tenant_details')?.capture_surface, 'tenancy_details')

  const legacySync = syncSellerDocumentRequirements(listing, [{
    id: 'legacy-body-corporate-details',
    requirement_key: 'body_corporate_details',
    requirement_name: 'Body Corporate Details',
    status: 'required',
  }])
  assert.equal(legacySync.markNotApplicableRows.find((row) => row.requirement_key === 'body_corporate_details')?.status, 'not_applicable')
})
