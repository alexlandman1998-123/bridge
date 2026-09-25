import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildListingSellerDocumentsSummary,
  resolveListingSellerDocumentActivity,
  resolveListingSellerDocumentActions,
  resolveListingSellerDocumentStatus,
} from '../listingSellerDocumentsPresentation.js'

test('normalizes document workflow states to the five listing statuses', () => {
  assert.equal(resolveListingSellerDocumentStatus({ status: 'completed' }).label, 'Complete')
  assert.equal(resolveListingSellerDocumentStatus({ status: 'requested' }).label, 'Awaiting seller')
  assert.equal(resolveListingSellerDocumentStatus({ status: 'under_review' }).label, 'Ready for review')
  assert.equal(resolveListingSellerDocumentStatus({ status: 'under_review', lifecycleStatus: 'under_review' }).label, 'Ready for review')
  assert.equal(resolveListingSellerDocumentStatus({ status: 'required' }).label, 'Not requested')
  assert.equal(resolveListingSellerDocumentStatus({ status: 'rejected' }).label, 'Action required')
})

test('identifies the next actor and latest meaningful event', () => {
  assert.deepEqual(resolveListingSellerDocumentActivity({ status: 'required' }), {
    nextActorLabel: 'Agent',
    lastEventLabel: 'Not requested yet',
    lastEventAt: '',
  })

  const awaiting = resolveListingSellerDocumentActivity({
    status: 'requested',
    requestedAt: '2026-09-20T10:00:00.000Z',
    lastReminderAt: '2026-09-22T08:30:00.000Z',
  })
  assert.equal(awaiting.nextActorLabel, 'Seller')
  assert.equal(awaiting.lastEventLabel, 'Reminder sent')
  assert.equal(awaiting.lastEventAt, '2026-09-22T08:30:00.000Z')

  const uploaded = resolveListingSellerDocumentActivity({
    status: 'uploaded',
    uploadedAt: '2026-09-23T11:00:00.000Z',
  })
  assert.equal(uploaded.nextActorLabel, 'Agent / compliance')
  assert.equal(uploaded.lastEventLabel, 'Uploaded')

  const complete = resolveListingSellerDocumentActivity({
    status: 'approved',
    reviewedAt: '2026-09-24T09:15:00.000Z',
  })
  assert.equal(complete.nextActorLabel, 'No action needed')
  assert.equal(complete.lastEventLabel, 'Approved')
})

test('derives summary metrics from live document rows', () => {
  const summary = buildListingSellerDocumentsSummary([
    { status: 'completed' },
    { status: 'approved' },
    { status: 'requested' },
    { status: 'uploaded' },
    { status: 'required' },
  ])
  assert.deepEqual(summary, {
    total: 5,
    complete: 2,
    awaitingSeller: 1,
    readyForReview: 1,
    notRequested: 1,
    actionRequired: 0,
    progressPercent: 40,
  })
})

test('shows request before reminder and reserves review actions for supplied files', () => {
  const notRequested = resolveListingSellerDocumentActions({ id: 'requirement-1', status: 'required' })
  assert.equal(notRequested.canRequest, true)
  assert.equal(notRequested.canRemind, false)

  const awaiting = resolveListingSellerDocumentActions({ id: 'requirement-1', status: 'requested' })
  assert.equal(awaiting.canRequest, false)
  assert.equal(awaiting.canRemind, true)

  const review = resolveListingSellerDocumentActions({
    id: 'requirement-1',
    status: 'uploaded',
    linkedDocument: { id: 'document-1' },
  })
  assert.equal(review.canReview, true)
  assert.equal(review.canRemind, false)
})
