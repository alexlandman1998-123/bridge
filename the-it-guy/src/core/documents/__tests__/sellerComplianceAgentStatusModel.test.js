import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSellerComplianceAgentStatus } from '../sellerComplianceAgentStatusModel.js'

test('blocks listing live when a listing is active but the signed mandate is missing', () => {
  const model = buildSellerComplianceAgentStatus({
    sellerComplianceSigning: {
      complete: true,
      signingState: {
        complete: true,
        requiredCount: 1,
        completedCount: 1,
        remainingCount: 0,
      },
    },
    listing: {
      id: 'listing-1',
      status: 'active',
      sellerOnboardingStatus: 'submitted',
    },
    activeSellingContext: {
      listingStatus: 'active',
    },
  })

  assert.equal(model.rawListingLiveSignal, true)
  assert.equal(model.signedMandate, false)
  assert.equal(model.canTreatListingAsCreated, false)
  assert.equal(model.canTreatListingAsLive, false)
  assert.equal(model.status, 'seller_onboarding_submitted')
  assert.equal(model.nextBlocker.key, 'signed_mandate')
})

test('does not treat a pending signed mandate requirement row as uploaded evidence', () => {
  const model = buildSellerComplianceAgentStatus({
    sellerComplianceSigning: {
      complete: true,
      signingState: {
        complete: true,
        requiredCount: 1,
        completedCount: 1,
        remainingCount: 0,
      },
    },
    requirements: [
      {
        id: 'requirement-signed-mandate',
        requirement_key: 'signed_mandate',
        status: 'outstanding',
      },
    ],
    documents: [
      {
        id: 'requirement-signed-mandate',
        requirement_key: 'signed_mandate',
        status: 'outstanding',
      },
    ],
    listing: {
      id: 'listing-1',
      status: 'active',
      sellerOnboardingStatus: 'submitted',
    },
  })

  assert.equal(model.rawListingLiveSignal, true)
  assert.equal(model.signedMandate, false)
  assert.equal(model.canTreatListingAsLive, false)
  assert.equal(model.status, 'seller_onboarding_submitted')
})

test('treats signed_uploaded as hard-copy signed mandate evidence', () => {
  const model = buildSellerComplianceAgentStatus({
    sellerComplianceSigning: {
      complete: true,
      signingState: {
        complete: true,
        requiredCount: 1,
        completedCount: 1,
        remainingCount: 0,
      },
    },
    listing: {
      id: 'listing-2',
      status: 'active',
      mandateStatus: 'signed_uploaded',
      sellerOnboardingStatus: 'submitted',
    },
  })

  assert.equal(model.signedMandate, true)
  assert.equal(model.canTreatListingAsCreated, true)
  assert.equal(model.canTreatListingAsLive, true)
  assert.equal(model.canPublishListing, true)
  assert.equal(model.status, 'listing_live')
})

test('allows draft creation after onboarding but blocks publication until mandate and compliance are complete', () => {
  const model = buildSellerComplianceAgentStatus({
    sellerComplianceSigning: {
      complete: false,
      signingState: {
        complete: false,
        requiredCount: 2,
        completedCount: 1,
        remainingCount: 1,
        waitingOn: [{ id: 'spouse', name: 'Jane Smith' }],
      },
    },
    listing: {
      id: 'listing-3',
      sellerOnboardingStatus: 'submitted',
    },
    documents: [
      {
        id: 'doc-1',
        document_type: 'signed_mandate',
        file_path: '/documents/signed-mandate.pdf',
      },
    ],
  })

  assert.equal(model.canCreateListingDraft, true)
  assert.equal(model.signedMandate, true)
  assert.equal(model.canTreatListingAsCreated, true)
  assert.equal(model.complianceComplete, false)
  assert.equal(model.canPublishListing, false)
  assert.equal(model.nextBlocker.key, 'seller_compliance_pack')
})
