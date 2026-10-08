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
import { buildSellerDocumentSourceOfTruth } from '../../sellerDocumentRequirementsService.js'

const listingId = '11111111-1111-4111-8111-111111111111'
const persistedRequirementId = '22222222-2222-4222-8222-222222222222'

test('FICA requests from the document centre preserve participant routing, metadata and revisions', async () => {
  const sourceRequirement = {
    id: persistedRequirementId, requirement_key: 'proof_of_address', requirement_name: 'Proof of address',
    requirement_group: 'fica', is_required: true, document_visibility: 'seller_visible', status: 'rejected',
    request_revision: 4, last_request_reason: 'rejected_document_reupload_required',
    request_metadata: { retained_review_reference: 'review-4', portalRequest: {
      recipientEmail: 'coowner@example.com', recipientName: 'Co-owner', participantId: 'co-owner', requestedFromRole: 'seller',
    } },
  }
  const source = buildSellerDocumentSourceOfTruth({ listing: {
    id: listingId, sellerContactEmail: 'primary@example.com', documentRequirements: [sourceRequirement],
  } })
  const displayRow = source.rows.find(row => row.requirementId === persistedRequirementId)
  assert.ok(displayRow, 'Use the actual projected document-centre row')
  let updatePayload
  const query = {
    update(value) { updatePayload = value; return this }, eq() { return this }, in() { return this }, select() { return this },
    async maybeSingle() { return { data: { id: persistedRequirementId, status: 'rejected' } } },
  }
  const result = await issueSelectedSellerDocumentRequests({
    client: { from: () => query }, listing: { id: listingId, sellerContactEmail: 'primary@example.com' }, requirements: [displayRow],
  })
  assert.equal(result.applied.length, 1)
  assert.equal(updatePayload.request_revision, 4, 'Reissuing from a display row must not reset the persisted revision')
  assert.equal(updatePayload.request_metadata.seller_email, 'coowner@example.com')
  assert.equal(updatePayload.request_metadata.participant_id, 'co-owner')
  assert.equal(updatePayload.request_metadata.retained_review_reference, 'review-4')
})

test('requested FICA rows retain their dedupe identity when reopened in the document centre', () => {
  const requirement = {
    id: persistedRequirementId, requirement_key: 'proof_of_address', requirement_name: 'Proof of address',
    requirement_group: 'fica', is_required: true, document_visibility: 'seller_visible', status: 'requested',
    request_revision: 3, request_dedupe_key: `seller-document-request:${listingId}:proof_of_address:v3`,
  }
  const source = buildSellerDocumentSourceOfTruth({ listing: { id: listingId, documentRequirements: [requirement] } })
  const displayRow = source.rows.find(row => row.requirementId === persistedRequirementId)
  const plan = buildSellerDocumentRequestPlan({ listing: { id: listingId }, requirements: [displayRow] })
  assert.equal(plan.issued.length, 0)
  assert.equal(plan.existing.length, 1)
  assert.equal(plan.existing[0].requestRevision, 3)
})

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
