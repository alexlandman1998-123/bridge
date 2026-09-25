import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildListingSellerSetupState,
  LISTING_SELLER_SETUP_STATUS,
} from '../listingSellerSetupState.js'
import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../../../lib/sellerDocumentRequirementEngine.js'

test('direct listings with contact-only seller data remain safely unconfigured', () => {
  const listing = {
    sellerType: 'individual',
    sellerCanonicalFacts: { source: 'direct_listing_intake' },
    sellerOnboarding: {
      formData: {
        sellerFirstName: 'Alex',
        sellerSurname: 'Seller',
        sellerEmail: 'alex@example.com',
      },
    },
  }

  const setup = buildListingSellerSetupState(listing)
  assert.equal(setup.status, LISTING_SELLER_SETUP_STATUS.setupRequired)
  assert.equal(setup.configured, false)
  assert.equal(setup.source.key, 'direct')
  assert.equal(setup.contact.name, 'Alex Seller')
  assert.equal(setup.actions.canPrepareMandate, false)
  assert.equal(getRequiredSellerDocuments(buildSellerRequirementProfile(listing)).length, 0)
})

test('Property24 imports without owner authority are sent to explicit review', () => {
  const listing = {
    sellerType: 'individual',
    sellerCanonicalFacts: {
      source: 'property24_migration_import',
      property24Import: true,
      fullName: 'Imported Contact',
    },
  }

  const setup = buildListingSellerSetupState(listing)
  assert.equal(setup.status, LISTING_SELLER_SETUP_STATUS.reviewRequired)
  assert.equal(setup.requiresReview, true)
  assert.equal(setup.source.label, 'Property24 import')
  assert.equal(getRequiredSellerDocuments(buildSellerRequirementProfile(listing)).length, 0)
})

test('Private Property imports use the same review boundary', () => {
  const setup = buildListingSellerSetupState({
    importSource: 'private_property_import',
    sellerType: 'individual',
  })

  assert.equal(setup.status, LISTING_SELLER_SETUP_STATUS.reviewRequired)
  assert.equal(setup.source.key, 'private_property_import')
  assert.match(setup.blockers.documents, /only after/i)
})

test('captured company ownership unlocks mandate and compliance generation', () => {
  const listing = {
    status: 'active',
    sellerOnboarding: {
      formData: {
        sellerProfileCaptureSource: 'listing_seller_profile_capture',
        sellerOwnershipConfirmed: true,
        ownerStructureType: 'company',
        companyName: 'Example Property Holdings',
      },
    },
  }

  const setup = buildListingSellerSetupState(listing)
  const documents = getRequiredSellerDocuments(buildSellerRequirementProfile(listing))
  assert.equal(setup.status, LISTING_SELLER_SETUP_STATUS.configured)
  assert.equal(setup.authority.profileType, 'company')
  assert.equal(setup.actions.canPrepareMandate, true)
  assert.ok(documents.length > 0)
  assert.ok(documents.some((document) => document.requirement_key === 'company_registration'))
})
