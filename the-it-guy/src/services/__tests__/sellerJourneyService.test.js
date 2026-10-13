import { buildSellerLeadOnboardingPresentation, mergeSellerJourneyOnboardingSnapshot } from '../sellerJourneyService.js'
import { hasSignedMandateEvidence } from '../../core/clientAccess/clientAccessPolicy.js'
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

const reviewedHardCopy = {
  document_type: 'signed_mandate', status: 'uploaded', storage_path: 'seller-mandates/reviewed.pdf',
  reviewed_signing_version_id: 'reviewed-version-1',
}
const reviewedHardCopyContext = {
  lead: { leadId: 'seller-lead-reviewed', leadCategory: 'seller', sellerOnboardingStatus: 'submitted', listingId: 'listing-reviewed' },
  listing: { id: 'listing-reviewed', sellerLeadId: 'seller-lead-reviewed', sellerOnboarding: { status: 'completed' }, listingStatus: 'onboarding_completed' },
}
const reviewedUploadJourney = buildSellerJourney({ ...reviewedHardCopyContext, documents: [reviewedHardCopy] })
assert.notEqual(reviewedUploadJourney.mandateStatus, 'signed')
assert.equal(reviewedUploadJourney.actions.find((action) => action.id === 'activate_listing').enabled, false)
const approvedHardCopyJourney = buildSellerJourney({ ...reviewedHardCopyContext, documents: [{ ...reviewedHardCopy, status: 'approved' }] })
assert.equal(approvedHardCopyJourney.mandateStatus, 'signed')

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
assert.equal(onboardingSentJourney.nextRecommendedAction?.id, 'copy_seller_onboarding_link')
assert.equal(onboardingSentJourney.nextRecommendedAction?.label, 'Copy Seller Onboarding Link')

const manualMandateSentJourney = buildSellerJourney({
  lead: {
    leadId: 'seller-lead-manual-mandate',
    leadCategory: 'seller',
    sellerOnboardingStatus: 'submitted',
    sourceContext: {
      mandateExecutionMode: 'manual',
      manualMandateSentAt: '2026-09-19T10:00:00.000Z',
    },
  },
})

assert.equal(manualMandateSentJourney.mandateStatus, 'sent')
assert.equal(manualMandateSentJourney.mandateExecutionMode, 'manual')
assert.equal(manualMandateSentJourney.stage.key, 'mandate_sent')

const digitallyDispatchedPackJourney = buildSellerJourney({
  lead: {
    leadId: 'seller-lead-dispatched-pack',
    leadCategory: 'seller',
    sellerOnboardingStatus: 'completed',
    listingId: 'listing-dispatched-pack',
  },
  listing: {
    id: 'listing-dispatched-pack',
    sellerLeadId: 'seller-lead-dispatched-pack',
    listingStatus: 'listing_review',
    sellerOnboarding: {
      status: 'completed',
      formData: {
        sellerOnboardingSigningLifecycle: { stage: 'pack_sent' },
        sellerOnboardingFormalPackDispatch: { delivery: 'sent', deliveredRecipientCount: 1 },
      },
    },
    mandateStatus: 'sent',
  },
})

assert.equal(digitallyDispatchedPackJourney.mandateStatus, 'sent')
assert.equal(digitallyDispatchedPackJourney.stage.key, 'mandate_sent')

console.log('sellerJourneyService tests passed')


// Agent-reported progress and a received existing mandate must not activate
// either the listing or seller portal before the persisted file is reviewed.
const pendingExistingMandate = {
  document_type: 'signed_mandate', status: 'uploaded', storage_path: 'seller-mandates/existing.pdf',
  seller_signing_evidence_source: 'existing_signed_upload',
}
const existingIntake = {
  lead: { leadId: 'new-seller', leadCategory: 'seller', stage: 'New Lead' },
  listing: { id: 'intake-1', listingStatus: 'seller_lead', sellerLeadId: 'new-seller', sellerOnboarding: { status: 'in_progress' } },
  documents: [pendingExistingMandate],
}
assert.notEqual(buildSellerJourney(existingIntake).mandateStatus, 'signed')
assert.equal(buildSellerJourney(existingIntake).actions.find(action => action.id === 'activate_listing').enabled, false)
assert.equal(hasSignedMandateEvidence({ documents: [pendingExistingMandate] }), false)
const approvedExistingMandate = { ...pendingExistingMandate, status: 'approved' }
assert.equal(buildSellerJourney({ ...existingIntake, documents: [approvedExistingMandate] }).mandateStatus, 'signed')
assert.equal(hasSignedMandateEvidence({ documents: [approvedExistingMandate] }), true)

