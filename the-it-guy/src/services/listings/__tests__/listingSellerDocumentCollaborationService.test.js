import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildListingSellerDocumentDeliveryIndex,
  normalizeListingSellerDocumentDelivery,
} from '../listingSellerDocumentCollaborationService.js'
import { buildSellerDocumentRequestPlan } from '../../sellerDocumentRequestOrchestrationService.js'

test('normalizes seller document delivery failures with retry evidence', () => {
  const delivery = normalizeListingSellerDocumentDelivery({
    id: 'event-1',
    listing_id: 'listing-1',
    automation_key: 'seller_document_request_reminder',
    status: 'failed',
    channel: 'email',
    recipient_email: 'seller@example.com',
    last_dispatch_error: 'Mailbox unavailable',
    dispatch_attempt_count: 2,
    payload_json: { requirementId: 'requirement-1', requirementKey: 'proof_of_address' },
    failed_at: '2026-09-24T10:00:00.000Z',
  })
  assert.equal(delivery.requirementId, 'requirement-1')
  assert.equal(delivery.requirementKey, 'proof_of_address')
  assert.equal(delivery.retryable, true)
  assert.equal(delivery.error, 'Mailbox unavailable')
  assert.equal(delivery.attempts, 2)
})

test('indexes the latest delivery by requirement id and canonical key', () => {
  const index = buildListingSellerDocumentDeliveryIndex([
    { id: 'older', status: 'sent', payload_json: { requirementId: 'r1', requirementKey: 'identity_document' }, sent_at: '2026-09-20T10:00:00Z' },
    { id: 'newer', status: 'failed', payload_json: { requirementId: 'r1', requirementKey: 'identity_document' }, failed_at: '2026-09-22T10:00:00Z' },
  ])
  assert.equal(index.forDocument({ requirementId: 'r1' }).id, 'newer')
  assert.equal(index.forDocument({ key: 'identity document' }).id, 'newer')
  assert.equal(index.failed.length, 1)
})

test('routes grouped requests to each requirement participant and preserves the primary seller fallback', () => {
  const plan = buildSellerDocumentRequestPlan({
    listing: { id: 'listing-1', sellerContactEmail: 'primary@example.com' },
    requirements: [
      {
        id: 'requirement-1',
        requirement_key: 'director_identity',
        requirement_name: 'Director identity',
        is_required: true,
        status: 'required',
        portalRequest: { recipientEmail: 'director@example.com', recipientName: 'Director One', participantId: 'participant-1' },
      },
      {
        id: 'requirement-2',
        requirement_key: 'proof_of_address',
        requirement_name: 'Proof of address',
        is_required: true,
        status: 'required',
      },
    ],
  })

  assert.equal(plan.issued.length, 2)
  assert.deepEqual(
    plan.issued.map((request) => ({ key: request.requirementKey, email: request.sellerEmail, participantId: request.participantId })),
    [
      { key: 'director_identity', email: 'director@example.com', participantId: 'participant-1' },
      { key: 'proof_of_address', email: 'primary@example.com', participantId: null },
    ],
  )
  assert.notEqual(plan.issued[0].requestDedupeKey, plan.issued[1].requestDedupeKey)
})
