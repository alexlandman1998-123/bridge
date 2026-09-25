import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSellerChangeReviewCanonicalPayload,
  buildSellerParticipantInvitationUrl,
  classifySellerChangeSensitivity,
  normalizeSellerCollaborationWorkspace,
} from '../listingSellerCollaborationModel.js'

test('classifies protected seller fields before submission', () => {
  assert.equal(classifySellerChangeSensitivity(['idNumber']), 'legal_identity')
  assert.equal(classifySellerChangeSensitivity(['ownershipPercentage']), 'ownership')
  assert.equal(classifySellerChangeSensitivity(['trusteeAuthority']), 'authority')
  assert.equal(classifySellerChangeSensitivity(['bankAccount']), 'financial')
  assert.equal(classifySellerChangeSensitivity(['ficaStatus']), 'compliance')
  assert.equal(classifySellerChangeSensitivity(['preferredContactMethod']), 'general')
})

test('normalizes failures, pending review and conflicts for the agent workspace', () => {
  const result = normalizeSellerCollaborationWorkspace({
    participants: [{ id: 'p1', display_name: 'Owner One', participant_role: 'primary_owner', invitation_delivery_status: 'failed' }],
    changeRequests: [{ id: 'c1', status: 'pending', proposed_patch: { idNumber: 'x' } }, { id: 'c2', status: 'conflict' }],
    notifications: [{ id: 'n1', status: 'failed' }],
  })
  assert.equal(result.participants[0].displayName, 'Owner One')
  assert.equal(result.pendingCount, 1)
  assert.equal(result.conflictCount, 1)
  assert.equal(result.failedDeliveryCount, 2)
})

test('builds a reviewed canonical snapshot instead of writing a raw seller patch', () => {
  const payload = buildSellerChangeReviewCanonicalPayload({
    listing: {
      id: 'listing-1',
      updatedAt: '2026-09-24T10:00:00.000Z',
      sellerOnboardingStatus: 'in_progress',
      sellerOnboarding: { formData: { sellerFirstName: 'Old', sellerSurname: 'Owner', sellerLegalType: 'individual' } },
    },
    request: { proposedPatch: { sellerFirstName: 'New' } },
  })
  assert.equal(payload.formData.sellerFirstName, 'New')
  assert.equal(payload.formData.sellerSurname, 'Owner')
  assert.equal(payload.listingPatch.sellerName, 'New Owner')
  assert.equal(payload.canonicalFacts.context.canonical_update.source, 'seller_collaboration_review')
})

test('builds a participant-specific invitation path', () => {
  assert.equal(
    buildSellerParticipantInvitationUrl('https://app.arch9.co.za/', 'secret token'),
    'https://app.arch9.co.za/seller/collaboration/invite/secret%20token',
  )
})
