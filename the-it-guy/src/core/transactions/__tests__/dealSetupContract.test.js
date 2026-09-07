import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDealSetup, validateDealSetup } from '../dealSetupContract.js'

test('deal setup combines typed transaction fields and buyer parties', () => {
  const setup = buildDealSetup({ transaction: { id: 'tx', buyer_id: 'buyer-1', purchaser_type: 'individual', finance_type: 'cash', purchase_price: 100 }, buyerParties: [{ buyer_party_id: 'buyer-1', is_primary_buyer: true }] })
  assert.equal(setup.primaryBuyerId, 'buyer-1')
  assert.equal(setup.terms.purchasePrice, 100)
  assert.equal(validateDealSetup(setup).valid, true)
})
