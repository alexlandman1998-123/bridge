import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildListingSellerDocumentDeliveryIndex,
  normalizeListingSellerDocumentDelivery,
} from '../listingSellerDocumentCollaborationService.js'
import {
  buildSellerDocumentRequestPlan,
  issueSelectedSellerDocumentRequests,
  issueSellerDocumentRequests,
} from '../../sellerDocumentRequestOrchestrationService.js'

const listingId = '11111111-1111-4111-8111-111111111111'
const persistedRequirementId = '22222222-2222-4222-8222-222222222222'

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

test('saves a generated checklist item before requesting it with a persisted UUID', async () => {
  let savedInput = null
  let updatedId = null
  const query = {
    update() { return this },
    eq(column, value) { if (column === 'id') updatedId = value; return this },
    in() { return this },
    select() { return this },
    async maybeSingle() { return { data: { id: updatedId, status: 'requested' }, error: null } },
  }
  const result = await issueSelectedSellerDocumentRequests({
    client: { from: () => query },
    listing: { id: listingId },
    requirements: [{
      id: 'seller-requirement-9',
      key: 'authorised_signatory_id',
      title: 'Authorised Signatory ID',
      status: 'required',
      original: { requirement: { requirement_group: 'fica', portalRequest: { requestedFromRole: 'seller' } } },
    }],
    ensureRequirements: async (id, rows) => {
      assert.equal(id, listingId)
      savedInput = rows[0]
      return [{ id: persistedRequirementId, requirement_key: 'authorised_signatory_id', status: 'required' }]
    },
  })
  assert.equal(savedInput.requirementKey, 'authorised_signatory_id')
  assert.equal(savedInput.requirement_group, 'fica')
  assert.equal(updatedId, persistedRequirementId)
  assert.equal(result.applied.length, 1)
})

test('never sends a generated display ID into a UUID database filter', async () => {
  let queried = false
  const result = await issueSellerDocumentRequests({
    client: { from: () => { queried = true; throw new Error('Should not query') } },
    listing: { id: listingId },
    requirements: [{ id: 'seller-requirement-9', key: 'signatory_id', status: 'required' }],
  })
  assert.equal(queried, false)
  assert.equal(result.failed.length, 1)
  assert.match(result.failed[0].error.message, /not saved yet/i)
})

test('stops a grouped request when a generated requirement cannot be saved', async () => {
  let queried = false
  await assert.rejects(
    issueSelectedSellerDocumentRequests({
      client: { from: () => { queried = true; throw new Error('Should not query') } },
      listing: { id: listingId },
      requirements: [{ id: 'seller-requirement-9', key: 'signatory_id', title: 'Signatory ID', status: 'required' }],
      ensureRequirements: async () => [],
    }),
    /Could not save the Signatory ID requirement/,
  )
  assert.equal(queried, false)
})
