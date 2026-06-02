import assert from 'node:assert/strict'

import { getSellerPortalStageMeta } from '../sellerPortalStageMapper.js'

const onboardingSubmitted = getSellerPortalStageMeta({
  sellerOnboardingStatus: 'completed',
  listingId: 'private-listing-1',
  hasListing: true,
  context: {
    status: 'active',
    listingId: 'private-listing-1',
    listingStatus: 'onboarding_completed',
  },
})

assert.equal(onboardingSubmitted.currentStageKey, 'mandate_signed')
assert.equal(onboardingSubmitted.currentStage.label, 'Sign Mandate')
assert.equal(onboardingSubmitted.progressPercent, 0)

const ambiguousMandateStageOnly = getSellerPortalStageMeta({
  sellerOnboardingStatus: 'completed',
  listingId: 'private-listing-1',
  hasListing: true,
  context: {
    status: 'mandate_signed',
    listingId: 'private-listing-1',
    listingStatus: 'mandate_signed',
  },
})

assert.equal(ambiguousMandateStageOnly.currentStageKey, 'mandate_signed')

const mandateSigned = getSellerPortalStageMeta({
  sellerOnboardingStatus: 'completed',
  listingId: 'private-listing-1',
  hasListing: true,
  mandatePacketState: 'fully_signed',
  context: {
    status: 'active',
    listingId: 'private-listing-1',
    mandateStatus: 'signed',
    listingStatus: 'mandate_signed',
  },
})

assert.equal(mandateSigned.currentStageKey, 'listed')
assert.equal(mandateSigned.currentStage.label, 'Listed')
assert.equal(mandateSigned.progressPercent, 20)

const mandateSignedFromFinalArtifact = getSellerPortalStageMeta({
  sellerOnboardingStatus: 'completed',
  listingId: 'private-listing-1',
  hasListing: true,
  context: {
    status: 'mandate_signed',
    listingId: 'private-listing-1',
    mandatePacket: {
      state: 'completed',
      finalSignedFilePath: 'mandates/final-signed.pdf',
    },
  },
})

assert.equal(mandateSignedFromFinalArtifact.currentStageKey, 'listed')

const activeMarketListing = getSellerPortalStageMeta({
  sellerOnboardingStatus: 'completed',
  listingId: 'private-listing-1',
  hasListing: true,
  context: {
    status: 'active',
    listingId: 'private-listing-1',
    listingStatus: 'active',
  },
})

assert.equal(activeMarketListing.currentStageKey, 'listed')

console.log('sellerPortalStageMapper tests passed')
