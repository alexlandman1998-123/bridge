import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSellerPortalWorkflowProjection } from '../sellerPortalWorkflowProjection.js'

test('keeps a live listing in the pre-sale journey while offers are still under review', () => {
  const projection = resolveSellerPortalWorkflowProjection({
    listing: { listingStatus: 'active' },
    offers: [{ status: 'submitted' }, { status: 'under_review' }],
    transaction: { id: 'transaction-shell', stage: 'Listed', current_main_stage: 'OTP' },
  })

  assert.equal(projection.workflow, 'listing')
  assert.equal(projection.reason, 'awaiting_accepted_offer')
})

test('starts the legal-sale journey when an offer is accepted', () => {
  const projection = resolveSellerPortalWorkflowProjection({
    listing: { listingStatus: 'active' },
    offers: [{ id: 'offer-1', status: 'accepted' }],
  })

  assert.equal(projection.workflow, 'transaction')
  assert.equal(projection.reason, 'accepted_offer')
})

test('recognises a confirmed transaction that has moved into legal transfer work', () => {
  const projection = resolveSellerPortalWorkflowProjection({
    listing: { listingStatus: 'under_offer' },
    transaction: { id: 'transaction-1', stage: 'Transfer', current_main_stage: 'XFER' },
  })

  assert.equal(projection.workflow, 'transaction')
  assert.equal(projection.reason, 'listing_confirmed_offer')
})