{
const draftLead = { leadId: 'draft-lead', leadCategory: 'seller', stage: 'Seller Onboarding Sent', sellerOnboardingStatus: 'sent', listingId: 'draft-listing' }
const draftListing = { id: 'draft-listing', sellerLeadId: 'draft-lead', listingStatus: 'onboarding_sent',
  sellerOnboarding: { id: 'draft-onboarding', status: 'sent', updatedAt: '2026-10-13T06:00:00Z', formData: {} },
  documents: [{ id: 'saved-document', status: 'approved' }], askingPrice: 2000000 }
const savedDraft = { id: 'draft-onboarding', private_listing_id: 'draft-listing', status: 'in_progress', submitted_at: null,
  updated_at: '2026-10-13T07:00:00Z', form_data: { currentStep: 1, ownershipType: 'individual', ownerEntityType: 'natural_person',
    ownerStructureType: 'individual', ownershipRouteConfirmed: true } }
const refreshedDraft = mergeSellerJourneyOnboardingSnapshot(draftListing, savedDraft)
const draftJourney = buildSellerJourney({ lead: draftLead, listing: refreshedDraft })
assert.equal(draftJourney.onboardingInProgress, true)
assert.equal(draftJourney.onboardingSubmitted, false)
assert.equal(refreshedDraft.listingStatus, 'onboarding_sent')
assert.equal(refreshedDraft.askingPrice, 2000000)
assert.deepEqual(refreshedDraft.documents, draftListing.documents)
assert.equal(mergeSellerJourneyOnboardingSnapshot(refreshedDraft, savedDraft), refreshedDraft, 'unchanged polling snapshots must not keep rerendering')
assert.equal(mergeSellerJourneyOnboardingSnapshot(refreshedDraft, { ...savedDraft, private_listing_id: 'another-listing' }), refreshedDraft)
assert.equal(mergeSellerJourneyOnboardingSnapshot(refreshedDraft, { ...savedDraft, updated_at: '2026-10-13T05:00:00Z' }), refreshedDraft)
const draftPresentation = buildSellerLeadOnboardingPresentation({ listing: refreshedDraft, formData: savedDraft.form_data, journey: draftJourney })
assert.deepEqual(draftPresentation, { ownerType: 'Not confirmed', checklistProvisional: true, onboardingLabel: 'In progress' })
const submittedListing = mergeSellerJourneyOnboardingSnapshot(refreshedDraft, { ...savedDraft, status: 'submitted',
  submitted_at: '2026-10-13T08:00:00Z', updated_at: '2026-10-13T08:00:00Z' })
const submittedJourney = buildSellerJourney({ lead: draftLead, listing: submittedListing })
assert.equal(submittedJourney.onboardingSubmitted, true)
assert.equal(buildSellerLeadOnboardingPresentation({ listing: submittedListing, formData: savedDraft.form_data, journey: submittedJourney }).ownerType, 'Individual')
for (const [route, expected] of [['multiple_owners', 'Multiple Owners'], ['married_cop', 'Married']]) {
  const presentation = buildSellerLeadOnboardingPresentation({ listing: draftListing, journey: draftJourney,
    formData: { ownerEntityType: 'natural_person', ownerStructureType: route, ownershipRouteConfirmed: true,
      sellerProfileCaptureSource: 'listing_seller_profile_capture', ownershipType: route } })
  assert.equal(presentation.ownerType, expected, 'natural-person entity must not hide the selected ownership structure')
  assert.equal(presentation.checklistProvisional, false, 'confirmed agent capture still supports early document preparation')
}

}
