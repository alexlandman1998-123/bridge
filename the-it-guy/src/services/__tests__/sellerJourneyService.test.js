import assert from 'node:assert/strict'

import { buildSellerJourney, __sellerJourneyServiceTestUtils } from '../sellerJourneyService.js'

const { getMandateStatus } = __sellerJourneyServiceTestUtils

const signedAgentAndSeller = [
  { signer_role: 'agent', status: 'signed' },
  { signer_role: 'seller', status: 'signed' },
  { signer_role: 'purchaser_2', status: 'pending' },
]

const ancMandateStatus = getMandateStatus({
  lead: {
    sellerOnboardingStatus: 'completed',
    mandatePacketId: 'packet-anc',
  },
  mandatePacketStatus: {
    packet: {
      id: 'packet-anc',
      packet_type: 'mandate',
      source_context_json: {
        onboardingFormData: {
          ownershipType: 'married_anc',
          spouseName: 'Jordan Seller',
          spouseEmail: 'jordan@example.com',
        },
      },
    },
    state: 'partially_signed',
    signingSummary: {
      signers: signedAgentAndSeller,
      fields: [],
    },
  },
})

assert.equal(ancMandateStatus, 'signed')

const copMandateStatus = getMandateStatus({
  lead: {
    sellerOnboardingStatus: 'completed',
    mandatePacketId: 'packet-cop',
  },
  mandatePacketStatus: {
    packet: {
      id: 'packet-cop',
      packet_type: 'mandate',
      source_context_json: {
        onboardingFormData: {
          ownershipType: 'married_cop',
          spouseName: 'Jordan Seller',
          spouseEmail: 'jordan@example.com',
        },
      },
    },
    state: 'partially_signed',
    signingSummary: {
      signers: signedAgentAndSeller,
      fields: [],
    },
  },
})

assert.equal(copMandateStatus, 'sent')

const staleLiveListingJourney = buildSellerJourney({
  lead: {
    leadId: 'seller-lead-stale-live',
    leadCategory: 'seller',
    sellerOnboardingStatus: 'sent',
    mandatePacketId: 'packet-stale-live',
    listingId: 'listing-stale-live',
    stage: 'Listing Live',
    status: 'Live',
  },
  listing: {
    id: 'listing-stale-live',
    sellerLeadId: 'seller-lead-stale-live',
    status: 'active',
    listingStatus: 'active',
    listingVisibility: 'active_market',
  },
  mandatePacketStatus: {
    packet: { id: 'packet-stale-live', packet_type: 'mandate' },
    state: 'ready_for_client_signature',
  },
})

assert.equal(staleLiveListingJourney.mandateStatus, 'draft')
assert.equal(staleLiveListingJourney.listingCreated, false)
assert.equal(staleLiveListingJourney.listingLive, false)
assert.notEqual(staleLiveListingJourney.stage.key, 'listing_live')

const hardCopySignedJourney = buildSellerJourney({
  lead: {
    leadId: 'seller-lead-hard-copy',
    leadCategory: 'seller',
    sellerOnboardingStatus: 'submitted',
    listingId: 'listing-hard-copy',
  },
  listing: {
    id: 'listing-hard-copy',
    sellerLeadId: 'seller-lead-hard-copy',
    status: 'active',
    listingStatus: 'active',
    listingVisibility: 'active_market',
  },
  documents: [
    {
      requirementKey: 'signed_mandate',
      status: 'uploaded',
      file_path: 'seller-mandates/listing-hard-copy.pdf',
    },
  ],
})

assert.equal(hardCopySignedJourney.mandateStatus, 'signed')
assert.equal(hardCopySignedJourney.listingCreated, true)
assert.equal(hardCopySignedJourney.listingLive, true)

const onboardingSentJourney = buildSellerJourney({
  lead: {
    leadId: 'seller-lead-onboarding-sent',
    leadCategory: 'seller',
    stage: 'Seller Onboarding Sent',
    sellerOnboardingStatus: 'sent',
    sellerOnboardingToken: 'seller-token',
  },
})

assert.equal(onboardingSentJourney.stage.key, 'seller_onboarding_sent')
assert.equal(onboardingSentJourney.nextRecommendedAction?.id, 'track_seller_onboarding')
assert.equal(onboardingSentJourney.nextRecommendedAction?.label, 'Track Seller Onboarding')

console.log('sellerJourneyService tests passed')
