import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDealSetupReadiness } from '../dealSetupReadiness.js'

test('deal setup readiness combines setup and document blockers', () => {
  const result = buildDealSetupReadiness({ setup: { transactionId: 't', buyers: [{}], primaryBuyerId: 'b', terms: { purchaserType: 'individual' }, finance: { type: 'cash' } }, requirements: [{ label: 'Proof of funds', owner: 'Buyer', satisfiedByProfile: false }] })
  assert.equal(result.ready, false)
  assert.equal(result.blockerCount, 1)
})
