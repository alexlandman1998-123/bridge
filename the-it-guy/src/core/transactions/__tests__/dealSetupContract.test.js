import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDealSetup, buildDealSetupCommercialPayload, validateDealSetup } from '../dealSetupContract.js'

test('deal setup combines typed transaction fields and buyer parties', () => {
  const setup = buildDealSetup({ transaction: { id: 'tx', buyer_id: 'buyer-1', purchaser_type: 'individual', finance_type: 'cash', purchase_price: 100 }, buyerParties: [{ buyer_party_id: 'buyer-1', is_primary_buyer: true }] })
  assert.equal(setup.primaryBuyerId, 'buyer-1')
  assert.equal(setup.terms.purchasePrice, 100)
  assert.equal(validateDealSetup(setup).valid, true)
})

test('deal setup saves zero values and only funding fields for the selected route', () => {
  const cash = buildDealSetupCommercialPayload({
    terms: { purchaserType: 'individual', purchasePrice: '1200000', depositAmount: '0' },
    finance: { type: 'cash', cashAmount: '1200000', bondAmount: '900000', managedBy: 'bond_originator', bank: 'Old bank' },
  })
  assert.equal(cash.deposit_amount, 0)
  assert.equal(cash.purchase_price, 1200000)
  assert.equal(cash.cash_amount, 1200000)
  assert.equal(cash.bond_amount, null)
  assert.equal(cash.finance_managed_by, null)
  assert.equal(cash.bank, null)

  const bond = buildDealSetupCommercialPayload({
    terms: { purchaserType: 'trust', purchasePrice: '1200000', depositAmount: '' },
    finance: { type: 'bond', cashAmount: '500000', bondAmount: '0', managedBy: 'client', bank: 'Example Bank' },
  })
  assert.equal(bond.deposit_amount, null)
  assert.equal(bond.cash_amount, null)
  assert.equal(bond.bond_amount, 0)
  assert.equal(bond.finance_managed_by, 'client')
  assert.equal(bond.bank, 'Example Bank')
})
