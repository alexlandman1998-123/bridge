import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerPortalSaleJourneyGate } from '../sellerPortalSaleJourneyGate.js'

test('keeps listing-stage sellers out of legal sale milestones even when offers exist', () => {
  const gate = buildSellerPortalSaleJourneyGate({
    workflow: 'listing',
    offers: [{ id: 'offer-1', status: 'under_review' }],
  })

  assert.equal(gate.isTransaction, false)
  assert.equal(gate.primaryAction.key, 'offers')
  assert.match(gate.title, /after an accepted offer/i)
})

test('opens the legal sale journey after an accepted offer has created the transaction lane', () => {
  const gate = buildSellerPortalSaleJourneyGate({
    workflow: 'transaction',
    offers: [{ id: 'offer-1', status: 'accepted' }],
  })

  assert.equal(gate.isTransaction, true)
  assert.equal(gate.acceptedOffer.id, 'offer-1')
  assert.equal(gate.primaryAction.key, 'documents')
})
